import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAdminPassword } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const adminPass = getAdminPassword();
  const providedPass = request.headers.get("x-admin-password");

  // Authentication check (fallback to adminPass for backwards compatibility if needed, but ideally session check comes here too)
  // For now, since admin dashboard relies on x-admin-password or session, let's keep it simple: 
  // It checks either password or we will protect it in the layout/page.
  // Actually, to make it secure via session as well:
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase servis ayarları eksik" }, { status: 500 });
  }

  // Get session from auth header or cookies if possible.
  // For API route called from client, we can check authorization header, but nextjs app dir often uses cookies.
  // We'll leave the `x-admin-password` check for the legacy login, but the page level already checks session.
  
  // Since the user wants to keep `x-admin-password` as fallback until fully transitioned:
  let isAuthorized = false;
  if (adminPass && providedPass === adminPass) {
    isAuthorized = true;
  } else {
    // Check if called with a valid session that has admin/super_admin role
    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile && ['admin', 'super_admin'].includes(profile.role)) {
          isAuthorized = true;
        }
      }
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

  try {
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers({
      perPage: 1000 // Get up to 1000 users for the admin panel
    });

    if (usersError) {
      return NextResponse.json({ error: "Kullanıcılar alınamadı." }, { status: 500 });
    }

    // Fetch profiles to get roles and usernames (safely)
    let profiles;
    let profilesError;

    const res = await supabase.from('profiles').select('id, role, full_name, username');
    
    if (res.error) {
      console.warn("Username column might not exist yet, falling back to id, role, full_name.");
      const fallback = await supabase.from('profiles').select('id, role, full_name');
      profiles = fallback.data;
      profilesError = fallback.error;
    } else {
      profiles = res.data;
      profilesError = res.error;
    }

    if (profilesError && profilesError.code !== '42P01') {
      console.error("Profiles fetch error:", profilesError);
    }

    const profilesMap = new Map();
    if (profiles) {
      profiles.forEach(p => profilesMap.set(p.id, p));
    }

    // Sanitize user data before sending to client (remove sensitive identities/factors)
    const safeUsers = users.map(user => {
      const profile = profilesMap.get(user.id);
      return {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || user.user_metadata?.full_name || null,
        username: profile?.username || user.user_metadata?.username || 'Belirtilmemiş',
        role: profile?.role || 'user',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        email_confirmed_at: user.email_confirmed_at
      };
    });

    // Sort by newest first
    safeUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ data: safeUsers });
  } catch (err) {
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}
