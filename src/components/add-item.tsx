"use client";

import { useEffect, useRef, useState } from "react";
import { CropEditor } from "@/components/crop-editor";
import { EraserEditor } from "@/components/eraser-editor";
import { PlusIcon } from "@/components/icons";
import { removeBackground, type RemovalEvent } from "@/lib/background-removal";
import { cleanCutout } from "@/lib/cutout-cleanup";
import { canvasToBlob, downscale, type CropRect } from "@/lib/photo";

type Side = "fronte" | "retro";

const LABELS: Record<Side, string> = { fronte: "Fronte", retro: "Retro" };

/** Foto scelta e riquadro attorno al capo: bastano per rifare lo scontorno (Riprova, Ritaglia). */
type Source = { file: File; originalUrl: string; crop: CropRect };

type Photo =
  | { status: "vuota" }
  | ({ status: "in coda" | "elaborazione"; progress?: string } & Source)
  | ({ status: "pronta"; cutout: Blob; cutoutUrl: string; erased?: boolean } & Source)
  | ({ status: "errore"; message: string } & Source);

/** Foto aperta nell'editor di ritaglio; `crop` c'è quando si ritaglia di nuovo una foto già scontornata. */
type Cropping = { side: Side; file: File; originalUrl: string; crop?: CropRect };

const EMPTY: Photo = { status: "vuota" };

export function AddItem() {
  const [photos, setPhotos] = useState<Record<Side, Photo>>({ fronte: EMPTY, retro: EMPTY });
  const [cropping, setCropping] = useState<Cropping | null>(null);
  const [erasing, setErasing] = useState<Side | null>(null);
  // Le foto vengono scontornate una alla volta, nell'ordine in cui sono state confermate.
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

  function revoke(url: string | undefined) {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  }

  /** Libera gli URL di una foto, tranne `keep` (la foto originale riusata quando si ritaglia di nuovo). */
  function release(photo: Photo, keep?: string) {
    if (photo.status === "vuota") return;
    if (photo.originalUrl !== keep) revoke(photo.originalUrl);
    if (photo.status === "pronta") revoke(photo.cutoutUrl);
  }

  function update(side: Side, version: number, photo: Photo) {
    if (versions.current[side] !== version) return;
    setPhotos((prev) => ({ ...prev, [side]: photo }));
  }

  function openCrop(side: Side, file: File) {
    setCropping({ side, file, originalUrl: objectUrl(file) });
  }

  function recrop(side: Side) {
    const photo = photos[side];
    if (photo.status === "vuota") return;
    // Ritagliare rifà lo scontorno da capo: i ritocchi con la gomma andrebbero persi
    if (
      photo.status === "pronta" &&
      photo.erased &&
      !window.confirm("Ritagliando di nuovo, lo scontorno viene rifatto e i ritocchi con la gomma andranno persi. Continuare?")
    )
      return;
    setCropping({ side, file: photo.file, originalUrl: photo.originalUrl, crop: photo.crop });
  }

  function cancelCrop() {
    // Una foto nuova annullata non serve più; una già in uso resta com'era.
    if (cropping && !cropping.crop) revoke(cropping.originalUrl);
    setCropping(null);
  }

  function confirmCrop(crop: CropRect) {
    if (!cropping) return;
    const { side, file, originalUrl } = cropping;
    release(photos[side], originalUrl);
    setCropping(null);
    process(side, { file, originalUrl, crop });
  }

  function process(side: Side, source: Source) {
    const version = ++versions.current[side];
    setPhotos((prev) => ({ ...prev, [side]: { status: "in coda", ...source } }));

    queue.current = queue.current.then(async () => {
      if (versions.current[side] !== version) return;
      update(side, version, { status: "elaborazione", ...source });
      try {
        const photo = await downscale(source.file, source.crop);
        const result = await removeBackground(photo, undefined, (event) => {
          const progress = progressText(event);
          if (progress) update(side, version, { status: "elaborazione", progress, ...source });
        });
        cleanCutout(result);
        const cutout = await canvasToBlob(result);
        if (versions.current[side] !== version) return;
        update(side, version, { status: "pronta", cutout, cutoutUrl: objectUrl(cutout), ...source });
      } catch (error) {
        console.warn("Scontorno non riuscito", error);
        update(side, version, {
          status: "errore",
          message: "Lo scontorno non è riuscito. Riprova o scegli un'altra foto.",
          ...source,
        });
      }
    });
  }

  /** Sostituisce lo scontornato con la versione ritoccata con la gomma. */
  function confirmErase(side: Side, cutout: Blob) {
    setErasing(null);
    const photo = photos[side];
    if (photo.status !== "pronta") return;
    revoke(photo.cutoutUrl);
    setPhotos((prev) => ({ ...prev, [side]: { ...photo, cutout, cutoutUrl: objectUrl(cutout), erased: true } }));
  }

  function retry(side: Side) {
    const photo = photos[side];
    if (photo.status !== "errore") return;
    const { file, originalUrl, crop } = photo;
    process(side, { file, originalUrl, crop });
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
        {(["fronte", "retro"] as const).map((side) => (
          <PhotoSlot
            key={side}
            label={LABELS[side]}
            hint={side === "fronte" ? "Obbligatoria" : "Facoltativa"}
            photo={photos[side]}
            onChoose={(file) => openCrop(side, file)}
            onRecrop={() => recrop(side)}
            onErase={() => setErasing(side)}
            onRetry={() => retry(side)}
            onRemove={() => remove(side)}
          />
        ))}
      </div>

      {cropping && (
        <CropEditor
          key={cropping.originalUrl}
          imageUrl={cropping.originalUrl}
          label={LABELS[cropping.side]}
          initialCrop={cropping.crop}
          onCancel={cancelCrop}
          onConfirm={confirmCrop}
        />
      )}

      {erasing && photos[erasing].status === "pronta" && (
        <EraserEditor
          image={photos[erasing].cutout}
          label={LABELS[erasing]}
          onCancel={() => setErasing(null)}
          onConfirm={(cutout) => confirmErase(erasing, cutout)}
        />
      )}
    </div>
  );
}

