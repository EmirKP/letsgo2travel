import { findAirportByIata } from "./airport-search";
import { airportTimeZone } from "./airport-time-zones";
import { validTimeZone, zonedParts } from "./zoned-time";

export type FlightAirport = { iata: string; name: string; city: string; country: string; countryCode: string; timeZone: string };
export type FlightMatch = {
  id: string; flightNumber: string; airline: string;
  origin: FlightAirport; destination: FlightAirport;
  departureAt: string; arrivalAt: string;
  departureDate: string; departureTime: string; arrivalDate: string; arrivalTime: string;
  source: "AeroDataBox"; fetchedAt: string;
};
export type FlightLookupReason = "past-departure" | "incomplete" | "not-found" | "status-unavailable" | null;
export type FlightLookupInspection = { flights: FlightMatch[]; reason: FlightLookupReason };

export function flightLookupInput(number: unknown, date: unknown, now = new Date()) {
  if (typeof number !== "string" || number.length > 16 || typeof date !== "string") return null;
  const flightNumber = number.toUpperCase().replace(/\s/g, "");
  if (!/^(?:[A-Z][A-Z0-9]|[0-9][A-Z]|[A-Z]{3})[0-9]{1,4}[A-Z]?$/.test(flightNumber)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) return null;
  // A departure airport can already be on tomorrow's date or still yesterday.
  const today = Date.parse(now.toISOString().slice(0, 10));
  if (time < today - 86400000 || time > today + 730 * 86400000) return null;
  return { flightNumber, date };
}

const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const shortText = (v: unknown, length = 80) => typeof v === "string" ? v.trim().slice(0, length) : "";
function airport(value: unknown): FlightAirport | null {
  const a = record(value);
  const code = shortText(a.iata).toUpperCase();
  const known = findAirportByIata(code);
  const suppliedZone = shortText(a.timeZone);
  const catalogZone = airportTimeZone(code);
  if (suppliedZone && (!validTimeZone(suppliedZone) || catalogZone
    && new Intl.DateTimeFormat("en", { timeZone: suppliedZone }).resolvedOptions().timeZone
      !== new Intl.DateTimeFormat("en", { timeZone: catalogZone }).resolvedOptions().timeZone)) return null;
  const zone = catalogZone || airportTimeZone(code, suppliedZone);
  if (!known || !zone) return null;
  const { iata, name, city, country, countryCode } = known;
  return { iata, name, city, country, countryCode, timeZone: zone };
}

function scheduled(value: unknown, zone: string) {
  const v = record(value);
  const utc = shortText(v.utc).replace(" ", "T");
  const utcParts = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,7})?)?(?:Z|\+00:00)$/.exec(utc);
  if (!utcParts) return null;
  const stamp = Date.parse(utc);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== utcParts[1]) return null;
  const parts = zonedParts(stamp, zone);
  const local = shortText(v.local).replace(" ", "T");
  const localParts = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,7})?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/.exec(local);
  if (!localParts) return null;
  // Conflicting local/UTC values must not silently shift a user's flight.
  if (localParts[1] !== parts.date || `${localParts[2]}:${localParts[3]}` !== parts.time.slice(0, 5)
    || localParts[4] && localParts[4] !== parts.time.slice(6, 8)) return null;
  if (localParts[5] && Math.floor(Date.parse(local) / 60000) !== Math.floor(stamp / 60000)) return null;
  return { iso: new Date(stamp).toISOString(), date: parts.date, time: parts.time.slice(0, 5) };
}

/** Only complete, exact-date scheduled legs. Estimates, gates and inferred status are never substituted. */
export function inspectFlightMatches(payload: unknown, query: { flightNumber: string; date: string }, now = new Date()): FlightLookupInspection {
  if (!Array.isArray(payload)) throw new Error("invalid-provider-response");
  const matches = new Map<string, FlightMatch>();
  let pastDeparture = false, incomplete = false, unavailableStatus = false;
  for (const item of payload.slice(0, 100)) {
    const f = record(item);
    if (shortText(f.number).toUpperCase().replace(/\s/g, "") !== query.flightNumber) continue;
    const dep = record(f.departure), arr = record(f.arrival);
    // Ignore identifiable wrong-date legs before classifying missing fields.
    // A past-departure reason still requires the fully validated local/UTC pair below.
    const suppliedDate = /^(\d{4}-\d{2}-\d{2})(?:[ T]|$)/.exec(shortText(record(dep.scheduledTime).local))?.[1];
    if (suppliedDate && suppliedDate !== query.date) continue;
    const origin = airport(dep.airport), destination = airport(arr.airport);
    if (!origin || !destination || origin.iata === destination.iata) { incomplete = true; continue; }
    const departure = scheduled(dep.scheduledTime, origin.timeZone), arrival = scheduled(arr.scheduledTime, destination.timeZone);
    if (!departure || !arrival || Date.parse(arrival.iso) <= Date.parse(departure.iso)) { incomplete = true; continue; }
    if (departure.date !== query.date) continue;
    const status = shortText(f.status);
    if (f.isCargo === true || ["Canceled", "Cancelled", "CanceledUncertain", "Diverted"].includes(status)) { unavailableStatus = true; continue; }
    if (Date.parse(departure.iso) <= now.getTime()) { pastDeparture = true; continue; }
    if (["EnRoute", "Departed", "Approaching", "Arrived"].includes(status)) { unavailableStatus = true; continue; }
    const id = `${query.flightNumber}:${origin.iata}:${destination.iata}:${departure.iso}`;
    matches.set(id, { id, flightNumber: query.flightNumber, airline: shortText(record(f.airline).name), origin, destination,
      departureAt: departure.iso, arrivalAt: arrival.iso, departureDate: departure.date, departureTime: departure.time,
      arrivalDate: arrival.date, arrivalTime: arrival.time, source: "AeroDataBox", fetchedAt: now.toISOString() });
  }
  const flights = [...matches.values()].sort((a,b) => a.departureAt.localeCompare(b.departureAt)).slice(0, 12);
  // An incomplete alternative may still be upcoming. Do not label all results
  // as past merely because another complete leg has an earlier departure.
  return { flights, reason: flights.length ? null : incomplete ? "incomplete" : unavailableStatus ? "status-unavailable" : pastDeparture ? "past-departure" : "not-found" };
}

/** Compatibility for callers that only need selectable matches. */
export function normalizeFlightMatches(payload: unknown, query: { flightNumber: string; date: string }, now = new Date()): FlightMatch[] {
  return inspectFlightMatches(payload, query, now).flights;
}
