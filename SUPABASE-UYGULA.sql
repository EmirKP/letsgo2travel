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

alter table public.visa_center_pages
  add column if not exists official_source_url text;

comment on column public.visa_center_pages.official_source_url is
  'Kullanıcıya gösterilecek HTTPS resmî kurum veya yetkili başvuru merkezi bağlantısı';
