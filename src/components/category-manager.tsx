"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { BottomSheet, SheetButton } from "@/components/bottom-sheet";
import { CoverEditor, coverLabel, CoverRow } from "@/components/cover-editor";
import { ChevronRightIcon, PlusIcon } from "@/components/icons";
import { BackLink, PageHeader } from "@/components/page-header";
import { ROLE_LABELS, type CategoryRole } from "@/lib/categories";
import { deleteCoverPhoto, type Cover } from "@/lib/covers";
import { countLabel } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

/** underlayer: categoria "sopra" che negli outfit si porta sotto un altro capo (strato). */
type CategoryWithCount = Category & Cover & { underlayer: boolean; items: { count: number }[] };

/** Pannello aperto: una categoria esistente da modificare, oppure "nuova". */
type Editing = { category: CategoryWithCount } | { category: null };

const ROLES = Object.keys(ROLE_LABELS) as CategoryRole[];

export function CategoryManager() {
  const userId = useUser()?.id;
  const [categories, setCategories] = useState<CategoryWithCount[] | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("categories")
      .select("id, name, role, position, underlayer, cover_item_id, cover_photo_path, items(count)")
      .order("position");
    if (error) return setError(true);
    setCategories(data as CategoryWithCount[]);
  }, []);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati dal database al montaggio
    load();
  }, [userId, load]);

  return (
    <>
      <BackLink href="/" label="Armadio" />
      <PageHeader title="Categorie" subtitle="Nome e ruolo negli outfit" />

      {error ? (
        <p className="text-[15px] text-muted">Impossibile caricare le categorie. Controlla la connessione.</p>
      ) : (
        <div className="space-y-4 pb-6">
          <ul className="divide-y divide-line rounded-3xl bg-surface ring-1 ring-line">
            {(categories ?? Array.from({ length: 6 }, () => null)).map((category, index) => (
              <li key={category?.id ?? index}>
                {category ? (
                  <button
                    type="button"
                    onClick={() => setEditing({ category })}
                    className="flex min-h-15 w-full items-center gap-3 px-5 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-medium">{category.name}</span>
                      <span className="block text-[13px] text-muted">
                        {ROLE_LABELS[category.role]}
                        {category.underlayer && " (strato)"} · {countLabel(category.items[0]?.count ?? 0)}
                      </span>
                    </span>
                    <ChevronRightIcon width={20} height={20} className="shrink-0 text-muted" />
                  </button>
                ) : (
                  <div className="mx-5 my-4 h-8 animate-pulse rounded-lg bg-surface-muted" />
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setEditing({ category: null })}
            disabled={!categories}
            className="flex h-13 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line text-[16px] font-medium"
          >
            <PlusIcon width={20} height={20} />
            Nuova categoria
          </button>
        </div>
      )}

      {editing && categories && (
        <CategorySheet
          key={editing.category?.id ?? "nuova"}
          category={editing.category}
          categories={categories}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
          onCoverChanged={load}
        />
      )}
    </>
  );
}

/** Pannello dal basso: crea, rinomina, cambia ruolo, elimina (spostando i capi). */
function CategorySheet({
  category,
  categories,
  onClose,
  onDone,
  onCoverChanged,
}: {
  category: CategoryWithCount | null;
  categories: CategoryWithCount[];
  onClose: () => void;
  onDone: () => void;
  onCoverChanged: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [role, setRole] = useState<CategoryRole>(category?.role ?? "sopra");
  const [underlayer, setUnderlayer] = useState(category?.underlayer ?? false);
  const [step, setStep] = useState<"modifica" | "sposta" | "copertina">("modifica");
  const [cover, setCoverState] = useState<Cover>({
    cover_item_id: category?.cover_item_id ?? null,
    cover_photo_path: category?.cover_photo_path ?? null,
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const count = category?.items[0]?.count ?? 0;
  const others = categories.filter((c) => c.id !== category?.id);
  // Solo una categoria "sopra" può essere uno strato (vincolo anche nel database)
  const isUnderlayer = role === "sopra" && underlayer;
  const changed =
    !category || name.trim() !== category.name || role !== category.role || isUnderlayer !== category.underlayer;

  async function run(action: () => Promise<{ error: { code?: string } | null }>, failure: string) {
    setPending(true);
    setMessage(null);
    const { error } = await action();
    setPending(false);
    if (!error) return onDone();
    setMessage(error.code === "23505" ? "Esiste già una categoria con questo nome." : failure);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return setMessage("Scrivi un nome.");
    const supabase = getSupabase();
    if (!category) {
      const position = Math.max(-1, ...categories.map((c) => c.position)) + 1;
      return run(
        async () => supabase.from("categories").insert({ name: trimmed, role, position, underlayer: isUnderlayer }),
        "Categoria non creata. Controlla la connessione e riprova.",
      );
    }
    return run(
      async () => supabase.from("categories").update({ name: trimmed, role, underlayer: isUnderlayer }).eq("id", category.id),
      "Modifiche non salvate. Controlla la connessione e riprova.",
    );
  }

  function remove(moveTo?: string) {
    if (!category) return;
    if (!moveTo && !window.confirm(`Eliminare la categoria “${category.name}”?`)) return;
    return run(async () => {
      const result = await getSupabase().rpc("delete_category", { category: category.id, move_to: moveTo ?? null });
      // La foto di copertina caricata non serve più
      if (!result.error) await deleteCoverPhoto(cover.cover_photo_path);
      return result;
    }, "Categoria non eliminata. Controlla la connessione e riprova.");
  }

  return (
    <BottomSheet label={category ? `Modifica ${category.name}` : "Nuova categoria"} onClose={onClose}>
      {step === "copertina" && category ? (
        <CoverEditor
          table="categories"
          ownerId={category.id}
          cover={cover}
          onBack={() => setStep("modifica")}
          onChanged={(next) => {
            setCoverState(next);
            onCoverChanged();
          }}
        />
      ) : step === "modifica" ? (
        <div className="space-y-6">
          <h2 className="text-[20px] font-semibold">{category ? "Modifica categoria" : "Nuova categoria"}</h2>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-muted">Nome</span>
            <input
              type="text"
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="es. Gilet"
              className="h-13 w-full rounded-2xl bg-surface px-4 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-foreground"
            />
          </label>

          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-[13px] font-medium text-muted">Ruolo negli outfit</legend>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={role === value}
                  onClick={() => setRole(value)}
                  className={`h-11 rounded-full px-4 text-[15px] font-medium ${
                    role === value ? "bg-foreground text-background" : "bg-surface ring-1 ring-line"
                  }`}
                >
                  {ROLE_LABELS[value]}
                </button>
              ))}
            </div>
          </fieldset>

          {role === "sopra" && (
            <button
              type="button"
              role="switch"
              aria-checked={underlayer}
              onClick={() => setUnderlayer(!underlayer)}
              className="flex min-h-15 w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left ring-1 ring-line"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium">Si porta sotto</span>
                <span className="block text-[13px] leading-snug text-muted">
                  Negli outfit può fare da strato sotto felpe e camicie, mai il contrario
                </span>
              </span>
              <span
                className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  underlayer ? "bg-foreground" : "bg-line"
                }`}
              >
                <span
                  className={`size-6 rounded-full bg-background shadow-sm transition-transform ${
                    underlayer ? "translate-x-5" : ""
                  }`}
                />
              </span>
            </button>
          )}

          {category && <CoverRow label={coverLabel(cover)} onClick={() => setStep("copertina")} disabled={pending} />}

          <div className="grid grid-cols-2 gap-3">
            <SheetButton onClick={onClose} disabled={pending}>
              Annulla
            </SheetButton>
            <SheetButton onClick={save} disabled={pending || !changed || !name.trim()} primary>
              {pending ? "Salvataggio…" : category ? "Salva" : "Crea"}
            </SheetButton>
          </div>

          {category && (
            <button
              type="button"
              onClick={() => (count ? setStep("sposta") : remove())}
              disabled={pending || others.length === 0}
              className="h-11 w-full text-[15px] font-medium text-muted disabled:opacity-40"
            >
              Elimina categoria
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-[20px] font-semibold">Dove spostare i capi?</h2>
          <p className="text-[15px] leading-relaxed text-muted">
            “{category?.name}” contiene {countLabel(count)}. Scegli la categoria in cui spostarli: poi “{category?.name}”
            verrà eliminata. I capi e le loro foto restano.
          </p>
          <ul className="divide-y divide-line rounded-3xl bg-surface ring-1 ring-line">
            {others.map((other) => (
              <li key={other.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(other.id)}
                  className="flex min-h-13 w-full items-center justify-between gap-3 px-5 py-3 text-left text-[16px] disabled:opacity-40"
                >
                  <span className="truncate">{other.name}</span>
                  <span className="shrink-0 text-[13px] text-muted">{ROLE_LABELS[other.role]}</span>
                </button>
              </li>
            ))}
          </ul>
          <SheetButton onClick={() => setStep("modifica")} disabled={pending}>
            Indietro
          </SheetButton>
        </div>
      )}

      {message && (
        <p role="alert" className="mt-4 text-center text-[14px] text-muted">
          {message}
        </p>
      )}
    </BottomSheet>
  );
}
