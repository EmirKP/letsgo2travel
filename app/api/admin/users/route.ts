import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase servis ayarları eksik" }, { status: 500 });
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
  } catch {
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}
