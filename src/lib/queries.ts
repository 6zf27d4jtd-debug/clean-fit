/**
 * Tutte le select dell'app in un posto solo, così `npm run check:db` (scripts/check-db.mjs) può provarle sul
 * database prima di ogni pubblicazione: colonne sbagliate o collegamenti ambigui saltano fuori lì e non sul telefono.
 * Nel resto del codice non si scrivono select a mano: lo stesso controllo lo verifica.
 * Nessuna importazione: lo script carica questo file direttamente con Node.
 */

/**
 * Chiave "categoria del capo" (items.category_id → categories), da indicare in ogni select che collega capi e
 * categorie. Dalla migrazione 0010 c'è anche categories.cover_item_id → items: senza questo nome Supabase non sa
 * quale collegamento usare e rifiuta la query (errore PGRST201).
 */
export const ITEM_CATEGORY_FK = "items_category_id_user_id_fkey";

export type Query = { table: string; select: string };

export const QUERIES = {
  /** Categoria: pagina della categoria, scelta della categoria in Aggiungi e Modifica. */
  category: { table: "categories", select: "id, name, role, position" },
  /** Gestione categorie: con copertina e numero di capi. */
  categoryWithCount: {
    table: "categories",
    select: `id, name, role, position, underlayer, cover_item_id, cover_photo_path, items!${ITEM_CATEGORY_FK}(count)`,
  },
  /** Capo in una griglia (Home, categoria): foto, cuore e cesto. */
  itemCard: { table: "items", select: "id, front_path, favorite, in_laundry_since" },
  /** Solo la foto del capo (cesto nella Home, scelta della copertina). */
  itemPhoto: { table: "items", select: "id, front_path" },
  /** Capi di un gruppo: filtrati dal collegamento con il gruppo. */
  groupItemCard: { table: "items", select: "id, front_path, favorite, in_laundry_since, item_groupings!inner(grouping_id)" },
  groupItemPhoto: { table: "items", select: "id, front_path, item_groupings!inner(grouping_id)" },
  /** Dettaglio del capo, con categoria e gruppi. */
  itemDetail: {
    table: "items",
    select:
      "id, category_id, front_path, back_path, color, notes, favorite, created_at, in_laundry_since, " +
      `category:categories!${ITEM_CATEGORY_FK}(id, name, role, position), item_groupings(grouping_id)`,
  },
  /** Capi candidati per gli outfit. */
  outfitCandidate: {
    table: "items",
    select:
      "id, front_path, color, in_laundry_since, item_groupings(grouping_id), " +
      `category:categories!${ITEM_CATEGORY_FK}(role, underlayer)`,
  },
  /** Ultimo outfit che contiene un capo (con il conteggio). */
  itemWorn: { table: "outfits", select: "worn_on, outfit_items!inner(item_id)" },
  /** Capi indossati di recente, con la data dell'outfit. */
  recentlyWorn: { table: "outfit_items", select: "item_id, outfits!inner(worn_on)" },
  grouping: { table: "groupings", select: "id, name, position" },
  groupingWithCover: { table: "groupings", select: "id, name, position, cover_item_id, cover_photo_path" },
  profileRecentDays: { table: "profiles", select: "recent_days" },
  /** Storico: outfit indossati con i loro capi. */
  history: { table: "outfits", select: "id, worn_on, outfit_items(slot, item:items(id, front_path))" },
  /** Id dell'outfit appena salvato nello Storico. */
  outfitId: { table: "outfits", select: "id" },
  savedOutfit: {
    table: "saved_outfits",
    select:
      "id, name, created_at, saved_outfit_items(slot, item:items(id, front_path, in_laundry_since)), " +
      "saved_outfit_occasions(occasion_id)",
  },
  occasion: { table: "occasions", select: "id, name, position" },
} as const satisfies Record<string, Query>;

/**
 * Funzioni di sola lettura chiamate dall'app senza parametri: il controllo verifica che esistano. Quelle che
 * modificano dati (save_outfit, update_item, delete_account…) non vengono mai chiamate dal controllo.
 */
export const READ_FUNCTIONS = ["category_summaries", "grouping_summaries", "is_admin", "list_invites"] as const;
