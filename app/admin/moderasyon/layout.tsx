import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export default async function ModerasyonLayout({ children }: { children: React.ReactNode }) {
  // Production environment check: Ensure only authenticated admins can access this route.
  // In a real app, this should use @supabase/auth-helpers-nextjs
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  // Dummy check to prevent static rendering of admin panel and enforce a server-side redirect
  // if the user is not authenticated or not an admin.
  // If no Supabase URL is provided, we assume we are in a build environment and let it pass, 
  // but in runtime it will check.
  
  // 1. Session var mı ve kullanıcı bilgisi alınabiliyor mu kontrol et
  if (supabaseUrl) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { session } } = await supabase.auth.getSession();
    
    // 2. Eğer kullanıcı hiç giriş yapmamışsa (Çıkış yapmış / Guest) -> Login'e yönlendir
    if (!session || !session.user) {
      redirect('/admin/login');
    }

    // 3. Kullanıcı giriş yapmış ama rolü admin değilse -> Yetkisiz / Ana sayfaya yönlendir
    // Varsayım: role metadata'sı app_metadata.role veya user_metadata içinde tutulur.
    // Projenin tam auth yapısına göre (örneğin role alanı):
    const role = session.user?.app_metadata?.role || session.user?.user_metadata?.role;
    if (role !== 'admin') {
      redirect('/'); // Veya yetkisiz_erisim sayfasına
    }
  } else {
    // Local dev fallback if no env vars exist (should not happen in prod)
    redirect('/');
  }

  return (
    <div className="admin-protected-route">
      {/* Admin Warning Banner */}
      <div style={{ background: '#ef4444', color: '#fff', padding: '8px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600 }}>
        GİZLİ ALAN: Yalnızca yetkili moderatörler erişebilir. Log kayıtları tutulmaktadır.
      </div>
      {children}
    </div>
  );
}
