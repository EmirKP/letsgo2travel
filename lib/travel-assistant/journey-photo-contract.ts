import { coordinates, validJourneyPlaceSource } from './places';
import type { Coordinates } from './types';
import type { JourneyPhoto } from './journey-types';

export type JourneyPhotoPlace = Coordinates & { id: string; name: string; sourceUrl: string };
export type JourneyPhotoRequest = { places: JourneyPhotoPlace[]; locale: 'tr' | 'en' | 'sq' | 'ro' };
export type JourneyPhotoMatch = JourneyPhotoPlace & JourneyPhoto;
export type JourneyPhotoResult = { photos: JourneyPhotoMatch[]; complete: boolean };
export const JOURNEY_PHOTO_BATCH = 8;
export const journeyPhotoKey = (place: JourneyPhotoPlace) => JSON.stringify([place.id, place.name, place.latitude, place.longitude, place.sourceUrl]);

/** Public place metadata only: no user identity, travel dates or private notes. */
export function parseJourneyPhotoRequest(value: unknown): JourneyPhotoRequest | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as JourneyPhotoRequest;
  if (!['tr', 'en', 'sq', 'ro'].includes(input.locale) || !Array.isArray(input.places) || input.places.length < 1 || input.places.length > JOURNEY_PHOTO_BATCH) return null;
  const ids = new Set<string>(), places: JourneyPhotoPlace[] = [];
  for (const place of input.places) {
    const point = coordinates(place);
    if (!point || !validJourneyPlaceSource(place.id, place.sourceUrl) || ids.has(place.id)
      || typeof place.name !== 'string' || !place.name.trim() || place.name.length > 180
      || /[|<>\u0000-\u001f\u007f]/.test(place.name)) return null;
    ids.add(place.id);
    places.push({ ...point, id: place.id, name: place.name, sourceUrl: place.sourceUrl });
  }
  return { places, locale: input.locale };
}
