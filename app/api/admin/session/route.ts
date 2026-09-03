import { NextResponse } from "next/server";
import {
  ADMIN_ROLES,
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  adminSessionFromRequest,
  createAdminSessionToken,
  isAdminRole,
} from "@/lib/admin-session";
import { adminPrincipalFromSignedSession } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function sessionResponse(role: string, expiresAt: number) {
  return NextResponse.json(
    { authenticated: true, role, expiresAt: new Date(expiresAt * 1000).toISOString() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(request: Request) {
  const session = await adminSessionFromRequest(request);
  const principal = await adminPrincipalFromSignedSession(session, ADMIN_ROLES);
  if (!session || !principal) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return sessionResponse(principal.role, session.expiresAt);
}

export async function POST(request: Request) {
  const current = await adminSessionFromRequest(request);
  if (current) {
    const principal = await adminPrincipalFromSignedSession(current, ADMIN_ROLES);
    if (principal) return sessionResponse(principal.role, current.expiresAt);
  }

  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Yönetici oturumu gerekli." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data, error } = await supabase.auth.getUser(header.slice(7).trim());
  if (error || !data.user) {
    return NextResponse.json({ error: "Oturum doğrulanamadı." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: "Yönetici yetkiniz bulunmuyor." }, { status: 403 });
  }

  const token = await createAdminSessionToken({ role: profile.role, subject: data.user.id });
  const response = sessionResponse(profile.role, Math.floor(Date.now() / 1000) + 24 * 60 * 60);
  response.cookies.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions());
  return response;
}
