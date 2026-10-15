begin;
-- Only HMAC identifiers and counters are stored: no IPs, notes or itinerary text.
create table if not exists public.journey_plan_usage (
  scope text primary key check (scope = 'global' or scope ~ '^[a-f0-9]{64}$'),
  day date not null,
  daily_count integer not null check (daily_count between 0 and 200),
  minute timestamptz not null,
  minute_count integer not null check (minute_count between 0 and 10)
);
alter table public.journey_plan_usage enable row level security;
revoke all on public.journey_plan_usage from public, anon, authenticated;
grant all on public.journey_plan_usage to service_role;
create or replace function public.consume_journey_plan_quota(p_actor text, p_guest boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_minute timestamptz := date_trunc('minute', now());
  v_limit integer := case when p_guest then 3 else 10 end;
  v_scope text;
begin
  if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_guest is null then return false; end if;
  -- Serialize both budgets in one transaction, including previously absent rows.
  perform pg_advisory_xact_lock(630141500);
  delete from public.journey_plan_usage where day < v_day - 7;
  if exists(select 1 from public.journey_plan_usage where scope = 'global'
      and ((day = v_day and daily_count >= 200) or (minute = v_minute and minute_count >= 10)))
    or exists(select 1 from public.journey_plan_usage where scope = p_actor
      and ((day = v_day and daily_count >= v_limit) or (minute = v_minute and minute_count >= 2))) then return false; end if;
  foreach v_scope in array array['global', p_actor] loop
    insert into public.journey_plan_usage(scope, day, daily_count, minute, minute_count)
      values(v_scope, v_day, 1, v_minute, 1)
    on conflict(scope) do update set day = v_day,
      daily_count = case when journey_plan_usage.day = v_day then journey_plan_usage.daily_count + 1 else 1 end,
      minute = v_minute, minute_count = case when journey_plan_usage.minute = v_minute then journey_plan_usage.minute_count + 1 else 1 end;
  end loop;
  return true;
end;
$$;
revoke all on function public.consume_journey_plan_quota(text, boolean) from public, anon, authenticated;
grant execute on function public.consume_journey_plan_quota(text, boolean) to service_role;
commit;
