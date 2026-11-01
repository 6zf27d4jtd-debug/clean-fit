"use client";

import { useEffect, useRef, useState } from "react";
import { CropEditor } from "@/components/crop-editor";
import { EraserEditor } from "@/components/eraser-editor";
import { BackLink, PageHeader } from "@/components/page-header";
import { FULL_CROP, type CropRect } from "@/lib/photo";
import {
  finishCutout,
  makeThumbnail,
  processPhoto,
} from "@/lib/photo-pipeline";

/** Foto per import: oltre, la memoria del telefono non basta a tenere in coda gli scontornati. */
export const MAX_IMPORT_PHOTOS = 30;

type Mode = "coppie" | "fronte";

/** index: posizione nella selezione (1, 2, 3…), mostrata all'utente per ritrovare la foto. */
type Base = {
  id: number;
  index: number;
  file: File;
  thumbUrl?: string;
  crop: CropRect;
};

type Status =
  | { status: "in coda" | "elaborazione"; progress?: string }
  // cutout: scontornato trasparente (PNG), base per la gomma; final: foto ritoccata e compressa (JPEG), da salvare
  | {
      status: "pronta";
      cutout: Blob;
      final: Blob;
      finalUrl: string;
      erased?: boolean;
    }
  | { status: "errore" };

type ImportPhoto = Base & Status;

/** Un capo della coda: fronte obbligatoria, retro facoltativo (id delle foto). */
type Card = { id: number; front: number; back?: number };

/** Foto aperta in un editor a tutto schermo. */
type Editing =
  | { kind: "ritaglio"; photoId: number; originalUrl: string; label: string }
  | { kind: "gomma"; photoId: number; label: string };

