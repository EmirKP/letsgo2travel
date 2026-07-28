import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createPairingCode,
  hashVisaExtensionSecret,
} from "@/lib/visa-appointments/extension-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUser(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { supabase: null, user: null };
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return { supabase, user: null };
  const { data } = await supabase.auth.getUser(header.slice(7));
  return { supabase, user: data.user || null };
}

async function ownedTrack(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  trackId: string,
) {
  const { data } = await supabase
    .from("visa_appointment_tracks")
    .select("id,user_id,country_name,application_city,provider_code,status,access_expires_at,execution_mode,extension_last_seen_at")
    .eq("id", trackId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function GET(request: Request) {
  const auth = await getUser(request);
  if (!auth.supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  if (!auth.user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const trackId = new URL(request.url).searchParams.get("trackId") || "";
  if (!trackId) return NextResponse.json({ error: "Takip kimliği gerekli." }, { status: 400 });
  const track = await ownedTrack(auth.supabase, auth.user.id, trackId);
  if (!track) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });

  const { data: pairing } = await auth.supabase
    .from("visa_appointment_extension_pairings")
    .select("status,expires_at,connected_at,last_seen_at,browser_name,extension_version")
    .eq("track_id", trackId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return NextResponse.json({
    data: {
      executionMode: track.execution_mode || "vds",
      extensionLastSeenAt: track.extension_last_seen_at || null,
      pairing: pairing || null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await getUser(request);
  if (!auth.supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  if (!auth.user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { trackId?: string };
  const trackId = String(body.trackId || "");
  if (!trackId) return NextResponse.json({ error: "Takip kimliği gerekli." }, { status: 400 });

  const track = await ownedTrack(auth.supabase, auth.user.id, trackId);
  if (!track) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });
  if (new Date(track.access_expires_at) <= new Date()) {
    return NextResponse.json({ error: "Takip süresi dolmuş." }, { status: 409 });
  }
  if (track.provider_code !== "idata") {
    return NextResponse.json({ error: "Chrome yardımcısı şu anda yalnızca iDATA Almanya için açık." }, { status: 409 });
  }

  const code = createPairingCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const payload = {
    user_id: auth.user.id,
    track_id: trackId,
    pairing_code_hash: hashVisaExtensionSecret(code.replace("-", "")),
    extension_token_hash: null,
    status: "pending",
    expires_at: expiresAt,
    token_expires_at: null,
    connected_at: null,
    last_seen_at: null,
    browser_name: null,
    extension_version: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.supabase
    .from("visa_appointment_extension_pairings")
    .upsert(payload, { onConflict: "track_id" });
  if (error) {
    console.error("visa extension pairing", error);
    return NextResponse.json({ error: "Bağlantı kodu oluşturulamadı. SQL kurulumunu kontrol et." }, { status: 500 });
  }

  await auth.supabase.from("visa_appointment_tracks").update({
    execution_mode: "browser_extension",
    status: "verification_required",
    next_check_at: null,
    locked_until: null,
    locked_by: null,
    last_result: "Chrome yardımcısı bağlantı kodu oluşturuldu; kullanıcı bağlantısı bekleniyor.",
  }).eq("id", trackId).eq("user_id", auth.user.id);

  return NextResponse.json({
    data: { code, expiresAt },
    message: "Bağlantı kodu oluşturuldu. Kod 10 dakika geçerlidir.",
  });
}

export async function DELETE(request: Request) {
  const auth = await getUser(request);
  if (!auth.supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  if (!auth.user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const trackId = new URL(request.url).searchParams.get("trackId") || "";
  const track = await ownedTrack(auth.supabase, auth.user.id, trackId);
  if (!track) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });

  await auth.supabase.from("visa_appointment_extension_pairings").update({
    status: "revoked",
    pairing_code_hash: null,
    extension_token_hash: null,
    updated_at: new Date().toISOString(),
  }).eq("track_id", trackId).eq("user_id", auth.user.id);

  await auth.supabase.from("visa_appointment_tracks").update({
    execution_mode: "vds",
    status: "verification_required",
    extension_last_seen_at: null,
    last_result: "Chrome yardımcısı bağlantısı kullanıcı tarafından kaldırıldı.",
  }).eq("id", trackId).eq("user_id", auth.user.id);

  return NextResponse.json({ message: "Chrome yardımcısı bağlantısı kaldırıldı." });
}
