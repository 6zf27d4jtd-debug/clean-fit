-- Clean Fit — Fase 3: preferiti, ruolo "escluso" per le categorie, eliminazione di una categoria con spostamento dei capi.
-- Da incollare ed eseguire una volta in Supabase → SQL Editor, dopo 0001_schema.sql.
-- Tutto in una transazione: o va a buon fine tutto, o non cambia niente.

begin;

-- ---------------------------------------------------------------------------
-- Preferiti: cuoricino su ogni capo
-- ---------------------------------------------------------------------------
alter table public.items
  add column favorite boolean not null default false;

create index items_user_favorite_idx on public.items (user_id) where favorite;

-- ---------------------------------------------------------------------------
-- Ruolo "escluso": categorie che non entrano mai negli outfit
-- ---------------------------------------------------------------------------
alter table public.categories
  drop constraint categories_role_check;

alter table public.categories
  add constraint categories_role_check
  check (role in ('sopra', 'sotto', 'scarpe', 'capospalla', 'accessorio', 'escluso'));

-- ---------------------------------------------------------------------------
-- Eliminazione di una categoria: se contiene capi, vanno spostati in un'altra categoria scelta dall'utente.
-- Gira con i permessi di chi la chiama (security invoker): le RLS valgono come sempre, e le chiavi esterne
-- composte (id, user_id) impediscono di spostare capi in una categoria di un altro utente.
-- I capi non vengono mai eliminati da qui: se la categoria non è vuota e manca la destinazione, errore.
-- ---------------------------------------------------------------------------
create function public.delete_category(category uuid, move_to uuid default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if move_to = category then
    raise exception 'La categoria di destinazione deve essere diversa';
  end if;

  if move_to is not null then
    update public.items set category_id = move_to, updated_at = now() where category_id = category;
  end if;

  -- Con capi rimasti, la chiave esterna (on delete restrict) blocca l'eliminazione
  delete from public.categories where id = category;
  if not found then
    raise exception 'Categoria non trovata';
  end if;
end;
$$;

revoke execute on function public.delete_category(uuid, uuid) from public, anon;
grant execute on function public.delete_category(uuid, uuid) to authenticated;

commit;
