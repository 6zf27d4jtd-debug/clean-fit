"use client";

import { useEffect, useState } from "react";
import { applyTheme, readThemePreference, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "sistema", label: "Automatico" },
  { value: "chiaro", label: "Chiaro" },
  { value: "scuro", label: "Scuro" },
];

export function ThemeSelector() {
  const [preference, setPreference] = useState<ThemePreference>("sistema");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage è leggibile solo nel browser
    setPreference(readThemePreference());
  }, []);

  function choose(value: ThemePreference) {
    setPreference(value);
    try {
      if (value === "sistema") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {}
    applyTheme(value);
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-muted p-1">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => choose(value)}
          className={`h-11 rounded-xl text-[15px] font-medium transition-colors ${
            preference === value ? "bg-surface text-foreground shadow-sm" : "text-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
