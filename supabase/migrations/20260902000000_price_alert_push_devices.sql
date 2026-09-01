-- =====================================================================
-- FİYAT ALARMI HOTFIX v4: push cihaz kayıtları + atomik bildirim claim
--                         + atomik/monotonik mark_alert_notified (3b)
-- ---------------------------------------------------------------------
-- Bağımsız uçuş fiyat alarmı KORUNAN bir üründür (Emir kararı).
-- Bu migration VERİ SİLMEZ (yalnız CREATE/ALTER ADD + fonksiyon).
--
-- 1) push_devices: kullanıcı cihaz tokenları (iOS APNs / Android FCM).
--    - unique(platform, device_token): aynı token aynı anda yalnız TEK
--      kullanıcıya bağlı olabilir; hesap değişiminde kayıt tek atomik
--      UPSERT ile yeni kullanıcıya devredilir.
-- 2) flight_price_alert_notifications: kanal bazlı bildirim kaydı +
--    yeniden deneme durumu (attempt_count, last_attempt_at, next_retry_at,
--    failure_kind) + olay SNAPSHOT'ı (event_price, event_currency; retry
--    fiyat sonradan değişse bile ORİJİNAL olayla tamamlanır) + fencing
--    token'ı (claim_token). unique(alert_id, channel, event_key).
-- 3) claim_alert_notification(): SECURITY DEFINER, satır düzeyinde atomik.
--    Kurallar:
--      * status='sent'  -> bir daha ASLA claim edilemez.
--      * status='pending' ve last_attempt_at taze -> claim edilemez
--        (başka cron çalışıyor); süresi geçmiş pending YALNIZ
--        attempt_count < max ise devralınır (sınırsız deneme yok).
--      * status='failed' + failure_kind='transient' -> next_retry_at
--        geçtiyse ve attempt_count < max -> tekrar claim edilir.
--      * status='failed' + failure_kind='permanent' -> claim edilemez.
--    Dönüş: başarılı claim'de YENİ üretilmiş claim_token (uuid);
--    claim edilemediyse NULL. Sonuç yazımı (sent/failed) yalnız bu
--    token'la ve hâlâ 'pending' olan satırda yapılabilir; böylece
--    lease'i süresi geçtiği için devralınan ESKİ worker, YENİ claim'in
--    sonucunu ezemez (fencing).
--
-- GÜVENLİK: iki tablo da RLS'li ve service-role-only; PUBLIC/anon/
-- authenticated açıkça REVOKE. Token değerleri hiçbir istemci yanıtına,
-- loga veya rapora yazılmaz.
-- PRODUCTION'A UYGULANMADI; uygulama ayrı, exact-adlı onay ister.
-- =====================================================================

begin;

-- 1) push_devices
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  device_token text not null check (char_length(device_token) between 16 and 512),
  enabled boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (platform, device_token)
);

create index if not exists push_devices_user_enabled_idx
  on public.push_devices (user_id) where enabled;

alter table public.push_devices enable row level security;
revoke all on table public.push_devices from public;
revoke all on table public.push_devices from anon, authenticated;
grant all on table public.push_devices to service_role;

-- 2) bildirim/claim tablosu
do $$
begin
  if to_regclass('public.flight_price_alerts') is null then
    raise exception 'ABORT: flight_price_alerts tablosu yok - fiyat alarmi semasi bekleniyordu';
  end if;
end $$;

create table if not exists public.flight_price_alert_notifications (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.flight_price_alerts(id) on delete cascade,
  channel text not null check (channel in ('email','push')),
  event_key text not null check (char_length(event_key) between 3 and 120),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  failure_kind text check (failure_kind in ('transient','permanent')),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  -- Fencing: her başarılı claim'de yenilenir; settle yalnız bu token'la yapılır.
  claim_token uuid,
  -- Olay snapshot'ı: retry, fiyat sonradan değişse bile bu değerlerle tamamlanır.
  event_price numeric,
  event_currency text,
  provider_id text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (alert_id, channel, event_key)
);

create index if not exists fpan_alert_idx
  on public.flight_price_alert_notifications (alert_id, created_at desc);

