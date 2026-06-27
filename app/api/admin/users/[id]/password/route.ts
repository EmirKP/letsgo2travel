import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAdminPassword } from "@/lib/supabaseAdmin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const adminPass = getAdminPassword();
  const providedPass = request.headers.get("x-admin-password");

  if (!adminPass || providedPass !== adminPass) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

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
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) {
      return NextResponse.json({ error: "Şifre güncellenemedi." }, { status: 500 });
    }

    return NextResponse.json({ message: "Kullanıcının şifresi başarıyla güncellendi." });
  } catch (err) {
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}
