"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { BottomSheet, SheetButton } from "@/components/bottom-sheet";
import { LaundryPrompt, type WornPiece } from "@/components/laundry-prompt";
import { OccasionChip, SaveOutfitSheet } from "@/components/save-outfit-sheet";
import { localDate, SLOT_LABELS, SLOTS } from "@/lib/outfit";
import { saveOutfit } from "@/lib/outfits";
import { usePhotoUrls } from "@/lib/photo-urls";
import {
  deleteOccasion,
  deleteSavedOutfit,
  fetchOccasions,
  isComplete,
  renameOccasion,
  SAVED_OUTFIT_SELECT,
  type Occasion,
  type SavedOutfit,
  type SavedPiece,
} from "@/lib/saved-outfits";
import { getSupabase } from "@/lib/supabase/client";

type Piece = SavedPiece & { item: NonNullable<SavedPiece["item"]> };

/** Capi dell'outfit dall'alto in basso; quelli eliminati dall'armadio non ci sono più. */
function pieces(outfit: SavedOutfit) {
  return outfit.saved_outfit_items
    .filter((piece): piece is Piece => !!piece.item)
    .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
}

const savedDay = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long" });

/** Nome dell'outfit; senza nome, le occasioni; senza occasioni, la data. */
function outfitTitle(outfit: SavedOutfit, occasionNames: Map<string, string>) {
  if (outfit.name) return outfit.name;
  const names = outfit.saved_outfit_occasions.flatMap((link) => occasionNames.get(link.occasion_id) ?? []);
  return names.length ? names.join(" · ") : `Outfit del ${savedDay(outfit.created_at)}`;
}

