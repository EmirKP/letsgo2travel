import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSiteUrl } from "@/lib/site-url";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  const { id: userId } = await context.params;
  if (!userId) {
    return NextResponse.json({ error: "Geçersiz kullanıcı ID." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase servis ayarları eksik" }, { status: 500 });
  }

  try {
    // 1. Get the user to find their email
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    if (userError || !user?.email) {
      return NextResponse.json({ error: "Kullanıcı veya e-posta adresi bulunamadı." }, { status: 404 });
    }

    // 2. Generate and send a reset password email
    const { error: emailError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${getSiteUrl()}/sifre-yenile`,
    });

    if (emailError) {
       return NextResponse.json({ error: "Şifre sıfırlama e-postası gönderilemedi." }, { status: 500 });
    }
    
    return NextResponse.json({ message: "Şifre sıfırlama bağlantısı kullanıcıya gönderildi." });
  } catch {
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}
