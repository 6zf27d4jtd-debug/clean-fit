-- Limiti per account: nessun utente può riempire da solo lo spazio gratuito di Supabase (1 GB di foto).
-- Valgono anche per chi chiama l'API direttamente, saltando l'app.

-- Al massimo 300 capi per utente. Il blocco per utente mette in fila due salvataggi contemporanei,
-- così non superano il limite insieme. L'app riconosce l'errore dal suggerimento 'limite_capi'.
create function public.check_item_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('items:' || new.user_id::text, 0));
  if (select count(*) from public.items where user_id = new.user_id) >= 300 then
    raise exception 'Hai raggiunto il limite di 300 capi' using hint = 'limite_capi';
  end if;
  return new;
end;
$$;

revoke all on function public.check_item_limit() from public, anon, authenticated;

create trigger check_item_limit
  before insert on public.items
  for each row execute function public.check_item_limit();

-- Al massimo 650 file nella cartella foto dell'utente: fronte e retro di 300 capi (600)
-- più un margine per i file rimasti da salvataggi interrotti. Conta solo i file che l'utente
-- vede già (policy di lettura), cioè quelli della sua cartella.
create function public.photo_folder_has_room()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*) < 650
  from storage.objects
  where bucket_id = 'capi' and name like (select auth.uid())::text || '/%';
$$;

revoke execute on function public.photo_folder_has_room() from public, anon;
grant execute on function public.photo_folder_has_room() to authenticated;

drop policy "foto personali: caricamento" on storage.objects;

create policy "foto personali: caricamento" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'capi'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.photo_folder_has_room()
  );
