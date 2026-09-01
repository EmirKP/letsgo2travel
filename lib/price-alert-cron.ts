import { getSupabaseAdmin } from "./supabaseAdmin";
import { fetchCheapestPrice } from "./travelpayouts";
import { sendMailAndLog, generatePriceDropEmailHtml } from "./mail";
import {
  buildAlertEventKey,
  buildPriceDropPushMessage,
  classifyPushFailure,
  makeAlertDashboardLink,
  priceAlertSubject,
  shouldNotifyForPrice,
} from "./price-alerts";
import { isPushConfigured as isPushProviderConfigured, sendPushToUser } from "./push";

type PriceAlertRow = Record<string, any>;

// ---------------------------------------------------------------------
// Bildirim teslim kuralları (v3) + zaman bütçesi (v4):
// - RETRY KUYRUĞU ile YENİ FİYAT OLAYI TESPİTİ mantıksal olarak AYRIDIR.
//   Alarm düzeyindeki 24 saat cooldown'u (last_notified_at /
//   last_notified_price) yalnız YENİ olay tespitini sınırlar; bekleyen/
//   başarısız kanalın yeniden denenmesini ASLA durdurmaz. Fiyat sonraki
//   cron'da değişse bile eski olayın kaydı, satırdaki snapshot
//   (event_price/event_currency) ile kontrollü şekilde tamamlanır.
// - Claim ATOMİKTİR (claim_alert_notification RPC) ve FENCING token'ı
//   döndürür: sonuç yazımı yalnız kendi token'ı + hâlâ 'pending' satırda
//   yapılır; lease'i devralınan eski worker yeni claim'in sonucunu ezemez.
// - 'sent' kanal aynı olay için bir daha ASLA gönderilmez. Transient
//   başarısız kanal en fazla MAX_ATTEMPTS kez denenir; permanent asla.
//   Süresi geçen 'pending' de attempt sınırına tabidir.
// - Push sağlayıcısı PLATFORM BAZLI kontrol edilir (iOS→APNs,
//   Android→FCM). Yapılandırılmış sağlayıcısı olan en az bir aktif cihaz
//   yoksa olay CLAIM EDİLMEZ (tüketilmez).
// - Alarm cooldown alanları DB'de ATOMİK ve MONOTONİK güncellenir
//   (mark_alert_notified RPC): geç tamamlanan eski bir retry,
//   last_notified_price'ı asla YÜKSELTEMEZ, last_notified_at geriye gitmez.
// - ZAMAN BÜTÇESİ (v4): cron route'un 60 sn sınırına karşı ~48 sn'lik
//   SOFT DEADLINE kullanılır. Deadline'a ulaşılınca YENİ provider çağrısı
//   ve YENİ claim başlatılmaz; claim edilmemiş işler attempt HARCAMADAN
//   sonraki cron'a kalır (deferred). Retry kuyruğu zamanı gelen EN ESKİ
//   kayıttan başlar ve batch sınırlıdır; fiyat grupları KÜÇÜK bir
//   concurrency ile işlenir; provider çağrısının kontrollü timeout'u vardır.
// ---------------------------------------------------------------------
const MAX_ATTEMPTS = 3;
const PENDING_TTL_SECONDS = 600;
const RETRY_DELAY_SECONDS = 900;
const SOFT_DEADLINE_MS = 48_000; // 45-50 sn bandı (route maxDuration=60)
const RETRY_BATCH_LIMIT = 40;
const GROUP_CONCURRENCY = 3;
const PROVIDER_TIMEOUT_MS = 8_000;

type PushPlatform = "ios" | "android";
type PushConfig = { apns: boolean; fcm: boolean };
type NotificationChannel = "email" | "push";

type PriceAlertCheckDetail = {
  key: string;
  processed: number;
  price?: number | null;
  status: "checked" | "no_price" | "group_error";
  notified?: number;
  errors?: number;
  message?: string;
};

export type PriceAlertCronDeps = {
  supabase?: any;
  fetchPrice?: typeof fetchCheapestPrice;
  sendMail?: typeof sendMailAndLog;
  sendPush?: typeof sendPushToUser;
  /** Test/enjeksiyon: e-posta sağlayıcısı yapılandırılmış mı? */
  isEmailConfigured?: () => boolean;
  /** Test/enjeksiyon: push sağlayıcı yapılandırması (platform bazlı). */
  pushConfig?: () => PushConfig;
  /** Test/enjeksiyon: soft deadline (ms). Varsayılan 48 sn. */
  softDeadlineMs?: number;
};

