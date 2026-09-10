-- LetsGo2Travel: first release fixes. Apply before updated server deployment.

-- Source: 20260910160000_community_safety.sql
-- Canonical forum safety for web and mobile. Apply before releasing the clients.
begin;

create table if not exists public.community_user_blocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_name text not null default 'Gezgin' check (length(blocked_name) <= 80),
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  check (user_id <> blocked_user_id)
);
create index if not exists community_user_blocks_reverse on public.community_user_blocks (blocked_user_id, user_id);
alter table public.community_user_blocks enable row level security;
revoke all on public.community_user_blocks from anon, authenticated;
grant select, insert, delete on public.community_user_blocks to authenticated;
grant all on public.community_user_blocks to service_role;
create policy "Read own community blocks" on public.community_user_blocks for select to authenticated using (user_id = (select auth.uid()));
create policy "Create own community blocks" on public.community_user_blocks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Remove own community blocks" on public.community_user_blocks for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.community_users_blocked(p_first uuid, p_second uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_first is null or p_second is null or p_first = p_second then return false; end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_first and auth.uid() is distinct from p_second then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return exists (select 1 from public.community_user_blocks b
    where (b.user_id = p_first and b.blocked_user_id = p_second)
       or (b.user_id = p_second and b.blocked_user_id = p_first));
end; $$;
revoke all on function public.community_users_blocked(uuid, uuid) from public;
grant execute on function public.community_users_blocked(uuid, uuid) to anon, authenticated, service_role;

create or replace function public.community_hidden_user_ids(p_user_id uuid)
returns uuid[] language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user_id is null or (coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return array(select b.blocked_user_id from public.community_user_blocks b where b.user_id = p_user_id
    union select b.user_id from public.community_user_blocks b where b.blocked_user_id = p_user_id);
end; $$;
revoke all on function public.community_hidden_user_ids(uuid) from public;
grant execute on function public.community_hidden_user_ids(uuid) to authenticated, service_role;

-- Restrictive policies add to the existing publication/paywall rules. They do
-- not replace those rules or accidentally expose pending/private reply bodies.
create policy "Community blocked topics" on public.forum_topics as restrictive for select to authenticated
using (not public.community_users_blocked((select auth.uid()), author_id));
create policy "Community blocked replies" on public.forum_replies as restrictive for select to authenticated
using (not public.community_users_blocked((select auth.uid()), user_id)
  and exists (select 1 from public.forum_topics t where t.id = topic_id and t.status = 'published'));
create policy "Community block prevents replies" on public.forum_replies as restrictive for insert to authenticated
with check (exists (select 1 from public.forum_topics t where t.id = topic_id and t.status = 'published'
  and not public.community_users_blocked((select auth.uid()), t.author_id)));

alter table public.forum_reports add column if not exists note text;
-- All new reports pass through one transactional target-validation pipeline.
drop policy if exists "Users can insert reports" on public.forum_reports;
revoke insert on public.forum_reports from anon, authenticated;
create index if not exists forum_reports_owner_target on public.forum_reports (user_id, target_type, target_id, status);
create or replace function public.submit_forum_report(p_user_id uuid, p_target_type text, p_target_id uuid, p_reason text, p_note text default '')
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_author uuid; v_found boolean := false; v_report uuid;
begin
  if p_user_id is null or coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_reason not in ('spam','harassment','hate','dangerous','personal_data','other')
    or p_reason is null or length(coalesce(p_note, '')) > 1000
    or (p_reason = 'other' and length(trim(coalesce(p_note, ''))) < 5) then raise exception 'Invalid reason' using errcode = '22023'; end if;
  if p_target_type = 'topic' then
    select t.author_id, true into v_author, v_found from public.forum_topics t where t.id = p_target_id and t.status = 'published' for share;
  elsif p_target_type = 'reply' then
    select r.user_id, true into v_author, v_found from public.forum_replies r join public.forum_topics t on t.id = r.topic_id
      where r.id = p_target_id and r.status = 'published' and t.status = 'published' for share of r, t;
  else raise exception 'Invalid target' using errcode = '22023'; end if;
  if not coalesce(v_found, false) or v_author = p_user_id then raise exception 'Invalid target' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_target_type || ':' || p_target_id::text, 0));
  select id into v_report from public.forum_reports where user_id = p_user_id and target_type = p_target_type
    and target_id = p_target_id::text and status = 'open' order by created_at limit 1;
  if v_report is not null then return v_report; end if;
  insert into public.forum_reports (user_id, target_type, target_id, reason, note, status)
    values (p_user_id, p_target_type, p_target_id::text, p_reason, nullif(trim(p_note), ''), 'open') returning id into v_report;
  return v_report;
