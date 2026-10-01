import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChecklistItem, Trip, TripPersonalUpdate, TripStatus } from "@/app/components/cockpit/types";
import { validateRouteCockpitIntent, type RouteCockpitIntent } from "../../mobile/src/lib/routeCockpitIntent";
import { validateBudgetCockpitIntent, type BudgetCockpitIntent } from "../../mobile/src/lib/budgetCockpitIntent";
import { airportTimeZone } from "../airport-time-zones";
import { zonedParts } from "../zoned-time";

export const WEB_TRIP_FIELDS = "id,user_id,destination_country,destination_code,destination_city,start_date,end_date,departure_at,arrival_at,origin_iata,destination_iata,flight_lookup_managed,flight_pnr,checklist_items,status,created_at,updated_at";
export type WebJourney = { route: RouteCockpitIntent | null; budget: BudgetCockpitIntent | null };
type TripRow = Record<string, unknown>;
const statuses: TripStatus[] = ["upcoming", "active", "completed", "cancelled"];
const string = (value: unknown) => typeof value === "string" ? value : "";
const nullable = (value: unknown) => typeof value === "string" ? value : null;

export function webTrip(row: TripRow, owner: string): Trip {
  if (row.user_id !== owner || !string(row.id) || !Number.isFinite(Date.parse(string(row.updated_at)))) throw new Error("Seyahat kaydı doğrulanamadı.");
  return {
    id: string(row.id), userId: owner, destinationCountry: string(row.destination_country) || "Uçuş",
    destinationCode: string(row.destination_code), destinationCity: nullable(row.destination_city),
    startDate: string(row.start_date), endDate: string(row.end_date), departureAt: nullable(row.departure_at),
    arrivalAt: nullable(row.arrival_at), originIata: nullable(row.origin_iata), destinationIata: nullable(row.destination_iata),
    flightLookupManaged: row.flight_lookup_managed === true, flightPnr: nullable(row.flight_pnr),
    // Preserve event metadata and all other checklist fields when toggling one item.
    checklistItems: Array.isArray(row.checklist_items) ? row.checklist_items.filter(item => item && typeof item.id === "string" && typeof item.label === "string") as ChecklistItem[] : [],
    status: statuses.includes(row.status as TripStatus) ? row.status as TripStatus : "upcoming",
    createdAt: string(row.created_at), updatedAt: string(row.updated_at),
  };
}
export async function readWebTrips(client: SupabaseClient, owner: string) {
  const { data, error } = await client.from("trips").select(WEB_TRIP_FIELDS).eq("user_id", owner).order("start_date", { ascending: true });
  if (error) throw new Error("Seyahatler yüklenemedi. Yeniden dene.");
  return (data || []).map(row => webTrip(row as unknown as TripRow, owner));
}
export async function readWebJourney(client: SupabaseClient, trip: Pick<Trip, "id" | "userId">): Promise<WebJourney | null> {
  const { data, error } = await client.from("trip_journey_details").select("trip_id,owner_id,route_snapshot,budget_snapshot").eq("trip_id", trip.id).eq("owner_id", trip.userId).maybeSingle();
  if (error) throw new Error("Kayıtlı rota ve bütçe yüklenemedi. Yeniden dene.");
  if (!data) return null;
  if (data.trip_id !== trip.id || data.owner_id !== trip.userId
    || data.route_snapshot !== null && (!validateRouteCockpitIntent(data.route_snapshot) || data.route_snapshot.ownerId !== trip.userId)
    || data.budget_snapshot !== null && (!validateBudgetCockpitIntent(data.budget_snapshot) || data.budget_snapshot.ownerId !== trip.userId)) throw new Error("Kayıtlı rota veya bütçe doğrulanamadı.");
  return { route: data.route_snapshot, budget: data.budget_snapshot };
}
export class WebTripConflict extends Error {
  constructor() { super("Seyahat başka bir cihazda değişti veya silindi. Güncel kaydı yükleyip değişikliklerini yeniden gözden geçir."); }
}
function calendarDay(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function personalTripPatch(trip: Trip, input: TripPersonalUpdate) {
  if (!calendarDay(input.startDate) || !calendarDay(input.endDate) || input.endDate < input.startDate || !statuses.includes(input.status)) throw new Error("Seyahat tarihlerini ve durumunu kontrol et.");
  // Changing flight-local dates needs the airport/time-zone editor. A personal
  // web edit must never silently move a persisted flight instant or provider date.
  if ((trip.flightLookupManaged || trip.departureAt || trip.originIata || trip.destinationIata) && input.startDate !== trip.startDate) throw new Error("Uçuş başlangıcını uygulamadaki havalimanı ve saat alanlarıyla birlikte düzenle.");
  if (trip.arrivalAt && input.endDate < trip.endDate) {
    const zone = airportTimeZone(trip.destinationIata || "");
    // An unknown airport zone cannot be guessed from the viewer's device.
    if (!zone) throw new Error("Varış saat dilimi bilinmiyor. Bitiş tarihini uygulamadaki ayrıntılı düzenlemeden değiştir.");
    if (input.endDate < zonedParts(new Date(trip.arrivalAt), zone).date) throw new Error("Bitiş tarihi uçuş varışından önce olamaz.");
  }
  const pnr = (input.flightPnr || "").trim().toUpperCase();
  if (pnr && !/^[A-Z0-9-]{3,20}$/.test(pnr)) throw new Error("PNR 3–20 harf, rakam veya tire içerebilir.");
  return { start_date: input.startDate, end_date: input.endDate, flight_pnr: pnr || null, status: input.status };
}
export async function patchWebTrip(client: SupabaseClient, trip: Trip, update: { checklist_items: ChecklistItem[] } | ReturnType<typeof personalTripPatch>) {
  const { data, error } = await client.from("trips").update(update).eq("id", trip.id).eq("user_id", trip.userId).eq("updated_at", trip.updatedAt).select(WEB_TRIP_FIELDS).maybeSingle();
  if (error) throw new Error("Seyahat kaydedilemedi. Değişikliklerin duruyor; yeniden deneyebilirsin.");
  if (!data) throw new WebTripConflict();
  return webTrip(data as unknown as TripRow, trip.userId);
}
export async function deleteWebTrip(client: SupabaseClient, trip: Trip) {
  const { data, error } = await client.from("trips").delete().eq("id", trip.id).eq("user_id", trip.userId).eq("updated_at", trip.updatedAt).select("id").maybeSingle();
  if (error) throw new Error("Seyahat silinemedi. Yeniden dene.");
  if (!data) throw new WebTripConflict();
}
