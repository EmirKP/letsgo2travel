import { requestJson } from './api';
import { TRAVEL_CENTRES } from './travelAreas';
import { normalizeSearchText } from './searchText';
import type { Coordinates, Place } from '../../../lib/travel-assistant/types';
import { coordinates, coarseLocation, distanceKm, safeWebsite, validJourneyPhoto, validJourneyPlaceSource, NEEDS, TOURING, DISCOVERY } from '../../../lib/travel-assistant/places';
import type { JourneyWalkingResult, JourneyPhoto } from '../../../lib/travel-assistant/journey-types';

export type DiscoveryGroup = 'food' | 'shopping' | 'culture' | 'nature' | 'essentials';
export type DiscoveryPlace = Place & Partial<JourneyPhoto> & { group?: DiscoveryGroup; kind?: string; address?: string | null };
export type DiscoveryResponse = { places: DiscoveryPlace[]; center: Coordinates; radius: number; fetchedAt: string; limited: boolean; stale?: boolean; attribution: string };
export type WalkingRoute = JourneyWalkingResult;
export type JourneyArea = Coordinates & { name: string; sourceUrl?: string; address?: string | null };
export type RouteDiscoveryCoverage = {
  centers: Coordinates[]; totalStopCount: number; coveredStopCount: number; omittedStopCount: number; complete: boolean;
};

