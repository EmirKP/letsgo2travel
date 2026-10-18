import { commonsPhotoFile, coordinates, distanceKm } from './places';
import { providerJson } from './journey-routing';
import { loadJourneyPhotoFiles } from './journey-photos';
import { journeyPhotoKey, type JourneyPhotoPlace, type JourneyPhotoRequest, type JourneyPhotoResult } from './journey-photo-contract';
import type { JourneyPhoto } from './journey-types';

// A named article (including an explicit Wikipedia redirect) must describe the
// same physical location. A nearest-image or free-text image search is unsafe.
// https://www.mediawiki.org/wiki/API:Query#Resolving_redirects
// https://www.mediawiki.org/wiki/Extension:PageImages#API
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const titleKey = (v: string) => v.replace(/_/g, ' ').trim().normalize('NFC').toLocaleLowerCase('en');
const fileKey = (v: string) => v[0].toUpperCase() + v.slice(1).replace(/_/g, ' ');
const cache = new Map<string, { until: number; photo: JourneyPhoto | null }>();
const pending = new Map<string, Promise<JourneyPhotoResult>>();
let starts = 0, windowStart = 0, cooldown = 0, activeTransports = 0;

export function matchWikipediaVenuePhotos(raw: unknown, places: JourneyPhotoPlace[]): Map<string, string> {
  const data = record(raw), query = record(data.query), result = new Map<string, string>();
  if (data.error || data.warnings || !Array.isArray(query.pages) || query.pages.length > 8) return result;
  const aliases = new Map<string, string>();
  for (const field of ['normalized', 'redirects']) {
    const rows = query[field];
    if (rows !== undefined && (!Array.isArray(rows) || rows.length > 16)) return result;
    for (const rawRow of Array.isArray(rows) ? rows : []) {
      const row = record(rawRow);
      if (typeof row.from !== 'string' || typeof row.to !== 'string' || row.tofragment !== undefined) continue;
      aliases.set(titleKey(row.from), titleKey(row.to));
    }
  }
  const canonical = (name: string) => {
    let value = titleKey(name); const visited = new Set<string>();
    while (aliases.has(value) && !visited.has(value) && visited.size < 8) { visited.add(value); value = aliases.get(value)!; }
    return value;
  };
  for (const place of places) {
    const matches = query.pages.flatMap((rawPage): string[] => {
      const page = record(rawPage), props = record(page.pageprops);
      if (page.ns !== 0 || page.missing || page.invalid || typeof page.title !== 'string' || titleKey(page.title) !== canonical(place.name)
        || Object.prototype.hasOwnProperty.call(props, 'disambiguation') || !Array.isArray(page.coordinates) || page.coordinates.length !== 1) return [];
      const coord = record(page.coordinates[0]);
      const point = coordinates({ latitude: coord.lat, longitude: coord.lon });
      const file = typeof page.pageimage === 'string' ? commonsPhotoFile(`File:${page.pageimage}`) : null;
      return point && coord.globe === 'earth' && Object.prototype.hasOwnProperty.call(coord, 'primary')
        && distanceKm(place, point) <= .2 && file ? [fileKey(file)] : [];
    });
    // Ambiguous provider output never selects an arbitrary photo.
    if (matches.length === 1) result.set(journeyPhotoKey(place), matches[0]);
  }
  return result;
}

async function lookupWikipedia(places: JourneyPhotoPlace[], language: JourneyPhotoRequest['locale']) {
  if (activeTransports >= 2) throw new Error('Photo provider busy');
  activeTransports++;
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1',
    titles: [...new Set(places.map(place => place.name))].join('|'), prop: 'coordinates|pageimages|pageprops',
    coprimary: 'primary', coprop: 'name|globe', colimit: '1', piprop: 'name', pilicense: 'free', pilimit: '8', ppprop: 'disambiguation', maxlag: '5' }).toString();
  const work = (async () => {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', 'User-Agent': 'LetsGo2Travel/1.4 (https://letsgo2travel.com.tr; attributed venue photos)' } });
    if ([403, 429, 503].includes(response.status)) {
      const retry = response.headers.get('retry-after') || '60';
      const seconds = /^\d+$/.test(retry) ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
      cooldown = Math.max(cooldown, Date.now() + Math.min(3600, Math.max(60, Number.isFinite(seconds) ? seconds : 60)) * 1000);
    }
    return matchWikipediaVenuePhotos(await providerJson(response, 120_000), places);
  })().finally(() => { activeTransports--; });
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Photo lookup timeout')); }, 4000); });
  try { return await Promise.race([work, deadline]); } finally { if (timer !== undefined) clearTimeout(timer); }
}

function remember(key: string, photo: JourneyPhoto | null, complete: boolean) {
  if (cache.size >= 512 && !cache.has(key)) cache.delete(cache.keys().next().value!);
  cache.set(key, { photo, until: Date.now() + (photo ? 24 * 3600_000 : complete ? 5 * 60_000 : 60_000) });
}

/** Optional enrichment runs after AI success; never calls a model or spends AI quota. */
export async function loadVenuePhotos(input: JourneyPhotoRequest): Promise<JourneyPhotoResult> {
  const photos: JourneyPhotoResult['photos'] = [], missing: JourneyPhotoPlace[] = [];
  for (const place of input.places) {
    const hit = cache.get(`${input.locale}:${journeyPhotoKey(place)}`);
    if (hit && hit.until > Date.now()) { if (hit.photo) photos.push({ ...place, ...hit.photo }); }
    else missing.push(place);
  }
  if (!missing.length) return { photos, complete: true };
  const key = JSON.stringify([input.locale, missing.map(journeyPhotoKey).sort()]);
  const existing = pending.get(key);
  if (existing) { const result = await existing; return { ...result, photos: [...photos, ...result.photos] }; }
  if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); starts = 0; }
  if (pending.size >= 2 || starts >= 24 || Date.now() < cooldown) return { photos, complete: false };
  starts++;
  const operation = (async (): Promise<JourneyPhotoResult> => {
    const matches = new Map<string, string>(); let complete = true;
    for (const language of [...new Set([input.locale, 'en' as const])]) {
      const unresolved = missing.filter(place => !matches.has(journeyPhotoKey(place)));
      if (!unresolved.length) break;
      if (Date.now() < cooldown) { complete = false; break; }
      try { for (const [id, file] of await lookupWikipedia(unresolved, language)) matches.set(id, file); }
      catch { complete = false; }
    }
    const metadata = await loadJourneyPhotoFiles([...new Set(matches.values())], 640);
    const resolved: JourneyPhotoResult['photos'] = [];
    for (const place of missing) {
      const key = journeyPhotoKey(place), file = matches.get(key), photo = file ? metadata.get(file) : undefined;
      if (file && !photo) complete = false;
      remember(`${input.locale}:${key}`, photo || null, complete);
      if (photo) resolved.push({ ...place, ...photo });
    }
    return { photos: resolved, complete };
  })();
  pending.set(key, operation);
  try { const result = await operation; return { ...result, photos: [...photos, ...result.photos] }; }
  finally { if (pending.get(key) === operation) pending.delete(key); }
}
