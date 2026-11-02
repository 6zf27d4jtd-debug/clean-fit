# Clean Fit

PWA per organizzare l’armadio, pensata per iPhone: foto dei capi con lo sfondo tolto direttamente sul telefono,
categorie e gruppi, outfit proposti o composti a mano, storico e cesto dei capi da lavare. Interfaccia in italiano.

App pubblicata: https://clean-fit-topaz.vercel.app (registrazione su invito).

## Tecnologie

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase (accesso, database con Row Level Security, foto),
[@imgly/background-removal](https://github.com/imgly/background-removal-js) per lo scontorno nel browser.

## Sviluppo

1. Copia `.env.example` in `.env.local` e inserisci indirizzo e chiave pubblica del progetto Supabase.
2. Esegui le migrazioni di `supabase/migrations/` in ordine, dall’SQL Editor di Supabase.
3. `npm install`, poi `npm run dev` e apri http://localhost:3000.

## Licenza

Copyright © 2026 Andrea Santonocito.

Clean Fit è software libero: puoi redistribuirlo e modificarlo secondo i termini della
GNU Affero General Public License, pubblicata dalla Free Software Foundation, versione 3 o (a tua scelta) successiva.
È distribuito nella speranza che sia utile, ma SENZA ALCUNA GARANZIA. Il testo completo è nel file [LICENSE](LICENSE).

Se pubblichi una versione modificata come servizio online, la AGPL chiede di offrire il codice sorgente a chi la usa.
