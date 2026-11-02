"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { GroupSheet } from "@/components/group-list";
import { ItemCard } from "@/components/item-card";
import { BackLink, ItemGridSkeleton, PageHeader } from "@/components/page-header";
import { useFavoriteToggle, useLaundryToggle } from "@/lib/item-toggles";
import type { Cover } from "@/lib/covers";
import { countLabel } from "@/lib/format";
import { usePhotoUrls } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";
import type { Grouping, Item } from "@/lib/types";

type ListItem = Pick<Item, "id" | "front_path" | "favorite" | "in_laundry_since">;

export function GroupView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const userId = useUser()?.id;
  const router = useRouter();
  const [group, setGroup] = useState<(Grouping & Cover) | null>(null);
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [error, setError] = useState<"rete" | "assente" | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    // Gruppo e capi insieme; i capi filtrati dal collegamento con il gruppo (una richiesta, niente elenchi di id)
    const [groupResult, itemsResult] = await Promise.all([
      supabase.from("groupings").select("id, name, position, cover_item_id, cover_photo_path").eq("id", id).maybeSingle(),
      supabase
        .from("items")
        .select("id, front_path, favorite, in_laundry_since, item_groupings!inner(grouping_id)")
        .eq("item_groupings.grouping_id", id)
        .order("created_at", { ascending: false }),
    ]);
    // Un id non valido (non è un uuid) dà errore 22P02: per l'utente è un gruppo che non esiste
    if (groupResult.error?.code === "22P02" || (!groupResult.error && !groupResult.data)) return setError("assente");
    if (groupResult.error || itemsResult.error) return setError("rete");

    const members: ListItem[] = (itemsResult.data as (ListItem & { item_groupings: unknown })[]).map(
      ({ id, front_path, favorite, in_laundry_since }) => ({ id, front_path, favorite, in_laundry_since }),
    );
    setGroup(groupResult.data as Grouping & Cover);
    setItems(members);
  }, [id]);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati dal database al montaggio
    load();
  }, [userId, load]);

  const urls = usePhotoUrls(items?.map((item) => item.front_path) ?? []);

  const toggleFavorite = useFavoriteToggle(setItems);
  const toggleLaundry = useLaundryToggle(setItems);

  return (
    <>
      <BackLink href="/gruppi" label="Gruppi" />
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
                inLaundry={!!item.in_laundry_since}
                onToggleLaundry={() => toggleLaundry(item)}
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
          onCoverChanged={load}
        />
      )}
    </>
  );
}

export function GroupViewSkeleton() {
  return (
    <>
      <BackLink href="/gruppi" label="Gruppi" />
      <PageHeader title=" " subtitle=" " />
      <ItemGridSkeleton />
    </>
  );
}
