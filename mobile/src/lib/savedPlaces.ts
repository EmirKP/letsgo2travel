import { coordinates, NEEDS, TOURING, safeWebsite } from '../../../lib/travel-assistant/places';
import type { Place } from '../../../lib/travel-assistant/types';

export const SAVED_PLACES_KEY = 'l2t:assistant:saved-places:v1';
export const MAX_SAVED_PLACES = 60;
export const MAX_DAY_STOPS = 12;
export const MAX_PLACE_NOTE = 280;
const MAX_STORAGE_CHARS = 256_000;
const CHANGE_EVENT = 'l2t:saved-places-changed';
const categories = new Set([...NEEDS, ...TOURING]);

export type SavedPlace = { place: Place; savedAt: string; note: string };
type SavedPlacesDocument = { version: 1; items: SavedPlace[]; dayIds: string[] };
export type SavedPlacesState = {
  items: SavedPlace[];
  dayIds: string[];
  error: 'corrupt' | 'unavailable' | null;
};

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 24) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
function text(value: unknown, max: number): value is string {
  if (typeof value !== 'string' || value.length > max) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return false;
  }
  return true;
}
const nullableText = (value: unknown, max: number) => value === null || text(value, max);
const nullableBool = (value: unknown) => value === null || typeof value === 'boolean';

// Keep the provider's snapshot and source date. Saved places deliberately do not
// expire: the UI identifies them as snapshots, never as current service status.
function validatePlace(raw: unknown): Place | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Place;
  const point = coordinates(p);
  if (!point || !categories.has(p.category)
    || !text(p.id, 64) || !/^(node|way|relation)\/[1-9]\d*$/.test(p.id)
    || p.sourceUrl !== `https://www.openstreetmap.org/${p.id}`
    || !text(p.name, 180) || !nullableText(p.description, 500) || !nullableText(p.hours, 180)
    || !nullableBool(p.free) || !nullableBool(p.accessible) || !validDate(p.fetchedAt)
    || !(p.website === null || text(p.website, 1000) && safeWebsite(p.website))
    || !(p.representedCountry === null || typeof p.representedCountry === 'string' && /^[A-Z]{2}$/.test(p.representedCountry))) return null;
  return { ...point, id: p.id, category: p.category, name: p.name, description: p.description,
    hours: p.hours, free: p.free, accessible: p.accessible, website: p.website,
    representedCountry: p.representedCountry, sourceUrl: p.sourceUrl, fetchedAt: p.fetchedAt };
}

function validateDocument(raw: unknown): SavedPlacesDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as SavedPlacesDocument;
  if (data.version !== 1 || !Array.isArray(data.items) || data.items.length > MAX_SAVED_PLACES
    || !Array.isArray(data.dayIds) || data.dayIds.length > MAX_DAY_STOPS) return null;
  const ids = new Set<string>();
  const items: SavedPlace[] = [];
  for (const item of data.items) {
    if (!item || !text(item.note, MAX_PLACE_NOTE) || !validDate(item.savedAt)) return null;
    const place = validatePlace(item.place);
    if (!place || ids.has(place.id)) return null;
    ids.add(place.id);
    items.push({ place, savedAt: item.savedAt, note: item.note });
  }
  if (new Set(data.dayIds).size !== data.dayIds.length || data.dayIds.some(id => !ids.has(id))) return null;
  return { version: 1, items, dayIds: [...data.dayIds] };
}

export function readSavedPlaces(): SavedPlacesState {
  let raw: string | null;
  try { raw = localStorage.getItem(SAVED_PLACES_KEY); }
  catch { return { items: [], dayIds: [], error: 'unavailable' }; }
  if (raw === null) return { items: [], dayIds: [], error: null };
  try {
    const data = raw.length <= MAX_STORAGE_CHARS ? validateDocument(JSON.parse(raw)) : null;
    if (!data) return { items: [], dayIds: [], error: 'corrupt' };
    return { items: data.items, dayIds: data.dayIds, error: null };
  } catch { return { items: [], dayIds: [], error: 'corrupt' }; }
}

function currentDocument(): SavedPlacesDocument {
  const state = readSavedPlaces();
  if (state.error) throw new Error(state.error);
  return { version: 1, items: state.items, dayIds: state.dayIds };
}
function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}
function persist(document: SavedPlacesDocument): SavedPlacesState {
  const checked = validateDocument(document);
  if (!checked) throw new Error('invalid');
  const raw = JSON.stringify(checked);
  if (raw.length > MAX_STORAGE_CHARS) throw new Error('full');
  // A single setItem is atomic. Never delete the old list to free space first.
  try { localStorage.setItem(SAVED_PLACES_KEY, raw); }
  catch { throw new Error('unavailable'); }
  notify();
  return { items: checked.items, dayIds: checked.dayIds, error: null };
}

export function saveTravelPlace(place: Place): SavedPlacesState {
  const checked = validatePlace(place);
  if (!checked) throw new Error('invalid');
  const doc = currentDocument();
  // Repeated saves preserve notes, ordering, and the originally chosen snapshot.
  if (doc.items.some(item => item.place.id === checked.id)) return { items: doc.items, dayIds: doc.dayIds, error: null };
  if (doc.items.length >= MAX_SAVED_PLACES) throw new Error('full');
  doc.items.unshift({ place: checked, savedAt: new Date().toISOString(), note: '' });
  return persist(doc);
}

export function deleteTravelPlace(id: string): SavedPlacesState {
  const doc = currentDocument();
  doc.items = doc.items.filter(item => item.place.id !== id);
  doc.dayIds = doc.dayIds.filter(value => value !== id);
  return persist(doc);
}

export function updateTravelPlaceNote(id: string, note: string): SavedPlacesState {
  if (!text(note, MAX_PLACE_NOTE)) throw new Error('invalid');
  const doc = currentDocument();
  const item = doc.items.find(item => item.place.id === id);
  if (!item) throw new Error('missing');
  item.note = note.trim();
  return persist(doc);
}

export function setTravelDayStop(id: string, include: boolean): SavedPlacesState {
  const doc = currentDocument();
  if (!doc.items.some(item => item.place.id === id)) throw new Error('missing');
  if (include && !doc.dayIds.includes(id)) {
    if (doc.dayIds.length >= MAX_DAY_STOPS) throw new Error('day-full');
    doc.dayIds.push(id);
  } else if (!include) doc.dayIds = doc.dayIds.filter(value => value !== id);
  return persist(doc);
}

export function moveTravelDayStop(id: string, direction: -1 | 1): SavedPlacesState {
  const doc = currentDocument();
  const index = doc.dayIds.indexOf(id);
  if (index < 0 || ![-1, 1].includes(direction)) throw new Error('missing');
  const next = index + direction;
  if (next >= 0 && next < doc.dayIds.length) [doc.dayIds[index], doc.dayIds[next]] = [doc.dayIds[next], doc.dayIds[index]];
  return persist(doc);
}

// Only the explicit recovery action calls this; a parse or read failure never does.
export function resetSavedPlaces(): SavedPlacesState {
  try { localStorage.removeItem(SAVED_PLACES_KEY); }
  catch { throw new Error('unavailable'); }
  notify();
  return { items: [], dayIds: [], error: null };
}

export function subscribeSavedPlaces(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SAVED_PLACES_KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
