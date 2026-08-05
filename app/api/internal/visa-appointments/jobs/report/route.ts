import { NextResponse } from "next/server";
import { sendMail } from "@/lib/mail";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizedVisaWorker } from "@/lib/visa-appointments/worker-auth";
import { getSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

const OUTCOMES = ["no_slots", "slot_found", "verification_required", "provider_unavailable", "error"] as const;
type Outcome = (typeof OUTCOMES)[number];

const EVIDENCE_BUCKET = "visa-appointment-evidence";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[character] || character);
}

function cleanAvailableDates(value: unknown, earliestDate: string, latestDate: string) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => String(item).trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
    .filter((item) => item >= earliestDate && item <= latestDate))]
    .slice(0, 20);
}

function safeEvidenceUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
}

function notificationCopy(outcome: Outcome, countryName: string, message: string) {
  if (outcome === "slot_found") {
    return {
      eventType: "slot_found",
      title: `${countryName} için uygun randevu tarihi bulundu`,
      message: message || "Uygun bir tarih tespit edildi. Ayrıntıları görmek için takip panelini aç.",
    };
  }

  return {
    eventType: "verification_required",
    title: `${countryName} takibinde doğrulama gerekiyor`,
    message: "Resmî sağlayıcı kullanıcı doğrulaması istiyor. Resmî sayfada işlemi tamamladıktan sonra kontrolü yeniden başlat.",
  };
}

function emailHtml(params: { title: string; message: string; actionUrl: string }) {
  const title = escapeHtml(params.title);
  const message = escapeHtml(params.message);
  const actionUrl = escapeHtml(params.actionUrl);
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f7fa;padding:32px 16px">
      <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dce5ec;border-radius:20px;padding:32px">
        <div style="display:inline-block;background:#071b33;color:#ffe08a;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:800">LETSGO2TRAVEL VİZE ASİSTANI</div>
        <h1 style="margin:20px 0 12px;color:#071b33;font-size:25px">${title}</h1>
        <p style="color:#52606d;line-height:1.65">${message}</p>
        <a href="${actionUrl}" style="display:inline-block;margin-top:16px;background:#f6c445;color:#071b33;text-decoration:none;font-weight:900;padding:14px 22px;border-radius:12px">Takip panelini aç</a>
        <p style="margin-top:24px;color:#88939e;font-size:12px;line-height:1.6">LetsGo2Travel doğrulama, CAPTCHA, SMS veya ödeme adımlarını atlamaz. Gerekli işlem resmî sağlayıcı ekranında tamamlanır.</p>
      </div>
    </div>`;
}

async function uploadEvidence(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  trackId: string,
  evidenceBase64?: string,
  evidenceMimeType?: string,
) {
  if (!evidenceBase64 || evidenceBase64.length > 2_800_000) return null;
  const contentType = evidenceMimeType === "image/png" ? "image/png" : "image/jpeg";

  try {
    const buffer = Buffer.from(evidenceBase64, "base64");
    if (buffer.length < 100 || buffer.length > 2_000_000) return null;
    const extension = contentType === "image/png" ? "png" : "jpg";
    const path = `${trackId}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, buffer, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      console.error("visa evidence upload", error.message);
      return null;
    }
    return `storage:${path}`;
  } catch (error) {
    console.error("visa evidence decode", error);
    return null;
  }
}

async function insertNotification(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from("visa_appointment_notifications").insert(payload);
  if (!error) return;

  // Aşama 2 SQL'i henüz çalıştırılmadıysa eski şemaya uyumlu kayıt bırak.
  const fallback = {
    track_id: payload.track_id,
    user_id: payload.user_id,
    channel: payload.channel,
    event_type: payload.event_type,
    status: payload.status,
    provider_message_id: payload.provider_message_id || null,
    error_message: payload.error_message || null,
    sent_at: payload.sent_at || null,
  };
  await supabase.from("visa_appointment_notifications").insert(fallback);
}

