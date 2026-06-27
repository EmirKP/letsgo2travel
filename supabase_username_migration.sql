-- 1. Username alanını profiles tablosuna ekleme
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

-- 2. Eski hatalı constraint varsa güvenli şekilde kaldırma
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'profiles_username_key' 
        AND table_name = 'profiles'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_username_key;
    END IF;
END $$;

-- 3. Username formatı ve kurallar (Sadece küçük harf, rakam, alt çizgi, 3-20 karakter)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'profiles_username_format_check' 
        AND table_name = 'profiles'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format_check 
        CHECK (
            username IS NULL OR 
            username ~ '^[a-z0-9_]{3,20}$'
        );
    END IF;
END $$;

-- 4. Yasaklı kullanıcı adları (Reserved words)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'profiles_username_reserved_check' 
        AND table_name = 'profiles'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_reserved_check 
        CHECK (
            username IS NULL OR 
            username NOT IN ('admin', 'root', 'support', 'letsgo2travel', 'moderator', 'null', 'undefined', 'system')
        );
    END IF;
END $$;

-- 5. Unique kontrol (Büyük/küçük harf fark etmeksizin)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique ON public.profiles (lower(username)) WHERE username IS NOT NULL;

-- 6. RLS Policy (Sadece kullanıcının kendi profilini güncellemesine izin ver)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_policies 
        WHERE policyname = 'Users can update their own profile.' 
        AND tablename = 'profiles'
        AND schemaname = 'public'
    ) THEN
        CREATE POLICY "Users can update their own profile." ON public.profiles
            FOR UPDATE 
            USING (auth.uid() = id)
            WITH CHECK (auth.uid() = id);
    END IF;
END $$;
