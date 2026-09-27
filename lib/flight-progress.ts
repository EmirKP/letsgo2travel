import type { FlightMatch } from "./flight-lookup";

export const FLIGHT_STATUS_FRESHNESS_MS = 15 * 60_000;
export const FLIGHT_STATUSES = ["Unknown", "Expected", "EnRoute", "CheckIn", "Boarding", "GateClosed", "Departed", "Delayed", "Approaching", "Arrived", "Canceled", "Diverted", "CanceledUncertain"] as const;
export type FlightStatus = typeof FLIGHT_STATUSES[number];
export type FlightTiming = { revisedAt: string | null; revisedKind: "estimated" | "actual" | "unknown" | null };
export type FlightProgress = {
  status: FlightStatus;
  phase: "upcoming" | "en-route" | "arrived" | "unavailable" | "unknown";
  sourceUpdatedAt: string | null;
  freshUntil: string | null;
  freshness: "fresh" | "stale" | "unknown";
  departure: FlightTiming;
  arrival: FlightTiming;
};

export function flightSourceTime(value: unknown, now = new Date()): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?(?:Z|\+00:00)$/.test(value)) return null;
  const stamp = Date.parse(value.replace(" ", "T"));
  if (!Number.isFinite(stamp) || stamp > now.getTime() + 30_000 || new Date(stamp).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return new Date(stamp).toISOString();
}

export function flightProgress(statusValue: unknown, updated: unknown, departureRevised: string | null, arrivalRevised: string | null, now = new Date()): FlightProgress {
  const status: FlightStatus = FLIGHT_STATUSES.includes(statusValue as FlightStatus) ? statusValue as FlightStatus : "Unknown";
  const airborne = ["EnRoute", "Departed", "Approaching"].includes(status);
  const terminal = ["Canceled", "Diverted", "CanceledUncertain"].includes(status);
  const phase = status === "Arrived" ? "arrived" : terminal ? "unavailable" : airborne ? "en-route" : status === "Unknown" ? "unknown" : "upcoming";
  const sourceUpdatedAt = flightSourceTime(updated, now);
  const freshUntil = sourceUpdatedAt ? new Date(Date.parse(sourceUpdatedAt) + FLIGHT_STATUS_FRESHNESS_MS).toISOString() : null;
  const timing = (at: string | null, completed: boolean): FlightTiming => {
    if (!at) return { revisedAt: null, revisedKind: null };
    // A future timestamp cannot truthfully be called an actual movement.
    const kind = status === "Unknown" || terminal || completed && Date.parse(at) > now.getTime() + 30_000 ? "unknown" : completed ? "actual" : "estimated";
    return { revisedAt: at, revisedKind: kind };
  };
  return { status, phase, sourceUpdatedAt, freshUntil, freshness: !freshUntil ? "unknown" : Date.parse(freshUntil) > now.getTime() ? "fresh" : "stale",
    departure: timing(departureRevised, airborne || status === "Arrived"), arrival: timing(arrivalRevised, status === "Arrived") };
}

export function currentFlightTime(flight: FlightMatch, movement: "departure" | "arrival") {
  const timing = flight.progress?.[movement];
  return timing?.revisedAt && (timing.revisedKind === "actual" || timing.revisedKind === "estimated") ? timing.revisedAt
    : movement === "departure" ? flight.departureAt : flight.arrivalAt;
}

export function flightSelectionDeadline(flight: FlightMatch, now = new Date()): number {
  const progress = flight.progress;
  if (progress?.phase === "arrived" || progress?.phase === "unavailable") return 0;
  const retrievedDeadline = Date.parse(flight.fetchedAt) + 10 * 60_000;
  const scheduledDeparture = Date.parse(flight.departureAt);
  if (progress?.phase === "en-route" || scheduledDeparture <= now.getTime()) {
    if (!progress || !progress.freshUntil || Date.parse(progress.freshUntil) <= now.getTime()) return 0;
    if (progress.phase !== "en-route" && progress.phase !== "upcoming") return 0;
    const target = Date.parse(currentFlightTime(flight, progress.phase === "en-route" ? "arrival" : "departure"));
    return Math.min(retrievedDeadline, target, Date.parse(progress.freshUntil));
  }
  return Math.min(retrievedDeadline, scheduledDeparture);
}
