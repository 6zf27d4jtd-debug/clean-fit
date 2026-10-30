"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { ItemCard } from "@/components/item-card";
import { PageHeader } from "@/components/page-header";
import { setFavorite } from "@/lib/items";
import { usePhotoUrls } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";
import type { Category, Item } from "@/lib/types";

type HomeItem = Pick<Item, "id" | "category_id" | "front_path" | "favorite">;

export function countLabel(count: number) {
  return count === 1 ? "1 capo" : `${count} capi`;
}

export function WardrobeHome() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  // Dal più recente: il primo capo di ogni categoria ne è la copertina
  const [items, setItems] = useState<HomeItem[] | null>(null);
  const [error, setError] = useState(false);
  const userId = useUser()?.id;

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    Promise.all([
      supabase.from("categories").select("id, name, role, position").order("position"),
      supabase.from("items").select("id, category_id, front_path, favorite").order("created_at", { ascending: false }),
    ]).then(([categoriesResult, itemsResult]) => {
      if (categoriesResult.error || itemsResult.error) return setError(true);
      setCategories(categoriesResult.data as Category[]);
      setItems(itemsResult.data as HomeItem[]);
    });
  }, [userId]);

  const favorites = items?.filter((item) => item.favorite) ?? [];
  const covers = new Map<string, HomeItem>();
  const counts = new Map<string, number>();
  for (const item of items ?? []) {
    if (!covers.has(item.category_id)) covers.set(item.category_id, item);
    counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1);
  }
  const urls = usePhotoUrls([...favorites.map((item) => item.front_path), ...[...covers.values()].map((item) => item.front_path)]);

  async function toggleFavorite(item: HomeItem) {
    const favorite = !item.favorite;
    const apply = (value: boolean) =>
      setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, favorite: value } : i)) ?? null);
    apply(favorite);
    try {
      await setFavorite(item.id, favorite);
    } catch {
      apply(!favorite);
    }
  }

  return (
    <>
      <PageHeader title="Armadio" subtitle={items ? countLabel(items.length) : " "} />
      {error ? (
        <p className="text-[15px] text-muted">Impossibile caricare l’armadio. Controlla la connessione.</p>
      ) : (
        <div className="space-y-8 pb-6">
          {favorites.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] font-semibold">Preferiti</h2>
              <ul className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                {favorites.map((item) => (
                  <li key={item.id} className="w-32 shrink-0">
                    <ItemCard
                      label="Capo preferito"
                      photoUrl={urls[item.front_path]}
                      favorite
                      onToggleFavorite={() => toggleFavorite(item)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            {favorites.length > 0 && <h2 className="mb-3 text-[17px] font-semibold">Categorie</h2>}
            <ul className="grid grid-cols-2 gap-3">
              {(categories ?? Array.from({ length: 6 }, () => null)).map((category, index) => {
                const cover = category && covers.get(category.id);
                const count = category ? (counts.get(category.id) ?? 0) : 0;
                return (
                  <li key={category?.id ?? index}>
                    {category ? (
                      <Link
                        href={`/categoria/${category.id}`}
                        className="flex aspect-[4/5] flex-col rounded-3xl bg-surface p-3 ring-1 ring-line transition-transform active:scale-[0.98]"
                      >
                        <div className="flex-1 overflow-hidden rounded-2xl bg-surface-muted">
                          {cover && urls[cover.front_path] && (
                            // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                            <img
                              src={urls[cover.front_path]}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="px-1 pt-2.5">
                          <p className="text-[15px] leading-tight font-semibold">{category.name}</p>
                          <p className="mt-0.5 text-[13px] text-muted">{countLabel(count)}</p>
                        </div>
                      </Link>
                    ) : (
                      <div className="aspect-[4/5] animate-pulse rounded-3xl bg-surface-muted" />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
