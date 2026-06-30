-- LetsGo2Travel fiyat alarmı ve mail log güçlendirme paketi
-- Supabase SQL Editor'da çalıştırılabilir. Mevcut tabloları bozmadan eksik alanları ekler.

create extension if not exists pgcrypto;

create table if not exists public.flight_price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text not null,
  origin_code text not null,
  origin_label text,
  destination_code text not null,
  destination_label text,
  departure_date date not null,
  return_date date null,
  trip_type text default 'one_way',
  adults int default 1,
  children int default 0,
  infants int default 0,
  cabin_class text default 'economy',
  currency text default 'TRY',
  base_price numeric null,
  target_price numeric null,
  threshold_percent numeric default 5,
  last_checked_price numeric null,
  lowest_price_seen numeric null,
  last_notified_price numeric null,
  last_checked_at timestamptz null,
  last_notified_at timestamptz null,
  notify_email boolean default true,
  notify_push boolean default false,
  is_active boolean default true,
  manage_token_hash text null,
  manage_token_expires_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.flight_price_alerts add column if not exists status text default 'active';
alter table public.flight_price_alerts add column if not exists last_mail_status text null;
alter table public.flight_price_alerts add column if not exists last_error_message text null;
alter table public.flight_price_alerts add column if not exists last_error_at timestamptz null;
alter table public.flight_price_alerts add column if not exists error_count int default 0;
alter table public.flight_price_alerts add column if not exists cancelled_at timestamptz null;
alter table public.flight_price_alerts add column if not exists manage_token_hash text null;
alter table public.flight_price_alerts add column if not exists manage_token_expires_at timestamptz null;

create index if not exists idx_flight_price_alerts_active_status on public.flight_price_alerts(is_active, status);
create index if not exists idx_flight_price_alerts_route_date on public.flight_price_alerts(origin_code, destination_code, departure_date, return_date);
create index if not exists idx_flight_price_alerts_email on public.flight_price_alerts(email);

create table if not exists public.flight_price_alert_logs (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid null references public.flight_price_alerts(id) on delete set null,
  status text not null,
  price numeric null,
  currency text default 'TRY',
  error_message text null,
  raw_response jsonb null,
  checked_at timestamptz default now()
);

create index if not exists idx_flight_price_alert_logs_alert_id on public.flight_price_alert_logs(alert_id);
create index if not exists idx_flight_price_alert_logs_checked_at on public.flight_price_alert_logs(checked_at desc);

create table if not exists public.mail_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  subject text not null,
  category text not null,
  status text not null,
  provider_id text null,
  error_message text null,
  reference_type text null,
  reference_id uuid null,
  created_at timestamptz default now()
);

create index if not exists idx_mail_delivery_logs_reference on public.mail_delivery_logs(reference_type, reference_id);
create index if not exists idx_mail_delivery_logs_created_at on public.mail_delivery_logs(created_at desc);
create index if not exists idx_mail_delivery_logs_category_status on public.mail_delivery_logs(category, status);

-- Cron job için örnek çağrı:
-- GET /api/cron/check-price-alerts
-- Header: Authorization: Bearer <CRON_SECRET>
