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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function cleanUuid(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  const user = await requireUser(request, supabase);
  if (!user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const body = await request.json().catch(() => null) as { tokenType?: string; token?: string; tripId?: string; installationId?: string } | null;
  const tokenType = String(body?.tokenType || "").toLowerCase();
  const token = cleanToken(body?.token);
  const tripId = cleanUuid(body?.tripId);
  // Kalıcı kurulum (cihaz) kimliği: push-to-start token ROTASYONU için.
  // Apple token'ı zamanla değiştirebilir; kimlik sayesinde aynı fiziksel
  // cihazın eski tokenı atomik kapatılır, DİĞER cihazlara dokunulmaz.
  const installationId = cleanUuid(body?.installationId);
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

  // push_to_start + kurulum kimliği: rotasyon TEK transaksiyonda (RPC).
  // Aynı kullanıcı+kurulumun eski tokenları atomik kapanır; farklı
  // cihazlar etkilenmez. RPC/kolon migration'ı üretimde henüz yoksa
  // (42883 fonksiyon yok / 42703 kolon yok) eski upsert yoluna düşülür.
  if (tokenType === "push_to_start" && installationId) {
    const { error: rpcError } = await supabase.rpc("register_live_activity_push_to_start", {
      p_user_id: user.id,
      p_installation_id: installationId,
      p_token: token,
    });
    if (!rpcError) return NextResponse.json({ success: true });
    const rpcCode = (rpcError as { code?: string }).code;
    if (rpcCode === "42P01") return NextResponse.json({ error: "Servis henüz hazır değil." }, { status: 503 });
    if (rpcCode !== "42883" && rpcCode !== "42703") {
      console.error("live_activity_token_rotasyon_hatasi", { code: rpcCode || "unknown" });
      return NextResponse.json({ error: "Token kaydedilemedi." }, { status: 500 });
    }
    // Fonksiyon henüz yok: aşağıdaki geriye dönük uyumlu yol devam eder.
  }

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
        ...(installationId ? { installation_id: installationId } : {}),
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
