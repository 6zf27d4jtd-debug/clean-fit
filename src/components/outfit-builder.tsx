"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { BottomSheet } from "@/components/bottom-sheet";
import { LockIcon } from "@/components/icons";
import type { CategoryRole } from "@/lib/categories";
import {
  activeSlots,
  candidatesFor,
  fitsSlot,
  inGroups,
  localDate,
  pickRandom,
  SLOT_LABELS,
  type OutfitCandidate,
  type OutfitOptions,
  type Slot,
} from "@/lib/outfit";
import { usePhotoUrls } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";
import type { Grouping } from "@/lib/types";

/** Ruoli che entrano negli outfit; accessori ed esclusi restano fuori. */
const OUTFIT_ROLES: CategoryRole[] = ["capospalla", "sopra", "sotto", "scarpe"];

type ItemRow = {
  id: string;
  front_path: string;
  category: { role: CategoryRole; underlayer: boolean } | null;
  item_groupings: { grouping_id: string }[];
};

type Loaded = {
  items: OutfitCandidate[];
  groupings: Grouping[];
  /** Capi indossati negli ultimi N giorni (oggi compreso). */
  recent: Set<string>;
  recentDays: number;
};

export function OutfitBuilder() {
  const userId = useUser()?.id;
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [options, setOptions] = useState<OutfitOptions>({ groupIds: [], capospalla: false, strato: false });
  const [includeRecent, setIncludeRecent] = useState(false);
  const [outfit, setOutfit] = useState<Partial<Record<Slot, string>>>({});
  // Posti bloccati: "Genera" non li cambia (anche quelli scelti a mano)
  const [locked, setLocked] = useState(new Set<Slot>());
  const [generated, setGenerated] = useState(false);
  const [picking, setPicking] = useState<Slot | null>(null);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    Promise.all([
      supabase.from("profiles").select("recent_days").eq("id", userId).single(),
      supabase.from("items").select("id, front_path, category:categories(role, underlayer), item_groupings(grouping_id)"),
      supabase.from("groupings").select("id, name, position").order("position").order("name"),
      // Il massimo impostabile è 90 giorni: il filtro sul numero scelto si fa qui sotto
      supabase.from("outfit_items").select("item_id, outfits!inner(worn_on)").gte("outfits.worn_on", localDate(-89)),
    ]).then(([profileResult, itemsResult, groupingsResult, wornResult]) => {
      if (profileResult.error || itemsResult.error || groupingsResult.error || wornResult.error) return setError(true);
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
                },
              ]
            : [],
        ),
        groupings: groupingsResult.data as Grouping[],
        recent: new Set(recentDays > 0 ? worn.filter((row) => row.outfits.worn_on >= since).map((row) => row.item_id) : []),
        recentDays,
      });
    });
  }, [userId]);

  const slots = activeSlots(options);
  const byId = new Map(data?.items.map((item) => [item.id, item]));
  const pickerItems =
    picking && data
      ? data.items
          .filter((item) => fitsSlot(item, picking, options.strato))
          // Prima i capi dei gruppi scelti e non indossati di recente
          .sort(
            (a, b) =>
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

  function generate(withRecent = includeRecent) {
    setGenerated(true);
    setOutfit((prev) => {
      const next: Partial<Record<Slot, string>> = {};
      for (const slot of slots) {
        next[slot] = locked.has(slot) ? prev[slot] : pickRandom(candidates(slot, withRecent), prev[slot])?.id;
      }
      return next;
    });
  }

  function change(slot: Slot) {
    const item = pickRandom(candidates(slot), outfit[slot]);
    if (item) setOutfit((prev) => ({ ...prev, [slot]: item.id }));
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

  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-3xl bg-surface-muted" />
        ))}
      </div>
    );
  }

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
                    // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                    <img src={urls[item.front_path]} alt="" className="h-full w-full object-cover" />
                  )
                ) : (
                  <span className="px-3 text-center text-[13px] leading-snug text-muted">
                    {!generated
                      ? "Genera o scegli tu"
                      : loose.length === 0
                        ? `Nessun capo adatto${groupsLabel}`
                        : strict.length === 0 && !includeRecent
                          ? "Tutti indossati di recente"
                          : "Genera o scegli tu"}
                  </span>
                )}
                {item && data.recent.has(item.id) && (
                  <span className="absolute inset-x-2 bottom-2 rounded-full bg-background/90 px-2 py-1 text-center text-[12px] font-medium">
                    Indossato di recente
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
                const outside = !inGroups(item, options.groupIds);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => choose(picking, item.id)}
                      aria-pressed={current}
                      className={`relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface-muted ${
                        current ? "ring-2 ring-foreground" : ""
                      } ${outside ? "opacity-50" : ""}`}
                    >
                      {urls[item.front_path] && (
                        // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                        <img src={urls[item.front_path]} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      {data.recent.has(item.id) && (
                        <span className="absolute inset-x-1 bottom-1 rounded-full bg-background/90 py-0.5 text-center text-[11px] font-medium">
                          Di recente
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
        </BottomSheet>
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
      className="flex h-13 items-center justify-between gap-2 rounded-2xl bg-surface pr-3 pl-4 ring-1 ring-line"
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
