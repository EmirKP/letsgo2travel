import { appleMapsSearch, appleMapsServerConfigured, appleMapsServerIdentity } from '../maps/apple-maps-server';
import { coarseLocation, coordinates, distanceKm, validJourneyPlaceSource } from './places';
import type { Coordinates, PointCategory } from './types';
import type { JourneyDiscoveryGroup, JourneyDiscoveryPlace, JourneyDiscoveryResult, JourneySearchPlace, JourneySearchResult } from './journey-types';

// Official API schema and category filters:
// https://developer.apple.com/documentation/applemapsserverapi/-v1-search
// https://developer.apple.com/documentation/applemapsserverapi/poicategory
// https://developer.apple.com/documentation/mapkit/unified-map-urls
export const hasAppleJourneyPlaces = appleMapsServerConfigured;
const unavailable = () => new Error('Apple place search unavailable');
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clean = (value: unknown, max: number): string => typeof value === 'string'
  ? value.replace(/<[^>]*>/g, ' ').replace(/[<>\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const address = (row: Record<string, unknown>) => Array.isArray(row.formattedAddressLines)
  ? row.formattedAddressLines.slice(0, 8).map(line => clean(line, 160)).filter(Boolean).join(', ').slice(0, 260) || null : null;
const languages: Record<string, string> = { tr: 'tr-TR', en: 'en-US', sq: 'sq-AL' };
function page(raw: unknown): { rows: unknown[]; limited: boolean } {
  const value = record(raw);
  if (!Array.isArray(value.results) || value.results.length > 100 || value.error || value.errorMessage) throw unavailable();
  const pagination = record(value.paginationInfo);
  return { rows: value.results, limited: typeof pagination.nextPageToken === 'string' && pagination.nextPageToken.length > 0
    || typeof pagination.totalResults === 'number' && pagination.totalResults > value.results.length };
}
function poiIdentity(row: Record<string, unknown>): { id: string; sourceUrl: string } | null {
  if (typeof row.id !== 'string') return null;
  const id = `apple/${row.id}`, sourceUrl = `https://maps.apple.com/place?place-id=${row.id}`;
  return validJourneyPlaceSource(id, sourceUrl) ? { id, sourceUrl } : null;
}
export function normalizeAppleJourneySearch(raw: unknown): JourneySearchPlace[] {
  const seen = new Set<string>();
  return page(raw).rows.flatMap((item): JourneySearchPlace[] => {
    const row = record(item), point = coordinates(row.coordinate), name = clean(row.name, 161);
    // A selectable destination must fit the planning contract intact. Never
    // truncate a long administrative name into a different ambiguous city.
    if (!point || !name || name.length > 160) return [];
    // Cities/addresses do not necessarily have an Apple POI ID. Their local
    // result key names the provider coordinate; it is never a saveable POI ID.
    const identity = poiIdentity(row) || (row.id === undefined ? { id: `apple-area/${point.latitude},${point.longitude}`,
      sourceUrl: `https://maps.apple.com/place?coordinate=${point.latitude},${point.longitude}` } : null);
    if (!identity || seen.has(identity.id)) return [];
    seen.add(identity.id);
    return [{ ...point, ...identity, name, address: address(row) }];
  }).slice(0, 8);
}

const categories: Record<JourneyDiscoveryGroup, Record<string, PointCategory>> = {
  food: { Cafe: 'cafe', Restaurant: 'restaurant', Bakery: 'bakery' },
  shopping: { Store: 'store', FoodMarket: 'market' },
  culture: { Museum: 'museum', Landmark: 'attraction', Castle: 'historic', Fortress: 'historic', NationalMonument: 'monument',
    ReligiousSite: 'attraction', Planetarium: 'attraction', Theater: 'attraction', Stadium: 'stadium' },
  nature: { Park: 'park', NationalPark: 'park', Beach: 'beach', Hiking: 'hiking' },
  essentials: { Hospital: 'hospital', Pharmacy: 'pharmacy', Police: 'police', ATM: 'atm', Bank: 'bank', PublicTransport: 'transit', Restroom: 'toilets' },
};
const queries: Record<JourneyDiscoveryGroup, readonly string[]> = {
  food: ['restaurants', 'cafes and bakeries'], shopping: ['shopping'], culture: ['museums', 'landmarks and attractions'],
  nature: ['parks', 'beaches and hiking trails'], essentials: ['pharmacy', 'hospital', 'police', 'banks and ATMs', 'public transport stations', 'restrooms'],
};
export function normalizeAppleJourneyDiscovery(raw: unknown, center: Coordinates, group: JourneyDiscoveryGroup, fetchedAt: string): JourneyDiscoveryPlace[] {
  if (!coordinates(center) || !Object.prototype.hasOwnProperty.call(categories, group)) throw unavailable();
  const seen = new Set<string>();
  return page(raw).rows.flatMap((item): JourneyDiscoveryPlace[] => {
    const row = record(item), point = coordinates(row.coordinate), name = clean(row.name, 180), identity = poiIdentity(row);
    const category = typeof row.poiCategory === 'string' && Object.prototype.hasOwnProperty.call(categories[group], row.poiCategory)
      ? categories[group][row.poiCategory] : undefined;
    if (!point || !name || !identity || !category || distanceKm(center, point) > 3.1 || seen.has(identity.id)) return [];
    seen.add(identity.id);
    return [{ ...point, ...identity, name, group, kind: category, category, address: address(row), fetchedAt,
      description: null, hours: null, free: null, accessible: null, website: null, representedCountry: null }];
  });
}
const searchCache = new Map<string, { until: number; value: JourneySearchResult }>();
const discoveryCache = new Map<string, { until: number; value: JourneyDiscoveryResult }>();
const pending = new Map<string, Promise<JourneySearchResult | JourneyDiscoveryResult>>();
function remember<T>(cache: Map<string, { until: number; value: T }>, key: string, value: T) {
  cache.set(key, { value, until: Date.now() + 3600_000 });
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
}
export async function searchAppleJourneyPlaces(query: string, locale: string): Promise<JourneySearchResult> {
  if (!Object.prototype.hasOwnProperty.call(languages, locale) || typeof query !== 'string' || query.length < 3 || query.length > 160 || /[<>\u0000-\u001f\u007f]/.test(query)) throw unavailable();
  const identity = appleMapsServerIdentity(), key = `${identity}:search:${locale}:${query.toLocaleLowerCase(locale)}`, now = Date.now();
  const hit = searchCache.get(key); if (hit && hit.until > now && hit.until <= now + 3600_000) return hit.value;
  const waiting = pending.get(key); if (waiting) return waiting as Promise<JourneySearchResult>;
  if (pending.size >= 2) throw unavailable();
  const operation = (async () => {
    const raw = await appleMapsSearch(new URLSearchParams({ q: query, lang: languages[locale], resultTypeFilter: 'Address',
      includeAddressCategories: 'Locality,SubLocality' }), now + 12_000);
    if (appleMapsServerIdentity() !== identity) throw unavailable();
    const value = { places: normalizeAppleJourneySearch(raw), fetchedAt: new Date().toISOString(), attribution: 'Apple Maps' };
    remember(searchCache, key, value); return value;
  })();
  pending.set(key, operation);
  try { return await operation; } finally { pending.delete(key); }
}
export async function discoverAppleJourneyPlaces(center: Coordinates, group: JourneyDiscoveryGroup): Promise<JourneyDiscoveryResult> {
  if (!coordinates(center) || !Object.prototype.hasOwnProperty.call(categories, group)) throw unavailable();
  const c = coarseLocation(center), identity = appleMapsServerIdentity(), key = `${identity}:discover:${c.latitude}:${c.longitude}:${group}`, now = Date.now();
  const hit = discoveryCache.get(key); if (hit && hit.until > now && hit.until <= now + 3600_000) return hit.value;
  const waiting = pending.get(key); if (waiting) return waiting as Promise<JourneyDiscoveryResult>;
  if (pending.size >= 2) throw unavailable();
  const operation = (async () => {
    const fetchedAt = new Date().toISOString(), deadline = now + 22_000, places = new Map<string, JourneyDiscoveryPlace>();
    let limited = false;
    for (const q of queries[group]) {
      const latDelta = 3 / 110.574, lonDelta = 3 / (111.32 * Math.cos(c.latitude * Math.PI / 180));
      const params = new URLSearchParams({ q, lang: 'en-US', searchLocation: `${c.latitude},${c.longitude}`,
        resultTypeFilter: 'Poi', includePoiCategories: Object.keys(categories[group]).join(','), enablePagination: 'true' });
      // At the antimeridian, use the location hint and our strict radius check.
      if (c.longitude - lonDelta >= -180 && c.longitude + lonDelta <= 180) {
        params.delete('searchLocation');
        params.set('searchRegion', [Math.min(85, c.latitude + latDelta), c.longitude + lonDelta,
          Math.max(-85, c.latitude - latDelta), c.longitude - lonDelta].map(n => n.toFixed(5)).join(','));
        params.set('searchRegionPriority', 'required');
      }
      const raw = await appleMapsSearch(params, deadline);
      if (appleMapsServerIdentity() !== identity) throw unavailable();
      limited ||= page(raw).limited;
      for (const place of normalizeAppleJourneyDiscovery(raw, c, group, fetchedAt)) places.set(place.id, place);
    }
    const value: JourneyDiscoveryResult = { places: [...places.values()].sort((a, b) => distanceKm(c, a) - distanceKm(c, b)).slice(0, 250),
      center: c, radius: 3000, fetchedAt, limited: limited || places.size > 250, attribution: 'Apple Maps' };
    remember(discoveryCache, key, value); return value;
  })();
  pending.set(key, operation);
  try { return await operation; } finally { pending.delete(key); }
}
