import { ApiError, requestJson } from "./api";
import { config } from "./config";
import { validateBudgetCockpitIntent, type BudgetCockpitIntent } from "./budgetCockpitIntent";
import { validateRouteCockpitIntent, type RouteCockpitIntent } from "./routeCockpitIntent";

export type CockpitJourneyIntent = RouteCockpitIntent | BudgetCockpitIntent;
export type CockpitJourneyDetails = { tripId: string; ownerId: string; route: RouteCockpitIntent | null; budget: BudgetCockpitIntent | null; updatedAt: string };
type Row = { trip_id: string; owner_id: string; route_snapshot: unknown; budget_snapshot: unknown; updated_at: string };
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export function validJourneyIntent(intent: unknown, owner: string): intent is CockpitJourneyIntent {
  return (validateRouteCockpitIntent(intent) || validateBudgetCockpitIntent(intent)) && intent.ownerId === owner;
}
function headers(token: string) {
  if (!token || !config.supabaseUrl || !config.supabaseAnonKey) throw new ApiError("Session unavailable", 401);
  return { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}`, Prefer: "return=representation" };
}
function url(owner: string, tripId: string, version?: string) {
  if (!uuid.test(owner) || !uuid.test(tripId)) throw new ApiError("Invalid trip", 400);
  const params = new URLSearchParams({ select: "trip_id,owner_id,route_snapshot,budget_snapshot,updated_at", owner_id: `eq.${owner}`, trip_id: `eq.${tripId}` });
  if (version) params.set("updated_at", `eq.${version}`);
  return `${config.supabaseUrl}/rest/v1/trip_journey_details?${params}`;
}
function parse(row: Row, owner: string, tripId: string): CockpitJourneyDetails {
  if (!row || row.owner_id !== owner || row.trip_id !== tripId || !Number.isFinite(Date.parse(row.updated_at))
    || row.route_snapshot !== null && (!validateRouteCockpitIntent(row.route_snapshot) || row.route_snapshot.ownerId !== owner)
    || row.budget_snapshot !== null && (!validateBudgetCockpitIntent(row.budget_snapshot) || row.budget_snapshot.ownerId !== owner)) throw new ApiError("Invalid saved journey", 502);
  return { tripId, ownerId: owner, route: row.route_snapshot as RouteCockpitIntent | null, budget: row.budget_snapshot as BudgetCockpitIntent | null, updatedAt: row.updated_at };
}
export async function readCockpitJourney(owner: string, tripId: string, token: string, signal?: AbortSignal) {
  const rows = await requestJson<Row[]>(url(owner, tripId), { headers: headers(token), signal });
  if (!Array.isArray(rows) || rows.length > 1) throw new ApiError("Invalid journey response", 502);
  return rows.length ? parse(rows[0], owner, tripId) : null;
}
export async function saveCockpitJourney(owner: string, tripId: string, token: string, intent: CockpitJourneyIntent, previous: CockpitJourneyDetails | null) {
  if (!validJourneyIntent(intent, owner) || intent.kind === "saved-route" && !intent.dates
    || previous && (previous.ownerId !== owner || previous.tripId !== tripId || !Number.isFinite(Date.parse(previous.updatedAt)))) throw new ApiError("Invalid journey", 400);
  const column = intent.kind === "saved-route" ? "route_snapshot" : "budget_snapshot";
  let rows: Row[];
  try {
    rows = await requestJson<Row[]>(url(owner, tripId, previous?.updatedAt), {
      method: previous ? "PATCH" : "POST", headers: headers(token),
      body: { ...(!previous ? { trip_id: tripId, owner_id: owner } : {}), [column]: intent },
    });
  } catch (error) {
    // PostgREST may return a serialization/deadlock SQLSTATE as 500. Expose the
    // same reload-and-reconfirm flow as CAS misses or a simultaneous first save.
    if (error instanceof ApiError && (["40001", "40P01"].includes(error.code) || !previous && error.code === "23505")) {
      throw new ApiError("Journey changed; reload before saving", 409, "journey_conflict");
    }
    throw error;
  }
  if (!Array.isArray(rows) || rows.length !== 1) throw new ApiError("Journey changed; reload before saving", 409);
  return parse(rows[0], owner, tripId);
}
