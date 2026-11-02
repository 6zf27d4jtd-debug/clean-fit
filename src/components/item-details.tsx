"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useUser } from "@/components/auth-provider";
import { PlusIcon } from "@/components/icons";
import { getSupabase } from "@/lib/supabase/client";
import type { Category, Grouping } from "@/lib/types";

export type ItemDetailsValue = { categoryId: string | null; groupingIds: string[]; color: string; notes: string };

export const EMPTY_DETAILS: ItemDetailsValue = { categoryId: null, groupingIds: [], color: "", notes: "" };

const COLOR_SUGGESTIONS = ["Nero", "Bianco", "Grigio", "Blu", "Blu scuro", "Beige", "Panna", "Marrone", "Verde", "Rosso"];

/** Categorie e gruppi dell'utente; `addGrouping` aggiunge all'elenco un gruppo appena creato. */
export type WardrobeLists = {
  categories: Category[] | null;
  groupings: Grouping[] | null;
  loadError: boolean;
  addGrouping: (grouping: Grouping) => void;
};

/** Carica categorie e gruppi; con `enabled` falso non chiede nulla (le liste arrivano da fuori). */
export function useWardrobeLists(enabled = true): WardrobeLists {
  const userId = useUser()?.id;
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [groupings, setGroupings] = useState<Grouping[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!userId || !enabled) return;
    const supabase = getSupabase();
    Promise.all([
      supabase.from("categories").select("id, name, role, position").order("position"),
      supabase.from("groupings").select("id, name, position").order("position").order("name"),
    ]).then(([categoriesResult, groupingsResult]) => {
      if (categoriesResult.error || groupingsResult.error) return setLoadError(true);
      setCategories(categoriesResult.data as Category[]);
      setGroupings(groupingsResult.data as Grouping[]);
    });
  }, [userId, enabled]);

  return {
    categories,
    groupings,
    loadError,
    addGrouping: (grouping) => setGroupings((prev) => [...(prev ?? []), grouping]),
  };
}

/**
 * Categoria (obbligatoria), raggruppamenti, colore e note di un capo.
 * Con `bulk` mostra solo categoria e gruppi, da assegnare a più capi insieme (import).
 */
export function ItemDetails({
  value,
  onChange,
  disabled,
  lists,
  bulk,
}: {
  value: ItemDetailsValue;
  onChange: (value: ItemDetailsValue) => void;
  disabled?: boolean;
  /** Liste già caricate da chi usa il componente; altrimenti le carica da sé. */
  lists?: WardrobeLists;
  bulk?: boolean;
}) {
  const own = useWardrobeLists(!lists);
  const { categories, groupings, loadError, addGrouping } = lists ?? own;

  function toggleGrouping(id: string) {
    const groupingIds = value.groupingIds.includes(id)
      ? value.groupingIds.filter((g) => g !== id)
      : [...value.groupingIds, id];
    onChange({ ...value, groupingIds });
  }

  if (loadError) {
    return <p className="text-[15px] text-muted">Impossibile caricare categorie e gruppi. Controlla la connessione.</p>;
  }

  return (
    // min-w-0: un <fieldset> per regola del browser non si stringe sotto la larghezza del contenuto; senza,
    // la fila dei colori (che scorre di lato) lo allarga e con lui tutta la pagina
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      <Field label="Categoria" hint={bulk ? "Facoltativa" : "Obbligatoria"}>
        <Chips loading={!categories}>
          {categories?.map((category) => (
            <Chip
              key={category.id}
              selected={value.categoryId === category.id}
              // Per più capi la categoria si può anche lasciare com'è: un secondo tocco la deseleziona
              onClick={() =>
                onChange({ ...value, categoryId: bulk && value.categoryId === category.id ? null : category.id })
              }
            >
              {category.name}
            </Chip>
          ))}
        </Chips>
      </Field>

      <Field label="Gruppi" hint={bulk ? "Si aggiungono a quelli già scelti" : "Facoltativi, anche più di uno"}>
        <Chips loading={!groupings}>
          {groupings?.map((grouping) => (
            <Chip
              key={grouping.id}
              selected={value.groupingIds.includes(grouping.id)}
              onClick={() => toggleGrouping(grouping.id)}
            >
              {grouping.name}
            </Chip>
          ))}
          {groupings && (
            <NewGrouping
              position={groupings.length}
              onCreated={(grouping) => {
                addGrouping(grouping);
                onChange({ ...value, groupingIds: [...value.groupingIds, grouping.id] });
              }}
            />
          )}
        </Chips>
      </Field>

      {!bulk && (
        <>
          <Field label="Colore" hint="Facoltativo">
            <input
              type="text"
              maxLength={40}
              value={value.color}
              onChange={(event) => onChange({ ...value, color: event.target.value })}
              placeholder="es. blu navy"
              className="h-13 w-full rounded-2xl bg-surface px-4 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-foreground"
            />
            <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
              {COLOR_SUGGESTIONS.map((color) => (
                <Chip
                  key={color}
                  selected={value.color.toLowerCase() === color.toLowerCase()}
                  onClick={() => onChange({ ...value, color })}
                >
                  {color}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Note" hint="Facoltative">
            <textarea
              maxLength={500}
              rows={3}
              value={value.notes}
              onChange={(event) => onChange({ ...value, notes: event.target.value })}
              placeholder="es. taglia M, comprata a Milano"
              className="w-full resize-none rounded-2xl bg-surface px-4 py-3 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-foreground"
            />
          </Field>
        </>
      )}
    </fieldset>
  );
}

/** Crea un gruppo nuovo senza lasciare la pagina; il gruppo viene subito selezionato. */
function NewGrouping({ position, onCreated }: { position: number; onCreated: (grouping: Grouping) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: { preventDefault(): void }) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    const { data, error } = await getSupabase()
      .from("groupings")
      .insert({ name: trimmed, position })
      .select("id, name, position")
      .single();
    setPending(false);
    if (error) {
      setError(error.code === "23505" ? "Esiste già un gruppo con questo nome." : "Gruppo non creato. Riprova.");
      return;
    }
    onCreated(data as Grouping);
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1 rounded-full border border-dashed border-line px-4 text-[15px] text-muted"
      >
        <PlusIcon width={18} height={18} />
        Nuovo
      </button>
    );
  }

  // Non è un <form>: è già dentro il fieldset del modulo; Invio sulla tastiera crea il gruppo.
  return (
    <div className="w-full">
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create(event);
          }}
          enterKeyHint="done"
          placeholder="es. estiva"
          className="h-11 min-w-0 flex-1 rounded-full bg-surface px-4 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-foreground"
        />
        <button
          type="button"
          onClick={create}
          disabled={pending || !name.trim()}
          className="h-11 rounded-full bg-foreground px-4 text-[15px] font-medium text-background disabled:opacity-40"
        >
          Crea
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setName("");
            setError(null);
          }}
          className="h-11 px-2 text-[15px] text-muted"
        >
          Annulla
        </button>
      </div>
      {error && <p className="mt-1.5 px-1 text-[13px] text-muted">{error}</p>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-baseline justify-between">
        <span className="text-[17px] font-semibold">{label}</span>
        <span className="text-[13px] text-muted">{hint}</span>
      </p>
      {children}
    </div>
  );
}

function Chips({ loading, children }: { loading: boolean; children: ReactNode }) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="h-11 w-24 animate-pulse rounded-full bg-surface-muted" />
        ))}
      </div>
    );
  }
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
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
