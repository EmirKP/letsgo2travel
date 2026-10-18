import { unstable_cache } from 'next/cache';
import { coarseLocation, coordinates, distanceKm, normalizePlaces, safeWebsite } from './places';
import { queryOverpass } from './overpass';
import { createMapResultCache } from './result-cache';
import { enrichJourneyPhotos } from './journey-photos';
import { hasAppleJourneyPlaces, discoverAppleJourneyPlaces } from './journey-apple-places';
import type { Coordinates, PointCategory } from './types';
import type { JourneyDiscoveryGroup, JourneyDiscoveryPlace, JourneyDiscoveryResult } from './journey-types';

export const DISCOVERY_GROUPS: JourneyDiscoveryGroup[] = ['food', 'shopping', 'culture', 'nature', 'essentials'];
const selectors: Record<JourneyDiscoveryGroup, string[]> = {
  food: ['[amenity~"^(cafe|restaurant|fast_food|ice_cream)$"]', '[shop~"^(bakery|pastry|confectionery|chocolate)$"]'],
  shopping: ['[shop~"^(boutique|clothes|craft|gift|souvenir|supermarket|convenience|variety_store)$"]', '[craft~"^(pottery|jeweller|handicraft)$"]', '[amenity=marketplace]'],
  culture: ['[tourism~"^(museum|attraction)$"]', '[historic~"^(monument|memorial|castle|ruins|archaeological_site|palace)$"]', '[artwork_type=statue]', '[place=square]'],
  nature: ['[leisure~"^(park|garden|nature_reserve)$"]', '[tourism=viewpoint]', '[natural=beach]'],
  essentials: ['[amenity~"^(hospital|pharmacy|police|atm|bank|bus_station|bureau_de_change|toilets)$"]', '[railway~"^(station|halt|subway_entrance|tram_stop)$"]', '[public_transport=station]', '[highway=bus_stop]', '[internet_access=wlan]'],
};
const clean = (value: unknown, max = 180): string => typeof value === 'string'
  ? value.replace(/<[^>]*>/g, ' ').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
