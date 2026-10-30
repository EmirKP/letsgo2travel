import { unstable_cache } from 'next/cache';
import { coarseLocation, coordinates, distanceKm, nearbyQueryBoxes, normalizePlaces, safeWebsite, CATEGORY_LABELS, NEEDS } from '../travel-assistant/places';
import { queryOverpass } from '../travel-assistant/overpass';
import { createMapResultCache } from '../travel-assistant/result-cache';
import type { Coordinates, Place, PointCategory } from '../travel-assistant/types';

export type TravelMapCategory = PointCategory | 'all';
export type TravelMapPlace = Place & { address: string | null; brand: string | null };
export type TravelMapPlacesResult = { places: TravelMapPlace[]; center: Coordinates; radius: number; fetchedAt: string; limited: boolean; attribution: '© OpenStreetMap contributors'; query: string; stale?: boolean };
export type TravelMapRouteMode = 'walking' | 'driving';
export type TravelMapRouteInput = { origin: Coordinates; destination: Coordinates; mode: TravelMapRouteMode; locale?: 'tr' | 'en' | 'sq' };
export type TravelMapRoute = { mode: TravelMapRouteMode; distanceMeters: number; durationSeconds: number; coordinates: [number, number][]; steps: { instruction: string; distanceMeters: number; durationSeconds: number; name: string; type: string; modifier: string }[]; sourceUrl: string; attribution: string; fetchedAt: string };

