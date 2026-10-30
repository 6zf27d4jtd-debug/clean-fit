export type CategoryRole = "sopra" | "sotto" | "scarpe" | "capospalla" | "accessorio" | "escluso";

/** Nomi dei ruoli mostrati all'utente, nell'ordine in cui si scelgono. */
export const ROLE_LABELS: Record<CategoryRole, string> = {
  sopra: "Sopra",
  sotto: "Sotto",
  scarpe: "Scarpe",
  capospalla: "Capospalla",
  accessorio: "Accessori",
  escluso: "Escluso dagli outfit",
};

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
