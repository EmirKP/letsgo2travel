-- =====================================================================
-- GÜVENLİK KİLİDİ: flight_price_alerts / flight_price_alert_logs
-- ---------------------------------------------------------------------
-- Güncel durum (01.09.2026 hotfix): bağımsız uçuş fiyat alarmı KORUNAN
-- bir üründür; bu tablolar canlı üründe kullanılmaya devam eder. Tarihsel
-- olarak RLS'siz ve grant kısıtsızdılar; PostgREST üzerinden anon/
-- authenticated erişimine açık olma riski taşıyorlardı. Uygulama bu
-- tablolara yalnız sunucu tarafında service-role ile erişir; bu kilit
-- KALICI mimari kuraldır (20260901110000 no-op yapılmıştır).
-- Bu migration: RLS'yi açar, policy tanımlamaz (default deny), PUBLIC/anon/
-- authenticated yetkilerini açıkça REVOKE eder ve tüm erişimi service_role
-- ile sınırlar.
--
-- Idempotent ve koşulludur: tablolar yoksa hiçbir şey yapmaz.
-- PRODUCTION'A UYGULAMA AYRI ONAY GEREKTİRİR.
-- Geri dönüş: bu kilit veri silmez; gerekirse grant'ler eski haline
-- döndürülebilir (önerilmez).
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.flight_price_alerts') is not null then
    execute 'alter table public.flight_price_alerts enable row level security';
    execute 'revoke all on table public.flight_price_alerts from public';
    execute 'revoke all on table public.flight_price_alerts from anon, authenticated';
    execute 'grant all on table public.flight_price_alerts to service_role';
  end if;

  if to_regclass('public.flight_price_alert_logs') is not null then
    execute 'alter table public.flight_price_alert_logs enable row level security';
    execute 'revoke all on table public.flight_price_alert_logs from public';
    execute 'revoke all on table public.flight_price_alert_logs from anon, authenticated';
    execute 'grant all on table public.flight_price_alert_logs to service_role';
  end if;
end $$;

commit;
