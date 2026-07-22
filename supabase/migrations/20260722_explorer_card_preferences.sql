-- Bu migration yalnızca kart tercihleri ve dönemsel başarımları ekler.
-- Mevcut travel_verifications, user_points_log, profiles ve lig tablolarındaki
-- kolon adları bilinmeden yanlış bir özet VIEW'i oluşturmamak için
-- explorer_card_summary VIEW'i burada kasıtlı olarak oluşturulmamıştır.
--
-- Uygulamanın beklediği explorer_card_summary kolonları:
-- user_id, username, display_name, avatar_url, profile_slug,
-- level_key, level_label, level_number, verified_countries,
-- visa_free_discoveries, continents, explorer_points,
-- league_percentile, documented_traveler, verified_country_names

create table if not exists public.explorer_card_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_name boolean not null default true,
  show_ranking boolean not null default true,
  show_country_list boolean not null default true,
  show_on_profile boolean not null default false,
  preferred_format text not null default 'story'
    check (preferred_format in ('story', 'post', 'square')),
  updated_at timestamptz not null default now()
);

alter table public.explorer_card_preferences enable row level security;

drop policy if exists "Explorer card preferences read own" on public.explorer_card_preferences;
create policy "Explorer card preferences read own"
on public.explorer_card_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Explorer card preferences insert own" on public.explorer_card_preferences;
create policy "Explorer card preferences insert own"
on public.explorer_card_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Explorer card preferences update own" on public.explorer_card_preferences;
create policy "Explorer card preferences update own"
on public.explorer_card_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.explorer_card_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  title text not null,
  detail text not null,
  progress integer,
  target integer,
  period_key text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, achievement_key, period_key)
);

create index if not exists explorer_card_achievements_user_active_idx
on public.explorer_card_achievements (user_id, is_active, sort_order);

alter table public.explorer_card_achievements enable row level security;

drop policy if exists "Explorer card achievements read own" on public.explorer_card_achievements;
create policy "Explorer card achievements read own"
on public.explorer_card_achievements
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Başarım kayıtları kullanıcı tarafından doğrudan yazılmamalıdır.
-- Bunları güvenilir sunucu işlemi, cron veya SECURITY DEFINER RPC üretmelidir.