-- Retry kuyruğu taraması için: bekleyen/başarısız kayıtlar duruma göre okunur.
create index if not exists fpan_retry_idx
  on public.flight_price_alert_notifications (status, attempt_count, next_retry_at);

alter table public.flight_price_alert_notifications enable row level security;
revoke all on table public.flight_price_alert_notifications from public;
revoke all on table public.flight_price_alert_notifications from anon, authenticated;
grant all on table public.flight_price_alert_notifications to service_role;

-- 3) atomik claim fonksiyonu (v3: attempt limiti stale-pending için de,
--    fencing token dönüşü, olay snapshot'ı)
create or replace function public.claim_alert_notification(
  p_alert_id uuid,
  p_channel text,
  p_event_key text,
  p_max_attempts integer default 3,
  p_pending_ttl_seconds integer default 600,
  p_event_price numeric default null,
  p_event_currency text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_claimed uuid;
begin
  -- Önce yeni olay olarak eklemeyi dene (yarışta yalnız biri kazanır).
  begin
    insert into public.flight_price_alert_notifications
      (alert_id, channel, event_key, status, attempt_count, last_attempt_at,
       claim_token, event_price, event_currency)
    values (p_alert_id, p_channel, p_event_key, 'pending', 1, now(),
            v_token, p_event_price, p_event_currency);
    return v_token;
  exception when unique_violation then
    -- Kayıt var: yalnız uygun durumdaysa atomik olarak devral.
    -- Snapshot (event_price/event_currency) ASLA ezilmez: retry orijinal
    -- olayın değerleriyle tamamlanır.
    update public.flight_price_alert_notifications
       set status = 'pending',
           attempt_count = attempt_count + 1,
           last_attempt_at = now(),
           claim_token = v_token
     where alert_id = p_alert_id
       and channel = p_channel
       and event_key = p_event_key
       and (
             (status = 'pending'
              and attempt_count < p_max_attempts
              and (last_attempt_at is null or last_attempt_at < now() - make_interval(secs => p_pending_ttl_seconds)))
          or (status = 'failed' and failure_kind = 'transient'
              and attempt_count < p_max_attempts
              and (next_retry_at is null or next_retry_at <= now()))
       )
    returning claim_token into v_claimed;
    return v_claimed; -- claim edilemediyse NULL
  end;
end;
$$;

revoke all on function public.claim_alert_notification(uuid, text, text, integer, integer, numeric, text) from public;
revoke all on function public.claim_alert_notification(uuid, text, text, integer, integer, numeric, text) from anon, authenticated;
grant execute on function public.claim_alert_notification(uuid, text, text, integer, integer, numeric, text) to service_role;

-- 3b) Atomik "bildirim yapıldı" güncellemesi (v4).
--     Uygulama belleğindeki ESKİ bir alert nesnesine dayanan geç yazımlar
--     last_notified_price'ı YÜKSELTEMEZ: değer atomik olarak
--     least(mevcut, yeni) alınır; last_notified_at geriye gitmez
--     (greatest). Yarışın sırası ne olursa olsun en düşük bildirilen
--     fiyat korunur (satır kilidi + tek UPDATE).
create or replace function public.mark_alert_notified(
  p_alert_id uuid,
  p_event_price numeric,
  p_notified_at timestamptz default now()
) returns void
language sql
security definer
set search_path = public
as $$
  update public.flight_price_alerts
     set last_notified_price = least(coalesce(last_notified_price, p_event_price), p_event_price),
         last_notified_at = greatest(coalesce(last_notified_at, p_notified_at), p_notified_at),
         status = 'triggered',
         last_error_message = null,
         last_error_at = null,
         error_count = 0
   where id = p_alert_id;
$$;

revoke all on function public.mark_alert_notified(uuid, numeric, timestamptz) from public;
revoke all on function public.mark_alert_notified(uuid, numeric, timestamptz) from anon, authenticated;
grant execute on function public.mark_alert_notified(uuid, numeric, timestamptz) to service_role;

-- 4) Kanal tercih kolonu (tarihsel şemada zaten var; garanti altına alınır)
alter table public.flight_price_alerts
  add column if not exists notify_push boolean not null default false;

commit;
