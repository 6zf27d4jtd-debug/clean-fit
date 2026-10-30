"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { canvasToBlob } from "@/lib/photo";

/** Diametro del pennello in pixel dello schermo: resta uguale qualunque sia la risoluzione della foto. */
const BRUSHES = [
  { label: "Piccola", size: 14 },
  { label: "Media", size: 32 },
  { label: "Grande", size: 60 },
];

/** Un tratto in pixel della foto. L'annulla ridisegna i tratti rimasti: niente copie dell'immagine in memoria. */
type Stroke = { width: number; points: { x: number; y: number }[] };

/** Editor a tutto schermo per cancellare a mano i pezzi rimasti dopo lo scontorno. */
export function EraserEditor({
  image,
  label,
  onCancel,
  onConfirm,
}: {
  image: Blob;
  label: string;
  onCancel: () => void;
  onConfirm: (result: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const original = useRef<ImageBitmap | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<{ pointerId: number; stroke: Stroke } | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const [brush, setBrush] = useState(BRUSHES[1].size);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createImageBitmap(image).then((bitmap) => {
      if (cancelled) return bitmap.close();
      original.current = bitmap;
      const canvas = canvasRef.current!;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      setReady(true);
    });
    return () => {
      cancelled = true;
      original.current?.close();
      original.current = null;
    };
  }, [image]);

  // Blocca lo scorrimento della pagina sotto l'editor
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function context() {
    return canvasRef.current!.getContext("2d")!;
  }

  function redraw() {
    const ctx = context();
    const bitmap = original.current;
    if (!bitmap) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    for (const stroke of strokes.current) drawStroke(ctx, stroke, 0);
  }

  function toImage(event: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height,
    };
  }

  function onDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    // Un dito solo: un secondo tocco non deve cancellare
    if (!ready || active.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const canvas = canvasRef.current!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const stroke: Stroke = { width: brush * scale, points: [toImage(event)] };
    active.current = { pointerId: event.pointerId, stroke };
    drawStroke(context(), stroke, 0);
  }

  function onMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = active.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const from = current.stroke.points.length - 1;
    // Su iPhone gli eventi intermedi rendono il tratto continuo anche con movimenti veloci
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    for (const e of events.length ? events : [event.nativeEvent]) current.stroke.points.push(toImage(e));
    drawStroke(context(), current.stroke, from);
  }

  function onUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = active.current;
    if (!current || current.pointerId !== event.pointerId) return;
    active.current = null;
    strokes.current.push(current.stroke);
    setStrokeCount(strokes.current.length);
  }

  function undo() {
    strokes.current.pop();
    setStrokeCount(strokes.current.length);
    redraw();
  }

  async function confirm() {
    if (!strokes.current.length) return onCancel();
    setSaving(true);
    try {
      onConfirm(await canvasToBlob(canvasRef.current!));
    } catch {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Gomma · ${label}`}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-3 pt-2">
        <button type="button" onClick={onCancel} className="h-11 justify-self-start px-3 text-[15px] text-white/80">
          Chiudi
        </button>
        <h2 className="text-[17px] font-semibold">Gomma · {label}</h2>
        <button
          type="button"
          onClick={confirm}
          disabled={!ready || saving}
          className="h-11 justify-self-end px-3 text-[15px] font-semibold disabled:opacity-40"
        >
          Fatto
        </button>
      </header>
      <p className="px-5 pb-2 text-center text-[14px] text-white/70">
        Passa il dito sulle parti da togliere. Con un dito solo.
      </p>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="block max-h-[calc(100dvh-15rem)] max-w-[calc(100vw-2rem)] touch-none rounded-2xl [-webkit-touch-callout:none]"
          style={{
            // Scacchiera: le parti trasparenti si distinguono da quelle bianche
            background: "repeating-conic-gradient(#e6e5e0 0 25%, #fafaf8 0 50%) 0 0 / 20px 20px",
          }}
        />
      </div>

      <div className="flex items-center gap-2 px-4 pt-2 pb-4">
        <div role="radiogroup" aria-label="Misura della gomma" className="flex flex-1 gap-1 rounded-2xl bg-white/10 p-1">
          {BRUSHES.map(({ label, size }) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={brush === size}
              aria-label={label}
              onClick={() => setBrush(size)}
              className={`flex h-11 flex-1 items-center justify-center rounded-xl ${brush === size ? "bg-white/25" : ""}`}
            >
              <span className="rounded-full bg-white" style={{ width: size / 2.5 + 6, height: size / 2.5 + 6 }} />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={!strokeCount}
          className="h-12 rounded-2xl bg-white/15 px-5 text-[15px] font-medium disabled:opacity-40"
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

/** Cancella il tratto a partire dal punto `from` (tutto il tratto con from = 0). */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, from: number) {
  const points = stroke.points;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.width;
  ctx.beginPath();
  const start = points[from];
  if (points.length - from === 1) {
    ctx.arc(start.x, start.y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(start.x, start.y);
    for (let i = from + 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}
