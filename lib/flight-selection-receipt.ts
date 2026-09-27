import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { FlightMatch } from "./flight-lookup";
import { FLIGHT_DATA_LIFETIME_MS } from "./flight-lookup-access";
import { flightSelectionDeadline } from "./flight-progress";

const SAVE_WINDOW_MS = 10 * 60000;
type Receipt = {
  version: 2; userId: string; nonce: string;
  query: { flightNumber: string; date: string };
  flight: FlightMatch; expiresAt: string; saveUntil: string;
};
const signature = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest();

export function issueFlightReceipt(userId: string, query: Receipt["query"], flight: FlightMatch, secret: string, now = new Date()) {
  if (secret.length < 32) throw new Error("receipt-unavailable");
  const fetched = Date.parse(flight.fetchedAt);
  if (!Number.isFinite(fetched) || fetched > now.getTime() + 30000 || fetched + SAVE_WINDOW_MS <= now.getTime()) throw new Error("stale-flight");
  const deadline = flightSelectionDeadline(flight, now);
  if (!Number.isFinite(deadline) || deadline <= now.getTime()) throw new Error("stale-flight");
  const expiresAt = new Date(fetched + FLIGHT_DATA_LIFETIME_MS).toISOString();
  const payload: Receipt = { version: 2, userId, nonce: randomUUID(), query, flight, expiresAt,
    saveUntil: new Date(deadline).toISOString() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { receipt: `${encoded}.${signature(encoded, secret).toString("base64url")}`, expiresAt };
}

/** The signed selection binds the owner and original lifetime; saving cannot renew it. */
export function verifyFlightReceipt(value: unknown, userId: string, secret: string, now = new Date()): Receipt | null {
  if (typeof value !== "string" || value.length > 18000 || secret.length < 32) return null;
  try {
    const [encoded, mac, extra] = value.split(".");
    if (!encoded || !mac || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(encoded + mac)) return null;
    const expected = signature(encoded, secret), supplied = Buffer.from(mac, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Receipt;
    const fetched = Date.parse(payload.flight?.fetchedAt), expires = Date.parse(payload.expiresAt), saveUntil = Date.parse(payload.saveUntil);
    if (payload.version !== 2 || payload.userId !== userId || !/^[0-9a-f-]{36}$/i.test(payload.nonce)
      || payload.flight.source !== "AeroDataBox" || payload.query.flightNumber !== payload.flight.flightNumber
      || payload.query.date !== payload.flight.departureDate || !Number.isFinite(fetched)
      || expires !== fetched + FLIGHT_DATA_LIFETIME_MS || !Number.isFinite(saveUntil)
      || saveUntil > fetched + SAVE_WINDOW_MS || saveUntil > flightSelectionDeadline(payload.flight, now)
      || fetched > now.getTime() + 30000 || now.getTime() >= saveUntil || now.getTime() >= expires) return null;
    return payload;
  } catch { return null; }
}
