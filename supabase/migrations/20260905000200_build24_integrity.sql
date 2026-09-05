-- Build 24: atomic verification decisions and a single currency per trip.
begin;

create or replace function public.review_travel_verification(
  p_id uuid, p_reviewer uuid, p_action text, p_note text, p_evidence_path text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.travel_verifications%rowtype;
  v_now timestamptz := now();
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  -- NULL is the already-authenticated legacy admin; only the server can call this.
  if p_reviewer is not null and not exists (select 1 from public.profiles where id = p_reviewer and role in ('moderator','admin','super_admin')) then raise exception 'review_forbidden'; end if;
  if p_action is null or p_action not in ('approve','reject') or length(coalesce(p_note,'')) > 1000
    or (p_action = 'reject' and length(trim(coalesce(p_note,''))) = 0) then raise exception 'review_invalid'; end if;
  select * into v from public.travel_verifications where id = p_id for update;
  if not found then raise exception 'review_not_found'; end if;
  if v.status = (case when p_action = 'approve' then 'approved' else 'rejected' end) then
    return jsonb_build_object('id',v.id,'status',v.status,'evidencePath',v.evidence_path);
  end if;
  if v.status <> 'pending' then raise exception 'review_conflict'; end if;
  if p_action = 'approve' and (v.evidence_path is null or v.evidence_path is distinct from p_evidence_path) then raise exception 'evidence_missing'; end if;
  -- Serialise awards for the same traveller across different applications.
  perform pg_advisory_xact_lock(hashtextextended(v.user_id::text, 24));
  if p_action = 'approve' then
    insert into public.user_country_unlocks(user_id,country_code,country_name,verification_id,is_active)
      values(v.user_id,v.country_code,v.country_name,v.id,true)
      on conflict(user_id,country_code) do update set verification_id=excluded.verification_id, country_name=excluded.country_name,is_active=true;
    insert into public.country_experience_permissions(user_id,country_code,can_answer,can_comment,can_create_warning,source_verification_id)
      values(v.user_id,v.country_code,true,true,true,v.id)
      on conflict(user_id,country_code) do update set can_answer=true,can_comment=true,can_create_warning=true,source_verification_id=excluded.source_verification_id;
    insert into public.user_points_log(user_id,action_type,points,country_code,related_id)
      select v.user_id,'country_verified',100,v.country_code,v.id
      where not exists(select 1 from public.user_points_log where user_id=v.user_id and action_type='country_verified' and related_id=v.id);
    insert into public.user_badges(user_id,badge_key,badge_label,country_code)
      values(v.user_id,'country_verified','Ülke Doğrulandı',v.country_code)
      on conflict(user_id,badge_key,country_code) do nothing;
    insert into public.user_badges(user_id,badge_key,badge_label)
      select v.user_id,'belgeli_gezgin','Belgeli Gezgin'
      where not exists(select 1 from public.user_badges where user_id=v.user_id and badge_key='belgeli_gezgin');
    select count(*) into v_count from public.user_country_unlocks where user_id=v.user_id and is_active;
    insert into public.user_trust_scores(user_id,verified_country_count,updated_at) values(v.user_id,v_count,v_now)
      on conflict(user_id) do update set verified_country_count=excluded.verified_country_count,updated_at=excluded.updated_at;
  end if;
  update public.travel_verifications set status=case when p_action='approve' then 'approved' else 'rejected' end,
    admin_note=nullif(trim(p_note),''),reviewed_by=p_reviewer,reviewed_at=v_now,
    verified_at=case when p_action='approve' then v_now else verified_at end where id=v.id;
  insert into public.admin_audit_logs(admin_user_id,action,target_type,target_id,note)
    values(p_reviewer,p_action || '_verification','travel_verifications',v.id,nullif(trim(p_note),''));
  -- Storage is deleted only AFTER this transaction commits. Failed cleanup is
  -- retried by purge-travel-evidence; a DB failure cannot destroy the proof.
  return jsonb_build_object('id',v.id,'status',case when p_action='approve' then 'approved' else 'rejected' end,'evidencePath',v.evidence_path);
end;
$$;

create or replace function public.set_shared_trip_budget(p_trip_id uuid,p_user_id uuid,p_amount numeric,p_currency text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  perform 1 from public.trips where id=p_trip_id for update;
  if not exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role in ('owner','editor')) then raise exception 'trip_forbidden'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000000 or p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'budget_invalid'; end if;
  if exists(select 1 from public.trip_expenses where trip_id=p_trip_id and currency<>p_currency) then raise exception 'currency_locked'; end if;
  insert into public.trip_budgets(trip_id,currency,target_amount,updated_by,updated_at)
    values(p_trip_id,p_currency,round(p_amount,2),p_user_id,now())
    on conflict(trip_id) do update set currency=excluded.currency,target_amount=excluded.target_amount,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end;
$$;

create or replace function public.add_shared_trip_expense(
  p_trip_id uuid,p_user_id uuid,p_expense_id uuid,p_title text,p_amount numeric,
  p_paid_by uuid,p_spent_at date,p_participants uuid[],p_currency text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_currency text; v_participants uuid[]; v_cents bigint; v_base bigint; v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  perform 1 from public.trips where id=p_trip_id for update;
  if not exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role in ('owner','editor')) then raise exception 'trip_forbidden'; end if;
  if exists(select 1 from public.trip_expenses where id=p_expense_id and trip_id=p_trip_id and created_by=p_user_id) then return p_expense_id; end if;
  select array_agg(distinct x order by x) into v_participants from unnest(p_participants) x where x is not null;
  v_count := coalesce(cardinality(v_participants),0);
  if p_title is null or length(trim(p_title)) < 2 or length(p_title)>120 or p_amount is null
    or p_amount<=0 or p_amount>100000000 or p_spent_at is null or p_spent_at > (now() at time zone 'Pacific/Kiritimati')::date
    or v_count=0 or not exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_paid_by)
    or exists(select 1 from unnest(v_participants) x where not exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=x)) then raise exception 'expense_invalid'; end if;
  select currency into v_currency from public.trip_budgets where trip_id=p_trip_id;
  if v_currency is null then
    select min(currency) into v_currency from public.trip_expenses where trip_id=p_trip_id;
    v_currency := coalesce(v_currency,p_currency,'TRY');
    insert into public.trip_budgets(trip_id,currency,target_amount,updated_by) values(p_trip_id,v_currency,0,p_user_id);
  end if;
  if (p_currency is not null and p_currency<>v_currency)
    or exists(select 1 from public.trip_expenses where trip_id=p_trip_id and currency<>v_currency) then raise exception 'currency_locked'; end if;
  insert into public.trip_expenses(id,trip_id,paid_by,created_by,title,amount,currency,spent_at)
    values(p_expense_id,p_trip_id,p_paid_by,p_user_id,trim(p_title),round(p_amount,2),v_currency,p_spent_at);
  v_cents := round(p_amount*100); v_base := v_cents / v_count;
  insert into public.trip_expense_shares(expense_id,user_id,amount)
    select p_expense_id,x,(v_base + case when n <= v_cents % v_count then 1 else 0 end)::numeric/100
    from unnest(v_participants) with ordinality as person(x,n);
  return p_expense_id;
