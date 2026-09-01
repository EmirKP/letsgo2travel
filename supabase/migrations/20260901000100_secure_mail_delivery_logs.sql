-- =====================================================================
-- KALICI GÜVENLİK KİLİDİ: mail_delivery_logs
-- ---------------------------------------------------------------------
-- mail_delivery_logs genel bir e-posta teslim audit tablosudur (alıcı
-- e-posta adresi içerir) ve KORUNUR — uçuş sistemi kaldırılırken
-- silinmez; KVKK hesap silme akışı bu tabloyu okumaya/temizlemeye devam
-- eder. Tarihsel olarak RLS'siz bırakılmıştı.
-- Bu migration: RLS'yi açar, policy tanımlamaz (default deny), PUBLIC/anon/
-- authenticated yetkilerini açıkça REVOKE eder ve tüm erişimi service_role
-- ile sınırlar. Uygulama bu tabloya yalnız
-- service-role anahtarıyla (sunucu tarafı) erişir.
--
-- Idempotent ve koşulludur. PRODUCTION'A UYGULAMA AYRI ONAY GEREKTİRİR.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.mail_delivery_logs') is not null then
    execute 'alter table public.mail_delivery_logs enable row level security';
    execute 'revoke all on table public.mail_delivery_logs from public';
    execute 'revoke all on table public.mail_delivery_logs from anon, authenticated';
    execute 'grant all on table public.mail_delivery_logs to service_role';
  end if;
end $$;

commit;
