begin;

-- Support is private: only trusted service routes and administrators can read it.
-- Small, normalized screenshots live with their report so retries are atomic.
create table if not exists public.support_issues (
  id uuid primary key,
  actor_key text not null,
  payload_hash text not null,
  user_id uuid references auth.users(id) on delete cascade,
  description text not null check (char_length(description) between 10 and 3000),
  reply_email text check (char_length(reply_email) <= 254),
  screen text not null check (screen ~ '^[a-z][a-z0-9-]{0,49}$'),
  locale text not null check (locale in ('tr', 'en', 'sq')),
  app_version text not null check (char_length(app_version) between 1 and 40),
  build_number text not null check (char_length(build_number) between 1 and 40),
  screenshot_base64 text check (char_length(screenshot_base64) <= 800000),
  has_screenshot boolean generated always as (screenshot_base64 is not null) stored,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);
-- Support text, reply addresses and screenshots are private account records.
-- Reapplying this migration also corrects an earlier SET NULL relation.
alter table public.support_issues drop constraint if exists support_issues_user_id_fkey;
alter table public.support_issues add constraint support_issues_user_id_fkey
  foreign key(user_id) references auth.users(id) on delete cascade;
create index if not exists support_issues_actor_created on public.support_issues(actor_key, created_at desc);
create index if not exists support_issues_status_created on public.support_issues(status, created_at desc);
alter table public.support_issues enable row level security;
revoke all on public.support_issues from public, anon, authenticated;
grant all on public.support_issues to service_role;

create or replace function public.submit_support_issue(
  p_request_id uuid, p_actor_key text, p_payload_hash text, p_user_id uuid,
  p_description text, p_email text, p_screen text, p_locale text,
  p_version text, p_build text, p_screenshot text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare previous public.support_issues; recent_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor_key, 0));
  select * into previous from public.support_issues where id = p_request_id;
  if found then
    if previous.actor_key <> p_actor_key or previous.payload_hash <> p_payload_hash then
      raise exception 'support-id-conflict';
    end if;
    return previous.id;
  end if;
  select count(*) into recent_count from public.support_issues
    where actor_key = p_actor_key and created_at > now() - interval '1 hour';
  if recent_count >= 5 then raise exception 'support-rate-limited'; end if;
  insert into public.support_issues(id, actor_key, payload_hash, user_id, description, reply_email, screen, locale, app_version, build_number, screenshot_base64)
    values (p_request_id, p_actor_key, p_payload_hash, p_user_id, p_description, p_email, p_screen, p_locale, p_version, p_build, p_screenshot);
  return p_request_id;
end; $$;
revoke all on function public.submit_support_issue(uuid, text, text, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_support_issue(uuid, text, text, uuid, text, text, text, text, text, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
