import { NextResponse } from "next/server";
import { siteSettings } from "@/lib/affiliate";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const SETTINGS_FIELDS = [
  "bookingAffiliateUrl",
  "airaloAffiliateUrl",
  "getYourGuideAffiliateUrl",
  "travelpayoutsMarker",
  "supportEmail",
] as const;

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: siteSettings, source: "environment" });

  const { data } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
  const savedSettings = data
    ? Object.fromEntries(SETTINGS_FIELDS.filter((field) => typeof data[field] === "string").map((field) => [field, data[field]]))
    : {};
  return NextResponse.json({ data: { ...siteSettings, ...savedSettings }, source: data ? "draft" : "environment" });
}

export async function PUT(request: Request) {
  const authError = await requireAdmin(request, ['admin', 'super_admin']);
  if (authError) return authError;
  
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const settings = Object.fromEntries(
    SETTINGS_FIELDS.map((field) => [field, typeof body[field] === "string" ? body[field].trim() : ""]),
  );
  for (const field of ["bookingAffiliateUrl", "airaloAffiliateUrl", "getYourGuideAffiliateUrl"] as const) {
    try {
      if (new URL(settings[field]).protocol !== "https:") throw new Error("invalid protocol");
    } catch {
      return NextResponse.json({ error: "Affiliate bağlantıları geçerli bir HTTPS adresi olmalıdır." }, { status: 400 });
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.supportEmail)) {
    return NextResponse.json({ error: "Geçerli bir destek e-posta adresi girin." }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (site_settings tablosu veya veritabanı bağlantısı yok)." }, { status: 500 });
  }

  // Sadece id 1 olan kaydı güncelliyoruz varsayımı (Single row settings tablosu)
  const { data, error } = await supabase
    .from('site_settings')
    .upsert({ id: 1, ...settings })
    .select()
    .single();

  if (error) {
    console.error("Site settings draft error", error);
    return NextResponse.json({ error: "Yönetim taslağı kaydedilemedi." }, { status: 500 });
  }

  return NextResponse.json({ data, message: "Yönetim taslağı kaydedildi. Canlı site için Vercel ortam değişkenlerini güncelleyip yeniden deploy edin." });
}
