@AGENTS.md

# Clean Fit — decisioni di progetto

PWA per organizzare l'armadio, pensata prima di tutto per iPhone (aggiunta alla Home da Safari). Tutta l'interfaccia è in italiano.

## Come lavorare
- Il lavoro procede a fasi: aspettare l'approvazione dell'utente prima di iniziare ogni fase.
- Chiedere il permesso prima di installare qualsiasi pacchetto o dipendenza.
- Alla fine di ogni fase: controllare l'app nel browser in formato telefono e spiegare come provarla su iPhone.
- Next.js 16 ha API diverse da quelle note: leggere `node_modules/next/dist/docs/` prima di usare un'API (vedi AGENTS.md).
- Node è in `/usr/local/bin` (non sempre nel PATH della shell non interattiva).

## Stack
- Next.js 16 (App Router, `src/`, `cacheComponents` attivo) + React 19 + TypeScript + Tailwind CSS 4.
- Supabase (piano gratuito): auth email + password, Postgres con RLS (ogni utente vede solo i propri dati), Storage per le foto.
- Rimozione sfondo nel browser con `@imgly/background-removal` (AGPL, ok per questo uso). Foto ridotte a ~1024px prima dell'elaborazione, elaborate una alla volta in coda.
- Foto compresse prima dell'upload (~100–200 KB l'una) per restare nel GB gratuito.
- Deploy su Vercel (non ancora collegato). Nel frattempo prove in locale: `npm run dev:lan` e dall'iPhone `http://<IP-del-Mac>:3000` sulla stessa rete Wi-Fi (`allowedDevOrigins` in `next.config.ts`).
- PWA: `src/app/manifest.ts`, icone in `public/icons/` generate da `scripts/generate-icons.mjs`. Service worker (serwist) solo nella fase di rifinitura, per la consultazione offline.

## Dati e accesso (Fase 1)
- App lato client: i dati si leggono dal browser con `getSupabase()` (`src/lib/supabase/client.ts`), protetti dalle RLS. Niente `proxy.ts` (ex middleware) per ora.
- `AuthProvider` (in `layout.tsx`) gestisce la sessione: chi non ha fatto l'accesso va su `/accedi`, chi l'ha fatto non la vede. `useUser()` restituisce l'utente.
- Variabili: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` (modello in `.env.example`).
- Schema in `supabase/migrations/` (eseguito a mano dall'SQL Editor di Supabase). Tabelle: profiles, categories, groupings, items, item_groupings, outfits, outfit_items; chiavi esterne composte (id, user_id) per impedire collegamenti tra utenti diversi.
- Un trigger su `auth.users` crea il profilo e le 9 categorie predefinite.
- Foto nel bucket privato `capi`, percorso `<user_id>/<item_id>/...`; policy Storage per cartella utente.
- Eliminazione account: il client cancella le foto, poi chiama la funzione `delete_account()` che elimina l'utente (i dati spariscono a cascata).
- "Confirm email" disattivato su Supabase: l'SMTP gratuito di Supabase invia email solo ai membri del progetto. Il recupero password richiederà un SMTP proprio (più avanti).

## Prodotto
- Multiutente: ogni persona ha il suo account e i suoi capi, separati. L'app viene condivisa via link.
- Login: email + password (niente magic link: su iPhone aprirebbe Safari invece della PWA).
- Capo: foto fronte (obbligatoria), foto retro (facoltativa), una categoria (obbligatoria), zero o più raggruppamenti, colore (facoltativo), note (facoltative).
- Categorie predefinite modificabili, con un *ruolo* per gli outfit:
  - sopra: felpe, t-shirt, longsleeve, camicie
  - sotto: pantaloni lunghi, pantaloncini
  - scarpe: scarpe
  - capospalla: giubbotti (facoltativo nell'outfit)
  - accessorio: accessori (esclusi dagli outfit per ora)
- Outfit: sopra + sotto + scarpe, capospalla facoltativo, strato sotto facoltativo (es. t-shirt sotto felpa). Rispetta i raggruppamenti scelti ed evita i capi indossati negli ultimi N giorni (default 7, modificabile dal profilo).
- Import multiplo dalla galleria: foto accoppiate in ordine (1ª fronte, 2ª retro, …), con possibilità di correggere nella coda.
- Offline: basta poter consultare l'armadio; aggiungere capi richiede la connessione.

## Design
- Pulito e minimale, molto spazio bianco, le foto scontornate sono le protagoniste. Palette monocromatica (token CSS in `globals.css`).
- Barra di navigazione in basso: Armadio · Gruppi · + (Aggiungi) · Outfit · Profilo. Lo Storico è dentro Outfit.
- Pulsanti grandi (almeno 44px), aree sicure dell'iPhone rispettate (`env(safe-area-inset-*)`).
- Tema chiaro/scuro: segue il sistema di default, scelta manuale dal Profilo (salvata in localStorage, classe `.dark` su `<html>`).
- Icona: gruccia stilizzata nera su fondo avorio.

## Stato delle fasi
- [x] Fase 0 — Base: progetto, navigazione, tema, PWA, icona
- [x] Fase 1 — Account e dati (Supabase)
- [ ] Fase 2 — Aggiungi capo (foto, scontorno, compressione)
- [ ] Fase 3 — Consultazione (home, categoria, dettaglio, gruppi, modifica)
- [ ] Fase 4 — Import multiplo
- [ ] Fase 5 — Outfit e Storico
- [ ] Fase 6 — Rifiniture (offline, splash screen, prestazioni)
