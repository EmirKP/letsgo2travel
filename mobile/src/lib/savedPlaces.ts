import { coordinates, NEEDS, TOURING, DISCOVERY, safeWebsite, validJourneyPhoto, validJourneyPlaceSource } from '../../../lib/travel-assistant/places';
import type { Place } from '../../../lib/travel-assistant/types';
import type { JourneyPlace } from './mapJourney';
import { COLLECTION_CHANGE, collectionKey, queueCollectionChange, readCollection, resetCollectionCache, type CollectionDocument, type CollectionOperation } from './accountCollections';

export const SAVED_PLACES_KEY = 'l2t:assistant:saved-places:v1';
export const MAX_SAVED_PLACES = 60;
export const MAX_DAY_STOPS = 12;
export const MAX_PLACE_NOTE = 280;
const MAX_STORAGE_CHARS = 256_000;
const CHANGE_EVENT = 'l2t:saved-places-changed';
const categories = new Set([...NEEDS, ...TOURING, ...DISCOVERY]);

export type SavedPlace = { place: JourneyPlace; savedAt: string; note: string };
// Installed readers reject unknown base categories. Keep these two additions in
// optional, identity-bound metadata so the bookmark remains readable on them.
type StoredSavedPlace = SavedPlace & {
  journeyCategory?: { version: 1; placeId: string; category: 'bank' | 'transit'; fallback: 'attraction' };
};
type SavedPlacesDocument = { version: 1; items: SavedPlace[]; dayIds: string[] };
export type SavedPlacesState = {
  items: SavedPlace[];
  dayIds: string[];
  error: 'corrupt' | 'unavailable' | null;
  pending?: number;
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
function validatePlace(raw: unknown): JourneyPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as JourneyPlace;
  const point = coordinates(p);
  if (!point || !categories.has(p.category)
    || !validJourneyPlaceSource(p.id, p.sourceUrl)
    || !text(p.name, 180) || !nullableText(p.description, 500) || !nullableText(p.hours, 180)
    || !nullableBool(p.free) || !nullableBool(p.accessible) || !validDate(p.fetchedAt)
    || !(p.website === null || text(p.website, 1000) && safeWebsite(p.website))
    || !(p.representedCountry === null || typeof p.representedCountry === 'string' && /^[A-Z]{2}$/.test(p.representedCountry))
    || !(p.group === undefined || ['food', 'shopping', 'culture', 'nature', 'essentials'].includes(p.group))
    || !(p.kind === undefined || text(p.kind, 60)) || !(p.address === undefined || nullableText(p.address, 500)) || !validJourneyPhoto(p)) return null;
  return { ...point, id: p.id, category: p.category, name: p.name, description: p.description,
    hours: p.hours, free: p.free, accessible: p.accessible, website: p.website,
    representedCountry: p.representedCountry, sourceUrl: p.sourceUrl, fetchedAt: p.fetchedAt,
    ...(p.group === undefined ? {} : { group: p.group }), ...(p.kind === undefined ? {} : { kind: p.kind }),
    ...(p.address === undefined ? {} : { address: p.address }),
    ...(p.imageUrl === undefined ? {} : { imageUrl: p.imageUrl, imageSourceUrl: p.imageSourceUrl,
      imageAttribution: p.imageAttribution, imageLicenseLabel: p.imageLicenseLabel, imageLicenseUrl: p.imageLicenseUrl }) };
}

function validateDocument(raw: unknown): SavedPlacesDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as SavedPlacesDocument;
  // Concurrent offline saves may exceed one device's creation limit. Preserve
  // every existing bookmark rather than truncating the other device's work.
  if (data.version !== 1 || !Array.isArray(data.items) || data.items.length > 1000
    || !Array.isArray(data.dayIds) || data.dayIds.length > 1000) return null;
  const ids = new Set<string>();
  const items: SavedPlace[] = [];
  for (const item of data.items) {
    if (!item || !text(item.note, MAX_PLACE_NOTE) || !validDate(item.savedAt)) return null;
    const place = validatePlace(item.place);
    if (!place || ids.has(place.id)) return null;
    ids.add(place.id);
    const detail = (item as StoredSavedPlace).journeyCategory;
    const category = detail?.version === 1 && detail.placeId === place.id && detail.fallback === 'attraction'
      && place.category === detail.fallback && (detail.category === 'bank' || detail.category === 'transit')
      ? detail.category : place.category;
    items.push({ place: { ...place, category }, savedAt: item.savedAt, note: item.note });
  }
  if (new Set(data.dayIds).size !== data.dayIds.length || data.dayIds.some(id => !ids.has(id))) return null;
  return { version: 1, items, dayIds: [...data.dayIds] };
}

