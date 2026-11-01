"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useUser } from "@/components/auth-provider";
import { BottomSheet, SheetButton } from "@/components/bottom-sheet";
import { CropEditor } from "@/components/crop-editor";
import { EraserEditor } from "@/components/eraser-editor";
import {
  EMPTY_DETAILS,
  ItemDetails,
  useWardrobeLists,
  type ItemDetailsValue,
  type WardrobeLists,
} from "@/components/item-details";
import { BackLink, PageHeader } from "@/components/page-header";
import { saveItem } from "@/lib/items";
import { FULL_CROP, type CropRect } from "@/lib/photo";
import { finishCutout, makeThumbnail, processPhoto } from "@/lib/photo-pipeline";

/** Foto per import: oltre, la memoria del telefono non basta a tenere in coda gli scontornati. */
export const MAX_IMPORT_PHOTOS = 30;

type Mode = "coppie" | "fronte";

/** index: posizione nella selezione (1, 2, 3…), mostrata all'utente per ritrovare la foto. */
type Base = { id: number; index: number; file: File; thumbUrl?: string; crop: CropRect };

type Status =
  | { status: "in coda" | "elaborazione"; progress?: string }
  // cutout: scontornato trasparente (PNG), base per la gomma; final: foto ritoccata e compressa (JPEG), da salvare
  | { status: "pronta"; cutout: Blob; final: Blob; finalUrl: string; erased?: boolean }
  | { status: "errore" };

type ImportPhoto = Base & Status;

/** Un capo della coda: fronte obbligatoria, retro facoltativo (id delle foto), dati e stato del salvataggio. */
type Card = {
  id: number;
  front: number;
  back?: number;
  details: ItemDetailsValue;
  save?: "salvataggio" | "salvato" | "errore";
};

/** Foto aperta in un editor a tutto schermo. */
type Editing =
  | { kind: "ritaglio"; photoId: number; originalUrl: string; label: string }
  | { kind: "gomma"; photoId: number; label: string };

/** Pannello aperto: dati di un capo, oppure categoria e gruppi per più capi. */
type Sheet = { kind: "capo"; cardId: number; title: string } | { kind: "insieme" };

