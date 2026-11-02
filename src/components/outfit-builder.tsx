"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { BottomSheet } from "@/components/bottom-sheet";
import { LockIcon } from "@/components/icons";
import { LaundryPrompt, type WornPiece } from "@/components/laundry-prompt";
import { SaveOutfitSheet } from "@/components/save-outfit-sheet";
import type { CategoryRole } from "@/lib/categories";
import { accentLabels, colorInfo, matchesColors } from "@/lib/colors";
import {
  activeSlots,
  candidatesFor,
  fitsSlot,
  inGroups,
  localDate,
  OUTFIT_ROLES,
  pickRandom,
  SLOT_LABELS,
  type OutfitCandidate,
  type OutfitOptions,
  type Slot,
} from "@/lib/outfit";
import { saveOutfit } from "@/lib/outfits";
import { usePhotoUrls } from "@/lib/photo-urls";
import { SAVED_OUTFIT_SELECT, type SavedOutfit } from "@/lib/saved-outfits";
import { getSupabase } from "@/lib/supabase/client";
import type { Grouping } from "@/lib/types";

type ItemRow = {
  id: string;
  front_path: string;
  color: string | null;
  in_laundry_since: string | null;
  category: { role: CategoryRole; underlayer: boolean } | null;
  item_groupings: { grouping_id: string }[];
};

/** Scelta "Abbina i colori" ricordata su questo telefono (attiva se non c'è). */
const MATCH_COLORS_KEY = "cleanfit:abbina-colori";

/** Tentativi del generatore per trovare un outfit con i colori abbinati prima di arrendersi. */
const COLOR_ATTEMPTS = 30;

const shuffle = <T,>(list: T[]) =>
  list
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);

type Loaded = {
  items: OutfitCandidate[];
  groupings: Grouping[];
  /** Capi indossati negli ultimi N giorni (oggi compreso). */
  recent: Set<string>;
  recentDays: number;
};

/** Modifica di un outfit salvato: il compositore parte dai suoi capi, già bloccati. */
export function SavedOutfitEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OutfitBuilder editId={id} />;
}

export function OutfitBuilderSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-3xl bg-surface-muted" />
      ))}
    </div>
  );
}

