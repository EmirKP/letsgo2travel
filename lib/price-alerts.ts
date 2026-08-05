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
