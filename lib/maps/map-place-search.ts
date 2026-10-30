import type { PointCategory } from '../travel-assistant/types';
import { appleMapsSearch, appleMapsServerConfigured, appleMapsServerIdentity } from './apple-maps-server';
import { normalizeMapAreaResult, type MapSearchResult } from './map-search-result';
export type { MapSearchResult } from './map-search-result';

export type MapSearchInput = { query: string; locale: 'tr' | 'en' | 'sq' | 'ro'; latitude?: number; longitude?: number };
export class MapSearchError extends Error {
  constructor(readonly code: string, readonly status = 503, readonly retryAfter = 30) { super(code); }
}

const PUBLIC_PROVIDER = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'LetsGo2Travel/1.4 MapSearch (+https://www.letsgo2travel.com.tr)';
const TTL = 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 512_000;
const decimal = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const text = (value: unknown, maximum: number) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum) : '';

/** Coarse preference only: exact device coordinates never reach this provider or cache. */
export function parseMapSearchInput(params: URLSearchParams): MapSearchInput | null {
  if (['q', 'lang', 'lat', 'lon'].some(key => params.getAll(key).length > 1)) return null;
  const raw = params.get('q');
  if (raw === null || raw.length > 160 || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  const query = raw.trim().normalize('NFC').replace(/\s+/g, ' ');
  if (query.length < 2 || query.length > 80) return null;
  const locale = params.get('lang') ?? 'tr';
  if (!['tr', 'en', 'sq', 'ro'].includes(locale)) return null;
  const lat = params.get('lat'), lon = params.get('lon');
  if ((lat === null) !== (lon === null)) return null;
  if (lat === null || lon === null) return { query, locale: locale as MapSearchInput['locale'] };
  if (!decimal.test(lat) || !decimal.test(lon) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return null;
  return { query, locale: locale as MapSearchInput['locale'], latitude: Math.round(Number(lat) * 10) / 10, longitude: Math.round(Number(lon) * 10) / 10 };
}

function normalizedInput(input: MapSearchInput) {
  const params = new URLSearchParams({ q: input.query, lang: input.locale });
  if (input.latitude !== undefined) params.set('lat', String(input.latitude));
  if (input.longitude !== undefined) params.set('lon', String(input.longitude));
  const parsed = parseMapSearchInput(params);
  if (!parsed) throw new MapSearchError('invalid', 400, 0);
  return parsed;
}

export function mapSearchProviderUrl(input: MapSearchInput, endpoint = PUBLIC_PROVIDER) {
  const safe = normalizedInput(input), url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new MapSearchError('search-not-configured');
  url.searchParams.set('q', safe.query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  url.searchParams.set('bounded', '0');
  url.searchParams.set('accept-language', safe.locale);
  if (safe.latitude !== undefined && safe.longitude !== undefined) {
    const west = Math.max(-180, safe.longitude - .5), east = Math.min(180, safe.longitude + .5);
    const south = Math.max(-90, safe.latitude - .5), north = Math.min(90, safe.latitude + .5);
    url.searchParams.set('viewbox', `${west},${north},${east},${south}`);
  }
  return url;
}

const areaTypes = new Set(['continent', 'country', 'state', 'region', 'province', 'county', 'state_district', 'municipality', 'city', 'city_district', 'town', 'village', 'hamlet', 'suburb', 'borough', 'quarter', 'neighbourhood', 'administrative']);
function searchCategory(category: string, type: string): PointCategory {
  const direct: Record<string, PointCategory> = { hospital: 'hospital', pharmacy: 'pharmacy', police: 'police', atm: 'atm', bank: 'bank', bureau_de_change: 'exchange', toilets: 'toilets', embassy: 'embassy', cafe: 'cafe', restaurant: 'restaurant', fast_food: 'restaurant', ice_cream: 'sweets', bakery: 'bakery', pastry: 'sweets', confectionery: 'sweets', chocolate: 'sweets', boutique: 'boutique', clothes: 'boutique', craft: 'craft', pottery: 'craft', handicraft: 'craft', gift: 'gift', souvenir: 'gift', supermarket: 'market', convenience: 'market', marketplace: 'market', variety_store: 'market', museum: 'museum', statue: 'statue', monument: 'monument', memorial: 'monument', palace: 'palace', castle: 'historic', ruins: 'historic', archaeological_site: 'historic', stadium: 'stadium', square: 'square', viewpoint: 'viewpoint', park: 'park', nature_reserve: 'park', garden: 'garden', beach: 'beach', hiking: 'hiking', bus_station: 'transit', bus_stop: 'transit', station: 'transit', halt: 'transit', subway_entrance: 'transit', tram_stop: 'transit', diplomatic: 'embassy' };
  return direct[type] || (category === 'shop' ? 'store' : category === 'historic' ? 'historic' : 'attraction');
}

export function normalizeMapSearchResults(raw: unknown): MapSearchResult[] {
  if (!Array.isArray(raw)) throw new MapSearchError('invalid-provider-response');
  const seen = new Set<string>();
  return raw.slice(0, 40).flatMap((item: unknown): MapSearchResult[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (!['node', 'way', 'relation'].includes(String(row.osm_type)) || !/^\d+$/.test(String(row.osm_id)) || !Number.isSafeInteger(Number(row.osm_id)) || Number(row.osm_id) <= 0) return [];
    const latitude = typeof row.lat === 'number' ? row.lat : typeof row.lat === 'string' && decimal.test(row.lat) ? Number(row.lat) : NaN;
    const longitude = typeof row.lon === 'number' ? row.lon : typeof row.lon === 'string' && decimal.test(row.lon) ? Number(row.lon) : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const address = text(row.display_name, 500), name = text(row.name, 160) || address.split(',')[0]?.trim();
    if (!name) return [];
    const osmId = `${row.osm_type}/${Number(row.osm_id)}`;
    if (seen.has(osmId)) return [];
    seen.add(osmId);
    const category = text(row.category ?? row.class, 50), type = text(row.type, 50), addressType = text(row.addresstype, 50);
    const area = areaTypes.has(addressType) || areaTypes.has(type) && ['place', 'boundary'].includes(category);
    return [{ id: osmId, source: 'openstreetmap', name, latitude, longitude, address: address || name, sourceUrl: `https://www.openstreetmap.org/${osmId}`, osmId, kind: area ? 'area' : 'place', ...(!area ? { category: searchCategory(category, type) } : {}) }];
  }).slice(0, 6);
}

type SearchOptions = { fetch?: typeof fetch; now?: () => number; sleep?: (milliseconds: number) => Promise<void>; endpoint?: string; timeoutMs?: number };

/**
 * Explicit-submit searches only. Public service policy:
 * https://operations.osmfoundation.org/policies/nominatim/
 * This queue covers ONE process/gateway, not distributed server instances. Production
 * must use one globally limited gateway or a hosted/self-hosted compatible provider.
 */
export function createMapPlaceSearch(options: SearchOptions = {}) {
  const fetcher = options.fetch ?? fetch, now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  const endpoint = options.endpoint ?? PUBLIC_PROVIDER;
  const cache = new Map<string, { expires: number; data: MapSearchResult[] }>();
  const pending = new Map<string, Promise<MapSearchResult[]>>();
  let turn: Promise<unknown> = Promise.resolve(), lastStart = -Infinity, cooldown = 0;

  return function search(input: MapSearchInput): Promise<MapSearchResult[]> {
    const safe = normalizedInput(input);
    const key = JSON.stringify([safe.query.toLocaleLowerCase(safe.locale), safe.locale, safe.latitude ?? null, safe.longitude ?? null]);
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return Promise.resolve(cached.data.map(row => ({ ...row })));
    if (cached) cache.delete(key);
    const existing = pending.get(key);
    if (existing) return existing.then(data => data.map(row => ({ ...row })));
    if (pending.size >= 4 || cooldown > now()) return Promise.reject(new MapSearchError('busy', 503, Math.max(1, Math.ceil((cooldown - now()) / 1000))));
    const operation = turn.then(async () => {
      if (cooldown > now()) throw new MapSearchError('busy', 503, Math.ceil((cooldown - now()) / 1000));
      const pause = Math.max(0, 1000 - (now() - lastStart));
      if (pause) await sleep(pause);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 6500);
      try {
        lastStart = now();
        const response = await fetcher(mapSearchProviderUrl(safe, endpoint), { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Language': safe.locale }, signal: controller.signal, redirect: 'error', cache: 'no-store' });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          if (response.status === 429 || response.status === 403) {
            const retryHeader = response.headers.get('retry-after') || '';
            const retry = /^\d+$/.test(retryHeader) ? Number(retryHeader) : (Date.parse(retryHeader) - now()) / 1000;
            cooldown = now() + (Number.isFinite(retry) && retry > 0 ? Math.max(60, Math.ceil(retry)) : 60) * 1000;
          }
          throw new MapSearchError(response.status === 429 ? 'busy' : 'search-unavailable', 503, Math.max(30, Math.ceil((cooldown - now()) / 1000)));
        }
        if (!response.body || Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
          await response.body?.cancel().catch(() => {});
          throw new MapSearchError('invalid-provider-response');
        }
        const reader = response.body.getReader(), decoder = new TextDecoder();
        const cancelReader = () => { void reader.cancel().catch(() => {}); };
        controller.signal.addEventListener('abort', cancelReader, { once: true });
        let body = '', bytes = 0;
        try {
          controller.signal.throwIfAborted();
          while (true) {
            const part = await reader.read();
            controller.signal.throwIfAborted();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel().catch(() => {}); throw new MapSearchError('invalid-provider-response'); }
            body += decoder.decode(part.value, { stream: true });
          }
          body += decoder.decode();
        } finally { controller.signal.removeEventListener('abort', cancelReader); reader.releaseLock(); }
        let raw: unknown;
        try { raw = JSON.parse(body); } catch { throw new MapSearchError('invalid-provider-response'); }
        const data = normalizeMapSearchResults(raw);
        cache.delete(key); cache.set(key, { expires: now() + TTL, data });
        if (cache.size > 256) cache.delete(cache.keys().next().value!);
        return data;
      } catch (error) {
        if (error instanceof MapSearchError) throw error;
        throw new MapSearchError(controller.signal.aborted ? 'search-timeout' : 'search-unavailable');
      } finally { clearTimeout(timeout); }
    }).finally(() => pending.delete(key));
    turn = operation.catch(() => {});
    pending.set(key, operation);
    return operation.then(data => data.map(row => ({ ...row })));
  };
}

let service: ReturnType<typeof createMapPlaceSearch> | undefined;
const appleCache = new Map<string, { until: number; data: MapSearchResult[] }>();
const applePending = new Map<string, Promise<MapSearchResult[]>>();
const appleCategories: Record<string, PointCategory> = { Museum: 'museum', Cafe: 'cafe', Restaurant: 'restaurant', Bakery: 'bakery', Store: 'store', FoodMarket: 'market', Hospital: 'hospital', Pharmacy: 'pharmacy', Police: 'police', ATM: 'atm', Bank: 'bank', PublicTransport: 'transit', Restroom: 'toilets', Park: 'park', NationalPark: 'park', Beach: 'beach', Hiking: 'hiking', Castle: 'historic', Fortress: 'historic', NationalMonument: 'monument', Stadium: 'stadium' };
export function normalizeAppleMapSearchResults(raw: unknown): MapSearchResult[] {
  const page = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (!Array.isArray(page.results) || page.results.length > 100 || page.error || page.errorMessage) throw new MapSearchError('search-unavailable');
  const seen = new Set<string>();
  return page.results.flatMap((value): MapSearchResult[] => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>, point = row.coordinate as Record<string, unknown> | undefined;
    if (!point || typeof point !== 'object') return [];
    const name = text(row.name, 161), poi = typeof row.poiCategory === 'string' && Boolean(row.poiCategory);
    const id = poi ? `apple/${row.id}` : `apple-area/${point.latitude},${point.longitude}`;
    const result = normalizeMapAreaResult({ ...point, name, id, source: 'apple', kind: poi ? 'place' : 'area',
      sourceUrl: poi ? `https://maps.apple.com/place?place-id=${row.id}` : `https://maps.apple.com/place?coordinate=${point.latitude},${point.longitude}`,
      address: Array.isArray(row.formattedAddressLines) ? row.formattedAddressLines.slice(0, 8).map(line => text(line, 160)).filter(Boolean).join(', ').slice(0, 500) || null : null,
      ...(poi ? { category: appleCategories[String(row.poiCategory)] || 'attraction' } : {}) });
    if (!result || poi && typeof row.id !== 'string' || seen.has(id)) return [];
    seen.add(id); return [result];
  }).slice(0, 6);
}
async function searchAppleMapPlaces(input: MapSearchInput): Promise<MapSearchResult[]> {
  try {
    const identity = appleMapsServerIdentity(), now = Date.now(), key = JSON.stringify([identity, input]);
    const cached = appleCache.get(key);
    if (cached && cached.until > now) return cached.data.map(row => ({ ...row }));
    const waiting = applePending.get(key);
    if (waiting) return (await waiting).map(row => ({ ...row }));
    if (applePending.size >= 4) throw new MapSearchError('busy');
    const operation = (async () => {
      const params = new URLSearchParams({ q: input.query, lang: ({ tr: 'tr-TR', en: 'en-US', sq: 'sq-AL', ro: 'ro-RO' })[input.locale] });
      if (input.latitude !== undefined && input.longitude !== undefined) params.set('searchLocation', `${input.latitude},${input.longitude}`);
      const raw = await appleMapsSearch(params, now + 12_000);
      if (appleMapsServerIdentity() !== identity) throw new MapSearchError('search-unavailable');
      const data = normalizeAppleMapSearchResults(raw);
      appleCache.set(key, { data, until: Date.now() + 3600_000 });
      if (appleCache.size > 256) appleCache.delete(appleCache.keys().next().value!);
      return data;
    })();
    applePending.set(key, operation);
    try { return (await operation).map(row => ({ ...row })); } finally { applePending.delete(key); }
  } catch (error) { throw error instanceof MapSearchError ? error : new MapSearchError('search-unavailable'); }
}
export function getMapPlaceSearch(input: MapSearchInput) {
  const safe = normalizedInput(input);
  if (appleMapsServerConfigured()) return searchAppleMapPlaces(safe);
  const endpoint = process.env.MAP_SEARCH_PROVIDER_URL || process.env.TRAVEL_GEOCODER_URL?.trim() || PUBLIC_PROVIDER;
  // Public limits apply to the whole app. Do not silently multiply them on serverless workers.
  if (new URL(endpoint).hostname === 'nominatim.openstreetmap.org' && process.env.NODE_ENV === 'production' && process.env.MAP_SEARCH_SINGLE_GATEWAY !== '1') throw new MapSearchError('search-not-configured');
  service ??= createMapPlaceSearch({ endpoint });
  return service(safe);
}
