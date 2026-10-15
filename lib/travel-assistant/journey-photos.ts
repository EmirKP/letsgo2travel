import { commonsPhotoFile, journeyPhotoLicense, safeJourneyPhotoUrl, validJourneyPhoto } from './places';
import { providerJson } from './journey-routing';
import type { JourneyDiscoveryPlace, JourneyPhoto } from './journey-types';

// Only enrich files explicitly attached to the OSM record. imageinfo supplies
// actual thumbnail URLs and the author/license; never infer them from a name.
// https://www.mediawiki.org/wiki/API:Imageinfo
// https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
const MAX_PHOTOS = 12;
const DEADLINE = 2000;
const cache = new Map<string, { until: number; photo: JourneyPhoto | null }>();
let active: { files: Set<string>; result: Promise<Map<string, JourneyPhoto>> } | null = null;
let cooldown = 0, nextStart = 0, windowStart = 0, starts = 0;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const key = (file: string) => file[0].toUpperCase() + file.slice(1).replace(/_/g, ' ');
function remember(file: string, photo: JourneyPhoto | null) {
  if (cache.size >= 256 && !cache.has(file)) cache.delete(cache.keys().next().value!);
  cache.set(file, { until: Date.now() + (photo ? 24 * 3600_000 : 5 * 60_000), photo });
}
function plainCredit(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 6000) return null;
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  const plain = value.replace(/<[^>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity: string) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] || '';
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(number) && number >= 32 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
  }).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  // Do not truncate an attribution line and silently discard its conditions.
  return plain && plain.length <= 800 && [...plain].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127) ? plain : null;
}
export function normalizeCommonsPhotos(raw: unknown, requestedFiles: string[]): Map<string, JourneyPhoto> {
  const result = new Map<string, JourneyPhoto>(), data = record(raw), query = record(data.query);
  const requested = new Set(requestedFiles.map(key));
  if (data.error || data.warnings || !Array.isArray(query.pages) || query.pages.length > MAX_PHOTOS) return result;
  for (const rawPage of query.pages) {
    const page = record(rawPage), file = commonsPhotoFile(page.title);
    if (!file || !requested.has(key(file)) || page.ns !== 6 || page.missing || page.invalid
      || page.imagerepository !== 'local' || !Array.isArray(page.imageinfo) || page.imageinfo.length !== 1) continue;
    const info = record(page.imageinfo[0]), metadata = record(info.extmetadata);
    const meta = (name: string) => record(metadata[name]).value;
    const imageUrl = safeJourneyPhotoUrl(info.thumburl), imageFile = commonsPhotoFile(imageUrl);
    if (!imageUrl || !imageFile || key(imageFile) !== key(file) || !['image/jpeg', 'image/png', 'image/webp'].includes(String(info.mime))
      || info.mediatype !== 'BITMAP' || !['image/jpeg', 'image/png', 'image/webp'].includes(String(info.thumbmime))
      || typeof info.thumbwidth !== 'number' || !Number.isInteger(info.thumbwidth) || info.thumbwidth < 1 || info.thumbwidth > 640
      || typeof info.thumbheight !== 'number' || !Number.isInteger(info.thumbheight) || info.thumbheight < 1 || info.thumbheight > 640) continue;
    const sourceFile = commonsPhotoFile(info.descriptionurl);
    if (!sourceFile || key(sourceFile) !== key(file)) continue;
    const author = plainCredit(meta('Artist')), extra = meta('Attribution') ? plainCredit(meta('Attribution')) : null;
    if (!author || (meta('Attribution') && !extra)) continue;
    const rawLicense = meta('LicenseUrl');
    const license = journeyPhotoLicense(typeof rawLicense === 'string' ? rawLicense.replace(/^http:\/\/creativecommons\.org\//, 'https://creativecommons.org/') : rawLicense);
    const label = plainCredit(meta('LicenseShortName'));
    if (!license || !(label === license.label || license.label === 'CC0 1.0' && label === 'CC0')) continue;
    const imageAttribution = extra && extra !== author ? `${author} · ${extra}` : author;
    const photo: JourneyPhoto = { imageUrl, imageSourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(imageFile.replace(/ /g, '_'))}`,
      imageAttribution, imageLicenseLabel: license.label, imageLicenseUrl: license.url };
    if (validJourneyPhoto(photo)) result.set(key(file), photo);
  }
  return result;
}
function startBatch(files: string[]): Promise<Map<string, JourneyPhoto>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo',
    titles: files.map(file => `File:${file}`).join('|'), iilimit: '1',
    iiprop: 'url|mime|thumbmime|mediatype|extmetadata', iiurlwidth: '160', iiurlheight: '160',
    iiextmetadatalanguage: 'en', iiextmetadatafilter: 'Artist|Attribution|LicenseShortName|LicenseUrl', maxlag: '5' }).toString();
  const work = (async () => {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'LetsGo2Travel/1.4 (https://letsgo2travel.com; OSM-linked place photo attribution)' } });
    if (response.status === 429 || response.status === 403 || response.status === 503) {
      const retry = response.headers.get('retry-after') || '60';
      const seconds = /^\d+$/.test(retry) ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
      cooldown = Math.max(cooldown, Date.now() + Math.max(60, Number.isFinite(seconds) ? seconds : 60) * 1000);
    }
    return normalizeCommonsPhotos(await providerJson(response, 120_000), files);
  })();
  const deadline = new Promise<Map<string, JourneyPhoto>>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Photo metadata timeout')); }, DEADLINE);
  });
  const result = Promise.race([work, deadline]).then(photos => {
    for (const file of files) remember(file, photos.get(file) || null);
    return photos;
  }).catch(() => {
    cooldown = Math.max(cooldown, Date.now() + 5000);
    for (const file of files) remember(file, null);
    return new Map<string, JourneyPhoto>();
  }).finally(() => { if (timer !== undefined) clearTimeout(timer); });
  const batch = { files: new Set(files), result };
  active = batch;
  // A transport ignoring abort must not release a slot for unlimited requests.
  void work.finally(() => { if (active === batch) active = null; }).catch(() => {});
  return result;
}
/** Optional photo failure never removes a POI or fails a discovery response. */
export async function enrichJourneyPhotos(places: JourneyDiscoveryPlace[], raw: unknown): Promise<JourneyDiscoveryPlace[]> {
  const elements = record(raw).elements;
  if (!places.length || !Array.isArray(elements)) return places;
  const wanted = new Set(places.map(place => place.id)), tagsById = new Map<string, Record<string, unknown>>();
  for (const element of elements.slice(0, 250)) {
    const row = record(element), id = `${row.type}/${row.id}`;
    if (wanted.has(id) && !tagsById.has(id)) tagsById.set(id, record(row.tags));
  }
  const references = new Map<string, string>();
  for (const place of places) {
    const tags = tagsById.get(place.id) || {};
    const file = commonsPhotoFile(tags.image) || commonsPhotoFile(tags.wikimedia_commons);
    if (file) references.set(place.id, key(file));
    if (references.size === MAX_PHOTOS) break;
  }
  const files = [...new Set(references.values())];
  if (!files.length) return places;
  const photos = new Map<string, JourneyPhoto>(), unknown: string[] = [];
  for (const file of files) {
    const hit = cache.get(file);
    if (hit && hit.until > Date.now()) { if (hit.photo) photos.set(file, hit.photo); }
    else unknown.push(file);
  }
  let result: Map<string, JourneyPhoto> | null = null;
  if (active && unknown.some(file => active?.files.has(file))) result = await active.result;
  else if (unknown.length && !active && Date.now() >= cooldown && Date.now() >= nextStart) {
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); starts = 0; }
    if (starts < 6) { starts++; nextStart = Date.now() + 1000; result = await startBatch(unknown); }
  }
  if (result) for (const file of files) { const photo = result.get(file); if (photo) photos.set(file, photo); }
  return places.map(place => { const file = references.get(place.id), photo = file ? photos.get(file) : undefined; return photo ? { ...place, ...photo } : place; });
}
