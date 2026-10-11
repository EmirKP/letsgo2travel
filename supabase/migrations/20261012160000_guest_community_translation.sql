begin;
-- Automatic translation for public community readers. No IP/text/translations are retained.
create table if not exists public.guest_forum_translation_usage (
  actor_key text primary key check(actor_key ~ '^[a-f0-9]{64}$'),
  day date not null,
  daily_count integer not null check(daily_count between 0 and 60),
  minute timestamptz not null,
  minute_count integer not null check(minute_count between 0 and 4)
);
alter table public.guest_forum_translation_usage enable row level security;
revoke all on public.guest_forum_translation_usage from public,anon,authenticated;
grant all on public.guest_forum_translation_usage to service_role;
create or replace function public.consume_guest_forum_translation_quota(p_actor text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_day date := (now() at time zone 'UTC')::date; v_minute timestamptz := date_trunc('minute',now()); v_actor text;
begin
  if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from public.guest_forum_translation_usage where day < v_day-7;
  insert into public.guest_forum_translation_usage(actor_key,day,daily_count,minute,minute_count)
    values(p_actor,v_day,1,v_minute,1)
  on conflict(actor_key) do update set day=v_day,
    daily_count=case when guest_forum_translation_usage.day=v_day then guest_forum_translation_usage.daily_count+1 else 1 end,
    minute=v_minute,
    minute_count=case when guest_forum_translation_usage.minute=v_minute then guest_forum_translation_usage.minute_count+1 else 1 end
  where (guest_forum_translation_usage.day<>v_day or guest_forum_translation_usage.daily_count<60)
    and (guest_forum_translation_usage.minute<>v_minute or guest_forum_translation_usage.minute_count<4)
  returning actor_key into v_actor;
  return v_actor is not null;
end;
$$;
revoke all on function public.consume_guest_forum_translation_quota(text) from public,anon,authenticated;
grant execute on function public.consume_guest_forum_translation_quota(text) to service_role;
commit;
