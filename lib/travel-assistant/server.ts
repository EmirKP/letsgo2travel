import { unstable_cache } from 'next/cache';
import { publicJson } from '../country-intelligence/fetch';
import { coarseLocation, normalizePlaces, overpassQuery } from './places';
import { makeQuote } from './money';
import type { Coordinates, MapMode, PlacesResult } from './types';

import { queryOverpass } from './overpass';
import { createMapResultCache } from './result-cache';
const pending = new Map<string, Promise<PlacesResult>>();
const lastPlaces = createMapResultCache<PlacesResult>(value => value.fetchedAt);
async function readProvider(center: Coordinates, mode: MapMode): Promise<PlacesResult> {
  const raw = await queryOverpass(overpassQuery(center, mode)) as { elements: unknown[] };
  const fetchedAt = new Date().toISOString();
  return { places: normalizePlaces(raw, mode, fetchedAt), center, fetchedAt, limited: raw.elements.length >= 250, radius: 3000 };
}

// Persistent Next Data Cache: workers share cached cells on supported hosts.
// Precision is ~1 km; exact device coordinates never enter this service.
const cachedPlaces = unstable_cache(async (lat: number, lon: number, mode: MapMode) =>
  readProvider({ latitude: lat, longitude: lon }, mode), ['travel-assistant-places-v1'], { revalidate: 3600 });

export async function getPlaces(center: Coordinates, mode: MapMode) {
  const c = coarseLocation(center);
  const key = `${c.latitude}:${c.longitude}:${mode}`;
  const fresh = lastPlaces.read(key, true); if (fresh) return fresh;
  const hit = pending.get(key); if (hit) return hit;
  if (pending.size >= 16) throw new Error('Map service busy');
  const operation = cachedPlaces(c.latitude, c.longitude, mode)
    .then(value => {
      lastPlaces.remember(key, value);
      // Next may serve an older snapshot while revalidating in the background.
      return lastPlaces.read(key, true) ? value : { ...value, stale: true };
    })
    .catch(error => {
      const previous = lastPlaces.read(key);
      if (previous) return { ...previous, stale: true };
      throw error;
    });
  pending.set(key, operation);
  try { return await operation; } finally { pending.delete(key); }
}

export async function getFx(base: string, quote: string) {
  const now = new Date();
  if (base === quote) return { base, quote, rate: 1, date: now.toISOString().slice(0,10), previousRate: null,
    previousDate: null, changePercent: null, fetchedAt: now.toISOString(), sourceUrl: 'https://frankfurter.dev/' };
  const from = new Date(now.getTime() - 10 * 86400000).toISOString().slice(0,10);
  const to = now.toISOString().slice(0,10);
  const raw = await publicJson<unknown>(`https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${quote}&from=${from}&to=${to}`, 3600);
  const value = makeQuote(raw, base, quote, now);
  if (!value) throw new Error('No recent exchange rate');
  return value;
}