async function createNotifications(params: {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  track: {
    id: string;
    user_id: string;
    country_name: string;
    notify_email: boolean;
    notify_push: boolean;
    notify_in_app: boolean;
  };
  outcome: Outcome;
  message: string;
}) {
  if (!(["slot_found", "verification_required"] as Outcome[]).includes(params.outcome)) return;

  const actionUrl = `${getSiteUrl()}/vize-randevu`;
  const copy = notificationCopy(params.outcome, params.track.country_name, params.message);
  const common = {
    track_id: params.track.id,
    user_id: params.track.user_id,
    event_type: copy.eventType,
    title: copy.title,
    message: copy.message,
    action_url: actionUrl,
    metadata: { outcome: params.outcome },
  };

  if (params.track.notify_in_app) {
    await insertNotification(params.supabase, {
      ...common,
      channel: "in_app",
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  }

  if (params.track.notify_push) {
    await insertNotification(params.supabase, {
      ...common,
      channel: "push",
      status: "queued",
      error_message: "Cihaz push anahtarı bağlandığında gönderilecek.",
    });
  }

  if (params.track.notify_email) {
    const { data } = await params.supabase.auth.admin.getUserById(params.track.user_id);
    const email = data.user?.email;
    if (!email) {
      await insertNotification(params.supabase, {
        ...common,
        channel: "email",
        status: "failed",
        error_message: "Kullanıcı e-posta adresi bulunamadı.",
      });
      return;
    }

    const result = await sendMail({
      to: email,
      subject: copy.title,
      html: emailHtml({ title: copy.title, message: copy.message, actionUrl }),
      category: "visa_appointment",
      referenceId: params.track.id,
    });

    const isMock = result.providerId === "mock";
    await insertNotification(params.supabase, {
      ...common,
      channel: "email",
      status: result.success && !isMock ? "sent" : isMock ? "queued" : "failed",
      provider_message_id: result.providerId || null,
      error_message: isMock ? "RESEND_API_KEY tanımlı değil; e-posta kuyruğa alındı." : result.error || null,
      sent_at: result.success && !isMock ? new Date().toISOString() : null,
    });
  }
}

export async function POST(request: Request) {
  if (!authorizedVisaWorker(request)) return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as {
    trackId?: string;
    workerName?: string;
    outcome?: Outcome;
    message?: string;
    availableDates?: string[];
    evidenceUrl?: string;
    evidenceBase64?: string;
    evidenceMimeType?: string;
  };
  if (!body.trackId || !body.outcome || !OUTCOMES.includes(body.outcome)) {
    return NextResponse.json({ error: "Geçersiz rapor." }, { status: 400 });
  }
  const workerName = String(body.workerName || "").trim().slice(0, 80);
  if (!workerName) {
    return NextResponse.json({ error: "Worker adı zorunludur." }, { status: 400 });
  }

  const now = new Date();
  const regularNext = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const providerBackoff = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const nextStatus = body.outcome === "slot_found"
    ? "match_found"
    : body.outcome === "verification_required"
      ? "verification_required"
      : body.outcome === "error"
        ? "error"
        : "active";
  const nextCheckAt = body.outcome === "no_slots"
    ? regularNext
    : body.outcome === "provider_unavailable"
      ? providerBackoff
      : null;

  const { data: track, error: trackError } = await supabase
    .from("visa_appointment_tracks")
    .select("id,user_id,country_name,status,error_count,notify_email,notify_push,notify_in_app,earliest_date,latest_date,access_expires_at,locked_by")
    .eq("id", body.trackId)
    .maybeSingle();
  if (trackError) return NextResponse.json({ error: "Takip okunamadı." }, { status: 500 });
  if (!track) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });
  if (track.status !== "active" || track.locked_by !== workerName) {
    return NextResponse.json({ error: "Görev bu worker tarafından aktif olarak kilitlenmemiş." }, { status: 409 });
  }
  if (new Date(track.access_expires_at) <= now) {
    return NextResponse.json({ error: "Takip süresi dolmuş." }, { status: 409 });
  }

  const availableDates = cleanAvailableDates(body.availableDates, track.earliest_date, track.latest_date);
  if (body.outcome === "slot_found" && availableDates.length === 0) {
    return NextResponse.json({ error: "Uygun tarih sonucu geçerli bir tarih içermelidir." }, { status: 400 });
  }

  const uploadedEvidence = await uploadEvidence(supabase, track.id, body.evidenceBase64, body.evidenceMimeType);
  const evidenceReference = uploadedEvidence || safeEvidenceUrl(body.evidenceUrl);

  const { data: checkLog, error: logError } = await supabase
    .from("visa_appointment_check_logs")
    .insert({
      track_id: track.id,
      worker_name: workerName,
      outcome: body.outcome,
      message: String(body.message || "").slice(0, 1000) || null,
      available_dates: availableDates,
      evidence_url: evidenceReference,
      checked_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (logError) return NextResponse.json({ error: "Kontrol kaydı yazılamadı." }, { status: 500 });

  let matchId: string | null = null;
  if (body.outcome === "slot_found") {
    const { data: match, error: matchError } = await supabase
      .from("visa_appointment_matches")
      .insert({
        track_id: track.id,
        user_id: track.user_id,
        available_dates: availableDates,
        provider_message: String(body.message || "").slice(0, 1000) || null,
        evidence_url: evidenceReference,
        expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (matchError) {
      if (checkLog?.id) {
        await supabase.from("visa_appointment_check_logs").delete().eq("id", checkLog.id);
      }
      return NextResponse.json({ error: "Uygun tarih kaydı yazılamadı." }, { status: 500 });
    }
    matchId = match.id;
  }

  const shouldNotify =
    (body.outcome === "slot_found" && track.status !== "match_found") ||
    (body.outcome === "verification_required" && track.status !== "verification_required");

  const { data: updatedTrack, error } = await supabase.from("visa_appointment_tracks").update({
    status: nextStatus,
    last_checked_at: now.toISOString(),
    next_check_at: nextCheckAt,
    last_result: String(body.message || body.outcome).slice(0, 500),
    error_count: body.outcome === "error" ? Number(track.error_count || 0) + 1 : 0,
    locked_until: null,
    locked_by: null,
  })
    .eq("id", track.id)
    .eq("status", "active")
    .eq("locked_by", workerName)
    .select("id")
    .maybeSingle();

  if (error || !updatedTrack) {
    const cleanupTasks: PromiseLike<unknown>[] = [];
    if (matchId) {
      cleanupTasks.push(supabase.from("visa_appointment_matches").delete().eq("id", matchId));
    }
    if (checkLog?.id) {
      cleanupTasks.push(supabase.from("visa_appointment_check_logs").delete().eq("id", checkLog.id));
    }
    await Promise.allSettled(cleanupTasks);
    return NextResponse.json(
      { error: error ? "Takip sonucu kaydedilemedi." : "Takip durumu değişti; eski worker sonucu uygulanmadı." },
      { status: error ? 500 : 409 },
    );
  }

  if (shouldNotify) {
    await createNotifications({
      supabase,
      track,
      outcome: body.outcome,
      message: String(body.message || ""),
    });
  }

  return NextResponse.json({ success: true });
}
