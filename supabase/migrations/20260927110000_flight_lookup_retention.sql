-- Provider contents stay out of the durable personal trip and native reminders.
-- Five days leaves a two-day margin for the externally monitored daily purge.
begin;

alter table public.trips
  add column flight_lookup_managed boolean not null default false,
  add column flight_lookup_receipt_id uuid unique,
  add column flight_lookup_expires_at timestamptz,
  alter column destination_country drop not null,
  alter column destination_code drop not null;

alter table public.trips
  add constraint trips_manual_destination_required check (
    flight_lookup_managed or (destination_country is not null and destination_code is not null)
  ),
  add constraint trips_flight_lookup_metadata check (
    (flight_lookup_managed and flight_lookup_receipt_id is not null and flight_lookup_expires_at is not null)
    or (not flight_lookup_managed and flight_lookup_receipt_id is null and flight_lookup_expires_at is null)
  ),
  add constraint trips_flight_lookup_base_has_no_provider_contents check (
    not flight_lookup_managed or (
      destination_country is null and destination_code is null and destination_city is null
      and departure_at is null and arrival_at is null and origin_iata is null
      and destination_iata is null and airline is null
      and flight_number is not null and flight_number ~ '^[A-Z0-9]{2,8}$'
    )
  );

create or replace function public.guard_flight_lookup_trip()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  trusted boolean := current_user = 'service_role' or current_user = (
    select pg_catalog.pg_get_userbyid(c.relowner) from pg_catalog.pg_class c
    where c.oid = 'public.trips'::regclass
  );
begin
  if tg_op = 'INSERT' then
    if not trusted and (new.flight_lookup_managed or new.flight_lookup_receipt_id is not null or new.flight_lookup_expires_at is not null) then
      raise exception 'flight_lookup_server_write_required' using errcode = '42501';
    end if;
  else
    if not trusted and (
      new.flight_lookup_managed is distinct from old.flight_lookup_managed
      or new.flight_lookup_receipt_id is distinct from old.flight_lookup_receipt_id
      or new.flight_lookup_expires_at is distinct from old.flight_lookup_expires_at
    ) then
      raise exception 'flight_lookup_server_write_required' using errcode = '42501';
    end if;
    -- A receipt cannot be transferred, relabelled as manual, or given a new TTL.
    -- These are invariants even for a privileged maintenance writer.
    if old.flight_lookup_managed and (
      not new.flight_lookup_managed or new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.flight_number is distinct from old.flight_number
      or new.start_date is distinct from old.start_date
      or new.flight_lookup_receipt_id is distinct from old.flight_lookup_receipt_id
      or new.flight_lookup_expires_at is distinct from old.flight_lookup_expires_at
    ) then
      raise exception 'flight_lookup_identity_immutable' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_flight_lookup_trip() from public, anon, authenticated;
create trigger trips_guard_flight_lookup
before insert or update on public.trips
for each row execute function public.guard_flight_lookup_trip();

create table public.trip_flight_provider_data (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null unique,
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  data jsonb not null,
  constraint trip_flight_provider_retention_window check (
    isfinite(fetched_at) and isfinite(expires_at)
    and expires_at > fetched_at and expires_at <= fetched_at + interval '5 days'
  ),
  constraint trip_flight_provider_data_bounded check (
    jsonb_typeof(data) = 'object' and octet_length(data::text) <= 16384
  )
);
create index trip_flight_provider_data_expiry_idx on public.trip_flight_provider_data(expires_at);
create index trip_flight_provider_data_user_idx on public.trip_flight_provider_data(user_id);
alter table public.trip_flight_provider_data enable row level security;
revoke all on public.trip_flight_provider_data from public, anon, authenticated;
grant all on public.trip_flight_provider_data to service_role;

create table public.flight_lookup_retention_health (
  singleton boolean primary key default true check (singleton),
  last_purged_at timestamptz not null check (isfinite(last_purged_at))
);
alter table public.flight_lookup_retention_health enable row level security;
revoke all on public.flight_lookup_retention_health from public, anon, authenticated;
grant all on public.flight_lookup_retention_health to service_role;
insert into public.flight_lookup_retention_health(singleton, last_purged_at) values (true, now());

