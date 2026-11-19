-- Eliminazione dell'account più veloce e senza foto orfane, anche se la connessione cade a metà.
-- 1. "Elimina tutto" chiama start_account_deletion(): da quel momento l'eliminazione è segnata nel profilo e
--    l'utente non può più toglierla. Alla prossima apertura l'app la riprende da sola.
-- 2. Con l'eliminazione avviata il database rifiuta nuovi capi e nuovi file nello Storage (anche da un altro
--    dispositivo), così la cartella si può svuotare del tutto.
-- 3. my_photo_paths() elenca tutta la cartella con una sola richiesta (prima ne serviva una per capo).
-- 4. delete_account() elimina l'utente solo se l'eliminazione è avviata e la cartella è vuota.

alter table public.profiles add column deletion_requested_at timestamptz;

-- L'utente non modifica più il profilo a mano, se non i giorni di "indossati di recente": niente update di
-- deletion_requested_at, niente insert né delete della riga (cancellarla toglierebbe il segno).
-- Il profilo lo crea il trigger su auth.users e sparisce a cascata con l'utente.
revoke insert, update, delete on table public.profiles from anon, authenticated;
grant update (recent_days) on table public.profiles to authenticated;

-- Eliminazione avviata per l'utente collegato. Security invoker: legge solo il proprio profilo (RLS).
create function public.account_deletion_requested()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and deletion_requested_at is not null
  );
$$;

revoke execute on function public.account_deletion_requested() from public, anon;
grant execute on function public.account_deletion_requested() to authenticated;

-- Avvia l'eliminazione (o restituisce quando era già stata avviata). Unico modo per impostare il segno.
create function public.start_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  update public.profiles
    set deletion_requested_at = coalesce(deletion_requested_at, now())
    where id = auth.uid()
    returning deletion_requested_at into requested;
  if requested is null then
    raise exception 'Profilo non trovato';
  end if;
  return requested;
end;
$$;

revoke execute on function public.start_account_deletion() from public, anon;
grant execute on function public.start_account_deletion() to authenticated;

-- Tutti i file della cartella dell'utente, in tutte le sottocartelle (capi, copertine, file rimasti).
-- Security invoker: la policy di lettura dello Storage mostra solo la propria cartella.
create function public.my_photo_paths()
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select name from storage.objects
  where bucket_id = 'capi' and name like (select auth.uid())::text || '/%'
  order by name;
$$;

revoke execute on function public.my_photo_paths() from public, anon;
grant execute on function public.my_photo_paths() to authenticated;

-- Nessun capo nuovo con l'eliminazione avviata. L'app riconosce l'errore dal suggerimento 'eliminazione_in_corso'.
create function public.check_account_not_deleting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.account_deletion_requested() then
    raise exception 'Eliminazione dell''account in corso' using hint = 'eliminazione_in_corso';
  end if;
  return new;
end;
$$;

revoke all on function public.check_account_not_deleting() from public, anon, authenticated;

create trigger check_account_not_deleting
  before insert on public.items
  for each row execute function public.check_account_not_deleting();

-- Nessun file nuovo (né sovrascritto) con l'eliminazione avviata. L'eliminazione dei file resta permessa.
drop policy "foto personali: caricamento" on storage.objects;
create policy "foto personali: caricamento" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'capi'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.photo_folder_has_room()
    and not public.account_deletion_requested()
  );

drop policy "foto personali: modifica" on storage.objects;
create policy "foto personali: modifica" on storage.objects
  for update to authenticated
  using (bucket_id = 'capi' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'capi'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not public.account_deletion_requested()
  );

-- Elimina l'utente (i dati spariscono a cascata) solo con l'eliminazione avviata e la cartella foto vuota:
-- così non restano mai foto senza proprietario. L'app riconosce i due casi dal suggerimento.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  if not exists (
    select 1 from public.profiles where id = auth.uid() and deletion_requested_at is not null
  ) then
    raise exception 'Eliminazione non avviata' using hint = 'eliminazione_non_avviata';
  end if;
  if exists (
    select 1 from storage.objects where bucket_id = 'capi' and name like auth.uid()::text || '/%'
  ) then
    raise exception 'Nella cartella restano delle foto' using hint = 'foto_rimaste';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
