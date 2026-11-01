-- Fase 5 — "Da lavare": i capi nel cesto non vengono proposti negli outfit.
-- Vuota = capo pulito; altrimenti il momento in cui è finito nel cesto (per l'ordine del Cesto in Home).

alter table public.items
  add column in_laundry_since timestamptz;

-- Il Cesto si carica in fretta anche con molti capi: l'indice contiene solo quelli da lavare
create index items_laundry_idx on public.items (user_id, in_laundry_since)
  where in_laundry_since is not null;
