import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isPushConfigured, sendPushToUser } from "@/lib/push";
import { apnsEnvironment } from "@/lib/push/apns";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GÜVENLİ TEST BİLDİRİMİ UCU
// - YALNIZ giriş yapmış kullanıcı, YALNIZ KENDİ aktif cihazlarına gönderir.
// - Rate limit: kullanıcı başına 60 saniyede 1 istek (best-effort,
//   instance içi) + istek başına en fazla 3 cihaz.
// - Yanıt/log hiçbir token, secret veya kişisel veri içermez; yalnız
//   platform + sınıflandırılmış sonuç + etkin APNs ortamı döner (ortam
//   uyuşmazlığı teşhisi için).
// - Public erişim yok (401); service-role anahtarı istemciye asla inmez.

const lastTestAt = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

async function requireUser(request: Request, supabase: any) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  const user = await requireUser(request, supabase);
  if (!user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const now = Date.now();
  const last = lastTestAt.get(user.id) || 0;
  if (now - last < RATE_LIMIT_MS) {
    return NextResponse.json(
      { error: "Çok sık deneme. Lütfen 1 dakika sonra tekrar dene." },
      { status: 429 },
    );
  }
  lastTestAt.set(user.id, now);
  // Map sınırsız büyümesin (best-effort temizlik).
  if (lastTestAt.size > 1000) {
    for (const [key, at] of lastTestAt) {
      if (now - at > RATE_LIMIT_MS) lastTestAt.delete(key);
    }
  }

  const configured = isPushConfigured();
  if (!configured.any) {
    return NextResponse.json({
      success: false,
      message: "Push sağlayıcısı sunucuda yapılandırılmamış.",
      apnsEnvironment: apnsEnvironment(),
    });
  }

  const summary = await sendPushToUser(supabase, user.id, {
    title: "Test bildirimi ✈️",
    body: "LetsGo2Travel bildirimleri bu cihazda çalışıyor.",
    data: { screen: "price-alerts" },
  });

  // Token değerleri summary içinde YOKTUR (yalnız platform + neden).
  return NextResponse.json({
    success: summary.sent > 0,
    attempted: summary.attempted,
    sent: summary.sent,
    failed: summary.failed,
    skippedUnconfigured: summary.skippedUnconfigured,
    errors: summary.errors,
    apnsEnvironment: apnsEnvironment(),
    message: summary.sent > 0
      ? "Test bildirimi gönderildi. Birkaç saniye içinde cihazına gelmeli."
      : summary.attempted === 0
        ? "Bu hesapta aktif cihaz kaydı bulunamadı. Önce uygulamada telefon bildirimini aç."
        : "Test bildirimi gönderilemedi. Cihaz kaydını kapatıp yeniden açmayı dene.",
  });
}
