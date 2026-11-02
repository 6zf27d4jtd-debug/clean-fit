import { uuid } from "@/lib/items";
import { compressJpeg, downscale, type CropRect } from "@/lib/photo";
import { forgetPhotoUrls } from "@/lib/photo-urls";
import { getSupabase, PHOTO_BUCKET } from "@/lib/supabase/client";

// Copertine di categorie e gruppi (migrazione 0010): una foto caricata, oppure la foto di un capo scelto.
// Tutte e due vuote = "Automatica" (ultimo capo aggiunto). Il calcolo lo fanno category_summaries/grouping_summaries.

export type Cover = { cover_item_id: string | null; cover_photo_path: string | null };

export type CoverTable = "categories" | "groupings";

/** Lato lungo delle foto di copertina: le schede in Home e Gruppi sono piccole. */
const COVER_SIDE = 900;

/** Ritaglia, riduce e carica una foto di copertina nella cartella dell'utente; restituisce il percorso. */
export async function uploadCoverPhoto(userId: string, file: Blob, crop: CropRect) {
  const blob = await compressJpeg(await downscale(file, crop, COVER_SIDE));
  const path = `${userId}/copertine/${uuid()}.jpg`;
  const { error } = await getSupabase()
    .storage.from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) throw error;
  return path;
}

/** Toglie dallo Storage una foto di copertina non più usata. Se non riesce resta un file invisibile, non un errore. */
export async function deleteCoverPhoto(path: string | null) {
  if (!path) return;
  const { error } = await getSupabase().storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.warn("Foto di copertina non rimossa dallo Storage", error);
  forgetPhotoUrls([path]);
}

/**
 * Imposta la copertina (`next`: tutte e due vuote = automatica). Se prima c'era una foto caricata diversa,
 * la toglie dallo Storage dopo aver salvato. Se il salvataggio fallisce, toglie invece la foto nuova.
 */
export async function setCover(table: CoverTable, id: string, previous: Cover, next: Cover) {
  const { error } = await getSupabase().from(table).update(next).eq("id", id);
  if (error) {
    if (next.cover_photo_path !== previous.cover_photo_path) await deleteCoverPhoto(next.cover_photo_path);
    throw error;
  }
  if (previous.cover_photo_path !== next.cover_photo_path) await deleteCoverPhoto(previous.cover_photo_path);
}
