import { isCalendarDate, localIsoDate } from "./dates";
import type { CockpitTrip } from "./supabaseData";

// This snapshot deliberately excludes PNR, airline and other booking details.
export type SafetyTrip = Pick<CockpitTrip, "id" | "destinationCountry" | "destinationCode" | "destinationCity" | "startDate" | "endDate" | "status" | "originIata" | "destinationIata">;
const key = (ownerId?: string | null) => `l2t:safety-trips:v1:${ownerId || "guest"}`;
export function readSafetyTrips(ownerId?: string | null): SafetyTrip[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key(ownerId)) || "[]");
    return Array.isArray(saved) ? saved.filter(item => item && typeof item.id === "string" && typeof item.destinationCode === "string") : [];
  } catch { return []; }
}
export function saveSafetyTrips(ownerId: string | null | undefined, trips: SafetyTrip[]) {
  const snapshot = trips.map(({id,destinationCountry,destinationCode,destinationCity,startDate,endDate,status,originIata,destinationIata}) =>
    ({id,destinationCountry,destinationCode,destinationCity,startDate,endDate,status,originIata,destinationIata}));
  localStorage.setItem(key(ownerId),JSON.stringify(snapshot));
}

export function travelRecap<T extends Pick<SafetyTrip,"startDate" | "endDate" | "status">>(trips: T[], year: number, today = localIsoDate()) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31` < today ? `${year}-12-31` : today;
  const interval = (trip: T) => {
    if (!["active","completed"].includes(trip.status) || !isCalendarDate(trip.startDate) || !isCalendarDate(trip.endDate) || trip.startDate > trip.endDate) return null;
    const start = trip.startDate > yearStart ? trip.startDate : yearStart;
    const end = trip.endDate < yearEnd ? trip.endDate : yearEnd;
    return start <= end ? [Date.parse(`${start}T00:00:00Z`), Date.parse(`${end}T00:00:00Z`)] : null;
  };
  const actualTrips = trips.filter(trip => interval(trip) !== null);
  const days = new Set<number>();
  for (const trip of actualTrips) {
    const [start,end] = interval(trip)!;
    for (let day = start; day <= end; day += 86400000) days.add(day);
  }
  return { trips: actualTrips, days: days.size, daysForTrip: (trip: T) => { const range = interval(trip); return range ? (range[1]-range[0])/86400000+1 : 0; } };
}
