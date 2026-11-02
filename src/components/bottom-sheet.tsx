"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Durata dell'animazione di chiusura (globals.css: .cf-sheet[data-closing]). */
const CLOSE_MS = 200;

/**
 * Pannello che sale dal basso; si chiude toccando fuori (scendendo). Quando lo chiude chi lo usa, per esempio dopo
 * "Salva", sparisce subito. Blocca lo scorrimento della pagina sotto.
 */
export function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      clearTimeout(timer.current);
    };
  }, []);

  function close() {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, CLOSE_MS);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Chiudi"
        onClick={close}
        data-closing={closing || undefined}
        className="cf-backdrop absolute inset-0 bg-black/40"
      />
      <div
        data-closing={closing || undefined}
        className="cf-sheet absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-t-3xl bg-background px-5 pt-5"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetButton({
  onClick,
  disabled,
  primary,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-13 w-full rounded-2xl text-[16px] disabled:opacity-40 ${
        primary ? "bg-foreground font-semibold text-background" : "bg-surface-muted font-medium"
      }`}
    >
      {children}
    </button>
  );
}
