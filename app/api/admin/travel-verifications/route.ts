import { NextResponse } from "next/server";
import { adminPrincipalFromRequest } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function checkAdmin(request: Request) {
  const principal = await adminPrincipalFromRequest(request, ["moderator", "admin", "super_admin"]);
  if (!principal) {
    return {
      response: NextResponse.json({ error: "Yetkisiz işlem. Yetkiniz bulunmuyor." }, { status: 401 }),
      supabase: null,
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      response: NextResponse.json({ error: "DB missing" }, { status: 500 }),
      supabase: null,
    };
  }
  return { response: null, supabase };
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
