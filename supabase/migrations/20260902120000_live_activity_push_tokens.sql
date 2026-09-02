-- =====================================================================
-- LIVE ACTIVITY PUSH-TO-START ALTYAPISI (v3) — HAZIRLANDI, UYGULANMADI
-- ---------------------------------------------------------------------
-- Amaç: uygulama KAPALIYKEN Dynamic Island / kilit ekranı aktivitesinin
-- APNs "liveactivity" push'u ile başlatılıp bitirilebilmesi (iOS 17.2+
-- push-to-start; iOS 16.2-17.1 yalnız uygulama içi başlatma + yerel
-- bildirim fallback'i).
--
-- v3 teslim modeli: teslim durumu TRIP DEĞİL, trip + token(cihaz) + event
-- bazında tutulur (live_activity_deliveries). Cron atomik claim ile
-- çalışır: lease (claimed_until), fencing (claim_token), attempt_count ve
-- next_retry_at. Paralel cron'lar aynı teslimi iki kez gönderemez; bir
-- token'ın başarısı diğerinin yeniden denemesini engellemez.
--
-- Güvenlik modeli push_devices ile aynıdır: RLS default-deny, anon/
-- authenticated için hiçbir policy YOK; tüm erişim service-role üzerinden
-- sunucu katmanında, kullanıcı sahipliği Bearer oturumuyla doğrulanarak
-- yapılır. Token değerleri istemciye/loga geri yazılmaz.
-- =====================================================================
begin;

create table if not exists public.live_activity_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- push_to_start: cihaz başına tek genel token (iOS 17.2+).
  -- activity_update: BAŞLAMIŞ bir aktivitenin güncelleme/bitirme tokenı
  --   (trip_id zorunlu; kalkış sonrası "end" push'u bununla gönderilir).
  token_type text not null check (token_type in ('push_to_start', 'activity_update')),
  trip_id uuid references public.trips(id) on delete cascade,
  token text not null check (char_length(token) between 16 and 512),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_activity_tokens_trip_required
    check (token_type <> 'activity_update' or trip_id is not null),
  constraint live_activity_tokens_unique unique (user_id, token_type, token)
);

create index if not exists live_activity_tokens_user_type_idx
  on public.live_activity_tokens (user_id, token_type) where enabled;
create index if not exists live_activity_tokens_trip_idx
  on public.live_activity_tokens (trip_id) where enabled;

-- ---------------------------------------------------------------------
-- Teslim kayıtları: (trip, token, event) başına TEK satır.
-- Durum makinesi: pending → sent | transient_failed (≤3 deneme, sonra
-- permanent_failed) | permanent_failed. Claim: claim_token + claimed_until
-- (lease). next_retry_at transient geri çekilme zamanıdır.
-- ---------------------------------------------------------------------
create table if not exists public.live_activity_deliveries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token_id uuid not null references public.live_activity_tokens(id) on delete cascade,
  event text not null check (event in ('start', 'end')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'transient_failed', 'permanent_failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claim_token uuid,
  claimed_until timestamptz,
  next_retry_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_activity_deliveries_unique unique (trip_id, token_id, event)
);

create index if not exists live_activity_deliveries_due_idx
  on public.live_activity_deliveries (next_retry_at)
  where status in ('pending', 'transient_failed');
create index if not exists live_activity_deliveries_trip_idx
  on public.live_activity_deliveries (trip_id, event);

alter table public.live_activity_tokens enable row level security;
alter table public.live_activity_deliveries enable row level security;
-- Policy YOK: default-deny. Erişim yalnız service-role (sunucu katmanı).
revoke all on public.live_activity_tokens from anon, authenticated;
revoke all on public.live_activity_deliveries from anon, authenticated;

commit;
