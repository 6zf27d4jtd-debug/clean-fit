"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useUser } from "@/components/auth-provider";
import { FavoriteButton } from "@/components/item-card";
import { ItemDetails, type ItemDetailsValue } from "@/components/item-details";
import { BackLink } from "@/components/page-header";
import { requestFavorite } from "@/lib/favorites";
import { deleteItem, updateItem } from "@/lib/items";
import { dayLabel, OUTFIT_ROLES } from "@/lib/outfit";
import { forgetPhotoUrls, usePhotoUrls } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";
import type { Category, Grouping, Item } from "@/lib/types";

/** worn: quante volte il capo è stato indossato (outfit nello Storico) e l'ultimo giorno. */
type Loaded = {
  item: Item;
  category: Category | null;
  groupings: Grouping[];
  groupingIds: string[];
  worn: { count: number; last: string | null };
};

type ItemRow = Item & { category: Category | null; item_groupings: { grouping_id: string }[] };

/** Capo con categoria e gruppi in una sola richiesta, più l'elenco dei gruppi per i nomi e l'ultimo outfit col capo. */
async function fetchItem(id: string): Promise<Loaded | "assente" | "rete"> {
  const supabase = getSupabase();
  const [itemResult, groupingsResult, wornResult] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, category_id, front_path, back_path, color, notes, favorite, created_at, " +
          "category:categories(id, name, role, position), item_groupings(grouping_id)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("groupings").select("id, name, position").order("position").order("name"),
    // Outfit che contengono il capo: il più recente, e quanti sono in tutto
    supabase
      .from("outfits")
      .select("worn_on, outfit_items!inner(item_id)", { count: "exact" })
      .eq("outfit_items.item_id", id)
      .order("worn_on", { ascending: false })
      .limit(1),
  ]);
  // Un id non valido (non è un uuid) dà errore 22P02: per l'utente è un capo che non esiste
  if (itemResult.error?.code === "22P02" || (!itemResult.error && !itemResult.data)) return "assente";
  if (itemResult.error || groupingsResult.error || wornResult.error) return "rete";
  const { category, item_groupings, ...item } = itemResult.data as unknown as ItemRow;
  return {
    item,
    category,
    groupings: groupingsResult.data as Grouping[],
    groupingIds: item_groupings.map((link) => link.grouping_id),
    worn: { count: wornResult.count ?? 0, last: (wornResult.data[0]?.worn_on as string | undefined) ?? null },
  };
}

