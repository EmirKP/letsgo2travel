import { airportTimeZone } from "../../../lib/airport-time-zones";
import { validTimeZone, zonedParts } from "../../../lib/zoned-time";
import { alpha3FromAlpha2 } from "../data/countryIso";
import { flightTimes, tripFormError, type TripFormState } from "./cockpitForm";
import { isCalendarDate } from "./dates";
import type { AppLocale } from "./locale";
import { translateCopy } from "./locale";
import type { CockpitTrip, UpdateCockpitTripInput } from "./supabaseData";

/** Keep local edits, but adopt remote changes to fields the user did not touch. */
export function rebaseCockpitEditForm(baseline: TripFormState, draft: TripFormState, latest: TripFormState): TripFormState {
  const result = { ...latest };
  for (const key of Object.keys(draft) as Array<keyof TripFormState>) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(baseline[key])) Object.assign(result, { [key]: draft[key] });
  }
  return result;
}

export function cockpitEditTimeZone(trip: CockpitTrip, baseline: TripFormState, draft: TripFormState, key: "originAirport" | "airport", timeZone: string): TripFormState {
  if (!draft[key]) return draft;
  const departure = key === "originAirport";
  const dateKey = departure ? "startDate" : "arrivalDate", timeKey = departure ? "departureTime" : "arrivalTime", utcKey = departure ? "departureUtc" : "arrivalUtc";
  const next = { ...draft, [key]: { ...draft[key], timeZone }, [utcKey]: undefined };
  const instant = departure ? trip.departureAt : trip.arrivalAt;
  // Missing catalogue zones must not erase a known instant. Only fill fields
  // still untouched (or last derived here); never replace a typed itinerary.
  if (!instant || baseline[key]?.timeZone || !validTimeZone(timeZone) || !Number.isFinite(Date.parse(instant))) return next;
  const unchanged = (!draft[dateKey] || draft[dateKey] === baseline[dateKey]) && (!draft[timeKey] || draft[timeKey] === baseline[timeKey]);
  const previousZone = draft[key]?.timeZone;
  const previous = validTimeZone(previousZone) ? zonedParts(new Date(instant), previousZone) : null;
  const stillDerived = previous && draft[dateKey] === previous.date && draft[timeKey] === previous.time.slice(0, 5);
  if (unchanged || stillDerived) {
    const local = zonedParts(new Date(instant), timeZone);
    next[dateKey] = local.date; next[timeKey] = local.time.slice(0, 5); next[utcKey] = new Date(instant).toISOString();
  }
  return next;
}

export function cockpitEditForm(trip: CockpitTrip): TripFormState {
  const local = (instant: string | null, iata: string | null) => {
    try { return instant ? zonedParts(new Date(instant), airportTimeZone(iata || "")) : null; } catch { return null; }
  };
  const departure = local(trip.departureAt, trip.originIata), arrival = local(trip.arrivalAt, trip.destinationIata);
  return {
    mode: trip.originIata || trip.destinationIata ? "flight" : "other",
    originAirport: trip.originIata ? { iata: trip.originIata, name: trip.originIata, city: "", country: "", countryCode: "", timeZone: airportTimeZone(trip.originIata) } : null,
    airport: trip.destinationIata ? { iata: trip.destinationIata, name: trip.destinationIata, city: trip.destinationCity || "", country: trip.destinationCountry, countryCode: trip.destinationCode, timeZone: airportTimeZone(trip.destinationIata) } : null,
    countryAlpha3: alpha3FromAlpha2(trip.destinationCode), destinationCountry: trip.destinationCountry,
    destinationCode: trip.destinationCode, destinationCity: trip.destinationCity || "", startDate: departure?.date || trip.startDate, endDate: trip.endDate,
    departureTime: departure?.time.slice(0, 5) || "", arrivalDate: arrival?.date || "", arrivalTime: arrival?.time.slice(0, 5) || "",
    departureUtc: trip.departureAt && Number.isFinite(Date.parse(trip.departureAt)) ? new Date(trip.departureAt).toISOString() : undefined,
    arrivalUtc: trip.arrivalAt && Number.isFinite(Date.parse(trip.arrivalAt)) ? new Date(trip.arrivalAt).toISOString() : undefined,
    airline: trip.airline || "", flightNumber: trip.flightNumber || "", flightPnr: trip.flightPnr || "",
  };
}

export function cockpitEditInput(trip: CockpitTrip, form: TripFormState, locale: AppLocale, now = new Date()): { error: string; update?: UpdateCockpitTripInput } {
  const copy = (tr: string, en: string, sq: string) => translateCopy(locale, tr, en, sq);
  // The provider's identity/timetable remains immutable. Only personal data is
  // editable on a managed flight, even after its short-lived overlay expires.
  if (trip.flightLookupManaged) {
    if (!isCalendarDate(form.endDate) || form.endDate < trip.startDate || (trip.providerFlight?.arrivalDate && form.endDate < trip.providerFlight.arrivalDate)) return { error: copy("Bitiş tarihi varıştan önce olamaz.", "The end date cannot be before arrival.", "Data e përfundimit nuk mund të jetë para mbërritjes.") };
    if (form.flightPnr && !/^[A-Z0-9-]{3,20}$/.test(form.flightPnr)) return { error: copy("PNR 3–20 harf, rakam veya tire içerebilir.", "PNR must contain 3–20 letters, numbers or hyphens.", "PNR duhet të ketë 3–20 shkronja, numra ose viza.") };
    return { error: "", update: { endDate: form.endDate, flightPnr: form.flightPnr } };
  }
  const error = tripFormError(form, now, locale, { allowPast: true });
  if (error) return { error };
  const times = flightTimes(form);
  return { error: "", update: {
    destinationCountry: form.destinationCountry, destinationCode: form.destinationCode, destinationCity: form.destinationCity,
    startDate: form.startDate, endDate: form.endDate, flightPnr: form.flightPnr,
    ...(form.mode === "flight" ? {
      originIata: form.originAirport!.iata, destinationIata: form.airport!.iata,
      departureAt: times.departure.ok ? times.departure.iso : null, arrivalAt: times.arrival.ok ? times.arrival.iso : null,
      airline: form.airline, flightNumber: form.flightNumber,
    } : {}),
  } };
}
