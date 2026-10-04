-- Explicit profile completion may repair a missing own profile after OAuth.
-- Apply after 20260903170000_protect_profile_roles.sql. This adds no admin path,
-- changes no existing profile, and leaves all other insert grants unchanged.
begin;

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regprocedure('public.enforce_profile_role_boundary()') is null then
    raise exception 'Profile role protection migration is required before profile recovery';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'zz_profiles_role_boundary'
      and tgfoid = 'public.enforce_profile_role_boundary()'::regprocedure
      and tgenabled in ('O', 'A')
      and not tgisinternal
  ) then
    raise exception 'Enabled profile role protection trigger is required before profile recovery';
  end if;
end;
$$;

alter table public.profiles enable row level security;
grant insert (id, username) on public.profiles to authenticated;

drop policy if exists "Profiles authenticated insert own" on public.profiles;
create policy "Profiles authenticated insert own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

-- Also constrain any legacy permissive INSERT policy. Service-side provisioning
-- keeps its existing behavior; an authenticated client can only create itself.
drop policy if exists "Profiles authenticated insert own boundary" on public.profiles;
create policy "Profiles authenticated insert own boundary"
on public.profiles as restrictive for insert to authenticated
with check ((select auth.uid()) = id);

commit;
