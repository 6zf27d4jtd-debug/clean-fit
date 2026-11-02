// Abbinamento dei colori negli outfit: i neutri stanno con tutto, al massimo un colore acceso per outfit.
// Il colore di un capo è un testo libero: qui lo si riconosce per parole, ignorando maiuscole e accenti.

/**
 * neutro: nero, bianco, grigio, beige, blu/jeans, toni della terra…
 * acceso: tutti gli altri colori riconosciuti e le fantasie.
 * sconosciuto: colore vuoto o non riconosciuto; vale come neutro, così non blocca niente.
 * `key`: due capi accesi stanno insieme solo con la stessa chiave (stesso colore); le fantasie non ne hanno.
 */
export type ColorInfo =
  | { kind: "neutro" | "sconosciuto" }
  | { kind: "acceso"; label: string; key: string | null };

/** Forme maschili/femminili/plurali di un colore che finisce in -o (rosso, rossa, rossi, rosse). */
function forms(base: string) {
  if (base.endsWith("co")) return [base, base.slice(0, -1) + "a", base.slice(0, -1) + "hi", base.slice(0, -1) + "he"];
  if (base.endsWith("io")) return [base, base.slice(0, -1) + "a", base.slice(0, -1), base.slice(0, -1) + "e"];
  if (base.endsWith("o")) return [base, base.slice(0, -1) + "a", base.slice(0, -1) + "i", base.slice(0, -1) + "e"];
  if (base.endsWith("e")) return [base, base.slice(0, -1) + "i"];
  return [base];
}

const NEUTRAL = [
  ...["nero", "bianco", "grigio", "marrone"].flatMap(forms),
  ...["beige", "panna", "avorio", "crema", "sabbia", "antracite", "navy", "blu", "jeans", "denim", "cammello"],
  ...["cuoio", "kaki", "khaki", "tortora", "ecru", "nocciola", "taupe", "melange", "carbone", "cioccolato"],
  ...["black", "white", "grey", "gray", "brown", "tan", "cognac", "off white", "testa di moro"],
  ...["blu scuro", "blu notte", "blu navy", "verde militare", "verde oliva", "grigio scuro", "grigio chiaro"],
];

/** Colori accesi: forma scritta → nome mostrato negli avvisi (e chiave per riconoscere lo stesso colore). */
const ACCENT: Record<string, string> = Object.fromEntries([
  ...forms("rosso").map((word) => [word, "Rosso"]),
  ...forms("verde").map((word) => [word, "Verde"]),
  ...forms("giallo").map((word) => [word, "Giallo"]),
  ...forms("arancione").map((word) => [word, "Arancione"]),
  ...forms("azzurro").map((word) => [word, "Azzurro"]),
  ...forms("celeste").map((word) => [word, "Celeste"]),
  ...forms("dorato").map((word) => [word, "Oro"]),
  ...forms("argentato").map((word) => [word, "Argento"]),
  ...[
    ["arancio", "Arancione"],
    ["rosa", "Rosa"],
    ["viola", "Viola"],
    ["lilla", "Lilla"],
    ["fucsia", "Fucsia"],
    ["turchese", "Turchese"],
    ["blu elettrico", "Blu elettrico"],
    ["blu royal", "Blu elettrico"],
    ["bordeaux", "Bordeaux"],
    ["bordo", "Bordeaux"],
    ["corallo", "Corallo"],
    ["senape", "Senape"],
    ["oro", "Oro"],
    ["argento", "Argento"],
    ["salmone", "Salmone"],
    ["magenta", "Magenta"],
    ["lavanda", "Lavanda"],
    ["menta", "Menta"],
    ["lime", "Lime"],
    ["smeraldo", "Smeraldo"],
    ["ottanio", "Ottanio"],
    ["petrolio", "Petrolio"],
    ["red", "Rosso"],
    ["green", "Verde"],
    ["yellow", "Giallo"],
    ["orange", "Arancione"],
    ["pink", "Rosa"],
    ["purple", "Viola"],
  ],
]);

/** Fantasie: contano come colore acceso, e due fantasie non stanno mai insieme. */
const PATTERNS = [
  ...["fantasia", "righe", "rigato", "rigata", "quadri", "quadretti", "scozzese", "stampa", "stampato", "stampata"],
  ...["fiori", "floreale", "animalier", "leopardato", "zebrato", "camouflage", "mimetico", "mimetica", "tie dye"],
  ...["multicolore", "pois"],
];

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();

/** Riconosce il colore di un capo. Con più colori ("bianco e rosso") vale il primo acceso. */
export function colorInfo(text: string | null | undefined): ColorInfo {
  const words = normalize(text ?? "").split(" ").filter(Boolean);
  let neutral = false;
  for (let i = 0; i < words.length; i++) {
    // Prima le espressioni più lunghe: "blu elettrico" è acceso anche se "blu" da solo è neutro
    for (const length of [3, 2, 1]) {
      const phrase = words.slice(i, i + length).join(" ");
      if (words.length - i < length) continue;
      if (PATTERNS.includes(phrase)) return { kind: "acceso", label: "Fantasia", key: null };
      if (ACCENT[phrase]) return { kind: "acceso", label: ACCENT[phrase], key: ACCENT[phrase] };
      if (NEUTRAL.includes(phrase)) {
        neutral = true;
        i += length - 1;
        break;
      }
    }
  }
  return { kind: neutral ? "neutro" : "sconosciuto" };
}

/** Colori accesi diversi presenti tra i capi; due o più = colori che non si abbinano. */
export function accentLabels(colors: ColorInfo[]) {
  const accents = colors.filter((color) => color.kind === "acceso");
  const labels: string[] = [];
  for (const [index, color] of accents.entries()) {
    const sameAsBefore = accents.slice(0, index).some((other) => color.key !== null && other.key === color.key);
    if (!sameAsBefore) labels.push(color.label);
  }
  return labels;
}

/** Il capo si abbina ai capi già scelti: neutro, oppure acceso dello stesso colore dell'unico acceso presente. */
export function matchesColors(color: ColorInfo, chosen: ColorInfo[]) {
  return color.kind !== "acceso" || accentLabels([...chosen, color]).length <= 1;
}
