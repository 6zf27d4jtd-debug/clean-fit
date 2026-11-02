-- Registrazione solo su invito.
-- Il controllo sta nel database (trigger su auth.users), non nell'app: vale anche per chi chiama
-- l'API di Supabase direttamente con la chiave pubblica, saltando l'app.

-- Codici d'invito. Nessuna policy RLS: dal browser non si leggono né si modificano;
-- li usa solo il trigger qui sotto. Si creano dall'SQL Editor (vedi istruzioni nel repository).
create table public.invite_codes (
  -- 12 caratteri esadecimali casuali (48 bit): impossibili da indovinare per tentativi
  code text primary key default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    check (code ~ '^[A-Z0-9]{8,32}$'),
  note text,
  -- Vuoto = senza limite di usi
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  -- Vuoto = non scade
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;
revoke all on public.invite_codes from anon, authenticated;

-- Prima di creare un utente: il codice (inviato dall'app nei metadati della registrazione) deve esistere,
-- non essere scaduto né esaurito. Il contatore sale nella stessa operazione: due registrazioni
-- contemporanee non superano il limite. Se la registrazione fallisce dopo, anche il contatore torna indietro.
create function public.check_invite_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Maiuscole, senza spazi né trattini: "abcd-1234 ef56" va bene come "ABCD1234EF56"
  supplied text := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'invite_code', ''), '[^A-Za-z0-9]', '', 'g'));
  accepted text;
begin
  update public.invite_codes
  set uses = uses + 1
  where code = supplied
    and (max_uses is null or uses < max_uses)
    and (expires_at is null or expires_at > now())
  returning code into accepted;

  if accepted is null then
    raise exception 'Codice d''invito non valido';
  end if;

  -- Il codice non resta nei dati modificabili dall'utente; si tiene in app_metadata (solo lettura per lui)
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_code';
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('invite_code', accepted);
  return new;
end;
$$;

revoke all on function public.check_invite_code() from public, anon, authenticated;

create trigger check_invite_code
  before insert on auth.users
  for each row execute function public.check_invite_code();
