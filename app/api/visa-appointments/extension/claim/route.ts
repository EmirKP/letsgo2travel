import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createExtensionToken,
  EXTENSION_CORS_HEADERS,
  hashVisaExtensionSecret,
  normalizePairingCode,
} from "@/lib/visa-appointments/extension-auth";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: EXTENSION_CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: EXTENSION_CORS_HEADERS });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return json({ error: "Sunucu yapılandırılmamış." }, 500);

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    browserName?: string;
    extensionVersion?: string;
  };
  const normalizedCode = normalizePairingCode(String(body.code || ""));
  if (normalizedCode.length !== 10) return json({ error: "Bağlantı kodu geçersiz." }, 400);

  const codeHash = hashVisaExtensionSecret(normalizedCode);
  const { data: pairing } = await supabase
    .from("visa_appointment_extension_pairings")
    .select("id,user_id,track_id,status,expires_at")
    .eq("pairing_code_hash", codeHash)
    .eq("status", "pending")
    .maybeSingle();

  if (!pairing || new Date(pairing.expires_at) <= new Date()) {
    return json({ error: "Bağlantı kodu bulunamadı veya süresi doldu." }, 404);
  }

  const { data: track } = await supabase
    .from("visa_appointment_tracks")
    .select("id,country_name,application_city,provider_code,access_expires_at")
    .eq("id", pairing.track_id)
    .eq("user_id", pairing.user_id)
    .maybeSingle();
  if (!track || track.provider_code !== "idata" || new Date(track.access_expires_at) <= new Date()) {
    return json({ error: "Takip artık bağlantıya uygun değil." }, 409);
  }

  const token = createExtensionToken();
  const now = new Date().toISOString();
  const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("visa_appointment_extension_pairings").update({
    status: "connected",
    pairing_code_hash: null,
    extension_token_hash: hashVisaExtensionSecret(token),
    token_expires_at: tokenExpiresAt,
    connected_at: now,
    last_seen_at: now,
    browser_name: String(body.browserName || "Chrome").slice(0, 80),
    extension_version: String(body.extensionVersion || "1.0.0").slice(0, 30),
    updated_at: now,
  }).eq("id", pairing.id);
  if (error) return json({ error: "Chrome yardımcısı bağlanamadı." }, 500);

  await supabase.from("visa_appointment_tracks").update({
    execution_mode: "browser_extension",
    status: "active",
    next_check_at: null,
    extension_last_seen_at: now,
    locked_until: null,
    locked_by: null,
    last_result: "Chrome yardımcısı bağlandı. Kontroller kullanıcının doğrulanmış tarayıcı oturumunda yapılacak.",
  }).eq("id", track.id);

  return json({
    data: {
      token,
      tokenExpiresAt,
      trackId: track.id,
      countryName: track.country_name,
      applicationCity: track.application_city,
      officialUrl: "https://de-tr-appointment.idata.com.tr/tr",
    },
  });
}
