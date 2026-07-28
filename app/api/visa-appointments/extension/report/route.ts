import { NextResponse } from "next/server";
import { sendMail } from "@/lib/mail";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  EXTENSION_CORS_HEADERS,
  hashVisaExtensionSecret,
} from "@/lib/visa-appointments/extension-auth";

export const runtime = "nodejs";

const OUTCOMES = ["no_slots", "slot_found", "verification_required", "provider_unavailable", "error"] as const;
type Outcome = (typeof OUTCOMES)[number];

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: EXTENSION_CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: EXTENSION_CORS_HEADERS });
}

function siteUrl() {
  return String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.letsgo2travel.com.tr").replace(/\/$/, "");
}

function notificationCopy(outcome: Outcome, countryName: string, message: string) {
  if (outcome === "slot_found") {
    return {
      eventType: "slot_found",
      title: `${countryName} için uygun randevu tarihi bulundu`,
      message: message || "Chrome yardımcısı uygun bir tarih tespit etti. Ayrıntıları hemen kontrol et.",
    };
  }
  return {
    eventType: "verification_required",
    title: `${countryName} takibinde kullanıcı işlemi gerekiyor`,
    message: message || "iDATA sayfasında doğrulama veya kullanıcı kontrolü gerekiyor.",
  };
}

