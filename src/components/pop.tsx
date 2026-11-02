"use client";

import { useState, type ReactNode } from "react";

/** Piccolo "pop" quando `active` diventa vero (cuoricino, cesto); non all'apertura della pagina. */
export function Pop({ active, children }: { active: boolean; children: ReactNode }) {
  const [count, setCount] = useState(0);
  const [previous, setPrevious] = useState(active);
  if (active !== previous) {
    setPrevious(active);
    if (active) setCount(count + 1);
  }
  // Una chiave nuova a ogni attivazione fa ripartire l'animazione
  return (
    <span key={count} className={`inline-flex ${count ? "cf-pop" : ""}`}>
      {children}
    </span>
  );
}
