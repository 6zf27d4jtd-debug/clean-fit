import type { Slot } from "@/lib/outfit";
import type { OutfitPiece } from "@/lib/outfits";
import { getSupabase } from "@/lib/supabase/client";

// Outfit salvati (migrazione 0009): si indossano quando si vuole e si raggruppano per occasione.
// Separati dallo Storico, che resta un diario di cosa si è indossato e quando.

export type Occasion = { id: string; name: string; position: number };

export type SavedPiece = { slot: Slot; item: { id: string; front_path: string; in_laundry_since: string | null } | null };

export type SavedOutfit = {
  id: string;
  name: string | null;
  created_at: string;
  saved_outfit_items: SavedPiece[];
  saved_outfit_occasions: { occasion_id: string }[];
};

/** Proposte la prima volta, quando l'utente non ha ancora occasioni. */
export const OCCASION_SUGGESTIONS = ["Lavoro", "Tempo libero", "Sera", "Sport"];

/** Uguali ai limiti dei trigger della migrazione 0009. */
export const LIMIT_MESSAGES: Record<string, string> = {
  limite_outfit: "Hai raggiunto il limite di 300 outfit salvati. Eliminane qualcuno per salvarne altri.",
  limite_occasioni: "Hai raggiunto il limite di 50 occasioni.",
};

export function limitMessage(error: unknown) {
  const hint = (error as { hint?: string } | null)?.hint;
  return hint ? LIMIT_MESSAGES[hint] : undefined;
}

export const SAVED_OUTFIT_SELECT =
  "id, name, created_at, saved_outfit_items(slot, item:items(id, front_path, in_laundry_since)), " +
  "saved_outfit_occasions(occasion_id)";

export async function fetchOccasions() {
  const { data, error } = await getSupabase()
    .from("occasions")
    .select("id, name, position")
    .order("position")
    .order("name");
  if (error) throw error;
  return data as Occasion[];
}

export async function createOccasion(name: string) {
  const { data, error } = await getSupabase().from("occasions").insert({ name: name.trim() }).select("id, name, position");
  if (error) throw error;
  return data[0] as Occasion;
}

export async function renameOccasion(id: string, name: string) {
  const { error } = await getSupabase().from("occasions").update({ name: name.trim() }).eq("id", id);
  if (error) throw error;
}

/** Gli outfit dell'occasione restano: sparisce solo il collegamento. */
export async function deleteOccasion(id: string) {
  const { error } = await getSupabase().from("occasions").delete().eq("id", id);
  if (error) throw error;
}

/** Crea (senza id) o aggiorna un outfit salvato: nome, capi e occasioni insieme (funzione save_outfit). */
export async function saveSavedOutfit(outfit: {
  id?: string;
  name: string;
  pieces: OutfitPiece[];
  occasionIds: string[];
}) {
  const { data, error } = await getSupabase().rpc("save_outfit", {
    outfit: outfit.id ?? null,
    outfit_name: outfit.name,
    pieces: outfit.pieces.map((piece) => ({ slot: piece.slot, item_id: piece.itemId })),
    occasion_ids: outfit.occasionIds,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteSavedOutfit(id: string) {
  const { error } = await getSupabase().from("saved_outfits").delete().eq("id", id);
  if (error) throw error;
}

/** Sopra, Sotto e Scarpe sono obbligatori: senza uno di questi (capo eliminato) l'outfit è incompleto. */
export function isComplete(pieces: { slot: Slot }[]) {
  return (["sopra", "sotto", "scarpe"] as const).every((slot) => pieces.some((piece) => piece.slot === slot));
}