/** At most three searches centred on real stops; coverage is never inferred from a straight route line. */
export function discoveryCentersForRoute(stops: Coordinates[], fallback: Coordinates): RouteDiscoveryCoverage {
  if (!Array.isArray(stops) || stops.length > 120 || stops.some(stop => !coordinates(stop))) throw new Error('invalid-stops');
  if (!stops.length) {
    const center = coordinates(fallback);
    if (!center) throw new Error('invalid-area');
    return { centers: [center], totalStopCount: 0, coveredStopCount: 0, omittedStopCount: 0, complete: true };
  }
  const seen = new Set<string>();
  const candidates = stops.flatMap(stop => {
    const center = coordinates(stop)!, coarse = coarseLocation(center);
    // ±180 represents the same geographic cell at the antimeridian.
    const key = `${coarse.latitude}:${coarse.longitude === 180 ? -180 : coarse.longitude}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ center, coarse, covers: stops.flatMap((point, index) => distanceKm(coarse, point) <= 3 ? [index] : []) }];
  });
  const covered = new Set<number>(), chosen = new Set<number>();
  const centers: Coordinates[] = [];
  while (centers.length < 3 && covered.size < stops.length) {
    let best = -1, gain = 0, separation = -1;
    candidates.forEach((candidate, index) => {
      if (chosen.has(index)) return;
      const added = candidate.covers.reduce((count, stop) => count + Number(!covered.has(stop)), 0);
      const apart = centers.length ? Math.min(...centers.map(center => distanceKm(coarseLocation(center), candidate.coarse))) : 0;
      if (added > gain || added > 0 && added === gain && apart > separation) { best = index; gain = added; separation = apart; }
    });
    if (best < 0) break;
    chosen.add(best);
    centers.push(candidates[best].center);
    for (const stop of candidates[best].covers) covered.add(stop);
  }
  return { centers, totalStopCount: stops.length, coveredStopCount: covered.size,
    omittedStopCount: stops.length - covered.size, complete: covered.size === stops.length };
}

const aliases: Record<string,string> = { rome:'Roma', londres:'London', londra:'London', stamboll:'İstanbul', istanbul:'İstanbul', tirane:'Tirana', prishtine:'Prishtina', tokio:'Tokyo' };
export function knownJourneyArea(query: string): JourneyArea | null {
  const text = normalizeSearchText(query);
  const name = aliases[text];
  return TRAVEL_CENTRES.find(area => normalizeSearchText(area.name) === text || area.name === name) || null;
}

/** Deterministic form assistance only. The user reviews every field and place. */
export function parseJourneyBrief(brief: string) {
  const normalized = normalizeSearchText(brief);
  const number = normalized.match(/\b(\d{1,2})\s*(?:gun|days?|dite)\b/)?.[1];
  const words = /\b(uc|three|tre)\s*(gun|days?|dite)\b/.test(normalized) ? 3 : undefined;
  const dayCount = number ? Math.min(14,Math.max(1,Number(number))) : words;
  const groups: DiscoveryGroup[] = [];
  if (/(tarih|historic|histor|kultur|cultur|museum|muze)/.test(normalized)) groups.push('culture');
  if (/(kafe|cafe|coffee|restora|yemek|food|ushq)/.test(normalized)) groups.push('food');
  if (/(magaza|dukkan|alisveris|shop|boutiq|dyqan|blerje)/.test(normalized)) groups.push('shopping');
  if (/(doga|park|nature|naty)/.test(normalized)) groups.push('nature');
  const city = TRAVEL_CENTRES.find(area => normalized.includes(normalizeSearchText(area.name)))?.name
    || Object.entries(aliases).find(([alias]) => normalized.includes(alias))?.[1];
  return { city, dayCount, groups };
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
  && [...value].every(character => character.charCodeAt(0) >= 32 && character !== '<' && character !== '>');
const recent = (value: unknown, age: number, now = Date.now()): value is string => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value && now - Date.parse(value) >= -60_000 && now - Date.parse(value) <= age;
};
const categories = new Set([...NEEDS, ...TOURING, ...DISCOVERY]);
const discoveryCategories: Record<DiscoveryGroup, readonly string[]> = {
  food: ['cafe', 'bakery', 'restaurant', 'sweets'], shopping: ['boutique', 'craft', 'gift', 'market', 'store'],
  nature: ['park', 'garden', 'viewpoint', 'beach', 'hiking'], culture: TOURING, essentials: NEEDS,
};
const validGroup = (value: unknown): value is DiscoveryGroup => typeof value === 'string' && Object.prototype.hasOwnProperty.call(discoveryCategories, value);
const osmId = (value: unknown): value is string => text(value, 64) && /^(node|way|relation)\/[1-9]\d*$/.test(value)
  && Number.isSafeInteger(Number(value.split('/')[1]));

/** Validate even a successful HTTP response before map rendering or persistence. */
export function validateDiscoveryResponse(raw: unknown, requested: Coordinates, group: DiscoveryGroup): DiscoveryResponse {
  const value = record(raw), center = coordinates(value.center), expected = coarseLocation(requested);
  const stale = value.stale === true;
  const apple = value.attribution === 'Apple Maps';
  if (!validGroup(group) || !center || Math.abs(center.latitude - expected.latitude) > 1e-8 || Math.abs(center.longitude - expected.longitude) > 1e-8
    || value.radius !== 3000 || typeof value.limited !== 'boolean' || (value.stale !== undefined && typeof value.stale !== 'boolean')
    || !recent(value.fetchedAt, (stale ? 6 : 1) * 3600_000) || (!apple && value.attribution !== '© OpenStreetMap contributors')
    || !Array.isArray(value.places) || value.places.length > 250) throw new Error('invalid-discovery');
  const ids = new Set<string>();
  const result = value.places.map((item: unknown): DiscoveryPlace => {
    const p = record(item), point = coordinates(p);
    if (!point || distanceKm(center, point) > 3.1 || !validJourneyPlaceSource(p.id, p.sourceUrl) || ids.has(p.id)
      || p.id.startsWith('apple/') !== apple
      || !text(p.name, 180) || (!p.name.trim() && group !== 'essentials') || !categories.has(p.category as Place['category'])
      || !discoveryCategories[group].includes(String(p.category)) || p.group !== group || p.kind !== p.category
      || p.fetchedAt !== value.fetchedAt || !(p.description === null || text(p.description, 500))
      || !(p.address === null || text(p.address, 500)) || !(p.hours === null || text(p.hours, 180))
      || !(p.free === null || typeof p.free === 'boolean') || !(p.accessible === null || typeof p.accessible === 'boolean')
      || !(p.website === null || typeof p.website === 'string' && p.website.length <= 2000 && safeWebsite(p.website))
      || !(p.representedCountry === null || typeof p.representedCountry === 'string' && /^[A-Z]{2}$/.test(p.representedCountry))
      || !validJourneyPhoto(p)) throw new Error('invalid-place');
    ids.add(p.id);
    return { ...point, id: p.id, category: p.category as Place['category'], name: p.name, sourceUrl: p.sourceUrl as string,
      fetchedAt: value.fetchedAt as string, group, kind: p.kind as string, address: p.address as string | null,
      description: p.description as string | null, hours: p.hours as string | null, free: p.free as boolean | null,
      accessible: p.accessible as boolean | null, website: p.website as string | null, representedCountry: p.representedCountry as string | null,
      ...(p.imageUrl === undefined ? {} : { imageUrl: p.imageUrl as string, imageSourceUrl: p.imageSourceUrl as string,
        imageAttribution: p.imageAttribution as string, imageLicenseLabel: p.imageLicenseLabel as string, imageLicenseUrl: p.imageLicenseUrl as string }) };
  });
  return { places: result, center, radius: 3000, fetchedAt: value.fetchedAt as string, limited: value.limited as boolean,
    ...(stale ? { stale: true } : {}), attribution: apple ? 'Apple Maps' : '© OpenStreetMap contributors' };
}

export function validateWalkingResponse(raw: unknown, stops: Coordinates[]): WalkingRoute {
  const value = record(raw), geometry = record(value.geometry);
  const apple = value.sourceUrl === 'https://maps.apple.com/' && value.attribution === 'Apple Maps';
  const ors = value.sourceUrl === 'https://openrouteservice.org/' && value.attribution === 'openrouteservice.org | © OpenStreetMap contributors';
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 20 || stops.some(stop => !coordinates(stop)) || value.profile !== 'foot-walking'
    || (!apple && !ors) || geometry.type !== (apple ? 'MultiLineString' : 'LineString')
    || !recent(value.fetchedAt, 16 * 60_000) || !Array.isArray(geometry.coordinates)
    || !Array.isArray(value.legs) || value.legs.length !== stops.length - 1) throw new Error('invalid-route');
  const positive = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max;
  const rawPaths: unknown[] = apple ? geometry.coordinates : [geometry.coordinates];
  if (rawPaths.length !== (apple ? stops.length - 1 : 1)) throw new Error('invalid-route');
  let vertexCount = 0;
  const paths = rawPaths.map((path: unknown): [number, number][] => {
    if (!Array.isArray(path) || path.length < 2 || (vertexCount += path.length) > 20_000) throw new Error('invalid-route');
    return path.map((point: unknown): [number, number] => {
      if (!Array.isArray(point) || point.length !== 2 || !coordinates({ latitude: point[1], longitude: point[0] })) throw new Error('invalid-route');
      return [point[0] as number, point[1] as number];
    });
  });
  const near = (point: [number, number], stop: Coordinates) => distanceKm(stop, { latitude: point[1], longitude: point[0] }) <= 0.12;
  if (apple) {
    // Adjacent legs may snap to different entrances. Never connect their endpoints.
    paths.forEach((path, index) => {
      if (!near(path[0], stops[index]) || !near(path.at(-1)!, stops[index + 1])) throw new Error('route-mismatch');
    });
  } else {
    const points = paths[0];
    let cursor = 0;
    for (const stop of stops) {
      const index = points.findIndex((point, index) => index >= cursor && near(point, stop));
      if (index < 0) throw new Error('route-mismatch');
      cursor = index;
    }
    if (!near(points[0], stops[0]) || !near(points.at(-1)!, stops.at(-1)!)) throw new Error('route-mismatch');
  }
  const legs = value.legs.map((item: unknown, index: number) => {
    const leg = record(item);
    if (!positive(leg.distanceMeters, 100_000) || !positive(leg.durationSeconds, 86_400)
      || leg.distanceMeters / leg.durationSeconds > 4 || leg.distanceMeters + 250 < distanceKm(stops[index], stops[index + 1]) * 1000) throw new Error('invalid-route');
    return { distanceMeters: leg.distanceMeters, durationSeconds: leg.durationSeconds };
  });
  const distance = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0), duration = legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
  if (!positive(value.distanceMeters, 200_000) || !positive(value.durationSeconds, 172_800)
    || Math.abs(value.distanceMeters - distance) > Math.max(2, distance * 0.005)
    || Math.abs(value.durationSeconds - duration) > Math.max(2, duration * 0.005)) throw new Error('invalid-route');
  paths.forEach((points, pathIndex) => {
    let geometryDistance = 0;
    for (let index = 1; index < points.length; index++) geometryDistance += distanceKm(
      { latitude: points[index - 1][1], longitude: points[index - 1][0] }, { latitude: points[index][1], longitude: points[index][0] }) * 1000;
    const expectedDistance = apple ? legs[pathIndex].distanceMeters : distance;
    if (Math.abs(geometryDistance - expectedDistance) > Math.max(250, expectedDistance * 0.15)) throw new Error('invalid-route');
  });
  return { profile: 'foot-walking', geometry: apple ? { type: 'MultiLineString', coordinates: paths } : { type: 'LineString', coordinates: paths[0] },
    distanceMeters: distance, durationSeconds: duration, legs, fetchedAt: value.fetchedAt as string,
    sourceUrl: value.sourceUrl as string, attribution: value.attribution as string };
}

export function validateJourneySearch(raw: unknown): JourneyArea[] {
  const value = record(raw);
  const apple = value.attribution === 'Apple Maps';
  if (!Array.isArray(value.places) || value.places.length > 8 || !recent(value.fetchedAt, 3600_000)
    || (!apple && value.attribution !== '© OpenStreetMap contributors')) throw new Error('invalid-search');
  const ids = new Set<string>();
  return value.places.map((item: unknown) => {
    const row = record(item), point = coordinates(row);
    const identity = point && typeof row.id === 'string' && (apple
      ? row.id.startsWith('apple/') && validJourneyPlaceSource(row.id, row.sourceUrl)
        || row.id === `apple-area/${point.latitude},${point.longitude}` && row.sourceUrl === `https://maps.apple.com/place?coordinate=${point.latitude},${point.longitude}`
      : osmId(row.id) && validJourneyPlaceSource(row.id, row.sourceUrl));
    if (!point || !identity || typeof row.id !== 'string' || ids.has(row.id) || !text(row.name, 260) || !row.name.trim()
      || !(row.address === null || text(row.address, 260))) throw new Error('invalid-search');
    ids.add(row.id);
    return { ...point, name: row.name, sourceUrl: row.sourceUrl as string, address: row.address as string | null };
  });
}

