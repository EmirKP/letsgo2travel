-- LETSGO2TRAVEL SEYAHAT HARİTAM & KAŞİFLER LİGİ (V2) TABLO GÜNCELLEMESİ
-- Bu dosya manuel çalıştırılacaktır. Otomatik çalıştırılmaz.

-- 1. profiles tablosuna güvenli eklemeler
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS visited_countries text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS wishlist_countries text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS opt_in_leaderboard boolean NOT NULL DEFAULT false;

-- leaderboard_hidden kolonu yerine admin_only leaderboard_blocks tablosu kullanılacak.
-- (Not: Kullanıcı kararı gereği profiles tablosu public SELECT'e açılmamaktadır. Liderlik API'si service_role ile okur.)

-- 1b. Leaderboard Blocks Tablosu (Admin-only yasaklama listesi)
CREATE TABLE IF NOT EXISTS public.leaderboard_blocks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  blocked_by uuid REFERENCES auth.users(id),
  blocked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leaderboard_blocks ENABLE ROW LEVEL SECURITY;
-- No public policies for leaderboard_blocks, only service_role can access.

-- 2. travel_verifications Tablosu
CREATE TABLE IF NOT EXISTS public.travel_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  country_name text,
  verification_method text NOT NULL,
  proof_type text,
  proof_file_path text,
  user_note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_more_info', 'flagged')),
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  verified_at timestamptz,
  proof_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tablo zaten var ama eksik kolonlar varsa diye garanti:
ALTER TABLE public.travel_verifications
ADD COLUMN IF NOT EXISTS admin_note text,
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS verified_at timestamptz,
ADD COLUMN IF NOT EXISTS proof_deleted_at timestamptz;

-- Idempotent Check Constraint (Location metodunu tamamen engeller)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'travel_verifications_document_only_check'
  ) THEN
    ALTER TABLE public.travel_verifications
    ADD CONSTRAINT travel_verifications_document_only_check
    CHECK (verification_method = 'document') NOT VALID;
  END IF;
END $$;

-- Aynı ülkeyi sadece bir kere "approved" alabilir (Çifte puan engeli)
CREATE UNIQUE INDEX IF NOT EXISTS travel_verifications_user_country_approved_unique
ON public.travel_verifications(user_id, country_code)
WHERE status = 'approved';

-- 3. (Gerekirse) monthly_explorer_awards tablosu
CREATE TABLE IF NOT EXISTS public.monthly_explorer_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month date NOT NULL, -- Örn: 2026-06-01
  approved_count int NOT NULL DEFAULT 0,
  score int NOT NULL DEFAULT 0,
  rank int,
  reward_sent boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_explorer_awards ENABLE ROW LEVEL SECURITY;
-- No public policies for monthly_explorer_awards, only service_role.

-- RLS (Row Level Security) ayarları travel_verifications
ALTER TABLE public.travel_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own verification" ON public.travel_verifications;
DROP POLICY IF EXISTS "Users can view their own verifications" ON public.travel_verifications;
DROP POLICY IF EXISTS "Users can insert their own document verification" ON public.travel_verifications;

-- Strict INSERT policy for document verification
CREATE POLICY "Users can insert their own document verification"
ON public.travel_verifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND verification_method = 'document'
  AND proof_file_path IS NOT NULL
  AND proof_file_path LIKE auth.uid()::text || '/%'
);

CREATE POLICY "Users can view their own verifications" 
ON public.travel_verifications FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Cache yenileme (ZORUNLU - Yeni kolonların API tarafından görülmesi için)
NOTIFY pgrst, 'reload schema';
