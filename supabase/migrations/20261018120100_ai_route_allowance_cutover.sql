begin;
-- Apply immediately after the new backend is promoted. Older deployment URLs
-- must no longer expose the former guest/ten-plan quota through service RPCs.
-- Keeping this separate lets the additive schema ship without a production gap.
select pg_advisory_xact_lock(630141500);
select pg_advisory_xact_lock(630181200);
-- Reconcile successes produced by the old deployment during staged verification.
insert into public.ai_route_daily_usage(owner_id,day)
  select distinct o.owner_id,r.day from public.journey_plan_operations o
  join public.journey_plan_reservations r on r.request_id=o.attempt_id
  where o.owner_id is not null and o.state='succeeded' and r.state='succeeded'
  on conflict do nothing;
insert into public.ai_route_operations(owner_id,operation_id,request_hash,kind,attempt_id,state,result,lease_until,expires_at)
  select owner_id,operation_id,request_hash,'journey',attempt_id,state,result,lease_until,expires_at
  from public.journey_plan_operations where owner_id is not null and state='succeeded' and expires_at>clock_timestamp()
  on conflict do nothing;
-- The retired RPC used to perform this cleanup. Keep it attached to successful
-- admissions in the new ledger, so legacy account and guest payloads cannot be
-- stranded after their recovery deadline. Backfill above always happens first;
-- cutover itself does not independently purge old data.
create or replace function public.cleanup_legacy_ai_route_receipts()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.journey_plan_operations where expires_at<=clock_timestamp();
  return null;
end;
$$;
revoke all on function public.cleanup_legacy_ai_route_receipts() from public,anon,authenticated,service_role;
drop trigger if exists cleanup_legacy_ai_route_receipts_on_admission on public.ai_route_operations;
create trigger cleanup_legacy_ai_route_receipts_on_admission
  after insert or update of attempt_id on public.ai_route_operations
  for each row execute function public.cleanup_legacy_ai_route_receipts();
revoke execute on function public.consume_journey_plan_quota(text,boolean),public.reserve_journey_plan_quota(text,boolean,uuid),public.finish_journey_plan_quota(text,uuid,boolean),public.begin_journey_plan_operation(text,uuid,text,uuid,boolean,uuid),public.complete_journey_plan_operation(text,uuid,uuid,jsonb) from service_role;
commit;