export type PriceAlertCheckResult = {
  success: boolean;
  processedGroups: number;
  processedAlerts: number;
  notifiedAlerts: number;
  errorAlerts: number;
  /** Retry kuyruğundan bu koşuda claim edilip sonuçlandırılan kayıt sayısı. */
  retryProcessed: number;
  /** Retry kuyruğundan bu koşuda BAŞARIYLA gönderilen kayıt sayısı. */
  retrySent: number;
  /** Bu koşuda tamamlanan iş (retry kaydı + değerlendirilen alarm). */
  processed: number;
  /** Deadline/batch sınırı nedeniyle attempt HARCAMADAN sonraki cron'a kalan iş. */
  deferred: number;
  /** Soft deadline'a ulaşıldı mı? */
  deadlineReached: boolean;
  details: PriceAlertCheckDetail[];
  startedAt: string;
  finishedAt: string;
};

function makeGroupKey(alert: PriceAlertRow) {
  return [
    alert.origin_code,
    alert.destination_code,
    alert.departure_date,
    alert.return_date || "oneway",
    alert.currency || "TRY",
    alert.trip_type || "one_way",
    alert.cabin_class || "economy",
  ].join("_");
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function markNoPrice(params: {
  supabase: any;
  group: PriceAlertRow[];
  now: string;
  message: string;
}) {
  const { supabase, group, now, message } = params;
  let errorAlerts = 0;

  await Promise.all(group.map(async (alert) => {
    const errorCount = Number(alert.error_count || 0) + 1;
    const isHardError = errorCount >= 3;
    if (isHardError) errorAlerts += 1;

    await Promise.all([
      supabase.from("flight_price_alerts").update({
        status: isHardError ? "error" : "active",
        last_checked_at: now,
        last_error_at: now,
        last_error_message: message,
        error_count: errorCount,
      }).eq("id", alert.id),
      supabase.from("flight_price_alert_logs").insert({
        alert_id: alert.id,
        status: isHardError ? "no_price_error" : "no_price_retry",
        error_message: message,
        checked_at: now,
      }),
    ]);
  }));

  return errorAlerts;
}

/**
 * Atomik kanal claim'i. Başarılıysa fencing için claim token döner;
 * claim edilemediyse null. Snapshot alanları yalnız İLK kayıtta yazılır
 * (SQL fonksiyonu reclaim'de snapshot'ı ezmez).
 */
async function claimNotification(
  supabase: any,
  params: {
    alertId: string;
    channel: NotificationChannel;
    eventKey: string;
    eventPrice?: number | null;
    eventCurrency?: string | null;
  },
): Promise<string | null> {
  const { data, error } = await supabase.rpc("claim_alert_notification", {
    p_alert_id: params.alertId,
    p_channel: params.channel,
    p_event_key: params.eventKey,
    p_max_attempts: MAX_ATTEMPTS,
    p_pending_ttl_seconds: PENDING_TTL_SECONDS,
    p_event_price: params.eventPrice ?? null,
    p_event_currency: params.eventCurrency ?? null,
  });
  if (error) throw new Error(error.message || "Bildirim claim edilemedi.");
  return typeof data === "string" && data.length > 0 ? data : null;
}

/**
 * Claim sonucunu yazar. FENCING: yalnız kendi claim_token'ı VE hâlâ
 * 'pending' olan satır güncellenir; böylece lease'i süresi geçtiği için
 * devralınan eski bir worker, yeni claim'in 'sent'/'failed' sonucunu
 * EZEMEZ (güncelleme 0 satıra dokunur).
 */
export async function settleAlertNotification(
  supabase: any,
  ref: { alertId: string; channel: NotificationChannel; eventKey: string },
  claimToken: string,
  outcome: {
    ok: boolean;
    providerId?: string | null;
    errorMessage?: string | null;
    failureKind?: "transient" | "permanent";
  },
) {
  const failureKind = outcome.ok ? null : (outcome.failureKind || "transient");
  await supabase
    .from("flight_price_alert_notifications")
    .update({
      status: outcome.ok ? "sent" : "failed",
      provider_id: outcome.providerId || null,
      error_message: outcome.errorMessage ? String(outcome.errorMessage).slice(0, 300) : null,
      failure_kind: failureKind,
      next_retry_at: failureKind === "transient"
        ? new Date(Date.now() + RETRY_DELAY_SECONDS * 1000).toISOString()
        : null,
    })
    .eq("alert_id", ref.alertId)
    .eq("channel", ref.channel)
    .eq("event_key", ref.eventKey)
    .eq("claim_token", claimToken)
    .eq("status", "pending");
}

/** Bildirim kaydından olay snapshot'ını çözer (kolon yoksa event_key'den). */
function resolveEventSnapshot(notif: PriceAlertRow): { price: number | null; currency: string } {
  if (notif.event_price != null && Number.isFinite(Number(notif.event_price))) {
    return { price: Number(notif.event_price), currency: notif.event_currency || "TRY" };
  }
  const parts = String(notif.event_key || "").split(":");
  const price = parts.length >= 3 ? Number(parts[1]) : NaN;
  if (Number.isFinite(price)) return { price, currency: parts[2] || "TRY" };
  return { price: null, currency: "TRY" };
}

/**
 * Kullanıcının aktif cihazlarını PLATFORM BAZLI sağlayıcı yapılandırmasıyla
 * eşler: iOS cihaz için APNs, Android cihaz için FCM ayrı ayrı kontrol
 * edilir. Yapılandırılmış sağlayıcısı olan en az bir aktif cihaz yoksa
 * push claim edilmemelidir (olay tüketilmez).
 */
async function getPushEligibility(supabase: any, userId: string, cfg: PushConfig) {
  const { data: devices, error } = await supabase
    .from("push_devices")
    .select("id, platform")
    .eq("user_id", userId)
    .eq("enabled", true)
    .limit(20);
  if (error) {
    return { queryError: true, enabledCount: 0, eligiblePlatforms: [] as PushPlatform[] };
  }
  const rows = (devices || []) as Array<{ platform: PushPlatform }>;
  const present = new Set(rows.map((d) => d.platform));
  const eligiblePlatforms: PushPlatform[] = [];
  if (present.has("ios") && cfg.apns) eligiblePlatforms.push("ios");
  if (present.has("android") && cfg.fcm) eligiblePlatforms.push("android");
  return { queryError: false, enabledCount: rows.length, eligiblePlatforms };
}

async function deliverEmailForEvent(params: {
  supabase: any;
  sendMail: any;
  alert: PriceAlertRow;
  newPrice: number;
  basePrice: number;
}): Promise<{ ok: boolean; providerId?: string | null; error?: string | null }> {
  const { alert } = params;
  const subject = priceAlertSubject({
    originLabel: alert.origin_label || alert.origin_code,
    destinationLabel: alert.destination_label || alert.destination_code,
    type: "drop",
  });
  const html = generatePriceDropEmailHtml({
    originLabel: alert.origin_label || alert.origin_code,
    destinationLabel: alert.destination_label || alert.destination_code,
    departureDate: alert.departure_date,
    basePrice: params.basePrice,
    newPrice: params.newPrice,
    ctaLink: makeAlertDashboardLink(),
    unsubscribeLink: makeAlertDashboardLink(),
  });
  const mailRes = await params.sendMail({
    supabase: params.supabase,
    to: alert.email,
    subject,
    html,
    category: "price_alert_drop",
    referenceType: "flight_price_alert",
    referenceId: alert.id,
  });
  const ok = Boolean(mailRes.success) && mailRes.providerId !== "mock";
  return { ok, providerId: mailRes.providerId, error: ok ? null : (mailRes.error || "Fiyat düşüş maili gönderilemedi.") };
}

async function deliverPushForEvent(params: {
  supabase: any;
  sendPush: any;
  alert: PriceAlertRow;
  platforms: PushPlatform[];
}): Promise<{ ok: boolean; attempted: number; failureKind: "transient" | "permanent"; errorMessage: string | null; summary: any }> {
  const { alert } = params;
  const message = buildPriceDropPushMessage({
    originLabel: alert.origin_label || alert.origin_code,
    destinationLabel: alert.destination_label || alert.destination_code,
    departureDate: alert.departure_date,
  });
  const summary = await params.sendPush(params.supabase, alert.user_id, message, undefined, { platforms: params.platforms });
  const ok = summary.sent > 0;
  const reasons = (summary.errors || []).map((e: { reason: string }) => e.reason);
  const allPermanent = reasons.length > 0 && reasons.every((r: string) => classifyPushFailure(r).shouldDisableToken);
  return {
    ok,
    attempted: summary.attempted || 0,
    failureKind: allPermanent ? "permanent" : "transient",
    errorMessage: ok ? null : (summary.attempted === 0 ? "no_enabled_device" : reasons.join(",")),
    summary,
  };
}

/**
 * Başarılı gönderim sonrası alarm cooldown alanları. DB'de ATOMİK ve
 * MONOTONİK çalışır (mark_alert_notified RPC; SECURITY DEFINER,
 * service-role-only): last_notified_price = least(mevcut, olay fiyatı) —
 * geç tamamlanan eski bir retry, daha düşük yeni fiyatı ASLA yükseltemez;
 * last_notified_at geriye gitmez. Uygulama belleğindeki eski (stale)
 * alert nesnesinden okunan hiçbir değer yazılmaz.
 */
async function markAlertNotified(supabase: any, alertId: string, eventPrice: number, nowIso: string) {
  const { error } = await supabase.rpc("mark_alert_notified", {
    p_alert_id: alertId,
    p_event_price: eventPrice,
    p_notified_at: nowIso,
  });
  if (error) {
    // Cooldown güncellenemese bile gönderim kaydı (notifications) doğru;
    // bir sonraki başarılı gönderim alanları düzeltir.
    console.error("mark_alert_notified hatasi:", error.code || "unknown");
  }
}

/**
 * RETRY KUYRUĞU: transient-başarısız ve süresi geçmiş pending kanal
 * kayıtlarını, YENİ fiyat olayı tespitinden BAĞIMSIZ olarak tamamlar.
 * Zamanı gelen EN ESKİ kayıttan başlar; batch RETRY_BATCH_LIMIT ile
 * sınırlıdır; soft deadline'a ulaşılınca YENİ claim açılmaz ve kalan
 * kayıtlar attempt HARCAMADAN sonraki cron'a kalır (deferred).
 */
async function processRetryQueue(params: {
  supabase: any;
  sendMail: any;
  sendPush: any;
  emailConfigured: boolean;
  pushCfg: PushConfig;
  pastDeadline: () => boolean;
}): Promise<{ processed: number; sent: number; deferred: number; deadlineReached: boolean }> {
  const { supabase, sendMail, sendPush, emailConfigured, pushCfg, pastDeadline } = params;
  const stats = { processed: 0, sent: 0, deferred: 0, deadlineReached: false };
  const nowMs = Date.now();

  const [failedRes, pendingRes] = await Promise.all([
    supabase
      .from("flight_price_alert_notifications")
      .select("*")
      .eq("status", "failed")
      .eq("failure_kind", "transient")
      .lt("attempt_count", MAX_ATTEMPTS)
      .limit(100),
    supabase
      .from("flight_price_alert_notifications")
      .select("*")
      .eq("status", "pending")
      .lt("attempt_count", MAX_ATTEMPTS)
      .limit(100),
  ]);
  if (failedRes.error || pendingRes.error) return stats;

  // Aday + vade zamanı: zamanı gelen EN ESKİ kayıt önce işlenir.
  const candidates: Array<{ row: PriceAlertRow; dueAt: number }> = [];
  for (const row of (failedRes.data || []) as PriceAlertRow[]) {
    const retryAt = row.next_retry_at ? Date.parse(row.next_retry_at) : 0;
    if (!retryAt || retryAt <= nowMs) {
      candidates.push({ row, dueAt: retryAt || (row.last_attempt_at ? Date.parse(row.last_attempt_at) : 0) });
    }
  }
  for (const row of (pendingRes.data || []) as PriceAlertRow[]) {
    const lastAttempt = row.last_attempt_at ? Date.parse(row.last_attempt_at) : 0;
    if (!lastAttempt || lastAttempt < nowMs - PENDING_TTL_SECONDS * 1000) {
      candidates.push({ row, dueAt: lastAttempt ? lastAttempt + PENDING_TTL_SECONDS * 1000 : 0 });
    }
  }
  candidates.sort((a, b) => a.dueAt - b.dueAt);

  let batch = candidates;
  if (candidates.length > RETRY_BATCH_LIMIT) {
    stats.deferred += candidates.length - RETRY_BATCH_LIMIT;
    batch = candidates.slice(0, RETRY_BATCH_LIMIT);
  }

  for (let i = 0; i < batch.length; i += 1) {
    // Deadline kontrolü CLAIM'den ÖNCE: ertelenen kayıt attempt harcamaz.
    if (pastDeadline()) {
      stats.deadlineReached = true;
      stats.deferred += batch.length - i;
      break;
    }
    const notif = batch[i].row;
    const channel = notif.channel as NotificationChannel;
    const ref = { alertId: notif.alert_id, channel, eventKey: notif.event_key };

    const { data: alertRows } = await supabase
      .from("flight_price_alerts")
      .select("*")
      .eq("id", notif.alert_id)
      .limit(1);
    const alert: PriceAlertRow | null = (alertRows && alertRows[0]) || null;

    // Kanal KALICI olarak gönderilemez durumda mı? (alarm silinmiş/pasif,
    // kanal kapatılmış, push için kullanıcı yok) -> claim + kalıcı kapanış.
    const permanentReason = !alert
      ? "alert_missing"
      : alert.is_active === false
        ? "alert_inactive"
        : channel === "email" && !alert.notify_email
          ? "channel_disabled"
          : channel === "push" && (!alert.notify_push || !alert.user_id)
            ? "channel_disabled"
            : null;

    // Sağlayıcı GEÇİCİ olarak hazır değilse claim ETME: kayıt kuyrukta
    // kalır; sağlayıcı/cihaz hazır olunca gönderilir (olay tüketilmez).
    let eligiblePlatforms: PushPlatform[] = [];
    if (!permanentReason && alert) {
      if (channel === "email") {
        if (!emailConfigured) continue;
      } else {
        const eligibility = await getPushEligibility(supabase, alert.user_id, pushCfg);
        if (eligibility.queryError || eligibility.eligiblePlatforms.length === 0) continue;
        eligiblePlatforms = eligibility.eligiblePlatforms;
      }
    }

    let claimToken: string | null = null;
    try {
      claimToken = await claimNotification(supabase, { alertId: ref.alertId, channel, eventKey: ref.eventKey });
    } catch {
      continue;
    }
    if (!claimToken) continue;
    stats.processed += 1;

    if (permanentReason || !alert) {
      await settleAlertNotification(supabase, ref, claimToken, {
        ok: false,
        failureKind: "permanent",
        errorMessage: permanentReason || "alert_missing",
      });
      continue;
    }

    const snapshot = resolveEventSnapshot(notif);
    if (snapshot.price === null) {
      await settleAlertNotification(supabase, ref, claimToken, {
        ok: false,
        failureKind: "permanent",
        errorMessage: "event_snapshot_missing",
      });
      continue;
    }

    const nowIso = new Date().toISOString();
    if (channel === "email") {
      const outcome = await deliverEmailForEvent({
        supabase,
        sendMail,
        alert,
        newPrice: snapshot.price,
        basePrice: Number(alert.base_price || snapshot.price),
      });
      await settleAlertNotification(supabase, ref, claimToken, {
        ok: outcome.ok,
        providerId: outcome.providerId,
        errorMessage: outcome.error,
        failureKind: "transient",
      });
      await supabase.from("flight_price_alert_logs").insert({
        alert_id: alert.id,
        status: outcome.ok ? "email_retry_sent" : "email_retry_failed",
        price: snapshot.price,
        currency: snapshot.currency,
        error_message: outcome.ok ? null : outcome.error,
        checked_at: nowIso,
      });
      if (outcome.ok) {
        stats.sent += 1;
        await markAlertNotified(supabase, alert.id, snapshot.price, nowIso);
      }
    } else {
      const push = await deliverPushForEvent({ supabase, sendPush, alert, platforms: eligiblePlatforms });
      await settleAlertNotification(supabase, ref, claimToken, {
        ok: push.ok,
        providerId: null,
        errorMessage: push.errorMessage,
        failureKind: push.failureKind,
      });
      await supabase.from("flight_price_alert_logs").insert({
        alert_id: alert.id,
        status: push.ok ? "push_retry_sent" : "push_retry_failed",
        price: snapshot.price,
        currency: snapshot.currency,
        error_message: push.ok ? null : String(push.errorMessage || "").slice(0, 300),
        checked_at: nowIso,
      });
      if (push.ok) {
        stats.sent += 1;
        await markAlertNotified(supabase, alert.id, snapshot.price, nowIso);
      }
    }
  }

  return stats;
}

export async function runPriceAlertCheck(options?: { limit?: number; deps?: PriceAlertCronDeps }): Promise<PriceAlertCheckResult> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const deps = options?.deps || {};
  const fetchPrice = deps.fetchPrice || fetchCheapestPrice;
  const sendMail = deps.sendMail || sendMailAndLog;
  const sendPush = deps.sendPush || sendPushToUser;
  const emailConfigured = deps.isEmailConfigured ? deps.isEmailConfigured() : Boolean(process.env.RESEND_API_KEY);
  const pushCfg: PushConfig = deps.pushConfig
    ? deps.pushConfig()
    : (() => { const c = isPushProviderConfigured(); return { apns: c.apns, fcm: c.fcm }; })();
  const softDeadlineMs = deps.softDeadlineMs ?? SOFT_DEADLINE_MS;
  const deadlineAt = startedMs + softDeadlineMs;
  const pastDeadline = () => Date.now() >= deadlineAt;
  const supabase = deps.supabase || getSupabaseAdmin();

  if (!supabase) {
    throw new Error("Supabase admin bağlantısı kurulamadı.");
  }

  let deadlineReached = false;
  let deferred = 0;

  // 1) RETRY KUYRUĞU: yeni olay tespitinden BAĞIMSIZ çalışır; alarm
  //    cooldown'u bekleyen/başarısız kanal retry'ını durdurmaz.
  const retryStats = await processRetryQueue({ supabase, sendMail, sendPush, emailConfigured, pushCfg, pastDeadline });
  deadlineReached = deadlineReached || retryStats.deadlineReached;
  deferred += retryStats.deferred;

  // 2) YENİ FİYAT OLAYI TESPİTİ
  const { data: activeAlerts, error: alertsError } = await supabase
    .from("flight_price_alerts")
    .select("*")
    .eq("is_active", true)
    .or("notify_email.eq.true,notify_push.eq.true")
    .in("status", ["active", "triggered", "error"])
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(options?.limit || 80);

  if (alertsError) {
    throw new Error(alertsError.message || "Fiyat alarmları okunamadı.");
  }

  const finishResult = (extra: {
    processedGroups: number;
    processedAlerts: number;
    notifiedAlerts: number;
    errorAlerts: number;
    details: PriceAlertCheckDetail[];
  }): PriceAlertCheckResult => ({
    success: true,
    processedGroups: extra.processedGroups,
    processedAlerts: extra.processedAlerts,
    notifiedAlerts: extra.notifiedAlerts,
    errorAlerts: extra.errorAlerts,
    retryProcessed: retryStats.processed,
    retrySent: retryStats.sent,
    processed: retryStats.processed + extra.processedAlerts,
    deferred,
    deadlineReached,
    details: extra.details,
    startedAt,
    finishedAt: new Date().toISOString(),
  });

  if (!activeAlerts || activeAlerts.length === 0) {
    return finishResult({ processedGroups: 0, processedAlerts: 0, notifiedAlerts: 0, errorAlerts: 0, details: [] });
  }

  const groupedAlerts: Record<string, PriceAlertRow[]> = {};
  for (const alert of activeAlerts) {
    const key = makeGroupKey(alert);
    if (!groupedAlerts[key]) groupedAlerts[key] = [];
    groupedAlerts[key].push(alert);
  }

  const details: PriceAlertCheckDetail[] = [];
  const now = new Date().toISOString();
  let processedAlerts = 0;
  let notifiedAlerts = 0;
  let errorAlerts = 0;

  async function processGroup(key: string) {
    const group = groupedAlerts[key];
    const sample = group[0];

    try {
      const priceInfo = await withTimeout(
        Promise.resolve(fetchPrice({
          origin: sample.origin_code,
          destination: sample.destination_code,
          departDate: sample.departure_date,
          returnDate: sample.return_date,
          currency: sample.currency || "TRY",
        })),
        PROVIDER_TIMEOUT_MS,
        "Travelpayouts fiyat isteği zaman aşımına uğradı.",
      );

      if (!priceInfo) {
        const message = "Travelpayouts fiyat verisi bulunamadı veya API cevap vermedi.";
        const groupErrors = await markNoPrice({ supabase, group, now, message });
        errorAlerts += groupErrors;
        processedAlerts += group.length;
        details.push({ key, status: "no_price", processed: group.length, errors: groupErrors, message });
        return;
      }

      const currentPrice = Number(priceInfo.price);
      let groupNotified = 0;
      let groupErrors = 0;
      let groupProcessed = 0;

      for (const alert of group) {
        // Deadline: bu alarmın bildirim işi HİÇ başlatılmaz (claim yok,
        // attempt yok); alarm sonraki cron'da güvenle işlenir.
        if (pastDeadline()) {
          deadlineReached = true;
          deferred += 1;
          continue;
        }
        groupProcessed += 1;
        processedAlerts += 1;

        let logStatus = "price_checked";
        let notifySent = false;
        let mailError: string | null = null;
        let newLowestPrice = alert.lowest_price_seen;
        let updatedBasePrice = alert.base_price;

        if (!newLowestPrice || currentPrice < Number(newLowestPrice)) newLowestPrice = currentPrice;
        if (!updatedBasePrice) updatedBasePrice = currentPrice;

        const shouldNotify = shouldNotifyForPrice({
          alert,
          currentPrice,
          basePrice: Number(updatedBasePrice),
          now: new Date(now),
        });

        // Kanal bazli, ATOMIK claim'li bildirim. Kanal hazir degilse
        // (saglayici yapilandirilmamis / uygun aktif cihaz yok) olay
        // CLAIM EDILMEZ; yanlislikla tuketilmez. Bir kanalin
        // basarisizligi diger kanali engellemez; basarisiz kanalin
        // yeniden denemesi RETRY KUYRUGU'ndadir (yukarida, adim 1).
        let pushError: string | null = null;
        const eventCurrency = priceInfo.currency || alert.currency || "TRY";
        const eventKey = buildAlertEventKey({
          departureDate: alert.departure_date,
          currentPrice,
          currency: eventCurrency,
        });

        if (shouldNotify && alert.notify_email && !pastDeadline()) {
          if (!emailConfigured) {
            // Saglayici yok: olay claim edilmez, ileride yeniden denenebilir.
            await supabase.from("flight_price_alert_logs").insert({
              alert_id: alert.id,
              status: "email_skipped_not_configured",
              price: currentPrice,
              currency: eventCurrency,
              checked_at: now,
            });
          } else {
            let claimToken: string | null = null;
            try {
              claimToken = await claimNotification(supabase, {
                alertId: alert.id,
                channel: "email",
                eventKey,
                eventPrice: currentPrice,
                eventCurrency,
              });
            } catch (claimErr) {
              mailError = claimErr instanceof Error ? claimErr.message : "E-posta bildirim kaydi hatasi";
            }
            if (claimToken) {
              const outcome = await deliverEmailForEvent({
                supabase,
                sendMail,
                alert,
                newPrice: currentPrice,
                basePrice: Number(updatedBasePrice),
              });
              await settleAlertNotification(supabase, { alertId: alert.id, channel: "email", eventKey }, claimToken, {
                ok: outcome.ok,
                providerId: outcome.providerId,
                errorMessage: outcome.error,
                failureKind: "transient",
              });

              if (outcome.ok) {
                logStatus = "email_sent";
                notifySent = true;
              } else {
                logStatus = "email_failed";
                mailError = outcome.error || "Fiyat düşüş maili gönderilemedi.";
              }
            }
          }
        }

        if (shouldNotify && alert.notify_push && alert.user_id && !pastDeadline()) {
          // Hazirlik on kontrolleri PLATFORM BAZLIDIR: iOS cihaz icin APNs,
          // Android cihaz icin FCM. Uygun sağlayıcısı yapılandırılmış en az
          // bir aktif cihaz yoksa olay claim edilmez (tuketilmez).
          const eligibility = await getPushEligibility(supabase, alert.user_id, pushCfg);
          const pushReady = !eligibility.queryError && eligibility.eligiblePlatforms.length > 0;

          if (!pushReady) {
            await supabase.from("flight_price_alert_logs").insert({
              alert_id: alert.id,
              status: eligibility.enabledCount > 0 ? "push_skipped_not_configured" : "push_skipped_no_device",
              price: currentPrice,
              currency: eventCurrency,
              checked_at: now,
            });
          } else {
            let claimToken: string | null = null;
            try {
              claimToken = await claimNotification(supabase, {
                alertId: alert.id,
                channel: "push",
                eventKey,
                eventPrice: currentPrice,
                eventCurrency,
              });
            } catch {
              pushError = "Push bildirim kaydi olusturulamadi.";
            }
            if (claimToken) {
              const push = await deliverPushForEvent({
                supabase,
                sendPush,
                alert,
                platforms: eligibility.eligiblePlatforms,
              });
              await settleAlertNotification(supabase, { alertId: alert.id, channel: "push", eventKey }, claimToken, {
                ok: push.ok,
                providerId: null,
                errorMessage: push.errorMessage,
                failureKind: push.failureKind,
              });

              await supabase.from("flight_price_alert_logs").insert({
                alert_id: alert.id,
                status: push.ok ? "push_sent" : (push.attempted === 0 ? "push_skipped_no_device" : "push_failed"),
                price: currentPrice,
                currency: eventCurrency,
                error_message: push.ok || push.attempted === 0
                  ? null
                  : push.summary.errors.map((e: { platform: string; reason: string }) => `${e.platform}:${e.reason}`).join(",").slice(0, 300),
                checked_at: now,
              });

              if (push.ok) {
                notifySent = true;
              } else if (push.attempted > 0) {
                pushError = "Push bildirimi gönderilemedi.";
              }
            }
          }
        }

        if (notifySent) {
          groupNotified += 1;
          notifiedAlerts += 1;
        }
        if (mailError || pushError) {
          if (!notifySent) groupErrors += 1;
          if (mailError) errorAlerts += 1;
        }

        const updatePayload: Record<string, unknown> = {
          last_checked_price: currentPrice,
          lowest_price_seen: newLowestPrice,
          base_price: updatedBasePrice,
          last_checked_at: now,
          status: notifySent ? "triggered" : "active",
          last_error_message: null,
          last_error_at: null,
          error_count: 0,
        };

        if (notifySent) {
          // Cooldown alanlari (last_notified_price/at) BURADA YAZILMAZ:
          // mark_alert_notified RPC'si DB'de atomik/monotonik gunceller.
          updatePayload.last_mail_status = "drop_sent";
        }

        if (mailError) {
          // E-posta kanali basarisiz; push gonderildiyse alarm "triggered" kalir,
          // hicbir kanal calismadiysa hata durumuna gecer.
          updatePayload.last_mail_status = "drop_failed";
          updatePayload.last_error_message = mailError;
          updatePayload.last_error_at = now;
          if (!notifySent) {
            updatePayload.status = "error";
            updatePayload.error_count = Number(alert.error_count || 0) + 1;
          }
        }
        if (pushError && !notifySent && !mailError) {
          updatePayload.status = "error";
          updatePayload.last_error_message = pushError;
          updatePayload.last_error_at = now;
          updatePayload.error_count = Number(alert.error_count || 0) + 1;
        }

        await Promise.all([
          supabase.from("flight_price_alerts").update(updatePayload).eq("id", alert.id),
          notifySent ? markAlertNotified(supabase, alert.id, currentPrice, now) : Promise.resolve(),
          supabase.from("flight_price_alert_logs").insert({
            alert_id: alert.id,
            status: logStatus,
            price: currentPrice,
            currency: eventCurrency,
            raw_response: priceInfo,
            error_message: mailError,
            checked_at: now,
          }),
        ]);
      }

      details.push({ key, status: "checked", price: currentPrice, processed: groupProcessed, notified: groupNotified, errors: groupErrors });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fiyat kontrol grubu çalıştırılamadı.";
      const groupErrors = await markNoPrice({ supabase, group, now, message });
      errorAlerts += groupErrors;
      processedAlerts += group.length;
      details.push({ key, status: "group_error", processed: group.length, errors: groupErrors, message });
    }
  }

  // Fiyat gruplari KUCUK bir concurrency ile islenir (sinirsiz paralellik
  // yok); her worker YENI gruba baslamadan once deadline'i kontrol eder —
  // deadline sonrasi yeni provider cagrisi baslatilmaz.
  const groupKeys = Object.keys(groupedAlerts);
  let nextGroupIndex = 0;
  async function groupWorker() {
    for (;;) {
      if (pastDeadline()) {
        deadlineReached = true;
        return;
      }
      const index = nextGroupIndex;
      if (index >= groupKeys.length) return;
      nextGroupIndex += 1;
      await processGroup(groupKeys[index]);
    }
  }
  const workerCount = Math.min(GROUP_CONCURRENCY, groupKeys.length);
  await Promise.all(Array.from({ length: workerCount }, () => groupWorker()));

  // Hic baslatilmayan gruplar: attempt/claim harcanmadi; sonraki cron'a kaldi.
  while (nextGroupIndex < groupKeys.length) {
    deferred += groupedAlerts[groupKeys[nextGroupIndex]].length;
    nextGroupIndex += 1;
  }

  return finishResult({
    processedGroups: details.length,
    processedAlerts,
    notifiedAlerts,
    errorAlerts,
    details,
  });
}