end; $$;
revoke all on function public.submit_forum_report(uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.submit_forum_report(uuid,text,uuid,text,text) to service_role;

-- Personalized reply counts carry no text and never count blocked authors.
create or replace function public.get_forum_visible_reply_counts(p_topic_ids uuid[], p_user_id uuid)
returns table (topic_id uuid, reply_count bigint) language sql stable security definer set search_path = '' as $$
  select r.topic_id, count(*)::bigint from public.forum_replies r join public.forum_topics t on t.id = r.topic_id
  where r.status = 'published' and t.status = 'published' and r.topic_id = any(coalesce(p_topic_ids, '{}'::uuid[]))
    and not public.community_users_blocked(p_user_id, r.user_id)
    and not public.community_users_blocked(p_user_id, t.author_id)
  group by r.topic_id;
$$;
revoke all on function public.get_forum_visible_reply_counts(uuid[],uuid) from public, anon, authenticated;
grant execute on function public.get_forum_visible_reply_counts(uuid[],uuid) to service_role;

-- Authenticated web RPC was SECURITY DEFINER and must explicitly apply blocks.
create or replace function public.get_unlocked_forum_replies(p_topic_id uuid)
returns table (id uuid, topic_id uuid, author_name text, content text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_paywalled boolean;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.forum_topics t where t.id = p_topic_id and t.status = 'published'
    and not public.community_users_blocked(v_user, t.author_id)) then return; end if;
  v_paywalled := public.is_forum_topic_paywalled(p_topic_id);
  if v_paywalled and not public.has_forum_topic_unlock(p_topic_id, v_user) then raise exception 'FORUM_COUNTRY_LOCKED' using errcode = '42501'; end if;
  return query select r.id, r.topic_id, r.author_name, r.content, r.created_at from public.forum_replies r
    where r.topic_id = p_topic_id and r.status = 'published' and not public.community_users_blocked(v_user, r.user_id)
    and (not v_paywalled or not public.is_public_forum_preview_reply(r.id, p_topic_id))
    order by r.created_at, r.id;
end; $$;

create table if not exists public.forum_helpful_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  reply_id uuid not null references public.forum_replies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, reply_id)
);
alter table public.forum_helpful_votes enable row level security;
revoke all on public.forum_helpful_votes from anon, authenticated;
grant all on public.forum_helpful_votes to service_role;
create or replace function public.add_forum_helpful_vote(p_user_id uuid, p_reply_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_author uuid; v_topic_author uuid;
begin
  if p_user_id is null or coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not authorized' using errcode = '42501'; end if;
  select r.user_id, t.author_id into v_author, v_topic_author from public.forum_replies r join public.forum_topics t on t.id = r.topic_id
    where r.id = p_reply_id and r.status = 'published' and t.status = 'published' for share of r, t;
  if not found or v_author = p_user_id or public.community_users_blocked(p_user_id, v_author)
    or public.community_users_blocked(p_user_id, v_topic_author) then raise exception 'Invalid vote' using errcode = '42501'; end if;
  insert into public.forum_helpful_votes (user_id, reply_id) values (p_user_id, p_reply_id) on conflict do nothing;
  return found;
end; $$;
revoke all on function public.add_forum_helpful_vote(uuid,uuid) from public, anon, authenticated;
grant execute on function public.add_forum_helpful_vote(uuid,uuid) to service_role;


-- Older comment/warning votes remain available only through the authenticated
-- API, which validates owner, publication and blocks before invoking this RPC.
do $$ begin
  if to_regprocedure('public.l2t_add_helpful_vote(uuid,text,uuid)') is not null then
    execute 'revoke all on function public.l2t_add_helpful_vote(uuid,text,uuid) from public, anon, authenticated';
    execute 'grant execute on function public.l2t_add_helpful_vote(uuid,text,uuid) to service_role';
  end if;
end; $$;

-- Resolve abuse reports and hide their actual target in one transaction.
create or replace function public.hide_reported_forum_content(p_report_ids uuid[])
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_report record; v_count integer := 0; v_changed integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not authorized' using errcode = '42501'; end if;
  if cardinality(p_report_ids) < 1 or cardinality(p_report_ids) > 100 then raise exception 'Invalid reports'; end if;
  for v_report in select id, target_type, target_id from public.forum_reports where id = any(p_report_ids) for update loop
    if v_report.target_type = 'topic' then
      update public.forum_topics set status = 'hidden' where id::text = v_report.target_id;
    elsif v_report.target_type = 'reply' then
      update public.forum_replies set status = 'hidden' where id::text = v_report.target_id;
    else raise exception 'Invalid report target'; end if;
    get diagnostics v_changed = row_count;
    if v_changed <> 1 then raise exception 'Report target missing'; end if;
    update public.forum_reports set status = 'resolved' where id = v_report.id;
    v_count := v_count + 1;
  end loop;
  if v_count <> (select count(distinct x) from unnest(p_report_ids) x) then raise exception 'Report missing'; end if;
  return v_count;
end; $$;
revoke all on function public.hide_reported_forum_content(uuid[]) from public, anon, authenticated;
grant execute on function public.hide_reported_forum_content(uuid[]) to service_role;

notify pgrst, 'reload schema';
commit;


-- Source: 20260910180000_account_deletion_lifecycle.sql
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


-- Source: 20260910233000_apple_account_deletion.sql
-- Apple provider credentials are NEVER exposed through client RLS or metadata.
create table if not exists public.apple_account_deletion_authorizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  nonce text not null check (length(nonce) = 43),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz
);

