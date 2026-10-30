"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FULL_CROP, type CropRect } from "@/lib/photo";

/** Lato minimo del riquadro, in frazione della foto. */
const MIN_SIZE = 0.08;

/** Riquadro proposto all'apertura: quasi tutta la foto, con gli angoli ben raggiungibili. */
export const DEFAULT_CROP: CropRect = { x: 0.06, y: 0.06, width: 0.88, height: 0.88 };

type Edges = { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };
type Drag =
  | { kind: "move"; startX: number; startY: number; start: CropRect }
  | { kind: "resize"; edges: Edges; startX: number; startY: number; start: CropRect }
  | { kind: "new"; anchorX: number; anchorY: number; previous: CropRect };

const HANDLES: { edges: Edges; className: string; corner: boolean }[] = [
  { edges: { left: true, top: true }, className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", corner: true },
  { edges: { right: true, top: true }, className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", corner: true },
  { edges: { left: true, bottom: true }, className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", corner: true },
  { edges: { right: true, bottom: true }, className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", corner: true },
  { edges: { top: true }, className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", corner: false },
  { edges: { bottom: true }, className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", corner: false },
  { edges: { left: true }, className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", corner: false },
  { edges: { right: true }, className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", corner: false },
];

/** Editor a tutto schermo: l'utente racchiude il capo in un riquadro prima dello scontorno. */
export function CropEditor({
  imageUrl,
  label,
  initialCrop = DEFAULT_CROP,
  onCancel,
  onConfirm,
}: {
  imageUrl: string;
  label: string;
  initialCrop?: CropRect;
  onCancel: () => void;
  onConfirm: (crop: CropRect) => void;
}) {
  const [crop, setCrop] = useState(initialCrop);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  // Blocca lo scorrimento della pagina sotto l'editor
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function point(event: ReactPointerEvent) {
    const box = frameRef.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - box.left) / box.width, 0, 1), y: clamp((event.clientY - box.top) / box.height, 0, 1) };
  }

  function begin(event: ReactPointerEvent, next: Drag) {
    event.preventDefault();
    event.stopPropagation();
    frameRef.current!.setPointerCapture(event.pointerId);
    drag.current = next;
  }

  function onMove(event: ReactPointerEvent) {
    const current = drag.current;
    if (!current) return;
    const p = point(event);
    if (current.kind === "new") {
      setCrop({
        x: Math.min(current.anchorX, p.x),
        y: Math.min(current.anchorY, p.y),
        width: Math.abs(p.x - current.anchorX),
        height: Math.abs(p.y - current.anchorY),
      });
      return;
    }
    const dx = p.x - current.startX;
    const dy = p.y - current.startY;
    const s = current.start;
    if (current.kind === "move") {
      setCrop({ ...s, x: clamp(s.x + dx, 0, 1 - s.width), y: clamp(s.y + dy, 0, 1 - s.height) });
      return;
    }
    let left = s.x;
    let top = s.y;
    let right = s.x + s.width;
    let bottom = s.y + s.height;
    if (current.edges.left) left = clamp(left + dx, 0, right - MIN_SIZE);
    if (current.edges.right) right = clamp(right + dx, left + MIN_SIZE, 1);
    if (current.edges.top) top = clamp(top + dy, 0, bottom - MIN_SIZE);
    if (current.edges.bottom) bottom = clamp(bottom + dy, top + MIN_SIZE, 1);
    setCrop({ x: left, y: top, width: right - left, height: bottom - top });
  }

  function onEnd() {
    const current = drag.current;
    drag.current = null;
    // Un tocco senza trascinare non deve azzerare il riquadro
    if (current?.kind === "new" && (crop.width < MIN_SIZE || crop.height < MIN_SIZE)) setCrop(current.previous);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inquadra il capo · ${label}`}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <header className="px-5 pt-4 pb-3 text-center">
        <h2 className="text-[17px] font-semibold">Inquadra il capo · {label}</h2>
        <p className="mt-1 text-[14px] text-white/70">
          Trascina gli angoli attorno al capo, lasciando fuori letto, gambe e scarpe.
        </p>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
        <div
          ref={frameRef}
          className="relative touch-none select-none"
          onPointerDown={(event) => {
            const p = point(event);
            begin(event, { kind: "new", anchorX: p.x, anchorY: p.y, previous: crop });
          }}
          onPointerMove={onMove}
          onPointerUp={onEnd}
          onPointerCancel={onEnd}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- immagine locale (blob:) */}
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="block max-h-[calc(100dvh-15rem)] max-w-[calc(100vw-3rem)] object-contain [-webkit-touch-callout:none]"
          />

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
              style={rectStyle(crop)}
            />
          </div>

          <div
            className="absolute cursor-move border-2 border-white"
            style={rectStyle(crop)}
            onPointerDown={(event) =>
              begin(event, { kind: "move", ...startPoint(event), start: crop })
            }
          >
            {HANDLES.map(({ edges, className, corner }, index) => (
              <div
                key={index}
                className={`absolute flex size-11 items-center justify-center ${className}`}
                onPointerDown={(event) => begin(event, { kind: "resize", edges, ...startPoint(event), start: crop })}
              >
                <span className={`rounded-full bg-white shadow ${corner ? "size-5" : "size-3.5"}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 pt-2 pb-4">
        <button type="button" onClick={onCancel} className="h-12 rounded-2xl text-[15px] font-medium text-white/80">
          Annulla
        </button>
        <button
          type="button"
          onClick={() => setCrop(FULL_CROP)}
          className="h-12 rounded-2xl bg-white/15 text-[15px] font-medium"
        >
          Tutta la foto
        </button>
        <button
          type="button"
          onClick={() => onConfirm(crop)}
          className="h-12 rounded-2xl bg-white text-[15px] font-semibold text-black"
        >
          Fatto
        </button>
      </div>
    </div>
  );

  function startPoint(event: ReactPointerEvent) {
    const p = point(event);
    return { startX: p.x, startY: p.y };
  }
}

function rectStyle(crop: CropRect) {
  return {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
