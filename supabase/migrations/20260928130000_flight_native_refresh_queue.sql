-- Prepared background updates. No schedule or commercial entitlement is enabled.
-- Depends on the live_activity installation/session/token migration.
begin;
create table public.flight_native_refresh_queue (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation bigint not null,
  terminal boolean not null default false,
  lease_id uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now()
);
create table public.flight_native_refresh_deliveries (
  trip_id uuid not null references public.trips(id) on delete cascade,
  token_id uuid not null references public.live_activity_tokens(id) on delete cascade,
  sent_generation bigint not null default 0,
  claim_id uuid,
  claim_generation bigint,
  claimed_until timestamptz,
  primary key(trip_id,token_id)
);
alter table public.flight_native_refresh_queue enable row level security;
alter table public.flight_native_refresh_deliveries enable row level security;
revoke all on public.flight_native_refresh_queue,public.flight_native_refresh_deliveries from public,anon,authenticated;
grant all on public.flight_native_refresh_queue,public.flight_native_refresh_deliveries to service_role;

create or replace function public.queue_flight_native_refresh()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_trip_id uuid; v_owner uuid; ended boolean;
begin
  v_trip_id := case when tg_op='DELETE' then old.trip_id else new.trip_id end;
  v_owner := case when tg_op='DELETE' then old.user_id else new.user_id end;
  ended := tg_op='DELETE';
  -- Parent deletion cascades need no new queue row.
  if not exists(select 1 from public.trips where trips.id=v_trip_id) then return null; end if;
  insert into public.flight_native_refresh_queue(trip_id,user_id,generation,terminal,next_attempt_at)
    values(v_trip_id,v_owner,floor(extract(epoch from clock_timestamp()))::bigint,ended,now())
    on conflict(trip_id) do update set generation=greatest(flight_native_refresh_queue.generation+1,excluded.generation),
      terminal=excluded.terminal,next_attempt_at=now();
  return null;
end;
$$;
revoke all on function public.queue_flight_native_refresh() from public,anon,authenticated;
create trigger trip_flight_native_refresh_changed after insert or update or delete on public.trip_flight_provider_data
  for each row execute function public.queue_flight_native_refresh();
insert into public.flight_native_refresh_queue(trip_id,user_id,generation)
  select trip_id,user_id,floor(extract(epoch from now()))::bigint from public.trip_flight_provider_data;

