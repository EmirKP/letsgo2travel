import type { RouteSuggestion, SavedRoutePlan } from "../types";

export type RouteOperation = { revision: string; pending: boolean } & (
  { kind: "save"; route: SavedRoutePlan } | { kind: "delete"; remoteId?: number | string }
);
export type RouteOutbox = Record<string, RouteOperation>;
const key = (owner: string) => {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(owner)) throw new Error("Invalid route owner");
  return `l2t.mobile.route-outbox.v1.${owner}`;
};
function readableSuggestion(value: unknown): value is RouteSuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const route = value as Record<string, unknown>;
  // Older saved suggestions omit some display fields. Keep those compatible,
  // but never pass objects/null entries to the library's text and day renderers.
  for (const field of ["name", "country", "cityOrRegion", "why", "visaStatus", "visaNote", "visaSourceUrl", "estimatedBudget", "idealDuration", "bestFor", "difficulty", "transportEase", "safetyNote"]) {
    if (route[field] !== undefined && typeof route[field] !== "string") return false;
  }
  return ["dailyPlan", "warnings"].every(field => route[field] === undefined || Array.isArray(route[field]) && route[field].every(item => typeof item === "string"));
}
export function readRouteOutbox(owner: string): RouteOutbox {
  // Corrupt storage must block writes, never silently reset pending deletions.
  const raw = window.localStorage.getItem(key(owner));
  if (!raw) return Object.create(null) as RouteOutbox;
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Route queue cannot be read");
  for (const [id, entry] of Object.entries(value)) {
    const operation = entry as RouteOperation | null;
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(id) || !operation || typeof operation.revision !== "string" || typeof operation.pending !== "boolean"
      || (operation.kind !== "save" && operation.kind !== "delete")
      || (operation.kind === "save" && (operation.route?.id !== id || typeof operation.route.createdAt !== "string" || !Array.isArray(operation.route.plan?.routes)
        || operation.route.plan.routes.some(route => !readableSuggestion(route))
        || operation.route.plan.summary !== undefined && typeof operation.route.plan.summary !== "string"))) {
      throw new Error("Route queue cannot be read");
    }
  }
  return Object.assign(Object.create(null), value) as RouteOutbox;
}
export function writeRouteOutbox(owner: string, value: RouteOutbox, fromSync = false) {
  window.localStorage.setItem(key(owner), JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("l2t:route-change", { detail: { ownerId: owner, fromSync } }));
  window.dispatchEvent(new CustomEvent("l2t:storage-change"));
}
const revision = () => `${Date.now()}:${Math.random().toString(36).slice(2)}`;
export function queueRouteSave(owner: string, route: SavedRoutePlan) {
  const box = readRouteOutbox(owner);
  box[route.id] = { kind: "save", route, revision: revision(), pending: true };
  writeRouteOutbox(owner, box);
}
export function queueRouteDelete(owner: string, id: string, remoteId?: number | string) {
  const box = readRouteOutbox(owner);
  box[id] = { kind: "delete", remoteId, revision: revision(), pending: true };
  writeRouteOutbox(owner, box);
}
export function acknowledgeRoute(owner: string, id: string, expected: string) {
  const box = readRouteOutbox(owner);
  if (box[id]?.revision !== expected) return;
  box[id] = { ...box[id], pending: false };
  writeRouteOutbox(owner, box, true);
}
export function routesWithOutbox(routes: SavedRoutePlan[], owner?: string | null) {
  if (!owner) return routes;
  const byId = new Map(routes.map(route => [route.id, route]));
  for (const [id, operation] of Object.entries(readRouteOutbox(owner))) {
    if (operation.kind === "delete") byId.delete(id);
    else byId.set(id, operation.route);
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