export async function searchJourneyArea(query: string, signal?: AbortSignal, locale: 'tr' | 'en' | 'sq' = 'tr'): Promise<JourneyArea[]> {
  const known = knownJourneyArea(query);
  if (known) return [known];
  const result = await requestJson<unknown>('/api/travel-assistant/journey-search', {method:'POST',body:{query:query.trim(),locale},signal,timeoutMs:15000});
  return validateJourneySearch(result);
}

export async function discoverJourneyPlaces(center:Coordinates, category:DiscoveryGroup, signal?:AbortSignal) {
  if (!coordinates(center) || !validGroup(category)) throw new Error('invalid-area');
  const result = await requestJson<unknown>('/api/travel-assistant/discover', {method:'POST',body:{...center,category,placeCategoryVersion:2},signal,timeoutMs:32000});
  return validateDiscoveryResponse(result, center, category);
}
export async function loadWalkingRoute(stops:Coordinates[], signal?:AbortSignal) {
  if (stops.length < 2 || stops.length > 20 || stops.some(stop => !coordinates(stop))) throw new Error('invalid-stops');
  const result = await requestJson<unknown>('/api/travel-assistant/journey-route', {method:'POST',body:{stops},signal,timeoutMs:18000});
  return validateWalkingResponse(result, stops);
}