export class TravelMapServiceError extends Error {
  constructor(readonly code: string, readonly status = 503, readonly retryAfter = 30) { super(code); }
}
const clean = (value: unknown, maximum = 180) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum) : '';
export const validTravelMapCategory = (value: unknown): value is TravelMapCategory => value === 'all' || typeof value === 'string' && Object.hasOwn(CATEGORY_LABELS, value);
export const validTravelMapQuery = (value: unknown): value is string => typeof value === 'string' && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value);
const allSelectors = [
  '[amenity~"^(hospital|pharmacy|police|atm|bank|bus_station|bureau_de_change|toilets|embassy|cafe|restaurant|fast_food|ice_cream|marketplace)$"]',
  '[shop]', '[craft~"^(pottery|jeweller|handicraft)$"]', '[tourism~"^(museum|viewpoint|attraction)$"]',
  '[historic~"^(monument|memorial|castle|ruins|archaeological_site|building|palace)$"]', '[artwork_type=statue]', '[leisure~"^(park|garden|nature_reserve|stadium)$"]',
  '[place=square]', '[natural=beach]', '[route=hiking]', '[office=diplomatic]', '[diplomatic]', '[internet_access=wlan]',
  '[railway~"^(station|halt|subway_entrance|tram_stop)$"]', '[public_transport=station]', '[highway=bus_stop]',
];
const categorySelectors: Partial<Record<PointCategory, string[]>> = {
  cafe: ['[amenity=cafe]'], restaurant: ['[amenity~"^(restaurant|fast_food)$"]'], bakery: ['[shop=bakery]'],
  sweets: ['[amenity=ice_cream]', '[shop~"^(pastry|confectionery|chocolate)$"]'], boutique: ['[shop~"^(boutique|clothes)$"]'],
  craft: ['[shop=craft]', '[craft~"^(pottery|jeweller|handicraft)$"]'], gift: ['[shop~"^(gift|souvenir)$"]'],
  market: ['[shop~"^(supermarket|convenience|variety_store)$"]', '[amenity=marketplace]'], store: ['[shop]'],
  park: ['[leisure~"^(park|nature_reserve)$"]'], garden: ['[leisure=garden]'], beach: ['[natural=beach]'], hiking: ['[route=hiking]'],
  museum: ['[tourism=museum]'], attraction: ['[tourism=attraction]'], viewpoint: ['[tourism=viewpoint]'],
  statue: ['[artwork_type=statue]', '[memorial=statue]'], monument: ['[historic~"^(monument|memorial)$"]'],
  historic: ['[historic~"^(castle|ruins|archaeological_site|building)$"]'], palace: ['[historic=palace]', '[castle_type=palace]'], stadium: ['[leisure=stadium]'], square: ['[place=square]'],
  exchange: ['[amenity=bureau_de_change]'], wifi: ['[internet_access=wlan]'], embassy: ['[amenity=embassy]', '[office=diplomatic]', '[diplomatic]'],
  transit: ['[amenity=bus_station]', '[railway~"^(station|halt|subway_entrance|tram_stop)$"]', '[public_transport=station]', '[highway=bus_stop]'],
};
export function travelMapPlacesQuery(center: Coordinates, category: TravelMapCategory, query = '') {
  if (!coordinates(center) || !validTravelMapCategory(category) || !validTravelMapQuery(query)) throw new TravelMapServiceError('invalid', 400);
  const selectors = category === 'all' ? allSelectors : categorySelectors[category] || [`[amenity=${category}]`];
  const literal = query.trim().normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameFilter = literal ? `[~"^(name(:[a-zA-Z-]+)?|brand|operator)$"~${JSON.stringify(literal)},i]` : '';
  return `[out:json][timeout:12][maxsize:67108864];(${nearbyQueryBoxes(center).flatMap(box => selectors.map(selector => `nwr(${box})${selector}${nameFilter};`)).join('')});out center tags 750;`;
}
function discoveryCategory(tags: Record<string, unknown>): PointCategory | null {
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.amenity === 'restaurant' || tags.amenity === 'fast_food') return 'restaurant';
  if (tags.amenity === 'ice_cream' || ['pastry', 'confectionery', 'chocolate'].includes(String(tags.shop))) return 'sweets';
  if (tags.shop === 'bakery') return 'bakery';
  if (tags.shop === 'boutique' || tags.shop === 'clothes') return 'boutique';
  if (tags.shop === 'craft' || ['pottery', 'jeweller', 'handicraft'].includes(String(tags.craft))) return 'craft';
  if (tags.shop === 'gift' || tags.shop === 'souvenir') return 'gift';
  if (tags.amenity === 'marketplace' || ['supermarket', 'convenience', 'variety_store'].includes(String(tags.shop))) return 'market';
  if (typeof tags.shop === 'string' && tags.shop && !['no', 'vacant', 'disused', 'closed'].includes(tags.shop)) return 'store';
  if (tags.leisure === 'garden') return 'garden';
  if (tags.leisure === 'park' || tags.leisure === 'nature_reserve') return 'park';
  if (tags.natural === 'beach') return 'beach';
  if (tags.route === 'hiking') return 'hiking';
  return null;
}
export function normalizeTravelMapPlaces(raw: unknown, center: Coordinates, category: TravelMapCategory, fetchedAt: string): TravelMapPlace[] {
  if (!coordinates(center) || !validTravelMapCategory(category) || !raw || typeof raw !== 'object' || !('elements' in raw) || !Array.isArray(raw.elements) || 'remark' in raw && raw.remark) throw new TravelMapServiceError('invalid-provider-response');
  const seen = new Set<string>();
  return raw.elements.slice(0, 750).flatMap((item: unknown): TravelMapPlace[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { id?: unknown; type?: unknown; lat?: unknown; lon?: unknown; center?: { lat?: unknown; lon?: unknown }; tags?: unknown };
    if (!['node', 'way', 'relation'].includes(String(row.type)) || !Number.isSafeInteger(row.id) || Number(row.id) <= 0) return [];
    const point = coordinates({ latitude: row.lat ?? row.center?.lat, longitude: row.lon ?? row.center?.lon });
    if (!point || distanceKm(center, point) > 3) return [];
    const tags = row.tags && typeof row.tags === 'object' && !Array.isArray(row.tags) ? row.tags as Record<string, unknown> : {};
    const traditional = normalizePlaces({ elements: [row] }, 'needs', fetchedAt, true)[0] || normalizePlaces({ elements: [row] }, 'explore', fetchedAt, true)[0];
    const discovered = discoveryCategory(tags);
    const primary = traditional?.category === 'wifi' ? discovered || 'wifi' : traditional?.category || discovered;
    const kind = category === 'wifi' && tags.internet_access === 'wlan' ? 'wifi' : primary;
    if (!kind || category !== 'all' && kind !== category) return [];
    const id = `${row.type}/${row.id}`;
    if (seen.has(id)) return [];
    const name = clean(tags.name || tags['name:en'] || tags.brand || tags.operator);
    if (!name && !NEEDS.includes(kind)) return [];
    seen.add(id);
    return [{ ...point, id, name, category: kind, description: clean(tags.description, 500) || null,
      hours: clean(tags.opening_hours) || null, free: tags.fee === 'no' ? true : tags.fee === 'yes' ? false : null,
      accessible: tags.wheelchair === 'yes' ? true : tags.wheelchair === 'no' ? false : null,
      website: safeWebsite(tags.website || tags['contact:website']), representedCountry: traditional?.representedCountry || null,
      sourceUrl: `https://www.openstreetmap.org/${id}`, fetchedAt, brand: clean(tags.brand) || null,
      address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].map(part => clean(part, 100)).filter(Boolean).join(', ') || null }];
  }).sort((a, b) => distanceKm(center, a) - distanceKm(center, b));
}
const pendingPlaces = new Map<string, Promise<TravelMapPlacesResult>>();
const placesSnapshots = createMapResultCache<TravelMapPlacesResult>(value => value.fetchedAt);
const cachedPlaces = unstable_cache(async (latitude: number, longitude: number, category: TravelMapCategory, query: string): Promise<TravelMapPlacesResult> => {
  const center = { latitude, longitude };
  const raw = await queryOverpass(travelMapPlacesQuery(center, category, query)) as { elements: unknown[] };
  const fetchedAt = new Date().toISOString();
  return { places: normalizeTravelMapPlaces(raw, center, category, fetchedAt), center, radius: 3000, fetchedAt, limited: raw.elements.length >= 750, attribution: '© OpenStreetMap contributors', query };
}, ['unified-travel-map-places-v1'], { revalidate: 3600 });
export async function getTravelMapPlaces(center: Coordinates, category: TravelMapCategory = 'all', query = ''): Promise<TravelMapPlacesResult> {
  if (!coordinates(center) || !validTravelMapCategory(category) || !validTravelMapQuery(query)) throw new TravelMapServiceError('invalid', 400);
  const normalizedQuery = query.trim().normalize('NFC');
  const coarse = coarseLocation(center), key = `${coarse.latitude}:${coarse.longitude}:${category}:${normalizedQuery}`;
  const hit = placesSnapshots.read(key, true); if (hit) return hit;
  const existing = pendingPlaces.get(key); if (existing) return existing;
  if (pendingPlaces.size >= 8) throw new TravelMapServiceError('busy', 503, 30);
  const operation = cachedPlaces(coarse.latitude, coarse.longitude, category, normalizedQuery).then(value => {
    placesSnapshots.remember(key, value);
    return placesSnapshots.read(key, true) ? value : { ...value, stale: true };
  }).catch(error => {
    const previous = placesSnapshots.read(key);
    if (previous) return { ...previous, stale: true };
    throw error;
  }).finally(() => pendingPlaces.delete(key));
  pendingPlaces.set(key, operation); return operation;
}

