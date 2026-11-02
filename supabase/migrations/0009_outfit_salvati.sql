-- Outfit salvati (da indossare quando si vuole) e occasioni per raggrupparli.
-- Separati dallo Storico (outfits/outfit_items): lo Storico è un diario e non cambia se si modifica un outfit salvato.
-- Stesso schema delle altre tabelle: RLS per utente e chiavi esterne composte (id, user_id) contro i collegamenti
-- tra utenti diversi.

create table public.occasions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.saved_outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Facoltativo: senza nome l'app mostra le occasioni e la data
  name text check (name is null or char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index saved_outfits_user_idx on public.saved_outfits (user_id, created_at desc);

-- Un capo per posto. Se il capo viene eliminato dall'armadio sparisce dall'outfit, che resta "incompleto".
create table public.saved_outfit_items (
  saved_outfit_id uuid not null,
  item_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slot text not null check (slot in ('capospalla', 'sopra', 'strato', 'sotto', 'scarpe')),
  primary key (saved_outfit_id, slot),
  unique (saved_outfit_id, item_id),
  foreign key (saved_outfit_id, user_id) references public.saved_outfits (id, user_id) on delete cascade,
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);
create index saved_outfit_items_item_idx on public.saved_outfit_items (item_id);

-- Un outfit può stare in più occasioni; eliminare un'occasione non elimina gli outfit
create table public.saved_outfit_occasions (
  saved_outfit_id uuid not null,
  occasion_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (saved_outfit_id, occasion_id),
  foreign key (saved_outfit_id, user_id) references public.saved_outfits (id, user_id) on delete cascade,
  foreign key (occasion_id, user_id) references public.occasions (id, user_id) on delete cascade
);
create index saved_outfit_occasions_occasion_idx on public.saved_outfit_occasions (occasion_id);

alter table public.occasions enable row level security;
alter table public.saved_outfits enable row level security;
alter table public.saved_outfit_items enable row level security;
alter table public.saved_outfit_occasions enable row level security;

create policy "occasioni personali" on public.occasions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "outfit salvati personali" on public.saved_outfits
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "capi degli outfit salvati personali" on public.saved_outfit_items
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "occasioni degli outfit salvati personali" on public.saved_outfit_occasions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Limiti per account, come per i capi (0007): al massimo 300 outfit salvati e 50 occasioni.
create function public.check_saved_outfit_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('saved_outfits:' || new.user_id::text, 0));
  if (select count(*) from public.saved_outfits where user_id = new.user_id) >= 300 then
    raise exception 'Hai raggiunto il limite di 300 outfit salvati' using hint = 'limite_outfit';
  end if;
  return new;
end;
$$;

create function public.check_occasion_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('occasions:' || new.user_id::text, 0));
  if (select count(*) from public.occasions where user_id = new.user_id) >= 50 then
    raise exception 'Hai raggiunto il limite di 50 occasioni' using hint = 'limite_occasioni';
  end if;
  return new;
end;
$$;

revoke all on function public.check_saved_outfit_limit() from public, anon, authenticated;
revoke all on function public.check_occasion_limit() from public, anon, authenticated;

create trigger check_saved_outfit_limit
  before insert on public.saved_outfits
  for each row execute function public.check_saved_outfit_limit();

create trigger check_occasion_limit
  before insert on public.occasions
  for each row execute function public.check_occasion_limit();

-- Crea (outfit vuoto) o aggiorna un outfit salvato: nome, capi e occasioni in un'unica transazione.
-- pieces: [{"slot": "sopra", "item_id": "…"}, …]. Sopra, Sotto e Scarpe sono obbligatori.
-- security invoker: valgono le RLS, quindi si toccano solo i propri outfit, capi e occasioni.
create function public.save_outfit(outfit uuid, outfit_name text, pieces jsonb, occasion_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved uuid;
begin
  if (select count(*) from jsonb_to_recordset(pieces) as p(slot text, item_id uuid)
      where p.slot in ('sopra', 'sotto', 'scarpe')) < 3 then
    raise exception 'Servono Sopra, Sotto e Scarpe';
  end if;

  if outfit is null then
    insert into public.saved_outfits (name) values (nullif(trim(outfit_name), '')) returning id into saved;
  else
    update public.saved_outfits set name = nullif(trim(outfit_name), ''), updated_at = now()
    where id = outfit returning id into saved;
    if saved is null then
      raise exception 'Outfit non trovato';
    end if;
    delete from public.saved_outfit_items where saved_outfit_id = saved;
  end if;

  insert into public.saved_outfit_items (saved_outfit_id, item_id, slot)
  select saved, p.item_id, p.slot from jsonb_to_recordset(pieces) as p(slot text, item_id uuid);

  delete from public.saved_outfit_occasions
  where saved_outfit_id = saved and occasion_id <> all (occasion_ids);

  insert into public.saved_outfit_occasions (saved_outfit_id, occasion_id)
  select saved, o from unnest(occasion_ids) as o
  on conflict (saved_outfit_id, occasion_id) do nothing;

  return saved;
end;
$$;

revoke execute on function public.save_outfit(uuid, text, jsonb, uuid[]) from public, anon;
grant execute on function public.save_outfit(uuid, text, jsonb, uuid[]) to authenticated;
