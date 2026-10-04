import type { SupabaseClient } from "@supabase/supabase-js";
import { createRouteCockpitIntent, validateRouteCockpitIntent, type RouteCockpitIntent } from "../../../mobile/src/lib/routeCockpitIntent";
import { validateBudgetCockpitIntent, type BudgetCockpitIntent } from "../../../mobile/src/lib/budgetCockpitIntent";
import { parseWebJourney, WEB_JOURNEY_FIELDS, WebTripConflict, type WebJourney } from "../../../lib/cockpit/web-data";
import type { PlannerInput, RoutePlan } from "../../../mobile/src/types";
import type { Trip } from "./types";
import type { CityBenchmark } from "../../../lib/country-intelligence/city-benchmarks";

export type JourneyAttachment = RouteCockpitIntent | BudgetCockpitIntent;
export type SavedRouteChoice = { key: string; intent: RouteCockpitIntent };
/** A country's first benchmark may be a different city from this trip. */
export function initialBudgetCityId(trip: Pick<Trip, "destinationCode" | "destinationCity">, rows: readonly CityBenchmark[]) {
  const cityKey = (value: string) => value.toLocaleLowerCase("tr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").trim();
  const city = cityKey(trip.destinationCity || "");
  if (!city) return "";
  return rows.find(row => row.code === trip.destinationCode.toUpperCase()
    && [row.city.tr, row.city.en].some(name => cityKey(name) === city))?.id || "";
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function savedRouteChoices(rows: unknown[], owner: string): SavedRouteChoice[] {
  return rows.flatMap(value => {
    const row = record(value), data = record(row.trip_data), plan = record(data.plan);
    if (row.user_id !== owner || data.mobile_kind !== "route_plan" || !Array.isArray(plan.routes)) return [];
    const sourceId = typeof data.client_key === "string" && data.client_key ? data.client_key : String(row.id || "");
    return plan.routes.slice(0, 30).flatMap((_route, index) => {
      const intent = createRouteCockpitIntent({ id: sourceId, createdAt: String(data.saved_at || row.created_at || ""), plan: plan as unknown as RoutePlan,
        input: data.input as PlannerInput | undefined }, index, owner);
      return intent ? [{ key: `${row.id}:${index}`, intent }] : [];
    });
  });
}
export async function requireWebOwner(client: SupabaseClient, owner: string) {
  const { data, error } = await client.auth.getSession();
  if (error || !owner || data.session?.user.id !== owner) throw new Error("Hesabın değişti. Seyahatlerini yeniden aç.");
}
export async function readWebSavedRoutes(client: SupabaseClient, owner: string): Promise<SavedRouteChoice[]> {
  await requireWebOwner(client, owner);
  const { data, error } = await client.from("user_trips").select("id,user_id,trip_data,created_at")
    .eq("user_id", owner).eq("trip_data->>mobile_kind", "route_plan").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Kayıtlı rotaların yüklenemedi. Yeniden dene.");
  return savedRouteChoices(data || [], owner);
}
export function attachmentForTrip(intent: JourneyAttachment, trip: Trip): JourneyAttachment {
  if (intent.ownerId !== trip.userId || !(validateRouteCockpitIntent(intent) || validateBudgetCockpitIntent(intent))) throw new Error("Seçilen rota veya bütçe bu hesap için doğrulanamadı.");
  if (intent.kind !== "saved-route") return intent;
  const days = Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86400000) + 1;
  if (!Number.isFinite(days) || intent.route.dailyPlan.length > days) throw new Error("Rota seyahatinden daha uzun. Önce seyahat tarihlerini düzenle.");
  const snapshot = { ...intent, dates: { startDate: trip.startDate, endDate: trip.endDate } };
  if (!validateRouteCockpitIntent(snapshot)) throw new Error("Seyahat tarihlerini kontrol et.");
  return snapshot;
}
export async function saveWebJourney(client: SupabaseClient, trip: Trip, intent: JourneyAttachment, previous: WebJourney | null) {
  const snapshot = attachmentForTrip(intent, trip);
  if (previous && !Number.isFinite(Date.parse(previous.updatedAt))) throw new WebTripConflict();
  await requireWebOwner(client, trip.userId);
  // Patch only the chosen attachment: route and budget have one shared revision,
  // but replacing either must leave the other snapshot and trip checklist intact.
  const column = snapshot.kind === "saved-route" ? "route_snapshot" : "budget_snapshot";
  const table = client.from("trip_journey_details");
  const request = previous ? table.update({ [column]: snapshot }).eq("trip_id", trip.id).eq("owner_id", trip.userId).eq("updated_at", previous.updatedAt)
    : table.insert({ trip_id: trip.id, owner_id: trip.userId, [column]: snapshot });
  const { data, error } = await request.select(WEB_JOURNEY_FIELDS).maybeSingle();
  if (error && (["40001", "40P01"].includes(error.code) || !previous && error.code === "23505")) throw new WebTripConflict();
  if (error) throw new Error("Seyahate eklenemedi. Seçimin duruyor; yeniden deneyebilirsin.");
  if (!data) throw new WebTripConflict();
  return parseWebJourney(data, trip);
}