function PhotoSlot({
  label,
  hint,
  photo,
  onChoose,
  onRecrop,
  onErase,
  onRetry,
  onRemove,
}: {
  label: string;
  hint: string;
  photo: Photo;
  onChoose: (file: File) => void;
  onRecrop: () => void;
  onErase: () => void;
  onRetry: () => void;
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

      <p className="mt-2 px-1">
        <span className="block text-[15px] font-medium">{label}</span>
        <span className="block text-[12px] text-muted">{hint}</span>
      </p>

      {photo.status === "errore" && <p className="mt-1 px-1 text-[13px] leading-snug text-muted">{photo.message}</p>}

      {(photo.status === "pronta" || photo.status === "errore") && (
        <div className="mt-1 grid grid-cols-2">
          {photo.status === "pronta" ? (
            <>
              <SlotButton onClick={onRecrop}>Ritaglia</SlotButton>
              <SlotButton onClick={onErase}>Gomma</SlotButton>
            </>
          ) : (
            <SlotButton onClick={onRetry}>Riprova</SlotButton>
          )}
          <SlotButton onClick={onRemove} muted>
            Togli
          </SlotButton>
        </div>
      )}
    </div>
  );
}

function SlotButton({ onClick, muted, children }: { onClick: () => void; muted?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 text-[14px] font-medium ${muted ? "text-muted" : "text-foreground"}`}
    >
      {children}
    </button>
  );
}

function progressText(event: RemovalEvent) {
  if (event.phase === "download" && event.type === "progress") return `Primo avvio: scarico il modello\n${event.detail}`;
  if (event.phase === "caricamento" && event.type === "start") return "Preparo il modello…";
  if (event.phase === "scontorno" && event.type === "start") return "Scontorno…";
  return undefined;
}