export function ImportQueue() {
  const userId = useUser()?.id;
  const lists = useWardrobeLists();
  const [mode, setMode] = useState<Mode>("coppie");
  const [photos, setPhotos] = useState<ImportPhoto[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState(new Set<number>());
  const [skipped, setSkipped] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const nextId = useRef(0);
  // Le foto vengono scontornate una alla volta, nell'ordine di selezione.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Versione di ogni foto: se viene tolta o rielaborata, il risultato vecchio viene scartato.
  const versions = useRef(new Map<number, number>());
  // L'utente ha corretto le coppie o i dati a mano: cambiare modalità li rifarebbe da capo.
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
      const back = step === 2 ? list[i + 1]?.id : undefined;
      cards.push({ id: nextId.current++, front: list[i].id, back, details: EMPTY_DETAILS });
    }
    return cards;
  }

  /** Aggiorna lo stato di una foto, se nel frattempo non è stata tolta o rielaborata. */
  function setStatus(id: number, version: number, status: Status, crop?: CropRect) {
    if (versions.current.get(id) !== version) return false;
    setPhotos((prev) =>
      prev.map((photo) =>
        photo.id === id
          ? { id, index: photo.index, file: photo.file, thumbUrl: photo.thumbUrl, crop: crop ?? photo.crop, ...status }
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
        if (!setStatus(id, version, { status: "pronta", cutout, final, finalUrl })) revoke(finalUrl);
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
    setSelected(new Set());
    setSkipped(0);
  }

  async function choose(files: File[]) {
    clear();
    const accepted = files.slice(0, MAX_IMPORT_PHOTOS);
    const list: Base[] = accepted.map((file, i) => ({ id: nextId.current++, index: i + 1, file, crop: FULL_CROP }));
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
        setPhotos((prev) => prev.map((item) => (item.id === photo.id ? { ...item, thumbUrl } : item)));
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
        "Cambiando modalità le foto vengono accoppiate di nuovo: le correzioni alle coppie e i dati dei capi andranno persi. Continuare?",
      )
    )
      return;
    edited.current = false;
    setMode(next);
    setSelected(new Set());
    // Le foto restano scontornate: cambia solo come sono accoppiate
    setCards(pair([...photos].sort((a, b) => a.index - b.index), next));
  }

  function editCards(change: (prev: Card[]) => Card[]) {
    edited.current = true;
    setCards(change);
  }

  function swap(cardId: number) {
    editCards((prev) =>
      prev.map((card) =>
        card.id === cardId && card.back !== undefined ? { ...card, front: card.back, back: card.front } : card,
      ),
    );
  }

  /** Il retro diventa la fronte di un capo nuovo, subito dopo, con gli stessi dati. */
  function split(cardId: number) {
    editCards((prev) =>
      prev.flatMap((card) =>
        card.id === cardId && card.back !== undefined
          ? [
              { ...card, back: undefined },
              { id: nextId.current++, front: card.back, details: card.details },
            ]
          : [card],
      ),
    );
  }

  /** La foto diventa il retro del capo precedente, che tiene i suoi dati. */
  function mergeIntoPrevious(cardId: number) {
    editCards((prev) => {
      const index = prev.findIndex((card) => card.id === cardId);
      const previous = prev[index - 1];
      if (index < 1 || previous.back !== undefined || prev[index].back !== undefined) return prev;
      return prev.flatMap((card, i) =>
        i === index ? [] : i === index - 1 ? [{ ...previous, back: prev[index].front }] : [card],
      );
    });
    unselect(cardId);
  }

  function removeCard(card: Card) {
    const removed = photos.filter((photo) => photo.id === card.front || photo.id === card.back);
    removed.forEach(releasePhoto);
    setPhotos((prev) => prev.filter((photo) => !removed.includes(photo)));
    editCards((prev) => prev.filter((item) => item.id !== card.id));
    unselect(card.id);
  }

  function setDetails(cardId: number, details: ItemDetailsValue) {
    editCards((prev) => prev.map((card) => (card.id === cardId ? { ...card, details } : card)));
  }

  function toggleSelected(cardId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(cardId)) next.add(cardId);
      return next;
    });
  }

  function unselect(cardId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  }

  /** Categoria (se scelta) e gruppi in aggiunta, ai capi selezionati oppure a tutti quelli non ancora salvati. */
  function applyToMany(value: ItemDetailsValue) {
    editCards((prev) =>
      prev.map((card) => {
        if (card.save === "salvato" || (selected.size > 0 && !selected.has(card.id))) return card;
        const groupingIds = [...new Set([...card.details.groupingIds, ...value.groupingIds])];
        return { ...card, details: { ...card.details, categoryId: value.categoryId ?? card.details.categoryId, groupingIds } };
      }),
    );
    setSelected(new Set());
    setSheet(null);
  }

  function openCrop(photo: ImportPhoto, label: string) {
    // Ritagliare rifà lo scontorno da capo: i ritocchi con la gomma andrebbero persi
    if (
      photo.status === "pronta" &&
      photo.erased &&
      !window.confirm("Ritagliando di nuovo, lo scontorno viene rifatto e i ritocchi con la gomma andranno persi. Continuare?")
    )
      return;
    setEditing({ kind: "ritaglio", photoId: photo.id, originalUrl: objectUrl(photo.file), label });
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
      if (!setStatus(photo.id, version, { status: "pronta", cutout, final, finalUrl, erased: true }))
        return revoke(finalUrl);
      revoke(photo.finalUrl);
    } catch (error) {
      console.warn("Ritocco non riuscito", error);
    }
  }

  function setSave(cardId: number, save: Card["save"]) {
    setCards((prev) => prev.map((card) => (card.id === cardId ? { ...card, save } : card)));
  }

  /** Salva i capi uno alla volta: un errore non ferma gli altri, e il capo resta in coda con "Riprova". */
  async function saveCards(targets: Card[]) {
    if (!userId || saving || !targets.length) return;
    setSelected(new Set());
    setSaving({ done: 0, total: targets.length });
    for (const [done, card] of targets.entries()) {
      setSaving({ done, total: targets.length });
      const front = byId.get(card.front);
      const back = card.back !== undefined ? byId.get(card.back) : undefined;
      if (front?.status !== "pronta" || !card.details.categoryId || (back && back.status !== "pronta")) continue;
      setSave(card.id, "salvataggio");
      try {
        await saveItem(userId, {
          ...card.details,
          categoryId: card.details.categoryId,
          front: front.final,
          back: back?.status === "pronta" ? back.final : undefined,
        });
        setSave(card.id, "salvato");
      } catch (error) {
        console.warn("Salvataggio non riuscito", error);
        setSave(card.id, "errore");
      }
    }
    setSaving(null);
  }

  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const ready = photos.filter((photo) => photo.status === "pronta").length;
  const failed = photos.filter((photo) => photo.status === "errore").length;
  const editingPhoto = editing ? byId.get(editing.photoId) : undefined;
  const pending = cards.filter((card) => card.save !== "salvato");
  const savedCount = cards.length - pending.length;
  const saveErrors = pending.filter((card) => card.save === "errore").length;
  const finished = cards.length > 0 && pending.length === 0;
  const pendingPhotos = pending.flatMap((card) => [card.front, ...(card.back !== undefined ? [card.back] : [])]);
  const withoutCategory = pending.filter((card) => !card.details.categoryId).length;
  const missing = pendingPhotos.some((id) => byId.get(id)?.status === "errore")
    ? "Riprova o togli le foto non riuscite."
    : pendingPhotos.some((id) => byId.get(id)?.status !== "pronta")
      ? "Attendi la fine dello scontorno."
      : withoutCategory
        ? `Scegli la categoria per ${withoutCategory === 1 ? "1 capo" : `${withoutCategory} capi`}.`
        : null;
  const categoryNames = new Map(lists.categories?.map((category) => [category.id, category.name]));
  const groupingNames = new Map(lists.groupings?.map((grouping) => [grouping.id, grouping.name]));
  const sheetCard = sheet?.kind === "capo" ? cards.find((card) => card.id === sheet.cardId) : undefined;

  return (
    <>
      <BackLink href="/aggiungi" label="Aggiungi" />
      <PageHeader title="Importa" subtitle={`Fino a ${MAX_IMPORT_PHOTOS} foto dalla galleria`} />

      <div className="space-y-6 pb-6">
        {!savedCount && (
          <>
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
                  disabled={!!saving}
                  onClick={() => changeMode(value)}
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
          </>
        )}

        {finished ? (
          <div role="status" className="rounded-3xl bg-foreground px-5 py-4 text-[15px] text-background">
            <p className="font-semibold">
              Import finito: {savedCount === 1 ? "1 capo salvato" : `${savedCount} capi salvati`}.
            </p>
            <p className="mt-0.5 opacity-80">
              <Link href="/" className="underline underline-offset-2">
                Vai all’armadio
              </Link>{" "}
              oppure importa altre foto.
            </p>
          </div>
        ) : (
          photos.length > 0 && (
            <div
              role="status"
              className="rounded-3xl bg-foreground px-5 py-4 text-[15px] leading-relaxed text-background"
            >
              <p>Non chiudere l’app e non cambiare app finché l’import non è finito.</p>
              <p className="mt-2 font-semibold">
                {saving
                  ? `Salvataggio ${saving.done + 1} di ${saving.total}…`
                  : ready + failed < photos.length
                    ? `Scontornate ${ready} di ${photos.length}`
                    : failed
                      ? `${failed === 1 ? "1 foto non riuscita" : `${failed} foto non riuscite`}: riprova o togli il capo.`
                      : savedCount
                        ? `Salvati ${savedCount} di ${cards.length}`
                        : "Tutte le foto sono pronte."}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/25">
                <div
                  className="h-full rounded-full bg-background transition-[width]"
                  style={{
                    width: `${(saving ? saving.done / saving.total : (ready + failed) / photos.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )
        )}

        {skipped > 0 && (
          <p role="alert" className="rounded-3xl bg-surface-muted px-5 py-4 text-[15px] leading-relaxed">
            Hai scelto {photos.length + skipped} foto: importo le prime {MAX_IMPORT_PHOTOS}. Le altre {skipped} puoi
            importarle dopo, con un nuovo import.
          </p>
        )}

        <button
          type="button"
          disabled={!!saving}
          onClick={() => {
            if (!photos.length || finished) return inputRef.current?.click();
            const message = savedCount
              ? "Ricominciare? I capi già salvati restano nell’armadio; gli altri andranno persi."
              : "Ricominciare? Le foto di questo import andranno perse.";
            if (window.confirm(message)) clear();
          }}
          className={`h-13 w-full rounded-2xl text-[16px] font-semibold disabled:opacity-40 ${
            photos.length && !finished ? "bg-surface-muted text-foreground" : "bg-foreground text-background"
          }`}
        >
          {finished ? "Nuovo import" : photos.length ? "Ricomincia" : "Scegli le foto"}
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

        {pending.length > 0 && !saving && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-[15px] text-muted">
                {selected.size ? `Selezionati: ${selected.size}` : "Tocca il cerchio di un capo per selezionarlo"}
              </p>
              <button
                type="button"
                onClick={() => setSelected(selected.size ? new Set() : new Set(pending.map((card) => card.id)))}
                className="h-11 shrink-0 pl-3 text-[15px] font-medium"
              >
                {selected.size ? "Deseleziona" : "Seleziona tutti"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSheet({ kind: "insieme" })}
              className="h-13 w-full rounded-2xl bg-surface text-[16px] font-medium ring-1 ring-line"
            >
              {selected.size === 0
                ? "Categoria e gruppi a tutti"
                : selected.size === 1
                  ? "Categoria e gruppi al selezionato"
                  : `Categoria e gruppi ai ${selected.size} selezionati`}
            </button>
          </div>
        )}

        {cards.length > 0 && (
          <ul className="space-y-3">
            {cards.map((card, index) => {
              const front = byId.get(card.front);
              const back = card.back !== undefined ? byId.get(card.back) : undefined;
              if (!front) return null;
              const locked = !!saving || card.save === "salvato";
              const canMerge = index > 0 && !back && cards[index - 1].back === undefined && !cards[index - 1].save;
              const title = `Capo ${index + 1}`;
              const isSelected = selected.has(card.id);
              const category = card.details.categoryId && categoryNames.get(card.details.categoryId);
              const summary = [
                ...card.details.groupingIds.flatMap((id) => groupingNames.get(id) ?? []),
                card.details.color.trim(),
              ].filter(Boolean);
              return (
                <li
                  key={card.id}
                  className={`rounded-3xl bg-surface p-3 ring-line ${isSelected ? "ring-2 ring-foreground" : "ring-1"}`}
                >
                  <div className="mb-2 flex min-h-11 items-center justify-between gap-2 pl-1">
                    <p className="text-[15px] font-semibold">{title}</p>
                    {card.save === "salvato" ? (
                      <span className="text-[14px] font-medium text-muted">Salvato</span>
                    ) : card.save === "salvataggio" ? (
                      <span className="text-[14px] font-medium text-muted">Salvataggio…</span>
                    ) : (
                      !locked && (
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={`Seleziona ${title.toLowerCase()}`}
                          onClick={() => toggleSelected(card.id)}
                          className="flex size-11 items-center justify-center"
                        >
                          <span
                            className={`flex size-6 items-center justify-center rounded-full ${
                              isSelected ? "bg-foreground text-background" : "ring-2 ring-line"
                            }`}
                          >
                            {isSelected && (
                              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden>
                                <path
                                  d="M5 12.5l4.5 4.5L19 7.5"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                        </button>
                      )
                    )}
                  </div>
                  <div className={`grid grid-cols-2 gap-3 ${card.save === "salvato" ? "opacity-60" : ""}`}>
                    <PhotoTile
                      photo={front}
                      label="Fronte"
                      locked={locked}
                      onCrop={() => openCrop(front, `${title} · Fronte`)}
                      onErase={() => setEditing({ kind: "gomma", photoId: front.id, label: `${title} · Fronte` })}
                      onRetry={() => process(front)}
                    />
                    {back ? (
                      <PhotoTile
                        photo={back}
                        label="Retro"
                        locked={locked}
                        onCrop={() => openCrop(back, `${title} · Retro`)}
                        onErase={() => setEditing({ kind: "gomma", photoId: back.id, label: `${title} · Retro` })}
                        onRetry={() => process(back)}
                      />
                    ) : (
                      <div className="flex aspect-[3/4] items-center justify-center rounded-2xl border border-dashed border-line px-3 text-center text-[13px] text-muted">
                        Senza retro
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setSheet({ kind: "capo", cardId: card.id, title })}
                    className="mt-3 flex min-h-13 w-full items-center gap-3 rounded-2xl bg-surface-muted px-4 py-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] font-medium ${category ? "" : "text-muted"}`}>
                        {category || "Scegli la categoria"}
                      </span>
                      {summary.length > 0 && (
                        <span className="block truncate text-[13px] text-muted">{summary.join(" · ")}</span>
                      )}
                    </span>
                    {!locked && <span className="shrink-0 text-[14px] font-medium text-muted">Dati</span>}
                  </button>

                  {card.save === "errore" && (
                    <div className="mt-2 flex items-center justify-between gap-2 px-1">
                      <p className="text-[13px] leading-snug text-muted">Non salvato. Controlla la connessione.</p>
                      {!saving && (
                        <button
                          type="button"
                          onClick={() => saveCards([card])}
                          disabled={!isCardReady(card, byId)}
                          className="h-11 shrink-0 px-2 text-[14px] font-medium disabled:opacity-40"
                        >
                          Riprova
                        </button>
                      )}
                    </div>
                  )}

                  {!locked && (
                    <div className="mt-2 flex border-t border-line pt-1">
                      {back && <CardButton onClick={() => swap(card.id)}>Scambia</CardButton>}
                      {back && <CardButton onClick={() => split(card.id)}>Separa</CardButton>}
                      {canMerge && <CardButton onClick={() => mergeIntoPrevious(card.id)}>Unisci al precedente</CardButton>}
                      <CardButton onClick={() => removeCard(card)} muted>
                        Togli
                      </CardButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {pending.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => saveCards(pending)}
              disabled={!!missing || !!saving}
              className="h-13 w-full rounded-2xl bg-foreground text-[16px] font-semibold text-background disabled:opacity-40"
            >
              {saving
                ? `Salvataggio ${saving.done + 1} di ${saving.total}…`
                : pending.length === 1
                  ? "Salva il capo"
                  : `Salva tutti (${pending.length})`}
            </button>
            {!saving && (missing || saveErrors > 0) && (
              <p role={missing ? undefined : "alert"} className="text-center text-[14px] text-muted">
                {missing ??
                  `${saveErrors === 1 ? "1 capo non salvato" : `${saveErrors} capi non salvati`}. Controlla la connessione e riprova.`}
              </p>
            )}
          </div>
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
        <EraserEditor image={editingPhoto.cutout} label={editing.label} onCancel={closeEditor} onConfirm={confirmErase} />
      )}

      {sheet?.kind === "capo" && sheetCard && (
        <BottomSheet label={sheet.title} onClose={() => setSheet(null)}>
          <h2 className="mb-6 text-[20px] font-semibold">{sheet.title}</h2>
          <ItemDetails value={sheetCard.details} onChange={(details) => setDetails(sheetCard.id, details)} lists={lists} />
          <div className="mt-6">
            <SheetButton onClick={() => setSheet(null)} primary>
              Fatto
            </SheetButton>
          </div>
        </BottomSheet>
      )}

      {sheet?.kind === "insieme" && (
        <ManySheet
          title={
            selected.size === 0
              ? `A tutti i capi (${pending.length})`
              : selected.size === 1
                ? "Al capo selezionato"
                : `Ai ${selected.size} capi selezionati`
          }
          lists={lists}
          onClose={() => setSheet(null)}
          onApply={applyToMany}
        />
      )}
    </>
  );
}

/** Un capo si può salvare: foto pronte e categoria scelta. */
function isCardReady(card: Card, byId: Map<number, ImportPhoto>) {
  const back = card.back !== undefined ? byId.get(card.back) : undefined;
  return byId.get(card.front)?.status === "pronta" && (!back || back.status === "pronta") && !!card.details.categoryId;
}

/** Categoria e gruppi da assegnare a più capi insieme; i gruppi si aggiungono a quelli già scelti. */
function ManySheet({
  title,
  lists,
  onClose,
  onApply,
}: {
  title: string;
  lists: WardrobeLists;
  onClose: () => void;
  onApply: (value: ItemDetailsValue) => void;
}) {
  const [value, setValue] = useState(EMPTY_DETAILS);
  return (
    <BottomSheet label={title} onClose={onClose}>
      <h2 className="mb-6 text-[20px] font-semibold">{title}</h2>
      <ItemDetails value={value} onChange={setValue} lists={lists} bulk />
      <div className="mt-6 grid grid-cols-2 gap-3">
        <SheetButton onClick={onClose}>Annulla</SheetButton>
        <SheetButton onClick={() => onApply(value)} disabled={!value.categoryId && !value.groupingIds.length} primary>
          Applica
        </SheetButton>
      </div>
    </BottomSheet>
  );
}

function PhotoTile({
  photo,
  label,
  locked,
  onCrop,
  onErase,
  onRetry,
}: {
  photo: ImportPhoto;
  label: string;
  locked: boolean;
  onCrop: () => void;
  onErase: () => void;
  onRetry: () => void;
}) {
  return (
    <figure>
      <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl bg-surface-muted">
        {photo.status === "pronta" ? (
          // eslint-disable-next-line @next/next/no-img-element -- immagine locale (blob:)
          <img src={photo.finalUrl} alt={`${label} ritoccato, foto ${photo.index}`} className="h-full w-full object-cover" />
        ) : (
          <>
            {photo.thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- miniatura locale (blob:)
              <img src={photo.thumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
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
      {!locked && (photo.status === "pronta" || photo.status === "errore") && (
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

function TileButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="h-11 text-[14px] font-medium">
      {children}
    </button>
  );
}

function CardButton({ onClick, muted, children }: { onClick: () => void; muted?: boolean; children: string }) {
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
