begin;

-- Only counters are retained. Forum/source/translated text never enters this table.
create table if not exists public.forum_translation_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day date not null,
  daily_count integer not null default 0 check (daily_count between 0 and 100),
  minute timestamptz not null,
  minute_count integer not null default 0 check (minute_count between 0 and 8)
);
alter table public.forum_translation_usage enable row level security;
revoke all on public.forum_translation_usage from public, anon, authenticated;
grant all on public.forum_translation_usage to service_role;

create or replace function public.consume_forum_translation_quota(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_minute timestamptz := date_trunc('minute', now());
  v_user uuid;
begin
  if p_user is null then return false; end if;
  insert into public.forum_translation_usage(user_id,day,daily_count,minute,minute_count)
    values(p_user,v_day,1,v_minute,1)
  on conflict(user_id) do update set
    day = v_day,
    daily_count = case when forum_translation_usage.day = v_day then forum_translation_usage.daily_count + 1 else 1 end,
    minute = v_minute,
    minute_count = case when forum_translation_usage.minute = v_minute then forum_translation_usage.minute_count + 1 else 1 end
  where (forum_translation_usage.day <> v_day or forum_translation_usage.daily_count < 100)
    and (forum_translation_usage.minute <> v_minute or forum_translation_usage.minute_count < 8)
  returning user_id into v_user;
  return v_user is not null;
end;
$$;
revoke all on function public.consume_forum_translation_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_forum_translation_quota(uuid) to service_role;
commit;
