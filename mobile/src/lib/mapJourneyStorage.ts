import type { SavedRoutePlan } from '../types';
import { getSavedRoutePlans, saveRoutePlan } from './storage';
import { readRouteOutbox } from './routeOutbox';
import { createId } from './id';
import { mapJourneyFromSavedRoute, mapJourneyToSavedRoute, validateMapJourney, type MapJourney } from './mapJourney';

const ROUTES_KEY = 'l2t.mobile.saved-routes.v1';
const storageKey = (ownerId?: string | null) => {
  if (ownerId !== undefined && ownerId !== null && !/^[A-Za-z0-9_-]{1,80}$/.test(ownerId)) throw new Error('invalid_owner');
  return `${ROUTES_KEY}.${ownerId ? `user-${ownerId}` : 'guest'}`;
};
function inspectRoutes(value: unknown): asserts value is SavedRoutePlan[] {
  if (!Array.isArray(value)) throw new Error('corrupt');
  const ids = new Set<string>();
  for (const route of value) {
    if (!route || typeof route.id !== 'string' || ids.has(route.id) || !Array.isArray(route.plan?.routes)) throw new Error('corrupt');
    ids.add(route.id);
    for (const suggestion of route.plan.routes) {
      if (suggestion.mapJourney !== undefined && (!validateMapJourney(suggestion.mapJourney) || suggestion.mapJourney.id !== route.id)) throw new Error('corrupt');
    }
  }
}
function readRoutes(ownerId?: string | null) {
  const key = storageKey(ownerId);
  // The legacy reader intentionally supports old data; inspect first so its
  // empty-on-corrupt fallback cannot silently replace an unreadable library.
  const raw = window.localStorage.getItem(key) ?? (ownerId ? null : window.localStorage.getItem(ROUTES_KEY));
  if (raw !== null) { try { inspectRoutes(JSON.parse(raw)); } catch { throw new Error('corrupt'); } }
  const routes = getSavedRoutePlans(ownerId);
  inspectRoutes(routes);
  return routes;
}
export function readMapJourneys(ownerId?: string | null): { items: MapJourney[]; error: 'corrupt' | 'unavailable' | null } {
  try { return { items: readRoutes(ownerId).map(mapJourneyFromSavedRoute).filter((journey): journey is MapJourney => Boolean(journey)), error: null }; }
  catch (error) { return { items: [], error: error instanceof Error && ['corrupt', 'invalid_owner'].includes(error.message) ? 'corrupt' : 'unavailable' }; }
}
/** Uses the same account outbox as saved routes. Queued is never presented as cloud-confirmed. */
export function saveMapJourney(journey: MapJourney, ownerId?: string | null, locale: 'tr' | 'en' | 'sq' | 'ro' = 'tr'): { journey: MapJourney; status: 'device' | 'queued' } {
  if (!validateMapJourney(journey)) throw new Error('invalid');
  const routes = readRoutes(ownerId);
  // Resaving a deliberately deleted plan creates a new identity before either
  // the nested document or the outbox is written, preserving the tombstone.
  if (ownerId && readRouteOutbox(ownerId)[journey.id]?.kind === 'delete') journey = { ...journey, id: `journey-${createId()}` };
  const previous = routes.find(route => route.id === journey.id);
  if (previous && !mapJourneyFromSavedRoute(previous)) throw new Error('legacy_conflict');
  const saved = mapJourneyToSavedRoute(journey, locale, previous);
  const written = saveRoutePlan(saved, ownerId);
  const actual = written.find(route => route.plan.routes.some(item => item.mapJourney?.id === journey.id));
  if (!actual) throw new Error('unavailable');
  return { journey, status: ownerId ? 'queued' : 'device' };
}
