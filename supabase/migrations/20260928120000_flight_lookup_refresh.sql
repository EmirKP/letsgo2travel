-- Refresh is an authenticated server operation. Request metadata contains no
-- provider contents and is used to avoid duplicate billable requests.
begin;

create table public.flight_lookup_refresh_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_at timestamptz not null default now(),
  expected_fetched_at timestamptz not null,
  state text not null check (state in ('pending', 'done', 'failed', 'terminal'))
);
create index flight_lookup_refresh_trip_idx on public.flight_lookup_refresh_requests(trip_id, created_at);
alter table public.flight_lookup_refresh_requests enable row level security;
revoke all on public.flight_lookup_refresh_requests from public, anon, authenticated;
grant all on public.flight_lookup_refresh_requests to service_role;

create or replace function public.guard_flight_lookup_trip()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  trusted boolean := current_user = 'service_role' or current_user = (
    select pg_catalog.pg_get_userbyid(c.relowner) from pg_catalog.pg_class c where c.oid = 'public.trips'::regclass
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
    ) then raise exception 'flight_lookup_server_write_required' using errcode = '42501'; end if;
    -- Only a trusted fresh API retrieval may change expiry. Identity never changes.
    if old.flight_lookup_managed and (
      not new.flight_lookup_managed or new.id is distinct from old.id
      or new.user_id is distinct from old.user_id or new.flight_number is distinct from old.flight_number
      or new.start_date is distinct from old.start_date
      or new.flight_lookup_receipt_id is distinct from old.flight_lookup_receipt_id
    ) then raise exception 'flight_lookup_identity_immutable' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.flight_lookup_refresh_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.flight_lookup_retention_ready() and exists (
    select 1 from pg_catalog.pg_class where oid = 'public.flight_lookup_refresh_requests'::regclass and relrowsecurity
  );
$$;
revoke all on function public.flight_lookup_refresh_ready() from public, anon, authenticated;
grant execute on function public.flight_lookup_refresh_ready() to service_role;

-- Retrying the original save after a refresh returns the existing current
-- overlay; it must not reinstate the old signed contents or overwrite notes.
create or replace function public.create_flight_lookup_trip_v3(
  p_user uuid,p_receipt_id uuid,p_flight_number text,p_start_date date,p_end_date date,
  p_flight_pnr text,p_checklist_items jsonb,p_app_language text,p_flight jsonb,p_fetched_at timestamptz,p_expires_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare trip public.trips%rowtype; provider public.trip_flight_provider_data%rowtype; created jsonb;
begin
  if not public.flight_lookup_refresh_ready() then raise exception 'flight_lookup_retention_unavailable' using errcode='55000'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_receipt_id::text,27110000));
  select * into trip from public.trips where flight_lookup_receipt_id=p_receipt_id;
  if found then
    if trip.user_id is distinct from p_user or trip.flight_number is distinct from p_flight_number or trip.start_date is distinct from p_start_date then
      raise exception 'flight_lookup_receipt_unavailable' using errcode='42501';
    end if;
    select * into provider from public.trip_flight_provider_data where trip_id=trip.id and user_id=p_user;
    if not found or provider.expires_at<=now() or trip.status not in ('upcoming','active') then
      raise exception 'flight_lookup_receipt_expired' using errcode='22023';
    end if;
    return jsonb_build_object('trip',to_jsonb(trip),'flight',provider.data,'expiresAt',provider.expires_at);
  end if;
  created := public.create_flight_lookup_trip(p_user,p_receipt_id,p_flight_number,p_start_date,p_end_date,p_flight_pnr,p_checklist_items,p_app_language,p_flight,p_fetched_at,p_expires_at);
  return jsonb_build_object('trip',created,'flight',p_flight,'expiresAt',p_expires_at);
