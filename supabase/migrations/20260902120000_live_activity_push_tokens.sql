-- =====================================================================
-- LIVE ACTIVITY PUSH ALTYAPISI (v9) — HAZIRLANDI, UYGULANMADI
-- Güvenlik: service-role RPC, RLS default-deny, atomik kayıt ve kalıcı
-- monoton kurulum generation fencing'i. Logout isteği kaybolsa bile yeni
-- login daha yüksek generation ile eski hesabın gecikmiş yazımını keser.
-- Teslim: trip + token + event, lease/fencing ve en az-bir-kez semantiği.
-- =====================================================================
begin;

create table if not exists public.live_activity_installation_sessions (
  installation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_epoch uuid not null,
  generation bigint not null check (generation > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_activity_installation_sessions_user_idx
  on public.live_activity_installation_sessions (user_id);

create table if not exists public.live_activity_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_type text not null check (token_type in ('push_to_start', 'activity_update')),
  trip_id uuid references public.trips(id) on delete cascade,
  token text not null check (char_length(token) between 16 and 512),
  installation_id uuid not null,
  session_epoch uuid not null,
  session_generation bigint not null check (session_generation > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_activity_tokens_trip_required
    check (token_type <> 'activity_update' or trip_id is not null),
  constraint live_activity_tokens_unique unique (user_id, token_type, token)
);

create index if not exists live_activity_tokens_user_type_idx
  on public.live_activity_tokens (user_id, token_type) where enabled;
create index if not exists live_activity_tokens_trip_idx
  on public.live_activity_tokens (trip_id) where enabled;
create index if not exists live_activity_tokens_installation_idx
  on public.live_activity_tokens (user_id, installation_id) where enabled;

create unique index if not exists live_activity_push_to_start_single_owner_idx
  on public.live_activity_tokens (token)
  where token_type = 'push_to_start' and enabled;
create unique index if not exists live_activity_pts_single_installation_idx
  on public.live_activity_tokens (installation_id)
  where token_type = 'push_to_start' and enabled;
create unique index if not exists live_activity_update_single_owner_idx
  on public.live_activity_tokens (token)
  where token_type = 'activity_update' and enabled;

-- Logout barları generation protokolüne ek savunmadır ve eski kuşakların
-- açıkça sonlandırıldığını kaydeder.
create table if not exists public.live_activity_epoch_bars (
  installation_id uuid not null,
  epoch uuid not null,
  barred_at timestamptz not null default now(),
  primary key (installation_id, epoch)
);

-- Her login token replay'den önce bunu çağırır. Aynı generation yalnız
-- aynı user+epoch için idempotenttir; düşük veya çakışan generation stale.
-- Daha yüksek generation bütün eski kurulum tokenlarını atomik kapatır.
create or replace function public.begin_live_activity_session(
  p_user_id uuid,
  p_installation_id uuid,
  p_epoch uuid,
  p_generation bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.live_activity_installation_sessions%rowtype;
begin
  if p_user_id is null or p_installation_id is null or p_epoch is null
     or p_generation is null or p_generation < 1 then
    raise exception 'invalid_session';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live_activity_registry', 0));
  if exists (
    select 1 from public.live_activity_epoch_bars
     where installation_id = p_installation_id and epoch = p_epoch
  ) then
    raise exception using errcode = 'LA001', message = 'stale_session_generation';
  end if;
  select * into v_current
    from public.live_activity_installation_sessions
   where installation_id = p_installation_id;

  if not found then
    insert into public.live_activity_installation_sessions
      (installation_id, user_id, session_epoch, generation, active, updated_at)
    values (p_installation_id, p_user_id, p_epoch, p_generation, true, now());
  elsif p_generation < v_current.generation
     or (p_generation = v_current.generation
         and (p_user_id <> v_current.user_id or p_epoch <> v_current.session_epoch)) then
    raise exception using errcode = 'LA001', message = 'stale_session_generation';
  elsif p_generation > v_current.generation then
    update public.live_activity_tokens
       set enabled = false, updated_at = now()
     where installation_id = p_installation_id and enabled;
    update public.live_activity_installation_sessions
       set user_id = p_user_id,
           session_epoch = p_epoch,
           generation = p_generation,
           active = true,
           updated_at = now()
     where installation_id = p_installation_id;
  else
    update public.live_activity_installation_sessions
       set active = true, updated_at = now()
     where installation_id = p_installation_id;
  end if;

  return p_generation;
end;
$$;

create or replace function public.register_live_activity_push_to_start(
  p_user_id uuid,
  p_installation_id uuid,
  p_token text,
  p_epoch uuid,
  p_generation bigint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_installation_id is null or p_epoch is null
     or p_generation is null or p_generation < 1 or p_token is null
     or char_length(p_token) not between 16 and 512 then
    raise exception 'invalid_registration';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_activity_registry', 0));

  if not exists (
    select 1 from public.live_activity_installation_sessions
     where installation_id = p_installation_id
       and user_id = p_user_id and session_epoch = p_epoch
       and generation = p_generation and active
  ) or exists (
    select 1 from public.live_activity_epoch_bars
     where installation_id = p_installation_id and epoch = p_epoch
  ) then
    raise exception using errcode = 'LA001', message = 'stale_session_generation';
  end if;

  update public.live_activity_tokens
     set enabled = false, updated_at = now()
   where token_type = 'push_to_start' and token = p_token
     and user_id <> p_user_id and enabled;
  update public.live_activity_tokens
     set enabled = false, updated_at = now()
   where token_type = 'push_to_start' and installation_id = p_installation_id
     and token <> p_token and enabled;

  insert into public.live_activity_tokens
    (user_id, token_type, token, installation_id, session_epoch, session_generation, enabled, updated_at)
  values
    (p_user_id, 'push_to_start', p_token, p_installation_id, p_epoch, p_generation, true, now())
  on conflict on constraint live_activity_tokens_unique
  do update set enabled = true,
                installation_id = excluded.installation_id,
                session_epoch = excluded.session_epoch,
                session_generation = excluded.session_generation,
                updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Trip sahipliği + güncel session + kota + rotasyon + upsert aynı global
-- kilit ve aynı SQL transaksiyonundadır; bar-kontrolü/upsert TOCTOU yoktur.
create or replace function public.register_live_activity_update(
  p_user_id uuid,
  p_installation_id uuid,
  p_token text,
  p_trip_id uuid,
  p_epoch uuid,
  p_generation bigint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if p_user_id is null or p_installation_id is null or p_trip_id is null
     or p_epoch is null or p_generation is null or p_generation < 1
     or p_token is null or char_length(p_token) not between 16 and 512 then
    raise exception 'invalid_registration';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_activity_registry', 0));

  if not exists (
    select 1 from public.live_activity_installation_sessions
     where installation_id = p_installation_id
       and user_id = p_user_id and session_epoch = p_epoch
       and generation = p_generation and active
  ) or exists (
    select 1 from public.live_activity_epoch_bars
     where installation_id = p_installation_id and epoch = p_epoch
  ) then
    raise exception using errcode = 'LA001', message = 'stale_session_generation';
  end if;
  if not exists (
    select 1 from public.trips where id = p_trip_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'LA003', message = 'trip_forbidden';
  end if;

  update public.live_activity_tokens
     set enabled = false, updated_at = now()
   where token_type = 'activity_update' and token = p_token
     and user_id <> p_user_id and enabled;
  update public.live_activity_tokens
     set enabled = false, updated_at = now()
   where token_type = 'activity_update' and installation_id = p_installation_id
     and trip_id = p_trip_id and token <> p_token and enabled;

  select count(*) into v_count
    from public.live_activity_tokens
   where user_id = p_user_id and token_type = 'activity_update' and enabled;
  if v_count >= 10 then
    update public.live_activity_tokens
       set enabled = false, updated_at = now()
     where id = (
       select id from public.live_activity_tokens
        where user_id = p_user_id and token_type = 'activity_update' and enabled
        order by updated_at asc, id asc limit 1
     );
  end if;

  insert into public.live_activity_tokens
    (user_id, token_type, trip_id, token, installation_id, session_epoch, session_generation, enabled, updated_at)
  values
    (p_user_id, 'activity_update', p_trip_id, p_token, p_installation_id, p_epoch, p_generation, true, now())
  on conflict on constraint live_activity_tokens_unique
  do update set trip_id = excluded.trip_id,
                installation_id = excluded.installation_id,
                session_epoch = excluded.session_epoch,
                session_generation = excluded.session_generation,
                enabled = true,
                updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.deactivate_live_activity_installation(
  p_user_id uuid,
  p_installation_id uuid,
  p_epoch uuid,
  p_generation bigint
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_installation_id is null or p_epoch is null
     or p_generation is null or p_generation < 1 then
    raise exception 'invalid_deactivation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live_activity_registry', 0));

  insert into public.live_activity_epoch_bars (installation_id, epoch)
  values (p_installation_id, p_epoch) on conflict do nothing;
  delete from public.live_activity_epoch_bars
   where installation_id = p_installation_id
     and barred_at < now() - interval '30 days';

  update public.live_activity_installation_sessions
     set active = false, updated_at = now()
   where installation_id = p_installation_id and user_id = p_user_id
     and session_epoch = p_epoch and generation = p_generation;

  update public.live_activity_tokens
     set enabled = false, updated_at = now()
   where user_id = p_user_id and installation_id = p_installation_id
     and session_epoch = p_epoch and session_generation = p_generation
     and enabled;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.begin_live_activity_session(uuid, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.register_live_activity_push_to_start(uuid, uuid, text, uuid, bigint) from public, anon, authenticated;
revoke all on function public.register_live_activity_update(uuid, uuid, text, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.deactivate_live_activity_installation(uuid, uuid, uuid, bigint) from public, anon, authenticated;

create table if not exists public.live_activity_deliveries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token_id uuid not null references public.live_activity_tokens(id) on delete cascade,
  event text not null check (event in ('start', 'end')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'transient_failed', 'permanent_failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claim_token uuid,
  claimed_until timestamptz,
  next_retry_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_activity_deliveries_unique unique (trip_id, token_id, event)
);

create index if not exists live_activity_deliveries_due_idx
  on public.live_activity_deliveries (next_retry_at)
  where status in ('pending', 'transient_failed');
create index if not exists live_activity_deliveries_trip_idx
  on public.live_activity_deliveries (trip_id, event);

alter table public.live_activity_installation_sessions enable row level security;
alter table public.live_activity_tokens enable row level security;
alter table public.live_activity_deliveries enable row level security;
alter table public.live_activity_epoch_bars enable row level security;
revoke all on public.live_activity_installation_sessions from anon, authenticated;
revoke all on public.live_activity_tokens from anon, authenticated;
revoke all on public.live_activity_deliveries from anon, authenticated;
revoke all on public.live_activity_epoch_bars from anon, authenticated;

commit;
