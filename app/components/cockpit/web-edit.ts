import { cockpitEditForm, cockpitEditInput, rebaseCockpitEditForm } from "../../../mobile/src/lib/cockpitEdit";
import type { CockpitTrip } from "../../../mobile/src/lib/supabaseData";
import type { TripFormState } from "../../../mobile/src/lib/cockpitForm";
import { personalTripPatch, type WebTripDetailsPatch } from "../../../lib/cockpit/web-data";
import type { Trip, TripPersonalUpdate, TripStatus } from "./types";

export type WebTripDraft = TripFormState & { status: TripStatus };
export function mobileTrip(trip: Trip): CockpitTrip {
  return { ...trip, arrivalAt: trip.arrivalAt ?? null, originIata: trip.originIata ?? null,
    destinationIata: trip.destinationIata ?? null, airline: trip.airline ?? null,
    flightNumber: trip.flightNumber ?? null, appLanguage: "tr" };
}
export function webEditForm(trip: Trip): WebTripDraft {
  const form = cockpitEditForm(mobileTrip(trip));
  // Older web trips can contain an instant without airport fields. Require
  // complete airport/local-time information before changing that flight.
  if (trip.departureAt || trip.arrivalAt) form.mode = "flight";
  return { ...form, status: trip.status };
}
export function rebaseWebEdit(baseline: WebTripDraft, draft: WebTripDraft, latest: WebTripDraft): WebTripDraft {
  return { ...rebaseCockpitEditForm(baseline, draft, latest), status: draft.status !== baseline.status ? draft.status : latest.status };
}
export function webEditUpdate(form: WebTripDraft): TripPersonalUpdate {
  return { startDate: form.startDate, endDate: form.endDate, flightPnr: form.flightPnr, status: form.status, details: form };
}
/** Personal edits do not require reconstructing a legacy flight's missing fields. */
export function webTripDetailsChanged(trip: Trip, form: TripFormState) {
  const baseline = webEditForm(trip);
  const fields = ["mode", "originAirport", "airport", "destinationCountry", "destinationCode", "destinationCity", "startDate", "departureTime", "arrivalDate", "arrivalTime", "departureUtc", "arrivalUtc", "airline", "flightNumber"] as const;
  return fields.some(key => JSON.stringify(form[key]) !== JSON.stringify(baseline[key]));
}
export function detailedTripPatch(trip: Trip, input: TripPersonalUpdate): WebTripDetailsPatch {
  // Even a forged form cannot edit provider identity/timetable. Keep personal
  // edits compatible with the existing managed-flight path and arrival guard.
  if (trip.flightLookupManaged || !input.details) return personalTripPatch(trip, input);
  const form = input.details;
  if (!webTripDetailsChanged(trip, form)) return personalTripPatch(trip, input);
  if (form.mode !== webEditForm(trip).mode) throw new Error("Seyahatin uçuş türü bu düzenlemede değiştirilemez.");
  if ([form.destinationCountry, form.destinationCity].some(value => value.length > 100)
    || form.mode === "flight" && (!/^[A-Z]{3}$/.test(form.originAirport?.iata || "") || !/^[A-Z]{3}$/.test(form.airport?.iata || ""))) throw new Error("Ülke, şehir ve havalimanı bilgilerini kontrol et.");
  const result = cockpitEditInput(mobileTrip(trip), form, "tr");
  if (!result.update) throw new Error(result.error);
  const personal = personalTripPatch({ ...trip, departureAt: null, arrivalAt: null, originIata: null, destinationIata: null }, {
    startDate: form.startDate, endDate: form.endDate, flightPnr: form.flightPnr, status: input.status,
  });
  const update = result.update;
  return { ...personal, destination_country: form.destinationCountry.trim(), destination_code: form.destinationCode.toUpperCase(), destination_city: form.destinationCity.trim() || null,
    ...(form.mode === "flight" ? { origin_iata: update.originIata!, destination_iata: update.destinationIata!, departure_at: update.departureAt ?? null,
      arrival_at: update.arrivalAt ?? null, airline: form.airline.trim() || null, flight_number: form.flightNumber.trim() || null } : {}),
  };
}
