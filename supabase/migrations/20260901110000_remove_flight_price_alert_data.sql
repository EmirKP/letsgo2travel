-- =====================================================================
-- DESTRUCTIVE MIGRATION 2/3: Uçuş fiyat alarmı abonelik verisi
-- ---------------------------------------------------------------------
-- KAPSAM: flight_price_alerts (kullanıcı e-postaları içeren abone
-- listesi) ve flight_price_alert_logs.
--
-- ÖNKOŞULLAR (hepsi ayrı onaylıdır; sırayla):
--   1) docs/fiyat-alarmi-kapanis-eposta-plani.md'de tanımlanan, ALICI KAPSAMI
--      ve hukuki dayanağı ayrıca onaylanmış bilgilendirme süreci tamamlanmış
--      olmalı (onaylanan segmentlere gönderim yapılmış; gönderim yapılmayan
--      segmentler için kapsam kararı kayıt altında).
--   2) Read-only sayım raporu + şifreli, restore testi geçmiş managed
--      backup tamamlanmış olmalı. Yedek; worktree'ye, sohbete veya teslim
--      paketine alınmaz.
--   3) Bu migration'ı exact adlarıyla adlandıran production veri-silme
--      onayı alınmış olmalı.
--
-- KVKK notu: Bu veri pazarlama amacıyla kullanılamaz; silme sonrası
-- yalnız yasal saklama gerektiren kayıtlar (varsa) backup'ta kalır.
-- Not: KVKK hesap silme rotasındaki flight_price_alerts temizliği bu
-- tablolar düştükten sonra kendiliğinden no-op olur; ilgili kod bloğu
-- sonraki temizlik commit'inde kaldırılabilir.
-- CASCADE kullanılmaz. GERİ DÖNÜŞ: yalnız yedekten restore.
-- =====================================================================

begin;

do $$
declare
  c bigint;
begin
  if to_regclass('public.flight_price_alerts') is not null then
    execute 'select count(*) from public.flight_price_alerts' into c;
    raise notice 'SILINECEK: flight_price_alerts satir sayisi: %', c;
  end if;
  if to_regclass('public.flight_price_alert_logs') is not null then
    execute 'select count(*) from public.flight_price_alert_logs' into c;
    raise notice 'SILINECEK: flight_price_alert_logs satir sayisi: %', c;
  end if;
end $$;

-- Önce log (child, FK -> flight_price_alerts), sonra parent.
drop table if exists public.flight_price_alert_logs;
drop table if exists public.flight_price_alerts;

commit;
