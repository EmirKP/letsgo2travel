-- 1. MEVCUT TRAVEL_VERIFICATIONS TABLOSUNU GÜNCELLEME (İdempotent)
-- Tablo önceden varsa bozmadan eksik kolonları ekler.
ALTER TABLE public.travel_verifications
  ADD COLUMN IF NOT EXISTS country_name text,
  ADD COLUMN IF NOT EXISTS evidence_path text,
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS evidence_type text,
  ADD COLUMN IF NOT EXISTS user_note text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_method text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ai_confidence numeric,
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- 2. YENİ TABLOLAR

-- user_country_unlocks
CREATE TABLE IF NOT EXISTS public.user_country_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  country_code text NOT NULL,
  country_name text,
  verification_id uuid REFERENCES public.travel_verifications(id) ON DELETE SET NULL,
  unlocked_at timestamptz DEFAULT now(),
  animation_seen_at timestamptz,
  is_active boolean DEFAULT true,
  UNIQUE(user_id, country_code)
);

-- country_experience_permissions
CREATE TABLE IF NOT EXISTS public.country_experience_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  country_code text NOT NULL,
  can_answer boolean DEFAULT false,
  can_comment boolean DEFAULT false,
  can_create_warning boolean DEFAULT false,
  source_verification_id uuid REFERENCES public.travel_verifications(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, country_code)
);

-- user_points_log
CREATE TABLE IF NOT EXISTS public.user_points_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL,
  points integer DEFAULT 0,
  country_code text,
  related_id uuid,
  created_at timestamptz DEFAULT now()
);

-- user_badges
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  badge_key text NOT NULL,
  badge_label text NOT NULL,
  country_code text,
  awarded_at timestamptz DEFAULT now(),
  UNIQUE(user_id, badge_key, country_code)
);

-- user_trust_scores
CREATE TABLE IF NOT EXISTS public.user_trust_scores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trust_level integer DEFAULT 0,
  verified_country_count integer DEFAULT 0,
  approved_content_count integer DEFAULT 0,
  rejected_content_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- admin_audit_logs
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  note text,
  created_at timestamptz DEFAULT now()
);

-- country_questions
CREATE TABLE IF NOT EXISTS public.country_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  country_code text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  category text DEFAULT 'general',
  status text DEFAULT 'visible',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- country_answers
CREATE TABLE IF NOT EXISTS public.country_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid REFERENCES public.country_questions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  country_code text NOT NULL,
  body text NOT NULL,
  status text DEFAULT 'visible',
  helpful_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- country_experience_comments
CREATE TABLE IF NOT EXISTS public.country_experience_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  country_code text NOT NULL,
  comment_type text DEFAULT 'general_tip',
  body text NOT NULL,
  status text DEFAULT 'visible',
  helpful_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- country_warnings
CREATE TABLE IF NOT EXISTS public.country_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  country_code text NOT NULL,
  warning_type text NOT NULL,
  body text NOT NULL,
  status text DEFAULT 'pending_review',
  admin_review_required boolean DEFAULT true,
  helpful_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- helpful_votes
CREATE TABLE IF NOT EXISTS public.helpful_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, target_type, target_id)
);

-- content_reports
CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  country_code text,
  reason text NOT NULL,
  note text,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

-- content_moderation_actions
CREATE TABLE IF NOT EXISTS public.content_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  action text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- visa_center_pages
CREATE TABLE IF NOT EXISTS public.visa_center_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  country_name text NOT NULL,
  visa_title text,
  visa_type text,
  summary text,
  who_should_apply text,
  required_documents jsonb,
  application_steps jsonb,
  average_processing_time text,
  common_mistakes jsonb,
  highlighted_warnings jsonb,
  appointment_status text,
  appointment_note text,
  source_note text,
  last_checked_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- visa_appointment_updates
CREATE TABLE IF NOT EXISTS public.visa_appointment_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visa_page_id uuid REFERENCES public.visa_center_pages(id) ON DELETE CASCADE NOT NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  appointment_status text,
  appointment_note text,
  source_note text,
  created_at timestamptz DEFAULT now()
);

-- 3. RLS (Row Level Security) KURALLARI
ALTER TABLE public.user_country_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_experience_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_points_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trust_scores ENABLE ROW LEVEL SECURITY;

-- Kullanıcılar sadece kendi verilerini görebilir
CREATE POLICY "Users can view their own unlocks" ON public.user_country_unlocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own permissions" ON public.country_experience_permissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own points" ON public.user_points_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own badges" ON public.user_badges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own trust scores" ON public.user_trust_scores FOR SELECT USING (auth.uid() = user_id);

-- Topluluk içerikleri herkes (hatta misafirler) tarafından okunabilir (Sadece visible olanlar)
ALTER TABLE public.country_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view visible questions" ON public.country_questions FOR SELECT USING (status = 'visible');

ALTER TABLE public.country_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view visible answers" ON public.country_answers FOR SELECT USING (status = 'visible');

