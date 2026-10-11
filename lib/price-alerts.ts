import crypto from "crypto";
import { siteUrl } from "./structured-data";

export type PriceAlertStatus = "active" | "paused" | "triggered" | "error" | "cancelled";

export type AlertDeliveryState = {
  is_active?: boolean | null;
  notify_email?: boolean | null;
  notify_push?: boolean | null;
};

/**
 * Kanal tercihlerini bir PATCH isteğinden sonra oluşacak son hâle çözer.
 * Eski kayıtlarda notify_email alanı boşsa tarihsel varsayılan olan e-posta
 * açık kabul edilir. Aktif bir alarmın teslim kanalı olmadan kaydedilmesini
 * hem API hem testler bu tek kuralla engeller.
 */
export function resolveAlertDeliveryState(
  current: AlertDeliveryState,
  patch: AlertDeliveryState,
) {
  const active = patch.is_active === undefined ? current.is_active !== false : patch.is_active === true;
  const email = patch.notify_email === undefined ? current.notify_email !== false : patch.notify_email === true;
  const push = patch.notify_push === undefined ? current.notify_push === true : patch.notify_push === true;

  return {
    active,
    email,
    push,
    valid: !active || email || push,
  };
}

export function hashAlertToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createAlertToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function tokenExpiresInOneYear() {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  return expires.toISOString();
}

export function verifyAlertToken(params: {
  plainToken: string;
  storedHash?: string | null;
  expiresAt?: string | null;
}) {
  if (!params.plainToken || !params.storedHash) return false;
  if (params.expiresAt && (!Number.isFinite(Date.parse(params.expiresAt)) || Date.parse(params.expiresAt) <= Date.now())) return false;

  const incoming = Buffer.from(hashAlertToken(params.plainToken), "hex");
  const stored = Buffer.from(params.storedHash, "hex");

  if (incoming.length !== stored.length) return false;
  return crypto.timingSafeEqual(incoming, stored);
}

type AlertUnsubscribeCapability = { alertId: string; departureDate: string; storedHash?: string | null; expiresAt?: string | null };

/** Cancel-only capability: cannot authenticate PATCH or disclose another alert.
 * Bound to the existing management-token generation, so rotation revokes both
 * links. Its cancel-only lifetime ends after the trip, independently of the
 * original management token (which may expire before a distant departure). */
