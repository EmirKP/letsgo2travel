import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function checkAdmin(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: "DB missing", status: 500 };

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    const legacyPass = request.headers.get("x-admin-password");
    if (!legacyPass) return { error: "Unauthorized", status: 401 };
    // Legacy pass logic would go here if we trusted it, but for verifications we really need a user to log the admin action.
    // Let's assume we need a real session for this to log `reviewed_by`.
    return { error: "Admin session required", status: 401 };
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'super_admin', 'moderator'].includes(profile.role)) {
    return { error: "Forbidden", status: 403 };
  }

  return { supabase, user };
}

export async function GET(request: Request) {
  try {
    const auth = await checkAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabase = auth.supabase!;

    const { data, error } = await supabase
      .from("travel_verifications")
      .select("*, profiles:user_id(username, email)") // Fetching username directly, email may fail if not in profiles but safe
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === '42P01' || error.message?.includes('schema cache')) {
         return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: "Veriler alınamadı" }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası", data: [] }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await checkAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabase = auth.supabase!;
    const user = auth.user!;
    const body = await request.json();
    const { id, status, admin_note } = body;

    if (!id || !status) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });

    const updates: any = {
      status,
      admin_note,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (status === 'approved') {
      // Önce mevcut kaydı alıp yöntemi kontrol edelim
      const { data: currentRecord } = await supabase
        .from("travel_verifications")
        .select("verification_method")
        .eq("id", id)
        .single();
      
      if (!currentRecord || currentRecord.verification_method !== 'document') {
        return NextResponse.json({ error: "Sadece belge yöntemli başvurular onaylanabilir." }, { status: 400 });
      }
      updates.verified_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("travel_verifications")
      .update(updates)
      .eq("id", id)
      .select();

    if (error) {
      console.error("admin travel verification update error", error);
      return NextResponse.json(
        { error: "Doğrulama işlemi şu anda tamamlanamıyor." },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data[0] });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
