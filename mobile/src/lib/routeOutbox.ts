import type { SavedRoutePlan } from "../types";

export type RouteOperation = { revision: string; pending: boolean } & (
  { kind: "save"; route: SavedRoutePlan } | { kind: "delete"; remoteId?: number | string }
);
export type RouteOutbox = Record<string, RouteOperation>;
const key = (owner: string) => {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(owner)) throw new Error("Invalid route owner");
  return `l2t.mobile.route-outbox.v1.${owner}`;
};
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
      || (operation.kind === "save" && (operation.route?.id !== id || typeof operation.route.createdAt !== "string" || !Array.isArray(operation.route.plan?.routes)))) {
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
