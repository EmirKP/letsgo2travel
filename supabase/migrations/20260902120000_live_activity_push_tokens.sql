-- =====================================================================
-- LIVE ACTIVITY PUSH-TO-START ALTYAPISI (v7) — HAZIRLANDI, UYGULANMADI
-- ---------------------------------------------------------------------
-- Amaç: uygulama KAPALIYKEN Dynamic Island / kilit ekranı aktivitesinin
-- APNs "liveactivity" push'u ile başlatılıp bitirilebilmesi (iOS 17.2+
-- push-to-start; iOS 16.2-17.1 yalnız uygulama içi başlatma + yerel
-- bildirim fallback'i).
--
-- Teslim modeli: teslim durumu TRIP DEĞİL, trip + token(cihaz) + event
-- bazında tutulur (live_activity_deliveries). Cron atomik claim ile
-- çalışır: lease (claimed_until), fencing (claim_token uuid), attempt_count
-- ve next_retry_at. DÜRÜST GARANTİ: "aynı anda tek gönderici + en az bir
-- kez" — APNs başarısından sonra settle yazılamadan çökülürse lease bitince
-- yeniden gönderim mümkündür (apns-collapse-id cihazda tekilleştirir).
-- Bir token'ın başarısı diğerinin yeniden denemesini engellemez.
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
  -- Kalıcı kurulum (cihaz) kimliği: mobil istemci üretir ve her kayıtla
  -- gönderir. Apple push-to-start tokenı zamanla DEĞİŞEBİLİR; aynı
  -- kullanıcı + aynı kurulum için yeni token kaydolduğunda eskisi
  -- register_live_activity_push_to_start ile ATOMİK kapatılır. Eski
  -- istemciler (installation_id göndermeyen) NULL bırakır; NULL satırlara
  -- rotasyon dokunmaz.
  installation_id uuid,
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
create index if not exists live_activity_tokens_installation_idx
  on public.live_activity_tokens (user_id, installation_id) where enabled;

-- DB DÜZEYİNDE KESİN GARANTİ (v6): aynı push-to-start tokenı için AYNI
-- ANDA en fazla BİR enabled sahip olabilir. Fonksiyondaki advisory lock
-- yarışları serileştirir; bu partial unique index ise garantiyi veri
-- düzeyinde MUTLAK kılar (lock atlansa bile iki enabled satır yazılamaz).
create unique index if not exists live_activity_push_to_start_single_owner_idx
  on public.live_activity_tokens (token)
  where token_type = 'push_to_start' and enabled;

-- v7: kurulum başına da en fazla BİR etkin push-to-start satırı (aynı
-- installation için T1/T2 farklı tokenlar eşzamanlı kaydolsa bile iki
-- enabled satır kalamaz — fonksiyon atlansa dahi veri düzeyinde mutlak).
create unique index if not exists live_activity_pts_single_installation_idx
  on public.live_activity_tokens (installation_id)
  where token_type = 'push_to_start' and enabled and installation_id is not null;

-- ---------------------------------------------------------------------
-- Push-to-start token KAYIT + ROTASYON + TEK-HESAP garantisi (v6).
-- EŞZAMANLILIK: transaction-scoped advisory lock token bazında yarışan
-- kayıtları SERİLEŞTİRİR (A ve B aynı anda kaydolsa bile işlemler sırayla
-- çalışır); live_activity_push_to_start_single_owner_idx partial unique
-- index'i garantiyi veri düzeyinde MUTLAK kılar. SIRA ÖNEMLİ: önce diğer
-- hesapların aynı token satırları kapatılır, SONRA kendi satırı enabled
-- yazılır — böylece unique index hiçbir ara adımda ihlal edilmez.
-- Farklı fiziksel cihazlar (farklı token) ve NULL installation_id'li
-- eski kayıtlar ETKİLENMEZ. Yalnız service-role çağırabilir.
-- ---------------------------------------------------------------------
create or replace function public.register_live_activity_push_to_start(
  p_user_id uuid,
  p_installation_id uuid,
  p_token text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_installation_id is null
     or p_token is null or char_length(p_token) not between 16 and 512 then
    raise exception 'invalid_registration';
  end if;

  -- SERİLEŞTİRME (v7): her kayıt SABİT/DETERMİNİSTİK sırada İKİ advisory
  -- xact kilidi alır — ÖNCE kurulum kilidi, SONRA token kilidi. Tüm
  -- transaksiyonlar aynı sırayı izlediği için deadlock oluşamaz.
  -- * Kurulum kilidi: aynı installation için T1/T2 FARKLI tokenlar
  --   eşzamanlı kaydolsa bile işlemler sırayla çalışır.
  -- * Token kilidi: aynı token için FARKLI hesaplar/kurulumlar yarışsa
  --   bile işlemler sırayla çalışır.
  perform pg_advisory_xact_lock(hashtextextended('live_activity_inst:' || p_installation_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('live_activity_pts:' || p_token, 0));

  -- 1) HESAPLAR ARASI TEK SAHİP: aynı fiziksel token diğer hesap(lar)
  --    altında ÖNCE kapatılır (token bazlı partial unique index ihlali
  --    hiçbir ara adımda oluşmaz).
  update public.live_activity_tokens
     set enabled = false, updated_at = now()
   where token_type = 'push_to_start'
     and token = p_token
     and user_id <> p_user_id
     and enabled;

  -- 2) ROTASYON — ENABLE'DAN ÖNCE (v7): bu kurulumun ESKİ etkin
  --    push-to-start satırları (kendi hesabımızın eski tokenı dahil,
  --    hangi hesapta olursa olsun) yeni token etkinleştirilmeden ÖNCE
  --    kapatılır — kurulum bazlı partial unique index hiçbir ara adımda
  --    ihlal edilmez.
  update public.live_activity_tokens
     set enabled = false, updated_at = now()
   where token_type = 'push_to_start'
     and installation_id = p_installation_id
     and token <> p_token
     and enabled;

  -- 3) Kendi satırı: upsert + enabled (bu noktada hem token hem kurulum
  --    için başka etkin satır kalmamıştır).
  insert into public.live_activity_tokens (user_id, token_type, token, installation_id, enabled, updated_at)
  values (p_user_id, 'push_to_start', p_token, p_installation_id, true, now())
  on conflict on constraint live_activity_tokens_unique
  do update set enabled = true, installation_id = excluded.installation_id, updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- ÇIKIŞ (logout) temizliği (v5): kullanıcının BU kurulumdaki (fiziksel
-- cihaz) push_to_start VE activity_update tokenlarını tek transaksiyonda
-- kapatır. Diğer kurulumlar (örn. iPad) ETKİLENMEZ. Bearer doğrulaması
-- API katmanında yapılır; fonksiyon yalnız service-role'dan çağrılır.
-- ---------------------------------------------------------------------
create or replace function public.deactivate_live_activity_installation(
  p_user_id uuid,
  p_installation_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_installation_id is null then
    raise exception 'invalid_deactivation';
  end if;

  update public.live_activity_tokens
     set enabled = false, updated_at = now()
   where user_id = p_user_id
     and installation_id = p_installation_id
     and enabled;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.deactivate_live_activity_installation(uuid, uuid) from public;
revoke all on function public.deactivate_live_activity_installation(uuid, uuid) from anon, authenticated;

revoke all on function public.register_live_activity_push_to_start(uuid, uuid, text) from public;
revoke all on function public.register_live_activity_push_to_start(uuid, uuid, text) from anon, authenticated;

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
