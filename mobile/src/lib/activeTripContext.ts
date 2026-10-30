import { useEffect, useState } from "react";
import { isCalendarDate } from "./dates";
import { alpha2FromAlpha3 } from "../data/countryIso";

/** ISO calendar dates include both travel days. Nights are endDate - startDate. */
export type ActiveTripContext = {
  tripId: string;
  title: string;
  city?: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  adults?: number;
  children?: number;
  rooms?: number;
  currency?: string;
};

type TripContextSource = {
  id: string;
  title?: string;
  destinationCity?: string | null;
  destinationCountry?: string;
  destinationCode: string;
  startDate: string;
  endDate: string;
  adults?: number;
  children?: number;
  rooms?: number;
  currency?: string;
};

const eventName = "l2t:active-trip-change";
const owner = (ownerId?: string | null) => ownerId || "guest";
const storageKey = (ownerId?: string | null) => `l2t:active-trip:v1:${encodeURIComponent(owner(ownerId))}`;
const cleanText = (value: unknown, length: number) => typeof value === "string" ? value.trim().slice(0, length) : "";
const count = (value: unknown, minimum: number, maximum: number) => typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum ? value : undefined;

export function normalizeActiveTripContext(value: unknown): ActiveTripContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const tripId = cleanText(source.tripId, 160);
  const title = cleanText(source.title, 180);
  const rawCountryCode = cleanText(source.countryCode, 3).toUpperCase();
  const countryCode = rawCountryCode.length === 3 ? alpha2FromAlpha3(rawCountryCode) : rawCountryCode;
  const startDate = typeof source.startDate === "string" ? source.startDate : "";
  const endDate = typeof source.endDate === "string" ? source.endDate : "";
  if (!tripId || !title || !/^[A-Z]{2}$/.test(countryCode) || !isCalendarDate(startDate) || !isCalendarDate(endDate) || endDate < startDate) return null;
  const city = cleanText(source.city, 100);
  const currency = cleanText(source.currency, 3).toUpperCase();
  const adults = count(source.adults, 1, 20), children = count(source.children, 0, 20), rooms = count(source.rooms, 1, 20);
  return { tripId, title, countryCode, startDate, endDate, ...(city ? { city } : {}),
    ...(adults !== undefined ? { adults } : {}), ...(children !== undefined ? { children } : {}),
    ...(rooms !== undefined ? { rooms } : {}), ...(/^[A-Z]{3}$/.test(currency) ? { currency } : {}) };
}

/** Whitelist only reusable planning fields; never store location, PNR or flight/provider data. */
export function activeTripContextFromTrip(trip: TripContextSource): ActiveTripContext | null {
  return normalizeActiveTripContext({ tripId: trip.id, title: trip.title || [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", "),
    city: trip.destinationCity, countryCode: trip.destinationCode, startDate: trip.startDate, endDate: trip.endDate,
    adults: trip.adults, children: trip.children, rooms: trip.rooms, currency: trip.currency });
}

export function readActiveTripContext(ownerId?: string | null): ActiveTripContext | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(ownerId)) || "null");
    return saved?.version === 1 && saved.ownerId === owner(ownerId) ? normalizeActiveTripContext(saved.trip) : null;
  } catch { return null; }
}

export function writeActiveTripContext(ownerId: string | null | undefined, value: ActiveTripContext): boolean {
  const normalized = normalizeActiveTripContext(value);
  if (!normalized) return false;
  const previous = readActiveTripContext(ownerId);
  // A refreshed trip base has no party counts. Preserve known preferences for
  // that same trip, never borrow them from a different trip or owner.
  const trip = previous?.tripId === normalized.tripId
    ? { adults: previous.adults, children: previous.children, rooms: previous.rooms, currency: previous.currency, ...normalized }
    : normalized;
  try {
    const payload = JSON.stringify({ version: 1, ownerId: owner(ownerId), trip });
    if (localStorage.getItem(storageKey(ownerId)) === payload) return true;
    localStorage.setItem(storageKey(ownerId), payload);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ownerId: owner(ownerId) } }));
    return true;
  } catch { return false; }
}

export function clearActiveTripContext(ownerId?: string | null, tripId?: string): void {
  if (tripId && readActiveTripContext(ownerId)?.tripId !== tripId) return;
  try {
    localStorage.removeItem(storageKey(ownerId));
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ownerId: owner(ownerId) } }));
  } catch { /* A failed write never changes another owner's context. */ }
}

export function useActiveTripContext(ownerId?: string | null): ActiveTripContext | null {
  const scope = owner(ownerId);
  const [snapshot, setSnapshot] = useState(() => ({ owner: scope, trip: readActiveTripContext(ownerId) }));
  useEffect(() => {
    const reload = () => setSnapshot({ owner: scope, trip: readActiveTripContext(ownerId) });
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ ownerId?: string }>).detail?.ownerId === scope) reload();
    };
    const stored = (event: StorageEvent) => { if (!event.key || event.key === storageKey(ownerId)) reload(); };
    reload();
    window.addEventListener(eventName, changed);
    window.addEventListener("storage", stored);
    return () => { window.removeEventListener(eventName, changed); window.removeEventListener("storage", stored); };
  }, [ownerId, scope]);
  return snapshot.owner === scope ? snapshot.trip : readActiveTripContext(ownerId);
}
