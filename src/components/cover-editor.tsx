"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { SheetButton } from "@/components/bottom-sheet";
import { CropEditor } from "@/components/crop-editor";
import { ChevronRightIcon } from "@/components/icons";
import { setCover, uploadCoverPhoto, type Cover, type CoverTable } from "@/lib/covers";
import type { CropRect } from "@/lib/photo";
import { usePhotoUrls } from "@/lib/photo-urls";
import { getSupabase } from "@/lib/supabase/client";

type CoverItem = { id: string; front_path: string };

export function coverLabel(cover: Cover) {
  return cover.cover_photo_path ? "Foto caricata" : cover.cover_item_id ? "Capo scelto" : "Automatica";
}

/**
 * Copertina di una categoria o di un gruppo, dentro il suo pannello Modifica: automatica (ultimo capo aggiunto),
 * un capo della categoria/del gruppo, oppure una foto dal telefono (solo ritagliata). Ogni scelta si salva subito.
 */
export function CoverEditor({
  table,
  ownerId,
  cover,
  onBack,
  onChanged,
}: {
  table: CoverTable;
  ownerId: string;
  cover: Cover;
  onBack: () => void;
  onChanged: (cover: Cover) => void;
}) {
  const userId = useUser()?.id;
  const [current, setCurrent] = useState(cover);
  const [items, setItems] = useState<CoverItem[] | null>(null);
  const [cropping, setCropping] = useState<{ file: File; url: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = getSupabase();
    const query =
      table === "categories"
        ? supabase.from("items").select("id, front_path").eq("category_id", ownerId)
        : supabase
            .from("items")
            .select("id, front_path, item_groupings!inner(grouping_id)")
            .eq("item_groupings.grouping_id", ownerId);
    query.order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) return setMessage("Impossibile caricare i capi. Controlla la connessione.");
      setItems((data as CoverItem[]).map(({ id, front_path }) => ({ id, front_path })));
    });
  }, [table, ownerId]);

  // La foto scelta per il ritaglio vive finché il ritaglio è aperto
  useEffect(() => {
    if (!cropping) return;
    return () => URL.revokeObjectURL(cropping.url);
  }, [cropping]);

  const previewPath =
    current.cover_photo_path ??
    items?.find((item) => item.id === current.cover_item_id)?.front_path ??
    items?.[0]?.front_path;
  const urls = usePhotoUrls([...(previewPath ? [previewPath] : []), ...(items ?? []).map((item) => item.front_path)]);

  async function apply(next: Cover | (() => Promise<Cover>)) {
    setPending(true);
    setMessage(null);
    try {
      const resolved = typeof next === "function" ? await next() : next;
      await setCover(table, ownerId, current, resolved);
      setCurrent(resolved);
      onChanged(resolved);
    } catch (error) {
      console.warn("Copertina non salvata", error);
      setMessage("Copertina non salvata. Controlla la connessione e riprova.");
    } finally {
      setPending(false);
    }
  }

  function confirmCrop(crop: CropRect) {
    if (!cropping || !userId) return;
    const { file } = cropping;
    setCropping(null);
    apply(async () => ({ cover_item_id: null, cover_photo_path: await uploadCoverPhoto(userId, file, crop) }));
  }

  const automatic = !current.cover_item_id && !current.cover_photo_path;

  return (
    <div className="space-y-5">
      <h2 className="text-[20px] font-semibold">Copertina</h2>

      <div className="mx-auto aspect-[4/5] w-36 overflow-hidden rounded-2xl bg-surface-muted ring-1 ring-line">
        {previewPath && urls[previewPath] && (
          // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
          <img key={previewPath} src={urls[previewPath]} alt="Copertina attuale" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          aria-pressed={automatic}
          onClick={() => apply({ cover_item_id: null, cover_photo_path: null })}
          disabled={pending || automatic}
          className={`h-13 rounded-2xl text-[15px] font-medium ${
            automatic ? "bg-foreground text-background" : "bg-surface ring-1 ring-line"
          }`}
        >
          Automatica
        </button>
        <button
          type="button"
          aria-pressed={!!current.cover_photo_path}
          onClick={() => inputRef.current?.click()}
          disabled={pending || !userId}
          className={`h-13 rounded-2xl text-[15px] font-medium ${
            current.cover_photo_path ? "bg-foreground text-background" : "bg-surface ring-1 ring-line"
          }`}
        >
          {current.cover_photo_path ? "Cambia foto" : "Carica una foto"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) setCropping({ file, url: URL.createObjectURL(file) });
        }}
      />
      <p className="-mt-2 text-[13px] text-muted">Automatica: la foto dell’ultimo capo aggiunto.</p>

      <div>
        <p className="mb-2 text-[15px] font-semibold">Oppure scegli un capo</p>
        {items === null ? (
          <div className="h-28 animate-pulse rounded-2xl bg-surface-muted" />
        ) : items.length === 0 ? (
          <p className="text-[14px] text-muted">Ancora nessun capo qui.</p>
        ) : (
          <ul className="grid grid-cols-4 gap-2">
            {items.map((item) => {
              const selected = current.cover_item_id === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={selected ? "Capo scelto come copertina" : "Usa questo capo come copertina"}
                    onClick={() => apply({ cover_item_id: item.id, cover_photo_path: null })}
                    disabled={pending || selected}
                    className={`block aspect-[3/4] w-full overflow-hidden rounded-xl bg-surface-muted ${
                      selected ? "ring-2 ring-foreground" : ""
                    }`}
                  >
                    {urls[item.front_path] && (
                      // eslint-disable-next-line @next/next/no-img-element -- link firmato di Supabase
                      <img src={urls[item.front_path]} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {message && (
        <p role="alert" className="text-center text-[14px] text-muted">
          {message}
        </p>
      )}
      {pending && (
        <p role="status" className="text-center text-[14px] text-muted">
          Salvataggio…
        </p>
      )}

      <SheetButton onClick={onBack} disabled={pending}>
        Fatto
      </SheetButton>

      {cropping && (
        <CropEditor
          imageUrl={cropping.url}
          label="Copertina"
          title="Ritaglia la copertina"
          hint="Trascina gli angoli per scegliere la parte della foto da mostrare."
          onCancel={() => setCropping(null)}
          onConfirm={confirmCrop}
        />
      )}
    </div>
  );
}

/** Riga "Copertina" nel pannello Modifica di categorie e gruppi: apre CoverEditor. */
export function CoverRow({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-13 w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 text-left ring-1 ring-line disabled:opacity-40"
    >
      <span className="text-[16px] font-medium">Copertina</span>
      <span className="flex items-center gap-1 text-[15px] text-muted">
        {label}
        <ChevronRightIcon width={20} height={20} />
      </span>
    </button>
  );
}
