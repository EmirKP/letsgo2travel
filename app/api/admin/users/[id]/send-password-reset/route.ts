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
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://letsgo2travel.vercel.app";
    const { error: emailError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${siteUrl}/sifre-yenile`,
    });

    if (emailError) {
       return NextResponse.json({ error: "Şifre sıfırlama e-postası gönderilemedi." }, { status: 500 });
    }
    
    return NextResponse.json({ message: "Şifre sıfırlama bağlantısı kullanıcıya gönderildi." });
  } catch (err) {
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}
