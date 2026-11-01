-- Fase 5 — Outfit
-- Le categorie "sopra" che si portano sotto un altro capo (strato): t-shirt e longsleeve sotto felpe e camicie, mai il contrario.

alter table public.categories
  add column underlayer boolean not null default false;

-- Solo una categoria "sopra" può essere uno strato
alter table public.categories
  add constraint categories_underlayer_sopra check (not underlayer or role = 'sopra');

-- Account esistenti: le categorie predefinite che si portano sotto
update public.categories
set underlayer = true
where role = 'sopra' and lower(name) in ('t-shirt', 'longsleeve');

-- Nuovi account: come prima, con T-shirt e Longsleeve già segnate come strato
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.categories (user_id, name, role, position, underlayer)
  values
    (new.id, 'Giubbotti', 'capospalla', 0, false),
    (new.id, 'Felpe', 'sopra', 1, false),
    (new.id, 'T-shirt', 'sopra', 2, true),
    (new.id, 'Longsleeve', 'sopra', 3, true),
    (new.id, 'Camicie', 'sopra', 4, false),
    (new.id, 'Pantaloni lunghi', 'sotto', 5, false),
    (new.id, 'Pantaloncini', 'sotto', 6, false),
    (new.id, 'Scarpe', 'scarpe', 7, false),
    (new.id, 'Accessori', 'accessorio', 8, false);

  return new;
end;
$$;