create table if not exists public.apple_account_deletion_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  client_id text not null,
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  encrypted_refresh_token text,
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((revoked_at is null and encrypted_refresh_token is not null)
      or (revoked_at is not null and encrypted_refresh_token is null))
);

alter table public.apple_account_deletion_authorizations enable row level security;
alter table public.apple_account_deletion_grants enable row level security;
revoke all on public.apple_account_deletion_authorizations from public, anon, authenticated;
revoke all on public.apple_account_deletion_grants from public, anon, authenticated;
grant all on public.apple_account_deletion_authorizations to service_role;
grant all on public.apple_account_deletion_grants to service_role;

create or replace function public.begin_apple_deletion_authorization(
  p_user_id uuid, p_session_id uuid, p_state_hash text, p_nonce text, p_identity_signed_in_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('apple-account-deletion:' || p_user_id::text, 0));
  if exists(select 1 from public.account_deletion_jobs where target_user_id = p_user_id and lease_until > now())
    or exists(select 1 from public.apple_account_deletion_authorizations where user_id = p_user_id and consumed_at is not null and expires_at > now())
    or exists(select 1 from public.apple_account_deletion_grants where user_id = p_user_id
      and (p_identity_signed_in_at is null
        or (revoked_at is null and p_identity_signed_in_at <= authorized_at)
        or (revoked_at is not null and p_identity_signed_in_at <= revoked_at)))
    then return false; end if;
  if not exists (select 1 from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id
    and (s.not_after is null or s.not_after > now())) then return false; end if;
  insert into public.apple_account_deletion_authorizations(user_id, session_id, state_hash, nonce)
    values(p_user_id, p_session_id, p_state_hash, p_nonce)
    on conflict(user_id) do update set session_id = excluded.session_id,
      state_hash = excluded.state_hash, nonce = excluded.nonce, created_at = now(),
      expires_at = now() + interval '10 minutes', consumed_at = null
    where apple_account_deletion_authorizations.created_at < now() - interval '1 minute';
  return found;
