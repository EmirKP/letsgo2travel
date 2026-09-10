-- Apple provider credentials are NEVER exposed through client RLS or metadata.
create table if not exists public.apple_account_deletion_authorizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  nonce text not null check (length(nonce) = 43),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz
);

create table if not exists public.apple_account_deletion_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  client_id text not null,
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  encrypted_refresh_token text,
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((revoked_at is null and encrypted_refresh_token is not null)
      or (revoked_at is not null and encrypted_refresh_token is null))
);

alter table public.apple_account_deletion_authorizations enable row level security;
alter table public.apple_account_deletion_grants enable row level security;
revoke all on public.apple_account_deletion_authorizations from public, anon, authenticated;
revoke all on public.apple_account_deletion_grants from public, anon, authenticated;
grant all on public.apple_account_deletion_authorizations to service_role;
grant all on public.apple_account_deletion_grants to service_role;

create or replace function public.begin_apple_deletion_authorization(
  p_user_id uuid, p_session_id uuid, p_state_hash text, p_nonce text, p_identity_signed_in_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('apple-account-deletion:' || p_user_id::text, 0));
  if exists(select 1 from public.account_deletion_jobs where target_user_id = p_user_id and lease_until > now())
    or exists(select 1 from public.apple_account_deletion_authorizations where user_id = p_user_id and consumed_at is not null and expires_at > now())
    or exists(select 1 from public.apple_account_deletion_grants where user_id = p_user_id
      and (p_identity_signed_in_at is null
        or (revoked_at is null and p_identity_signed_in_at <= authorized_at)
        or (revoked_at is not null and p_identity_signed_in_at <= revoked_at)))
    then return false; end if;
  if not exists (select 1 from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id
    and (s.not_after is null or s.not_after > now())) then return false; end if;
  insert into public.apple_account_deletion_authorizations(user_id, session_id, state_hash, nonce)
    values(p_user_id, p_session_id, p_state_hash, p_nonce)
    on conflict(user_id) do update set session_id = excluded.session_id,
      state_hash = excluded.state_hash, nonce = excluded.nonce, created_at = now(),
      expires_at = now() + interval '10 minutes', consumed_at = null
    where apple_account_deletion_authorizations.created_at < now() - interval '1 minute';
  return found;
end;
$$;

create or replace function public.claim_apple_deletion_authorization(p_state_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare claimed public.apple_account_deletion_authorizations%rowtype; owner_id uuid;
begin
  select user_id into owner_id from public.apple_account_deletion_authorizations where state_hash = p_state_hash;
  if owner_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('apple-account-deletion:' || owner_id::text, 0));
  if exists(select 1 from public.account_deletion_jobs where target_user_id = owner_id and lease_until > now()) then return null; end if;
  -- Ninety seconds fences the <=60-second callback, even when the original state is about to expire.
  update public.apple_account_deletion_authorizations a set consumed_at = now(), expires_at = now() + interval '90 seconds'
    where a.state_hash = p_state_hash and a.consumed_at is null and a.expires_at > now()
      and exists(select 1 from auth.sessions s where s.id = a.session_id and s.user_id = a.user_id
        and (s.not_after is null or s.not_after > now()))
    returning a.* into claimed;
  if not found then return null; end if;
  return jsonb_build_object('user_id', claimed.user_id, 'nonce', claimed.nonce, 'state_hash', claimed.state_hash);
end;
$$;

create or replace function public.save_apple_deletion_grant(
  p_state_hash text, p_user_id uuid, p_client_id text, p_subject_hash text,
  p_encrypted_token text, p_identity_signed_in_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('apple-account-deletion:' || p_user_id::text, 0));
  if exists(select 1 from public.account_deletion_jobs where target_user_id = p_user_id and lease_until > now()) then return false; end if;
  -- Row lock prevents another start from replacing this transaction while it is saved.
  perform 1 from public.apple_account_deletion_authorizations a
    where a.state_hash = p_state_hash and a.user_id = p_user_id
      and a.consumed_at is not null and a.expires_at > now()
      and exists(select 1 from auth.sessions s where s.id = a.session_id and s.user_id = a.user_id
        and (s.not_after is null or s.not_after > now())) for update;
  if not found then return false; end if;
  insert into public.apple_account_deletion_grants(user_id, client_id, subject_hash, encrypted_refresh_token)
    values(p_user_id, p_client_id, p_subject_hash, p_encrypted_token)
    on conflict(user_id) do update set id = gen_random_uuid(), client_id = excluded.client_id,
      subject_hash = excluded.subject_hash, encrypted_refresh_token = excluded.encrypted_refresh_token,
      authorized_at = now(), revoked_at = null
    where apple_account_deletion_grants.revoked_at is null
      or p_identity_signed_in_at > apple_account_deletion_grants.revoked_at;
  if not found then return false; end if;
  delete from public.apple_account_deletion_authorizations where state_hash = p_state_hash;
  return true;
end;
$$;

revoke all on function public.begin_apple_deletion_authorization(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.claim_apple_deletion_authorization(text) from public, anon, authenticated;
revoke all on function public.save_apple_deletion_grant(text,uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.begin_apple_deletion_authorization(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.claim_apple_deletion_authorization(text) to service_role;
grant execute on function public.save_apple_deletion_grant(text,uuid,text,text,text,timestamptz) to service_role;

comment on table public.apple_account_deletion_grants is
  'Service-only AES-256-GCM Apple refresh credentials for user-requested account deletion. Token is cleared on revocation; row cascades on account deletion.';
