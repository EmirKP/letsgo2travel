-- 1. Forum Tables
CREATE TABLE IF NOT EXISTS public.forum_topics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id) NOT NULL,
  author_name TEXT NOT NULL,
  country_slug TEXT,
  category TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'closed', 'hidden', 'rejected')),
  views INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.forum_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID REFERENCES public.forum_topics(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.forum_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'topic' or 'reply'
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Guides and Countries
CREATE TABLE IF NOT EXISTS public.guide_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  bg_color TEXT,
  text_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.guide_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.guide_categories(id) ON DELETE CASCADE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  status TEXT DEFAULT 'published',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.countries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  continent TEXT NOT NULL,
  currency TEXT,
  visa_type TEXT,
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Row Level Security Enables (Safe to run multiple times)
ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

-- 4. Safe Policy Creation (Drop before creating to avoid conflicts)
DROP POLICY IF EXISTS "Topics are viewable by everyone" ON public.forum_topics;
DROP POLICY IF EXISTS "Users can insert pending topics" ON public.forum_topics;
DROP POLICY IF EXISTS "Users can insert topics" ON public.forum_topics; -- clear old policy
DROP POLICY IF EXISTS "Users can update own topics" ON public.forum_topics; -- clear old policy

DROP POLICY IF EXISTS "Replies are viewable by everyone" ON public.forum_replies;
DROP POLICY IF EXISTS "Users can insert pending replies" ON public.forum_replies;
DROP POLICY IF EXISTS "Users can insert replies" ON public.forum_replies; -- clear old policy
DROP POLICY IF EXISTS "Users can update own replies" ON public.forum_replies; -- clear old policy

DROP POLICY IF EXISTS "Users can insert reports" ON public.forum_reports;

DROP POLICY IF EXISTS "Guide categories viewable by everyone" ON public.guide_categories;
DROP POLICY IF EXISTS "Guide articles viewable by everyone" ON public.guide_articles;
DROP POLICY IF EXISTS "Countries viewable by everyone" ON public.countries;

-- Forum Policies
-- Only 'published' topics/replies are readable by public/users. 'pending' items are hidden from public.
CREATE POLICY "Topics are viewable by everyone" ON public.forum_topics FOR SELECT USING (status = 'published');
-- Users can only insert with 'pending' status
CREATE POLICY "Users can insert pending topics" ON public.forum_topics FOR INSERT WITH CHECK (auth.uid() = author_id AND status = 'pending');

CREATE POLICY "Replies are viewable by everyone" ON public.forum_replies FOR SELECT USING (status = 'published');
-- Users can only insert with 'pending' status
CREATE POLICY "Users can insert pending replies" ON public.forum_replies FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Report Policies
-- Normal users CANNOT read forum_reports (no SELECT policy). Only service_role (Admin) can read.
CREATE POLICY "Users can insert reports" ON public.forum_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Guide Policies
CREATE POLICY "Guide categories viewable by everyone" ON public.guide_categories FOR SELECT USING (true);
CREATE POLICY "Guide articles viewable by everyone" ON public.guide_articles FOR SELECT USING (status = 'published');
CREATE POLICY "Countries viewable by everyone" ON public.countries FOR SELECT USING (true);

-- 5. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_forum_topics_status ON public.forum_topics(status);
CREATE INDEX IF NOT EXISTS idx_forum_topics_country_slug ON public.forum_topics(country_slug);
CREATE INDEX IF NOT EXISTS idx_forum_topics_category ON public.forum_topics(category);

CREATE INDEX IF NOT EXISTS idx_forum_replies_topic_id ON public.forum_replies(topic_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_status ON public.forum_replies(status);

CREATE INDEX IF NOT EXISTS idx_forum_reports_target_id ON public.forum_reports(target_id);
CREATE INDEX IF NOT EXISTS idx_forum_reports_status ON public.forum_reports(status);
