"use client";

import { useEffect, useRef, useState } from "react";
import { PlusIcon } from "@/components/icons";
import { removeBackground, type RemovalEvent } from "@/lib/background-removal";
import { cleanCutout } from "@/lib/cutout-cleanup";
import { canvasToBlob, downscale } from "@/lib/photo";

type Side = "fronte" | "retro";

type Photo =
  | { status: "vuota" }
  | { status: "in coda" | "elaborazione"; originalUrl: string; progress?: string }
  | { status: "pronta"; originalUrl: string; cutout: Blob; cutoutUrl: string }
  | { status: "errore"; originalUrl: string; file: File; message: string };

const EMPTY: Photo = { status: "vuota" };

export function AddItem() {
  const [photos, setPhotos] = useState<Record<Side, Photo>>({ fronte: EMPTY, retro: EMPTY });
  // Le foto vengono scontornate una alla volta, nell'ordine in cui sono state scelte.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Versione di ogni lato: se la foto viene cambiata o tolta, il risultato vecchio viene scartato.
  const versions = useRef<Record<Side, number>>({ fronte: 0, retro: 0 });
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const created = urls.current;
    return () => created.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function objectUrl(blob: Blob) {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }

  function release(photo: Photo) {
    for (const url of [
      "originalUrl" in photo ? photo.originalUrl : null,
      "cutoutUrl" in photo ? photo.cutoutUrl : null,
    ]) {
      if (url) {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }
    }
  }

  function update(side: Side, version: number, photo: Photo) {
    if (versions.current[side] !== version) return;
    setPhotos((prev) => ({ ...prev, [side]: photo }));
  }

  function choose(side: Side, file: File) {
    const version = ++versions.current[side];
    release(photos[side]);
    const originalUrl = objectUrl(file);
    setPhotos((prev) => ({ ...prev, [side]: { status: "in coda", originalUrl } }));

    queue.current = queue.current.then(async () => {
      if (versions.current[side] !== version) return;
      update(side, version, { status: "elaborazione", originalUrl });
      try {
        const photo = await downscale(file);
        const result = await removeBackground(photo, undefined, (event) => {
          const progress = progressText(event);
          if (progress) update(side, version, { status: "elaborazione", originalUrl, progress });
        });
        cleanCutout(result);
        const cutout = await canvasToBlob(result);
        if (versions.current[side] !== version) return;
        update(side, version, { status: "pronta", originalUrl, cutout, cutoutUrl: objectUrl(cutout) });
      } catch (error) {
        console.warn("Scontorno non riuscito", error);
        update(side, version, {
          status: "errore",
          originalUrl,
          file,
          message: "Lo scontorno non è riuscito. Riprova o scegli un'altra foto.",
        });
      }
    });
  }

  function remove(side: Side) {
    versions.current[side]++;
    release(photos[side]);
    setPhotos((prev) => ({ ...prev, [side]: EMPTY }));
  }

  return (
    <div className="space-y-6 pb-6">
      <p className="rounded-3xl bg-surface-muted px-5 py-4 text-[15px] leading-relaxed">
        <span className="font-medium">Consiglio:</span> stendi il capo sul letto o su una superficie con un lenzuolo
        liscio di un solo colore, diverso dal capo. Tutto il capo deve stare nella foto.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <PhotoSlot
          label="Fronte"
          hint="Obbligatoria"
          photo={photos.fronte}
          onChoose={(file) => choose("fronte", file)}
          onRemove={() => remove("fronte")}
        />
        <PhotoSlot
          label="Retro"
          hint="Facoltativa"
          photo={photos.retro}
          onChoose={(file) => choose("retro", file)}
          onRemove={() => remove("retro")}
        />
      </div>
    </div>
  );
}

function PhotoSlot({
  label,
  hint,
  photo,
  onChoose,
  onRemove,
}: {
  label: string;
  hint: string;
  photo: Photo;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const working = photo.status === "in coda" || photo.status === "elaborazione";

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={working}
        aria-label={photo.status === "vuota" ? `Aggiungi foto ${label.toLowerCase()}` : `Cambia foto ${label.toLowerCase()}`}
        className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-3xl ${
          photo.status === "vuota" ? "border border-dashed border-line" : "bg-surface-muted"
        }`}
      >
        {photo.status === "vuota" && (
          <span className="flex flex-col items-center gap-2 text-muted">
            <PlusIcon width={28} height={28} />
            <span className="text-[13px] font-medium">Scatta o scegli</span>
          </span>
        )}

        {photo.status === "pronta" && (
          // eslint-disable-next-line @next/next/no-img-element -- immagine locale (blob:), non ottimizzabile da next/image
          <img src={photo.cutoutUrl} alt={`${label} scontornato`} className="h-full w-full object-contain p-3" />
        )}

        {(working || photo.status === "errore") && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- immagine locale (blob:) */}
            <img src={photo.originalUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
            <span className="relative px-3 text-center text-[13px] leading-snug font-medium whitespace-pre-line">
              {photo.status === "errore"
                ? "Non riuscito"
                : photo.status === "in coda"
                  ? "In attesa…"
                  : (photo.progress ?? "Scontorno…")}
            </span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onChoose(file);
        }}
      />

      <div className="mt-2 flex min-h-11 items-center justify-between gap-2 px-1">
        <span>
          <span className="block text-[15px] font-medium">{label}</span>
          <span className="block text-[12px] text-muted">{hint}</span>
        </span>
        {photo.status === "errore" ? (
          <button type="button" onClick={() => onChoose(photo.file)} className="h-11 px-2 text-[14px] font-medium">
            Riprova
          </button>
        ) : (
          photo.status !== "vuota" &&
          !working && (
            <button type="button" onClick={onRemove} className="h-11 px-2 text-[14px] text-muted">
              Togli
            </button>
          )
        )}
      </div>

      {photo.status === "errore" && <p className="px-1 text-[13px] leading-snug text-muted">{photo.message}</p>}
    </div>
  );
}

function progressText(event: RemovalEvent) {
  if (event.phase === "download" && event.type === "progress") return `Primo avvio: scarico il modello\n${event.detail}`;
  if (event.phase === "caricamento" && event.type === "start") return "Preparo il modello…";
  if (event.phase === "scontorno" && event.type === "start") return "Scontorno…";
  return undefined;
}