end;
$$;

-- Membership writes take the same trip lock as expenses. A simultaneous
-- removal cannot make an expense share disappear from the participant list.
create or replace function public.change_shared_trip_member(p_trip_id uuid,p_actor uuid,p_target uuid,p_action text,p_role text)
returns void language plpgsql security definer set search_path=public as $$
declare v_actor text; v_target text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
  perform 1 from public.trips where id=p_trip_id for update;
  select role into v_actor from public.trip_members where trip_id=p_trip_id and user_id=p_actor;
  select role into v_target from public.trip_members where trip_id=p_trip_id and user_id=p_target;
  if v_actor is null or v_target is null or v_target='owner' or
    not ((p_action='leave_trip' and p_actor=p_target) or (v_actor='owner' and p_action in ('remove_member','set_role'))) then raise exception 'trip_forbidden'; end if;
  if p_action='set_role' then
    if p_role is null or p_role not in ('editor','viewer') then raise exception 'trip_forbidden'; end if;
    update public.trip_members set role=p_role where trip_id=p_trip_id and user_id=p_target;
  else
    if exists(select 1 from public.trip_expenses where trip_id=p_trip_id and (paid_by=p_target or created_by=p_target))
      or exists(select 1 from public.trip_expense_shares s join public.trip_expenses e on e.id=s.expense_id where e.trip_id=p_trip_id and s.user_id=p_target)
      then raise exception 'financial_history'; end if;
    delete from public.trip_members where trip_id=p_trip_id and user_id=p_target;
  end if;
end;
$$;

revoke all on function public.change_shared_trip_member(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.change_shared_trip_member(uuid,uuid,uuid,text,text) to service_role;

revoke all on function public.review_travel_verification(uuid,uuid,text,text,text),
  public.set_shared_trip_budget(uuid,uuid,numeric,text),
  public.add_shared_trip_expense(uuid,uuid,uuid,text,numeric,uuid,date,uuid[],text) from public,anon,authenticated;
grant execute on function public.review_travel_verification(uuid,uuid,text,text,text),
  public.set_shared_trip_budget(uuid,uuid,numeric,text),
  public.add_shared_trip_expense(uuid,uuid,uuid,text,numeric,uuid,date,uuid[],text) to service_role;
notify pgrst, 'reload schema';
commit;
