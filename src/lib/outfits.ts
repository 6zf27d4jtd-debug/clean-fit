import { getSupabase } from "@/lib/supabase/client";
import type { Slot } from "@/lib/outfit";

export type OutfitPiece = { slot: Slot; itemId: string };

/**
 * Salva un outfit indossato nel giorno indicato (AAAA-MM-GG): prima l'outfit, poi i suoi capi.
 * Se i capi non si salvano, l'outfit viene eliminato: nello Storico non restano outfit a metà.
 */
export async function saveOutfit(pieces: OutfitPiece[], wornOn: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("outfits").insert({ worn_on: wornOn }).select("id").single();
  if (error) throw error;
  const { error: itemsError } = await supabase
    .from("outfit_items")
    .insert(pieces.map((piece) => ({ outfit_id: data.id, item_id: piece.itemId, slot: piece.slot })));
  if (itemsError) {
    await supabase.from("outfits").delete().eq("id", data.id);
    throw itemsError;
  }
  return data.id as string;
}

/** Elimina un outfit dallo Storico; i collegamenti ai capi spariscono a cascata, i capi no. */
export async function deleteOutfit(outfitId: string) {
  const { error } = await getSupabase().from("outfits").delete().eq("id", outfitId);
  if (error) throw error;
}