create or replace function public.claim_flight_native_refresh_batch(p_limit integer default 10)
returns table(trip_id uuid,user_id uuid,lease_id uuid,generation bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.flight_lookup_refresh_ready() then return; end if;
  return query
  with due as (
    select q.trip_id from public.flight_native_refresh_queue q
    join public.trips t on t.id=q.trip_id and t.user_id=q.user_id
    left join public.trip_flight_provider_data d on d.trip_id=q.trip_id and d.user_id=q.user_id
    where q.next_attempt_at<=now() and (q.lease_until is null or q.lease_until<=now())
      and q.generation<=floor(extract(epoch from now()+interval '30 seconds'))
      and exists(
        select 1 from public.live_activity_tokens k
        join public.live_activity_installation_sessions s on s.installation_id=k.installation_id
          and s.user_id=k.user_id and s.session_epoch=k.session_epoch and s.generation=k.session_generation and s.active
        left join public.flight_native_refresh_deliveries x on x.trip_id=q.trip_id and x.token_id=k.id
        where k.trip_id=q.trip_id and k.user_id=q.user_id and k.enabled and k.token_type='activity_update'
          and not exists(select 1 from public.live_activity_epoch_bars b where b.installation_id=k.installation_id and b.epoch=k.session_epoch)
          and (not q.terminal or coalesce(x.sent_generation,0)<q.generation)
      )
      and (q.terminal or d.trip_id is null or d.expires_at<=now() or t.status not in ('upcoming','active')
        or (d.data->>'nativeDisplayAllowed'='true' and d.data->>'departureAt' is not null
          and (d.data->>'departureAt')::timestamptz<=now()+interval '24 hours'))
    order by q.next_attempt_at,q.trip_id for update of q skip locked limit least(10,greatest(1,coalesce(p_limit,10)))
  )
  update public.flight_native_refresh_queue q set lease_id=gen_random_uuid(),lease_until=now()+interval '55 seconds',next_attempt_at=now()+interval '5 minutes'
  from due where q.trip_id=due.trip_id returning q.trip_id,q.user_id,q.lease_id,q.generation;
end;
$$;
revoke all on function public.claim_flight_native_refresh_batch(integer) from public,anon,authenticated;
grant execute on function public.claim_flight_native_refresh_batch(integer) to service_role;

create or replace function public.read_flight_native_refresh(p_trip_id uuid,p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.flight_native_refresh_queue%rowtype; t public.trips%rowtype; d public.trip_flight_provider_data%rowtype; tokens jsonb;
begin
  select * into q from public.flight_native_refresh_queue where trip_id=p_trip_id and lease_id=p_lease_id and lease_until>now();
  if not found then return null; end if;
  select * into t from public.trips where id=q.trip_id and user_id=q.user_id;
  if not found then return null; end if;
  select * into d from public.trip_flight_provider_data where trip_id=q.trip_id and user_id=q.user_id;
  if q.terminal or not found or d.expires_at<=now() or t.status not in ('upcoming','active') then
    -- Expiry/status may precede the physical purge; fence any queued update.
    if not q.terminal then
      update public.flight_native_refresh_queue set terminal=true,generation=greatest(generation+1,floor(extract(epoch from clock_timestamp()))::bigint)
        where trip_id=q.trip_id returning * into q;
    end if;
  elsif d.data->>'nativeDisplayAllowed' is distinct from 'true' then return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',k.id)),'[]'::jsonb) into tokens from (
    select k.id from public.live_activity_tokens k
    join public.live_activity_installation_sessions s on s.installation_id=k.installation_id and s.user_id=k.user_id
      and s.session_epoch=k.session_epoch and s.generation=k.session_generation and s.active
    left join public.flight_native_refresh_deliveries x on x.trip_id=q.trip_id and x.token_id=k.id
    where k.trip_id=q.trip_id and k.user_id=q.user_id and k.enabled and k.token_type='activity_update'
      and not exists(select 1 from public.live_activity_epoch_bars b where b.installation_id=k.installation_id and b.epoch=k.session_epoch)
    order by k.id limit 10
  ) k;
  return jsonb_build_object('tripId',q.trip_id,'userId',q.user_id,'generation',q.generation,'terminal',q.terminal,
    'flight',case when q.terminal then null else d.data end,'expiresAt',case when q.terminal then null else d.expires_at end,
    'language',t.app_language,'tokens',tokens);
end;
$$;
revoke all on function public.read_flight_native_refresh(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_flight_native_refresh(uuid,uuid) to service_role;

create or replace function public.claim_flight_native_delivery(p_trip_id uuid,p_lease_id uuid,p_generation bigint,p_token_id uuid,p_claim_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare q public.flight_native_refresh_queue%rowtype; token text; claimed uuid;
begin
  select * into q from public.flight_native_refresh_queue where trip_id=p_trip_id and lease_id=p_lease_id
    and lease_until>now() and generation=p_generation for update;
  if not found or p_claim_id is null then return null; end if;
  if not q.terminal and not exists(select 1 from public.trip_flight_provider_data d join public.trips t on t.id=d.trip_id
    where d.trip_id=q.trip_id and d.user_id=q.user_id and d.expires_at>now() and t.status in ('upcoming','active') and d.data->>'nativeDisplayAllowed'='true') then return null; end if;
  select k.token into token from public.live_activity_tokens k
    join public.live_activity_installation_sessions s on s.installation_id=k.installation_id and s.user_id=k.user_id
      and s.session_epoch=k.session_epoch and s.generation=k.session_generation and s.active
    where k.id=p_token_id and k.trip_id=q.trip_id and k.user_id=q.user_id and k.enabled and k.token_type='activity_update'
      and not exists(select 1 from public.live_activity_epoch_bars b where b.installation_id=k.installation_id and b.epoch=k.session_epoch);
  if not found then return null; end if;
  insert into public.flight_native_refresh_deliveries(trip_id,token_id,claim_id,claim_generation,claimed_until)
    values(p_trip_id,p_token_id,p_claim_id,p_generation,now()+interval '20 seconds')
    on conflict(trip_id,token_id) do update set claim_id=excluded.claim_id,claim_generation=excluded.claim_generation,claimed_until=excluded.claimed_until
    where flight_native_refresh_deliveries.sent_generation<p_generation
      and (flight_native_refresh_deliveries.claimed_until is null or flight_native_refresh_deliveries.claimed_until<=now())
    returning claim_id into claimed;
  if claimed is null then return null; end if;
  return token;
end;
$$;
revoke all on function public.claim_flight_native_delivery(uuid,uuid,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_flight_native_delivery(uuid,uuid,bigint,uuid,uuid) to service_role;

create or replace function public.settle_flight_native_delivery(p_trip_id uuid,p_token_id uuid,p_claim_id uuid,p_sent boolean,p_disable boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed uuid;
begin
  update public.flight_native_refresh_deliveries set sent_generation=case when p_sent then greatest(sent_generation,claim_generation) else sent_generation end,
    claim_id=null,claimed_until=null,claim_generation=null
    where trip_id=p_trip_id and token_id=p_token_id and claim_id=p_claim_id returning token_id into changed;
  if changed is null then return false; end if;
  if p_disable then update public.live_activity_tokens set enabled=false,updated_at=now() where id=p_token_id; end if;
  return true;
end;
$$;
revoke all on function public.settle_flight_native_delivery(uuid,uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.settle_flight_native_delivery(uuid,uuid,uuid,boolean,boolean) to service_role;

create or replace function public.release_flight_native_refresh(p_trip_id uuid,p_lease_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed uuid;
begin
  update public.flight_native_refresh_queue set lease_id=null,lease_until=null,next_attempt_at=now()+interval '5 minutes'
    where trip_id=p_trip_id and lease_id=p_lease_id returning trip_id into changed;
  return changed is not null;
end;
$$;
revoke all on function public.release_flight_native_refresh(uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_flight_native_refresh(uuid,uuid) to service_role;
commit;