export function ItemView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const userId = useUser()?.id;
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<"rete" | "assente" | null>(null);
  const [editing, setEditing] = useState<ItemDetailsValue | null>(null);
  const [busy, setBusy] = useState<"salvataggio" | "eliminazione" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchItem(id);
    if (typeof result === "string") return setError(result);
    setData(result);
  }, [id]);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati dal database al montaggio
    load();
  }, [userId, load]);

  const item = data?.item;
  const photoPaths = item ? [item.front_path, ...(item.back_path ? [item.back_path] : [])] : [];
  const urls = usePhotoUrls(photoPaths);

  function toggleFavorite() {
    if (!item) return;
    const apply = (value: boolean) =>
      setData((prev) => (prev ? { ...prev, item: { ...prev.item, favorite: value } } : prev));
    apply(!item.favorite);
    requestFavorite(item.id, !item.favorite, item.favorite, apply);
  }

  async function save() {
    if (!data || !editing?.categoryId) return;
    setBusy("salvataggio");
    setActionError(null);
    try {
      await updateItem(data.item.id, {
        categoryId: editing.categoryId,
        groupingIds: editing.groupingIds,
        color: editing.color,
        notes: editing.notes,
      });
    } catch (err) {
      // update_item è una transazione: se fallisce non è cambiato niente
      console.warn("Modifica non salvata", err);
      setActionError("Modifiche non salvate. Controlla la connessione e riprova.");
      setBusy(null);
      return;
    }
    setEditing(null);
    // Salvate: se il ricaricamento fallisce si resta sulla pagina, con un avviso (non la schermata di errore)
    const result = await fetchItem(data.item.id);
    if (typeof result === "string") {
      setActionError("Modifiche salvate, ma la pagina non si è aggiornata. Ricaricala per vederle.");
    } else {
      setData(result);
    }
    setBusy(null);
  }

  async function remove() {
    if (!item || !window.confirm("Eliminare questo capo? Le foto verranno cancellate e non si potrà annullare.")) return;
    setBusy("eliminazione");
    setActionError(null);
    try {
      forgetPhotoUrls(await deleteItem(item));
      router.replace(`/categoria/${item.category_id}`);
    } catch (err) {
      console.warn("Capo non eliminato", err);
      setActionError("Il capo non è stato eliminato. Controlla la connessione e riprova.");
      setBusy(null);
    }
  }

  if (error) {
    return (
      <>
        <BackLink href="/" label="Armadio" />
        <p className="pt-6 text-[15px] text-muted">
          {error === "assente" ? "Questo capo non esiste più." : "Impossibile caricare il capo. Controlla la connessione."}
        </p>
      </>
    );
  }

  if (!data || !item) return <ItemViewSkeleton />;

  const photos = [
    { label: "Fronte", url: urls[item.front_path] },
    ...(item.back_path ? [{ label: "Retro", url: urls[item.back_path] }] : []),
  ];
  const groupNames = data.groupings.filter((g) => data.groupingIds.includes(g.id)).map((g) => g.name);

  return (
    <div className="pb-6">
      <BackLink href={`/categoria/${item.category_id}`} label={data.category?.name ?? "Armadio"} />

      <div className="relative mt-2">
        <PhotoCarousel photos={photos} />
        <FavoriteButton favorite={item.favorite} onToggle={toggleFavorite} className="absolute top-1 right-1" />
      </div>

      {editing ? (
        <div className="mt-8 space-y-6">
          <ItemDetails value={editing} onChange={setEditing} disabled={!!busy} />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setActionError(null);
              }}
              disabled={!!busy}
              className="h-13 rounded-2xl bg-surface-muted text-[16px] font-medium"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!!busy || !editing.categoryId}
              className="h-13 rounded-2xl bg-foreground text-[16px] font-semibold text-background disabled:opacity-40"
            >
              {busy === "salvataggio" ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <dl className="mt-6 divide-y divide-line rounded-3xl bg-surface px-5 ring-1 ring-line">
            <Row label="Categoria">{data.category?.name ?? "—"}</Row>
            <Row label="Gruppi">{groupNames.length ? groupNames.join(", ") : "—"}</Row>
            <Row label="Colore">{item.color ?? "—"}</Row>
            {item.notes && <Row label="Note">{item.notes}</Row>}
            {data.category && OUTFIT_ROLES.includes(data.category.role) && (
              <Row label="Indossato">
                {data.worn.last
                  ? `${dayLabel(data.worn.last, false)} · ${data.worn.count === 1 ? "1 volta" : `${data.worn.count} volte`}`
                  : "Mai"}
              </Row>
            )}
            <Row label="Aggiunto">
              {new Date(item.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
            </Row>
          </dl>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() =>
                setEditing({
                  categoryId: item.category_id,
                  groupingIds: data.groupingIds,
                  color: item.color ?? "",
                  notes: item.notes ?? "",
                })
              }
              disabled={!!busy}
              className="h-13 w-full rounded-2xl bg-foreground text-[16px] font-semibold text-background"
            >
              Modifica
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={!!busy}
              className="h-13 w-full rounded-2xl text-[16px] font-medium text-muted"
            >
              {busy === "eliminazione" ? "Eliminazione…" : "Elimina capo"}
            </button>
          </div>
        </>
      )}

      {actionError && (
        <p role="alert" className="mt-3 text-center text-[14px] text-muted">
          {actionError}
        </p>
      )}
    </div>
  );
}

/** Fronte e retro affiancati: si scorre col dito, oppure si tocca l'etichetta. */
function PhotoCarousel({ photos }: { photos: { label: string; url: string | undefined }[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function show(i: number) {
    const element = scroller.current;
    element?.scrollTo({ left: i * element.clientWidth, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          setIndex(Math.round(element.scrollLeft / element.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-3xl bg-surface-muted [scrollbar-width:none]"
      >
        {photos.map((photo) => (
          <div key={photo.label} className="aspect-[3/4] w-full shrink-0 snap-center">
            {photo.url && (
              // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
              <img src={photo.url} alt={photo.label} className="h-full w-full object-cover" />
            )}
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <div className="mt-2 flex justify-center gap-1">
          {photos.map((photo, i) => (
            <button
              key={photo.label}
              type="button"
              onClick={() => show(i)}
              aria-current={index === i}
              className={`h-11 rounded-full px-4 text-[14px] font-medium ${index === i ? "text-foreground" : "text-muted"}`}
            >
              {photo.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-3.5 text-[15px]">
      <dt className="w-24 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

export function ItemViewSkeleton() {
  return (
    <div className="pb-6">
      <div className="h-11" />
      <div className="mt-2 aspect-[3/4] animate-pulse rounded-3xl bg-surface-muted" />
      <div className="mt-6 h-44 animate-pulse rounded-3xl bg-surface-muted" />
    </div>
  );
}
