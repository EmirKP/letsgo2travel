-- =====================================================================
-- DESTRUCTIVE MIGRATION 3/3: "biletler" uçuş fırsatı sistemi
-- ---------------------------------------------------------------------
-- KAPSAM: biletler (admin girişli uçuş fırsatı kayıtları),
--   user_favorites (kullanıcıların fırsat favorileri; FK -> biletler),
--   increment_deal_click fonksiyonu.
--
-- KARAR (Emir, 31.08.2026): user_favorites aktif sistemde veya arşiv
-- tablosunda TUTULMAYACAK. Production silme öncesinde gerçek satır
-- sayıları doğrulanacak ve yalnız şifreli, geri yüklenebilir managed
-- backup alınacak. CASCADE sayım ve backup olmadan ÇALIŞTIRILMAZ —
-- bu dosyada CASCADE zaten kullanılmıyor; user_favorites açıkça ve
-- önce düşürülüyor.
--
-- ÖNKOŞULLAR (ayrı production onayı):
--   1) Aşağıdaki NOTICE sayımları migration log'unda görülmüş olmalı
--      (öncesinde read-only doğrulama da yapılmalı).
--   2) Şifreli, restore testi geçmiş managed backup tamamlanmış olmalı.
--   3) Bu migration'ı exact adlarıyla adlandıran onay alınmış olmalı.
-- GERİ DÖNÜŞ: yalnız yedekten restore.
-- =====================================================================

begin;

do $$
declare
  c bigint;
begin
  if to_regclass('public.user_favorites') is not null then
    execute 'select count(*) from public.user_favorites' into c;
    raise notice 'SILINECEK: user_favorites satir sayisi: %', c;
  end if;
  if to_regclass('public.biletler') is not null then
    execute 'select count(*) from public.biletler' into c;
    raise notice 'SILINECEK: biletler satir sayisi: %', c;
  end if;
end $$;

-- Önce kullanıcı favorileri (child, FK -> biletler), sonra biletler.
drop table if exists public.user_favorites;
drop table if exists public.biletler;

-- Tıklama sayacı fonksiyonu (yalnız biletler için kullanılıyordu).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_deal_click'
  loop
    execute format('drop function %s', r.sig);
    raise notice 'SILINDI: %', r.sig;
  end loop;
end $$;

commit;