export function createAlertUnsubscribeToken(params: AlertUnsubscribeCapability, secret = process.env.CRON_SECRET || "") {
  if (!secret || !params.alertId || (params.storedHash != null && !/^[a-f0-9]{64}$/i.test(params.storedHash))) return null;
  const departure = /^\d{4}-\d{2}-\d{2}$/.test(params.departureDate) ? Date.parse(`${params.departureDate}T00:00:00Z`) : NaN;
  if (!Number.isFinite(departure) || new Date(departure).toISOString().slice(0, 10) !== params.departureDate || departure + 2 * 86400000 <= Date.now()) return null;
  const payload = JSON.stringify(["price-alert-cancel-v1", params.alertId, params.storedHash?.toLowerCase() || null, params.expiresAt || null, params.departureDate]);
  return `cancel-v1.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyAlertUnsubscribeToken(params: AlertUnsubscribeCapability & { plainToken: string }, secret = process.env.CRON_SECRET || "") {
  if (params.plainToken.startsWith("cancel-v1.")) {
    const expected = createAlertUnsubscribeToken(params, secret);
    if (!expected || params.plainToken.length !== expected.length) return false;
    const incoming = Buffer.from(params.plainToken), expectedBytes = Buffer.from(expected);
    return incoming.length === expectedBytes.length && crypto.timingSafeEqual(incoming, expectedBytes);
  }
  return verifyAlertToken(params);
}

/** Stable across workers/claims/retries; a different alert or event gets a new key. */
export function alertEmailIdempotencyKey(alertId: string, eventKey: string) {
  return `price-drop/${crypto.createHash("sha256").update(JSON.stringify([alertId, eventKey])).digest("hex")}`;
}

export function getAlertStatus(alert: {
  status?: PriceAlertStatus | string | null;
  is_active?: boolean | null;
  last_error_at?: string | null;
  last_notified_at?: string | null;
}) {
  if (alert.status) return alert.status as PriceAlertStatus;
  if (alert.is_active === false) return "paused";
  if (alert.last_error_at) return "error";
  if (alert.last_notified_at) return "triggered";
  return "active";
}

export function makeUnsubscribeLink(alertId: string, token?: string | null) {
  if (!token) return siteUrl("/profil/fiyat-alarmlari");
  const query = new URLSearchParams({ token });
  return siteUrl(`/api/flight-alerts/${alertId}/unsubscribe?${query.toString()}`);
}

export function makeAlertDashboardLink() {
  return siteUrl("/profil/fiyat-alarmlari");
}

export function priceAlertSubject(params: { originLabel: string; destinationLabel: string; type: "created" | "drop" | "error" }) {
  const originLabel = params.originLabel.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  const destinationLabel = params.destinationLabel.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  if (params.type === "created") return `Fiyat alarmınız kuruldu: ${originLabel} ✈️ ${destinationLabel}`;
  if (params.type === "drop") return `${originLabel} → ${destinationLabel} biletinde fiyat düştü ✈️`;
  return `${originLabel} → ${destinationLabel} fiyat alarmı kontrol edilemedi`;
}

// --- Hotfix: çok kanallı bildirim yardımcıları (saf fonksiyonlar; unit testli) ---

export function shouldNotifyForPrice(params: {
  alert: {
    last_notified_at?: string | null;
    last_notified_price?: number | string | null;
    target_price?: number | string | null;
    threshold_percent?: number | string | null;
  };
  currentPrice: number;
  basePrice: number | null;
  now?: Date;
}) {
  const { alert, currentPrice, basePrice } = params;
  const now = params.now || new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastNotifiedDate = alert.last_notified_at ? new Date(alert.last_notified_at) : null;
  const recentNotification = Boolean(lastNotifiedDate && lastNotifiedDate > twentyFourHoursAgo);
  const priceDroppedBelowLastNotified = !alert.last_notified_price || currentPrice < Number(alert.last_notified_price);

  if (recentNotification || !priceDroppedBelowLastNotified) return false;
  if (alert.target_price && currentPrice <= Number(alert.target_price)) return true;
  if (!alert.target_price && basePrice) {
    const threshold = Number(alert.threshold_percent || 5);
    return currentPrice <= Number(basePrice) * (1 - threshold / 100);
  }
  return false;
}

/**
 * Aynı alarm + aynı fiyat olayı için çift bildirimi engelleyen idempotency
 * anahtarı. flight_price_alert_notifications(alert_id, channel, event_key)
 * unique kısıtıyla birlikte kullanılır.
 */
export function buildAlertEventKey(params: {
  departureDate: string;
  currentPrice: number;
  currency?: string | null;
}) {
  return `${params.departureDate}:${Math.round(params.currentPrice)}:${(params.currency || "TRY").toUpperCase()}`;
}

/** Push sağlayıcı hata nedenini sınıflandırır; token değeri içermez. */
export function classifyPushFailure(reason: string) {
  const disableReasons = new Set([
    "apns_410",
    "apns_BadDeviceToken",
    "apns_Unregistered",
    "apns_ExpiredToken",
    "fcm_UNREGISTERED",
    "fcm_NOT_FOUND",
    "fcm_404",
  ]);
  return {
    shouldDisableToken: disableReasons.has(reason),
    transient: reason.endsWith("timeout") || reason.endsWith("network_error") || reason.endsWith("connection_error") || reason === "apns_500" || reason === "fcm_500" || reason === "apns_503" || reason === "fcm_503",
  };
}

/** Push bildirim metni. Uçuş arama/karşılaştırma iması içermez. */
export function buildPriceDropPushMessage(params: {
  originLabel: string;
  destinationLabel: string;
  departureDate: string;
}) {
  return {
    title: "Fiyat alarmın tetiklendi ✈️",
    body: `${params.originLabel} → ${params.destinationLabel} için takip ettiğin fiyat hedef seviyeye düştü. (${params.departureDate})`,
    data: { screen: "price-alerts" },
  };
}
