import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { disablePushDevices } from "@/lib/push";

export const dynamic = "force-dynamic";

// Cihaz push token kaydi. Kurallar:
// - Yalniz giris yapmis kullanici (Bearer token) kendi cihazini kaydedebilir/kapatabilir.
// - Token degerleri hicbir yanit, log veya hata mesajina yazilmaz. Kayit
//   yaniti yalniz OPAK cihaz kayit ID'sini (rastgele uuid) dondurur; mobil
//   uygulama token'i degil, yalniz bu ID'yi yerel olarak saklar.
// - Kapatma (DELETE) cihaz ID'siyle yapilir ve HER ZAMAN hem id hem
//   giris yapmis user_id ile filtrelenir; baska kullanicinin cihazi
//   kapatilamaz. { all: true } yalniz kullanicinin ACIKCA "tum cihazlarda
//   kapat" islemi icindir (normal logout TEK cihazi kapatir).
// - Tablo RLS + service-role kilitlidir; tum erisim bu sunucu katmanindan gecer.

const PLATFORMS = new Set(["ios", "android"]);
const MAX_DEVICES_PER_USER = 10;

async function requireUser(request: Request, supabase: any) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

function cleanToken(value: unknown) {
  const token = String(value || "").trim();
  // APNs hex (~64) / FCM (~150-200); genis ama sinirli bir aralik kabul edilir.
  if (token.length < 16 || token.length > 512) return null;
  if (!/^[A-Za-z0-9_:\-.]+$/.test(token)) return null;
  return token;
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  const user = await requireUser(request, supabase);
  if (!user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const body = await request.json().catch(() => null) as { platform?: string; token?: string } | null;
  const platform = String(body?.platform || "").toLowerCase();
  const deviceToken = cleanToken(body?.token);
  if (!PLATFORMS.has(platform) || !deviceToken) {
    return NextResponse.json({ error: "Geçersiz cihaz kaydı isteği." }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { count } = await supabase
    .from("push_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("enabled", true);
  if ((count || 0) >= MAX_DEVICES_PER_USER) {
    // En eski cihazi kapatarak yer ac (kullaniciyi bloklamak yerine).
    const { data: oldest } = await supabase
      .from("push_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("enabled", true)
      .order("last_seen_at", { ascending: true, nullsFirst: true })
      .limit(1);
    if (oldest?.[0]) {
      await supabase.from("push_devices").update({ enabled: false, updated_at: now }).eq("id", oldest[0].id);
    }
  }

  // unique(platform, device_token) + tek UPSERT: ayni token ayni anda yalniz
  // TEK kullaniciya bagli olabilir; hesap degisiminde kayit ATOMIK olarak
  // yeni kullaniciya devredilir (ayri disable adimi yok, yaris penceresi yok).
  const { data: upserted, error } = await supabase
    .from("push_devices")
    .upsert(
      {
        user_id: user.id,
        platform,
        device_token: deviceToken,
        enabled: true,
        last_seen_at: now,
        updated_at: now,
        last_error: null,
      },
      { onConflict: "platform,device_token" },
    )
    .select("id")
    .single();

  if (error || !upserted?.id) {
    console.error("push_devices upsert error kodu:", error?.code || "no_row");
    return NextResponse.json({ error: "Cihaz kaydı yapılamadı." }, { status: 500 });
  }

  // Yanit token ICERMEZ; yalniz opak cihaz kayit ID'si doner. Mobil taraf
  // logout'ta yalniz bu ID ile kendi cihazini kapatir.
  return NextResponse.json({ success: true, deviceId: upserted.id });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  const user = await requireUser(request, supabase);
  if (!user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const body = await request.json().catch(() => null) as { id?: string; all?: boolean } | null;

  if (body?.all) {
    // YALNIZ acik "tum cihazlarda bildirimleri kapat" islemi icin.
    // Normal logout bunu KULLANMAZ; tek cihaz kapatir (asagida).
    const result = await disablePushDevices(supabase, { userId: user.id, all: true });
    if (!result.ok) return NextResponse.json({ error: "Cihaz kayıtları kapatılamadı." }, { status: 500 });
    return NextResponse.json({ success: true, disabled: result.disabled });
  }

  const deviceId = String(body?.id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  // Hem id hem giris yapmis user_id ile filtrelenir: baska kullanicinin
  // cihaz ID'siyle yapilan istek 0 satir etkiler (bilgi sizdirmadan).
  const result = await disablePushDevices(supabase, { userId: user.id, deviceId });
  if (!result.ok) return NextResponse.json({ error: "Cihaz kaydı kapatılamadı." }, { status: 500 });
  return NextResponse.json({ success: true, disabled: result.disabled });
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  const user = await requireUser(request, supabase);
  if (!user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  // Token degerleri asla dondurulmez; yalniz durum bilgisi.
  const { data, error } = await supabase
    .from("push_devices")
    .select("id, platform, enabled, created_at, last_seen_at")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Cihaz kayıtları okunamadı." }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}