ALTER TABLE public.country_experience_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view visible comments" ON public.country_experience_comments FOR SELECT USING (status = 'visible');

-- Visa Pages herkes okuyabilir
ALTER TABLE public.visa_center_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view active visa pages" ON public.visa_center_pages FOR SELECT USING (is_active = true);


-- 4. BUCKET OLUŞTURMA (travel-evidence, Private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('travel-evidence', 'travel-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policyleri (Kullanıcı kendi dosyasını yükleyebilir)
CREATE POLICY "Kullanıcılar kendi dosyalarını travel-evidence bucket'ına yükleyebilir"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'travel-evidence' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. FAYDALI OY RPC
CREATE OR REPLACE FUNCTION public.l2t_add_helpful_vote(p_user_id uuid, p_target_type text, p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- Hedef tipine göre sahibini bul (kendi kendine oy vermeyi engellemek için)
  IF p_target_type = 'answer' THEN
    SELECT user_id INTO v_owner_id FROM public.country_answers WHERE id = p_target_id;
  ELSIF p_target_type = 'comment' THEN
    SELECT user_id INTO v_owner_id FROM public.country_experience_comments WHERE id = p_target_id;
  ELSIF p_target_type = 'warning' THEN
    SELECT user_id INTO v_owner_id FROM public.country_warnings WHERE id = p_target_id;
  ELSE
    RAISE EXCEPTION 'Geçersiz target_type';
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'İçerik bulunamadı';
  END IF;

  IF v_owner_id = p_user_id THEN
    RAISE EXCEPTION 'Kendi içeriğinize oy veremezsiniz';
  END IF;

  -- Çift oyu engellemek için insert (UNIQUE constraint hatası fırlatırsa vote verilmiş demektir)
  INSERT INTO public.helpful_votes (user_id, target_type, target_id)
  VALUES (p_user_id, p_target_type, p_target_id);

  -- Helpful count arttır
  IF p_target_type = 'answer' THEN
    UPDATE public.country_answers SET helpful_count = helpful_count + 1 WHERE id = p_target_id;
  ELSIF p_target_type = 'comment' THEN
    UPDATE public.country_experience_comments SET helpful_count = helpful_count + 1 WHERE id = p_target_id;
  ELSIF p_target_type = 'warning' THEN
    UPDATE public.country_warnings SET helpful_count = helpful_count + 1 WHERE id = p_target_id;
  END IF;
  
  -- İçerik sahibine puan ekle
  INSERT INTO public.user_points_log (user_id, action_type, points, related_id)
  VALUES (v_owner_id, 'helpful_vote_received', 5, p_target_id);
END;
$$;

-- 6. PUBLIC LEADERBOARD VIEW
CREATE OR REPLACE VIEW public.l2t_public_profiles AS
SELECT 
  p.id as user_id,
  p.username,
  p.avatar_url,
  true as is_public,
  p.created_at,
  p.updated_at
FROM public.profiles p;

CREATE OR REPLACE VIEW public.l2t_public_leaderboard AS
SELECT 
  pp.username,
  COALESCE(uts.verified_country_count, 0) as visited_count,
  COALESCE((SELECT SUM(points) FROM public.user_points_log upl WHERE upl.user_id = pp.user_id), 0) as points,
  COALESCE(uts.trust_level, 0) as level,
  ARRAY(SELECT badge_key FROM public.user_badges ub WHERE ub.user_id = pp.user_id) as badges
FROM public.l2t_public_profiles pp
LEFT JOIN public.user_trust_scores uts ON pp.user_id = uts.user_id
WHERE pp.is_public = true
ORDER BY points DESC;

-- Vize Merkezi Başlangıç Verileri (İdempotent olarak)
INSERT INTO public.visa_center_pages (country_code, slug, country_name, visa_title, visa_type, appointment_status)
VALUES 
  ('GB', 'ingiltere-uk-visitor-visa', 'İngiltere', 'UK Visitor Visa', 'Standart Ziyaretçi', 'bilgi_yok'),
  ('FR', 'fransa-schengen', 'Fransa', 'Schengen C Tipi', 'Turistik', 'bilgi_yok'),
  ('DE', 'almanya-schengen', 'Almanya', 'Schengen C Tipi', 'Turistik', 'bilgi_yok'),
  ('IT', 'italya-schengen', 'İtalya', 'Schengen C Tipi', 'Turistik', 'bilgi_yok'),
  ('NL', 'hollanda-schengen', 'Hollanda', 'Schengen C Tipi', 'Turistik', 'bilgi_yok'),
  ('US', 'abd-b1-b2', 'ABD', 'B1/B2 Ziyaretçi', 'Turistik/Ticari', 'bilgi_yok'),
  ('AE', 'bae-e-vize', 'BAE', 'E-Vize', 'Elektronik', 'bilgi_yok'),
  ('GR', 'yunanistan-schengen', 'Yunanistan', 'Schengen C Tipi', 'Turistik', 'bilgi_yok')
ON CONFLICT (country_code) DO NOTHING;
