import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminSessionFromRequest } from "@/lib/admin-session";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const userIdToUpdate = resolvedParams.id;

  try {
    const permissionError = await requireAdmin(request, ["super_admin"]);
    if (permissionError) return permissionError;

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase servis ayarları eksik" }, { status: 500 });
    }

    const signedSession = await adminSessionFromRequest(request);
    const authHeader = request.headers.get("Authorization");
    let actorId = signedSession?.subject !== "legacy-admin" ? signedSession?.subject || null : null;
    if (!actorId && authHeader?.startsWith("Bearer ")) {
      const { data } = await supabase.auth.getUser(authHeader.slice(7).trim());
      actorId = data.user?.id || null;
    }

    const body = await request.json();
    const { role } = body;

    const validRoles = ['user', 'moderator', 'editor', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Geçersiz rol seçildi." }, { status: 400 });
    }

    // Güncellenecek kullanıcının mevcut profilini al
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userIdToUpdate)
      .single();

    // Sadece super_admin başka bir super_admin'i değiştirebilir (Zaten yukarıda kontrol ettik).
    // Ancak super_admin'in kendisini kilitlenmesini engellemeliyiz.
    if (actorId === userIdToUpdate && role !== 'super_admin') {
      // Kendisinin rolünü düşürüyor, sistemdeki super_admin sayısına bakalım
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'super_admin');
      
      if (!countError && count !== null && count <= 1) {
        return NextResponse.json({ error: "En az bir super admin bulunmalıdır." }, { status: 400 });
      }
    }

    if (targetProfile?.role === "super_admin" && role !== "super_admin") {
      const { count, error: countError } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "super_admin");
      if (!countError && count !== null && count <= 1) {
        return NextResponse.json({ error: "En az bir super admin bulunmalıdır." }, { status: 400 });
      }
    }

    // Profili güncelle veya ekle (Upsert)
    const { error: updateError } = await supabase
      .from('profiles')
      .upsert({ 
        id: userIdToUpdate, 
        role: role,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (updateError) {
      console.error("Rol güncelleme hatası:", updateError);
      return NextResponse.json({ error: "Kullanıcı rolü güncellenemedi." }, { status: 500 });
    }

    return NextResponse.json({ success: true, role });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Kullanıcı rolü güncellenemedi." }, { status: 500 });
  }
}