function encodeSavedPlace(item: SavedPlace): StoredSavedPlace {
  const category = item.place.category;
  return category === 'bank' || category === 'transit'
    ? { ...item, place: { ...item.place, category: 'attraction' },
      journeyCategory: { version: 1, placeId: item.place.id, category, fallback: 'attraction' } }
    : item;
}

export function validateAccountPlaces(document: CollectionDocument) {
  return Boolean(validateDocument({ version: 1, items: Object.values(document.items), dayIds: document.dayIds }))
    && Object.entries(document.items).every(([id, item]) => (item as SavedPlace).place.id === id);
}

export function readSavedPlaces(ownerId?: string | null): SavedPlacesState {
  if (ownerId) {
    try {
      const value = readCollection(ownerId, 'saved_places');
      if (!validateAccountPlaces(value.document)) return { items: [], dayIds: [], error: 'corrupt' };
      const checked = validateDocument({ version: 1, items: Object.values(value.document.items), dayIds: value.document.dayIds })!;
      return { items: checked.items.sort((a,b) => b.savedAt.localeCompare(a.savedAt)), dayIds: checked.dayIds, error: null, pending: value.pending.length };
    } catch { return { items: [], dayIds: [], error: 'corrupt' }; }
  }
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

function currentDocument(ownerId?: string | null): SavedPlacesDocument {
  const state = readSavedPlaces(ownerId);
  if (state.error) throw new Error(state.error);
  return { version: 1, items: state.items, dayIds: state.dayIds };
}
function accountEdit(ownerId: string, edit: Omit<CollectionOperation, 'id'>) {
  queueCollectionChange(ownerId, 'saved_places', [edit]);
  return readSavedPlaces(ownerId);
}
function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}
function persist(document: SavedPlacesDocument): SavedPlacesState {
  const checked = validateDocument(document);
  if (!checked) throw new Error('invalid');
  const raw = JSON.stringify({ ...checked, items: checked.items.map(encodeSavedPlace) });
  if (raw.length > MAX_STORAGE_CHARS) throw new Error('full');
  // A single setItem is atomic. Never delete the old list to free space first.
  try { localStorage.setItem(SAVED_PLACES_KEY, raw); }
  catch { throw new Error('unavailable'); }
  notify();
  return { items: checked.items, dayIds: checked.dayIds, error: null };
}

export function saveTravelPlace(place: Place, ownerId?: string | null): SavedPlacesState {
  const checked = validatePlace(place);
  if (!checked) throw new Error('invalid');
  const doc = currentDocument(ownerId);
  // Repeated saves preserve notes, ordering, and the originally chosen snapshot.
  if (doc.items.some(item => item.place.id === checked.id)) return { items: doc.items, dayIds: doc.dayIds, error: null };
  if (doc.items.length >= MAX_SAVED_PLACES) throw new Error('full');
  const item = { place: checked, savedAt: new Date().toISOString(), note: '' };
  if (ownerId) return accountEdit(ownerId, { action: 'add', key: checked.id, value: encodeSavedPlace(item) });
  doc.items.unshift(item);
  return persist(doc);
}

export function deleteTravelPlace(id: string, ownerId?: string | null): SavedPlacesState {
  const doc = currentDocument(ownerId);
  if (ownerId) return accountEdit(ownerId, { action: 'remove', key: id });
  doc.items = doc.items.filter(item => item.place.id !== id);
  doc.dayIds = doc.dayIds.filter(value => value !== id);
  return persist(doc);
}

export type RemovedTravelPlace = { ownerId: string | null; item: SavedPlace; itemIndex: number; dayIds: string[] };

/** The undo token belongs to exactly one account/guest scope and is returned
 * only after the removal has been persisted successfully. */
export function removeTravelPlaceWithUndo(id: string, ownerId?: string | null): { state: SavedPlacesState; removed: RemovedTravelPlace | null } {
  const doc = currentDocument(ownerId);
  const itemIndex = doc.items.findIndex(item => item.place.id === id);
  const removed = itemIndex < 0 ? null : { ownerId: ownerId || null, item: doc.items[itemIndex], itemIndex, dayIds: [...doc.dayIds] };
  return { state: deleteTravelPlace(id, ownerId), removed };
}

/** Restore only this removal. Never replace a later re-save or rewind changes
 * to other places. The account item and its day position are one queue write. */