create or replace function public.guard_trip_flight_provider_data()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.trips t where t.id = new.trip_id and t.user_id = new.user_id
      and t.flight_lookup_managed and t.flight_lookup_receipt_id = new.receipt_id
      and t.flight_lookup_expires_at = new.expires_at and t.status in ('upcoming', 'active')
  ) then
    raise exception 'flight_lookup_sidecar_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_trip_flight_provider_data() from public, anon, authenticated;
create trigger trip_flight_provider_data_guard
before insert or update on public.trip_flight_provider_data
for each row execute function public.guard_trip_flight_provider_data();

create or replace function public.clear_finished_trip_flight_data()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.flight_lookup_managed and new.status in ('completed', 'cancelled') then
    delete from public.trip_flight_provider_data where trip_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.clear_finished_trip_flight_data() from public, anon, authenticated;
create trigger trips_clear_finished_flight_data
after update of status on public.trips
for each row execute function public.clear_finished_trip_flight_data();

create or replace function public.read_cockpit_flight_details(p_trip_ids uuid[])
returns table(trip_id uuid, data jsonb, fetched_at timestamptz, expires_at timestamptz)
language plpgsql security definer stable set search_path = '' as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then return; end if;
  if coalesce(cardinality(p_trip_ids), 0) > 100 then
    raise exception 'flight_lookup_too_many_ids' using errcode = '22023';
  end if;
  return query
    select d.trip_id, d.data, d.fetched_at, d.expires_at
    from public.trip_flight_provider_data d
    join public.trips t on t.id = d.trip_id and t.user_id = d.user_id
    where d.trip_id = any(p_trip_ids) and d.user_id = viewer
      and d.expires_at > now() and t.status in ('upcoming', 'active')
      and t.flight_lookup_managed and t.flight_lookup_receipt_id = d.receipt_id
      and t.flight_lookup_expires_at = d.expires_at;
end;
$$;
revoke all on function public.read_cockpit_flight_details(uuid[]) from public, anon;
grant execute on function public.read_cockpit_flight_details(uuid[]) to authenticated, service_role;

create or replace function public.create_flight_lookup_trip(
  p_user uuid,
  p_receipt_id uuid,
  p_flight_number text,
  p_start_date date,
  p_end_date date,
  p_flight_pnr text,
  p_checklist_items jsonb,
  p_app_language text,
  p_flight jsonb,
  p_fetched_at timestamptz,
  p_expires_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.trips%rowtype;
  provider public.trip_flight_provider_data%rowtype;
  created public.trips%rowtype;
begin
  if not public.flight_lookup_retention_ready() then
    raise exception 'flight_lookup_retention_unavailable' using errcode = '55000';
  end if;
  if p_user is null or p_receipt_id is null or p_flight_number is null
    or p_flight_number !~ '^[A-Z0-9]{2,8}$' or p_start_date is null or p_end_date is null
    or not isfinite(p_start_date) or not isfinite(p_end_date)
    or p_end_date < p_start_date or p_end_date > current_date + 730
    or p_start_date < current_date - 1
    or p_flight is null or jsonb_typeof(p_flight) <> 'object' or octet_length(p_flight::text) > 16384
    or p_fetched_at is null or p_expires_at is null
    or not isfinite(p_fetched_at) or not isfinite(p_expires_at)
    or p_fetched_at > now() + interval '1 minute'
    or p_expires_at <= p_fetched_at or p_expires_at > p_fetched_at + interval '5 days'
    or p_expires_at <= now()
    or p_app_language is null or p_app_language not in ('tr', 'en')
    or (p_checklist_items is not null and (
      jsonb_typeof(p_checklist_items) <> 'array' or octet_length(p_checklist_items::text) > 65536
    )) then
    raise exception 'flight_lookup_invalid_input' using errcode = '22023';
  end if;

  -- Serialize retries and quota checks without storing another copy of contents.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_receipt_id::text, 27110000));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text, 27110001));
  select * into existing from public.trips where flight_lookup_receipt_id = p_receipt_id;
  if found then
    if existing.user_id <> p_user then
      raise exception 'flight_lookup_receipt_unavailable' using errcode = '42501';
    end if;
    select * into provider from public.trip_flight_provider_data where trip_id = existing.id;
    if not found or provider.expires_at <= now() or existing.status not in ('upcoming', 'active') then
      raise exception 'flight_lookup_receipt_expired' using errcode = '22023';
    end if;
    if existing.flight_number <> p_flight_number or existing.start_date <> p_start_date
      or provider.fetched_at <> p_fetched_at or provider.expires_at <> p_expires_at
      or provider.data <> p_flight then
      raise exception 'flight_lookup_receipt_mismatch' using errcode = '22023';
    end if;
    return to_jsonb(existing);
  end if;
  if (select count(*) from public.trip_flight_provider_data where user_id = p_user and expires_at > now()) >= 100 then
    raise exception 'flight_lookup_trip_limit' using errcode = '54000';
  end if;

  insert into public.trips (
    user_id, destination_country, destination_code, destination_city,
    start_date, end_date, departure_at, arrival_at, origin_iata, destination_iata, airline,
    flight_number, flight_pnr, checklist_items, app_language,
    flight_lookup_managed, flight_lookup_receipt_id, flight_lookup_expires_at
  ) values (
    p_user, null, null, null, p_start_date, p_end_date, null, null, null, null, null,
    p_flight_number, nullif(p_flight_pnr, ''), coalesce(p_checklist_items, '[]'::jsonb), p_app_language,
    true, p_receipt_id, p_expires_at
  ) returning * into created;
  insert into public.trip_flight_provider_data(trip_id, user_id, receipt_id, fetched_at, expires_at, data)
    values (created.id, p_user, p_receipt_id, p_fetched_at, p_expires_at, p_flight);
  return to_jsonb(created);
