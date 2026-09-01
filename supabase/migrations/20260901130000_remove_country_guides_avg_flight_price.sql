-- =====================================================================
-- İLERİ YÖNLÜ MIGRATION: country_guides.avg_flight_price kolonunu kaldır
-- ---------------------------------------------------------------------
-- Gerekçe (Emir, 31.08.2026): avg_flight_price admin girişli TAHMİNİ uçuş
-- fiyatı alanıdır ve yeni ürün kararına aykırıdır. Kod tarafındaki tüm
-- görüntüleme ve tip referansları kaldırılmıştır (yeniden doğrulandı).
-- `airport_code` kolonu KORUNUR (Havalimanı Rehberi temeli).
--
-- Kolon drop'u satır silmez; yalnız bu tek kolon verisi kaybolur.
-- ÖNKOŞUL: exact adlı production onayı + güncel managed backup.
-- PRODUCTION'A UYGULANMADI. GERİ DÖNÜŞ: yedekten restore.
-- CASCADE kullanılmaz.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.country_guides') is null then
    raise notice 'country_guides tablosu yok; atlandi';
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'country_guides'
      and column_name = 'avg_flight_price'
  ) then
    -- Korunacak kolon yerinde mi? (yanlış tablo/ortam guard'ı)
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'country_guides'
        and column_name = 'airport_code'
    ) then
      raise exception 'ABORT: country_guides.airport_code bulunamadi - beklenen sema degil';
    end if;

    execute 'alter table public.country_guides drop column avg_flight_price';
    raise notice 'SILINDI: country_guides.avg_flight_price kolonu';
  else
    raise notice 'avg_flight_price kolonu zaten yok; atlandi';
  end if;
end $$;

commit;
