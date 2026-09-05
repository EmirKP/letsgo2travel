-- =========================================================
-- LETSGO2TRAVEL BUILD 22 - ORTAK SEYAHAT
-- Davet, katilimci yetkisi, oylama, butce ve masraf paylasimi.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create unique index if not exists trip_members_one_owner_idx
  on public.trip_members (trip_id) where role = 'owner';
create index if not exists trip_members_user_idx on public.trip_members (user_id, joined_at desc);

insert into public.trip_members (trip_id, user_id, role, added_by, joined_at)
select id, user_id, 'owner', user_id, created_at
from public.trips
on conflict (trip_id, user_id) do update set role = 'owner';

create or replace function public.attach_trip_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role, added_by)
  values (new.id, new.user_id, 'owner', new.user_id)
  on conflict (trip_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists trips_attach_owner on public.trips;
create trigger trips_attach_owner
after insert on public.trips
for each row execute function public.attach_trip_owner();

create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  invited_role text not null default 'editor' check (invited_role in ('editor', 'viewer')),
  max_uses integer not null default 12 check (max_uses between 1 and 50),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trip_invites_trip_idx on public.trip_invites (trip_id, created_at desc);

create table if not exists public.trip_plan_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  option_type text not null default 'activity' check (option_type in ('route', 'stay', 'activity', 'transport', 'other')),
  title text not null check (char_length(title) between 2 and 120),
  details text check (details is null or char_length(details) <= 600),
  created_at timestamptz not null default now()
);
create index if not exists trip_plan_options_trip_idx on public.trip_plan_options (trip_id, created_at desc);

create table if not exists public.trip_plan_votes (
  option_id uuid not null references public.trip_plan_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);

create table if not exists public.trip_budgets (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  currency text not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
  target_amount numeric(12,2) not null default 0 check (target_amount >= 0 and target_amount <= 100000000),
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  paid_by uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  amount numeric(12,2) not null check (amount > 0 and amount <= 100000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  spent_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists trip_expenses_trip_idx on public.trip_expenses (trip_id, spent_at desc, created_at desc);

create table if not exists public.trip_expense_shares (
  expense_id uuid not null references public.trip_expenses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0 and amount <= 100000000),
  primary key (expense_id, user_id)
);

-- Bu tablolar yalniz kimligi dogrulanmis sunucu API'sinden erisilir. Ham davet
-- kodu veritabanina hic yazilmaz; yalniz SHA-256 ozeti tutulur.
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.trip_plan_options enable row level security;
alter table public.trip_plan_votes enable row level security;
alter table public.trip_budgets enable row level security;
alter table public.trip_expenses enable row level security;
alter table public.trip_expense_shares enable row level security;

revoke all on public.trip_members, public.trip_invites, public.trip_plan_options,
  public.trip_plan_votes, public.trip_budgets, public.trip_expenses,
  public.trip_expense_shares from anon, authenticated;

create or replace function public.accept_trip_invite(p_token_hash text, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_invite public.trip_invites%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  -- Ayni kodun ayni anda iki kez kabul edilmesi kullanim sayisini veya
  -- uyeligi yaristirmasin.
  perform pg_advisory_xact_lock(hashtext(p_token_hash));

  select * into selected_invite
  from public.trip_invites
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now();

  if selected_invite.id is null then
    raise exception 'invite_invalid';
  end if;

  if exists (select 1 from public.trip_members where trip_id = selected_invite.trip_id and user_id = p_user_id) then
    return selected_invite.trip_id;
  end if;

  update public.trip_invites
  set use_count = use_count + 1
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now()
    and use_count < max_uses
  returning * into selected_invite;

  if selected_invite.id is null then
    raise exception 'invite_invalid';
  end if;

  insert into public.trip_members (trip_id, user_id, role, added_by)
  values (selected_invite.trip_id, p_user_id, selected_invite.invited_role, selected_invite.created_by)
  on conflict (trip_id, user_id) do nothing;

  return selected_invite.trip_id;
end;
$$;

revoke all on function public.accept_trip_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.accept_trip_invite(text, uuid) to service_role;