const ROUTING_ROOT = 'https://routing.openstreetmap.de';
const ROUTING_AGENT = 'LetsGo2Travel/1.4 (+https://www.letsgo2travel.com.tr)';
let routingTurn: Promise<void> = Promise.resolve();
let routingLastStart = 0;
let routingCooldown = 0;
let routingQueued = 0;
const routePending = new Map<string, Promise<TravelMapRoute>>();
const routeCache = new Map<string, { expires: number; route: TravelMapRoute }>();
async function routingBudget() {
  if (routingQueued >= 8) throw new TravelMapServiceError('busy', 503, 10);
  routingQueued++;
  const turn = routingTurn.then(async () => {
    if (routingCooldown > Date.now()) throw new TravelMapServiceError('busy', 503, Math.max(1, Math.ceil((routingCooldown - Date.now()) / 1000)));
    const pause = Math.max(0, 1000 - (Date.now() - routingLastStart));
    if (pause) await new Promise(resolve => setTimeout(resolve, pause));
    if (routingCooldown > Date.now()) throw new TravelMapServiceError('busy', 503, Math.max(1, Math.ceil((routingCooldown - Date.now()) / 1000)));
    routingLastStart = Date.now();
  });
  routingTurn = turn.catch(() => {});
  try { await turn; } finally { routingQueued--; }
}
export function parseTravelMapRouteInput(value: unknown): TravelMapRouteInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>, origin = coordinates(input.origin), destination = coordinates(input.destination);
  if (!origin || !destination || !['walking', 'driving'].includes(String(input.mode)) || input.locale !== undefined && !['tr', 'en', 'sq'].includes(String(input.locale))) return null;
  return { origin, destination, mode: input.mode as TravelMapRouteMode, locale: input.locale as TravelMapRouteInput['locale'] };
}
function routeInstruction(type: string, modifier: string, name: string, locale: NonNullable<TravelMapRouteInput['locale']>) {
  const copy = (tr: string, en: string, sq: string) => locale === 'tr' ? tr : locale === 'sq' ? sq : en;
  const direction = modifier.includes('left') ? copy('sola', 'left', 'majtas') : modifier.includes('right') ? copy('sağa', 'right', 'djathtas') : '';
  const action = modifier === 'uturn' ? copy('U dönüşü yap', 'Make a U-turn', 'Bëj kthim në formë U') : type === 'depart' ? copy('Yola çık', 'Depart', 'Nisu') : type === 'arrive' ? copy('Hedefe ulaş', 'Arrive at the destination', 'Mbërrij në destinacion')
    : type === 'roundabout' || type === 'rotary' ? copy('Dönel kavşağı takip et', 'Follow the roundabout', 'Ndiq rrethrrotullimin')
      : type === 'turn' || type === 'fork' || type === 'end of road' ? direction ? copy(`${direction} dön`, `Turn ${direction}`, `Kthehu ${direction}`) : copy('Yolu takip et', 'Follow the road', 'Ndiq rrugën')
        : type === 'merge' ? copy('Yola katıl', 'Merge onto the road', 'Bashkohu me rrugën') : copy('Devam et', 'Continue', 'Vazhdo');
  return name ? `${action} · ${name}` : action;
}
async function boundedProviderJson(response: Response) {
  if (!response.ok && response.status !== 400) {
    let retryAfter = 30;
    if (response.status === 429) {
      const header = response.headers.get('retry-after') || '';
      const retry = /^\d+$/.test(header) ? Number(header) : (Date.parse(header) - Date.now()) / 1000;
      retryAfter = Number.isFinite(retry) && retry > 0 ? Math.min(86400, Math.ceil(retry)) : 60;
      routingCooldown = Date.now() + retryAfter * 1000;
    } else if (response.status >= 400 && response.status < 500) routingCooldown = Date.now() + 60000;
    await response.body?.cancel().catch(() => {});
    throw new TravelMapServiceError(response.status === 429 ? 'busy' : 'route-unavailable', 503, retryAfter);
  }
  if (!response.body) throw new TravelMapServiceError('invalid-provider-response');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let body = '', length = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 4000000) { await reader.cancel().catch(() => {}); throw new TravelMapServiceError('route-too-large'); } body += decoder.decode(part.value, { stream: true }); }
    body += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(body) as unknown; } catch { throw new TravelMapServiceError('invalid-provider-response'); }
}
const routeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function normalizeTravelMapRoute(value: unknown, input: TravelMapRouteInput): TravelMapRoute {
  const raw = value as { code?: string; routes?: { distance?: number; duration?: number; geometry?: { type?: string; coordinates?: unknown[] }; legs?: { steps?: unknown[] }[] }[] } | null;
  if (raw?.code === 'NoRoute' || raw?.code === 'NoSegment') throw new TravelMapServiceError('no-route', 422, 0);
  const route = raw?.routes?.[0];
  if (raw?.code !== 'Ok' || !route || !routeNumber(route.distance) || route.distance > 2000000 || !routeNumber(route.duration) || route.duration > 604800 || route.distance > 0 && route.duration === 0 || route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 || route.geometry.coordinates.length > 60000) throw new TravelMapServiceError('invalid-provider-response');
  const points = route.geometry.coordinates.map(point => {
    if (!Array.isArray(point) || point.length !== 2 || !coordinates({ latitude: point[1], longitude: point[0] })) throw new TravelMapServiceError('invalid-provider-response');
    return [point[0], point[1]] as [number, number];
  });
  if (distanceKm(input.origin, { latitude: points[0][1], longitude: points[0][0] }) > 2 || distanceKm(input.destination, { latitude: points.at(-1)![1], longitude: points.at(-1)![0] }) > 2) throw new TravelMapServiceError('no-route', 422, 0);
  if (!Array.isArray(route.legs) || route.legs.length !== 1 || !Array.isArray(route.legs[0].steps) || !route.legs[0].steps.length || route.legs[0].steps.length > 2000) throw new TravelMapServiceError('invalid-provider-response');
  const steps = route.legs[0].steps.map(item => {
    const step = item as { name?: unknown; distance?: unknown; duration?: unknown; maneuver?: { type?: unknown; modifier?: unknown } } | null;
    if (!step || !routeNumber(step.distance) || !routeNumber(step.duration) || typeof step.maneuver?.type !== 'string') throw new TravelMapServiceError('invalid-provider-response');
    const name = clean(step.name), type = clean(step.maneuver.type, 50), modifier = clean(step.maneuver.modifier, 50);
    return { name, type, modifier, instruction: routeInstruction(type, modifier, name, input.locale || 'tr'), distanceMeters: step.distance, durationSeconds: step.duration };
  });
  return { mode: input.mode, distanceMeters: route.distance, durationSeconds: route.duration, coordinates: points, steps, sourceUrl: `${ROUTING_ROOT}/`, attribution: '© OpenStreetMap contributors · FOSSGIS e.V.', fetchedAt: new Date().toISOString() };
}
export async function getTravelMapDirections(input: TravelMapRouteInput): Promise<TravelMapRoute> {
  if (!parseTravelMapRouteInput(input)) throw new TravelMapServiceError('invalid', 400);
  const direct = distanceKm(input.origin, input.destination);
  if (direct > (input.mode === 'walking' ? 100 : 300)) throw new TravelMapServiceError('route-too-long', 400, 0);
  if (direct < .005) throw new TravelMapServiceError('same-location', 400, 0);
  const pair = [input.origin, input.destination].map(point => `${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`).join(';');
  const key = `${input.mode}:${input.locale || 'tr'}:${pair}`;
  const cached = routeCache.get(key); if (cached && cached.expires > Date.now()) return cached.route;
  const existing = routePending.get(key); if (existing) return existing;
  if (routePending.size >= 8) throw new TravelMapServiceError('busy', 503, 10);
  const operation = (async () => {
    await routingBudget();
    const path = input.mode === 'walking' ? 'routed-foot' : 'routed-car';
    const response = await fetch(`${ROUTING_ROOT}/${path}/route/v1/driving/${pair}?overview=full&geometries=geojson&steps=true&alternatives=false`, {
      headers: { 'User-Agent': ROUTING_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(12000), redirect: 'error', cache: 'no-store',
    });
    const route = normalizeTravelMapRoute(await boundedProviderJson(response), input);
    routeCache.delete(key); routeCache.set(key, { expires: Date.now() + 60000, route });
    if (routeCache.size > 64) routeCache.delete(routeCache.keys().next().value!);
    return route;
  })().finally(() => routePending.delete(key));
  routePending.set(key, operation); return operation;
}
