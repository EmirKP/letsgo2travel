begin;
-- One successfully delivered AI route per verified account per UTC calendar day.
-- Reservations and provider attempts are separate: a failed generation never
-- spends the account's allowance, but still spends the shared provider budget.
create table if not exists public.ai_route_daily_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  used integer not null default 1 check (used = 1),
  primary key(owner_id, day)
);
create table if not exists public.ai_route_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  kind text not null check(kind in ('journey', 'suggestions')),
  attempt_id uuid not null,
  state text not null check(state in ('pending', 'succeeded', 'failed')),
  result jsonb,
  lease_until timestamptz not null,
  expires_at timestamptz not null,
  primary key(owner_id, operation_id)
);
create index if not exists ai_route_operations_expiry on public.ai_route_operations(expires_at);
create table if not exists public.ai_route_cancelled_attempts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id, attempt_id)
);
create table if not exists public.ai_route_account_attempts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  minute timestamptz not null,
  attempts integer not null check(attempts between 1 and 2)
);
create table if not exists public.ai_route_provider_attempts (
  request_id uuid primary key,
  tokens integer not null check(tokens between 1 and 7500),
  reserved_tokens integer not null check(reserved_tokens between 1 and 7500),
  settled boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists ai_route_provider_attempts_created on public.ai_route_provider_attempts(created_at);
alter table public.ai_route_daily_usage enable row level security;
alter table public.ai_route_operations enable row level security;
alter table public.ai_route_cancelled_attempts enable row level security;
alter table public.ai_route_account_attempts enable row level security;
alter table public.ai_route_provider_attempts enable row level security;
revoke all on public.ai_route_daily_usage, public.ai_route_operations, public.ai_route_cancelled_attempts, public.ai_route_account_attempts, public.ai_route_provider_attempts from public, anon, authenticated;
grant all on public.ai_route_daily_usage, public.ai_route_operations, public.ai_route_cancelled_attempts, public.ai_route_account_attempts, public.ai_route_provider_attempts to service_role;

-- Preserve recent account successes and their private replay receipts on upgrade.
-- The existing HMAC input hash is intentionally unchanged for journey requests.
insert into public.ai_route_daily_usage(owner_id, day)
  select distinct o.owner_id, r.day from public.journey_plan_operations o
  join public.journey_plan_reservations r on r.request_id=o.attempt_id
  where o.owner_id is not null and o.state='succeeded' and r.state='succeeded'
  on conflict do nothing;
insert into public.ai_route_operations(owner_id,operation_id,request_hash,kind,attempt_id,state,result,lease_until,expires_at)
  select owner_id,operation_id,request_hash,'journey',attempt_id,state,result,lease_until,expires_at
  from public.journey_plan_operations where owner_id is not null and state='succeeded' and expires_at>clock_timestamp()
  on conflict do nothing;

create or replace function public.get_ai_route_quota(p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_day date := (v_now at time zone 'UTC')::date;
  v_used integer;
  v_pending boolean;
begin
  if p_owner is null or not exists(select 1 from auth.users where id=p_owner) then return null; end if;
  select count(*)::integer into v_used from public.ai_route_daily_usage where owner_id=p_owner and day=v_day;
  v_pending:=exists(select 1 from public.ai_route_operations where owner_id=p_owner and state='pending' and lease_until>v_now and expires_at>v_now);
  return jsonb_build_object('limit',1,'used',v_used,'remaining',case when v_used=1 or v_pending then 0 else 1 end,'timeZone','UTC',
    'pending',v_pending,
    'resetAt',to_char((v_day+1)::timestamp,'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end;
$$;

create or replace function public.begin_ai_route_operation(p_owner uuid,p_operation uuid,p_hash text,p_kind text,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_now timestamptz;
  v_minute timestamptz;
  v_row public.ai_route_operations%rowtype;
  v_quota jsonb;
begin
  if p_owner is null or p_operation is null or p_attempt is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
    or p_kind is null or p_kind not in ('journey','suggestions') or not exists(select 1 from auth.users where id=p_owner) then
    return jsonb_build_object('state','invalid');
  end if;
  perform pg_advisory_xact_lock(630181200);
  v_now:=clock_timestamp(); v_minute:=date_trunc('minute',v_now);
  v_quota:=public.get_ai_route_quota(p_owner);
  select * into v_row from public.ai_route_operations where owner_id=p_owner and operation_id=p_operation;
  if found then
    if v_row.request_hash<>p_hash or v_row.kind<>p_kind then return jsonb_build_object('state','conflict','quota',v_quota); end if;
    if v_row.expires_at<=v_now then return jsonb_build_object('state','expired','quota',v_quota); end if;
    if v_row.state='succeeded' then return jsonb_build_object('state','succeeded','result',v_row.result,'quota',v_quota); end if;
    if v_row.state='pending' and v_row.lease_until>v_now then return jsonb_build_object('state','pending','quota',v_quota); end if;
  end if;
  if exists(select 1 from public.ai_route_cancelled_attempts where owner_id=p_owner and attempt_id=p_attempt) then return jsonb_build_object('state','cancelled','quota',v_quota); end if;
  if (v_quota->>'used')::integer>=1 then return jsonb_build_object('state','limit','quota',v_quota); end if;
  -- Across both endpoints, and across midnight, only one live worker per owner.
  if (v_quota->>'pending')::boolean then return jsonb_build_object('state','pending','quota',v_quota); end if;
  if exists(select 1 from public.ai_route_account_attempts where owner_id=p_owner and minute=v_minute and attempts>=2) then
    return jsonb_build_object('state','busy','retryAfterSeconds',greatest(1,ceil(extract(epoch from v_minute+interval '1 minute'-v_now))::integer),'quota',v_quota);
  end if;
  -- Retain expired identity tombstones briefly, but erase the private result at
  -- its 24-hour recovery deadline when the next admission runs.
  update public.ai_route_operations set result=null where expires_at<=v_now and result is not null;
  delete from public.ai_route_operations where expires_at<v_now-interval '7 days';
  delete from public.ai_route_cancelled_attempts where created_at<v_now-interval '7 days';
  delete from public.ai_route_daily_usage where day<(v_now at time zone 'UTC')::date-7;
  insert into public.ai_route_account_attempts values(p_owner,v_minute,1)
    on conflict(owner_id) do update set minute=v_minute,attempts=case when ai_route_account_attempts.minute=v_minute then ai_route_account_attempts.attempts+1 else 1 end;
  insert into public.ai_route_operations(owner_id,operation_id,request_hash,kind,attempt_id,state,lease_until,expires_at)
    values(p_owner,p_operation,p_hash,p_kind,p_attempt,'pending',v_now+interval '90 seconds',v_now+interval '24 hours')
    on conflict(owner_id,operation_id) do update set attempt_id=p_attempt,state='pending',result=null,lease_until=v_now+interval '90 seconds';
  return jsonb_build_object('state','acquired','quota',public.get_ai_route_quota(p_owner));
end;
$$;

create or replace function public.complete_ai_route_operation(p_owner uuid,p_operation uuid,p_attempt uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_now timestamptz;
  v_row public.ai_route_operations%rowtype;
begin
  if p_owner is null or p_operation is null or p_attempt is null then return jsonb_build_object('ok',false); end if;
  if p_result is not null and (jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>600000) then return jsonb_build_object('ok',false); end if;
  perform pg_advisory_xact_lock(630181200);
  v_now:=clock_timestamp();
  if not exists(select 1 from auth.users where id=p_owner) then return jsonb_build_object('ok',false); end if;
  -- Failure may arrive before a delayed admission. Tombstone this exact attempt.
  if p_result is null then insert into public.ai_route_cancelled_attempts(owner_id,attempt_id) values(p_owner,p_attempt) on conflict do nothing; end if;
  select * into v_row from public.ai_route_operations where owner_id=p_owner and operation_id=p_operation;
  if not found or v_row.attempt_id<>p_attempt then return jsonb_build_object('ok',p_result is null,'quota',public.get_ai_route_quota(p_owner)); end if;
  if v_row.state='succeeded' then return jsonb_build_object('ok',p_result is not null and p_result=v_row.result,'quota',public.get_ai_route_quota(p_owner)); end if;
  if v_row.state='failed' then return jsonb_build_object('ok',p_result is null,'quota',public.get_ai_route_quota(p_owner)); end if;
  if p_result is null or v_row.lease_until<=v_now or v_row.expires_at<=v_now then
    update public.ai_route_operations set state='failed' where owner_id=p_owner and operation_id=p_operation;
    return jsonb_build_object('ok',p_result is null,'quota',public.get_ai_route_quota(p_owner));
  end if;
  -- Charge the UTC day of successful commit, including a request crossing midnight.
  if exists(select 1 from public.ai_route_daily_usage where owner_id=p_owner and day=(v_now at time zone 'UTC')::date) then return jsonb_build_object('ok',false,'quota',public.get_ai_route_quota(p_owner)); end if;
  insert into public.ai_route_daily_usage(owner_id,day) values(p_owner,(v_now at time zone 'UTC')::date);
  update public.ai_route_operations set state='succeeded',result=p_result where owner_id=p_owner and operation_id=p_operation;
  return jsonb_build_object('ok',true,'quota',public.get_ai_route_quota(p_owner));
end;
$$;

create or replace function public.reserve_ai_route_provider_attempt(p_request uuid,p_tokens integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_now timestamptz;
  v_day timestamptz;
  v_existing public.ai_route_provider_attempts%rowtype;
  v_retry integer;
begin
  if p_request is null or p_tokens is null or p_tokens<1 or p_tokens>7500 then return jsonb_build_object('allowed',false,'window','invalid'); end if;
  perform pg_advisory_xact_lock(630181200);
  v_now:=clock_timestamp(); v_day:=date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
  select * into v_existing from public.ai_route_provider_attempts where request_id=p_request;
  if found then return jsonb_build_object('allowed',v_existing.reserved_tokens=p_tokens and v_existing.created_at>v_now-interval '60 seconds'); end if;
  delete from public.ai_route_provider_attempts where created_at<v_day-interval '1 day';
  if coalesce((select sum(tokens) from public.ai_route_provider_attempts where created_at>=v_day),0)+p_tokens>180000 then
    return jsonb_build_object('allowed',false,'window','day','retryAfterSeconds',greatest(1,ceil(extract(epoch from v_day+interval '1 day'-v_now))::integer));
  end if;
  if coalesce((select sum(tokens) from public.ai_route_provider_attempts where created_at>v_now-interval '60 seconds'),0)+p_tokens>7500 then
    select greatest(1,ceil(extract(epoch from min(created_at)+interval '60 seconds'-v_now))::integer) into v_retry from public.ai_route_provider_attempts where created_at>v_now-interval '60 seconds';
    return jsonb_build_object('allowed',false,'window','minute','retryAfterSeconds',v_retry);
  end if;
  insert into public.ai_route_provider_attempts(request_id,tokens,reserved_tokens,created_at) values(p_request,p_tokens,p_tokens,v_now);
  return jsonb_build_object('allowed',true);
end;
$$;
create or replace function public.settle_ai_route_provider_attempt(p_request uuid,p_tokens integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_row public.ai_route_provider_attempts%rowtype;
begin
  if p_request is null or p_tokens is null or p_tokens<1 then return false; end if;
  perform pg_advisory_xact_lock(630181200);
  select * into v_row from public.ai_route_provider_attempts where request_id=p_request;
  if not found or p_tokens>v_row.reserved_tokens then return false; end if;
  if v_row.settled then return v_row.tokens=p_tokens; end if;
  update public.ai_route_provider_attempts set tokens=p_tokens,settled=true where request_id=p_request;
  return true;
end;
$$;
revoke all on function public.get_ai_route_quota(uuid),public.begin_ai_route_operation(uuid,uuid,text,text,uuid),public.complete_ai_route_operation(uuid,uuid,uuid,jsonb),public.reserve_ai_route_provider_attempt(uuid,integer),public.settle_ai_route_provider_attempt(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_ai_route_quota(uuid),public.begin_ai_route_operation(uuid,uuid,text,text,uuid),public.complete_ai_route_operation(uuid,uuid,uuid,jsonb),public.reserve_ai_route_provider_attempt(uuid,integer),public.settle_ai_route_provider_attempt(uuid,integer) to service_role;
commit;
