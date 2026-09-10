import type { SavedRoutePlan } from "../types";
import { getSavedRoutePlans } from "./storage";
import { acknowledgeRoute, queueRouteSave, readRouteOutbox, writeRouteOutbox } from "./routeOutbox";
import { deleteUserRouteByClientKey, deleteUserTrip, listUserTrips, upsertUserTrip, type UserTripData } from "./supabaseData";

// All route writers, including guest imports, share one chain per account.
const chains = new Map<string, Promise<unknown>>();
function serial<T>(owner: string, run: () => Promise<T>): Promise<T> {
  const previous = chains.get(owner) || Promise.resolve();
  const operation = previous.catch(() => undefined).then(run);
  chains.set(owner, operation);
  void operation.finally(() => { if (chains.get(owner) === operation) chains.delete(owner); }).catch(() => undefined);
  return operation;
}

function remoteRoute(item: UserTripData): SavedRoutePlan | null {
  const plan = item.tripData?.plan as SavedRoutePlan["plan"] | undefined;
  if (!item.clientKey || !Array.isArray(plan?.routes) || !plan.routes.length) return null;
  return { id: item.clientKey, createdAt: String(item.tripData.saved_at || item.createdAt), input: item.tripData.input as SavedRoutePlan["input"], plan };
}

async function flush(owner: string, token: string, active: () => boolean) {
  // Older versions did not keep a retry queue. Adopt their local copies once.
  for (const route of getSavedRoutePlans(owner)) {
    if (!readRouteOutbox(owner)[route.id]) queueRouteSave(owner, route);
  }
  let failure: unknown;
  // Re-read before every operation. A delete made during an upload wins.
  for (let pass = 0; pass < 3 && active(); pass++) {
    const pending = Object.entries(readRouteOutbox(owner)).filter(([, item]) => item.pending);
    if (!pending.length) break;
    for (const [id, snapshot] of pending) {
      if (!active()) return;
      const current = readRouteOutbox(owner)[id];
      if (!current || current.revision !== snapshot.revision) continue;
      try {
        if (current.kind === "delete") {
          if (current.remoteId !== undefined) {
            try { await deleteUserTrip(owner, current.remoteId, token); }
            catch (error) { if ((error as { status?: number }).status !== 404) throw error; }
          } else await deleteUserRouteByClientKey(owner, id, token);
        } else {
          const { route } = current;
          await upsertUserTrip(owner, {
            title: route.plan.routes.map(item => item.name).join(" · ").slice(0, 160),
            destination: route.plan.routes.map(item => item.country).join(" · ").slice(0, 160),
            mobileKind: "route_plan", clientKey: id,
            tripData: { input: route.input, plan: route.plan, source: "mobile", saved_at: route.createdAt },
          }, token);
        }
        if (!active()) return;
        acknowledgeRoute(owner, id, current.revision);
      } catch (error) { failure = error; }
    }
    if (failure) break;
  }
  if (failure) throw failure;
}

export function syncRoutePlan(owner: string, token: string, route: SavedRoutePlan) {
  // A pending delete is intentional, including when a guest-import retry arrives.
  if (!readRouteOutbox(owner)[route.id]) queueRouteSave(owner, route);
  return serial(owner, () => flush(owner, token, () => true));
}

export function syncSavedRoutes(owner: string, token: string, active: () => boolean = () => true) {
  return serial(owner, async () => {
    if (!active()) return;
    await flush(owner, token, active);
    if (!active()) return;
    const snapshot = readRouteOutbox(owner);
    const rows = await listUserTrips(owner, token, "route_plan");
    if (!active()) return;
    const box = readRouteOutbox(owner);
    const remoteIds = new Set(rows.map(row => row.clientKey));
    for (const [id, operation] of Object.entries(snapshot)) {
      if (box[id]?.revision !== operation.revision || operation.pending) continue;
      if (operation.kind === "save" && !remoteIds.has(id)) {
        // A saved route removed on another device must disappear here too.
        box[id] = { kind: "delete", pending: false, revision: operation.revision };
      }
    }
    for (const row of rows) {
      const route = remoteRoute(row);
      if (!route) continue;
      const operation = box[route.id];
      if (operation?.kind === "delete") {
        // A delayed server write/old snapshot cannot resurrect a tombstone.
        box[route.id] = { ...operation, remoteId: row.id, pending: true };
      } else if (!operation?.pending && operation?.revision === snapshot[route.id]?.revision) {
        box[route.id] = { kind: "save", route, revision: operation?.revision || `remote:${row.id}`, pending: false };
      }
    }
    writeRouteOutbox(owner, box, true);
    await flush(owner, token, active);
  });
}

export function startRouteSync(owner: string, token: string) {
  let stopped = false, running = false, again = false, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true; clearTimeout(timer);
    let failed = false;
    try { await syncSavedRoutes(owner, token, () => !stopped); failures = 0; }
    catch { failed = true; failures++; }
    finally {
      running = false;
      if (!stopped && (failed || again)) {
        again = false;
        timer = setTimeout(() => void run(), failed ? Math.min(300_000, 5000 * 2 ** Math.min(failures - 1, 6)) : 0);
      }
    }
  };
  const changed = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.ownerId === owner && !detail.fromSync) void run();
  };
  const foreground = () => { if (document.visibilityState === "visible") void run(); };
  window.addEventListener("l2t:route-change", changed);
  window.addEventListener("online", foreground);
  document.addEventListener("visibilitychange", foreground);
  void run();
  return () => { stopped = true; clearTimeout(timer); window.removeEventListener("l2t:route-change", changed); window.removeEventListener("online", foreground); document.removeEventListener("visibilitychange", foreground); };
}
