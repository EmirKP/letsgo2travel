-- 1. RLS Aktifleştirme (Zaten aktifse hata vermez)
ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;

-- 2. Eski Politikaları Temizleme (Tüm update/delete veya hatalı politikaları siler)
-- Topics
DROP POLICY IF EXISTS "Topics are viewable by everyone" ON public.forum_topics;
DROP POLICY IF EXISTS "Users can insert pending topics" ON public.forum_topics;
DROP POLICY IF EXISTS "Users can insert topics" ON public.forum_topics;
DROP POLICY IF EXISTS "Users can update own topics" ON public.forum_topics;
DROP POLICY IF EXISTS "Users can update topics" ON public.forum_topics;

-- Replies
DROP POLICY IF EXISTS "Replies are viewable by everyone" ON public.forum_replies;
DROP POLICY IF EXISTS "Users can insert pending replies" ON public.forum_replies;
DROP POLICY IF EXISTS "Users can insert replies" ON public.forum_replies;
DROP POLICY IF EXISTS "Users can update own replies" ON public.forum_replies;
DROP POLICY IF EXISTS "Users can update replies" ON public.forum_replies;

-- Reports
DROP POLICY IF EXISTS "Users can insert reports" ON public.forum_reports;

-- 3. Güvenli Yeni Politikaları Ekleme

-- Topics (Sadece yayınlanmış olanları oku, sadece pending olarak ekle)
CREATE POLICY "Topics are viewable by everyone" ON public.forum_topics FOR SELECT USING (status = 'published');
CREATE POLICY "Users can insert pending topics" ON public.forum_topics FOR INSERT WITH CHECK (auth.uid() = author_id AND status = 'pending');

-- Replies (Sadece yayınlanmış olanları oku, sadece pending olarak ekle)
CREATE POLICY "Replies are viewable by everyone" ON public.forum_replies FOR SELECT USING (status = 'published');
CREATE POLICY "Users can insert pending replies" ON public.forum_replies FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Reports (Public okuma kapalı, sadece kendi raporunu ekleme yetkisi)
CREATE POLICY "Users can insert reports" ON public.forum_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Status CHECK Kısıtlamalarını Ekleme
-- (Önce varsa eski kısıtları siliyoruz, sonra yeniden ekliyoruz)
ALTER TABLE public.forum_topics DROP CONSTRAINT IF EXISTS forum_topics_status_check;
ALTER TABLE public.forum_topics ADD CONSTRAINT forum_topics_status_check CHECK (status IN ('pending', 'published', 'closed', 'hidden', 'rejected'));

ALTER TABLE public.forum_replies DROP CONSTRAINT IF EXISTS forum_replies_status_check;
ALTER TABLE public.forum_replies ADD CONSTRAINT forum_replies_status_check CHECK (status IN ('pending', 'published', 'hidden', 'rejected'));

ALTER TABLE public.forum_reports DROP CONSTRAINT IF EXISTS forum_reports_status_check;
ALTER TABLE public.forum_reports ADD CONSTRAINT forum_reports_status_check CHECK (status IN ('open', 'resolved', 'dismissed'));

-- 5. Performans İçin Index (Eski indexler varsa hata vermez)
CREATE INDEX IF NOT EXISTS idx_forum_topics_status ON public.forum_topics(status);
CREATE INDEX IF NOT EXISTS idx_forum_topics_country_slug ON public.forum_topics(country_slug);
CREATE INDEX IF NOT EXISTS idx_forum_topics_category ON public.forum_topics(category);

CREATE INDEX IF NOT EXISTS idx_forum_replies_topic_id ON public.forum_replies(topic_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_status ON public.forum_replies(status);

CREATE INDEX IF NOT EXISTS idx_forum_reports_target_id ON public.forum_reports(target_id);
CREATE INDEX IF NOT EXISTS idx_forum_reports_status ON public.forum_reports(status);
