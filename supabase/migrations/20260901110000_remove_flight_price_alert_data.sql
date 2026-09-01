-- =====================================================================
-- GEÇERSİZLEŞTİRİLDİ (NO-OP) — fiyat alarmı verisi SİLİNMEYECEK
-- ---------------------------------------------------------------------
-- Bu dosya önceki halinde flight_price_alerts + flight_price_alert_logs
-- tablolarını kaldırıyordu. Emir'in 01.09.2026 hotfix kararıyla bağımsız
-- uçuş fiyat alarmı KORUNAN bir ürün oldu; bu migration hiçbir ortamda
-- ÇALIŞTIRILMAMIŞTI ve içeriği bilinçli olarak no-op yapıldı.
--
-- Dosya, migration geçmişi/sıralaması bozulmasın diye SİLİNMEDİ
-- (geçmişte bu ada referans veren bir kayıt varsa tutarlı kalır).
-- Alarm tabloları, aboneler ve loglar korunur; RLS güvenlik kilitleri
-- (20260901000000) geçerliliğini sürdürür.
-- =====================================================================

begin;

do $$
begin
  raise notice 'NO-OP: flight_price_alerts / flight_price_alert_logs korunuyor (fiyat alarmi hotfix karari, 01.09.2026).';
end $$;

commit;
