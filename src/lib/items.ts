import { getSupabase, PHOTO_BUCKET } from "@/lib/supabase/client";

/** Uguale al limite del trigger check_item_limit (migrazione 0007). */
export const MAX_ITEMS = 300;
export const ITEM_LIMIT_MESSAGE = `Hai raggiunto il limite di ${MAX_ITEMS} capi. Elimina qualche capo per aggiungerne altri.`;

/** Errore del trigger check_item_limit: il capo non è stato salvato perché l'armadio è pieno. */
export function isItemLimitError(error: unknown) {
  return (error as { hint?: string } | null)?.hint === "limite_capi";
}

export type NewItem = {
  categoryId: string;
  groupingIds: string[];
  color: string;
  notes: string;
  /** Foto già ritoccate e compresse (JPEG). */
  front: Blob;
  back?: Blob;
};

/**
 * Salva un capo: carica le foto nella cartella dell'utente (`<user_id>/<item_id>/…`, l'unica che le policy
 * dello Storage gli permettono), poi scrive capo e raggruppamenti. Se un passaggio fallisce, annulla i precedenti.
 */
export async function saveItem(userId: string, item: NewItem) {
  const supabase = getSupabase();
  const id = uuid();
  const folder = `${userId}/${id}`;
  const photos = [
    { path: `${folder}/fronte.jpg`, blob: item.front },
    ...(item.back ? [{ path: `${folder}/retro.jpg`, blob: item.back }] : []),
  ];
  const uploaded: string[] = [];
  let itemCreated = false;

  try {
    for (const { path, blob } of photos) {
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (error) throw error;
      uploaded.push(path);
    }

    const { error: itemError } = await supabase.from("items").insert({
      id,
      category_id: item.categoryId,
      front_path: photos[0].path,
      back_path: photos[1]?.path ?? null,
      color: item.color.trim() || null,
      notes: item.notes.trim() || null,
    });
    if (itemError) throw itemError;
    itemCreated = true;

    if (item.groupingIds.length) {
      const { error } = await supabase
        .from("item_groupings")
        .insert(item.groupingIds.map((groupingId) => ({ item_id: id, grouping_id: groupingId })));
      if (error) throw error;
    }
    return id;
  } catch (error) {
    // I raggruppamenti del capo spariscono a cascata con il capo
    if (itemCreated) await supabase.from("items").delete().eq("id", id);
    if (uploaded.length) await supabase.storage.from(PHOTO_BUCKET).remove(uploaded);
    throw error;
  }
}

/** crypto.randomUUID esiste solo in HTTPS: in http sulla rete locale si ripiega su getRandomValues. */
function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function setFavorite(itemId: string, favorite: boolean) {
  const { error } = await getSupabase().from("items").update({ favorite }).eq("id", itemId);
  if (error) throw error;
}

/** Mette un capo nel cesto (da lavare) o lo toglie. */
export async function setInLaundry(itemId: string, inLaundry: boolean) {
  const { error } = await getSupabase()
    .from("items")
    .update({ in_laundry_since: inLaundry ? new Date().toISOString() : null })
    .eq("id", itemId);
  if (error) throw error;
}

/** Mette più capi nel cesto; quelli che ci sono già tengono la loro data. */
export async function putInLaundry(itemIds: string[]) {
  const { error } = await getSupabase()
    .from("items")
    .update({ in_laundry_since: new Date().toISOString() })
    .in("id", itemIds)
    .is("in_laundry_since", null);
  if (error) throw error;
}

/** "Tutto lavato": svuota il cesto. */
export async function emptyLaundry() {
  const { error } = await getSupabase()
    .from("items")
    .update({ in_laundry_since: null })
    .not("in_laundry_since", "is", null);
  if (error) throw error;
}

export type ItemChanges = { categoryId: string; groupingIds: string[]; color: string; notes: string };

/** Aggiorna dati e gruppi di un capo in un'unica transazione (funzione update_item): o tutto o niente. */
export async function updateItem(itemId: string, changes: ItemChanges) {
  const { error } = await getSupabase().rpc("update_item", {
    item: itemId,
    category: changes.categoryId,
    color: changes.color,
    notes: changes.notes,
    grouping_ids: changes.groupingIds,
  });
  if (error) throw error;
}

/**
 * Elimina un capo: prima la riga (i gruppi del capo spariscono a cascata), poi le foto.
 * In quest'ordine, se la rimozione delle foto fallisce restano solo file invisibili, mai un capo senza foto.
 */
export async function deleteItem(item: { id: string; front_path: string; back_path: string | null }) {
  const supabase = getSupabase();
  const { error } = await supabase.from("items").delete().eq("id", item.id);
  if (error) throw error;
  const paths = [item.front_path, item.back_path].filter((path): path is string => !!path);
  const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  if (storageError) console.warn("Foto del capo non rimosse dallo Storage", storageError);
  return paths;
}
