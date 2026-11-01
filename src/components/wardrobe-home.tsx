"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { ItemCard } from "@/components/item-card";
import { PageHeader } from "@/components/page-header";
import { useFavoriteToggle } from "@/lib/item-toggles";
import { countLabel } from "@/lib/format";
import { emptyLaundry } from "@/lib/items";
import { usePhotoUrls } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";
import type { Category, Item } from "@/lib/types";

/** Riga di category_summaries(): numero di capi e copertina calcolati dal database. */
type CategorySummary = Category & { item_count: number; cover_path: string | null };

type FavoriteItem = Pick<Item, "id" | "front_path" | "favorite" | "in_laundry_since">;

type LaundryItem = Pick<Item, "id" | "front_path">;

export function WardrobeHome() {
  const [categories, setCategories] = useState<CategorySummary[] | null>(null);
  // Solo i preferiti: il resto dei capi non serve alla Home
  const [favorites, setFavorites] = useState<FavoriteItem[] | null>(null);
  // Capi nel cesto, da quello che ci sta da più tempo
  const [laundry, setLaundry] = useState<LaundryItem[] | null>(null);
  const [washing, setWashing] = useState<"in corso" | "errore" | null>(null);
  const [error, setError] = useState(false);
  const userId = useUser()?.id;

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    Promise.all([
      supabase.rpc("category_summaries"),
      supabase
        .from("items")
        .select("id, front_path, favorite, in_laundry_since")
        .eq("favorite", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("items")
        .select("id, front_path")
        .not("in_laundry_since", "is", null)
        .order("in_laundry_since", { ascending: true }),
    ]).then(([categoriesResult, favoritesResult, laundryResult]) => {
      if (categoriesResult.error || favoritesResult.error || laundryResult.error) return setError(true);
      setCategories(categoriesResult.data as CategorySummary[]);
      setFavorites(favoritesResult.data as FavoriteItem[]);
      setLaundry(laundryResult.data as LaundryItem[]);
    });
  }, [userId]);

  const toggleFavorite = useFavoriteToggle(setFavorites);
  // Un capo a cui si toglie il cuore resta nella fila (col cuore vuoto) finché non si lascia la pagina:
  // così un tocco sbagliato si annulla subito con un altro tocco.
  const shownFavorites = favorites ?? [];
  const total = categories?.reduce((sum, category) => sum + category.item_count, 0);
  const urls = usePhotoUrls([
    ...shownFavorites.map((item) => item.front_path),
    ...(laundry ?? []).map((item) => item.front_path),
    ...(categories ?? []).flatMap((category) => (category.cover_path ? [category.cover_path] : [])),
  ]);

  async function washAll() {
    if (!laundry?.length || !window.confirm("Tutto lavato? I capi escono dal cesto e tornano negli outfit.")) return;
    setWashing("in corso");
    try {
      await emptyLaundry();
      setLaundry([]);
      setFavorites((prev) => prev?.map((item) => ({ ...item, in_laundry_since: null })) ?? null);
      setWashing(null);
    } catch (error) {
      console.warn("Cesto non svuotato", error);
      setWashing("errore");
    }
  }

  return (
    <>
      <PageHeader
        title="Armadio"
        subtitle={total === undefined ? " " : countLabel(total)}
        action={
          <Link href="/categorie" className="flex h-11 items-center px-1 text-[15px] font-medium text-muted">
            Modifica
          </Link>
        }
      />
      {error ? (
        <p className="text-[15px] text-muted">Impossibile caricare l’armadio. Controlla la connessione.</p>
      ) : (
        <div className="space-y-8 pb-6">
          {shownFavorites.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] font-semibold">Preferiti</h2>
              <ul className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                {shownFavorites.map((item) => (
                  <li key={item.id} className="w-32 shrink-0">
                    <ItemCard
                      href={`/capo/${item.id}`}
                      label="Capo preferito"
                      photoUrl={urls[item.front_path]}
                      favorite={item.favorite}
                      onToggleFavorite={() => toggleFavorite(item)}
                      inLaundry={!!item.in_laundry_since}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {laundry && laundry.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-semibold">
                  Cesto <span className="font-normal text-muted">· {countLabel(laundry.length)}</span>
                </h2>
                <button
                  type="button"
                  onClick={washAll}
                  disabled={washing === "in corso"}
                  className="-mr-1 h-11 shrink-0 px-1 text-[15px] font-medium disabled:opacity-40"
                >
                  {washing === "in corso" ? "Attendi…" : "Tutto lavato"}
                </button>
              </div>
              <ul className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                {laundry.map((item) => (
                  <li key={item.id} className="w-24 shrink-0">
                    <ItemCard href={`/capo/${item.id}`} label="Capo da lavare" photoUrl={urls[item.front_path]} />
                  </li>
                ))}
              </ul>
              {washing === "errore" && (
                <p role="alert" className="mt-2 text-[14px] text-muted">
                  Cesto non svuotato. Controlla la connessione e riprova.
                </p>
              )}
            </section>
          )}

          <section>
            {(shownFavorites.length > 0 || !!laundry?.length) && <h2 className="mb-3 text-[17px] font-semibold">Categorie</h2>}
            <ul className="grid grid-cols-2 gap-3">
              {(categories ?? Array.from({ length: 6 }, () => null)).map((category, index) => (
                <li key={category?.id ?? index}>
                  {category ? (
                    <Link
                      href={`/categoria/${category.id}`}
                      className="flex aspect-[4/5] flex-col rounded-3xl bg-surface p-3 ring-1 ring-line transition-transform active:scale-[0.98]"
                    >
                      <div className="flex-1 overflow-hidden rounded-2xl bg-surface-muted">
                        {category.cover_path && urls[category.cover_path] && (
                          // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                          <img
                            src={urls[category.cover_path]}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="px-1 pt-2.5">
                        <p className="text-[15px] leading-tight font-semibold">{category.name}</p>
                        <p className="mt-0.5 text-[13px] text-muted">{countLabel(category.item_count)}</p>
                      </div>
                    </Link>
                  ) : (
                    <div className="aspect-[4/5] animate-pulse rounded-3xl bg-surface-muted" />
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
