import { requestJson } from './api';
import { validJourneyPhoto } from '../../../lib/travel-assistant/places';
import { JOURNEY_PHOTO_BATCH, journeyPhotoKey, parseJourneyPhotoRequest, type JourneyPhotoPlace, type JourneyPhotoResult } from '../../../lib/travel-assistant/journey-photo-contract';
import type { JourneyPhoto } from '../../../lib/travel-assistant/journey-types';

export { journeyPhotoKey };
const cache = new Map<string, { until: number; photo: JourneyPhoto | null }>();
const pending = new Map<string, Promise<Map<string, JourneyPhoto>>>();
const fields = ['imageUrl', 'imageSourceUrl', 'imageAttribution', 'imageLicenseLabel', 'imageLicenseUrl'] as const;

export function validateJourneyPhotoResult(raw: unknown, places: JourneyPhotoPlace[]): JourneyPhotoResult {
  const value = raw as JourneyPhotoResult | null;
  if (!value || !Array.isArray(value.photos) || value.photos.length > places.length || typeof value.complete !== 'boolean') throw new Error('invalid-photos');
  const wanted = new Set(places.map(journeyPhotoKey)), seen = new Set<string>();
  for (const photo of value.photos) {
    if (!photo || typeof photo !== 'object') throw new Error('invalid-photo');
    const key = journeyPhotoKey(photo);
    if (!wanted.has(key) || seen.has(key) || !photo.imageUrl || !validJourneyPhoto(photo)) throw new Error('invalid-photo');
    seen.add(key);
  }
  return value;
}

/** Public imagery is independent of account data and never mutates a trip. */
export async function loadJourneyPhotos(places: JourneyPhotoPlace[], locale: 'tr' | 'en' | 'sq', signal?: AbortSignal): Promise<Map<string, JourneyPhoto>> {
  const result = new Map<string, JourneyPhoto>();
  const valid = places.filter(place => parseJourneyPhotoRequest({ places: [place], locale }));
  const unique = [...new Map(valid.map(place => [journeyPhotoKey(place), place])).values()].slice(0, 120);
  for (let offset = 0; offset < unique.length; offset += JOURNEY_PHOTO_BATCH) {
    if (signal?.aborted) break;
    const batch = unique.slice(offset, offset + JOURNEY_PHOTO_BATCH), missing: JourneyPhotoPlace[] = [];
    for (const place of batch) {
      const hit = cache.get(`${locale}:${journeyPhotoKey(place)}`);
      if (hit && hit.until > Date.now()) { if (hit.photo) result.set(journeyPhotoKey(place), hit.photo); }
      else missing.push(place);
    }
    if (!missing.length) continue;
    const requestKey = JSON.stringify([locale, missing.map(journeyPhotoKey).sort()]);
    let work = pending.get(requestKey);
    if (!work) {
      // A fast screen/day switch cannot create an unbounded provider queue.
      if (pending.size >= 2) continue;
      work = (async () => {
        const found = new Map<string, JourneyPhoto>(); let complete = false;
        try {
          const safePlaces = missing.map(({ id, name, latitude, longitude, sourceUrl }) => ({ id, name, latitude, longitude, sourceUrl }));
          const data = validateJourneyPhotoResult(await requestJson('/api/travel-assistant/journey-photos', { method: 'POST', body: { places: safePlaces, locale }, timeoutMs: 12_000 }), safePlaces);
          complete = data.complete;
          for (const photo of data.photos) found.set(journeyPhotoKey(photo), Object.fromEntries(fields.map(field => [field, photo[field]])) as JourneyPhoto);
        } catch { /* Optional photos never fail itinerary generation or editing. */ }
        for (const place of missing) {
          const key = journeyPhotoKey(place), photo = found.get(key) || null;
          if (cache.size >= 512 && !cache.has(`${locale}:${key}`)) cache.delete(cache.keys().next().value!);
          cache.set(`${locale}:${key}`, { photo, until: Date.now() + (photo ? 24 * 3600_000 : complete ? 5 * 60_000 : 60_000) });
        }
        return found;
      })();
      pending.set(requestKey, work);
      void work.finally(() => { if (pending.get(requestKey) === work) pending.delete(requestKey); });
    }
    const fetched = await work;
    if (signal?.aborted) break;
    for (const [key, photo] of fetched) result.set(key, photo);
  }
  return result;
}
