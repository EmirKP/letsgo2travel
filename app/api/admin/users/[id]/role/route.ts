import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const userIdToUpdate = resolvedParams.id;

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase servis ayarları eksik" }, { status: 500 });
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 401 });
    }

    // Kullanıcının super_admin olup olmadığını kontrol et
    const { data: currentUserProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!currentUserProfile || currentUserProfile.role !== 'super_admin') {
      return NextResponse.json({ error: "Bu işlem yalnızca super admin tarafından yapılabilir." }, { status: 403 });
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
    if (user.id === userIdToUpdate && role !== 'super_admin') {
      // Kendisinin rolünü düşürüyor, sistemdeki super_admin sayısına bakalım
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'super_admin');
      
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
