export type CategoryRole = "sopra" | "sotto" | "scarpe" | "capospalla" | "accessorio";

export type DefaultCategory = { name: string; role: CategoryRole };

/** Categorie create per ogni nuovo account; l'utente può modificarle e aggiungerne. */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Giubbotti", role: "capospalla" },
  { name: "Felpe", role: "sopra" },
  { name: "T-shirt", role: "sopra" },
  { name: "Longsleeve", role: "sopra" },
  { name: "Camicie", role: "sopra" },
  { name: "Pantaloni lunghi", role: "sotto" },
  { name: "Pantaloncini", role: "sotto" },
  { name: "Scarpe", role: "scarpe" },
  { name: "Accessori", role: "accessorio" },
];