end;
$$;
revoke all on function public.create_flight_lookup_trip(uuid,uuid,text,date,date,text,jsonb,text,jsonb,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.create_flight_lookup_trip(uuid,uuid,text,date,date,text,jsonb,text,jsonb,timestamptz,timestamptz) to service_role;

create or replace function public.purge_expired_trip_flight_data()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  removed integer;
begin
  delete from public.trip_flight_provider_data d
  using public.trips t
  where t.id = d.trip_id and (d.expires_at <= now() or t.status in ('completed', 'cancelled'));
  get diagnostics removed = row_count;
  insert into public.flight_lookup_retention_health(singleton, last_purged_at) values (true, now())
    on conflict (singleton) do update set last_purged_at = excluded.last_purged_at;
  return removed;
end;
$$;
revoke all on function public.purge_expired_trip_flight_data() from public, anon, authenticated;
grant execute on function public.purge_expired_trip_flight_data() to service_role;

create or replace function public.flight_lookup_retention_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from pg_catalog.pg_class where oid = 'public.trip_flight_provider_data'::regclass and relrowsecurity
  ) and exists (
    select 1 from public.flight_lookup_retention_health
    where singleton and last_purged_at > now() - interval '26 hours'
      and last_purged_at <= now() + interval '1 minute'
  ) and exists (
    select 1 from pg_catalog.pg_trigger where tgrelid = 'public.trips'::regclass
      and tgname = 'trips_guard_flight_lookup' and tgenabled <> 'D'
  ) and exists (
    select 1 from pg_catalog.pg_trigger where tgrelid = 'public.trips'::regclass
      and tgname = 'trips_clear_finished_flight_data' and tgenabled <> 'D'
  );
$$;
revoke all on function public.flight_lookup_retention_ready() from public, anon, authenticated;
grant execute on function public.flight_lookup_retention_ready() to service_role;

comment on table public.trip_flight_provider_data is
  'Private, expiring flight lookup contents. No authenticated table access; owner-only unexpired read RPC.';
comment on column public.trips.flight_lookup_receipt_id is
  'Non-content replay sentinel retained after provider contents are purged.';
comment on column public.trips.flight_lookup_expires_at is
  'Immutable server-issued expiry metadata, not an extension of provider content retention.';
commit;
