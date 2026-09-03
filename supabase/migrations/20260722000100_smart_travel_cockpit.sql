-- =========================================================
-- LETSGO2TRAVEL - SPRINT 6
-- AKILLI SEYAHAT KOKPİTİ
-- Benzersiz migration surumu: 20260722 explorer migration'i ile cakisma yok.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  destination_country text not null
    check (char_length(destination_country) between 2 and 100),
  destination_code text not null
    check (destination_code = upper(destination_code) and char_length(destination_code) = 2),
  destination_city text
    check (destination_city is null or char_length(destination_city) <= 100),

  start_date date not null,
  end_date date not null,
  departure_at timestamptz,

  flight_pnr text
    check (
      flight_pnr is null
      or flight_pnr ~ '^[A-Za-z0-9-]{3,20}$'
    ),

  checklist_items jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(checklist_items) = 'array'
      and jsonb_array_length(checklist_items) <= 50
    ),

  status text not null default 'upcoming'
    check (status in ('upcoming', 'active', 'completed', 'cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trips_date_order_check check (end_date >= start_date)
);

create index if not exists trips_user_start_date_idx
on public.trips (user_id, start_date asc);

create index if not exists trips_user_status_idx
on public.trips (user_id, status);

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

drop trigger if exists trips_set_updated_at on public.trips;

create trigger trips_set_updated_at
before update on public.trips
for each row
execute function public.set_trips_updated_at();

alter table public.trips enable row level security;

-- Kullanıcı yalnızca kendi seyahatlerini okuyabilir.
drop policy if exists "Trips read own" on public.trips;
create policy "Trips read own"
on public.trips
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Kullanıcı yalnızca kendi adına seyahat oluşturabilir.
drop policy if exists "Trips insert own" on public.trips;
create policy "Trips insert own"
on public.trips
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Kullanıcı yalnızca kendi seyahatini güncelleyebilir.
drop policy if exists "Trips update own" on public.trips;
create policy "Trips update own"
on public.trips
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Kullanıcı yalnızca kendi seyahatini silebilir.
drop policy if exists "Trips delete own" on public.trips;
create policy "Trips delete own"
on public.trips
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.trips from anon;
grant select, insert, update, delete on public.trips to authenticated;
grant all on public.trips to service_role;

comment on table public.trips is
'LetsGo2Travel Akıllı Seyahat Kokpiti kullanıcı seyahatleri.';

comment on column public.trips.flight_pnr is
'Opsiyonel uçuş PNR kodu. RLS nedeniyle yalnızca seyahatin sahibi erişebilir.';

comment on column public.trips.checklist_items is
'En fazla 50 maddelik JSONB kontrol listesi.';
