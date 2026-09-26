-- No photographs or translation text are stored. Old quota counters are pruned on the next use.
create table if not exists public.travel_photo_quota (
  day date not null,
  scope text not null,
  user_id uuid references auth.users(id) on delete cascade,
  uses integer not null default 0 check (uses >= 0),
  primary key (day, scope)
);
alter table public.travel_photo_quota enable row level security;
revoke all on public.travel_photo_quota from public, anon, authenticated;

create or replace function public.consume_travel_photo_quota(p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare d date := (now() at time zone 'UTC')::date;
begin
  if p_user is null then return false; end if;
  -- Serialize global and per-user checks so concurrent workers cannot overrun the cap.
  perform pg_advisory_xact_lock(726092617000);
  delete from public.travel_photo_quota where day < d - 2;
  if coalesce((select uses from public.travel_photo_quota where day=d and scope='global'),0) >= 100
     or coalesce((select uses from public.travel_photo_quota where day=d and scope=p_user::text),0) >= 5 then return false; end if;
  insert into public.travel_photo_quota(day,scope,user_id,uses) values(d,'global',null,1),(d,p_user::text,p_user,1)
  on conflict(day,scope) do update set uses=public.travel_photo_quota.uses+1;
  return true;
end;
$$;
revoke all on function public.consume_travel_photo_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_travel_photo_quota(uuid) to service_role;
