import { NextResponse } from "next/server";
import { getAdminPassword, getSupabaseAdmin } from "./supabaseAdmin";

export async function requireAdmin(request: Request, allowedRoles: string[] = ['admin', 'super_admin']) {
  // 1. Fallback for x-admin-password
  const password = getAdminPassword();
  const header = request.headers.get("x-admin-password") || "";
  if (password && header === password) return null;

  // 2. Role-based check
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile && allowedRoles.includes(profile.role)) {
          return null; // Authorized
        }
      }
    }
  }

  return NextResponse.json({ error: "Yetkisiz işlem. Yetkiniz bulunmuyor." }, { status: 401 });
}
