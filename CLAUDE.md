@AGENTS.md

# Clean Fit — decisioni di progetto

PWA per organizzare l'armadio, pensata prima di tutto per iPhone (aggiunta alla Home da Safari). Tutta l'interfaccia è in italiano.

## Come lavorare
- Il lavoro procede a fasi: aspettare l'approvazione dell'utente prima di iniziare ogni fase.
- Chiedere il permesso prima di installare qualsiasi pacchetto o dipendenza.
- Non usare `npx`, `npm exec`, `pnpm dlx`, `bunx` o altri comandi che scaricano strumenti senza chiedere prima all'utente. La stessa regola vale per **scaricare qualsiasi file** (es. `curl`/`wget` di testi, immagini, modelli, licenze): chiedere sempre prima. Gli strumenti già nel progetto si lanciano da `node_modules/.bin/` (es. `node_modules/.bin/tsc`, `node_modules/.bin/eslint`) o con gli script di `npm run`. Prettier non è nel progetto: non formattare con Prettier; lo stile è quello del codice esistente (righe fino a ~120 caratteri).
- Alla fine di ogni fase: controllare l'app nel browser in formato telefono e spiegare come provarla su iPhone.
- Next.js 16 ha API diverse da quelle note: leggere `node_modules/next/dist/docs/` prima di usare un'API (vedi AGENTS.md).
- Il progetto sta in `~/Progetti/app-armadio`, fuori dalla Scrivania: la Scrivania è sincronizzata con iCloud, che crea file duplicati " 2" e rompe Turbopack.
- Node è in `/usr/local/bin` (non sempre nel PATH della shell non interattiva).

## Stack
- Next.js 16 (App Router, `src/`, `cacheComponents` attivo) + React 19 + TypeScript + Tailwind CSS 4.
- Supabase (piano gratuito): auth email + password, Postgres con RLS (ogni utente vede solo i propri dati), Storage per le foto.
- Rimozione sfondo nel browser con `@imgly/background-removal`, tutta dentro `src/lib/background-removal.ts` (unico file da cambiare per sostituire il motore). Foto ridotte a ~1024px prima dell'elaborazione, elaborate una alla volta in coda. BiRefNet_lite (transformers.js) provato e scartato: `std::bad_alloc` sia su WebGPU sia su WASM già sul Mac.
- Motore di scontorno (`defaultEngine()`): **WebGPU · isnet_fp16** come predefinito; **WASM · isnet_quint8** come ripiego automatico dove WebGPU non c'è. Misure su iPhone: WebGPU fp16 0.7 s a foto (caricamento 0.5 s), WASM quint8 8.3 s, WebGPU quint8 10 s (scartato). WebGPU richiede HTTPS: in locale `npm run dev:https` (certificato mkcert in `certificates/`, non versionato).
- imgly 1.7: passare la foto come Blob (PNG), non `ImageData` (nonostante i tipi non viene convertito). Modelli e runtime ONNX arrivano dal CDN `staticimgly.com`; per l'offline andranno ospitati da noi. Lo scontorno lascia nell'immagine la gruccia: da gestire (consiglio di foto senza gruccia o ritocco).
- Niente server a pagamento: scontorno e ritocchi restano gratuiti, sul telefono. Dopo lo scontorno, pulizia automatica in `src/lib/cutout-cleanup.ts` (indipendente dal motore): toglie linee sottili e pezzi staccati, tiene i pezzi grandi almeno il 20% del maggiore (le scarpe sono due).
- Flusso di Aggiungi: foto → ritaglio (`crop-editor.tsx`) → scontorno → pulizia → gomma facoltativa (`eraser-editor.tsx`) → ritocco automatico (`src/lib/retouch.ts`: livelli sul solo capo, 900×1200 su fondo avorio `#f3f2ee`, ombra leggera) → JPEG ~200 KB (`compressJpeg`). Si salva il JPEG ritoccato; il fondo avorio resta anche nel tema scuro (scelta approvata).
- Salvataggio (`src/lib/items.ts`): foto in `capi/<user_id>/<item_id>/fronte.jpg` e `retro.jpg`, poi riga in `items` e `item_groupings`; se un passaggio fallisce si annullano i precedenti. Verificato da anonimo: elenco foto vuoto, caricamento rifiutato (403), link pubblico 400, tabelle vuote.
- In sviluppo Next mostra "2 Issues" a ogni sessione WebGPU: sono avvisi interni di ONNX Runtime (`VerifyEachNodeIsAssignedToAnEp`, alcuni nodi sulla CPU) stampati con `console.error`. Innocui, non controllabili da imgly.
- Licenza: `@imgly/background-removal` è AGPL-3.0, quindi tutta l'app è distribuita con AGPL-3.0-or-later (file `LICENSE`, campo `license` in `package.json`). La AGPL non dipende dal prezzo: chi usa l'app via rete deve poter avere il codice sorgente, per questo il repository GitHub è pubblico e il Profilo ha il link "Codice sorgente". Mai mettere segreti nel repository. Alternative se servisse un codice chiuso: licenza commerciale img.ly o un altro motore.
- Foto compresse prima dell'upload (~100–200 KB l'una) per restare nel GB gratuito.
- Deploy su Vercel (non ancora collegato). Nel frattempo prove in locale: `npm run dev:lan` e dall'iPhone `http://<IP-del-Mac>:3000` sulla stessa rete Wi-Fi (`allowedDevOrigins` in `next.config.ts`). In locale usare `localhost`, non `127.0.0.1` (bloccato dal dev server).
- Intestazioni di sicurezza in `next.config.ts` (`headers()`): niente iframe da altri siti, nosniff, Referrer-Policy, Permissions-Policy. Niente CSP sugli script: gli script inline richiederebbero un nonce, cioè pagine generate a ogni richiesta.
- PWA: `src/app/manifest.ts`, icone in `public/icons/` generate da `scripts/generate-icons.mjs`. Service worker (serwist) solo nella fase di rifinitura, per la consultazione offline.

