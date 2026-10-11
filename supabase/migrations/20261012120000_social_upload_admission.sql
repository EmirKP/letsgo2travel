begin;

-- Admission is persisted before Storage accepts bytes. Failed/uncertain writes
-- consume a slot too, so fresh request IDs cannot bypass the posting quota.
create table public.travel_social_upload_reservations (
 request_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 state text not null default 'active' check (state in ('active','expired','cleaned')),
 cleanup_after timestamptz,
 constraint social_upload_payload_object check (jsonb_typeof(payload)='object')
);
create index social_upload_reservations_owner_created on public.travel_social_upload_reservations(user_id,created_at);
alter table public.travel_social_upload_reservations enable row level security;
revoke all on public.travel_social_upload_reservations from public,anon,authenticated;
grant all on public.travel_social_upload_reservations to service_role;

create function public.reserve_travel_social_upload(p_viewer uuid,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_id uuid; v_payload jsonb; v_existing public.travel_social_upload_reservations;
begin
 if coalesce(auth.role(),'')<>'service_role' or p_viewer is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if not exists(select 1 from public.community_profile_identity('user:'||p_viewer::text,p_viewer)) then raise exception 'Profile required' using errcode='22023'; end if;
 v_id:=(p_input->>'requestId')::uuid;
 if v_id is null or coalesce(p_input->>'photoHash','') !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(p_input->'caption') is distinct from 'string' or char_length(p_input->>'caption')>2200
  or coalesce(p_input->>'visibility','') not in ('public','followers') then raise exception 'Invalid upload' using errcode='22023'; end if;
 v_payload:=jsonb_build_object('caption',p_input->>'caption','visibility',p_input->>'visibility','photoHash',p_input->>'photoHash','place',nullif(p_input->'place','null'));
 -- Same lock namespace as write_travel_social: admission and commits cannot
 -- race past a per-user limit. The primary key also binds IDs across owners.
 perform pg_advisory_xact_lock(hashtextextended(p_viewer::text,713));
 select * into v_existing from public.travel_social_upload_reservations where request_id=v_id;
 if found then
  if v_existing.user_id<>p_viewer then raise exception 'Request ID already used' using errcode='23505'; end if;
  if v_existing.state<>'active' or v_existing.expires_at<=clock_timestamp() then raise exception 'Upload request expired' using errcode='P0010'; end if;
  if v_existing.payload is distinct from v_payload then raise exception 'Request ID already used' using errcode='23505'; end if;
  return jsonb_build_object('admitted',true,'requestId',v_id);
 end if;
 if exists(select 1 from public.travel_social_posts where id=v_id) then raise exception 'Request ID already committed' using errcode='23505'; end if;
 -- A committed reservation counts only once. Legacy/script-created posts also
 -- consume the hourly allowance even when they have no reservation row.
 if (select count(*) from (
   select p.id from public.travel_social_posts p where p.user_id=p_viewer and p.created_at>now()-interval '1 hour'
   union select r.request_id from public.travel_social_upload_reservations r where r.user_id=p_viewer and r.created_at>now()-interval '1 hour'
  ) attempts)>=10 then raise exception 'Please try later' using errcode='54000'; end if;
 -- Expiration does not free a slot until Storage deletion is confirmed.
 if (select count(*) from public.travel_social_upload_reservations r where r.user_id=p_viewer
  and r.state<>'cleaned'
  and not exists(select 1 from public.travel_social_posts p where p.id=r.request_id and p.user_id=r.user_id))>=10
  then raise exception 'Finish pending uploads before trying again' using errcode='54000'; end if;
 insert into public.travel_social_upload_reservations(request_id,user_id,payload) values(v_id,p_viewer,v_payload);
 return jsonb_build_object('admitted',true,'requestId',v_id);
end $$;
revoke all on function public.reserve_travel_social_upload(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_travel_social_upload(uuid,jsonb) to service_role;

-- All insertion paths (including an already-running create RPC) honor expiry.
-- The owning API's maxDuration is60 seconds. Cleanup waits120 seconds after
-- fencing so any previously admitted request has terminated before removal.
create function public.fence_travel_social_upload_commit()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.travel_social_upload_reservations;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,713));
 select * into r from public.travel_social_upload_reservations where request_id=new.id;
 if found then
  if r.user_id<>new.user_id then raise exception 'Upload request owner changed' using errcode='23505'; end if;
  if r.state<>'active' or r.expires_at<=clock_timestamp() then raise exception 'Upload request expired' using errcode='P0010'; end if;
  if r.payload is distinct from jsonb_build_object('caption',new.caption,'visibility',new.visibility,'photoHash',new.photo_hash,'place',new.place)
   then raise exception 'Upload request changed' using errcode='23505'; end if;
 end if;
 return new;
end $$;
revoke all on function public.fence_travel_social_upload_commit() from public,anon,authenticated;
create trigger fence_travel_social_upload_commit before insert on public.travel_social_posts
 for each row execute function public.fence_travel_social_upload_commit();

create function public.prepare_travel_social_upload_cleanup(p_viewer uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_ids jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' or p_viewer is null then raise exception 'Not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_viewer::text,713));
 update public.travel_social_upload_reservations r set state='expired',cleanup_after=clock_timestamp()+interval '2 minutes'
 where r.user_id=p_viewer and r.state='active' and r.expires_at<=clock_timestamp()
  and not exists(select 1 from public.travel_social_posts p where p.id=r.request_id);
 select coalesce(jsonb_agg(x.request_id),'[]'::jsonb) into v_ids from (
  select r.request_id from public.travel_social_upload_reservations r where r.user_id=p_viewer and r.state='expired'
   and r.cleanup_after<=clock_timestamp() and not exists(select 1 from public.travel_social_posts p where p.id=r.request_id)
   order by r.created_at,r.request_id limit 10
 ) x;
 return jsonb_build_object('requestIds',v_ids);
end $$;
revoke all on function public.prepare_travel_social_upload_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.prepare_travel_social_upload_cleanup(uuid) to service_role;

create function public.finish_travel_social_upload_cleanup(p_viewer uuid,p_request_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' or p_viewer is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if coalesce(cardinality(p_request_ids),0)>10 then raise exception 'Invalid cleanup batch' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_viewer::text,713));
 update public.travel_social_upload_reservations r set state='cleaned',payload='{}'::jsonb
 where r.user_id=p_viewer and r.request_id=any(p_request_ids) and r.state='expired' and r.cleanup_after<=clock_timestamp()
  and not exists(select 1 from public.travel_social_posts p where p.id=r.request_id);
 return jsonb_build_object('success',true);
end $$;
revoke all on function public.finish_travel_social_upload_cleanup(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.finish_travel_social_upload_cleanup(uuid,uuid[]) to service_role;

commit;
