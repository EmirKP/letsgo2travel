begin;
-- Existing counters remain immutable attempt budgets, including attempts made
-- before this migration. Receipts separately meter successful/active plans.
create table if not exists public.journey_plan_reservations (
  request_id uuid primary key,
  actor text not null check (actor ~ '^[a-f0-9]{64}$'),
  day date not null,
  state text not null check (state in ('reserved', 'succeeded', 'failed')),
  expires_at timestamptz not null
);
create index if not exists journey_plan_reservations_actor_day
  on public.journey_plan_reservations(actor, day);
alter table public.journey_plan_reservations enable row level security;
revoke all on public.journey_plan_reservations from public, anon, authenticated;
grant all on public.journey_plan_reservations to service_role;

create or replace function public.reserve_journey_plan_quota(p_actor text, p_guest boolean, p_request uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_day date := (v_now at time zone 'UTC')::date;
  v_minute timestamptz := date_trunc('minute', v_now);
  v_limit integer := case when p_guest then 3 else 10 end;
  v_attempt_limit integer := case when p_guest then 12 else 30 end;
  v_scope text;
  v_receipt public.journey_plan_reservations%rowtype;
begin
  if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_guest is null or p_request is null then return false; end if;
  perform pg_advisory_xact_lock(630141500);
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'UTC')::date;
  v_minute := date_trunc('minute', v_now);
  select * into v_receipt from public.journey_plan_reservations where request_id = p_request;
  if found then
    return v_receipt.actor = p_actor and v_receipt.day = v_day and v_receipt.state = 'reserved' and v_receipt.expires_at > v_now;
  end if;
  delete from public.journey_plan_reservations where day < v_day - 7;
  delete from public.journey_plan_usage where day < v_day - 7;
  if exists(select 1 from public.journey_plan_usage where scope = 'global'
      and ((day = v_day and daily_count >= 200) or (minute = v_minute and minute_count >= 10)))
    or exists(select 1 from public.journey_plan_usage where scope = p_actor
      and ((day = v_day and daily_count >= v_attempt_limit) or (minute = v_minute and minute_count >= 2)))
    or (select count(*) from public.journey_plan_reservations where actor = p_actor and day = v_day
      and (state = 'succeeded' or (state = 'reserved' and expires_at > v_now))) >= v_limit then return false; end if;
  foreach v_scope in array array['global', p_actor] loop
    insert into public.journey_plan_usage(scope, day, daily_count, minute, minute_count)
      values(v_scope, v_day, 1, v_minute, 1)
    on conflict(scope) do update set day = v_day,
      daily_count = case when journey_plan_usage.day = v_day then journey_plan_usage.daily_count + 1 else 1 end,
      minute = v_minute, minute_count = case when journey_plan_usage.minute = v_minute then journey_plan_usage.minute_count + 1 else 1 end;
  end loop;
  insert into public.journey_plan_reservations(request_id, actor, day, state, expires_at)
    values(p_request, p_actor, v_day, 'reserved', v_now + interval '2 minutes');
  return true;
end;
$$;

create or replace function public.finish_journey_plan_quota(p_actor text, p_request uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_receipt public.journey_plan_reservations%rowtype;
begin
  if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_request is null or p_success is null then return false; end if;
  perform pg_advisory_xact_lock(630141500);
  v_now := clock_timestamp();
  select * into v_receipt from public.journey_plan_reservations where request_id = p_request;
  if not found then
    if p_success then return false; end if;
    -- A failed/unknown reservation may complete after the HTTP timeout. This
    -- tombstone prevents that late request from consuming an allowance.
    insert into public.journey_plan_reservations(request_id, actor, day, state, expires_at)
      values(p_request, p_actor, (v_now at time zone 'UTC')::date, 'failed', v_now);
    return true;
  end if;
  if v_receipt.actor <> p_actor then return false; end if;
  if v_receipt.state = 'succeeded' then return p_success; end if;
  if v_receipt.state = 'failed' then return not p_success; end if;
  if v_receipt.expires_at <= v_now then
    update public.journey_plan_reservations set state = 'failed' where request_id = p_request;
    return not p_success;
  end if;
  update public.journey_plan_reservations set state = case when p_success then 'succeeded' else 'failed' end where request_id = p_request;
  return true;
end;
$$;
revoke all on function public.reserve_journey_plan_quota(text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.finish_journey_plan_quota(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reserve_journey_plan_quota(text, boolean, uuid) to service_role;
grant execute on function public.finish_journey_plan_quota(text, uuid, boolean) to service_role;
commit;
