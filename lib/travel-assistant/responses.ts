import { dateStamp } from './evidence';
import { CURRENCIES } from './money';
import { coordinates, coarseLocation, NEEDS, TOURING, safeWebsite } from './places';
import type { Coordinates, FxQuote, MapMode, Place, PlacesResult } from './types';

export const PLACES_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const PLACES_REFRESH_MS = 60 * 60 * 1000;

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) && new Date(result).toISOString() === value ? result : null;
}
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const nullableText = (value: unknown, max: number) => value === null || text(value, max);
const nullableBool = (value: unknown) => value === null || typeof value === 'boolean';

export function validatePlaces(raw: unknown, center: Coordinates, mode: MapMode, now = Date.now()): PlacesResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as PlacesResult;
  const point = coordinates(value.center);
  const requested = coarseLocation(center);
  const fetched = timestamp(value.fetchedAt);
  if (!point || point.latitude !== requested.latitude || point.longitude !== requested.longitude
    || fetched === null || fetched > now + 60_000 || now - fetched > PLACES_MAX_AGE_MS
    || value.radius !== 3000 || typeof value.limited !== 'boolean'
    || (value.stale !== undefined && typeof value.stale !== 'boolean')
    || !Array.isArray(value.places) || value.places.length > 250) return null;
  const ids = new Set<string>();
  const places: Place[] = [];
  for (const p of value.places) {
    if (!p || !coordinates(p) || !(mode === 'needs' ? NEEDS : TOURING).includes(p.category)
      || typeof p.id !== 'string' || !/^(node|way|relation)\/[1-9]\d*$/.test(p.id) || ids.has(p.id)
      || p.sourceUrl !== `https://www.openstreetmap.org/${p.id}` || p.fetchedAt !== value.fetchedAt
      || !text(p.name, 180) || !nullableText(p.description, 500) || !nullableText(p.hours, 180)
      || !nullableBool(p.free) || !nullableBool(p.accessible)
      || !(p.website === null || safeWebsite(p.website))
      || !(p.representedCountry === null || typeof p.representedCountry === 'string' && /^[A-Z]{2}$/.test(p.representedCountry))) return null;
    ids.add(p.id);
    places.push({ id: p.id, category: p.category, name: p.name, description: p.description, hours: p.hours,
      free: p.free, accessible: p.accessible, website: p.website, representedCountry: p.representedCountry,
      latitude: p.latitude, longitude: p.longitude, sourceUrl: p.sourceUrl, fetchedAt: p.fetchedAt });
  }
  return { center: point, places, fetchedAt: value.fetchedAt, radius: 3000, limited: value.limited,
    stale: value.stale === true || now - fetched >= PLACES_REFRESH_MS };
}

export function validateQuote(raw: unknown, base: string, quote: string, now = Date.now()): FxQuote | null {
  if (!raw || typeof raw !== 'object' || !CURRENCIES.includes(base) || !CURRENCIES.includes(quote)) return null;
  const q = raw as FxQuote;
  const date = dateStamp(q.date);
  const fetched = timestamp(q.fetchedAt);
  const today = Math.floor(now / 86400000) * 86400000;
  if (q.base !== base || q.quote !== quote || typeof q.rate !== 'number' || !Number.isFinite(q.rate) || q.rate <= 0
    || date === null || date > today || fetched === null || fetched > now + 60_000 || fetched < date
    || q.sourceUrl !== 'https://frankfurter.dev/') return null;
  let previousRate: number | null = null;
  let previousDate: string | null = null;
  let changePercent: number | null = null;
  if (q.previousRate !== null || q.previousDate !== null || q.changePercent !== null) {
    const previous = dateStamp(q.previousDate);
    if (previous === null || previous >= date || typeof q.previousRate !== 'number' || !Number.isFinite(q.previousRate)
      || q.previousRate <= 0 || typeof q.changePercent !== 'number' || !Number.isFinite(q.changePercent)) return null;
    changePercent = (q.rate / q.previousRate - 1) * 100;
    if (!Number.isFinite(changePercent) || Math.abs(q.changePercent - changePercent) > 1e-8 * Math.max(1, Math.abs(changePercent))) return null;
    previousRate = q.previousRate; previousDate = q.previousDate;
  }
  if (base === quote && (q.rate !== 1 || previousRate !== null)) return null;
  return { base, quote, rate: q.rate, date: q.date, previousRate, previousDate, changePercent,
    fetchedAt: q.fetchedAt, sourceUrl: q.sourceUrl };
}

// One result in volatile memory, never a persistent device location history.
// A different cell or mode cannot borrow this result; invalid/old data cannot be revived.
export function createPlacesLoader(request: (center: Coordinates, mode: MapMode) => Promise<unknown>, clock = Date.now) {
  let last: { mode: MapMode; result: PlacesResult } | null = null;
  let generation = 0;
  const pending = new Map<string, Promise<PlacesResult>>();
  return async (center: Coordinates, mode: MapMode): Promise<PlacesResult> => {
    const valid = coordinates(center);
    if (!valid || !['needs', 'explore'].includes(mode)) throw new Error('Invalid map request');
    const c = coarseLocation(valid);
    const key = `${c.latitude}:${c.longitude}:${mode}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const id = ++generation;
    const operation = Promise.resolve().then(async () => { try {
      const result = validatePlaces(await request(c, mode), c, mode, clock());
      if (!result) throw new Error('Invalid map response');
      if (id === generation) last = { mode, result };
      return result;
    } catch (error) {
      const fallback = last?.mode === mode ? validatePlaces(last.result, c, mode, clock()) : null;
      if (fallback) return { ...fallback, stale: true };
      throw error;
    } finally { pending.delete(key); } });
    pending.set(key, operation);
    return operation;
  };
}
