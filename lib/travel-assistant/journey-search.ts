import { coordinates } from './places';
import { providerJson, providerUrl } from './journey-routing';
import type { JourneySearchPlace, JourneySearchResult } from './journey-types';
import { hasAppleJourneyPlaces, searchAppleJourneyPlaces } from './journey-apple-places';

// Nominatim-compatible self-hosted/contracted endpoint, configured on the server.
// No automatic use of the donated public instance or keystroke autocomplete.
// https://operations.osmfoundation.org/policies/nominatim/
export function journeySearchQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const query = value.trim().replace(/\s+/g, ' ');
  return query.length >= 3 && query.length <= 160 && !/[<>\u0000-\u001f]/.test(query) ? query : null;
}
const clean = (value: unknown, max = 260) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
export function normalizeJourneySearch(raw: unknown): JourneySearchPlace[] {
  if (!Array.isArray(raw)) throw new Error('Invalid search response');
  const ids = new Set<string>();
  return raw.slice(0, 8).flatMap((value: unknown): JourneySearchPlace[] => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const numeric = (n: unknown) => typeof n === 'number' ? n : typeof n === 'string' && /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : NaN;
    const point = coordinates({ latitude: numeric(row.lat), longitude: numeric(row.lon) });
    const address = clean(row.display_name), name = clean(row.name, 161) || address;
    if (!point || !name || name.length > 160 || !['node', 'way', 'relation'].includes(String(row.osm_type)) || !Number.isSafeInteger(row.osm_id) || Number(row.osm_id) <= 0) return [];
    const id = `${row.osm_type}/${row.osm_id}`;
    if (ids.has(id)) return [];
    ids.add(id);
    return [{ ...point, id, name, address: address || null, sourceUrl: `https://www.openstreetmap.org/${id}` }];
  });
}
const cache = new Map<string, { until: number; value: JourneySearchResult }>();
const pending = new Map<string, Promise<JourneySearchResult>>();
let nextRequest = 0;
export async function searchJourneyPlaces(query: string, locale: string): Promise<JourneySearchResult> {
  const q = journeySearchQuery(query);
  if (!q || !['tr', 'en', 'sq'].includes(locale)) throw new Error('Invalid search');
  if (hasAppleJourneyPlaces()) return searchAppleJourneyPlaces(q, locale);
  const configured = process.env.TRAVEL_GEOCODER_URL?.trim();
  if (!configured) throw new Error('Search provider not configured');
  const endpoint = providerUrl(configured);
  if (endpoint.hostname === 'nominatim.openstreetmap.org') throw new Error('A dedicated search provider is required');
  const key = `${locale}:${q.toLocaleLowerCase(locale)}`, now = Date.now();
  const hit = cache.get(key); if (hit && hit.until > now) return hit.value;
  const waiting = pending.get(key); if (waiting) return waiting;
  if (pending.size || nextRequest > now) throw new Error('Search service busy');
  nextRequest = now + 1100;
  endpoint.search = new URLSearchParams({ q, format: 'jsonv2', limit: '8', 'accept-language': locale }).toString();
  const operation = (async () => {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json', 'User-Agent': 'LetsGo2Travel/1.4 (+https://www.letsgo2travel.com.tr)' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (response.status === 429 || response.status === 403) {
      const retry = response.headers.get('retry-after') || '60';
      const duration = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      nextRequest = Date.now() + Math.max(60_000, Number.isFinite(duration) ? duration : 60_000);
    }
    const places = normalizeJourneySearch(await providerJson(response, 200_000));
    const value = { places, fetchedAt: new Date().toISOString(), attribution: '© OpenStreetMap contributors' };
    cache.set(key, { value, until: Date.now() + 3600_000 });
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    return value;
  })();
  pending.set(key, operation);
  try { return await operation; }
  catch (error) { nextRequest = Math.max(nextRequest, Date.now() + 5000); throw error; }
  finally { pending.delete(key); }
}
