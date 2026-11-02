-- Copertine personalizzate per categorie e gruppi: una foto caricata, oppure la foto di un capo scelto.
-- Tutte e due vuote = "Automatica" (foto dell'ultimo capo aggiunto, come prima).

-- Capo scelto: chiave composta (capo, utente) come nel resto dello schema, così non si può usare il capo di un altro.
-- Se il capo viene eliminato si svuota solo cover_item_id (non user_id) e la copertina torna automatica.
-- Foto caricata: solo nella cartella dell'utente, sotto copertine/ (lo Storage la protegge come le foto dei capi).
alter table public.categories
  add column cover_item_id uuid,
  add column cover_photo_path text,
  add constraint categories_cover_item_fkey
    foreign key (cover_item_id, user_id) references public.items (id, user_id) on delete set null (cover_item_id),
  add constraint categories_cover_one check (cover_item_id is null or cover_photo_path is null),
  add constraint categories_cover_photo_path check (cover_photo_path like user_id::text || '/copertine/%');

alter table public.groupings
  add column cover_item_id uuid,
  add column cover_photo_path text,
  add constraint groupings_cover_item_fkey
    foreign key (cover_item_id, user_id) references public.items (id, user_id) on delete set null (cover_item_id),
  add constraint groupings_cover_one check (cover_item_id is null or cover_photo_path is null),
  add constraint groupings_cover_photo_path check (cover_photo_path like user_id::text || '/copertine/%');

create index categories_cover_item_idx on public.categories (cover_item_id) where cover_item_id is not null;
create index groupings_cover_item_idx on public.groupings (cover_item_id) where cover_item_id is not null;

-- Riepiloghi per Home e Gruppi (come in 0003), con la copertina scelta: prima la foto caricata, poi il capo scelto
-- (solo se sta ancora nella categoria o nel gruppo), altrimenti l'ultimo capo aggiunto.
create or replace function public.category_summaries()
returns table (id uuid, name text, role text, "position" int, item_count bigint, cover_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.name, c.role, c.position,
         count(i.id),
         coalesce(
           c.cover_photo_path,
           (array_agg(i.front_path) filter (where i.id = c.cover_item_id))[1],
           (array_agg(i.front_path order by i.created_at desc) filter (where i.id is not null))[1]
         )
  from public.categories c
  left join public.items i on i.category_id = c.id
  group by c.id
  order by c.position, c.name;
$$;

create or replace function public.grouping_summaries()
returns table (id uuid, name text, "position" int, item_count bigint, cover_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.id, g.name, g.position,
         count(i.id),
         coalesce(
           g.cover_photo_path,
           (array_agg(i.front_path) filter (where i.id = g.cover_item_id))[1],
           (array_agg(i.front_path order by i.created_at desc) filter (where i.id is not null))[1]
         )
  from public.groupings g
  left join public.item_groupings ig on ig.grouping_id = g.id
  left join public.items i on i.id = ig.item_id
  group by g.id
  order by g.position, g.name;
$$;
