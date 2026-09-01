import crypto from "crypto";
import { siteUrl } from "./structured-data";

export type PriceAlertStatus = "active" | "paused" | "triggered" | "error" | "cancelled";

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
  if (params.expiresAt && new Date(params.expiresAt) < new Date()) return false;

  const incoming = Buffer.from(hashAlertToken(params.plainToken), "hex");
  const stored = Buffer.from(params.storedHash, "hex");

  if (incoming.length !== stored.length) return false;
  return crypto.timingSafeEqual(incoming, stored);
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
