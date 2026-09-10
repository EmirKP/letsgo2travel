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
