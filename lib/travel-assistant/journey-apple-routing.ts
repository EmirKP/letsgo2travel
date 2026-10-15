import { appleMapsDirections, appleMapsServerConfigured, appleMapsServerIdentity } from '../maps/apple-maps-server';
import { coordinates, distanceKm } from './places';
import type { Coordinates } from './types';
import type { JourneyWalkingResult } from './journey-types';

// https://developer.apple.com/documentation/applemapsserverapi/-v1-directions
// https://developer.apple.com/documentation/applemapsserverapi/directionsresponse/step
type Leg = { points: [number, number][]; distanceMeters: number; durationSeconds: number; fetchedAt: string };
const fail = () => new Error('Apple walking route unavailable');
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const metric = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const walking = (value: unknown) => typeof value === 'string' && value.toLowerCase() === 'walking';

export const hasAppleJourneyRouting = appleMapsServerConfigured;

export function normalizeAppleWalkingLeg(raw: unknown, from: Coordinates, to: Coordinates, fetchedAt: string): Leg {
  const data = object(raw);
  if (data.error || !coordinates(from) || !coordinates(to) || !Array.isArray(data.routes) || data.routes.length !== 1
    || !Array.isArray(data.steps) || !data.steps.length || data.steps.length > 2000
    || !Array.isArray(data.stepPaths) || !data.stepPaths.length || data.stepPaths.length > 2000) throw fail();
  const route = object(data.routes[0]);
  if (!walking(route.transportType) || !metric(route.distanceMeters, 100_000) || route.distanceMeters <= 0
    || !metric(route.durationSeconds, 86_400) || route.durationSeconds <= 0
    || !Array.isArray(route.stepIndexes) || !route.stepIndexes.length || route.stepIndexes.length > 2000) throw fail();
  const points: [number, number][] = [], seenSteps = new Set<number>(), seenPaths = new Set<number>();
  let distance = 0, duration = 0;
  for (const index of route.stepIndexes) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= data.steps.length || seenSteps.has(index)) throw fail();
    seenSteps.add(index);
    const step = object(data.steps[index]), pathIndex = step.stepPathIndex;
    if ((step.transportType !== undefined && !walking(step.transportType)) || !metric(step.distanceMeters, 100_000)
      || !metric(step.durationSeconds, 86_400) || !Number.isSafeInteger(pathIndex) || Number(pathIndex) < 0
      || Number(pathIndex) >= data.stepPaths.length || seenPaths.has(Number(pathIndex))) throw fail();
    seenPaths.add(Number(pathIndex));
    const path = data.stepPaths[Number(pathIndex)];
    if (!Array.isArray(path) || !path.length || path.length > 20_000 || points.length + path.length > 22_000) throw fail();
    const parsed = path.map((point: unknown): [number, number] => {
      const p = coordinates(point); if (!p) throw fail(); return [p.longitude, p.latitude];
    });
    // Apple defines exact shared endpoints between consecutive step paths. A
    // missing step must fail, never become a straight bridge across the gap.
    if (points.length) {
      const previous = points[points.length - 1], next = parsed[0];
      if (previous[0] !== next[0] || previous[1] !== next[1]) throw fail();
      parsed.shift();
    }
    for (const point of parsed) points.push(point);
    distance += step.distanceMeters; duration += step.durationSeconds;
  }
  if (points.length < 2 || points.length > 20_000
    || Math.abs(distance - route.distanceMeters) > Math.max(5, seenSteps.size, route.distanceMeters * 0.01)
    || Math.abs(duration - route.durationSeconds) > Math.max(5, seenSteps.size, route.durationSeconds * 0.01)) throw fail();
  const start = points[0], end = points[points.length - 1];
  if (distanceKm(from, { latitude: start[1], longitude: start[0] }) > 0.12
    || distanceKm(to, { latitude: end[1], longitude: end[0] }) > 0.12
    || route.distanceMeters + 250 < distanceKm(from, to) * 1000 || route.distanceMeters / route.durationSeconds > 4) throw fail();
  let geometryDistance = 0;
  for (let index = 1; index < points.length; index++) geometryDistance += distanceKm(
    { latitude: points[index - 1][1], longitude: points[index - 1][0] }, { latitude: points[index][1], longitude: points[index][0] }) * 1000;
  if (Math.abs(geometryDistance - route.distanceMeters) > Math.max(250, route.distanceMeters * 0.15)) throw fail();
  return { points, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, fetchedAt };
}

