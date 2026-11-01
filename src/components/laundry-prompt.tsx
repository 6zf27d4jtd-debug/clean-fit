"use client";

import { useState } from "react";
import { BottomSheet, SheetButton } from "@/components/bottom-sheet";
import { putInLaundry } from "@/lib/items";
import { SLOT_LABELS, type Slot } from "@/lib/outfit";
import { usePhotoUrls } from "@/lib/photo-urls";

/** Posti già spuntati: scarpe e capospalla di solito non si lavano a ogni uso. */
const CHECKED_SLOTS: Slot[] = ["sopra", "strato", "sotto"];

export type WornPiece = { slot: Slot; itemId: string; frontPath: string };

/** Dopo "Lo indosso oggi": quali capi dell'outfit mettere nel cesto. `onDone` riceve quelli messi nel cesto. */
export function LaundryPrompt({ pieces, onDone }: { pieces: WornPiece[]; onDone: (itemIds: string[]) => void }) {
  const [checked, setChecked] = useState(
    () => new Set(pieces.filter((piece) => CHECKED_SLOTS.includes(piece.slot)).map((piece) => piece.itemId)),
  );
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const urls = usePhotoUrls(pieces.map((piece) => piece.frontPath));

  function toggle(itemId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(itemId)) next.add(itemId);
      return next;
    });
  }

  async function confirm() {
    setPending(true);
    setFailed(false);
    try {
      await putInLaundry([...checked]);
      onDone([...checked]);
    } catch (error) {
      console.warn("Cesto non aggiornato", error);
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <BottomSheet label="Quali capi metti nel cesto?" onClose={() => onDone([])}>
      <h2 className="text-[20px] font-semibold">Quali capi metti nel cesto?</h2>
      <p className="mt-1 mb-4 text-[14px] text-muted">I capi nel cesto non vengono proposti negli outfit.</p>

      <ul className="grid grid-cols-3 gap-2">
        {pieces.map((piece) => {
          const isChecked = checked.has(piece.itemId);
          return (
            <li key={piece.itemId}>
              <button
                type="button"
                aria-pressed={isChecked}
                aria-label={`${SLOT_LABELS[piece.slot]}: ${isChecked ? "nel cesto" : "non nel cesto"}`}
                onClick={() => toggle(piece.itemId)}
                className={`relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface-muted ${
                  isChecked ? "ring-2 ring-foreground" : ""
                }`}
              >
                {urls[piece.frontPath] && (
                  // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                  <img
                    src={urls[piece.frontPath]}
                    alt=""
                    className={`h-full w-full object-cover ${isChecked ? "" : "opacity-50"}`}
                  />
                )}
                {/* Le foto hanno il fondo avorio: il segno di spunta resta scuro anche nel tema scuro */}
                <span
                  className={`absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full ${
                    isChecked ? "bg-neutral-900 text-white" : "bg-white/80 ring-2 ring-neutral-400"
                  }`}
                >
                  {isChecked && (
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden>
                      <path
                        d="M5 12.5l4.5 4.5L19 7.5"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              </button>
              <p className="mt-1 px-1 text-[13px] text-muted">{SLOT_LABELS[piece.slot]}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <SheetButton onClick={() => onDone([])} disabled={pending}>
          Salta
        </SheetButton>
        <SheetButton onClick={confirm} disabled={pending || checked.size === 0} primary>
          {pending ? "Attendi…" : `Nel cesto (${checked.size})`}
        </SheetButton>
      </div>

      {failed && (
        <p role="alert" className="mt-4 text-center text-[14px] text-muted">
          Cesto non aggiornato. Controlla la connessione e riprova.
        </p>
      )}
    </BottomSheet>
  );
}
