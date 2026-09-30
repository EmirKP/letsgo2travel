import type { PlannerInput, RoutePlan, SavedRoutePlan } from "../types";
import { createId } from "./id";

// A saved generation has its own identity. Content hashes must never identify
// deletions: another device may deliberately save the same itinerary again.
export function newSavedRoute(plan: RoutePlan, input: PlannerInput): SavedRoutePlan {
  return JSON.parse(JSON.stringify({ id: `route-${createId()}`, createdAt: new Date().toISOString(), input, plan })) as SavedRoutePlan;
}

export function matchingSavedRoute(routes: SavedRoutePlan[], plan: RoutePlan, input: PlannerInput) {
  // JSONB may reorder object keys on a server round-trip. Key order does not
  // change itinerary identity, while day/stop array order does.
  const content = comparable({ input, plan });
  return routes.find(route => comparable({ input: route.input, plan: route.plan }) === content);
}

function comparable(value: unknown): string {
  return JSON.stringify(value, (_key, current) => current && typeof current === "object" && !Array.isArray(current)
    ? Object.fromEntries(Object.keys(current).sort().map(key => [key, current[key]])) : current);
}