const cache = new Map<string, { until: number; value: Leg }>();
const pending = new Map<string, Promise<Leg>>();
let identity = '';

async function leg(from: Coordinates, to: Coordinates, deadline: number, keyIdentity: string): Promise<Leg> {
  if (Date.now() >= deadline) throw fail();
  const key = `${keyIdentity}:${JSON.stringify([from, to])}`, hit = cache.get(key);
  if (hit && hit.until > Date.now() && Date.parse(hit.value.fetchedAt) <= Date.now()) return hit.value;
  const existing = pending.get(key); if (existing) return existing;
  if (pending.size >= 4) throw fail();
  const operation = (async () => {
    const params = new URLSearchParams({ origin: `${from.latitude},${from.longitude}`, destination: `${to.latitude},${to.longitude}`,
      transportType: 'Walking', requestsAlternateRoutes: 'false', lang: 'en-US' });
    const raw = await appleMapsDirections(params, deadline);
    if (Date.now() >= deadline || appleMapsServerIdentity() !== keyIdentity) throw fail();
    const value = normalizeAppleWalkingLeg(raw, from, to, new Date().toISOString());
    cache.set(key, { value, until: Date.now() + 15 * 60_000 });
    if (cache.size > 128) cache.delete(cache.keys().next().value!);
    return value;
  })();
  pending.set(key, operation);
  try { return await operation; } finally { if (pending.get(key) === operation) pending.delete(key); }
}

export async function getAppleJourneyWalkingRoute(stops: Coordinates[]): Promise<JourneyWalkingResult> {
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 20 || stops.some(stop => !coordinates(stop))) throw fail();
  const currentIdentity = appleMapsServerIdentity();
  if (currentIdentity !== identity) { cache.clear(); identity = currentIdentity; }
  const deadline = Date.now() + 15_000, results: Leg[] = new Array(stops.length - 1);
  let cursor = 0, stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
  const worker = async () => {
    while (!stopped && cursor < results.length) {
      const index = cursor++;
      try { results[index] = await leg(stops[index], stops[index + 1], deadline, currentIdentity); }
      catch { stopped = true; throw fail(); }
    }
  };
  const timed = new Promise<never>((_, reject) => { timer = setTimeout(() => { stopped = true; reject(fail()); }, 15_000); });
  try { await Promise.race([Promise.all([worker(), worker()]), timed]); }
  finally { clearTimeout(timer); }
  if (stopped || results.some(value => !value) || appleMapsServerIdentity() !== currentIdentity) throw fail();
  const distanceMeters = results.reduce((sum, value) => sum + value.distanceMeters, 0);
  const durationSeconds = results.reduce((sum, value) => sum + value.durationSeconds, 0);
  if (results.reduce((sum, value) => sum + value.points.length, 0) > 20_000 || distanceMeters > 200_000 || durationSeconds > 172_800) throw fail();
  return { profile: 'foot-walking', geometry: { type: 'MultiLineString', coordinates: results.map(value => value.points) },
    distanceMeters, durationSeconds, legs: results.map(({ distanceMeters, durationSeconds }) => ({ distanceMeters, durationSeconds })),
    fetchedAt: results.reduce((oldest, value) => value.fetchedAt < oldest ? value.fetchedAt : oldest, results[0].fetchedAt),
    sourceUrl: 'https://maps.apple.com/', attribution: 'Apple Maps' };
}
