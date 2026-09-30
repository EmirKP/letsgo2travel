-- Personal copies of selected itineraries/budget estimates; never provider flight data.
create table if not exists public.trip_journey_details (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  route_snapshot jsonb,
  budget_snapshot jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  constraint journey_route_shape check (route_snapshot is null or (
    jsonb_typeof(route_snapshot) = 'object' and octet_length(route_snapshot::text) <= 80000
    and coalesce(route_snapshot->>'kind','') = 'saved-route'
    and coalesce(route_snapshot->>'ownerId','') = owner_id::text
  )),
  constraint journey_budget_shape check (budget_snapshot is null or (
    jsonb_typeof(budget_snapshot) = 'object' and octet_length(budget_snapshot::text) <= 20000
    and coalesce(budget_snapshot->>'kind','') = 'city-budget'
    and coalesce(budget_snapshot->>'ownerId','') = owner_id::text
  ))
);
create index if not exists trip_journey_owner_idx on public.trip_journey_details(owner_id);
alter table public.trip_journey_details enable row level security;
revoke all on public.trip_journey_details from anon;
grant select, insert, update, delete on public.trip_journey_details to authenticated;
drop policy if exists journey_owner_access on public.trip_journey_details;
create policy journey_owner_access on public.trip_journey_details for all to authenticated
  using ((select auth.uid()) = owner_id and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())))
  with check ((select auth.uid()) = owner_id and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())));
create or replace function public.set_trip_journey_updated_at() returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = clock_timestamp(); return new; end;
$$;
drop trigger if exists trip_journey_updated_at on public.trip_journey_details;
create trigger trip_journey_updated_at before update on public.trip_journey_details for each row execute function public.set_trip_journey_updated_at();
-- Lock the parent while attaching so another device cannot change its dates
-- between validation and the snapshot write. Existing snapshots are day-based
-- copies: later trip edits do not rewrite/delete them; the UI warns on mismatch.
create or replace function public.validate_trip_journey_route() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  parent_start date;
  parent_end date;
  route_days jsonb;
begin
  if new.route_snapshot is null then return new; end if;
  select t.start_date, t.end_date into parent_start, parent_end
    from public.trips t where t.id = new.trip_id and t.user_id = new.owner_id
    for update;
  if not found then
    raise exception using errcode = '42501', message = 'Trip ownership could not be verified';
  end if;
  if (new.route_snapshot #>> '{dates,startDate}') is distinct from to_char(parent_start, 'YYYY-MM-DD')
    or (new.route_snapshot #>> '{dates,endDate}') is distinct from to_char(parent_end, 'YYYY-MM-DD') then
    raise exception using errcode = '40001', message = 'Trip dates changed; reload before attaching itinerary';
  end if;
  route_days := new.route_snapshot #> '{route,dailyPlan}';
  if jsonb_typeof(route_days) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Itinerary days are invalid';
  end if;
  if jsonb_array_length(route_days) < 1 or jsonb_array_length(route_days) > parent_end - parent_start + 1 then
    raise exception using errcode = '40001', message = 'Itinerary no longer fits the trip; reload before attaching';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_trip_journey_route() from public, anon, authenticated;
drop trigger if exists trip_journey_validate_route on public.trip_journey_details;
create trigger trip_journey_validate_route
  before insert or update of route_snapshot, trip_id, owner_id on public.trip_journey_details
  for each row execute function public.validate_trip_journey_route();
notify pgrst, 'reload schema';
