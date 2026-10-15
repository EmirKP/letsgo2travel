import { coordinates, distanceKm } from './places';
import type { Coordinates } from './types';
import type { JourneyWalkingResult } from './journey-types';
import { getAppleJourneyWalkingRoute, hasAppleJourneyRouting } from './journey-apple-routing';

// Deliberately no public demo/driving server fallback. The configured service
// must support ORS foot-walking GeoJSON and is called only for the selected day.
// https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/
export function journeyStops(value: unknown): Coordinates[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20) return null;
  const stops = value.map(coordinates);
  if (stops.some(stop => !stop)) return null;
  const valid = stops as Coordinates[];
  let total = 0;
  for (let index = 1; index < valid.length; index++) {
    const distance = distanceKm(valid[index - 1], valid[index]);
    if (distance < 0.001 || distance > 30) return null;
    total += distance;
  }
  return total <= 100 ? valid : null;
}
export function providerUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || !url.hostname.includes('.')
    || /^(localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) throw new Error('Invalid journey provider');
  return url;
}
export async function providerJson(response: Response, limit = 2_000_000): Promise<unknown> {
  if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw new Error('Journey provider unavailable'); }
  if (Number(response.headers.get('content-length')) > limit) { await response.body.cancel().catch(() => {}); throw new Error('Journey response too large'); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel().catch(() => {}); throw new Error('Journey response too large'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  return JSON.parse(text);
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positive = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
export function normalizeWalkingRoute(raw: unknown, stops: Coordinates[], fetchedAt: string): JourneyWalkingResult {
  const data = object(raw), metadata = object(data.metadata), query = object(metadata.query);
  if (data.type !== 'FeatureCollection' || data.error || query.profile !== 'foot-walking' || !Array.isArray(data.features) || data.features.length !== 1) throw new Error('Invalid walking route');
  const feature = object(data.features[0]), properties = object(feature.properties), geometry = object(feature.geometry), summary = object(properties.summary);
  if (feature.type !== 'Feature' || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)
    || geometry.coordinates.length < 2 || geometry.coordinates.length > 20_000 || !Array.isArray(properties.segments)
    || properties.segments.length !== stops.length - 1 || !Array.isArray(properties.way_points) || properties.way_points.length !== stops.length
    || (Array.isArray(properties.warnings) && properties.warnings.length)) throw new Error('Incomplete walking route');
  const points: [number, number][] = geometry.coordinates.map((value: unknown) => {
    if (!Array.isArray(value) || value.length !== 2 || !coordinates({ latitude: value[1], longitude: value[0] })) throw new Error('Invalid route point');
    return [value[0] as number, value[1] as number];
  });
  const waypoints = properties.way_points as unknown[];
  for (let index = 0; index < stops.length; index++) {
    const pointIndex = waypoints[index];
    if (!Number.isSafeInteger(pointIndex) || Number(pointIndex) < 0 || Number(pointIndex) >= points.length
      || (index > 0 && Number(pointIndex) < Number(waypoints[index - 1]))) throw new Error('Invalid route waypoint');
    const point = points[Number(pointIndex)];
    // Requested 100 m snapping: a route for another city or an omitted stop cannot pass.
    if (distanceKm(stops[index], { latitude: point[1], longitude: point[0] }) > 0.12) throw new Error('Route does not visit requested stop');
  }
  if (waypoints[0] !== 0 || waypoints.at(-1) !== points.length - 1) throw new Error('Incomplete route geometry');
  const legs = properties.segments.map((value: unknown, index: number) => {
    const leg = object(value);
    if (!positive(leg.distance, 100_000) || !positive(leg.duration, 86_400)) throw new Error('Invalid walking segment');
    const straightDistance = distanceKm(stops[index], stops[index + 1]) * 1000;
    if (leg.distance + 250 < straightDistance || leg.distance / leg.duration > 4) throw new Error('Invalid walking metrics');
    return { distanceMeters: leg.distance, durationSeconds: leg.duration };
  });
  const distanceMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  const durationSeconds = legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
  if (!positive(summary.distance, 200_000) || !positive(summary.duration, 172_800)
    || Math.abs(summary.distance - distanceMeters) > Math.max(2, distanceMeters * 0.005)
    || Math.abs(summary.duration - durationSeconds) > Math.max(2, durationSeconds * 0.005)) throw new Error('Inconsistent route summary');
  let geometryDistance = 0;
  for (let index = 1; index < points.length; index++) geometryDistance += distanceKm(
    { latitude: points[index - 1][1], longitude: points[index - 1][0] }, { latitude: points[index][1], longitude: points[index][0] }) * 1000;
  if (Math.abs(geometryDistance - distanceMeters) > Math.max(250, distanceMeters * 0.15)) throw new Error('Inconsistent route geometry');
  return { profile: 'foot-walking', geometry: { type: 'LineString', coordinates: points }, distanceMeters, durationSeconds, legs,
    fetchedAt, sourceUrl: 'https://openrouteservice.org/', attribution: 'openrouteservice.org | © OpenStreetMap contributors' };
}
const cache = new Map<string, { until: number; value: JourneyWalkingResult }>();
const pending = new Map<string, Promise<JourneyWalkingResult>>();
let windowStart = 0, requests = 0, cooldown = 0;
export async function getJourneyWalkingRoute(stops: Coordinates[]): Promise<JourneyWalkingResult> {
  if (!journeyStops(stops)) throw new Error('Invalid walking stops');
  // A configured Apple identity is authoritative. Its auth/quota failures never
  // trigger an automatic request to another provider.
  if (hasAppleJourneyRouting()) return getAppleJourneyWalkingRoute(stops);
  const configured = process.env.TRAVEL_ORS_URL?.trim(), apiKey = process.env.TRAVEL_ORS_API_KEY?.trim();
  if (!configured && !apiKey) throw new Error('Walking provider not configured');
  const endpoint = providerUrl(configured || 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson');
  if (!endpoint.pathname.endsWith('/v2/directions/foot-walking/geojson')) throw new Error('Walking provider profile required');
  const key = JSON.stringify(stops), now = Date.now();
  const hit = cache.get(key); if (hit && hit.until > now) return hit.value;
  const waiting = pending.get(key); if (waiting) return waiting;
  if (now - windowStart >= 60_000) { windowStart = now; requests = 0; }
  if (pending.size >= 2 || requests >= 20 || cooldown > now) throw new Error('Walking service busy');
  requests++;
  const operation = (async () => {
    const response = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/geo+json', 'Content-Type': 'application/json',
      'User-Agent': 'LetsGo2Travel/1.4 (+https://www.letsgo2travel.com.tr)', ...(apiKey ? { Authorization: apiKey } : {}) },
      body: JSON.stringify({ coordinates: stops.map(stop => [stop.longitude, stop.latitude]), instructions: false, elevation: false, radiuses: stops.map(() => 100) }),
      redirect: 'error', signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    if (response.status === 429 || response.status === 403) {
      const retry = response.headers.get('retry-after') || '60';
      const milliseconds = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      cooldown = Date.now() + Math.max(60_000, Number.isFinite(milliseconds) ? milliseconds : 60_000);
    }
    const value = normalizeWalkingRoute(await providerJson(response), stops, new Date().toISOString());
    cache.set(key, { until: Date.now() + 15 * 60_000, value });
    if (cache.size > 32) cache.delete(cache.keys().next().value!);
    return value;
  })();
  pending.set(key, operation);
  try { return await operation; }
  catch (error) { cooldown = Math.max(cooldown, Date.now() + 5000); throw error; }
  finally { pending.delete(key); }
}
