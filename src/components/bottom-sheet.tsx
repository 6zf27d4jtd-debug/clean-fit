"use client";

import { useEffect, type ReactNode } from "react";

/** Pannello che sale dal basso; si chiude toccando fuori. Blocca lo scorrimento della pagina sotto. */
export function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50">
      <button type="button" aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-t-3xl bg-background px-5 pt-5"
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
