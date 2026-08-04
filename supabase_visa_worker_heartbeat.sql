-- LetsGo2Travel Vize Worker canlılık kaydı
-- Supabase Dashboard > SQL Editor > New query ekranında tamamını çalıştırın.
-- Mevcut kayıtları silmez; yeniden çalıştırılabilir.

create table if not exists public.visa_worker_heartbeats (
  worker_name text primary key,
  status text not null default 'starting'
    check (status in ('starting', 'running', 'idle', 'error')),
  poll_interval_ms integer not null default 300000
    check (poll_interval_ms between 60000 and 3600000),
  worker_version text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now(),
  check (char_length(worker_name) between 1 and 80)
);

create index if not exists visa_worker_heartbeats_last_seen_idx
  on public.visa_worker_heartbeats (last_seen_at desc);

comment on table public.visa_worker_heartbeats is
  'VDS worker canlılık sinyalleri; yalnızca service_role erişebilir.';

alter table public.visa_worker_heartbeats enable row level security;

revoke all on public.visa_worker_heartbeats from public, anon, authenticated;
grant all on public.visa_worker_heartbeats to service_role;

