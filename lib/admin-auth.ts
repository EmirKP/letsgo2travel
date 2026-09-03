import { NextResponse } from "next/server";
import {
  ADMIN_ROLES,
  adminSessionFromRequest,
  isAdminRole,
  type AdminRole,
  type AdminSession,
} from "./admin-session";
import { getSupabaseAdmin } from "./supabaseAdmin";

export type AdminPrincipal = {
  role: AdminRole;
  subject: string | null;
};

/**
 * İmzalı çerez bütünlüğü yalnız oturumun kimden geldiğini kanıtlar; içindeki
 * rol güncel yetki kaynağı değildir. Kullanıcıya bağlı her admin oturumunu
 * profiles tablosuna karşı yeniden doğrular. Sabit parola ile açılan eski
 * panel oturumu yalnız açık legacy-admin/super_admin istisnasıdır.
 */
export async function adminPrincipalFromSignedSession(
  session: AdminSession | null,
  allowedRoles: readonly string[] = ADMIN_ROLES,
): Promise<AdminPrincipal | null> {
  if (!session) return null;
  if (session.subject === "legacy-admin") {
    return session.role === "super_admin" && allowedRoles.includes("super_admin")
      ? { role: "super_admin", subject: null }
      : null;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.subject)
    .maybeSingle();
  if (error || !isAdminRole(profile?.role) || !allowedRoles.includes(profile.role)) return null;
  return { role: profile.role, subject: session.subject };
}

export async function adminPrincipalFromRequest(
  request: Request,
  allowedRoles: readonly string[] = ["admin", "super_admin"],
): Promise<AdminPrincipal | null> {
  const signedSession = await adminSessionFromRequest(request);
  if (signedSession) {
    const principal = await adminPrincipalFromSignedSession(signedSession, allowedRoles);
    if (principal) return principal;
  }

  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const token = authHeader.slice(7).trim();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (isAdminRole(profile?.role) && allowedRoles.includes(profile.role)) {
          return { role: profile.role, subject: user.id };
        }
      }
    }
  }

  return null;
}

export async function requireAdmin(request: Request, allowedRoles: readonly string[] = ['admin', 'super_admin']) {
  const principal = await adminPrincipalFromRequest(request, allowedRoles);
  if (principal) return null;

  return NextResponse.json({ error: "Yetkisiz işlem. Yetkiniz bulunmuyor." }, { status: 401 });
}
