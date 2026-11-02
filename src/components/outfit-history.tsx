"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { BottomSheet, SheetButton } from "@/components/bottom-sheet";
import { LaundryPrompt, type WornPiece } from "@/components/laundry-prompt";
import { SaveOutfitSheet } from "@/components/save-outfit-sheet";
import { dayLabel, localDate, SLOT_LABELS, SLOTS, type Slot } from "@/lib/outfit";
import { deleteOutfit, saveOutfit } from "@/lib/outfits";
import { usePhotoUrls } from "@/lib/photo-urls";
import { isComplete } from "@/lib/saved-outfits";
import { getSupabase } from "@/lib/supabase/client";

/** Outfit caricati per volta, dal più recente. */
const PAGE_SIZE = 30;

type Piece = { slot: Slot; item: { id: string; front_path: string } | null };

type HistoryOutfit = { id: string; worn_on: string; outfit_items: Piece[] };

/** Capi dell'outfit dall'alto in basso; quelli eliminati dall'armadio non ci sono più. */
function pieces(outfit: HistoryOutfit) {
  return outfit.outfit_items
    .filter((piece): piece is Piece & { item: NonNullable<Piece["item"]> } => !!piece.item)
    .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
}

export function OutfitHistory() {
  const userId = useUser()?.id;
  const [outfits, setOutfits] = useState<HistoryOutfit[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<HistoryOutfit | null>(null);
  // Dopo "Lo indosso di nuovo oggi": quali capi vanno nel cesto
  const [worn, setWorn] = useState<WornPiece[] | null>(null);
  // "Salva questo outfit": l'outfit dello Storico da copiare tra i Salvati
  const [keeping, setKeeping] = useState<HistoryOutfit | null>(null);
  const [kept, setKept] = useState(false);

  /** Carica una pagina di outfit; `from` 0 ricomincia dall'inizio. */
  const load = useCallback(async (from: number) => {
    const { data, error } = await getSupabase()
      .from("outfits")
      .select("id, worn_on, outfit_items(slot, item:items(id, front_path))")
      .order("worn_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return setError(true);
    const page = data as unknown as HistoryOutfit[];
    setOutfits((prev) => (from === 0 ? page : [...(prev ?? []), ...page]));
    setHasMore(page.length === PAGE_SIZE);
  }, []);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati dal database al montaggio
    load(0);
  }, [userId, load]);

  const urls = usePhotoUrls(outfits?.flatMap((outfit) => pieces(outfit).map((piece) => piece.item.front_path)) ?? []);

  async function loadMore() {
    if (!outfits) return;
    setLoadingMore(true);
    await load(outfits.length);
    setLoadingMore(false);
  }

  // Outfit raggruppati per giorno, nell'ordine in cui arrivano
  const days: { wornOn: string; outfits: HistoryOutfit[] }[] = [];
  for (const outfit of outfits ?? []) {
    const last = days.at(-1);
    if (last?.wornOn === outfit.worn_on) last.outfits.push(outfit);
    else days.push({ wornOn: outfit.worn_on, outfits: [outfit] });
  }

  if (error) return <p className="text-[15px] text-muted">Impossibile caricare lo Storico. Controlla la connessione.</p>;

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
        Ancora nessun outfit. In{" "}
        <Link href="/outfit" className="font-medium text-foreground underline underline-offset-2">
          Outfit
        </Link>{" "}
        generane uno e premi “Lo indosso oggi”.
      </p>
    );
  }

  return (
    <div className="space-y-8 pb-6">
      {kept && (
        <p role="status" className="rounded-3xl bg-foreground px-5 py-4 text-[15px] text-background">
          Outfit salvato.{" "}
          <Link href="/outfit/salvati" className="underline underline-offset-2">
            Apri i Salvati
          </Link>
        </p>
      )}
      {days.map((day) => (
        <section key={day.wornOn}>
          <h2 className="mb-3 text-[17px] font-semibold">{dayLabel(day.wornOn)}</h2>
          <ul className="space-y-3">
            {day.outfits.map((outfit) => {
              const list = pieces(outfit);
              return (
                <li key={outfit.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(outfit)}
                    aria-label={`Outfit di ${dayLabel(outfit.worn_on).toLowerCase()}`}
                    className="flex w-full gap-2 rounded-3xl bg-surface p-3 ring-1 ring-line transition-transform active:scale-[0.99]"
                  >
                    {list.length ? (
                      list.map((piece) => (
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
                      ))
                    ) : (
                      <span className="px-2 py-4 text-[14px] text-muted">I capi di questo outfit sono stati eliminati.</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="h-13 w-full rounded-2xl bg-surface-muted text-[16px] font-medium disabled:opacity-40"
        >
          {loadingMore ? "Caricamento…" : "Mostra outfit precedenti"}
        </button>
      )}

      {open && (
        <OutfitSheet
          outfit={open}
          urls={urls}
          onClose={() => setOpen(null)}
          onWornAgain={async () => {
            setOpen(null);
            setWorn(
              pieces(open).map((piece) => ({ slot: piece.slot, itemId: piece.item.id, frontPath: piece.item.front_path })),
            );
            await load(0);
          }}
          onDeleted={() => {
            setOpen(null);
            setOutfits((prev) => prev?.filter((outfit) => outfit.id !== open.id) ?? null);
          }}
          onKeep={() => {
            setOpen(null);
            setKept(false);
            setKeeping(open);
          }}
        />
      )}

      {keeping && (
        <SaveOutfitSheet
          pieces={pieces(keeping).map((piece) => ({ slot: piece.slot, itemId: piece.item.id }))}
          onClose={() => setKeeping(null)}
          onSaved={() => {
            setKeeping(null);
            setKept(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {worn && <LaundryPrompt pieces={worn} onDone={() => setWorn(null)} />}
    </div>
  );
}

function OutfitSheet({
  outfit,
  urls,
  onClose,
  onWornAgain,
  onDeleted,
  onKeep,
}: {
  outfit: HistoryOutfit;
  urls: Record<string, string>;
  onClose: () => void;
  onWornAgain: () => void;
  onDeleted: () => void;
  onKeep: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const list = pieces(outfit);
  const title = `Outfit di ${dayLabel(outfit.worn_on).toLowerCase()}`;

  async function wearAgain() {
    setPending(true);
    setMessage(null);
    try {
      await saveOutfit(
        list.map((piece) => ({ slot: piece.slot, itemId: piece.item.id })),
        localDate(),
      );
      onWornAgain();
    } catch (error) {
      console.warn("Outfit non salvato", error);
      setMessage("Outfit non salvato. Controlla la connessione e riprova.");
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm("Eliminare questo outfit dallo Storico? I capi restano nell’armadio.")) return;
    setPending(true);
    setMessage(null);
    try {
      await deleteOutfit(outfit.id);
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
                <span className="block aspect-[3/4] overflow-hidden rounded-2xl bg-surface-muted">
                  {urls[piece.item.front_path] && (
                    // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                    <img src={urls[piece.item.front_path]} alt="" className="h-full w-full object-cover" />
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

      <div className="mt-6 space-y-3">
        {list.length > 0 && (
          <SheetButton onClick={wearAgain} disabled={pending} primary>
            {pending ? "Attendi…" : "Lo indosso di nuovo oggi"}
          </SheetButton>
        )}
        {isComplete(list) && (
          <SheetButton onClick={onKeep} disabled={pending}>
            Salva questo outfit
          </SheetButton>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="h-11 w-full text-[15px] font-medium text-muted disabled:opacity-40"
        >
          Elimina dallo Storico
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
