import type { FlightMatch } from "../../../lib/flight-lookup";
import { validTimeZone, zonedParts } from "../../../lib/zoned-time";

export type FlightSelection = FlightMatch & { receipt?: string | null; expiresAt: string; maySave: boolean };

/** Only the documented display fields cross into the cockpit's in-memory view. */
export function parseFlightMatch(value: unknown, number?: string, date?: string): FlightMatch | null {
  if (!value || typeof value !== "object") return null;
  const f = value as FlightMatch;
  const short = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
  if (!short(f.id, 180) || !/^[A-Z0-9]{2,8}$/.test(f.flightNumber) || number && f.flightNumber !== number
    || date && f.departureDate !== date || f.source !== "AeroDataBox" || typeof f.airline !== "string" || f.airline.length > 80) return null;
  for (const a of [f.origin, f.destination]) {
    if (!a || typeof a !== "object" || !/^[A-Z]{3}$/.test(a.iata) || !/^[A-Z]{2}$/.test(a.countryCode)
      || !short(a.name, 180) || !short(a.city, 100) || !short(a.country, 100) || !validTimeZone(a.timeZone)) return null;
  }
  const departure = Date.parse(f.departureAt), arrival = Date.parse(f.arrivalAt), fetched = Date.parse(f.fetchedAt);
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || !Number.isFinite(fetched) || arrival <= departure || f.origin.iata === f.destination.iata) return null;
  const dep = zonedParts(departure, f.origin.timeZone), arr = zonedParts(arrival, f.destination.timeZone);
  if (dep.date !== f.departureDate || dep.time.slice(0, 5) !== f.departureTime || arr.date !== f.arrivalDate || arr.time.slice(0, 5) !== f.arrivalTime) return null;
  const airport = (a: FlightMatch["origin"]) => ({ iata: a.iata, name: a.name, city: a.city, country: a.country, countryCode: a.countryCode, timeZone: a.timeZone });
  return { id: f.id, flightNumber: f.flightNumber, airline: f.airline, origin: airport(f.origin), destination: airport(f.destination),
    departureAt: f.departureAt, arrivalAt: f.arrivalAt, departureDate: f.departureDate, departureTime: f.departureTime,
    arrivalDate: f.arrivalDate, arrivalTime: f.arrivalTime, source: "AeroDataBox", fetchedAt: f.fetchedAt };
}

export function activeFlightExpiry(value: unknown, fetchedAt: string, now = Date.now()): value is string {
  if (typeof value !== "string") return false;
  const expiry = Date.parse(value), fetched = Date.parse(fetchedAt);
  return Number.isFinite(expiry) && expiry > now && expiry > fetched && expiry <= fetched + 5 * 86400000 + 1000;
}

export function parseFlightSelection(value: unknown, number: string, date: string): FlightSelection | null {
  const flight = parseFlightMatch(value, number, date);
  if (!flight) return null;
  const selection = value as FlightSelection;
  if (!activeFlightExpiry(selection.expiresAt, flight.fetchedAt) || typeof selection.maySave !== "boolean"
    || selection.maySave && (typeof selection.receipt !== "string" || !selection.receipt || selection.receipt.length > 16000)
    || !selection.maySave && selection.receipt != null) return null;
  return { ...flight, expiresAt: selection.expiresAt, maySave: selection.maySave, receipt: selection.maySave ? selection.receipt : null };
}

export function canSaveFlightSelection(selection: FlightSelection, now = Date.now()) {
  return selection.maySave && Boolean(selection.receipt) && activeFlightExpiry(selection.expiresAt, selection.fetchedAt, now)
    && now < Date.parse(selection.fetchedAt) + 10 * 60_000 && now < Date.parse(selection.departureAt);
}
