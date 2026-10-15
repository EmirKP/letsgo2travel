begin;
-- Private, bounded recovery receipts. Account removal also removes its results.
create table if not exists public.journey_plan_operations (
  actor text not null check (actor ~ '^[a-f0-9]{64}$'),
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  owner_id uuid references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  state text not null check (state in ('pending', 'succeeded', 'failed')),
  result jsonb,
  lease_until timestamptz not null,
  expires_at timestamptz not null,
  primary key (actor, operation_id)
);
create index if not exists journey_plan_operations_expiry on public.journey_plan_operations(expires_at);
alter table public.journey_plan_operations enable row level security;
revoke all on public.journey_plan_operations from public, anon, authenticated;
grant all on public.journey_plan_operations to service_role;

create or replace function public.begin_journey_plan_operation(
  p_actor text, p_operation uuid, p_hash text, p_owner uuid, p_guest boolean, p_attempt uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_row public.journey_plan_operations%rowtype;
begin
  if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
    or p_operation is null or p_attempt is null or p_guest is null or p_guest <> (p_owner is null) then
    return jsonb_build_object('state','invalid');
  end if;
  -- Same lock order as the quota functions; admission and receipt are atomic.
  perform pg_advisory_xact_lock(630141500);
  v_now := clock_timestamp();
  select * into v_row from public.journey_plan_operations where actor=p_actor and operation_id=p_operation;
  if found then
    if v_row.request_hash <> p_hash or v_row.owner_id is distinct from p_owner then return jsonb_build_object('state','conflict'); end if;
    if v_row.expires_at <= v_now then return jsonb_build_object('state','expired'); end if;
    if v_row.state = 'succeeded' then return jsonb_build_object('state','succeeded','result',v_row.result); end if;
    if v_row.state = 'pending' and v_row.lease_until > v_now then return jsonb_build_object('state','pending'); end if;
    perform public.finish_journey_plan_quota(p_actor,v_row.attempt_id,false);
  end if;
  delete from public.journey_plan_operations where expires_at <= v_now and not (actor=p_actor and operation_id=p_operation);
  if not public.reserve_journey_plan_quota(p_actor,p_guest,p_attempt) then return jsonb_build_object('state','limit'); end if;
  insert into public.journey_plan_operations(actor,operation_id,request_hash,owner_id,attempt_id,state,lease_until,expires_at)
    values(p_actor,p_operation,p_hash,p_owner,p_attempt,'pending',v_now+interval '90 seconds',v_now+interval '24 hours')
    on conflict(actor,operation_id) do update set attempt_id=p_attempt,state='pending',result=null,lease_until=v_now+interval '90 seconds';
  return jsonb_build_object('state','acquired');
end;
$$;

create or replace function public.complete_journey_plan_operation(
  p_actor text, p_operation uuid, p_attempt uuid, p_result jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_row public.journey_plan_operations%rowtype;
begin
  if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_operation is null or p_attempt is null then return false; end if;
  if p_result is not null and (jsonb_typeof(p_result) <> 'object' or octet_length(p_result::text)>600000) then return false; end if;
  perform pg_advisory_xact_lock(630141500);
  select * into v_row from public.journey_plan_operations where actor=p_actor and operation_id=p_operation;
  if not found then
    -- Fence a reservation that finishes after its HTTP acknowledgement times out.
    if p_result is null then return public.finish_journey_plan_quota(p_actor,p_attempt,false); end if;
    return false;
  end if;
  if v_row.attempt_id <> p_attempt then
    -- Cancellation can overtake a retry's delayed admission, even when an older
    -- operation row exists. Fence only the cancelled attempt, never the owner.
    if p_result is null then return public.finish_journey_plan_quota(p_actor,p_attempt,false); end if;
    return false;
  end if;
  if v_row.state = 'succeeded' then return p_result is not null; end if;
  if v_row.state = 'failed' then return p_result is null; end if;
  if v_row.lease_until <= clock_timestamp() or v_row.expires_at <= clock_timestamp() then return false; end if;
  if not public.finish_journey_plan_quota(p_actor,p_attempt,p_result is not null) then return false; end if;
  update public.journey_plan_operations set state=case when p_result is null then 'failed' else 'succeeded' end,
    result=p_result where actor=p_actor and operation_id=p_operation;
  return true;
end;
$$;
revoke all on function public.begin_journey_plan_operation(text,uuid,text,uuid,boolean,uuid) from public, anon, authenticated;
revoke all on function public.complete_journey_plan_operation(text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.begin_journey_plan_operation(text,uuid,text,uuid,boolean,uuid) to service_role;
grant execute on function public.complete_journey_plan_operation(text,uuid,uuid,jsonb) to service_role;
commit;
