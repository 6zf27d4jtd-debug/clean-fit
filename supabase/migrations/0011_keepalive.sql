-- Tiene attivo il progetto gratuito di Supabase (in pausa dopo 7 giorni senza attività).
-- Ogni giorno un cron di Vercel chiama /api/keepalive, che legge da qui con la chiave pubblica.

-- Una sola riga fissa, senza dati degli utenti. RLS attivo e nessuna policy: dal browser non si legge né si scrive.
create table public.keepalive (
  id boolean primary key default true check (id),
  note text not null
);
insert into public.keepalive (note) values ('Clean Fit: riga letta ogni giorno dal cron di Vercel');

alter table public.keepalive enable row level security;
revoke all on table public.keepalive from public, anon, authenticated;

-- Legge la riga e restituisce l'ora del database. Security definer per poter leggere nonostante RLS senza policy:
-- non prende parametri e restituisce solo un'ora, quindi non espone niente.
create function public.keepalive()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select now() from public.keepalive where id;
$$;

-- Esecuzione solo per il ruolo della chiave pubblica (quello usato dal cron), non per gli utenti dell'app
revoke execute on function public.keepalive() from public, anon, authenticated;
grant execute on function public.keepalive() to anon;
