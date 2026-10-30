"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { PageHeader } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

type CategoryWithCount = Category & { items: { count: number }[] };

function countLabel(count: number) {
  return count === 1 ? "1 capo" : `${count} capi`;
}

export function WardrobeHome() {
  const [categories, setCategories] = useState<CategoryWithCount[] | null>(null);
  const [error, setError] = useState(false);
  const userId = useUser()?.id;

  useEffect(() => {
    if (!userId) return;
    getSupabase()
      .from("categories")
      .select("id, name, role, position, items(count)")
      .order("position")
      .then(({ data, error }) => {
        if (error) setError(true);
        else setCategories(data as CategoryWithCount[]);
      });
  }, [userId]);

  const total = categories?.reduce((sum, category) => sum + (category.items[0]?.count ?? 0), 0);

  return (
    <>
      <PageHeader title="Armadio" subtitle={total === undefined ? " " : countLabel(total)} />
      {error ? (
        <p className="text-[15px] text-muted">Impossibile caricare l’armadio. Controlla la connessione.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {(categories ?? Array.from({ length: 6 }, () => null)).map((category, index) => (
            <li key={category?.id ?? index}>
              <div className="flex aspect-[4/5] flex-col justify-between rounded-3xl bg-surface p-4 ring-1 ring-line">
                <div className="flex flex-1 items-center justify-center rounded-2xl bg-surface-muted" />
                <div className="pt-3">
                  {category ? (
                    <>
                      <p className="text-[15px] leading-tight font-semibold">{category.name}</p>
                      <p className="mt-0.5 text-[13px] text-muted">{countLabel(category.items[0]?.count ?? 0)}</p>
                    </>
                  ) : (
                    <div className="h-9 animate-pulse rounded-lg bg-surface-muted" />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
