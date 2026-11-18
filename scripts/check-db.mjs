// Prova le query dell'app sul database di Supabase, prima di ogni pubblicazione: `npm run check:db`.
// Parte da sola prima di ogni `git push` (hook in .githooks/pre-push, attivato con `git config core.hooksPath .githooks`).
//
// Usa solo la chiave pubblica e nessun account: le RLS non restituiscono righe, ma Supabase controlla comunque
// tabelle, colonne e collegamenti, quindi un errore come "more than one relationship" (PGRST201) salta fuori qui.
// Controlla anche che:
//  - nessuna tabella restituisca righe a chi non ha fatto l'accesso (sarebbe una falla delle RLS);
//  - le funzioni di sola lettura esistano (chi non ha fatto l'accesso viene rifiutato con 42501: va bene così);
//  - nel codice non ci siano select scritte fuori da src/lib/queries.ts.
// Non modifica niente e non chiama funzioni che modificano dati.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUERIES_FILE = path.join(root, "src/lib/queries.ts");
const { QUERIES, READ_FUNCTIONS } = await import(QUERIES_FILE);

const problems = [];

// 1. Select scritte a mano fuori da queries.ts
for (const file of walk(path.join(root, "src"))) {
  if (file === QUERIES_FILE) continue;
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (/\.select\(\s*["'`]/.test(line)) {
        problems.push(`${path.relative(root, file)}:${index + 1}: select scritta a mano, spostala in src/lib/queries.ts`);
      }
    });
}

// 2. Query e funzioni sul database
const env = { ...readEnvFile(path.join(root, ".env.local")), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (.env.local)");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

for (const [name, { table, select }] of Object.entries(QUERIES)) {
  const { data, error } = await supabase.from(table).select(select).limit(1);
  if (error) problems.push(`${name} (${table}): ${error.code} ${error.message}${error.hint ? ` — ${error.hint}` : ""}`);
  else if (data.length) problems.push(`${name} (${table}): restituisce righe senza accesso, controllare le RLS`);
  else console.log(`ok  ${name}`);
  await pause();
}

for (const name of READ_FUNCTIONS) {
  const { error } = await supabase.rpc(name);
  // 42501 = esiste, ma chi non ha fatto l'accesso non può chiamarla
  if (error && error.code !== "42501") problems.push(`funzione ${name}: ${error.code} ${error.message}`);
  else console.log(`ok  funzione ${name}`);
  await pause();
}

if (problems.length) {
  console.error(`\n${problems.length} problemi:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nTutto a posto: ${Object.keys(QUERIES).length} query e ${READ_FUNCTIONS.length} funzioni.`);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}

/** Richieste distanziate: niente raffiche. */
function pause() {
  return new Promise((resolve) => setTimeout(resolve, 150));
}
