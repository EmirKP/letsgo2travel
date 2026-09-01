-- =====================================================================
-- KONTROLLÜ DATA MIGRATION: Forum kategori adı yeniden adlandırma
-- ---------------------------------------------------------------------
-- "Uçak Bileti & Havalimanı"  ->  "Uçuş & Havalimanı"
--
-- Kapsam: yalnız forum_topics.category METİN değeri güncellenir.
-- HİÇBİR topluluk içeriği, başlık veya mesaj SİLİNMEZ; satır sayısı
-- değişmez. Kategori slug'ı ("ucak-bileti-havalimani") kod tarafında
-- bilinçli olarak KORUNMUŞTUR; mevcut URL'ler kırılmaz.
--
-- Deploy sırası notu: Bu migration ile yeni kod deploy'u arasında kısa bir
-- pencere olabilir (eski ad ile listeleme boş görünür). Önerilen sıra:
-- önce migration, hemen ardından deploy. İkisi de ayrı onaylıdır.
-- PRODUCTION'A UYGULANMADI.
-- =====================================================================

begin;

do $$
declare
  c bigint;
begin
  if to_regclass('public.forum_topics') is null then
    raise notice 'forum_topics tablosu yok; atlandi';
    return;
  end if;

  select count(*) into c from public.forum_topics where category = 'Uçak Bileti & Havalimanı';
  raise notice 'GUNCELLENECEK forum_topics satir sayisi: %', c;

  update public.forum_topics
     set category = 'Uçuş & Havalimanı'
   where category = 'Uçak Bileti & Havalimanı';

  select count(*) into c from public.forum_topics where category = 'Uçak Bileti & Havalimanı';
  if c > 0 then
    raise exception 'ABORT: guncelleme sonrasi eski kategori adinda % satir kaldi', c;
  end if;
  raise notice 'Kategori adi guncellendi; icerik silinmedi.';
end $$;

commit;
