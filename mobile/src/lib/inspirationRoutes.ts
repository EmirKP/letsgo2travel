import type { RouteSuggestion, SavedRoutePlan } from "../types";
import { createId } from "./id";
import { deleteRoutePlan, getSavedRoutePlans, saveRoutePlan } from "./storage";

function matches(saved: SavedRoutePlan, code: string) {
  return saved.plan.routes[0]?.destinationCode?.toUpperCase() === code && (saved.id === `inspiration.${code}` || saved.id.startsWith(`inspiration.${code}:`));
}
export function inspirationRouteCodes(ownerId?: string | null): string[] {
  return [...new Set(getSavedRoutePlans(ownerId).flatMap(saved => {
    const code = saved.plan.routes[0]?.destinationCode?.toUpperCase();
    return code && matches(saved, code) ? [code] : [];
  }))];
}

/** Returns whether the destination is now saved. Explicit saves get a new generation. */
export function toggleInspirationRoute(route: RouteSuggestion, ownerId?: string | null) {
  const code = route.destinationCode?.toUpperCase();
  if (!code || !/^[A-Z0-9]{2,8}$/.test(code)) throw new Error("Invalid inspiration destination");
  const existing = getSavedRoutePlans(ownerId).filter(saved => matches(saved, code));
  if (existing.length) {
    existing.forEach(saved => deleteRoutePlan(saved.id, ownerId));
    return false;
  }
  saveRoutePlan({
    id: `inspiration.${code}:${createId()}`, createdAt: new Date().toISOString(),
    input: { origin: "", days: route.idealDuration, month: "", budget: route.estimatedBudget, accommodation: "", who: "", tempo: "", vibe: [], visa: route.visaStatus },
    plan: { summary: route.why, routes: [route] },
  }, ownerId);
  return true;
}
