-- Clean Fit — correzioni dalla revisione della Fase 3.
-- Da incollare ed eseguire una volta in Supabase → SQL Editor, dopo 0002_fase3.sql.
-- Tutte le funzioni girano con i permessi di chi le chiama (security invoker): le RLS valgono come sempre.

begin;

-- ---------------------------------------------------------------------------
-- Modifica di un capo in un'unica transazione: dati del capo e gruppi insieme.
-- Se un passaggio fallisce non cambia niente (prima il capo poteva restare salvato a metà).
-- ---------------------------------------------------------------------------
create function public.update_item(
  item uuid,
  category uuid,
  color text,
  notes text,
  grouping_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.items
  set category_id = category,
      color = nullif(trim(update_item.color), ''),
      notes = nullif(trim(update_item.notes), ''),
      updated_at = now()
  where id = item;
  if not found then
    raise exception 'Capo non trovato';
  end if;

  delete from public.item_groupings
  where item_id = item and grouping_id <> all (grouping_ids);

  insert into public.item_groupings (item_id, grouping_id)
  select item, g from unnest(grouping_ids) as g
  on conflict (item_id, grouping_id) do nothing;
end;
$$;

revoke execute on function public.update_item(uuid, uuid, text, text, uuid[]) from public, anon;
grant execute on function public.update_item(uuid, uuid, text, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Riepiloghi per Home e Gruppi: numero di capi e copertina (foto del capo più recente) calcolati dal database,
-- invece di scaricare tutti i capi nel telefono.
-- ---------------------------------------------------------------------------
create function public.category_summaries()
returns table (id uuid, name text, role text, "position" int, item_count bigint, cover_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.name, c.role, c.position,
         count(i.id),
         (array_agg(i.front_path order by i.created_at desc) filter (where i.id is not null))[1]
  from public.categories c
  left join public.items i on i.category_id = c.id
  group by c.id
  order by c.position, c.name;
$$;

create function public.grouping_summaries()
returns table (id uuid, name text, "position" int, item_count bigint, cover_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.id, g.name, g.position,
         count(i.id),
         (array_agg(i.front_path order by i.created_at desc) filter (where i.id is not null))[1]
  from public.groupings g
  left join public.item_groupings ig on ig.grouping_id = g.id
  left join public.items i on i.id = ig.item_id
  group by g.id
  order by g.position, g.name;
$$;

revoke execute on function public.category_summaries() from public, anon;
grant execute on function public.category_summaries() to authenticated;
revoke execute on function public.grouping_summaries() from public, anon;
grant execute on function public.grouping_summaries() to authenticated;

commit;