## Dati e accesso (Fase 1)
- App lato client: i dati si leggono dal browser con `getSupabase()` (`src/lib/supabase/client.ts`), protetti dalle RLS. Niente `proxy.ts` (ex middleware) per ora.
- `AuthProvider` (in `layout.tsx`) gestisce la sessione: chi non ha fatto l'accesso va su `/accedi`, chi l'ha fatto non la vede. `useUser()` restituisce l'utente. Le pagine restano sempre montate (nascoste durante il caricamento) per la validazione "instant navigation" di Next 16: i componenti caricano dati solo quando `useUser()?.id` esiste.
- Variabili: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` (modello in `.env.example`).
- Schema in `supabase/migrations/` (eseguito a mano dall'SQL Editor di Supabase). Tabelle: profiles, categories, groupings, items, item_groupings, outfits, outfit_items; chiavi esterne composte (id, user_id) per impedire collegamenti tra utenti diversi.
- Un trigger su `auth.users` crea il profilo e le 9 categorie predefinite.
- Foto nel bucket privato `capi`, percorso `<user_id>/<item_id>/...`; policy Storage per cartella utente.
- Eliminazione account: il client svuota tutta la cartella foto dell'utente (anche i file rimasti da salvataggi interrotti), poi chiama la funzione `delete_account()` che elimina l'utente (i dati spariscono a cascata).
- Limiti per account (migrazione `0007_limiti.sql`): massimo 300 capi (trigger `check_item_limit`; l'app riconosce l'errore da `hint = 'limite_capi'`, `MAX_ITEMS` in `src/lib/items.ts`) e massimo 650 file nella cartella foto (policy di caricamento con `photo_folder_has_room()`).
- Registrazione solo su invito (migrazione `0006_codice_invito.sql`): tabella `invite_codes` senza policy (invisibile dal browser) e trigger `check_invite_code` *before insert* su `auth.users`, quindi vale anche per chi chiama l'API direttamente. L'app manda il codice nei metadati di `signUp`; il trigger lo toglie da `user_metadata` e lo copia in `app_metadata`. Link d'invito: `/accedi?invito=CODICE`. I codici si creano, controllano e disattivano dall'SQL Editor. Attenzione: anche gli utenti creati a mano dal pannello di Supabase passano dal trigger.
- Inviti dall'app (migrazione `0008_inviti_dall_app.sql`, pagina `/invita` in `invite-manager.tsx`, voce "Invita amici" nel Profilo): solo per gli amministratori, elencati nella tabella `app_admins` (senza policy, si gestisce dall'SQL Editor; mai un campo modificabile dall'utente). Le funzioni `create_invite` (1 uso, 7 giorni), `list_invites` (con l'email di chi l'ha usato), `disable_invite` controllano `is_admin()` nel database. Condivisione con `navigator.share`, altrimenti il link viene copiato.
- Email: SMTP di Brevo (piano gratuito) con un Gmail dedicato come mittente "Clean Fit" (non conforme a DMARC: controllare lo spam; con un dominio proprio basterà cambiare le impostazioni SMTP). Template "Confirm signup" e "Reset Password" in italiano, solo con `{{ .Token }}` e nessun link.
- "Confirm email" attivo; codici a 6 cifre validi un'ora. Codici invece di link perché un link nell'email aprirebbe Safari, non la PWA. Registrazione → schermata del codice (`verifyOtp` tipo `email`); accesso con account non verificato → codice nuovo mandato in automatico. Password dimenticata → codice (`verifyOtp` tipo `recovery`) → `/nuova-password`, dove AuthProvider tiene l'utente finché non salva la password (stato in sessionStorage). Il recupero risponde sempre allo stesso modo, che l'email esista o no.
- Password nuove: almeno 8 caratteri (`MIN_PASSWORD_LENGTH` in `src/lib/auth-errors.ts`, uguale all'impostazione di Supabase). In accesso nessun minimo: gli account vecchi possono avere password più corte.

## Prodotto
- Multiutente: ogni persona ha il suo account e i suoi capi, separati. L'app viene condivisa via link.
- Login: email + password (niente magic link: su iPhone aprirebbe Safari invece della PWA), con verifica dell'email e recupero della password tramite codice.
- Capo: foto fronte (obbligatoria), foto retro (facoltativa), una categoria (obbligatoria), zero o più raggruppamenti, colore (facoltativo), note (facoltative).
- Categorie predefinite modificabili, con un *ruolo* per gli outfit:
  - sopra: felpe, t-shirt, longsleeve, camicie
  - sotto: pantaloni lunghi, pantaloncini
  - scarpe: scarpe
  - capospalla: giubbotti (facoltativo nell'outfit)
  - accessorio: accessori (esclusi dagli outfit per ora)
- Categorie personalizzate (Fase 3): l'utente crea categorie nuove scegliendo nome e ruolo (Sopra, Sotto, Scarpe, Capospalla, Accessori o Escluso dagli outfit), e può rinominarle ed eliminarle. Il ruolo "escluso" non esiste ancora nello schema: serve una migrazione che allarghi il vincolo su `categories.role`. Eliminazione: una categoria vuota si elimina dopo una conferma; se contiene capi, l'utente sceglie un'altra categoria in cui spostarli e poi la categoria viene eliminata. Da quella finestra non si eliminano mai i capi (il vincolo `on delete restrict` resta come protezione).
- Da fare più avanti: cambiare le foto di un capo già salvato (es. aggiungere il retro dopo), riusando il percorso di Aggiungi (ritaglio, scontorno, gomma, ritocco) dal dettaglio del capo.
- Preferiti (Fase 3): cuoricino su ogni capo; nella Home una sezione o un filtro "Preferiti". Serve una migrazione (`items.favorite boolean not null default false`).
- Outfit: sopra + sotto + scarpe, capospalla facoltativo, strato sotto facoltativo (es. t-shirt sotto felpa). Rispetta i raggruppamenti scelti ed evita i capi indossati negli ultimi N giorni (default 7, modificabile dal profilo).
  - Strato: capo "sopra" di una categoria con `categories.underlayer` ("Si porta sotto", migrazione `0004_fase5.sql`; attivo di default su T-shirt e Longsleeve). Va sotto felpe e camicie, mai il contrario.
  - Gruppi: con più gruppi scelti basta che il capo stia in almeno uno.
  - Composizione a mano: ogni posto si sceglie anche a mano, partendo o no da un outfit generato; i capi scelti a mano restano bloccati quando si rigenera. Logica in `src/lib/outfit.ts`, pagina in `outfit-builder.tsx`.
  - Più outfit nello stesso giorno sono ammessi.
- Da lavare (Fase 5, migrazione `0005_da_lavare.sql`): `items.in_laundry_since` (vuota = pulito). Si segna dal dettaglio del capo e dalle schede di categoria e gruppo (`useLaundryToggle` / `requestLaundry` in `src/lib/item-toggles.ts`). I capi nel cesto non vengono mai proposti negli outfit (nemmeno con "Includi anche quelli"); nella scelta a mano compaiono in fondo con l'etichetta "Da lavare". Home: sezione "Cesto" con "Tutto lavato". Dopo "Lo indosso oggi" (anche dallo Storico) la domanda "Quali capi metti nel cesto?" (`laundry-prompt.tsx`): sopra, strato e sotto già spuntati; scarpe e capospalla no.
- Da fare dopo la Fase 5: abbinamento dei colori negli outfit generati, usando il campo colore. I neutri (nero, bianco, grigio, beige, blu scuro) stanno con tutto; al massimo un colore acceso per outfit.
- Import multiplo dalla galleria (Fase 4, `/aggiungi/importa`): foto accoppiate in ordine (1ª fronte, 2ª retro, …) oppure "solo fronte", con possibilità di correggere nella coda (scambia, separa, unisci, togli, ritaglia, gomma). Massimo 30 foto per import (avviso se di più). Nessun ritaglio iniziale: si parte dalla foto intera, si ritaglia solo dove serve. Categoria e gruppi assegnabili a tutti o ai selezionati; "Salva tutti" capo per capo. Durante l'import avviso: "Non chiudere l'app e non cambiare app finché l'import non è finito".
- Rimandato alla Fase 6: coda dell'import salvata in IndexedDB, per riprendere se iOS chiude la PWA.
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
- [x] Fase 2 — Aggiungi capo (foto, ritaglio, scontorno, pulizia, gomma, ritocco, compressione, salvataggio)
- [x] Fase 3 — Consultazione (home, categoria, dettaglio, gruppi, modifica) + categorie personalizzate + preferiti
- [x] Fase 4 — Import multiplo
- [x] Fase 5 — Outfit e Storico (con "Da lavare")
- [ ] Fase 6 — Rifiniture (offline, splash screen, prestazioni)
