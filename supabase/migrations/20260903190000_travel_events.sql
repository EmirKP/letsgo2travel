-- Dünya Etkinlik Radarı: web ve mobilin okuduğu tek, denetlenebilir kaynak.
-- Dış sağlayıcı kayıtları API'de canlı birleştirilir; editoryal kayıtlar bu
-- tabloda tutulur. İptal/erteleme durumu içerikle birlikte taşınır.
begin;

create table if not exists public.travel_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'curated' check (provider in ('curated', 'ticketmaster')),
  provider_event_id text,
  title text not null check (char_length(title) between 2 and 240),
  description text check (description is null or char_length(description) <= 2000),
  category text not null default 'other' check (category in ('concert', 'festival', 'sport', 'culture', 'food', 'family', 'other')),
  country_code text not null check (country_code ~ '^[A-Z]{2}$' or country_code = 'XK'),
  city text not null check (char_length(city) between 1 and 120),
  venue text check (venue is null or char_length(venue) <= 180),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  status text not null default 'scheduled' check (status in ('scheduled', 'postponed', 'cancelled', 'completed')),
  image_url text check (image_url is null or image_url ~ '^https://'),
  ticket_url text check (ticket_url is null or ticket_url ~ '^https://'),
  source_url text not null check (source_url ~ '^https://'),
  featured boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists travel_events_country_date_idx
  on public.travel_events (country_code, starts_at)
  where published = true;
create index if not exists travel_events_featured_date_idx
  on public.travel_events (featured, starts_at)
  where published = true;

alter table public.travel_events enable row level security;

drop policy if exists "Published travel events are public" on public.travel_events;
create policy "Published travel events are public"
  on public.travel_events for select
  using (published = true);

revoke insert, update, delete on public.travel_events from anon, authenticated;
grant select on public.travel_events to anon, authenticated;

commit;
