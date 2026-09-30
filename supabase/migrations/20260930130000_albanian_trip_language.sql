-- Add Albanian to ticket preferences and the managed flight creation RPC.
-- The RPC keeps the existing ownership, receipt, quota and retention guards.
begin;

alter table public.trips drop constraint if exists trips_app_language_check;
alter table public.trips add constraint trips_app_language_check
  check (app_language in ('tr', 'en', 'sq'));

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
    or p_app_language is null or p_app_language not in ('tr', 'en', 'sq')
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

commit;
