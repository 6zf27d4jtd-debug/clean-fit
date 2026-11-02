-- Inviti creati dall'app (pagina "Invita amici"), solo per gli amministratori.
-- Il controllo è nel database: ogni funzione verifica che chi chiama sia in app_admins.

-- Amministratori. Nessuna policy RLS: dal browser non si legge né si modifica; si gestisce dall'SQL Editor.
-- (Non un campo di profiles né i metadati utente: quelli l'utente li può modificare da solo.)
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- Chi ha creato il codice (vuoto per quelli creati dall'SQL Editor) e quando è stato disattivato
alter table public.invite_codes
  add column created_by uuid references auth.users (id) on delete set null,
  add column revoked_at timestamptz;

-- Come in 0006, in più rifiuta i codici disattivati
create or replace function public.check_invite_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied text := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'invite_code', ''), '[^A-Za-z0-9]', '', 'g'));
  accepted text;
begin
  update public.invite_codes
  set uses = uses + 1
  where code = supplied
    and revoked_at is null
    and (max_uses is null or uses < max_uses)
    and (expires_at is null or expires_at > now())
  returning code into accepted;

  if accepted is null then
    raise exception 'Codice d''invito non valido';
  end if;

  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_code';
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('invite_code', accepted);
  return new;
end;
$$;

-- L'app la usa per mostrare "Invita amici" nel Profilo; per tutti gli altri restituisce false.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;

-- Nuovo invito: 1 uso, scade tra 7 giorni
create function public.create_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  return query
    insert into public.invite_codes (max_uses, expires_at, created_by)
    values (1, now() + interval '7 days', (select auth.uid()))
    returning invite_codes.code, invite_codes.expires_at;
end;
$$;

-- Tutti gli inviti, i più recenti per primi, con chi si è registrato usando ciascun codice
-- (il trigger check_invite_code salva il codice in app_metadata del nuovo utente).
create function public.list_invites()
returns table (
  code text,
  max_uses int,
  uses int,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz,
  used_by jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  return query
    select i.code, i.max_uses, i.uses, i.expires_at, i.revoked_at, i.created_at,
           coalesce(
             (select jsonb_agg(
                       jsonb_build_object('email', u.email, 'at', u.created_at, 'confirmed', u.email_confirmed_at is not null)
                       order by u.created_at)
              from auth.users u
              where u.raw_app_meta_data ->> 'invite_code' = i.code),
             '[]'::jsonb)
    from public.invite_codes i
    order by i.created_at desc;
end;
$$;

-- Disattiva un codice: da quel momento non serve più per registrarsi
create function public.disable_invite(invite text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  update public.invite_codes set revoked_at = now() where code = invite and revoked_at is null;
  if not found then
    raise exception 'Invito non trovato';
  end if;
end;
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;
revoke execute on function public.list_invites() from public, anon;
grant execute on function public.list_invites() to authenticated;
revoke execute on function public.disable_invite(text) from public, anon;
grant execute on function public.disable_invite(text) to authenticated;
