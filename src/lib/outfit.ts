import type { CategoryRole } from "@/lib/categories";

// Regole degli outfit: sopra + sotto + scarpe, capospalla e strato sotto facoltativi.
// Lo strato è un capo "sopra" di una categoria che si porta sotto (t-shirt, longsleeve), sotto felpe e camicie.

export type Slot = "capospalla" | "sopra" | "strato" | "sotto" | "scarpe";

/** Posti dell'outfit, dall'alto in basso. */
export const SLOTS: Slot[] = ["capospalla", "sopra", "strato", "sotto", "scarpe"];

export const SLOT_LABELS: Record<Slot, string> = {
  capospalla: "Capospalla",
  sopra: "Sopra",
  strato: "Strato sotto",
  sotto: "Sotto",
  scarpe: "Scarpe",
};

/** Un capo che può entrare in un outfit, con ruolo e gruppi della sua categoria. */
export type OutfitCandidate = {
  id: string;
  front_path: string;
  role: CategoryRole;
  underlayer: boolean;
  groupingIds: string[];
};

export type OutfitOptions = { groupIds: string[]; capospalla: boolean; strato: boolean };

export function activeSlots(options: OutfitOptions) {
  return SLOTS.filter((slot) => (slot !== "capospalla" || options.capospalla) && (slot !== "strato" || options.strato));
}

/** Il capo va bene per il posto. Con lo strato attivo, il "sopra" è un capo che non si porta sotto. */
export function fitsSlot(item: OutfitCandidate, slot: Slot, strato: boolean) {
  switch (slot) {
    case "strato":
      return item.role === "sopra" && item.underlayer;
    case "sopra":
      return item.role === "sopra" && !(strato && item.underlayer);
    default:
      return item.role === slot;
  }
}

/** Nessun gruppo scelto: va bene tutto. Più gruppi: basta che il capo stia in almeno uno. */
export function inGroups(item: OutfitCandidate, groupIds: string[]) {
  return !groupIds.length || item.groupingIds.some((id) => groupIds.includes(id));
}

/** Capi adatti a un posto; `recent` (se c'è) sono i capi indossati di recente, da escludere. */
export function candidatesFor(items: OutfitCandidate[], slot: Slot, options: OutfitOptions, recent?: Set<string>) {
  return items.filter(
    (item) => fitsSlot(item, slot, options.strato) && inGroups(item, options.groupIds) && !recent?.has(item.id),
  );
}

/** Un capo a caso; se possibile diverso da quello di adesso, così "Cambia" cambia davvero. */
export function pickRandom(list: OutfitCandidate[], current?: string) {
  const others = list.length > 1 ? list.filter((item) => item.id !== current) : list;
  return others[Math.floor(Math.random() * others.length)];
}

/** Data locale (AAAA-MM-GG) spostata di `offsetDays` giorni da oggi: worn_on è una data, senza ora. */
export function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
