import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
};

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) {
    for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
      auth.response.headers.set(name, value);
    }
    return auth.response;
  }

  const { data: profile, error } = await auth.supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Yönetim erişimi doğrulanamadı." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const allowed = profile?.role === "super_admin";
  return NextResponse.json(
    { data: { allowed, role: allowed ? "super_admin" : null } },
    { headers: NO_STORE_HEADERS },
  );
}