export function SavedOutfits() {
  const userId = useUser()?.id;
  const [outfits, setOutfits] = useState<SavedOutfit[] | null>(null);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [error, setError] = useState(false);
  // Occasione scelta nel filtro; null = tutti
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<SavedOutfit | null>(null);
  const [editingMeta, setEditingMeta] = useState<SavedOutfit | null>(null);
  const [managing, setManaging] = useState(false);
  const [worn, setWorn] = useState<WornPiece[] | null>(null);

  const load = useCallback(async () => {
    const [outfitsResult, occasionsResult] = await Promise.allSettled([
      getSupabase().from("saved_outfits").select(SAVED_OUTFIT_SELECT).order("created_at", { ascending: false }),
      fetchOccasions(),
    ]);
    if (outfitsResult.status === "rejected" || outfitsResult.value.error || occasionsResult.status === "rejected") {
      return setError(true);
    }
    setError(false);
    setOutfits(outfitsResult.value.data as unknown as SavedOutfit[]);
    setOccasions(occasionsResult.value);
    // L'occasione del filtro è stata eliminata: si torna a "Tutti"
    setFilter((prev) => (prev && occasionsResult.value.some((occasion) => occasion.id === prev) ? prev : null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati dal database al montaggio
    load();
  }, [userId, load]);

  const urls = usePhotoUrls(outfits?.flatMap((outfit) => pieces(outfit).map((piece) => piece.item.front_path)) ?? []);
  const occasionNames = new Map(occasions.map((occasion) => [occasion.id, occasion.name]));
  const visible =
    outfits?.filter((outfit) => !filter || outfit.saved_outfit_occasions.some((link) => link.occasion_id === filter)) ??
    [];

  if (error) return <p className="text-[15px] text-muted">Impossibile caricare gli outfit. Controlla la connessione.</p>;

  if (!outfits) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-3xl bg-surface-muted" />
        ))}
      </div>
    );
  }

  if (!outfits.length) {
    return (
      <p className="rounded-3xl border border-dashed border-line px-6 py-10 text-center text-[15px] leading-relaxed text-muted">
        Ancora nessun outfit salvato. In{" "}
        <Link href="/outfit" className="font-medium text-foreground underline underline-offset-2">
          Proponi
        </Link>{" "}
        componi un outfit e premi “Salva”.
      </p>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        <OccasionChip selected={!filter} onClick={() => setFilter(null)}>
          Tutti
        </OccasionChip>
        {occasions.map((occasion) => (
          <OccasionChip key={occasion.id} selected={filter === occasion.id} onClick={() => setFilter(occasion.id)}>
            {occasion.name}
          </OccasionChip>
        ))}
        {occasions.length > 0 && (
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="h-11 shrink-0 rounded-full px-4 text-[15px] font-medium text-muted"
          >
            Modifica
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-[15px] text-muted">Nessun outfit per questa occasione.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((outfit) => {
            const list = pieces(outfit);
            const inLaundry = list.filter((piece) => piece.item.in_laundry_since).length;
            const complete = isComplete(list);
            return (
              <li key={outfit.id}>
                <button
                  type="button"
                  onClick={() => setOpen(outfit)}
                  className="w-full rounded-3xl bg-surface p-3 text-left ring-1 ring-line transition-transform active:scale-[0.99]"
                >
                  <span className="mb-2 flex items-baseline justify-between gap-3 px-1">
                    <span className="truncate text-[16px] font-semibold">{outfitTitle(outfit, occasionNames)}</span>
                    {(!complete || inLaundry > 0) && (
                      <span className="shrink-0 text-[13px] text-muted">
                        {!complete ? "Incompleto" : inLaundry === 1 ? "1 capo da lavare" : `${inLaundry} capi da lavare`}
                      </span>
                    )}
                  </span>
                  <span className="flex gap-2">
                    {list.map((piece) => (
                      <span
                        key={piece.item.id}
                        className="aspect-[3/4] w-[calc((100%-2rem)/5)] shrink-0 overflow-hidden rounded-xl bg-surface-muted"
                      >
                        {urls[piece.item.front_path] && (
                          // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                          <img
                            src={urls[piece.item.front_path]}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <SavedOutfitSheet
          outfit={open}
          title={outfitTitle(open, occasionNames)}
          urls={urls}
          onClose={() => setOpen(null)}
          onWorn={() => {
            setOpen(null);
            setWorn(
              pieces(open).map((piece) => ({ slot: piece.slot, itemId: piece.item.id, frontPath: piece.item.front_path })),
            );
          }}
          onEditMeta={() => {
            setOpen(null);
            setEditingMeta(open);
          }}
          onDeleted={() => {
            setOpen(null);
            setOutfits((prev) => prev?.filter((outfit) => outfit.id !== open.id) ?? null);
          }}
        />
      )}

      {editingMeta && (
        <SaveOutfitSheet
          outfitId={editingMeta.id}
          title="Nome e occasioni"
          initialName={editingMeta.name ?? ""}
          initialOccasionIds={editingMeta.saved_outfit_occasions.map((link) => link.occasion_id)}
          pieces={pieces(editingMeta).map((piece) => ({ slot: piece.slot, itemId: piece.item.id }))}
          onClose={async () => {
            setEditingMeta(null);
            // Le occasioni create nel pannello compaiono anche se non si è salvato
            await load();
          }}
          onSaved={async () => {
            setEditingMeta(null);
            await load();
          }}
        />
      )}

      {managing && (
        <OccasionsSheet
          occasions={occasions}
          onClose={async () => {
            setManaging(false);
            await load();
          }}
        />
      )}

      {worn && <LaundryPrompt pieces={worn} onDone={() => setWorn(null)} />}
    </div>
  );
}

function SavedOutfitSheet({
  outfit,
  title,
  urls,
  onClose,
  onWorn,
  onEditMeta,
  onDeleted,
}: {
  outfit: SavedOutfit;
  title: string;
  urls: Record<string, string>;
  onClose: () => void;
  onWorn: () => void;
  onEditMeta: () => void;
  onDeleted: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const list = pieces(outfit);
  const complete = isComplete(list);

  async function wear() {
    setPending(true);
    setMessage(null);
    try {
      await saveOutfit(
        list.map((piece) => ({ slot: piece.slot, itemId: piece.item.id })),
        localDate(),
      );
      onWorn();
    } catch (error) {
      console.warn("Outfit non salvato", error);
      setMessage("Outfit non salvato nello Storico. Controlla la connessione e riprova.");
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm("Eliminare questo outfit salvato? I capi restano nell’armadio e lo Storico non cambia.")) return;
    setPending(true);
    setMessage(null);
    try {
      await deleteSavedOutfit(outfit.id);
      onDeleted();
    } catch (error) {
      console.warn("Outfit non eliminato", error);
      setMessage("Outfit non eliminato. Controlla la connessione e riprova.");
      setPending(false);
    }
  }

  return (
    <BottomSheet label={title} onClose={onClose}>
      <h2 className="mb-4 text-[20px] font-semibold">{title}</h2>

      {list.length ? (
        <ul className="grid grid-cols-2 gap-3">
          {list.map((piece) => (
            <li key={piece.item.id}>
              <Link href={`/capo/${piece.item.id}`} className="block">
                <span className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface-muted">
                  {urls[piece.item.front_path] && (
                    // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                    <img src={urls[piece.item.front_path]} alt="" className="h-full w-full object-cover" />
                  )}
                  {piece.item.in_laundry_since && (
                    <span className="absolute inset-x-2 bottom-2 rounded-full bg-background/90 px-2 py-1 text-center text-[12px] font-medium">
                      Da lavare
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block px-1 text-[13px] text-muted">{SLOT_LABELS[piece.slot]}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-muted">I capi di questo outfit sono stati eliminati.</p>
      )}

      {!complete && (
        <p className="mt-4 text-[14px] text-muted">
          Mancano capi eliminati dall’armadio: con “Modifica” puoi sceglierne altri.
        </p>
      )}

      <div className="mt-6 space-y-2">
        <SheetButton onClick={wear} disabled={pending || !complete} primary>
          {pending ? "Attendi…" : "Lo indosso oggi"}
        </SheetButton>
        <Link
          href={`/outfit/salvati/${outfit.id}`}
          className="flex h-13 w-full items-center justify-center rounded-2xl bg-surface-muted text-[16px] font-medium"
        >
          Modifica
        </Link>
        <SheetButton onClick={onEditMeta} disabled={pending || !complete}>
          Nome e occasioni
        </SheetButton>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="h-11 w-full text-[15px] font-medium text-muted disabled:opacity-40"
        >
          Elimina outfit
        </button>
      </div>

      {message && (
        <p role="alert" className="mt-4 text-center text-[14px] text-muted">
          {message}
        </p>
      )}
    </BottomSheet>
  );
}

/** Rinomina ed elimina le occasioni; gli outfit restano. */
function OccasionsSheet({ occasions, onClose }: { occasions: Occasion[]; onClose: () => void }) {
  const initialNames = () => Object.fromEntries(occasions.map((occasion) => [occasion.id, occasion.name]));
  // names: quello che c'è nei campi; savedNames: quello che c'è nel database
  const [names, setNames] = useState(initialNames);
  const [savedNames, setSavedNames] = useState(initialNames);
  const [deleted, setDeleted] = useState(new Set<string>());
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function rename(occasion: Occasion) {
    const name = names[occasion.id].trim();
    if (!name || name === savedNames[occasion.id]) return;
    setPending(occasion.id);
    setMessage(null);
    try {
      await renameOccasion(occasion.id, name);
      setSavedNames((prev) => ({ ...prev, [occasion.id]: name }));
    } catch (error) {
      setMessage(
        (error as { code?: string }).code === "23505"
          ? "Esiste già un’occasione con questo nome."
          : "Occasione non rinominata. Controlla la connessione e riprova.",
      );
    }
    setPending(null);
  }

  async function remove(occasion: Occasion) {
    if (!window.confirm(`Eliminare l’occasione “${savedNames[occasion.id]}”? Gli outfit restano tra i Salvati.`)) return;
    setPending(occasion.id);
    setMessage(null);
    try {
      await deleteOccasion(occasion.id);
      setDeleted((prev) => new Set(prev).add(occasion.id));
    } catch {
      setMessage("Occasione non eliminata. Controlla la connessione e riprova.");
    }
    setPending(null);
  }

  return (
    <BottomSheet label="Occasioni" onClose={onClose}>
      <h2 className="mb-4 text-[20px] font-semibold">Occasioni</h2>
      <ul className="space-y-2">
        {occasions
          .filter((occasion) => !deleted.has(occasion.id))
          .map((occasion) => {
            const changed = names[occasion.id].trim() !== savedNames[occasion.id] && !!names[occasion.id].trim();
            return (
              <li key={occasion.id} className="flex gap-2">
                <input
                  value={names[occasion.id]}
                  onChange={(event) => setNames((prev) => ({ ...prev, [occasion.id]: event.target.value }))}
                  maxLength={40}
                  aria-label={`Nome dell’occasione ${savedNames[occasion.id]}`}
                  className="h-11 min-w-0 flex-1 rounded-2xl bg-surface px-4 text-[16px] ring-1 ring-line outline-none focus:ring-foreground"
                />
                {changed ? (
                  <button
                    type="button"
                    onClick={() => rename(occasion)}
                    disabled={pending !== null}
                    className="h-11 shrink-0 rounded-2xl bg-foreground px-4 text-[15px] font-medium text-background disabled:opacity-40"
                  >
                    Salva
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => remove(occasion)}
                    disabled={pending !== null}
                    className="h-11 shrink-0 rounded-2xl px-3 text-[15px] font-medium text-muted ring-1 ring-line disabled:opacity-40"
                  >
                    Elimina
                  </button>
                )}
              </li>
            );
          })}
      </ul>
      {message && (
        <p role="alert" className="mt-4 text-center text-[14px] text-muted">
          {message}
        </p>
      )}
      <div className="mt-6">
        <SheetButton onClick={onClose} disabled={pending !== null}>
          Fatto
        </SheetButton>
      </div>
    </BottomSheet>
  );
}
