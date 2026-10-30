-- Clean Fit — schema iniziale.
-- Da incollare ed eseguire una volta in Supabase → SQL Editor.
-- Ogni utente vede e modifica solo i propri dati (Row Level Security).

-- ---------------------------------------------------------------------------
-- Profili: impostazioni personali
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  recent_days smallint not null default 7 check (recent_days between 0 and 90),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Categorie principali (una per capo), con il ruolo usato dagli outfit
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  role text not null check (role in ('sopra', 'sotto', 'scarpe', 'capospalla', 'accessorio')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Raggruppamenti (facoltativi, multipli): "estiva", "sportiva", "tutto nero"…
-- ---------------------------------------------------------------------------
create table public.groupings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Capi
-- ---------------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  front_path text not null,
  back_path text,
  color text check (char_length(color) <= 40),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- la categoria deve appartenere allo stesso utente; non si elimina una categoria con capi
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict
);
create index items_user_category_idx on public.items (user_id, category_id);

create table public.item_groupings (
  item_id uuid not null,
  grouping_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (item_id, grouping_id),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade,
  foreign key (grouping_id, user_id) references public.groupings (id, user_id) on delete cascade
);
create index item_groupings_grouping_idx on public.item_groupings (grouping_id);

-- ---------------------------------------------------------------------------
-- Outfit scelti (storico)
-- ---------------------------------------------------------------------------
create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  worn_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index outfits_user_worn_idx on public.outfits (user_id, worn_on desc);

create table public.outfit_items (
  outfit_id uuid not null,
  item_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slot text not null check (slot in ('capospalla', 'sopra', 'strato', 'sotto', 'scarpe')),
  primary key (outfit_id, item_id),
  foreign key (outfit_id, user_id) references public.outfits (id, user_id) on delete cascade,
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);
create index outfit_items_item_idx on public.outfit_items (item_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: ogni riga appartiene a chi l'ha creata
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.groupings enable row level security;
alter table public.items enable row level security;
alter table public.item_groupings enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;

create policy "profilo personale" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "categorie personali" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "raggruppamenti personali" on public.groupings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "capi personali" on public.items
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "raggruppamenti dei capi personali" on public.item_groupings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "outfit personali" on public.outfits
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "capi degli outfit personali" on public.outfit_items
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Nuovo account: profilo + categorie predefinite
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.categories (user_id, name, role, position)
  values
    (new.id, 'Giubbotti', 'capospalla', 0),
    (new.id, 'Felpe', 'sopra', 1),
    (new.id, 'T-shirt', 'sopra', 2),
    (new.id, 'Longsleeve', 'sopra', 3),
    (new.id, 'Camicie', 'sopra', 4),
    (new.id, 'Pantaloni lunghi', 'sotto', 5),
    (new.id, 'Pantaloncini', 'sotto', 6),
    (new.id, 'Scarpe', 'scarpe', 7),
    (new.id, 'Accessori', 'accessorio', 8);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Eliminazione account: cancella l'utente e, a cascata, tutti i suoi dati.
-- Le foto vanno rimosse prima dal client tramite l'API Storage.
-- ---------------------------------------------------------------------------
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket privato "capi", una cartella per utente: <user_id>/<item_id>/fronte.webp
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capi', 'capi', false, 2097152, array['image/webp', 'image/png', 'image/jpeg']);

create policy "foto personali: lettura" on storage.objects
  for select to authenticated
  using (bucket_id = 'capi' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "foto personali: caricamento" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capi' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "foto personali: modifica" on storage.objects
  for update to authenticated
  using (bucket_id = 'capi' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "foto personali: eliminazione" on storage.objects
  for delete to authenticated
  using (bucket_id = 'capi' and (storage.foldername(name))[1] = (select auth.uid())::text);
