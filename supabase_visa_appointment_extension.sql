-- LetsGo2Travel Vize Randevu Asistanı — Chrome Yardımcısı
-- Supabase > SQL Editor içinde tek sefer çalıştırın.
-- Mevcut tabloları silmez. Kullanıcının kendi doğrulanmış Chrome oturumunda
-- yalnızca görünür randevu durumunu okuyan yardımcı bağlantısını ekler.

create extension if not exists pgcrypto;

alter table public.visa_appointment_tracks
  add column if not exists execution_mode text not null default 'vds'
    check (execution_mode in ('vds', 'browser_extension')),
  add column if not exists extension_last_seen_at timestamptz;

create index if not exists visa_appointment_tracks_execution_mode_idx
  on public.visa_appointment_tracks(execution_mode, status, access_expires_at);

create table if not exists public.visa_appointment_extension_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.visa_appointment_tracks(id) on delete cascade,
  pairing_code_hash text,
  extension_token_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'revoked', 'expired')),
  expires_at timestamptz not null,
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_seen_at timestamptz,
  browser_name text,
  extension_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(track_id),
  unique(pairing_code_hash),
  unique(extension_token_hash)
);

create index if not exists visa_extension_pairings_user_idx
  on public.visa_appointment_extension_pairings(user_id, created_at desc);
create index if not exists visa_extension_pairings_token_idx
  on public.visa_appointment_extension_pairings(extension_token_hash)
  where extension_token_hash is not null;
create index if not exists visa_extension_pairings_pending_idx
  on public.visa_appointment_extension_pairings(pairing_code_hash, expires_at)
  where status = 'pending';

alter table public.visa_appointment_extension_pairings enable row level security;

drop policy if exists "users read own visa extension pairings" on public.visa_appointment_extension_pairings;
create policy "users read own visa extension pairings"
  on public.visa_appointment_extension_pairings
  for select
  using (auth.uid() = user_id);

-- Worker sadece VDS modundaki görevleri alır. Chrome yardımcısına devredilen görevler
-- VDS tarafından tekrar tekrar 403 üretmez.
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
      and execution_mode = 'vds'
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
