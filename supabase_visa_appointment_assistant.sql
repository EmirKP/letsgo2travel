-- LetsGo2Travel Vize Randevu Asistanı
-- Supabase SQL Editor içinde tek sefer çalıştırın.

create extension if not exists pgcrypto;

create table if not exists public.visa_appointment_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  official_base_url text,
  status text not null default 'verification_required' check (status in ('verification_required','testing','active','paused','maintenance')),
  check_interval_minutes integer not null default 5 check (check_interval_minutes between 5 and 1440),
  supports_assisted_handoff boolean not null default true,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visa_appointment_centers (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.visa_appointment_providers(id) on delete cascade,
  country_code char(2) not null,
  country_name text not null,
  city text not null,
  visa_categories text[] not null default array['tourism']::text[],
  status text not null default 'verification_required' check (status in ('verification_required','testing','active','paused')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id, country_code, city)
);

create table if not exists public.visa_appointment_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code char(2) not null,
  country_name text not null,
  provider_code text,
  provider_name text,
  center_id uuid references public.visa_appointment_centers(id) on delete set null,
  application_city text not null,
  alternative_city text,
  visa_category text not null check (visa_category in ('tourism','family_visit','business','education','cultural','transit')),
  applicants_count integer not null default 1 check (applicants_count between 1 and 4),
  earliest_date date not null,
  latest_date date not null,
  notify_email boolean not null default true,
  notify_push boolean not null default true,
  notify_in_app boolean not null default true,
  status text not null default 'pending_activation' check (status in ('pending_activation','active','paused','match_found','verification_required','expired','error')),
  entitlement_source text not null default 'beta_grant',
  access_expires_at timestamptz not null,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_check_started_at timestamptz,
  last_result text,
  error_count integer not null default 0,
  locked_until timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latest_date >= earliest_date)
);

drop index if exists public.visa_appointment_one_live_track_per_user;
create index if not exists visa_appointment_live_tracks_user_idx
on public.visa_appointment_tracks(user_id, status, access_expires_at);

create index if not exists visa_appointment_due_jobs_idx
on public.visa_appointment_tracks(status, next_check_at, access_expires_at)
where status = 'active';

create table if not exists public.visa_appointment_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid references public.visa_appointment_tracks(id) on delete cascade,
  source text not null check (source in ('beta_grant','rewarded_ad','admin_grant','promotion')),
  external_reward_id text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(source, external_reward_id)
);

create table if not exists public.visa_appointment_check_logs (
  id bigint generated always as identity primary key,
  track_id uuid not null references public.visa_appointment_tracks(id) on delete cascade,
  worker_name text,
  outcome text not null check (outcome in ('no_slots','slot_found','verification_required','provider_unavailable','error')),
  message text,
  available_dates text[] not null default '{}'::text[],
  evidence_url text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists visa_appointment_check_logs_track_idx on public.visa_appointment_check_logs(track_id, checked_at desc);

create table if not exists public.visa_appointment_matches (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.visa_appointment_tracks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  available_dates text[] not null default '{}'::text[],
  provider_message text,
  evidence_url text,
  status text not null default 'new' check (status in ('new','opened','completed','expired','dismissed')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visa_appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.visa_appointment_tracks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email','push','in_app','telegram')),
  event_type text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','opened')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.visa_appointment_system_events (
  id bigint generated always as identity primary key,
  provider_code text,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_visa_appointment_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_visa_tracks_updated_at on public.visa_appointment_tracks;
create trigger set_visa_tracks_updated_at before update on public.visa_appointment_tracks for each row execute function public.set_visa_appointment_updated_at();
drop trigger if exists set_visa_providers_updated_at on public.visa_appointment_providers;
create trigger set_visa_providers_updated_at before update on public.visa_appointment_providers for each row execute function public.set_visa_appointment_updated_at();
drop trigger if exists set_visa_centers_updated_at on public.visa_appointment_centers;
create trigger set_visa_centers_updated_at before update on public.visa_appointment_centers for each row execute function public.set_visa_appointment_updated_at();
drop trigger if exists set_visa_matches_updated_at on public.visa_appointment_matches;
create trigger set_visa_matches_updated_at before update on public.visa_appointment_matches for each row execute function public.set_visa_appointment_updated_at();

create or replace function public.claim_visa_appointment_jobs(p_worker_name text, p_limit integer default 3)
returns setof public.visa_appointment_tracks
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.visa_appointment_tracks
    where status = 'active'
      and access_expires_at > now()
      and coalesce(next_check_at, now()) <= now()
      and (locked_until is null or locked_until < now())
      and provider_code is not null
    order by next_check_at nulls first
    for update skip locked
    limit greatest(1, least(p_limit, 10))
  )
  update public.visa_appointment_tracks t
  set locked_until = now() + interval '4 minutes',
      locked_by = left(p_worker_name, 80),
      last_check_started_at = now()
  from candidates c
  where t.id = c.id
  returning t.*;
end;
$$;

revoke all on function public.claim_visa_appointment_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_visa_appointment_jobs(text, integer) to service_role;

alter table public.visa_appointment_providers enable row level security;
alter table public.visa_appointment_centers enable row level security;
alter table public.visa_appointment_tracks enable row level security;
alter table public.visa_appointment_entitlements enable row level security;
alter table public.visa_appointment_check_logs enable row level security;
alter table public.visa_appointment_matches enable row level security;
alter table public.visa_appointment_notifications enable row level security;
alter table public.visa_appointment_system_events enable row level security;

drop policy if exists "public read active visa providers" on public.visa_appointment_providers;
create policy "public read active visa providers" on public.visa_appointment_providers for select using (status in ('testing','active','maintenance'));
drop policy if exists "public read active visa centers" on public.visa_appointment_centers;
create policy "public read active visa centers" on public.visa_appointment_centers for select using (status in ('testing','active'));

drop policy if exists "users read own visa tracks" on public.visa_appointment_tracks;
create policy "users read own visa tracks" on public.visa_appointment_tracks for select using (auth.uid() = user_id);
drop policy if exists "users read own visa entitlements" on public.visa_appointment_entitlements;
create policy "users read own visa entitlements" on public.visa_appointment_entitlements for select using (auth.uid() = user_id);
drop policy if exists "users read own visa matches" on public.visa_appointment_matches;
create policy "users read own visa matches" on public.visa_appointment_matches for select using (auth.uid() = user_id);
drop policy if exists "users read own visa notifications" on public.visa_appointment_notifications;
create policy "users read own visa notifications" on public.visa_appointment_notifications for select using (auth.uid() = user_id);

-- Sağlayıcılar gerçek portallar tek tek doğrulanana kadar pasif kalır.
insert into public.visa_appointment_providers(code, name, status)
values
  ('demo', 'LetsGo2Travel Test Sağlayıcısı', 'active'),
  ('idata', 'iDATA', 'verification_required'),
  ('vfs', 'VFS Global', 'verification_required'),
  ('tls', 'TLScontact', 'verification_required'),
  ('bls', 'BLS International', 'verification_required'),
  ('kosmos', 'Kosmos', 'verification_required'),
  ('embassy', 'Konsolosluk / Büyükelçilik sistemi', 'verification_required')
on conflict (code) do update set name = excluded.name;