end;
$$;
revoke all on function public.create_flight_lookup_trip_v3(uuid,uuid,text,date,date,text,jsonb,text,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.create_flight_lookup_trip_v3(uuid,uuid,text,date,date,text,jsonb,text,jsonb,timestamptz,timestamptz) to service_role;

create or replace function public.reserve_flight_lookup_refresh(p_user uuid, p_trip_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  trip public.trips%rowtype;
  provider public.trip_flight_provider_data%rowtype;
  attempt public.flight_lookup_refresh_requests%rowtype;
begin
  if not public.flight_lookup_refresh_ready() then return jsonb_build_object('kind','unavailable'); end if;
  if p_user is null or p_trip_id is null or p_request_id is null then return jsonb_build_object('kind','invalid'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 28120000));
  select * into trip from public.trips where id = p_trip_id and user_id = p_user for update;
  if not found or not trip.flight_lookup_managed or trip.status not in ('upcoming','active') then return jsonb_build_object('kind','unavailable'); end if;
  select * into attempt from public.flight_lookup_refresh_requests where request_id = p_request_id;
  if found then
    if attempt.user_id <> p_user or attempt.trip_id <> p_trip_id then return jsonb_build_object('kind','unavailable'); end if;
    if attempt.state = 'terminal' then return jsonb_build_object('kind','terminal','trip',to_jsonb(trip),'flight',null,'expiresAt',null); end if;
    if attempt.state = 'failed' or (attempt.state = 'pending' and attempt.created_at <= now() - interval '30 seconds') then
      update public.flight_lookup_refresh_requests set state='failed' where request_id=p_request_id;
      return jsonb_build_object('kind','failed');
    end if;
    if attempt.state = 'pending' then return jsonb_build_object('kind','busy'); end if;
  end if;
  select * into provider from public.trip_flight_provider_data where trip_id = p_trip_id and user_id = p_user;
  if not found or provider.expires_at <= now() or provider.expires_at <> trip.flight_lookup_expires_at then return jsonb_build_object('kind','unavailable'); end if;
  if attempt.state = 'done' then
    return jsonb_build_object('kind','cached','trip',to_jsonb(trip),'flight',provider.data,'expiresAt',provider.expires_at);
  end if;
  if exists (select 1 from public.flight_lookup_refresh_requests where trip_id=p_trip_id and state='pending' and created_at > now()-interval '30 seconds') then
    return jsonb_build_object('kind','busy');
  end if;
  -- A different UUID cannot defeat the per-trip five-minute cost guard.
  if provider.fetched_at > now()-interval '5 minutes'
    or exists(select 1 from public.flight_lookup_refresh_requests where trip_id=p_trip_id and created_at > now()-interval '5 minutes') then
    return jsonb_build_object('kind','cached','trip',to_jsonb(trip),'flight',provider.data,'expiresAt',provider.expires_at);
  end if;
  insert into public.flight_lookup_refresh_requests(request_id,user_id,trip_id,expected_fetched_at,state)
    values(p_request_id,p_user,p_trip_id,provider.fetched_at,'pending');
  return jsonb_build_object('kind','reserved','trip',to_jsonb(trip),'flight',provider.data,'expiresAt',provider.expires_at);
end;
$$;
revoke all on function public.reserve_flight_lookup_refresh(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_flight_lookup_refresh(uuid,uuid,uuid) to service_role;

create or replace function public.finish_flight_lookup_refresh(
  p_user uuid,p_trip_id uuid,p_request_id uuid,p_flight jsonb,p_fetched_at timestamptz,p_expires_at timestamptz,p_outcome text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  trip public.trips%rowtype;
  provider public.trip_flight_provider_data%rowtype;
  attempt public.flight_lookup_refresh_requests%rowtype;
begin
  select * into trip from public.trips where id=p_trip_id and user_id=p_user for update;
  if not found or not trip.flight_lookup_managed or trip.status not in ('upcoming','active') then return jsonb_build_object('kind','unavailable'); end if;
  select * into attempt from public.flight_lookup_refresh_requests where request_id=p_request_id and user_id=p_user and trip_id=p_trip_id;
  if not found or attempt.state <> 'pending' or attempt.created_at <= now()-interval '30 seconds' then return jsonb_build_object('kind','conflict'); end if;
  if p_outcome = 'failed' then
    update public.flight_lookup_refresh_requests set state='failed' where request_id=p_request_id;
    return jsonb_build_object('kind','failed');
  end if;
  if p_outcome is null or p_outcome not in ('updated','terminal') or not public.flight_lookup_refresh_ready() then return jsonb_build_object('kind','unavailable'); end if;
  select * into provider from public.trip_flight_provider_data where trip_id=p_trip_id and user_id=p_user;
  if not found or provider.fetched_at <> attempt.expected_fetched_at or provider.expires_at <= now() then return jsonb_build_object('kind','conflict'); end if;
  if p_flight is null or jsonb_typeof(p_flight)<>'object' or octet_length(p_flight::text)>16384
    or p_fetched_at is null or not isfinite(p_fetched_at) or p_fetched_at <= provider.fetched_at
    or p_fetched_at > now()+interval '1 minute' or p_fetched_at < now()-interval '30 seconds'
    or p_flight->>'flightNumber' is distinct from trip.flight_number
    or p_flight->>'departureDate' is distinct from trip.start_date::text
    or p_flight#>>'{origin,iata}' is distinct from provider.data#>>'{origin,iata}'
    or p_flight#>>'{destination,iata}' is distinct from provider.data#>>'{destination,iata}'
    or p_flight->>'source' is distinct from 'AeroDataBox'
    or (p_flight->>'fetchedAt')::timestamptz is distinct from p_fetched_at then
    raise exception 'flight_lookup_invalid_refresh' using errcode='22023';
  end if;
  -- Source metadata cannot move backwards even if network requests reorder.
  if provider.data#>>'{progress,sourceUpdatedAt}' is not null and (
    p_flight#>>'{progress,sourceUpdatedAt}' is null
    or (p_flight#>>'{progress,sourceUpdatedAt}')::timestamptz < (provider.data#>>'{progress,sourceUpdatedAt}')::timestamptz
  ) then return jsonb_build_object('kind','conflict'); end if;
  if p_outcome='terminal' then
    if p_flight#>>'{progress,phase}' is null or p_flight#>>'{progress,phase}' not in ('arrived','unavailable')
      or p_flight#>>'{progress,sourceUpdatedAt}' is null
      or (p_flight#>>'{progress,sourceUpdatedAt}')::timestamptz < now()-interval '15 minutes'
      or (p_flight#>>'{progress,sourceUpdatedAt}')::timestamptz > now()+interval '30 seconds' then
      return jsonb_build_object('kind','conflict');
    end if;
    delete from public.trip_flight_provider_data where trip_id=p_trip_id;
    update public.flight_lookup_refresh_requests set state='terminal' where request_id=p_request_id;
    return jsonb_build_object('kind','terminal','trip',to_jsonb(trip),'flight',null,'expiresAt',null);
  end if;
  if p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<>p_fetched_at+interval '5 days'
    or p_flight#>>'{progress,phase}' in ('arrived','unavailable') then
    raise exception 'flight_lookup_invalid_refresh' using errcode='22023';
  end if;
  update public.trips set flight_lookup_expires_at=p_expires_at where id=p_trip_id returning * into trip;
  update public.trip_flight_provider_data set fetched_at=p_fetched_at,expires_at=p_expires_at,data=p_flight where trip_id=p_trip_id;
  update public.flight_lookup_refresh_requests set state='done' where request_id=p_request_id;
  return jsonb_build_object('kind','updated','trip',to_jsonb(trip),'flight',p_flight,'expiresAt',p_expires_at);
end;
$$;
revoke all on function public.finish_flight_lookup_refresh(uuid,uuid,uuid,jsonb,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.finish_flight_lookup_refresh(uuid,uuid,uuid,jsonb,timestamptz,timestamptz,text) to service_role;

create or replace function public.purge_expired_trip_flight_data()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  delete from public.trip_flight_provider_data d using public.trips t
    where t.id=d.trip_id and (d.expires_at<=now() or t.status in ('completed','cancelled'));
  get diagnostics removed = row_count;
  delete from public.flight_lookup_refresh_requests where created_at <= now()-interval '5 days';
  insert into public.flight_lookup_retention_health(singleton,last_purged_at) values(true,now())
    on conflict(singleton) do update set last_purged_at=excluded.last_purged_at;
  return removed;
end;
$$;
comment on column public.trips.flight_lookup_expires_at is
  'Server-issued expiry. Only a fresh provider retrieval may replace the private sidecar and its lifetime.';
commit;
