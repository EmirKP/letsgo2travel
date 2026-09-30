import type { PlannerInput, RouteSuggestion, SavedRoutePlan } from "../types";

export type RouteCockpitIntent = {
  kind: "saved-route";
  ownerId: string | null;
  sourceRouteId: string;
  sourceSavedAt: string;
  routeIndex: number;
  route: RouteSuggestion;
  input: PlannerInput | null;
  dates?: { startDate: string; endDate: string };
};

const text = (value: unknown, limit: number) => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
function validDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateRouteCockpitIntent(value: unknown): value is RouteCockpitIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intent = value as RouteCockpitIntent;
  if (intent.kind !== "saved-route" || !(intent.ownerId === null || text(intent.ownerId, 80)) || !text(intent.sourceRouteId, 160)
    || !text(intent.sourceSavedAt, 40) || !Number.isFinite(Date.parse(intent.sourceSavedAt))
    || !Number.isInteger(intent.routeIndex) || intent.routeIndex < 0 || intent.routeIndex > 29) return false;
  const route = intent.route;
  if (!route || !text(route.name, 240) || !text(route.country, 240) || !Array.isArray(route.dailyPlan)
    || route.dailyPlan.length < 1 || route.dailyPlan.length > 30 || route.dailyPlan.some(day => !text(day, 600))) return false;
  for (const key of ["cityOrRegion", "destinationCode", "why", "visaStatus", "visaNote", "visaSourceUrl", "estimatedBudget", "idealDuration", "bestFor", "difficulty", "transportEase", "safetyNote"] as const) {
    if (route[key] !== undefined && (typeof route[key] !== "string" || route[key].length > 3000)) return false;
  }
  if (route.warnings !== undefined && (!Array.isArray(route.warnings) || route.warnings.length > 30 || route.warnings.some(warning => !text(warning, 3000)))) return false;
  if (intent.input !== null) {
    if (!intent.input || typeof intent.input !== "object" || !Array.isArray(intent.input.vibe) || intent.input.vibe.length > 20 || intent.input.vibe.some(item => !text(item, 120))) return false;
    for (const key of ["origin", "days", "month", "budget", "accommodation", "who", "tempo", "visa"] as const) {
      if (intent.input[key] !== undefined && (typeof intent.input[key] !== "string" || intent.input[key].length > 600)) return false;
    }
  }
  if (intent.dates && (!validDay(intent.dates.startDate) || !validDay(intent.dates.endDate) || intent.dates.endDate < intent.dates.startDate)) return false;
  try { return JSON.stringify(intent).length <= 60_000; } catch { return false; }
}

/** Copies one chosen route, not the set of alternative destinations. No dates or bookings are inferred. */
export function createRouteCockpitIntent(saved: Pick<SavedRoutePlan, "id" | "createdAt" | "plan"> & { input?: PlannerInput }, routeIndex: number, ownerId: string | null): RouteCockpitIntent | null {
  const value: RouteCockpitIntent = { kind: "saved-route", ownerId, sourceRouteId: saved.id, sourceSavedAt: saved.createdAt, routeIndex, route: saved.plan.routes[routeIndex], input: saved.input || null };
  if (!validateRouteCockpitIntent(value)) return null;
  return JSON.parse(JSON.stringify(value)) as RouteCockpitIntent;
}
