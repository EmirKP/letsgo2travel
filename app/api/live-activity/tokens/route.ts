import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Live Activity push token kaydı (push-to-start / activity-update).
// Kurallar push_devices ile aynıdır:
// - Yalnız giriş yapmış kullanıcı (Bearer) KENDİ tokenını kaydedebilir.
// - Token değeri hiçbir yanıt/log/hata mesajına yazılmaz.
// - activity_update tokenı yalnız kullanıcının KENDİ kokpit kaydına
//   bağlanabilir (trips.user_id doğrulanır) — başkasının trip_id'sine
//   token bağlanamaz.
// - Tablo RLS default-deny + service-role kilitlidir.

const TOKEN_TYPES = new Set(["push_to_start", "activity_update"]);
const MAX_TOKENS_PER_USER_PER_TYPE = 10;

async function requireUser(request: Request, supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

function cleanToken(value: unknown) {
  const token = String(value || "").trim();
  // ActivityKit tokenları hex olarak gelir (uzunluk cihaza göre değişir).
  if (token.length < 16 || token.length > 512) return null;
  if (!/^[A-Fa-f0-9]+$/.test(token)) return null;
  return token.toLowerCase();
}

function cleanTripId(value: unknown) {
  const tripId = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(tripId) ? tripId : null;
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  const user = await requireUser(request, supabase);
  if (!user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const body = await request.json().catch(() => null) as { tokenType?: string; token?: string; tripId?: string } | null;
  const tokenType = String(body?.tokenType || "").toLowerCase();
  const token = cleanToken(body?.token);
  const tripId = cleanTripId(body?.tripId);
  if (!TOKEN_TYPES.has(tokenType) || !token || (tokenType === "activity_update" && !tripId)) {
    return NextResponse.json({ error: "Geçersiz token kaydı isteği." }, { status: 400 });
  }

  // activity_update: trip SAHİPLİĞİ doğrulanır — başka kullanıcının
  // kaydına token bağlanamaz.
  if (tokenType === "activity_update" && tripId) {
    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("id")
      .eq("id", tripId)
      .eq("user_id", user.id)
      .limit(1);
    if (tripError) return NextResponse.json({ error: "Kayıt doğrulanamadı." }, { status: 500 });
    if (!trip?.length) return NextResponse.json({ error: "Bu kayda erişim iznin yok." }, { status: 403 });
  }

  const now = new Date().toISOString();

  // Tür başına kullanıcı kotası: en eski etkin kayıt kapatılarak yer açılır.
  const { count } = await supabase
    .from("live_activity_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("token_type", tokenType)
    .eq("enabled", true);
  if ((count || 0) >= MAX_TOKENS_PER_USER_PER_TYPE) {
    const { data: oldest } = await supabase
      .from("live_activity_tokens")
      .select("id")
      .eq("user_id", user.id)
      .eq("token_type", tokenType)
      .eq("enabled", true)
      .order("updated_at", { ascending: true })
      .limit(1);
    if (oldest?.[0]) {
      await supabase.from("live_activity_tokens").update({ enabled: false, updated_at: now }).eq("id", oldest[0].id);
    }
  }

  const { error } = await supabase
    .from("live_activity_tokens")
    .upsert(
      {
        user_id: user.id,
        token_type: tokenType,
        trip_id: tokenType === "activity_update" ? tripId : null,
        token,
        enabled: true,
        updated_at: now,
      },
      { onConflict: "user_id,token_type,token" },
    );
  if (error) {
    // 42P01: tablo yok (migration üretime uygulanmadı) — istemci sessiz
    // geçebilsin diye 503 döneriz; token asla loglanmaz.
    const code = (error as { code?: string }).code;
    if (code === "42P01") return NextResponse.json({ error: "Servis henüz hazır değil." }, { status: 503 });
    console.error("live_activity_token_kayit_hatasi", { code: code || "unknown" });
    return NextResponse.json({ error: "Token kaydedilemedi." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
