begin;
-- Raise the verified account allowance without resetting earlier successes,
-- pending attempts, private replay receipts, or the shared provider budget.
select pg_advisory_xact_lock(630181200);
alter table public.ai_route_daily_usage drop constraint if exists ai_route_daily_usage_used_check;
alter table public.ai_route_daily_usage add constraint ai_route_daily_usage_used_check check (used between 1 and 3);

create or replace function public.get_ai_route_quota(p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_day date := (v_now at time zone 'UTC')::date;
  v_used integer;
  v_pending boolean;
begin
  if p_owner is null or not exists(select 1 from auth.users where id=p_owner) then return null; end if;
  select coalesce(sum(used),0)::integer into v_used from public.ai_route_daily_usage where owner_id=p_owner and day=v_day;
  v_pending:=exists(select 1 from public.ai_route_operations where owner_id=p_owner and state='pending' and lease_until>v_now and expires_at>v_now);
  -- While a worker is live, no second request may reserve this account.
  return jsonb_build_object('limit',3,'used',v_used,'remaining',case when v_pending then 0 else 3-v_used end,'timeZone','UTC',
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
  if (v_quota->>'used')::integer>=3 then return jsonb_build_object('state','limit','quota',v_quota); end if;
  -- Across both endpoints, and across midnight, only one live worker per owner.
  if (v_quota->>'pending')::boolean then return jsonb_build_object('state','pending','quota',v_quota); end if;
  if exists(select 1 from public.ai_route_account_attempts where owner_id=p_owner and minute=v_minute and attempts>=2) then
    return jsonb_build_object('state','busy','retryAfterSeconds',greatest(1,ceil(extract(epoch from v_minute+interval '1 minute'-v_now))::integer),'quota',v_quota);
  end if;
  -- Retain identity tombstones briefly, but erase expired private result data.
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
  -- Charge only a completed result, on its UTC commit day. The bounded upsert
  -- preserves existing usage and cannot create a fourth charge on any retry.
  insert into public.ai_route_daily_usage as usage(owner_id,day,used)
    values(p_owner,(v_now at time zone 'UTC')::date,1)
    on conflict(owner_id,day) do update set used=usage.used+1 where usage.used<3;
  if not found then return jsonb_build_object('ok',false,'quota',public.get_ai_route_quota(p_owner)); end if;
  update public.ai_route_operations set state='succeeded',result=p_result where owner_id=p_owner and operation_id=p_operation;
  return jsonb_build_object('ok',true,'quota',public.get_ai_route_quota(p_owner));
end;
$$;

revoke all on function public.get_ai_route_quota(uuid),public.begin_ai_route_operation(uuid,uuid,text,text,uuid),public.complete_ai_route_operation(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_ai_route_quota(uuid),public.begin_ai_route_operation(uuid,uuid,text,text,uuid),public.complete_ai_route_operation(uuid,uuid,uuid,jsonb) to service_role;
commit;
