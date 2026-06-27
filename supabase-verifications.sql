-- Doğrulanmış Gezgin Sistemi Tablosu
CREATE TABLE IF NOT EXISTS public.travel_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  country_code TEXT NOT NULL,
  city_slug TEXT,
  verification_type TEXT NOT NULL, -- flight_ticket, boarding_pass, hotel_reservation, vs.
  verification_status TEXT DEFAULT 'pending', -- pending, approved, rejected, expired
  verified_at TIMESTAMPTZ,
  rejected_reason TEXT,
  proof_deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.travel_verifications ENABLE ROW LEVEL SECURITY;

-- Sadece kendi verisini görebilir
CREATE POLICY "Kullanıcılar kendi doğrulama kayıtlarını görebilir" 
ON public.travel_verifications 
FOR SELECT 
USING (auth.uid() = user_id);

-- Sadece kendisi için ekleyebilir
CREATE POLICY "Kullanıcılar kendi doğrulama taleplerini oluşturabilir" 
ON public.travel_verifications 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);


-- KVKK ve Veri Silme Talepleri Tablosu
CREATE TABLE IF NOT EXISTS public.kvkk_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  request_type TEXT NOT NULL, -- delete_data, withdraw_consent, account_deletion
  status TEXT DEFAULT 'pending', -- pending, processed, rejected
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.kvkk_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kullanıcılar kendi KVKK taleplerini görebilir"
ON public.kvkk_requests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Kullanıcılar kendi KVKK taleplerini oluşturabilir"
ON public.kvkk_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);
