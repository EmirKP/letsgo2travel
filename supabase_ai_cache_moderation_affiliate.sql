-- Letsgo2Travel beta öncesi altyapı güçlendirme
-- AI cache + moderasyon log + affiliate click ölçümü

create table if not exists public.ai_plan_cache (
  id uuid primary key default gen_random_uuid(),
  request_hash text unique not null,
  input_json jsonb not null,
  output_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_plan_cache_request_hash_idx on public.ai_plan_cache(request_hash);
create index if not exists ai_plan_cache_updated_at_idx on public.ai_plan_cache(updated_at desc);

alter table public.ai_plan_cache enable row level security;

drop policy if exists "ai_plan_cache_admin_only" on public.ai_plan_cache;
create policy "ai_plan_cache_admin_only"
  on public.ai_plan_cache
  for all
  using (false)
  with check (false);

create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  admin_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists moderation_logs_target_idx on public.moderation_logs(target_type, target_id);
create index if not exists moderation_logs_created_at_idx on public.moderation_logs(created_at desc);

alter table public.moderation_logs enable row level security;

drop policy if exists "moderation_logs_admin_only" on public.moderation_logs;
create policy "moderation_logs_admin_only"
  on public.moderation_logs
  for all
  using (false)
  with check (false);

create table if not exists public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  provider text not null check (provider in ('aviasales', 'booking', 'airalo', 'getyourguide', 'other')),
  source_page text,
  destination text,
  affiliate_url text,
  utm_source text,
  utm_campaign text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_clicks_provider_created_idx on public.affiliate_clicks(provider, created_at desc);
create index if not exists affiliate_clicks_destination_idx on public.affiliate_clicks(destination);

alter table public.affiliate_clicks enable row level security;

drop policy if exists "affiliate_clicks_admin_only" on public.affiliate_clicks;
create policy "affiliate_clicks_admin_only"
  on public.affiliate_clicks
  for all
  using (false)
  with check (false);

-- Not: Bu üç tablo uygulama içinden service role ile kullanılır.
-- Client tarafına select/insert/update/delete açılmamalıdır.
