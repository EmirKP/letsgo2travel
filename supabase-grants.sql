-- Letsgo 2 Travel - Supabase izin notları
-- Yeni tablo oluşturduğunda Data API için GRANT eklemeyi unutma.
-- Bu proje server tarafında service_role kullandığı için ana erişim API route üzerinden yapılır.

-- Okunabilir public tablolar
GRANT SELECT ON TABLE public.biletler TO anon;
GRANT SELECT ON TABLE public.site_ayarlari TO anon;

-- Server/admin işlemleri
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.biletler TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_ayarlari TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.arama_kayitlari TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fiyat_alarmlari TO service_role;

-- RLS açık kalsın. Public direkt tabloya yazamasın.
ALTER TABLE public.biletler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_ayarlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arama_kayitlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiyat_alarmlari ENABLE ROW LEVEL SECURITY;

-- Site aktif biletleri okuyabilsin.
DROP POLICY IF EXISTS "Public can read active tickets" ON public.biletler;
CREATE POLICY "Public can read active tickets"
ON public.biletler
FOR SELECT
TO anon
USING (aktif = true);

-- Site ayarları okunabilsin.
DROP POLICY IF EXISTS "Public can read site settings" ON public.site_ayarlari;
CREATE POLICY "Public can read site settings"
ON public.site_ayarlari
FOR SELECT
TO anon
USING (id = 1);


-- V9: Rota görsel URL alanı
-- Bunu Supabase SQL Editor'de bir kere çalıştır.
ALTER TABLE public.biletler
ADD COLUMN IF NOT EXISTS gorsel_url text DEFAULT '';
