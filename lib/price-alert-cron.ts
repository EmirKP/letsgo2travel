import { getSupabaseAdmin } from "./supabaseAdmin";
import { fetchCheapestPrice } from "./travelpayouts";
import { sendMailAndLog, generatePriceDropEmailHtml } from "./mail";
import {
  buildAlertEventKey,
  alertEmailIdempotencyKey,
  buildPriceDropPushMessage,
  classifyPushFailure,
  makeAlertDashboardLink,
  createAlertUnsubscribeToken,
  makeUnsubscribeLink,
  priceAlertSubject,
  shouldNotifyForPrice,
} from "./price-alerts";
import { isPushConfigured as isPushProviderConfigured, sendPushToUser } from "./push";
import { isPastTravelDate, todayIsoInTimeZone } from "./date-utils";
import { priceAlertPreferenceReader } from "./price-alert-preferences";
import { priceAlertScanFilter } from "./price-alert-scan";

type PriceAlertRow = Record<string, any>;

// No departure-zone column exists on legacy alerts. Wait until the date has
// passed in every time zone before retiring one in the background. The UI
// and resume API use the user's local calendar for an immediate expiry label.
const ALERT_EXPIRY_ZONE = "Etc/GMT+12";

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
// Resend retains idempotency keys for 24 hours. Leave a safety margin; an
// unresolved send must never become a fresh delivery after that window.
const EMAIL_DEDUPE_WINDOW_MS = 23 * 60 * 60 * 1000;
class NotificationPersistenceError extends Error {}

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
      }).eq("id", alert.id).eq("is_active", true).is("cancelled_at", null),
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
  claimToken: string | null,
  outcome: {
    ok: boolean;
    providerId?: string | null;
    errorMessage?: string | null;
    failureKind?: "transient" | "permanent";
  },
) {
  const failureKind = outcome.ok ? null : (outcome.failureKind || "transient");
  let update = supabase
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
    .eq("status", "pending");
  update = claimToken == null ? update.is("claim_token", null) : update.eq("claim_token", claimToken);
  const { data, error } = await update.select("id");
  if (error) throw new NotificationPersistenceError("Bildirim teslim sonucu kaydedilemedi; güvenli yeniden deneme gerekli.");
  return Boolean(data?.length);
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
  eventKey: string;
  claimToken: string;
}): Promise<{ ok: boolean; providerId?: string | null; error?: string | null; failureKind?: "transient" | "permanent" }> {
  const { alert } = params;
  const { data: notifications, error: notificationError } = await params.supabase.from("flight_price_alert_notifications")
    .select("*").eq("alert_id", alert.id).eq("channel", "email").eq("event_key", params.eventKey)
    .eq("claim_token", params.claimToken).eq("status", "pending").limit(1);
  const notification = notifications?.[0];
  if (notificationError || !notification) throw new NotificationPersistenceError("E-posta teslim kaydı okunamadı.");
  // A receipt is written separately from notification settlement. Reconcile it
  // after a lost settlement response instead of calling the provider again.
  const receipt = await emailReceipt(params.supabase, notification.id);
  if (receipt) return { ok: true, providerId: receipt };
  // Older workers did not pass any provider key or distinguish a rejection
  // from a lost acknowledgement. Their outcomes cannot use our NEW key.
  const previousOutcome = String(notification.error_message || "");
  if (Number(notification.attempt_count) > 1 && !/^(delivery_outcome_unknown|delivery_not_accepted):/.test(previousOutcome)) {
    return { ok: false, failureKind: "permanent", error: "delivery_unconfirmed: Önceki sürümün e-posta teslimi doğrulanamadı; tekrar gönderilmedi." };
  }
  const uncertain = Number(notification.attempt_count) > 1 && previousOutcome.startsWith("delivery_outcome_unknown:");
  const createdAt = Date.parse(notification.created_at || "");
  if (uncertain && (!Number.isFinite(createdAt) || Date.now() - createdAt >= EMAIL_DEDUPE_WINDOW_MS)) {
    return { ok: false, failureKind: "permanent", error: "delivery_unconfirmed: E-postanın teslimi doğrulanamadı; yinelenen gönderimi önlemek için tekrar gönderilmedi." };
  }
  const cancelToken = createAlertUnsubscribeToken({ alertId: alert.id, departureDate: alert.departure_date, storedHash: alert.manage_token_hash, expiresAt: alert.manage_token_expires_at });
  if (!cancelToken) return { ok: false, error: `${uncertain ? "delivery_outcome_unknown:" : "delivery_not_accepted:"}Güvenli alarm kapatma bağlantısı oluşturulamadı.` };
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
    newPrice: resolveEventSnapshot(notification).price ?? params.newPrice,
    ctaLink: makeAlertDashboardLink(),
    unsubscribeLink: makeUnsubscribeLink(alert.id, cancelToken),
  });
  // Persist uncertainty BEFORE contacting the provider. If the function dies
  // afterwards, an old failed-attempt message cannot imply the next send failed.
  const { data: prepared, error: prepareError } = await params.supabase.from("flight_price_alert_notifications")
    .update({ error_message: "delivery_outcome_unknown:provider_request_started" })
    .eq("id", notification.id).eq("claim_token", params.claimToken).eq("status", "pending").select("id");
  if (prepareError || !prepared?.length) throw new NotificationPersistenceError("E-posta gönderimi güvenli biçimde başlatılamadı.");
  const mailRes = await params.sendMail({
    supabase: params.supabase,
    to: alert.email,
    subject,
    html,
    category: "price_alert_drop",
    referenceType: "flight_price_alert_notification",
    referenceId: notification.id,
    idempotencyKey: alertEmailIdempotencyKey(alert.id, params.eventKey),
  });
  const ok = Boolean(mailRes.success) && mailRes.providerId !== "mock";
  // A later rejection (e.g. 429 or idempotency conflict) says nothing about
  // an earlier ambiguous attempt. Only a successful receipt clears that risk.
  return { ok, providerId: mailRes.providerId, error: ok ? null : `${uncertain || mailRes.deliveryUncertain ? "delivery_outcome_unknown:" : "delivery_not_accepted:"}${mailRes.error || "Fiyat düşüş maili gönderilemedi."}` };
}