end;
$$;

create or replace function public.claim_apple_deletion_authorization(p_state_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare claimed public.apple_account_deletion_authorizations%rowtype; owner_id uuid;
begin
  select user_id into owner_id from public.apple_account_deletion_authorizations where state_hash = p_state_hash;
  if owner_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('apple-account-deletion:' || owner_id::text, 0));
  if exists(select 1 from public.account_deletion_jobs where target_user_id = owner_id and lease_until > now()) then return null; end if;
  -- Ninety seconds fences the <=60-second callback, even when the original state is about to expire.
  update public.apple_account_deletion_authorizations a set consumed_at = now(), expires_at = now() + interval '90 seconds'
    where a.state_hash = p_state_hash and a.consumed_at is null and a.expires_at > now()
      and exists(select 1 from auth.sessions s where s.id = a.session_id and s.user_id = a.user_id
        and (s.not_after is null or s.not_after > now()))
    returning a.* into claimed;
  if not found then return null; end if;
  return jsonb_build_object('user_id', claimed.user_id, 'nonce', claimed.nonce, 'state_hash', claimed.state_hash);
end;
$$;

create or replace function public.save_apple_deletion_grant(
  p_state_hash text, p_user_id uuid, p_client_id text, p_subject_hash text,
  p_encrypted_token text, p_identity_signed_in_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('apple-account-deletion:' || p_user_id::text, 0));
  if exists(select 1 from public.account_deletion_jobs where target_user_id = p_user_id and lease_until > now()) then return false; end if;
  -- Row lock prevents another start from replacing this transaction while it is saved.
  perform 1 from public.apple_account_deletion_authorizations a
    where a.state_hash = p_state_hash and a.user_id = p_user_id
      and a.consumed_at is not null and a.expires_at > now()
      and exists(select 1 from auth.sessions s where s.id = a.session_id and s.user_id = a.user_id
        and (s.not_after is null or s.not_after > now())) for update;
  if not found then return false; end if;
  insert into public.apple_account_deletion_grants(user_id, client_id, subject_hash, encrypted_refresh_token)
    values(p_user_id, p_client_id, p_subject_hash, p_encrypted_token)
    on conflict(user_id) do update set id = gen_random_uuid(), client_id = excluded.client_id,
      subject_hash = excluded.subject_hash, encrypted_refresh_token = excluded.encrypted_refresh_token,
      authorized_at = now(), revoked_at = null
    where apple_account_deletion_grants.revoked_at is null
      or p_identity_signed_in_at > apple_account_deletion_grants.revoked_at;
  if not found then return false; end if;
  delete from public.apple_account_deletion_authorizations where state_hash = p_state_hash;
  return true;
end;
$$;

revoke all on function public.begin_apple_deletion_authorization(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.claim_apple_deletion_authorization(text) from public, anon, authenticated;
revoke all on function public.save_apple_deletion_grant(text,uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.begin_apple_deletion_authorization(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.claim_apple_deletion_authorization(text) to service_role;
grant execute on function public.save_apple_deletion_grant(text,uuid,text,text,text,timestamptz) to service_role;

comment on table public.apple_account_deletion_grants is
  'Service-only AES-256-GCM Apple refresh credentials for user-requested account deletion. Token is cleared on revocation; row cascades on account deletion.';
