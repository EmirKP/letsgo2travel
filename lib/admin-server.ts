import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_ROLES,
  ADMIN_SESSION_COOKIE,
  type AdminRole,
  verifyAdminSessionToken,
} from "@/lib/admin-session";

export async function currentAdminSession() {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function requireAdminServer(
  allowedRoles: readonly AdminRole[] = ADMIN_ROLES,
) {
  const session = await currentAdminSession();
  if (!session || !allowedRoles.includes(session.role)) redirect("/admin/login");
  return session;
}