async function emailReceipt(supabase: any, notificationId: string): Promise<string | null> {
  const { data, error } = await supabase.from("mail_delivery_logs")
    .select("provider_id").eq("reference_type", "flight_price_alert_notification")
    .eq("reference_id", notificationId).eq("status", "sent").limit(1);
  if (error) throw new NotificationPersistenceError("E-posta teslim makbuzu okunamadı.");
  const id = data?.[0]?.provider_id;
  return typeof id === "string" && id && id !== "mock" ? id : null;
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

/** Move temporary ineligibility out of the due queue without consuming an
 * attempt. Fence against another worker's claim or settlement. */
async function deferRetry(supabase: any, row: PriceAlertRow) {
  let update = supabase.from("flight_price_alert_notifications")
    .update({ next_retry_at: new Date(Date.now() + RETRY_DELAY_SECONDS * 1000).toISOString() })
    .eq("id", row.id).eq("status", row.status).eq("attempt_count", row.attempt_count);
  update = row.claim_token ? update.eq("claim_token", row.claim_token) : update.is("claim_token", null);
  const { error } = await update;
  if (error) throw new NotificationPersistenceError("Bildirim yeniden denemesi ertelenemedi.");
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
  getPreferences: ReturnType<typeof priceAlertPreferenceReader>;
}): Promise<{ processed: number; sent: number; deferred: number; deadlineReached: boolean }> {
  const { supabase, sendMail, sendPush, emailConfigured, pushCfg, pastDeadline, getPreferences } = params;
  const stats = { processed: 0, sent: 0, deferred: 0, deadlineReached: false };
  const nowMs = Date.now();
  const due = `next_retry_at.is.null,next_retry_at.lte.${new Date(nowMs).toISOString()}`;
  const stale = `last_attempt_at.is.null,last_attempt_at.lt.${new Date(nowMs - PENDING_TTL_SECONDS * 1000).toISOString()}`;
  const pendingDue = `and(or(${due}),or(${stale}))`;
  const scanned = new Set<string>();
  // Due predicates run before SQL LIMIT. Deferred/muted rows leave this page,
  // allowing subsequent pages to reach eligible work behind a large backlog.
  while (stats.processed < RETRY_BATCH_LIMIT && !pastDeadline()) {
    const [failedRes, pendingRes, finalAttemptRes] = await Promise.all([
      supabase
        .from("flight_price_alert_notifications")
        .select("*")
        .eq("status", "failed")
        .eq("failure_kind", "transient")
        .lt("attempt_count", MAX_ATTEMPTS)
        .or(due)
        .order("next_retry_at", { ascending: true, nullsFirst: true })
        .order("last_attempt_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true })
        .limit(100),
      supabase
        .from("flight_price_alert_notifications")
        .select("*")
        .eq("status", "pending")
        .lt("attempt_count", MAX_ATTEMPTS)
        .or(pendingDue)
        .order("last_attempt_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true })
        .limit(100),
      // The final provider attempt may have succeeded but lost its settlement.
      // Reconcile only; this page can never issue a fourth provider request.
      supabase.from("flight_price_alert_notifications").select("*")
        .eq("channel", "email").eq("status", "pending").eq("attempt_count", MAX_ATTEMPTS)
        .or(pendingDue)
        .order("last_attempt_at", { ascending: true, nullsFirst: true }).order("id", { ascending: true }).limit(100),
    ]);
    if (failedRes.error || pendingRes.error || finalAttemptRes.error) throw new NotificationPersistenceError("Bildirim yeniden deneme kuyruğu okunamadı.");

    // Aday + vade zamanı: zamanı gelen EN ESKİ kayıt önce işlenir.
    const candidates: Array<{ row: PriceAlertRow; dueAt: number }> = [];
    for (const row of (failedRes.data || []) as PriceAlertRow[]) {
      const retryAt = row.next_retry_at ? Date.parse(row.next_retry_at) : 0;
      if (!retryAt || retryAt <= nowMs) {
        candidates.push({ row, dueAt: retryAt || (row.last_attempt_at ? Date.parse(row.last_attempt_at) : 0) });
      }
    }
    for (const row of [...(pendingRes.data || []), ...(finalAttemptRes.data || [])] as PriceAlertRow[]) {
      const lastAttempt = row.last_attempt_at ? Date.parse(row.last_attempt_at) : 0;
      if (!lastAttempt || lastAttempt < nowMs - PENDING_TTL_SECONDS * 1000) {
        candidates.push({ row, dueAt: lastAttempt ? lastAttempt + PENDING_TTL_SECONDS * 1000 : 0 });
      }
    }
    candidates.sort((a, b) => a.dueAt - b.dueAt);
    const batch = candidates.filter(({ row }) => !scanned.has(row.id));
    if (!batch.length) break;

    for (let i = 0; i < batch.length; i += 1) {
      // Deadline kontrolü CLAIM'den ÖNCE: ertelenen kayıt attempt harcamaz.
      if (pastDeadline() || stats.processed >= RETRY_BATCH_LIMIT) {
        stats.deadlineReached = pastDeadline();
        stats.deferred += batch.length - i;
        break;
      }
      const notif = batch[i].row;
      scanned.add(notif.id);
      const channel = notif.channel as NotificationChannel;
      const ref = { alertId: notif.alert_id, channel, eventKey: notif.event_key };
      if (channel === "email" && notif.attempt_count >= MAX_ATTEMPTS) {
        const providerId = await emailReceipt(supabase, notif.id);
        const settled = await settleAlertNotification(supabase, ref, notif.claim_token, {
          ok: Boolean(providerId), providerId, failureKind: "permanent",
          errorMessage: providerId ? null : "delivery_unconfirmed: Deneme sınırında e-posta teslimi doğrulanamadı.",
        });
        if (!settled) continue;
        stats.processed += 1;
        const { price } = resolveEventSnapshot(notif);
        if (providerId) { stats.sent += 1; if (price !== null) await markAlertNotified(supabase, notif.alert_id, price, new Date().toISOString()); }
        continue;
      }

      const { data: alertRows, error: alertError } = await supabase
        .from("flight_price_alerts")
        .select("*")
        .eq("id", notif.alert_id)
        .limit(1);
      if (alertError) {
        await deferRetry(supabase, notif);
        stats.deferred += 1;
        continue;
      }
      const alert: PriceAlertRow | null = (alertRows && alertRows[0]) || null;

      // Kanal KALICI olarak gönderilemez durumda mı? (alarm silinmiş/pasif,
      // kanal kapatılmış, push için kullanıcı yok) -> claim + kalıcı kapanış.
      const permanentReason = !alert
        ? "alert_missing"
        : alert.cancelled_at || alert.status === "cancelled"
          ? "alert_deleted"
          : isPastTravelDate(alert.departure_date, ALERT_EXPIRY_ZONE)
            ? "alert_expired"
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
        const preferences = await getPreferences(alert.user_id);
        if ((channel === "email" && !preferences.email) || (channel === "push" && !preferences.push)) {
          await deferRetry(supabase, notif); stats.deferred += 1; continue;
        }
        if (channel === "email") {
          if (!emailConfigured) { await deferRetry(supabase, notif); stats.deferred += 1; continue; }
        } else {
          const eligibility = await getPushEligibility(supabase, alert.user_id, pushCfg);
          if (eligibility.queryError || eligibility.eligiblePlatforms.length === 0) {
            await deferRetry(supabase, notif); stats.deferred += 1; continue;
          }
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
          eventKey: ref.eventKey,
          claimToken,
        });
        const settled = await settleAlertNotification(supabase, ref, claimToken, {
          ok: outcome.ok,
          providerId: outcome.providerId,
          errorMessage: outcome.error,
          failureKind: outcome.failureKind || "transient",
        });
        if (!settled) continue;
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
        const settled = await settleAlertNotification(supabase, ref, claimToken, {
          ok: push.ok,
          providerId: null,
          errorMessage: push.errorMessage,
          failureKind: push.failureKind,
        });
        if (!settled) continue;
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
  }
  stats.deadlineReached ||= pastDeadline();

  return stats;
}

export async function runPriceAlertCheck(options?: { limit?: number; checkedBefore?: string; deps?: PriceAlertCronDeps }): Promise<PriceAlertCheckResult> {
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
  const getPreferences = priceAlertPreferenceReader(supabase);

  // 1) RETRY KUYRUĞU: yeni olay tespitinden BAĞIMSIZ çalışır; alarm
  //    cooldown'u bekleyen/başarısız kanal retry'ını durdurmaz.
  const retryStats = await processRetryQueue({ supabase, sendMail, sendPush, emailConfigured, pushCfg, pastDeadline, getPreferences });
  deadlineReached = deadlineReached || retryStats.deadlineReached;
  deferred += retryStats.deferred;

  // 2) YENİ FİYAT OLAYI TESPİTİ
  const oldestDeparture = todayIsoInTimeZone(ALERT_EXPIRY_ZONE);
  const { data: activeAlerts, error: alertsError } = await supabase
    .from("flight_price_alerts")
    .select("*")
    .eq("is_active", true)
    .is("cancelled_at", null)
    .gte("departure_date", oldestDeparture)
    .or(priceAlertScanFilter(options?.checkedBefore))
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
  let persistenceFailure: NotificationPersistenceError | null = null;

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

      for (const snapshotAlert of group) {
        // Deadline: bu alarmın bildirim işi HİÇ başlatılmaz (claim yok,
        // attempt yok); alarm sonraki cron'da güvenle işlenir.
        if (pastDeadline()) {
          deadlineReached = true;
          deferred += 1;
          continue;
        }
        // Provider calls can take seconds. Re-read delivery preferences after
        // that wait so a delete/pause/channel change takes effect immediately.
        const { data: currentRows, error: currentError } = await supabase.from("flight_price_alerts")
          .select("*").eq("id", snapshotAlert.id).limit(1);
        if (currentError) { deferred += 1; continue; }
        const alert = currentRows?.[0];
        if (!alert || alert.is_active === false || alert.cancelled_at || alert.status === "cancelled"
          || isPastTravelDate(alert.departure_date, ALERT_EXPIRY_ZONE)) continue;
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
        const preferences = await getPreferences(alert.user_id);

        if (shouldNotify && alert.notify_email && preferences.email && !pastDeadline()) {
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
                eventKey,
                claimToken,
              });
              const settled = await settleAlertNotification(supabase, { alertId: alert.id, channel: "email", eventKey }, claimToken, {
                ok: outcome.ok,
                providerId: outcome.providerId,
                errorMessage: outcome.error,
                failureKind: outcome.failureKind || "transient",
              });
              if (!settled) continue;

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

        if (shouldNotify && alert.notify_push && preferences.push && alert.user_id && !pastDeadline()) {
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
              const settled = await settleAlertNotification(supabase, { alertId: alert.id, channel: "push", eventKey }, claimToken, {
                ok: push.ok,
                providerId: null,
                errorMessage: push.errorMessage,
                failureKind: push.failureKind,
              });
              if (!settled) continue;

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
          supabase.from("flight_price_alerts").update(updatePayload).eq("id", alert.id).eq("is_active", true).is("cancelled_at", null),
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
      if (error instanceof NotificationPersistenceError) { persistenceFailure = error; return; }
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
  if (persistenceFailure) throw persistenceFailure;

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
