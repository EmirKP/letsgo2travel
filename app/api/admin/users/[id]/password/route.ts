import { NextResponse } from "next/server";
import { adminPrincipalFromRequest } from "@/lib/admin-auth";
import { canResetManagedPassword } from "@/lib/admin-security";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await adminPrincipalFromRequest(request, ["admin", "super_admin"]);
  if (!principal) {
    return NextResponse.json({ error: "Yetkisiz işlem. Yetkiniz bulunmuyor." }, { status: 401 });
  }

  const { id: userId } = await context.params;
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json({ error: "Geçersiz kullanıcı ID." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 8 || newPassword.length > 128) {
    return NextResponse.json({ error: "Şifre 8–128 karakter arasında olmalıdır." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase servis ayarları eksik" }, { status: 500 });
  }

  try {
    const { data: targetProfile, error: targetProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (targetProfileError) {
      return NextResponse.json({ error: "Hedef kullanıcının yetkisi doğrulanamadı." }, { status: 500 });
    }
    if (!canResetManagedPassword(principal.role, targetProfile?.role)) {
      return NextResponse.json(
        { error: "Yalnızca süper yönetici, yönetici hesaplarının şifresini değiştirebilir." },
        { status: 403 },
      );
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) {
      return NextResponse.json({ error: "Şifre güncellenemedi." }, { status: 500 });
    }

    return NextResponse.json({ message: "Kullanıcının şifresi başarıyla güncellendi." });
  } catch {
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}
