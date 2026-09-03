import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_ROLES,
  ADMIN_SESSION_COOKIE,
  type AdminRole,
  verifyAdminSessionToken,
} from "@/lib/admin-session";
import { adminPrincipalFromSignedSession } from "@/lib/admin-auth";

export async function currentAdminSession() {
  const cookieStore = await cookies();
  const session = await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  const principal = await adminPrincipalFromSignedSession(session, ADMIN_ROLES);
  if (!session || !principal) return null;
  return { ...session, role: principal.role };
}

export async function requireAdminServer(
  allowedRoles: readonly AdminRole[] = ADMIN_ROLES,
) {
  const session = await currentAdminSession();
  if (!session || !allowedRoles.includes(session.role)) redirect("/admin/login");
  return session;
}