/** Senza `editId`: proposte del giorno. Con `editId`: modifica dell'outfit salvato con quell'id. */
export function OutfitBuilder({ editId }: { editId?: string }) {
  const userId = useUser()?.id;
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [options, setOptions] = useState<OutfitOptions>({
    groupIds: [],
    capospalla: false,
    strato: false,
    matchColors: true,
  });
  const [includeRecent, setIncludeRecent] = useState(false);
  const [outfit, setOutfit] = useState<Partial<Record<Slot, string>>>({});
  // Posti bloccati: "Genera" non li cambia (anche quelli scelti a mano)
  const [locked, setLocked] = useState(new Set<Slot>());
  const [generated, setGenerated] = useState(false);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [wearing, setWearing] = useState<"salvataggio" | "errore" | null>(null);
  // Outfit appena salvato nello Storico: lo stesso non si salva due volte per sbaglio
  const [savedKey, setSavedKey] = useState<string | null>(null);
  // Dopo "Lo indosso oggi": i capi dell'outfit, per chiedere quali vanno nel cesto
  const [worn, setWorn] = useState<WornPiece[] | null>(null);
  // Outfit salvato che si sta modificando (nome e occasioni da proporre nel pannello), oppure "assente"
  const [editing, setEditing] = useState<{ name: string; occasionIds: string[] } | "assente" | null>(null);
  const [saving, setSaving] = useState(false);
  // Outfit appena salvato tra i Salvati
  const [keptKey, setKeptKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage è leggibile solo nel browser
      if (localStorage.getItem(MATCH_COLORS_KEY) === "no") setOptions((prev) => ({ ...prev, matchColors: false }));
    } catch {}
  }, []);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    Promise.all([
      supabase.from("profiles").select("recent_days").eq("id", userId).single(),
      supabase
        .from("items")
        .select(
          "id, front_path, color, in_laundry_since, category:categories(role, underlayer), item_groupings(grouping_id)",
        ),
      supabase.from("groupings").select("id, name, position").order("position").order("name"),
      // Il massimo impostabile è 90 giorni: il filtro sul numero scelto si fa qui sotto
      supabase.from("outfit_items").select("item_id, outfits!inner(worn_on)").gte("outfits.worn_on", localDate(-89)),
      editId ? supabase.from("saved_outfits").select(SAVED_OUTFIT_SELECT).eq("id", editId).maybeSingle() : null,
    ]).then(([profileResult, itemsResult, groupingsResult, wornResult, savedResult]) => {
      if (profileResult.error || itemsResult.error || groupingsResult.error || wornResult.error || savedResult?.error) {
        return setError(true);
      }
      if (savedResult) prefill(savedResult.data as unknown as SavedOutfit | null);
      const recentDays = profileResult.data.recent_days as number;
      const since = localDate(-(recentDays - 1));
      const worn = wornResult.data as unknown as { item_id: string; outfits: { worn_on: string } }[];
      setData({
        items: (itemsResult.data as unknown as ItemRow[]).flatMap((item) =>
          item.category && OUTFIT_ROLES.includes(item.category.role)
            ? [
                {
                  id: item.id,
                  front_path: item.front_path,
                  role: item.category.role,
                  underlayer: item.category.underlayer,
                  groupingIds: item.item_groupings.map((link) => link.grouping_id),
                  inLaundry: !!item.in_laundry_since,
                  color: colorInfo(item.color),
                },
              ]
            : [],
        ),
        groupings: groupingsResult.data as Grouping[],
        recent: new Set(recentDays > 0 ? worn.filter((row) => row.outfits.worn_on >= since).map((row) => row.item_id) : []),
        recentDays,
      });
    });

    function prefill(saved: SavedOutfit | null) {
      if (!saved) return setEditing("assente");
      const pieces = saved.saved_outfit_items.flatMap((piece) => (piece.item ? [{ slot: piece.slot, id: piece.item.id }] : []));
      const has = (slot: Slot) => pieces.some((piece) => piece.slot === slot);
      setOutfit(Object.fromEntries(pieces.map((piece) => [piece.slot, piece.id])));
      setLocked(new Set(pieces.map((piece) => piece.slot)));
      setOptions((prev) => ({ ...prev, capospalla: has("capospalla"), strato: has("strato") }));
      setGenerated(true);
      setEditing({ name: saved.name ?? "", occasionIds: saved.saved_outfit_occasions.map((link) => link.occasion_id) });
    }
  }, [userId, editId]);

  const slots = activeSlots(options);
  const outfitKey = slots.map((slot) => `${slot}:${outfit[slot] ?? ""}`).join("|");
  const missingRequired = (["sopra", "sotto", "scarpe"] as const).some((slot) => !outfit[slot]);
  const byId = new Map(data?.items.map((item) => [item.id, item]));
  /** Colori dei capi scelti negli altri posti (escluso `except`). */
  const colorsBesides = (except?: Slot) =>
    slots.flatMap((slot) => {
      const item = slot !== except && outfit[slot] ? byId.get(outfit[slot]) : undefined;
      return item ? [item.color] : [];
    });
  const accents = accentLabels(colorsBesides());
  const clashes = (item: OutfitCandidate, slot: Slot) =>
    options.matchColors && !matchesColors(item.color, colorsBesides(slot));
  const pickerItems =
    picking && data
      ? data.items
          .filter((item) => fitsSlot(item, picking, options.strato))
          // Prima i capi dei gruppi scelti e non indossati di recente; in fondo quelli nel cesto
          .sort(
            (a, b) =>
              Number(a.inLaundry) - Number(b.inLaundry) ||
              Number(!inGroups(a, options.groupIds)) - Number(!inGroups(b, options.groupIds)) ||
              Number(data.recent.has(a.id)) - Number(data.recent.has(b.id)),
          )
      : [];
  const urls = usePhotoUrls([
    ...slots.flatMap((slot) => {
      const id = outfit[slot];
      const item = id ? byId.get(id) : undefined;
      return item ? [item.front_path] : [];
    }),
    ...pickerItems.map((item) => item.front_path),
  ]);

  function candidates(slot: Slot, withRecent = includeRecent) {
    return data ? candidatesFor(data.items, slot, options, withRecent ? undefined : data.recent) : [];
  }

  const pieces = slots.flatMap((slot) => (outfit[slot] ? [{ slot, itemId: outfit[slot] }] : []));

  async function wear() {
    if (!data || missingRequired || wearing === "salvataggio") return;
    setWearing("salvataggio");
    try {
      await saveOutfit(pieces, localDate());
      setSavedKey(outfitKey);
      setWearing(null);
      setWorn(
        pieces.flatMap((piece) => {
          const item = byId.get(piece.itemId);
          return item ? [{ ...piece, frontPath: item.front_path }] : [];
        }),
      );
      // Da adesso questi capi contano come indossati di recente: "Rigenera" li evita
      if (data.recentDays > 0) {
        setData((prev) =>
          prev ? { ...prev, recent: new Set([...prev.recent, ...pieces.map((piece) => piece.itemId)]) } : prev,
        );
      }
    } catch (error) {
      console.warn("Outfit non salvato", error);
      setWearing("errore");
    }
  }

  /**
   * Un outfit a caso. Con "Abbina i colori" i posti si riempiono in ordine casuale (prima quelli bloccati) scegliendo
   * solo capi che si abbinano ai precedenti; se un posto resta senza capi adatti si riprova, e alla fine si tiene
   * comunque l'ultimo tentativo: l'avviso sotto i capi dice quali colori non si abbinano.
   */
  function generate(withRecent = includeRecent) {
    setGenerated(true);
    setOutfit((prev) => {
      let next: Partial<Record<Slot, string>> = {};
      for (let attempt = 0; attempt < (options.matchColors ? COLOR_ATTEMPTS : 1); attempt++) {
        next = {};
        let matched = true;
        const chosen = slots.filter((slot) => locked.has(slot)).flatMap((slot) => {
          next[slot] = prev[slot];
          const item = prev[slot] ? byId.get(prev[slot]) : undefined;
          return item ? [item.color] : [];
        });
        for (const slot of shuffle(slots.filter((slot) => !locked.has(slot)))) {
          const all = candidates(slot, withRecent);
          const fitting = options.matchColors ? all.filter((item) => matchesColors(item.color, chosen)) : all;
          if (fitting.length === 0 && all.length > 0) matched = false;
          const item = pickRandom(fitting.length ? fitting : all, prev[slot]);
          next[slot] = item?.id;
          if (item) chosen.push(item.color);
        }
        if (matched && accentLabels(chosen).length <= 1) break;
      }
      return next;
    });
  }

  function change(slot: Slot) {
    const all = candidates(slot);
    const fitting = options.matchColors ? all.filter((item) => !clashes(item, slot)) : all;
    const item = pickRandom(fitting.length ? fitting : all, outfit[slot]);
    if (item) setOutfit((prev) => ({ ...prev, [slot]: item.id }));
  }

  function toggleMatchColors() {
    const enabled = !options.matchColors;
    setOptions((prev) => ({ ...prev, matchColors: enabled }));
    try {
      if (enabled) localStorage.removeItem(MATCH_COLORS_KEY);
      else localStorage.setItem(MATCH_COLORS_KEY, "no");
    } catch {}
  }

  function choose(slot: Slot, itemId: string) {
    setOutfit((prev) => ({ ...prev, [slot]: itemId }));
    setLocked((prev) => new Set(prev).add(slot));
    setPicking(null);
  }

  function clearSlot(slot: Slot) {
    setOutfit((prev) => ({ ...prev, [slot]: undefined }));
    unlock(slot);
  }

  function unlock(slot: Slot) {
    setLocked((prev) => {
      const next = new Set(prev);
      next.delete(slot);
      return next;
    });
  }

  function toggleLock(slot: Slot) {
    if (locked.has(slot)) return unlock(slot);
    setLocked((prev) => new Set(prev).add(slot));
  }

  function toggleOption(key: "capospalla" | "strato") {
    const enabled = !options[key];
    setOptions((prev) => ({ ...prev, [key]: enabled }));
    if (!enabled) clearSlot(key);
    // Con lo strato attivo il "sopra" non può essere un capo che si porta sotto (es. una t-shirt)
    const top = outfit.sopra ? byId.get(outfit.sopra) : undefined;
    if (key === "strato" && enabled && top?.underlayer) clearSlot("sopra");
  }

  function toggleGroup(id: string) {
    setOptions((prev) => ({
      ...prev,
      groupIds: prev.groupIds.includes(id) ? prev.groupIds.filter((g) => g !== id) : [...prev.groupIds, id],
    }));
  }

  if (error) return <p className="text-[15px] text-muted">Impossibile caricare l’armadio. Controlla la connessione.</p>;

  if (editing === "assente") return <p className="text-[15px] text-muted">Outfit non trovato.</p>;

  if (!data || (editId && !editing)) return <OutfitBuilderSkeleton />;

  const groupsLabel = options.groupIds.length ? " nei gruppi scelti" : "";

  return (
    <div className="space-y-6 pb-6">
      <section className="space-y-4">
        {data.groupings.length > 0 && (
          <div>
            <p className="mb-2 text-[15px] font-semibold">Gruppi</p>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              <Chip selected={!options.groupIds.length} onClick={() => setOptions((prev) => ({ ...prev, groupIds: [] }))}>
                Tutti
              </Chip>
              {data.groupings.map((grouping) => (
                <Chip
                  key={grouping.id}
                  selected={options.groupIds.includes(grouping.id)}
                  onClick={() => toggleGroup(grouping.id)}
                >
                  {grouping.name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Switch checked={options.capospalla} onClick={() => toggleOption("capospalla")} label="Capospalla" />
          <Switch checked={options.strato} onClick={() => toggleOption("strato")} label="Strato sotto" />
          <div className="col-span-2">
            <Switch checked={options.matchColors} onClick={toggleMatchColors} label="Abbina i colori" />
          </div>
        </div>

        <button
          type="button"
          onClick={() => generate()}
          className="h-13 w-full rounded-2xl bg-foreground text-[16px] font-semibold text-background"
        >
          {generated ? "Rigenera" : "Genera outfit"}
        </button>
        <p className="-mt-2 px-1 text-center text-[13px] leading-snug text-muted">
          {data.recentDays === 0
            ? "Nessun capo escluso: puoi cambiarlo dal Profilo."
            : includeRecent
              ? "Includo anche i capi indossati di recente."
              : `Evito i capi indossati negli ultimi ${data.recentDays === 1 ? "giorno" : `${data.recentDays} giorni`}.`}
          {locked.size > 0 && " I capi col lucchetto restano."}
        </p>
      </section>

      <ul className="grid grid-cols-2 gap-3">
        {slots.map((slot) => {
          const item = outfit[slot] ? byId.get(outfit[slot]) : undefined;
          const strict = candidates(slot, false);
          const loose = candidates(slot, true);
          // Capi adatti compresi quelli nel cesto: se ci sono solo quelli, il posto lo dice
          const anyFitting = data.items.some(
            (candidate) => fitsSlot(candidate, slot, options.strato) && inGroups(candidate, options.groupIds),
          );
          const isLocked = locked.has(slot);
          return (
            <li key={slot} className="flex flex-col rounded-3xl bg-surface p-3 ring-1 ring-line">
              <div className="mb-1 flex items-center justify-between pl-1">
                <p className="text-[15px] font-semibold">{SLOT_LABELS[slot]}</p>
                {item && (
                  <button
                    type="button"
                    aria-pressed={isLocked}
                    aria-label={isLocked ? `Sblocca ${SLOT_LABELS[slot]}` : `Blocca ${SLOT_LABELS[slot]}`}
                    onClick={() => toggleLock(slot)}
                    className={`-mr-1 flex size-11 items-center justify-center rounded-full ${
                      isLocked ? "text-foreground" : "text-muted"
                    }`}
                  >
                    <LockIcon open={!isLocked} width={20} height={20} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPicking(slot)}
                aria-label={`Scegli ${SLOT_LABELS[slot]}`}
                className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl bg-surface-muted"
              >
                {item ? (
                  urls[item.front_path] && (
                    // Chiave = capo: dopo "Rigenera" o "Cambia" il capo nuovo entra con l'animazione
                    // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                    <img
                      key={item.id}
                      src={urls[item.front_path]}
                      alt=""
                      className="cf-pop-in h-full w-full object-cover"
                    />
                  )
                ) : (
                  <span className="px-3 text-center text-[13px] leading-snug text-muted">
                    {!generated
                      ? "Genera o scegli tu"
                      : !anyFitting
                        ? `Nessun capo adatto${groupsLabel}`
                        : loose.length === 0
                          ? "Tutti nel cesto"
                        : strict.length === 0 && !includeRecent
                          ? "Tutti indossati di recente"
                          : "Genera o scegli tu"}
                  </span>
                )}
                {item && (item.inLaundry || data.recent.has(item.id)) && (
                  <span className="absolute inset-x-2 bottom-2 rounded-full bg-background/90 px-2 py-1 text-center text-[12px] font-medium">
                    {item.inLaundry ? "Da lavare" : "Indossato di recente"}
                  </span>
                )}
              </button>

              <div className="mt-1 grid grid-cols-2">
                <button
                  type="button"
                  onClick={() => change(slot)}
                  disabled={candidates(slot).length === 0 || (candidates(slot).length === 1 && !!item)}
                  className="h-11 text-[14px] font-medium disabled:opacity-40"
                >
                  {item ? "Cambia" : "A caso"}
                </button>
                <button type="button" onClick={() => setPicking(slot)} className="h-11 text-[14px] font-medium">
                  Scegli
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {options.matchColors && accents.length > 1 && (
        <p role="status" className="-mt-2 px-1 text-center text-[14px] leading-snug text-muted">
          {accents.length === 2
            ? `Due colori accesi: ${accents[0]} e ${accents[1]}.`
            : `Colori accesi: ${accents.slice(0, -1).join(", ")} e ${accents.at(-1)}.`}{" "}
          Con un solo colore acceso l’outfit si abbina meglio.
        </p>
      )}

      <div className="space-y-2">
        {editId && (
          <button
            type="button"
            onClick={() => setSaving(true)}
            disabled={missingRequired}
            className="h-13 w-full rounded-2xl bg-foreground text-[16px] font-semibold text-background disabled:opacity-40"
          >
            Salva modifiche
          </button>
        )}
        {savedKey === outfitKey ? (
          <div role="status" className="rounded-3xl bg-foreground px-5 py-4 text-[15px] text-background">
            <p className="font-semibold">Outfit salvato nello Storico.</p>
            <p className="mt-0.5 opacity-80">
              <Link href="/outfit/storico" className="underline underline-offset-2">
                Apri lo Storico
              </Link>{" "}
              oppure genera un altro outfit.
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={wear}
                disabled={missingRequired || wearing === "salvataggio"}
                className="h-13 flex-1 rounded-2xl bg-surface text-[16px] font-semibold ring-1 ring-foreground disabled:opacity-40 disabled:ring-line"
              >
                {wearing === "salvataggio" ? "Salvataggio…" : "Lo indosso oggi"}
              </button>
              {!editId && (
                <button
                  type="button"
                  onClick={() => setSaving(true)}
                  disabled={missingRequired || keptKey === outfitKey}
                  className="h-13 shrink-0 rounded-2xl bg-surface-muted px-5 text-[16px] font-semibold disabled:opacity-40"
                >
                  {keptKey === outfitKey ? "Salvato" : "Salva"}
                </button>
              )}
            </div>
            {keptKey === outfitKey && (
              <p role="status" className="text-center text-[14px] text-muted">
                Salvato tra gli outfit.{" "}
                <Link href="/outfit/salvati" className="font-medium text-foreground underline underline-offset-2">
                  Apri i Salvati
                </Link>
              </p>
            )}
            {(missingRequired || wearing === "errore") && (
              <p role={wearing === "errore" ? "alert" : undefined} className="text-center text-[14px] text-muted">
                {wearing === "errore"
                  ? "Outfit non salvato. Controlla la connessione e riprova."
                  : "Per salvarlo servono Sopra, Sotto e Scarpe."}
              </p>
            )}
          </>
        )}
      </div>

      {generated &&
        !includeRecent &&
        data.recentDays > 0 &&
        slots.some((slot) => !outfit[slot] && candidates(slot, false).length === 0 && candidates(slot, true).length > 0) && (
          <div className="space-y-2 rounded-3xl bg-surface-muted px-5 py-4">
            <p className="text-[15px] leading-relaxed">
              Per alcuni posti tutti i capi adatti sono stati indossati negli ultimi{" "}
              {data.recentDays === 1 ? "giorno" : `${data.recentDays} giorni`}.
            </p>
            <button
              type="button"
              onClick={() => {
                setIncludeRecent(true);
                generate(true);
              }}
              className="h-11 w-full rounded-2xl bg-surface text-[15px] font-medium ring-1 ring-line"
            >
              Includi anche quelli
            </button>
          </div>
        )}

      {picking && (
        <BottomSheet label={`Scegli ${SLOT_LABELS[picking]}`} onClose={() => setPicking(null)}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[20px] font-semibold">{SLOT_LABELS[picking]}</h2>
            {outfit[picking] && (
              <button
                type="button"
                onClick={() => {
                  clearSlot(picking);
                  setPicking(null);
                }}
                className="h-11 px-1 text-[15px] font-medium text-muted"
              >
                Togli
              </button>
            )}
          </div>
          {pickerItems.length === 0 ? (
            <p className="pb-4 text-[15px] leading-relaxed text-muted">
              {picking === "strato"
                ? "Nessun capo che si porta sotto. In Armadio → Modifica, apri una categoria “Sopra” e attiva “Si porta sotto”."
                : "Nessun capo adatto nell’armadio."}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 pb-2">
              {pickerItems.map((item) => {
                const current = outfit[picking] === item.id;
                const outside = !inGroups(item, options.groupIds) || clashes(item, picking);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => choose(picking, item.id)}
                      aria-pressed={current}
                      className={`relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface-muted ${
                        current ? "ring-2 ring-foreground" : ""
                      } ${outside || item.inLaundry ? "opacity-50" : ""}`}
                    >
                      {urls[item.front_path] && (
                        // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                        <img src={urls[item.front_path]} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      {(item.inLaundry || data.recent.has(item.id)) && (
                        <span className="absolute inset-x-1 bottom-1 rounded-full bg-background/90 py-0.5 text-center text-[11px] font-medium">
                          {item.inLaundry ? "Da lavare" : "Di recente"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {options.groupIds.length > 0 && pickerItems.some((item) => !inGroups(item, options.groupIds)) && (
            <p className="pb-2 text-[13px] text-muted">Più chiari: capi fuori dai gruppi scelti.</p>
          )}
          {pickerItems.some((item) => clashes(item, picking)) && (
            <p className="pb-2 text-[13px] text-muted">Più chiari: colori che non si abbinano al resto dell’outfit.</p>
          )}
        </BottomSheet>
      )}

      {saving && (
        <SaveOutfitSheet
          outfitId={editId}
          title={editId ? "Salva modifiche" : "Salva outfit"}
          initialName={editing?.name}
          initialOccasionIds={editing?.occasionIds}
          pieces={pieces}
          onClose={() => setSaving(false)}
          onSaved={() => {
            setSaving(false);
            if (editId) router.push("/outfit/salvati");
            else setKeptKey(outfitKey);
          }}
        />
      )}

      {worn && (
        <LaundryPrompt
          pieces={worn}
          onDone={(itemIds) => {
            setWorn(null);
            // I capi messi nel cesto non vengono più proposti
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    items: prev.items.map((item) => (itemIds.includes(item.id) ? { ...item, inLaundry: true } : item)),
                  }
                : prev,
            );
          }}
        />
      )}
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`h-11 shrink-0 rounded-full px-4 text-[15px] font-medium transition-colors ${
        selected ? "bg-foreground text-background" : "bg-surface text-foreground ring-1 ring-line"
      }`}
    >
      {children}
    </button>
  );
}

function Switch({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className="flex h-13 w-full items-center justify-between gap-2 rounded-2xl bg-surface pr-3 pl-4 ring-1 ring-line"
    >
      <span className="text-[15px] font-medium">{label}</span>
      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-foreground" : "bg-line"
        }`}
      >
        <span
          className={`size-6 rounded-full bg-background shadow-sm transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </span>
    </button>
  );
}
