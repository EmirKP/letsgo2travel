import { unstable_cache } from 'next/cache';
import { publicJson } from '../country-intelligence/fetch';
import { coarseLocation, normalizePlaces, overpassQuery } from './places';
import { makeQuote } from './money';
import type { Coordinates, MapMode, PlacesResult } from './types';

let active = 0;
let windowStart = 0;
let requests = 0;
let cooldown = 0;
const pending = new Map<string, Promise<PlacesResult>>();

async function readProvider(center: Coordinates, mode: MapMode): Promise<PlacesResult> {
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; requests = 0; }
  if (active >= 2 || requests >= 12 || cooldown > now) throw new Error('Map service busy');
  const endpoint = new URL(process.env.TRAVEL_OVERPASS_URL || 'https://overpass-api.de/api/interpreter');
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Invalid provider configuration');
  active++; requests++;
  try {
    const response = await fetch(endpoint, {
      method: 'POST', body: new URLSearchParams({ data: overpassQuery(center, mode) }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'LetsGo2Travel/next (+https://www.letsgo2travel.com.tr)' },
      signal: AbortSignal.timeout(16_000), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok || !response.body) throw new Error('Map service unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder(); let size = 0; let body = '';
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 4_000_000) { await reader.cancel(); throw new Error('Map response too large'); }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
    const raw = JSON.parse(body);
    if (raw.remark) throw new Error('Incomplete map query');
    const fetchedAt = new Date().toISOString();
    return { places: normalizePlaces(raw, mode, fetchedAt), center, fetchedAt, limited: raw.elements.length >= 250, radius: 3000 };
  } catch (error) {
    cooldown = Date.now() + 60_000;
    throw error;
  } finally { active--; }
}

// Persistent Next Data Cache: workers share cached cells on supported hosts.
// Precision is ~1 km; exact device coordinates never enter this service.
const cachedPlaces = unstable_cache(async (lat: number, lon: number, mode: MapMode) =>
  readProvider({ latitude: lat, longitude: lon }, mode), ['travel-assistant-places-v1'], { revalidate: 3600 });

export async function getPlaces(center: Coordinates, mode: MapMode) {
  const c = coarseLocation(center);
  const key = `${c.latitude}:${c.longitude}:${mode}`;
  const hit = pending.get(key); if (hit) return hit;
  if (pending.size >= 16) throw new Error('Map service busy');
  const operation = cachedPlaces(c.latitude, c.longitude, mode);
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