function emailHtml(params: { title: string; message: string; actionUrl: string }) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f7fa;padding:32px 16px"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dce5ec;border-radius:20px;padding:32px"><div style="display:inline-block;background:#071b33;color:#ffe08a;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:800">LETSGO2TRAVEL CHROME YARDIMCISI</div><h1 style="margin:20px 0 12px;color:#071b33;font-size:25px">${params.title}</h1><p style="color:#52606d;line-height:1.65">${params.message}</p><a href="${params.actionUrl}" style="display:inline-block;margin-top:16px;background:#f6c445;color:#071b33;text-decoration:none;font-weight:900;padding:14px 22px;border-radius:12px">Takip panelini aç</a><p style="margin-top:24px;color:#88939e;font-size:12px;line-height:1.6">Chrome yardımcısı yalnızca açık iDATA sayfasındaki görünür durum bilgisini okur; çerez, parola ve form alanı değerlerini göndermez.</p></div></div>`;
}

async function insertNotification(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from("visa_appointment_notifications").insert(payload);
  if (!error) return;
  await supabase.from("visa_appointment_notifications").insert({
    track_id: payload.track_id,
    user_id: payload.user_id,
    channel: payload.channel,
    event_type: payload.event_type,
    status: payload.status,
    provider_message_id: payload.provider_message_id || null,
    error_message: payload.error_message || null,
    sent_at: payload.sent_at || null,
  });
}

async function notify(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  track: {
    id: string;
    user_id: string;
    country_name: string;
    notify_email: boolean;
    notify_push: boolean;
    notify_in_app: boolean;
  },
  outcome: Outcome,
  message: string,
) {
  if (!(outcome === "slot_found" || outcome === "verification_required")) return;
  const copy = notificationCopy(outcome, track.country_name, message);
  const actionUrl = `${siteUrl()}/vize-randevu`;
  const common = {
    track_id: track.id,
    user_id: track.user_id,
    event_type: copy.eventType,
    title: copy.title,
    message: copy.message,
    action_url: actionUrl,
    metadata: { outcome, source: "chrome_extension" },
  };

  if (track.notify_in_app) {
    await insertNotification(supabase, { ...common, channel: "in_app", status: "sent", sent_at: new Date().toISOString() });
  }
  if (track.notify_push) {
    await insertNotification(supabase, { ...common, channel: "push", status: "queued", error_message: "Cihaz push anahtarı bağlandığında gönderilecek." });
  }
  if (track.notify_email) {
    const { data } = await supabase.auth.admin.getUserById(track.user_id);
    const email = data.user?.email;
    if (!email) {
      await insertNotification(supabase, { ...common, channel: "email", status: "failed", error_message: "Kullanıcı e-posta adresi bulunamadı." });
      return;
    }
    const result = await sendMail({
      to: email,
      subject: copy.title,
      html: emailHtml({ title: copy.title, message: copy.message, actionUrl }),
      category: "visa_appointment",
      referenceId: track.id,
    });
    const isMock = result.providerId === "mock";
    await insertNotification(supabase, {
      ...common,
      channel: "email",
      status: result.success && !isMock ? "sent" : isMock ? "queued" : "failed",
      provider_message_id: result.providerId || null,
      error_message: isMock ? "RESEND_API_KEY tanımlı değil; e-posta kuyruğa alındı." : result.error || null,
      sent_at: result.success && !isMock ? new Date().toISOString() : null,
    });
  }
}

function cleanDates(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
    .slice(0, 20);
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return json({ error: "Sunucu yapılandırılmamış." }, 500);

  const header = request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token.length < 32) return json({ error: "Chrome yardımcısı bağlantısı gerekli." }, 401);

  const tokenHash = hashVisaExtensionSecret(token);
  const { data: pairing } = await supabase
    .from("visa_appointment_extension_pairings")
    .select("id,user_id,track_id,status,token_expires_at")
    .eq("extension_token_hash", tokenHash)
    .eq("status", "connected")
    .maybeSingle();
  if (!pairing || !pairing.token_expires_at || new Date(pairing.token_expires_at) <= new Date()) {
    return json({ error: "Chrome yardımcısı bağlantısı geçersiz veya süresi doldu." }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as {
    outcome?: Outcome;
    message?: string;
    availableDates?: string[];
    pageUrl?: string;
    pageTitle?: string;
    fingerprint?: string;
  };
  if (!body.outcome || !OUTCOMES.includes(body.outcome)) return json({ error: "Kontrol sonucu geçersiz." }, 400);

  const { data: track } = await supabase
    .from("visa_appointment_tracks")
    .select("id,user_id,country_name,status,error_count,notify_email,notify_push,notify_in_app,access_expires_at,execution_mode")
    .eq("id", pairing.track_id)
    .eq("user_id", pairing.user_id)
    .maybeSingle();
  if (!track) return json({ error: "Takip bulunamadı." }, 404);
  if (new Date(track.access_expires_at) <= new Date()) return json({ error: "Takip süresi doldu." }, 409);
  if (track.execution_mode !== "browser_extension") return json({ error: "Takip Chrome yardımcısı modunda değil." }, 409);

  const now = new Date();
  const availableDates = cleanDates(body.availableDates);
  const message = String(body.message || body.outcome).slice(0, 800);
  const pageUrl = String(body.pageUrl || "").startsWith("https://de-tr-appointment.idata.com.tr/")
    ? String(body.pageUrl).slice(0, 1000)
    : null;

  await supabase.from("visa_appointment_check_logs").insert({
    track_id: track.id,
    worker_name: "chrome-extension",
    outcome: body.outcome,
    message,
    available_dates: availableDates,
    evidence_url: pageUrl,
    checked_at: now.toISOString(),
  });

  if (body.outcome === "slot_found") {
    await supabase.from("visa_appointment_matches").insert({
      track_id: track.id,
      user_id: track.user_id,
      available_dates: availableDates,
      provider_message: message,
      evidence_url: pageUrl,
      expires_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    });
  }

  const nextStatus = body.outcome === "slot_found"
    ? "match_found"
    : body.outcome === "verification_required"
      ? "verification_required"
      : body.outcome === "error"
        ? "error"
        : "active";
  const shouldNotify =
    (body.outcome === "slot_found" && track.status !== "match_found") ||
    (body.outcome === "verification_required" && track.status !== "verification_required");

  await supabase.from("visa_appointment_tracks").update({
    status: nextStatus,
    execution_mode: "browser_extension",
    extension_last_seen_at: now.toISOString(),
    last_checked_at: now.toISOString(),
    next_check_at: null,
    last_result: message.slice(0, 500),
    error_count: body.outcome === "error" ? Number(track.error_count || 0) + 1 : 0,
    locked_until: null,
    locked_by: null,
  }).eq("id", track.id);

  await supabase.from("visa_appointment_extension_pairings").update({
    last_seen_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq("id", pairing.id);

  if (shouldNotify) await notify(supabase, track, body.outcome, message);

  return json({
    data: {
      accepted: true,
      status: nextStatus,
      checkedAt: now.toISOString(),
    },
  });
}
