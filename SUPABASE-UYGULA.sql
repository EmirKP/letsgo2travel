-- LetsGo2Travel zorunlu veritabanı düzeltmeleri
-- Supabase Dashboard > SQL Editor > New query ekranında tamamını bir kez çalıştırın.

create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_country text not null,
  destination_code text not null check (char_length(destination_code) between 2 and 3),
  destination_city text,
  start_date date not null,
  end_date date not null,
  departure_at timestamptz,
  flight_pnr text,
  checklist_items jsonb not null default '[]'::jsonb,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_date_order check (end_date >= start_date)
);

create index if not exists trips_user_start_date_idx
  on public.trips (user_id, start_date);

alter table public.trips enable row level security;

drop policy if exists "Kullanıcı kendi seyahatlerini görebilir" on public.trips;
create policy "Kullanıcı kendi seyahatlerini görebilir"
  on public.trips for select
  using (auth.uid() = user_id);

drop policy if exists "Kullanıcı kendi seyahatini ekleyebilir" on public.trips;
create policy "Kullanıcı kendi seyahatini ekleyebilir"
  on public.trips for insert
  with check (auth.uid() = user_id);

drop policy if exists "Kullanıcı kendi seyahatini güncelleyebilir" on public.trips;
create policy "Kullanıcı kendi seyahatini güncelleyebilir"
  on public.trips for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Kullanıcı kendi seyahatini silebilir" on public.trips;
create policy "Kullanıcı kendi seyahatini silebilir"
  on public.trips for delete
  using (auth.uid() = user_id);

create or replace function public.set_trips_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_trips_updated_at_trigger on public.trips;
create trigger set_trips_updated_at_trigger
before update on public.trips
for each row execute function public.set_trips_updated_at();

grant select, insert, update, delete on public.trips to authenticated;
grant all on public.trips to service_role;

-- Vize Merkezi tablosu eski kurulumlarda bulunmayabilir. Bu dosya tek başına
-- çalışabilsin diye tabloyu ve sunucu tarafındaki güncelleme geçmişini burada
-- idempotent olarak oluşturuyoruz.
create table if not exists public.visa_center_pages (
  id uuid primary key default gen_random_uuid(),
  country_code text unique not null,
  slug text unique not null,
  country_name text not null,
  visa_title text,
  visa_type text,
  summary text,
  who_should_apply text,
  required_documents jsonb,
  application_steps jsonb,
  average_processing_time text,
  common_mistakes jsonb,
  highlighted_warnings jsonb,
  appointment_status text,
  appointment_note text,
  source_note text,
  official_source_url text,
  last_checked_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.visa_center_pages
  add column if not exists official_source_url text;

comment on column public.visa_center_pages.official_source_url is
  'Kullanıcıya gösterilecek HTTPS resmî kurum veya yetkili başvuru merkezi bağlantısı';

create table if not exists public.visa_appointment_updates (
  id uuid primary key default gen_random_uuid(),
  visa_page_id uuid not null references public.visa_center_pages(id) on delete cascade,
  admin_user_id uuid references auth.users(id) on delete set null,
  appointment_status text,
  appointment_note text,
  source_note text,
  created_at timestamptz not null default now()
);

alter table public.visa_center_pages enable row level security;
alter table public.visa_appointment_updates enable row level security;

drop policy if exists "Herkes aktif vize sayfalarını görebilir" on public.visa_center_pages;
create policy "Herkes aktif vize sayfalarını görebilir"
  on public.visa_center_pages for select
  to anon, authenticated
  using (is_active = true);

grant select on public.visa_center_pages to anon, authenticated;
grant all on public.visa_center_pages to service_role;

-- Güncelleme geçmişi yalnızca service_role kullanan korumalı yönetim API'sinden
-- okunup yazılır; tarayıcı kullanıcılarına doğrudan açılmaz.
revoke all on public.visa_appointment_updates from anon, authenticated;
grant all on public.visa_appointment_updates to service_role;

insert into public.visa_center_pages
  (country_code, slug, country_name, visa_title, visa_type, appointment_status)
values
  ('GB', 'ingiltere-uk-visitor-visa', 'İngiltere', 'UK Visitor Visa', 'Standart Ziyaretçi', 'bilgi_yok'),
  ('FR', 'fransa-schengen', 'Fransa', 'Schengen C Tipi', 'Turistik', 'bilgi_yok'),
  ('DE', 'almanya-schengen', 'Almanya', 'Schengen C Tipi', 'Turistik', 'bilgi_yok'),
  ('IT', 'italya-schengen', 'İtalya', 'Schengen C Tipi', 'Turistik', 'bilgi_yok'),
  ('NL', 'hollanda-schengen', 'Hollanda', 'Schengen C Tipi', 'Turistik', 'bilgi_yok'),
  ('US', 'abd-b1-b2', 'ABD', 'B1/B2 Ziyaretçi', 'Turistik/Ticari', 'bilgi_yok'),
  ('AE', 'bae-e-vize', 'BAE', 'E-Vize', 'Elektronik', 'bilgi_yok'),
  ('GR', 'yunanistan-schengen', 'Yunanistan', 'Schengen C Tipi', 'Turistik', 'bilgi_yok')
on conflict (country_code) do nothing;

-- VDS worker canlılık sinyali. Kullanıcı ekranındaki sistem durumu bu tablodan
-- hesaplanır; tablo tarayıcı rollerine doğrudan açılmaz.
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

alter table public.visa_worker_heartbeats enable row level security;
revoke all on public.visa_worker_heartbeats from public, anon, authenticated;
grant all on public.visa_worker_heartbeats to service_role;
