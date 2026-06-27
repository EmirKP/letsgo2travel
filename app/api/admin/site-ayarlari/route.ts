import { NextResponse } from "next/server";
import { siteSettings } from "@/lib/affiliate";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  return NextResponse.json({ data: siteSettings });
}

export async function PUT(request: Request) {
  const authError = await requireAdmin(request, ['admin', 'super_admin']);
  if (authError) return authError;
  
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (site_settings tablosu veya veritabanı bağlantısı yok)." }, { status: 500 });
  }

  // Sadece id 1 olan kaydı güncelliyoruz varsayımı (Single row settings tablosu)
  const { data, error } = await supabase
    .from('site_settings')
    .upsert({ id: 1, ...body })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: `Backend entegrasyonu gerekiyor: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ data, message: "Ayarlar başarıyla kaydedildi." });
}
