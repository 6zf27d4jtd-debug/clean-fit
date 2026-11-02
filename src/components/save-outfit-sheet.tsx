"use client";

import { useEffect, useState } from "react";
import { BottomSheet, SheetButton } from "@/components/bottom-sheet";
import type { OutfitPiece } from "@/lib/outfits";
import {
  createOccasion,
  fetchOccasions,
  limitMessage,
  OCCASION_SUGGESTIONS,
  saveSavedOutfit,
  type Occasion,
} from "@/lib/saved-outfits";

/**
 * Pannello per salvare un outfit (nuovo, oppure `outfitId` da aggiornare): nome facoltativo e occasioni.
 * Le occasioni nuove si creano subito, anche se poi si chiude il pannello senza salvare.
 */
export function SaveOutfitSheet({
  outfitId,
  initialName = "",
  initialOccasionIds = [],
  pieces,
  title = "Salva outfit",
  onClose,
  onSaved,
}: {
  outfitId?: string;
  initialName?: string;
  initialOccasionIds?: string[];
  pieces: OutfitPiece[];
  title?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [occasions, setOccasions] = useState<Occasion[] | null>(null);
  const [selected, setSelected] = useState(new Set(initialOccasionIds));
  const [newOccasion, setNewOccasion] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchOccasions().then(setOccasions, () => setMessage("Impossibile caricare le occasioni."));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function add(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || pending) return;
    // Un'occasione con lo stesso nome c'è già: basta sceglierla
    const existing = occasions?.find((occasion) => occasion.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setSelected((prev) => new Set(prev).add(existing.id));
      return setNewOccasion("");
    }
    setPending(true);
    setMessage(null);
    try {
      const occasion = await createOccasion(trimmed);
      setOccasions((prev) => [...(prev ?? []), occasion]);
      setSelected((prev) => new Set(prev).add(occasion.id));
      setNewOccasion("");
    } catch (error) {
      setMessage(limitMessage(error) ?? "Occasione non creata. Controlla la connessione e riprova.");
    } finally {
      setPending(false);
    }
  }

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      const id = await saveSavedOutfit({ id: outfitId, name, pieces, occasionIds: [...selected] });
      onSaved(id);
    } catch (error) {
      console.warn("Outfit non salvato", error);
      setMessage(limitMessage(error) ?? "Outfit non salvato. Controlla la connessione e riprova.");
      setPending(false);
    }
  }

  const suggestions = occasions?.length === 0 ? OCCASION_SUGGESTIONS : [];

  return (
    <BottomSheet label={title} onClose={onClose}>
      <h2 className="mb-4 text-[20px] font-semibold">{title}</h2>

      <label className="block">
        <span className="mb-1.5 block text-[15px] font-semibold">
          Nome <span className="font-normal text-muted">(facoltativo)</span>
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="Es. Cena con amici"
          className="h-12 w-full rounded-2xl bg-surface px-4 text-[16px] ring-1 ring-line outline-none focus:ring-foreground"
        />
      </label>

      <div className="mt-5">
        <p className="mb-2 text-[15px] font-semibold">Occasioni</p>
        {occasions === null ? (
          <div className="h-11 animate-pulse rounded-full bg-surface-muted" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {occasions.map((occasion) => (
              <OccasionChip key={occasion.id} selected={selected.has(occasion.id)} onClick={() => toggle(occasion.id)}>
                {occasion.name}
              </OccasionChip>
            ))}
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => add(suggestion)}
                disabled={pending}
                className="h-11 rounded-full border border-dashed border-line px-4 text-[15px] font-medium text-muted disabled:opacity-40"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        )}
        {suggestions.length > 0 && <p className="mt-2 text-[13px] text-muted">Tocca un suggerimento o scrivine una.</p>}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add(newOccasion);
          }}
        >
          <input
            value={newOccasion}
            onChange={(event) => setNewOccasion(event.target.value)}
            maxLength={40}
            placeholder="Nuova occasione"
            aria-label="Nuova occasione"
            className="h-11 min-w-0 flex-1 rounded-2xl bg-surface px-4 text-[16px] ring-1 ring-line outline-none focus:ring-foreground"
          />
          <button
            type="submit"
            disabled={!newOccasion.trim() || pending}
            className="h-11 shrink-0 rounded-2xl bg-surface-muted px-4 text-[15px] font-medium disabled:opacity-40"
          >
            Aggiungi
          </button>
        </form>
      </div>

      {message && (
        <p role="alert" className="mt-4 text-center text-[14px] text-muted">
          {message}
        </p>
      )}

      <div className="mt-6 space-y-2">
        <SheetButton primary onClick={save} disabled={pending || occasions === null}>
          {pending ? "Attendi…" : "Salva"}
        </SheetButton>
        <SheetButton onClick={onClose} disabled={pending}>
          Annulla
        </SheetButton>
      </div>
    </BottomSheet>
  );
}

export function OccasionChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
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
