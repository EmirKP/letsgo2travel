-- Only aggregate counters; no flight numbers, dates or booking references.
create table if not exists public.flight_lookup_quota (
  bucket text not null,
  scope text not null,
  user_id uuid references auth.users(id) on delete cascade,
  uses integer not null default 0 check (uses >= 0),
  primary key (bucket, scope)
);
alter table public.flight_lookup_quota enable row level security;
revoke all on public.flight_lookup_quota from public, anon, authenticated;

create or replace function public.consume_flight_lookup_quota(p_user uuid, p_monthly_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  utc_now timestamp := now() at time zone 'UTC';
  month_bucket text := to_char(utc_now, 'YYYY-MM');
  day_bucket text := to_char(utc_now, 'YYYY-MM-DD');
  minute_bucket text := to_char(utc_now, 'YYYY-MM-DD HH24:MI');
begin
  -- A readiness probe never changes counters.
  if p_user is null or p_monthly_limit is null or p_monthly_limit < 1 or p_monthly_limit > 10000 then return false; end if;
  perform pg_advisory_xact_lock(726092709000);
  delete from public.flight_lookup_quota where bucket < month_bucket
    or (scope='minute' and bucket < minute_bucket)
    or (user_id is not null and bucket < day_bucket);
  if coalesce((select uses from public.flight_lookup_quota where bucket=month_bucket and scope='global'),0) >= p_monthly_limit
    or coalesce((select uses from public.flight_lookup_quota where bucket=day_bucket and scope=p_user::text),0) >= 10
    or coalesce((select uses from public.flight_lookup_quota where bucket=minute_bucket and scope='minute'),0) >= 20 then return false; end if;
  insert into public.flight_lookup_quota(bucket,scope,user_id,uses)
    values(month_bucket,'global',null,1),(day_bucket,p_user::text,p_user,1),(minute_bucket,'minute',null,1)
    on conflict(bucket,scope) do update set uses=public.flight_lookup_quota.uses+1;
  return true;
end;
$$;
revoke all on function public.consume_flight_lookup_quota(uuid,integer) from public, anon, authenticated;
grant execute on function public.consume_flight_lookup_quota(uuid,integer) to service_role;
