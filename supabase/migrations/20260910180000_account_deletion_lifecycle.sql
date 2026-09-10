-- Account-deletion progress is visible through the authenticated API; delivery
-- details and leases remain service-only and survive auth.users deletion.
begin;
alter table public.kvkk_requests
  add column if not exists target_completion_at timestamptz,
  add column if not exists request_locale text not null default 'tr',
  add column if not exists completion_notification_status text;
update public.kvkk_requests set target_completion_at = created_at + interval '30 days'
where request_type = 'Hesabımı kapatmak istiyorum' and target_completion_at is null;

-- Preserve moderation work without retaining the deleted reporter identity.
alter table public.forum_reports alter column user_id drop not null;
alter table public.forum_reports drop constraint if exists forum_reports_user_id_fkey;
alter table public.forum_reports add constraint forum_reports_user_id_fkey
  foreign key(user_id) references auth.users(id) on delete set null;

create table if not exists public.account_deletion_jobs (
  request_id uuid primary key references public.kvkk_requests(id) on delete cascade,
  target_user_id uuid,
  recipient_email text,
  locale text not null default 'tr' check (locale in ('tr','en')),
  phase text not null default 'prepared' check (phase in ('prepared','cleaned','deleted','notified')),
  lease_token uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_jobs from public, anon, authenticated;
grant all on public.account_deletion_jobs to service_role;

-- Atomic lease acquisition prevents two admins running destructive cleanup at
-- once. A killed server request can be resumed after the five-minute lease.
create or replace function public.claim_account_deletion_job(p_request_id uuid, p_token uuid)
returns setof public.account_deletion_jobs
language plpgsql security definer set search_path = public
as $$
declare
  v_target uuid;
  v_authorizing boolean := false;
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select target_user_id into v_target from public.account_deletion_jobs where request_id = p_request_id;
  if v_target is not null then
    perform pg_advisory_xact_lock(hashtextextended('apple-account-deletion:' || v_target::text,0));
    if to_regclass('public.apple_account_deletion_authorizations') is not null then
      execute 'select exists(select 1 from public.apple_account_deletion_authorizations where user_id = $1 and expires_at > now())'
        into v_authorizing using v_target;
      if v_authorizing then return; end if;
    end if;
  end if;
  perform 1 from public.kvkk_requests where id = p_request_id for update;
  return query update public.account_deletion_jobs
    set lease_token = p_token, lease_until = now() + interval '5 minutes', updated_at = now()
    where request_id = p_request_id and (lease_until is null or lease_until < now())
      and (phase in ('deleted','notified') or exists (
        select 1 from public.kvkk_requests r where r.id = p_request_id and r.status = 'reviewing'
      ))
    returning *;
end;
$$;
revoke all on function public.claim_account_deletion_job(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_account_deletion_job(uuid,uuid) to service_role;
-- Serialize duplicate requests without rewriting historical request records.
create or replace function public.create_account_deletion_request(p_user_id uuid, p_locale text)
returns setof public.kvkk_requests
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  perform 1 from auth.users where id = p_user_id for update;
  if not found then raise exception 'account missing'; end if;
  if exists(select 1 from public.kvkk_requests where user_id = p_user_id
    and request_type = 'Hesabımı kapatmak istiyorum' and status in ('pending','reviewing')) then
    return query select * from public.kvkk_requests where user_id = p_user_id
      and request_type = 'Hesabımı kapatmak istiyorum' and status in ('pending','reviewing')
      order by created_at desc limit 1;
  else
    return query insert into public.kvkk_requests(user_id,request_type,status,notes,request_locale,target_completion_at)
      values(p_user_id,'Hesabımı kapatmak istiyorum','pending',
        'Kullanıcı uygulama içinden hesabının kalıcı silinmesini onayladı.',
        case when p_locale = 'en' then 'en' else 'tr' end,now() + interval '30 days') returning *;
  end if;
end;
$$;
revoke all on function public.create_account_deletion_request(uuid,text) from public, anon, authenticated;
grant execute on function public.create_account_deletion_request(uuid,text) to service_role;
-- Once cleanup has a durable job, a status dropdown cannot cancel/reopen it.
create or replace function public.protect_account_deletion_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.request_type = 'Hesabımı kapatmak istiyorum' and old.status is distinct from new.status then
    if old.status = 'processed' then raise exception 'completed deletion is terminal'; end if;
    if exists(select 1 from public.account_deletion_jobs where request_id = old.id) then
      if new.status <> 'processed' or not exists (
        select 1 from public.account_deletion_jobs where request_id = old.id and phase in ('deleted','notified')
      ) then raise exception 'deletion is in progress'; end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_account_deletion_progress on public.kvkk_requests;
create trigger protect_account_deletion_progress before update on public.kvkk_requests
for each row execute function public.protect_account_deletion_progress();
commit;