export function ImportQueue() {
  const [mode, setMode] = useState<Mode>("coppie");
  const [photos, setPhotos] = useState<ImportPhoto[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const nextId = useRef(0);
  // Le foto vengono scontornate una alla volta, nell'ordine di selezione.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Versione di ogni foto: se viene tolta o rielaborata, il risultato vecchio viene scartato.
  const versions = useRef(new Map<number, number>());
  // L'utente ha corretto le coppie a mano: cambiare modalità le rifarebbe da capo.
  const edited = useRef(false);

  useEffect(() => {
    const created = urls.current;
    const running = versions.current;
    return () => {
      // Lasciando la pagina le foto ancora in coda non vengono più elaborate
      running.clear();
      created.forEach((url) => URL.revokeObjectURL(url));
    };
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

  /** 1ª fronte, 2ª retro, 3ª fronte del capo successivo… oppure una foto per capo. */
  function pair(list: Base[], pairing: Mode): Card[] {
    const cards: Card[] = [];
    const step = pairing === "coppie" ? 2 : 1;
    for (let i = 0; i < list.length; i += step) {
      cards.push({
        id: nextId.current++,
        front: list[i].id,
        back: step === 2 ? list[i + 1]?.id : undefined,
      });
    }
    return cards;
  }

  /** Aggiorna lo stato di una foto, se nel frattempo non è stata tolta o rielaborata. */
  function setStatus(
    id: number,
    version: number,
    status: Status,
    crop?: CropRect,
  ) {
    if (versions.current.get(id) !== version) return false;
    setPhotos((prev) =>
      prev.map((photo) =>
        photo.id === id
          ? {
              id,
              index: photo.index,
              file: photo.file,
              thumbUrl: photo.thumbUrl,
              crop: crop ?? photo.crop,
              ...status,
            }
          : photo,
      ),
    );
    return true;
  }

  function process(photo: Base) {
    const { id, file, crop } = photo;
    const version = (versions.current.get(id) ?? 0) + 1;
    versions.current.set(id, version);
    setStatus(id, version, { status: "in coda" }, crop);

    queue.current = queue.current.then(async () => {
      if (versions.current.get(id) !== version) return;
      setStatus(id, version, { status: "elaborazione" });
      try {
        const { cutout, final } = await processPhoto(file, crop, (progress) =>
          setStatus(id, version, { status: "elaborazione", progress }),
        );
        if (versions.current.get(id) !== version) return;
        const finalUrl = objectUrl(final);
        if (
          !setStatus(id, version, { status: "pronta", cutout, final, finalUrl })
        )
          revoke(finalUrl);
      } catch (error) {
        console.warn("Scontorno non riuscito", error);
        setStatus(id, version, { status: "errore" });
      }
    });
  }

  function releasePhoto(photo: ImportPhoto) {
    versions.current.delete(photo.id);
    revoke(photo.thumbUrl);
    if (photo.status === "pronta") revoke(photo.finalUrl);
  }

  function clear() {
    photos.forEach(releasePhoto);
    edited.current = false;
    setPhotos([]);
    setCards([]);
    setSkipped(0);
  }

  async function choose(files: File[]) {
    clear();
    const accepted = files.slice(0, MAX_IMPORT_PHOTOS);
    const list: Base[] = accepted.map((file, i) => ({
      id: nextId.current++,
      index: i + 1,
      file,
      crop: FULL_CROP,
    }));
    setSkipped(files.length - accepted.length);
    setPhotos(list.map((photo) => ({ ...photo, status: "in coda" })));
    setCards(pair(list, mode));
    list.forEach(process);

    // Miniature una alla volta, mentre lo scontorno procede
    for (const photo of list) {
      try {
        const thumbUrl = objectUrl(await makeThumbnail(photo.file));
        if (!versions.current.has(photo.id)) {
          revoke(thumbUrl);
          continue;
        }
        setPhotos((prev) =>
          prev.map((item) =>
            item.id === photo.id ? { ...item, thumbUrl } : item,
          ),
        );
      } catch (error) {
        console.warn("Miniatura non creata", error);
      }
    }
  }

  function changeMode(next: Mode) {
    if (next === mode) return;
    if (
      edited.current &&
      !window.confirm(
        "Cambiando modalità le foto vengono accoppiate di nuovo e le correzioni alle coppie andranno perse. Continuare?",
      )
    )
      return;
    edited.current = false;
    setMode(next);
    // Le foto restano scontornate: cambia solo come sono accoppiate
    setCards(
      pair(
        [...photos].sort((a, b) => a.index - b.index),
        next,
      ),
    );
  }

  function editCards(change: (prev: Card[]) => Card[]) {
    edited.current = true;
    setCards(change);
  }

  function swap(cardId: number) {
    editCards((prev) =>
      prev.map((card) =>
        card.id === cardId && card.back !== undefined
          ? { ...card, front: card.back, back: card.front }
          : card,
      ),
    );
  }

  /** Il retro diventa la fronte di un capo nuovo, subito dopo. */
  function split(cardId: number) {
    editCards((prev) =>
      prev.flatMap((card) =>
        card.id === cardId && card.back !== undefined
          ? [
              { id: card.id, front: card.front },
              { id: nextId.current++, front: card.back },
            ]
          : [card],
      ),
    );
  }

  /** La foto diventa il retro del capo precedente. */
  function mergeIntoPrevious(cardId: number) {
    editCards((prev) => {
      const index = prev.findIndex((card) => card.id === cardId);
      const previous = prev[index - 1];
      if (
        index < 1 ||
        previous.back !== undefined ||
        prev[index].back !== undefined
      )
        return prev;
      return prev.flatMap((card, i) =>
        i === index
          ? []
          : i === index - 1
            ? [{ ...previous, back: prev[index].front }]
            : [card],
      );
    });
  }

  function removeCard(card: Card) {
    const removed = photos.filter(
      (photo) => photo.id === card.front || photo.id === card.back,
    );
    removed.forEach(releasePhoto);
    setPhotos((prev) => prev.filter((photo) => !removed.includes(photo)));
    editCards((prev) => prev.filter((item) => item.id !== card.id));
  }

  function retry(photo: ImportPhoto) {
    process(photo);
  }

  function openCrop(photo: ImportPhoto, label: string) {
    // Ritagliare rifà lo scontorno da capo: i ritocchi con la gomma andrebbero persi
    if (
      photo.status === "pronta" &&
      photo.erased &&
      !window.confirm(
        "Ritagliando di nuovo, lo scontorno viene rifatto e i ritocchi con la gomma andranno persi. Continuare?",
      )
    )
      return;
    setEditing({
      kind: "ritaglio",
      photoId: photo.id,
      originalUrl: objectUrl(photo.file),
      label,
    });
  }

  function closeEditor() {
    if (editing?.kind === "ritaglio") revoke(editing.originalUrl);
    setEditing(null);
  }

  function confirmCrop(crop: CropRect) {
    const photo = photos.find((item) => item.id === editing?.photoId);
    closeEditor();
    if (!photo) return;
    if (photo.status === "pronta") revoke(photo.finalUrl);
    process({ ...photo, crop });
  }

  /** Sostituisce lo scontornato con la versione ritoccata con la gomma e rifà il ritocco automatico. */
  async function confirmErase(cutout: Blob) {
    const photo = photos.find((item) => item.id === editing?.photoId);
    closeEditor();
    if (photo?.status !== "pronta") return;
    const version = versions.current.get(photo.id) ?? 0;
    try {
      const final = await finishCutout(cutout);
      const finalUrl = objectUrl(final);
      if (
        !setStatus(photo.id, version, {
          status: "pronta",
          cutout,
          final,
          finalUrl,
          erased: true,
        })
      )
        return revoke(finalUrl);
      revoke(photo.finalUrl);
    } catch (error) {
      console.warn("Ritocco non riuscito", error);
    }
  }

  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const ready = photos.filter((photo) => photo.status === "pronta").length;
  const failed = photos.filter((photo) => photo.status === "errore").length;
  const editingPhoto = editing ? byId.get(editing.photoId) : undefined;

  return (
    <>
      <BackLink href="/aggiungi" label="Aggiungi" />
      <PageHeader
        title="Importa"
        subtitle={`Fino a ${MAX_IMPORT_PHOTOS} foto dalla galleria`}
      />

      <div className="space-y-6 pb-6">
        <div
          role="radiogroup"
          aria-label="Come accoppiare le foto"
          className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1"
        >
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
              onClick={() => changeMode(value)}
              className={`h-11 rounded-xl text-[15px] font-medium transition-colors ${
                mode === value
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted"
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
          <div
            role="status"
            className="rounded-3xl bg-foreground px-5 py-4 text-[15px] leading-relaxed text-background"
          >
            <p>
              Non chiudere l’app e non cambiare app finché l’import non è
              finito.
            </p>
            <p className="mt-2 font-semibold">
              {ready + failed < photos.length
                ? `Scontornate ${ready} di ${photos.length}`
                : failed
                  ? `${failed === 1 ? "1 foto non riuscita" : `${failed} foto non riuscite`}: riprova o togli il capo.`
                  : "Tutte le foto sono pronte."}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/25">
              <div
                className="h-full rounded-full bg-background transition-[width]"
                style={{
                  width: `${((ready + failed) / photos.length) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {skipped > 0 && (
          <p
            role="alert"
            className="rounded-3xl bg-surface-muted px-5 py-4 text-[15px] leading-relaxed"
          >
            Hai scelto {photos.length + skipped} foto: importo le prime{" "}
            {MAX_IMPORT_PHOTOS}. Le altre {skipped} puoi importarle dopo, con un
            nuovo import.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            if (!photos.length) return inputRef.current?.click();
            if (
              window.confirm(
                "Ricominciare? Le foto di questo import andranno perse.",
              )
            )
              clear();
          }}
          className={`h-13 w-full rounded-2xl text-[16px] font-semibold ${
            photos.length
              ? "bg-surface-muted text-foreground"
              : "bg-foreground text-background"
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
            {cards.map((card, index) => {
              const front = byId.get(card.front);
              const back =
                card.back !== undefined ? byId.get(card.back) : undefined;
              if (!front) return null;
              const canMerge =
                index > 0 && !back && cards[index - 1].back === undefined;
              const title = `Capo ${index + 1}`;
              return (
                <li
                  key={card.id}
                  className="rounded-3xl bg-surface p-3 ring-1 ring-line"
                >
                  <p className="mb-2 px-1 text-[15px] font-semibold">{title}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <PhotoTile
                      photo={front}
                      label="Fronte"
                      onCrop={() => openCrop(front, `${title} · Fronte`)}
                      onErase={() =>
                        setEditing({
                          kind: "gomma",
                          photoId: front.id,
                          label: `${title} · Fronte`,
                        })
                      }
                      onRetry={() => retry(front)}
                    />
                    {back ? (
                      <PhotoTile
                        photo={back}
                        label="Retro"
                        onCrop={() => openCrop(back, `${title} · Retro`)}
                        onErase={() =>
                          setEditing({
                            kind: "gomma",
                            photoId: back.id,
                            label: `${title} · Retro`,
                          })
                        }
                        onRetry={() => retry(back)}
                      />
                    ) : (
                      <div className="flex aspect-[3/4] items-center justify-center rounded-2xl border border-dashed border-line px-3 text-center text-[13px] text-muted">
                        Senza retro
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex border-t border-line pt-1">
                    {back && (
                      <CardButton onClick={() => swap(card.id)}>
                        Scambia
                      </CardButton>
                    )}
                    {back && (
                      <CardButton onClick={() => split(card.id)}>
                        Separa
                      </CardButton>
                    )}
                    {canMerge && (
                      <CardButton onClick={() => mergeIntoPrevious(card.id)}>
                        Unisci al precedente
                      </CardButton>
                    )}
                    <CardButton onClick={() => removeCard(card)} muted>
                      Togli
                    </CardButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

      </div>

      {editing?.kind === "ritaglio" && editingPhoto && (
        <CropEditor
          key={editing.originalUrl}
          imageUrl={editing.originalUrl}
          label={editing.label}
          initialCrop={editingPhoto.crop}
          onCancel={closeEditor}
          onConfirm={confirmCrop}
        />
      )}

      {editing?.kind === "gomma" && editingPhoto?.status === "pronta" && (
        <EraserEditor
          image={editingPhoto.cutout}
          label={editing.label}
          onCancel={closeEditor}
          onConfirm={confirmErase}
        />
      )}
    </>
  );
}

function PhotoTile({
  photo,
  label,
  onCrop,
  onErase,
  onRetry,
}: {
  photo: ImportPhoto;
  label: string;
  onCrop: () => void;
  onErase: () => void;
  onRetry: () => void;
}) {
  return (
    <figure>
      <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl bg-surface-muted">
        {photo.status === "pronta" ? (
          // eslint-disable-next-line @next/next/no-img-element -- immagine locale (blob:)
          <img
            src={photo.finalUrl}
            alt={`${label} ritoccato, foto ${photo.index}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <>
            {photo.thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- miniatura locale (blob:)
              <img
                src={photo.thumbUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-30"
              />
            )}
            <span className="relative px-3 text-center text-[13px] leading-snug font-medium whitespace-pre-line">
              {photo.status === "errore"
                ? "Non riuscito"
                : photo.status === "in coda"
                  ? "In attesa…"
                  : (photo.progress ?? "Scontorno…")}
            </span>
          </>
        )}
      </div>
      <figcaption className="mt-1.5 px-1 text-[13px] text-muted">
        {label} · foto {photo.index}
      </figcaption>
      {(photo.status === "pronta" || photo.status === "errore") && (
        <div className="grid grid-cols-2">
          {photo.status === "pronta" ? (
            <TileButton onClick={onErase}>Gomma</TileButton>
          ) : (
            <TileButton onClick={onRetry}>Riprova</TileButton>
          )}
          <TileButton onClick={onCrop}>Ritaglia</TileButton>
        </div>
      )}
    </figure>
  );
}

function TileButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 text-[14px] font-medium"
    >
      {children}
    </button>
  );
}

function CardButton({
  onClick,
  muted,
  children,
}: {
  onClick: () => void;
  muted?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 flex-1 px-1 text-[14px] font-medium ${muted ? "text-muted" : "text-foreground"}`}
    >
      {children}
    </button>
  );
}
