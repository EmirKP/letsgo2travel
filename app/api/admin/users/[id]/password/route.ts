import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  const { id: userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ error: "Geçersiz kullanıcı ID." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const newPassword = body?.newPassword;

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "Şifre en az 8 karakter olmalıdır." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase servis ayarları eksik" }, { status: 500 });
  }

  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) {
      return NextResponse.json({ error: "Şifre güncellenemedi." }, { status: 500 });
    }

    return NextResponse.json({ message: "Kullanıcının şifresi başarıyla güncellendi." });
  } catch {
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}
