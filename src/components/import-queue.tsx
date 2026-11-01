"use client";

import { useEffect, useRef, useState } from "react";
import { BackLink, PageHeader } from "@/components/page-header";
import { makeThumbnail } from "@/lib/photo-pipeline";

/** Foto per import: oltre, la memoria del telefono non basta a tenere in coda gli scontornati. */
export const MAX_IMPORT_PHOTOS = 30;

type Mode = "coppie" | "fronte";

type GalleryPhoto = { id: number; file: File; thumbUrl?: string };

/** Un capo della coda: fronte obbligatoria, retro facoltativo. */
type Card = { front: GalleryPhoto; back?: GalleryPhoto };

/** 1ª fronte, 2ª retro, 3ª fronte del capo successivo… oppure una foto per capo. */
function pair(photos: GalleryPhoto[], mode: Mode): Card[] {
  if (mode === "fronte") return photos.map((front) => ({ front }));
  const cards: Card[] = [];
  for (let i = 0; i < photos.length; i += 2) cards.push({ front: photos[i], back: photos[i + 1] });
  return cards;
}

export function ImportQueue() {
  const [mode, setMode] = useState<Mode>("coppie");
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [skipped, setSkipped] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const generation = useRef(0);

  useEffect(() => {
    const created = urls.current;
    return () => created.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function clear() {
    generation.current++;
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.clear();
    setPhotos([]);
    setSkipped(0);
  }

  async function choose(files: File[]) {
    clear();
    const current = generation.current;
    const accepted = files.slice(0, MAX_IMPORT_PHOTOS);
    setSkipped(files.length - accepted.length);
    setPhotos(accepted.map((file, id) => ({ id, file })));

    // Miniature una alla volta, nell'ordine ricevuto
    for (const [id, file] of accepted.entries()) {
      try {
        const thumb = await makeThumbnail(file);
        if (generation.current !== current) return;
        const thumbUrl = URL.createObjectURL(thumb);
        urls.current.add(thumbUrl);
        setPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, thumbUrl } : photo)));
      } catch (error) {
        console.warn("Miniatura non creata", error);
      }
    }
  }

  const cards = pair(photos, mode);

  return (
    <>
      <BackLink href="/aggiungi" label="Aggiungi" />
      <PageHeader title="Importa" subtitle={`Fino a ${MAX_IMPORT_PHOTOS} foto dalla galleria`} />

      <div className="space-y-6 pb-6">
        <div role="radiogroup" aria-label="Come accoppiare le foto" className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1">
          {(
            [
              ["coppie", "Fronte e retro"],
              ["fronte", "Solo fronte"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`h-11 rounded-xl text-[15px] font-medium transition-colors ${
                mode === value ? "bg-surface text-foreground shadow-sm" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="-mt-3 px-1 text-[14px] leading-relaxed text-muted">
          {mode === "coppie"
            ? "Seleziona le foto in quest’ordine: fronte del 1º capo, retro del 1º, fronte del 2º, retro del 2º…"
            : "Ogni foto diventa un capo."}
        </p>

        {photos.length > 0 && (
          <p role="status" className="rounded-3xl bg-foreground px-5 py-4 text-[15px] leading-relaxed text-background">
            Non chiudere l’app e non cambiare app finché l’import non è finito.
          </p>
        )}

        {skipped > 0 && (
          <p role="alert" className="rounded-3xl bg-surface-muted px-5 py-4 text-[15px] leading-relaxed">
            Hai scelto {photos.length + skipped} foto: importo le prime {MAX_IMPORT_PHOTOS}. Le altre {skipped} puoi
            importarle dopo, con un nuovo import.
          </p>
        )}

        <button
          type="button"
          onClick={() => (photos.length ? clear() : inputRef.current?.click())}
          className={`h-13 w-full rounded-2xl text-[16px] font-semibold ${
            photos.length ? "bg-surface-muted text-foreground" : "bg-foreground text-background"
          }`}
        >
          {photos.length ? "Ricomincia" : "Scegli le foto"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) choose(files);
          }}
        />

        {cards.length > 0 && (
          <ul className="space-y-3">
            {cards.map((card, index) => (
              <li key={card.front.id} className="rounded-3xl bg-surface p-3 ring-1 ring-line">
                <p className="mb-2 px-1 text-[15px] font-semibold">Capo {index + 1}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Thumb photo={card.front} label="Fronte" />
                  {card.back ? (
                    <Thumb photo={card.back} label="Retro" />
                  ) : (
                    mode === "coppie" && (
                      <div className="flex aspect-[3/4] items-center justify-center rounded-2xl border border-dashed border-line px-3 text-center text-[13px] text-muted">
                        Senza retro
                      </div>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {photos.length > 0 && <OrderCheck photos={photos} />}
      </div>
    </>
  );
}

function Thumb({ photo, label }: { photo: GalleryPhoto; label: string }) {
  return (
    <figure>
      <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-surface-muted">
        {photo.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura locale (blob:)
          <img src={photo.thumbUrl} alt={`${label}, foto ${photo.id + 1}`} className="h-full w-full object-cover" />
        )}
      </div>
      <figcaption className="mt-1.5 px-1 text-[13px] text-muted">
        {label} · foto {photo.id + 1}
      </figcaption>
    </figure>
  );
}

/** Temporaneo (Fase 4, pezzo 1): ordine in cui Safari consegna le foto, per verificare l'accoppiamento. */
function OrderCheck({ photos }: { photos: GalleryPhoto[] }) {
  return (
    <details className="rounded-3xl bg-surface-muted px-5 py-4 text-[13px]">
      <summary className="text-[15px] font-medium">Verifica dell’ordine</summary>
      <ol className="mt-3 space-y-1.5">
        {photos.map((photo) => (
          <li key={photo.id} className="flex gap-3">
            <span className="w-6 shrink-0 text-right text-muted">{photo.id + 1}.</span>
            <span className="min-w-0 flex-1 truncate">{photo.file.name}</span>
            <span className="shrink-0 text-muted">
              {new Date(photo.file.lastModified).toLocaleString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
