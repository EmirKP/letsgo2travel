import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminSessionFromRequest } from "@/lib/admin-session";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function checkAdmin(request: Request) {
  const permissionError = await requireAdmin(request, ["moderator", "admin", "super_admin"]);
  if (permissionError) return { response: permissionError, supabase: null, userId: null };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      response: NextResponse.json({ error: "DB missing" }, { status: 500 }),
      supabase: null,
      userId: null,
    };
  }

  const signedSession = await adminSessionFromRequest(request);
  let userId = signedSession?.subject !== "legacy-admin" ? signedSession?.subject || null : null;
  const authHeader = request.headers.get("Authorization");
  if (!userId && authHeader?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(authHeader.slice(7).trim());
    userId = data.user?.id || null;
  }
  return { response: null, supabase, userId };
}

export async function GET(request: Request) {
  try {
    const auth = await checkAdmin(request);
    if (auth.response) return auth.response;

    const supabase = auth.supabase!;

    const { data, error } = await supabase
      .from("travel_verifications")
      .select("*, profiles:user_id(username)")
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === '42P01' || error.message?.includes('schema cache')) {
         return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: "Veriler alınamadı" }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası", data: [] }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await checkAdmin(request);
  if (auth.response) return auth.response;
  return NextResponse.json(
    { error: "Bu eski güncelleme ucu kapatıldı. Onay ve red işlemleri için kayıt bazlı uçları kullanın." },
    { status: 410 },
  );
}
