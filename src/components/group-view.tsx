"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { GroupSheet } from "@/components/group-list";
import { ChevronLeftIcon } from "@/components/icons";
import { ItemCard } from "@/components/item-card";
import { PageHeader } from "@/components/page-header";
import { countLabel } from "@/components/wardrobe-home";
import { setFavorite } from "@/lib/items";
import { usePhotoUrls } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";
import type { Grouping, Item } from "@/lib/types";

type ListItem = Pick<Item, "id" | "front_path" | "favorite">;

export function GroupView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const userId = useUser()?.id;
  const router = useRouter();
  const [group, setGroup] = useState<Grouping | null>(null);
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [error, setError] = useState<"rete" | "assente" | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [groupResult, linksResult] = await Promise.all([
      supabase.from("groupings").select("id, name, position").eq("id", id).maybeSingle(),
      supabase.from("item_groupings").select("item_id").eq("grouping_id", id),
    ]);
    // Un id non valido (non è un uuid) dà errore 22P02: per l'utente è un gruppo che non esiste
    if (groupResult.error?.code === "22P02" || (!groupResult.error && !groupResult.data)) return setError("assente");
    if (groupResult.error || linksResult.error) return setError("rete");

    const ids = (linksResult.data as { item_id: string }[]).map((link) => link.item_id);
    let members: ListItem[] = [];
    if (ids.length) {
      const { data, error } = await supabase
        .from("items")
        .select("id, front_path, favorite")
        .in("id", ids)
        .order("created_at", { ascending: false });
      if (error) return setError("rete");
      members = data as ListItem[];
    }
    setGroup(groupResult.data as Grouping);
    setItems(members);
  }, [id]);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati dal database al montaggio
    load();
  }, [userId, load]);

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
      <BackToGroups />
      <PageHeader
        title={group?.name ?? " "}
        subtitle={items ? countLabel(items.length) : " "}
        action={
          group && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex h-11 items-center px-1 text-[15px] font-medium text-muted"
            >
              Modifica
            </button>
          )
        }
      />

      {error === "assente" && <p className="text-[15px] text-muted">Questo gruppo non esiste più.</p>}
      {error === "rete" && <p className="text-[15px] text-muted">Impossibile caricare i capi. Controlla la connessione.</p>}

      {items?.length === 0 && (
        <p className="rounded-3xl border border-dashed border-line px-6 py-10 text-center text-[15px] leading-relaxed text-muted">
          Nessun capo in questo gruppo. Per aggiungerne uno, apri il capo e scegli “Modifica”.
        </p>
      )}

      {!error && items !== null && items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 pb-6">
          {items.map((item) => (
            <li key={item.id}>
              <ItemCard
                href={`/capo/${item.id}`}
                label={group?.name ?? "Capo"}
                photoUrl={urls[item.front_path]}
                favorite={item.favorite}
                onToggleFavorite={() => toggleFavorite(item)}
              />
            </li>
          ))}
        </ul>
      )}

      {!error && items === null && <ItemGridSkeleton />}

      {editing && group && (
        <GroupSheet
          group={group}
          onClose={() => setEditing(false)}
          onDone={async (result) => {
            setEditing(false);
            if (result === "eliminato") return router.replace("/gruppi");
            await load();
          }}
        />
      )}
    </>
  );
}

export function GroupViewSkeleton() {
  return (
    <>
      <BackToGroups />
      <PageHeader title=" " subtitle=" " />
      <ItemGridSkeleton />
    </>
  );
}

function BackToGroups() {
  return (
    <Link href="/gruppi" className="-ml-2 inline-flex h-11 items-center gap-0.5 pr-3 text-[15px] text-muted">
      <ChevronLeftIcon width={22} height={22} />
      Gruppi
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
