import { NextResponse } from "next/server";
import { adminSessionFromRequest } from "./admin-session";
import { getSupabaseAdmin } from "./supabaseAdmin";

export async function requireAdmin(request: Request, allowedRoles: string[] = ['admin', 'super_admin']) {
  const signedSession = await adminSessionFromRequest(request);
  if (signedSession && allowedRoles.includes(signedSession.role)) return null;

  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const token = authHeader.slice(7).trim();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile && allowedRoles.includes(profile.role)) {
          return null;
        }
      }
    }
  }

  return NextResponse.json({ error: "Yetkisiz işlem. Yetkiniz bulunmuyor." }, { status: 401 });
}
