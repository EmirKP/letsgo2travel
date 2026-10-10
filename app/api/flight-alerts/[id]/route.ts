import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveAlertDeliveryState, verifyAlertToken } from "@/lib/price-alerts";
import { isPastTravelDate, isValidTimeZone, sanitizeTimeZone } from "@/lib/date-utils";

const PATCH_FIELDS = new Set(["is_active", "target_price", "threshold_percent", "notify_email", "notify_push", "restore", "timeZone"]);
const RESTORE_WINDOW_MS = 60_000;

function validOptionalPrice(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10_000_000);
}

function validThreshold(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 90;
}

async function getCurrentUser(request: Request, supabase: any) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

async function assertAlertAccess(request: Request, supabase: any, id: string, token?: string | null) {
  const { data: alertData, error: fetchError } = await supabase
    .from("flight_price_alerts")
    .select("user_id, manage_token_hash, manage_token_expires_at, is_active, notify_email, notify_push, departure_date, status, cancelled_at")
    .eq("id", id)
    .single();

  if (fetchError || !alertData) return { ok: false, status: 404, error: "Alarm bulunamadı." };

  if (alertData.user_id) {
    const currentUser = await getCurrentUser(request, supabase);
    if (!currentUser) return { ok: false, status: 401, error: "Oturum gerekli." };
    if (alertData.user_id !== currentUser.id) return { ok: false, status: 403, error: "Yetkisiz işlem." };
    return { ok: true, alertData };
  }

  if (!token) return { ok: false, status: 401, error: "Token eksik." };
  const validToken = verifyAlertToken({
    plainToken: token,
    storedHash: alertData.manage_token_hash,
    expiresAt: alertData.manage_token_expires_at,
  });
  if (!validToken) return { ok: false, status: 401, error: "Geçersiz veya süresi dolmuş token." };
  return { ok: true, alertData };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Fiyat alarmı servisi şu anda kullanılamıyor." }, { status: 503 });

  try {
    const resolvedParams = await params;
    const body = await request.json() as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || typeof body !== "object") {
      return NextResponse.json({ error: "Geçersiz güncelleme isteği." }, { status: 400 });
    }
    const fields = Object.keys(body);
    if (!fields.some((field) => field !== "timeZone") || fields.some((field) => !PATCH_FIELDS.has(field))) {
      return NextResponse.json({ error: "Desteklenmeyen güncelleme alanı." }, { status: 400 });
    }
    const { is_active, target_price, threshold_percent, notify_email, notify_push, restore, timeZone } = body;
    if (restore !== undefined && restore !== true) {
      return NextResponse.json({ error: "Geçersiz geri alma isteği." }, { status: 400 });
    }
    if (timeZone !== undefined && (typeof timeZone !== "string" || !isValidTimeZone(timeZone))) {
      return NextResponse.json({ error: "Geçersiz saat dilimi." }, { status: 400 });
    }
    if (is_active !== undefined && typeof is_active !== "boolean") {
      return NextResponse.json({ error: "Alarm durumu true veya false olmalıdır." }, { status: 400 });
    }
    if (target_price !== undefined && !validOptionalPrice(target_price)) {
      return NextResponse.json({ error: "Hedef fiyat 1 ile 10.000.000 arasında olmalı veya boş bırakılmalıdır." }, { status: 400 });
    }
    if (threshold_percent !== undefined && !validThreshold(threshold_percent)) {
      return NextResponse.json({ error: "Düşüş yüzdesi 1 ile 90 arasında olmalıdır." }, { status: 400 });
    }
    if (notify_email !== undefined && typeof notify_email !== "boolean") {
      return NextResponse.json({ error: "E-posta bildirimi true veya false olmalıdır." }, { status: 400 });
    }
    if (notify_push !== undefined && typeof notify_push !== "boolean") {
      return NextResponse.json({ error: "Push bildirimi true veya false olmalıdır." }, { status: 400 });
    }
    const access = await assertAlertAccess(request, supabase, resolvedParams.id);

    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const deleted = Boolean(access.alertData.cancelled_at) || access.alertData.status === "cancelled";
    if (restore === true) {
      const deletedAt = Date.parse(access.alertData.cancelled_at || "");
      if (!deleted || !Number.isFinite(deletedAt) || Date.now() - deletedAt > RESTORE_WINDOW_MS || deletedAt > Date.now()) {
        return NextResponse.json({ error: "Bu alarm için geri alma süresi doldu." }, { status: 409 });
      }
      if (fields.some((field) => !["restore", "is_active", "timeZone"].includes(field))) {
        return NextResponse.json({ error: "Geri alma başka bir güncellemeyle birleştirilemez." }, { status: 400 });
      }
    } else if (deleted) {
      return NextResponse.json({ error: "Bu alarm silinmiş. Listeyi yenile." }, { status: 410 });
    }
    if (is_active === true && isPastTravelDate(access.alertData.departure_date, sanitizeTimeZone(timeZone))) {
      return NextResponse.json({ error: "Gidiş tarihi geçtiği için bu alarm yeniden başlatılamaz. Yeni bir tarih için alarm oluştur." }, { status: 409 });
    }

    const delivery = resolveAlertDeliveryState(access.alertData, {
      is_active: is_active as boolean | undefined,
      notify_email: notify_email as boolean | undefined,
      notify_push: notify_push as boolean | undefined,
    });
    if (!delivery.valid) {
      return NextResponse.json(
        { error: "Aktif bir fiyat alarmında en az bir bildirim kanalı açık olmalıdır (e-posta veya telefon bildirimi)." },
        { status: 400 },
      );
    }

    const updatePayload: Record<string, unknown> = {};
    if (restore === true) {
      updatePayload.cancelled_at = null;
      updatePayload.is_active = is_active === true;
      updatePayload.status = is_active === true ? "active" : "paused";
    }
    if (is_active !== undefined) {
      updatePayload.is_active = is_active;
      updatePayload.status = is_active ? "active" : "paused";
    }
    if (target_price !== undefined) updatePayload.target_price = target_price;
    if (threshold_percent !== undefined) updatePayload.threshold_percent = threshold_percent;
    if (notify_email !== undefined) updatePayload.notify_email = notify_email;
    if (notify_push !== undefined) updatePayload.notify_push = notify_push;

    // Kanal değişikliklerini karşılaştırmalı güncelle: iki paralel istek aynı
    // anda e-posta ve push'u kapatmaya çalışırsa yalnızca ilk snapshot eşleşir,
    // ikincisi 409 alır. Böylece doğrulama ile UPDATE arasındaki yarış aktif
    // alarmı kanalsız bırakamaz.
    let updateQuery = supabase
      .from("flight_price_alerts")
      .update(updatePayload)
      .eq("id", resolvedParams.id);
    updateQuery = restore === true
      ? updateQuery.eq("cancelled_at", access.alertData.cancelled_at)
      : updateQuery.is("cancelled_at", null);
    for (const field of ["is_active", "notify_email", "notify_push"] as const) {
      const currentValue = access.alertData[field];
      updateQuery = currentValue === null || currentValue === undefined
        ? updateQuery.is(field, null)
        : updateQuery.eq(field, currentValue);
    }
    const { data: updatedRows, error: updateError } = await updateQuery.select("id");

    if (updateError) {
      return NextResponse.json({ error: "Güncelleme başarısız." }, { status: 500 });
    }
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Alarm başka bir işlemde değişti. Güncel durumu yenileyip tekrar dene." },
        { status: 409 },
      );
    }

    const warnings = !delivery.active && !delivery.email && !delivery.push
      ? ["Alarm duraklatıldı ve bildirim kanalı seçili değil. Yeniden başlatmadan önce e-posta veya telefon bildirimini açmalısın."]
      : [];

    return NextResponse.json({ success: true, message: restore === true ? "Alarm geri alındı." : "Alarm güncellendi.", warnings });
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Fiyat alarmı servisi şu anda kullanılamıyor." }, { status: 503 });

  try {
    const resolvedParams = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const access = await assertAlertAccess(request, supabase, resolvedParams.id, token);

    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Retried DELETEs must not extend the undo deadline.
    if (access.alertData.cancelled_at) {
      return NextResponse.json({ success: true, message: "Alarm silindi." });
    }
    const { data: deletedRows, error: updateError } = await supabase
      .from("flight_price_alerts")
      .update({ is_active: false, status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", resolvedParams.id)
      .is("cancelled_at", null)
      .select("id");

    if (updateError) {
      return NextResponse.json({ error: "Alarm silinemedi. Tekrar dene." }, { status: 500 });
    }
    if (!deletedRows?.length) {
      return NextResponse.json({ error: "Alarm değişti. Listeyi yenileyip tekrar dene." }, { status: 409 });
    }
    return NextResponse.json({ success: true, message: "Alarm silindi." });
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
}