export function discoveryQuery(center: Coordinates, group: JourneyDiscoveryGroup) {
  const valid = coordinates(center);
  if (!valid || !DISCOVERY_GROUPS.includes(group)) throw new Error('Invalid discovery query');
  const c = coarseLocation(valid);
  // Bounding-box selection uses Overpass's spatial index. Repeated `around`
  // filters expanded way/relation geometries before this tiny POI response and
  // routinely exhausted the provider budget in dense historic city centres.
  // Keep the circular radius check in normalization; never expose box corners
  // as nearby results. Split antimeridian bounds instead of querying the globe.
  const latDelta = 3 / 110.574, lonDelta = 3 / (111.32 * Math.cos(c.latitude * Math.PI / 180));
  const south = Math.max(-85, c.latitude - latDelta), north = Math.min(85, c.latitude + latDelta);
  const west = c.longitude - lonDelta, east = c.longitude + lonDelta;
  const longitudeRanges = west < -180 ? [[west + 360, 180], [-180, east]]
    : east > 180 ? [[west, 180], [-180, east - 360]] : [[west, east]];
  const boxes = longitudeRanges.map(([left, right]) => [south, left, north, right].map(value => value.toFixed(5)).join(','));
  const named = group === 'essentials' ? '' : '[~"^name(:en)?$"~"."]';
  return `[out:json][timeout:12][maxsize:4000000];(${boxes.flatMap(box => selectors[group].map(selector => `nwr(${box})${selector}${named};`)).join('')});out center tags 250;`;
}
function discoveryKind(tags: Record<string, unknown>, group: JourneyDiscoveryGroup): PointCategory | null {
  const { amenity, shop, leisure, tourism, craft } = tags;
  if (group === 'food') {
    if (amenity === 'cafe') return 'cafe';
    if (amenity === 'restaurant' || amenity === 'fast_food') return 'restaurant';
    if (shop === 'bakery') return 'bakery';
    if (amenity === 'ice_cream' || ['pastry', 'confectionery', 'chocolate'].includes(String(shop))) return 'sweets';
  }
  if (group === 'shopping') {
    if (shop === 'boutique' || shop === 'clothes') return 'boutique';
    if (shop === 'craft' || ['pottery', 'jeweller', 'handicraft'].includes(String(craft))) return 'craft';
    if (shop === 'gift' || shop === 'souvenir') return 'gift';
    if (amenity === 'marketplace' || ['supermarket', 'convenience', 'variety_store'].includes(String(shop))) return 'market';
  }
  if (group === 'nature') {
    if (tags.natural === 'beach') return 'beach';
    if (leisure === 'garden') return 'garden';
    if (leisure === 'park' || leisure === 'nature_reserve') return 'park';
    if (tourism === 'viewpoint') return 'viewpoint';
  }
  return null;
}
export function normalizeDiscovery(raw: unknown, center: Coordinates, group: JourneyDiscoveryGroup, fetchedAt: string): JourneyDiscoveryPlace[] {
  if (!raw || typeof raw !== 'object' || !('elements' in raw) || !Array.isArray(raw.elements) || ('remark' in raw && raw.remark)) throw new Error('Incomplete discovery');
  const found = new Set<string>();
  return raw.elements.slice(0, 250).flatMap((element: unknown): JourneyDiscoveryPlace[] => {
    if (!element || typeof element !== 'object') return [];
    const row = element as { id?: number; type?: string; lat?: unknown; lon?: unknown; center?: { lat?: unknown; lon?: unknown }; tags?: Record<string, unknown> };
    const tags = row.tags && typeof row.tags === 'object' ? row.tags : {};
    const point = coordinates({ latitude: row.lat ?? row.center?.lat, longitude: row.lon ?? row.center?.lon });
    if (!point || distanceKm(center, point) > 3.1 || !['node', 'way', 'relation'].includes(String(row.type)) || !Number.isSafeInteger(row.id) || Number(row.id) < 1) return [];
    const id = `${row.type}/${row.id}`;
    if (found.has(id)) return [];
    let kind = discoveryKind(tags, group);
    if (group === 'culture' || group === 'essentials') {
      const traditional = normalizePlaces({ elements: [row] }, group === 'culture' ? 'explore' : 'needs', fetchedAt, true)[0];
      kind = traditional?.category ?? null;
    }
    if (!kind) return [];
    const name = clean(tags.name || tags['name:en']);
    // Unnamed emergency amenities remain useful; unnamed shops cannot be sold as recommendations.
    if (!name && group !== 'essentials') return [];
    found.add(id);
    const address = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].map(value => clean(value, 100)).filter(Boolean).join(', ') || null;
    return [{ ...point, id, name, category: kind, group, kind, address, description: clean(tags.description, 500) || null,
      hours: clean(tags.opening_hours) || null, free: tags.fee === 'no' ? true : tags.fee === 'yes' ? false : null,
      accessible: tags.wheelchair === 'yes' ? true : tags.wheelchair === 'no' ? false : null,
      website: safeWebsite(tags.website || tags['contact:website']), representedCountry: null,
      sourceUrl: `https://www.openstreetmap.org/${id}`, fetchedAt }];
  }).sort((a, b) => distanceKm(center, a) - distanceKm(center, b));
}
const pending = new Map<string, Promise<JourneyDiscoveryResult>>();
const snapshots = createMapResultCache<JourneyDiscoveryResult>(result => result.fetchedAt);
const cachedDiscovery = unstable_cache(async (latitude: number, longitude: number, group: JourneyDiscoveryGroup): Promise<JourneyDiscoveryResult> => {
  const center = { latitude, longitude };
  const raw = await queryOverpass(discoveryQuery(center, group)) as { elements: unknown[] };
  const fetchedAt = new Date().toISOString();
  return { places: await enrichJourneyPhotos(normalizeDiscovery(raw, center, group, fetchedAt), raw), center, radius: 3000,
    fetchedAt, limited: raw.elements.length >= 250, attribution: '© OpenStreetMap contributors' };
}, ['journey-discovery-v4'], { revalidate: 3600 });

export async function discoverJourneyPlaces(center: Coordinates, group: JourneyDiscoveryGroup): Promise<JourneyDiscoveryResult> {
  if (!coordinates(center) || !DISCOVERY_GROUPS.includes(group)) throw new Error('Invalid discovery');
  if (hasAppleJourneyPlaces()) return discoverAppleJourneyPlaces(center, group);
  const c = coarseLocation(center), key = `${c.latitude}:${c.longitude}:${group}`;
  const fresh = snapshots.read(key, true); if (fresh) return fresh;
  const existing = pending.get(key); if (existing) return existing;
  if (pending.size >= 8) throw new Error('Discovery busy');
  const operation = cachedDiscovery(c.latitude, c.longitude, group).then(value => {
    snapshots.remember(key, value);
    return snapshots.read(key, true) ? value : { ...value, stale: true };
  }).catch(error => {
    const previous = snapshots.read(key);
    if (previous) return { ...previous, stale: true };
    throw error;
  });
  pending.set(key, operation);
  try { return await operation; } finally { pending.delete(key); }
}