export function restoreTravelPlace(removed: RemovedTravelPlace, ownerId?: string | null): SavedPlacesState {
  if (removed.ownerId !== (ownerId || null) || !validateDocument({ version: 1, items: [removed.item], dayIds: [] })) throw new Error('invalid');
  const doc = currentDocument(ownerId), id = removed.item.place.id;
  if (doc.items.some(item => item.place.id === id)) return readSavedPlaces(ownerId);
  if (doc.items.length >= MAX_SAVED_PLACES) throw new Error('full');
  const oldIndex = removed.dayIds.indexOf(id);
  const dayIds = [...doc.dayIds];
  if (oldIndex >= 0) {
    if (dayIds.length >= MAX_DAY_STOPS) throw new Error('day-full');
    const following = removed.dayIds.slice(oldIndex + 1).find(key => dayIds.includes(key));
    const preceding = removed.dayIds.slice(0, oldIndex).reverse().find(key => dayIds.includes(key));
    const at = following ? dayIds.indexOf(following) : preceding ? dayIds.indexOf(preceding) + 1 : Math.min(oldIndex, dayIds.length);
    dayIds.splice(at, 0, id);
  }
  if (ownerId) {
    const edits: Array<Omit<CollectionOperation, 'id'>> = [{ action: 'add', key: id, value: encodeSavedPlace(removed.item) }];
    if (oldIndex >= 0) edits.push({ action: 'day-add', key: id }, { action: 'day-before', key: id, value: dayIds[dayIds.indexOf(id) + 1] || null });
    queueCollectionChange(ownerId, 'saved_places', edits);
    return readSavedPlaces(ownerId);
  }
  doc.items.splice(Math.min(removed.itemIndex, doc.items.length), 0, removed.item);
  doc.dayIds = dayIds;
  return persist(doc);
}

export function updateTravelPlaceNote(id: string, note: string, ownerId?: string | null): SavedPlacesState {
  if (!text(note, MAX_PLACE_NOTE)) throw new Error('invalid');
  const doc = currentDocument(ownerId);
  const item = doc.items.find(item => item.place.id === id);
  if (!item) throw new Error('missing');
  if (ownerId) return accountEdit(ownerId, { action: 'patch', key: id, value: { note: note.trim() } });
  item.note = note.trim();
  return persist(doc);
}

export function setTravelDayStop(id: string, include: boolean, ownerId?: string | null): SavedPlacesState {
  const doc = currentDocument(ownerId);
  if (!doc.items.some(item => item.place.id === id)) throw new Error('missing');
  if (include && !doc.dayIds.includes(id)) {
    if (doc.dayIds.length >= MAX_DAY_STOPS) throw new Error('day-full');
    doc.dayIds.push(id);
  } else if (!include) doc.dayIds = doc.dayIds.filter(value => value !== id);
  if (ownerId) return accountEdit(ownerId, { action: include ? 'day-add' : 'day-remove', key: id });
  return persist(doc);
}

export function moveTravelDayStop(id: string, direction: -1 | 1, ownerId?: string | null): SavedPlacesState {
  const doc = currentDocument(ownerId);
  const index = doc.dayIds.indexOf(id);
  if (index < 0 || ![-1, 1].includes(direction)) throw new Error('missing');
  const next = index + direction;
  if (next >= 0 && next < doc.dayIds.length) [doc.dayIds[index], doc.dayIds[next]] = [doc.dayIds[next], doc.dayIds[index]];
  if (ownerId) return accountEdit(ownerId, { action: 'day-before', key: id, value: doc.dayIds[doc.dayIds.indexOf(id) + 1] || null });
  return persist(doc);
}

// Only the explicit recovery action calls this; a parse or read failure never does.
export function resetSavedPlaces(ownerId?: string | null): SavedPlacesState {
  if (ownerId) { resetCollectionCache(ownerId, 'saved_places'); return readSavedPlaces(ownerId); }
  try { localStorage.removeItem(SAVED_PLACES_KEY); }
  catch { throw new Error('unavailable'); }
  notify();
  return { items: [], dayIds: [], error: null };
}

export function subscribeSavedPlaces(listener: () => void, ownerId?: string | null): () => void {
  const key = ownerId ? collectionKey(ownerId, 'saved_places') : SAVED_PLACES_KEY;
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
  };
  const onCollection = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.ownerId === ownerId && detail.kind === 'saved_places') listener(); };
  if (ownerId) window.addEventListener(COLLECTION_CHANGE, onCollection);
  else window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener(COLLECTION_CHANGE, onCollection);
    window.removeEventListener('storage', onStorage);
  };
}
