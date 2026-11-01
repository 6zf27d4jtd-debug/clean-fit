"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { ChevronLeftIcon } from "@/components/icons";
import { ItemCard } from "@/components/item-card";
import { PageHeader } from "@/components/page-header";
import { countLabel } from "@/components/wardrobe-home";
import { setFavorite } from "@/lib/items";
import { usePhotoUrls } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";
import type { Category, Item } from "@/lib/types";

type ListItem = Pick<Item, "id" | "front_path" | "favorite">;

export function CategoryView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const userId = useUser()?.id;
  const [category, setCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [error, setError] = useState<"rete" | "assente" | null>(null);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    Promise.all([
      supabase.from("categories").select("id, name, role, position").eq("id", id).maybeSingle(),
      supabase
        .from("items")
        .select("id, front_path, favorite")
        .eq("category_id", id)
        .order("created_at", { ascending: false }),
    ]).then(([categoryResult, itemsResult]) => {
      // Un id non valido (non è un uuid) dà errore 22P02: per l'utente è una categoria che non esiste
      if (categoryResult.error?.code === "22P02" || (!categoryResult.error && !categoryResult.data)) {
        return setError("assente");
      }
      if (categoryResult.error || itemsResult.error) return setError("rete");
      setCategory(categoryResult.data as Category);
      setItems(itemsResult.data as ListItem[]);
    });
  }, [id, userId]);

  const urls = usePhotoUrls(items?.map((item) => item.front_path) ?? []);

  async function toggleFavorite(item: ListItem) {
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
      <BackToWardrobe />
      <PageHeader title={category?.name ?? " "} subtitle={items ? countLabel(items.length) : " "} />

      {error === "assente" && <p className="text-[15px] text-muted">Questa categoria non esiste più.</p>}
      {error === "rete" && <p className="text-[15px] text-muted">Impossibile caricare i capi. Controlla la connessione.</p>}

      {items?.length === 0 && (
        <div className="rounded-3xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-[15px] text-muted">Ancora nessun capo in questa categoria.</p>
          <Link href="/aggiungi" className="mt-3 inline-flex h-11 items-center text-[15px] font-medium underline underline-offset-4">
            Aggiungi un capo
          </Link>
        </div>
      )}

      {!error && items !== null && items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 pb-6">
          {items.map((item) => (
            <li key={item.id}>
              <ItemCard
                href={`/capo/${item.id}`}
                label={category?.name ?? "Capo"}
                photoUrl={urls[item.front_path]}
                favorite={item.favorite}
                onToggleFavorite={() => toggleFavorite(item)}
              />
            </li>
          ))}
        </ul>
      )}

      {!error && items === null && <ItemGridSkeleton />}
    </>
  );
}

export function CategoryViewSkeleton() {
  return (
    <>
      <BackToWardrobe />
      <PageHeader title=" " subtitle=" " />
      <ItemGridSkeleton />
    </>
  );
}

function BackToWardrobe() {
  return (
    <Link href="/" className="-ml-2 inline-flex h-11 items-center gap-0.5 pr-3 text-[15px] text-muted">
      <ChevronLeftIcon width={22} height={22} />
      Armadio
    </Link>
  );
}

function ItemGridSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-surface-muted" />
      ))}
    </ul>
  );
}
