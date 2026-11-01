"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { BottomSheet, SheetButton } from "@/components/bottom-sheet";
import { PlusIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { countLabel } from "@/components/wardrobe-home";
import { usePhotoUrls } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";
import type { Grouping } from "@/lib/types";

type GroupSummary = Grouping & { count: number; cover: string | null };

export function GroupList() {
  const userId = useUser()?.id;
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [groupsResult, linksResult, itemsResult] = await Promise.all([
      supabase.from("groupings").select("id, name, position").order("position").order("name"),
      supabase.from("item_groupings").select("grouping_id, item_id"),
      supabase.from("items").select("id, front_path").order("created_at", { ascending: false }),
    ]);
    if (groupsResult.error || linksResult.error || itemsResult.error) return setError(true);

    // Dal capo più recente: il primo trovato in un gruppo ne è la copertina
    const order = new Map((itemsResult.data as { id: string; front_path: string }[]).map((item, i) => [item.id, { i, ...item }]));
    const summaries = (groupsResult.data as Grouping[]).map((group) => {
      const members = (linksResult.data as { grouping_id: string; item_id: string }[])
        .filter((link) => link.grouping_id === group.id)
        .map((link) => order.get(link.item_id))
        .filter((item) => !!item)
        .sort((a, b) => a.i - b.i);
      return { ...group, count: members.length, cover: members[0]?.front_path ?? null };
    });
    setGroups(summaries);
  }, []);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- caricamento dati dal database al montaggio
    load();
  }, [userId, load]);

  const urls = usePhotoUrls(groups?.flatMap((group) => (group.cover ? [group.cover] : [])) ?? []);

  return (
    <>
      <PageHeader title="Gruppi" subtitle="Estiva, sportiva, tutto nero…" />

      {error ? (
        <p className="text-[15px] text-muted">Impossibile caricare i gruppi. Controlla la connessione.</p>
      ) : (
        <div className="space-y-4 pb-6">
          {groups?.length === 0 && (
            <p className="rounded-3xl border border-dashed border-line px-6 py-10 text-center text-[15px] leading-relaxed text-muted">
              Ancora nessun gruppo. Creane uno qui sotto, oppure mentre aggiungi o modifichi un capo. Un capo può stare in
              più gruppi.
            </p>
          )}

          <ul className="grid grid-cols-2 gap-3">
            {(groups ?? Array.from({ length: 4 }, () => null)).map((group, index) => (
              <li key={group?.id ?? index}>
                {group ? (
                  <Link
                    href={`/gruppi/${group.id}`}
                    className="flex aspect-[4/5] flex-col rounded-3xl bg-surface p-3 ring-1 ring-line transition-transform active:scale-[0.98]"
                  >
                    <div className="flex-1 overflow-hidden rounded-2xl bg-surface-muted">
                      {group.cover && urls[group.cover] && (
                        // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                        <img
                          src={urls[group.cover]}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="px-1 pt-2.5">
                      <p className="truncate text-[15px] leading-tight font-semibold">{group.name}</p>
                      <p className="mt-0.5 text-[13px] text-muted">{countLabel(group.count)}</p>
                    </div>
                  </Link>
                ) : (
                  <div className="aspect-[4/5] animate-pulse rounded-3xl bg-surface-muted" />
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={!groups}
            className="flex h-13 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line text-[16px] font-medium"
          >
            <PlusIcon width={20} height={20} />
            Nuovo gruppo
          </button>
        </div>
      )}

      {creating && groups && (
        <GroupSheet
          group={null}
          position={groups.length}
          onClose={() => setCreating(false)}
          onDone={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
    </>
  );
}

/** Crea un gruppo, oppure rinomina/elimina quello indicato. Eliminare un gruppo non tocca i capi. */
export function GroupSheet({
  group,
  position = 0,
  onClose,
  onDone,
}: {
  group: Grouping | null;
  position?: number;
  onClose: () => void;
  onDone: (result: "salvato" | "eliminato") => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setMessage(null);
    const supabase = getSupabase();
    const { error } = group
      ? await supabase.from("groupings").update({ name: trimmed }).eq("id", group.id)
      : await supabase.from("groupings").insert({ name: trimmed, position });
    setPending(false);
    if (!error) return onDone("salvato");
    setMessage(
      error.code === "23505"
        ? "Esiste già un gruppo con questo nome."
        : "Gruppo non salvato. Controlla la connessione e riprova.",
    );
  }

  async function remove() {
    if (!group || !window.confirm(`Eliminare il gruppo “${group.name}”? I capi restano nell’armadio.`)) return;
    setPending(true);
    setMessage(null);
    // I collegamenti capo–gruppo spariscono a cascata; i capi no
    const { error } = await getSupabase().from("groupings").delete().eq("id", group.id);
    setPending(false);
    if (!error) return onDone("eliminato");
    setMessage("Gruppo non eliminato. Controlla la connessione e riprova.");
  }

  return (
    <BottomSheet label={group ? `Modifica ${group.name}` : "Nuovo gruppo"} onClose={onClose}>
      <div className="space-y-6">
        <h2 className="text-[20px] font-semibold">{group ? "Modifica gruppo" : "Nuovo gruppo"}</h2>

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-muted">Nome</span>
          <input
            type="text"
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="es. estiva"
            className="h-13 w-full rounded-2xl bg-surface px-4 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-foreground"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <SheetButton onClick={onClose} disabled={pending}>
            Annulla
          </SheetButton>
          <SheetButton
            onClick={save}
            disabled={pending || !name.trim() || name.trim() === group?.name}
            primary
          >
            {pending ? "Salvataggio…" : group ? "Salva" : "Crea"}
          </SheetButton>
        </div>

        {group && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="h-11 w-full text-[15px] font-medium text-muted disabled:opacity-40"
          >
            Elimina gruppo
          </button>
        )}
      </div>

      {message && (
        <p role="alert" className="mt-4 text-center text-[14px] text-muted">
          {message}
        </p>
      )}
    </BottomSheet>
  );
}
