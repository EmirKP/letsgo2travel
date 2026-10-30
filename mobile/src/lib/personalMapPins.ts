import type { Coordinates, Place } from '../../../lib/travel-assistant/types';
import { createId } from './id';

export const MAX_PERSONAL_MAP_PINS = 100;
export const MAX_PERSONAL_PIN_NOTE = 280;
export const MAX_PERSONAL_PIN_NAME = 100;
const PREFIX = 'l2t.personal-map-pins.v1';
const CHANGE = 'l2t:personal-map-pins-change';
const MAX_BYTES = 256_000;
const PIN_ID = /^personal\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type PersonalMapPin = Coordinates & {
  id: string;
  name: string;
  note: string;
  inDay: boolean;
  createdAt: string;
};
export type PersonalMapPinsState = { items: PersonalMapPin[]; error: 'corrupt' | 'unavailable' | null };
type PinDocument = { version: 1; ownerId: string | null; items: PersonalMapPin[] };
export type PersonalMapPinPatch = Partial<Pick<PersonalMapPin, 'name' | 'note' | 'inDay'>>;
export type RemovedPersonalMapPin = { ownerId: string | null; item: PersonalMapPin; index: number };

function scope(ownerId?: string | null) {
  if (ownerId === undefined || ownerId === null || ownerId === '') return null;
  if (typeof ownerId !== 'string' || ownerId.length > 128 || /\p{Cc}/u.test(ownerId)) throw new Error('invalid');
  return ownerId;
}
function key(ownerId?: string | null) {
  const owner = scope(ownerId);
  return `${PREFIX}:${owner === null ? 'guest' : `user:${encodeURIComponent(owner)}`}`;
}
function validText(value: unknown, max: number, singleLine = false): value is string {
  return typeof value === 'string' && value.length <= max
    && !/\p{Cc}/u.test(singleLine ? value : value.replace(/[\t\n\r]/g, ''));
}
function point(value: unknown): Coordinates | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Coordinates;
  return typeof item.latitude === 'number' && Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90
    && typeof item.longitude === 'number' && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180
    ? { latitude: item.latitude, longitude: item.longitude } : null;
}
function pin(value: unknown): PersonalMapPin | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as PersonalMapPin, location = point(item);
  if (!location || typeof item.id !== 'string' || !PIN_ID.test(item.id)
    || !validText(item.name, MAX_PERSONAL_PIN_NAME, true) || !item.name.trim()
    || !validText(item.note, MAX_PERSONAL_PIN_NOTE) || typeof item.inDay !== 'boolean'
    || typeof item.createdAt !== 'string' || item.createdAt.length !== 24 || !Number.isFinite(Date.parse(item.createdAt))
    || new Date(item.createdAt).toISOString() !== item.createdAt) return null;
  return { ...location, id: item.id, name: item.name, note: item.note, inDay: item.inDay, createdAt: item.createdAt };
}
function checkedDocument(raw: unknown, ownerId: string | null): PinDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const document = raw as PinDocument;
  if (document.version !== 1 || document.ownerId !== ownerId || !Array.isArray(document.items) || document.items.length > MAX_PERSONAL_MAP_PINS) return null;
  const items: PersonalMapPin[] = [], seen = new Set<string>();
  for (const value of document.items) {
    const item = pin(value);
    if (!item || seen.has(item.id)) return null;
    seen.add(item.id); items.push(item);
  }
  return { version: 1, ownerId, items };
}

/** Private, device-only data. Never reads or writes provider/account collections. */
export function readPersonalMapPins(ownerId?: string | null): PersonalMapPinsState {
  let raw: string | null, owner: string | null;
  try { owner = scope(ownerId); raw = localStorage.getItem(key(owner)); }
  catch { return { items: [], error: 'unavailable' }; }
  if (raw === null) return { items: [], error: null };
  if (raw.length > MAX_BYTES) return { items: [], error: 'corrupt' };
  try {
    const document = checkedDocument(JSON.parse(raw), owner);
    return document ? { items: document.items, error: null } : { items: [], error: 'corrupt' };
  } catch { return { items: [], error: 'corrupt' }; }
}
function current(ownerId?: string | null): PinDocument {
  const state = readPersonalMapPins(ownerId);
  if (state.error) throw new Error(state.error);
  return { version: 1, ownerId: scope(ownerId), items: state.items };
}
function persist(document: PinDocument) {
  const checked = checkedDocument(document, document.ownerId);
  if (!checked) throw new Error('invalid');
  const raw = JSON.stringify(checked);
  if (raw.length > MAX_BYTES) throw new Error('full');
  // One atomic write; never remove the previous document to make quota space.
  try { localStorage.setItem(key(document.ownerId), raw); }
  catch { throw new Error('unavailable'); }
  try { window.dispatchEvent(new CustomEvent(CHANGE, { detail: { key: key(document.ownerId) } })); } catch { /* A saved pin remains valid when event delivery is unavailable. */ }
}

export function savePersonalMapPin(location: Coordinates, name: string, ownerId?: string | null): PersonalMapPin {
  const coordinates = point(location);
  if (!coordinates || !validText(name, MAX_PERSONAL_PIN_NAME, true) || !name.trim()) throw new Error('invalid');
  const document = current(ownerId);
  if (document.items.length >= MAX_PERSONAL_MAP_PINS) throw new Error('full');
  const item: PersonalMapPin = { ...coordinates, id: `personal/${createId()}`, name: name.trim(), note: '', inDay: false, createdAt: new Date().toISOString() };
  if (document.items.some(previous => previous.id === item.id)) throw new Error('invalid');
  document.items.unshift(item); persist(document);
  return { ...item };
}
export function updatePersonalMapPin(id: string, patch: PersonalMapPinPatch, ownerId?: string | null): PersonalMapPin {
  if (!patch || typeof patch !== 'object' || Object.keys(patch).some(field => !['name', 'note', 'inDay'].includes(field))) throw new Error('invalid');
  const document = current(ownerId), index = document.items.findIndex(item => item.id === id);
  if (index < 0) throw new Error('missing');
  const candidate = { ...document.items[index], ...patch };
  if (typeof candidate.name === 'string') candidate.name = candidate.name.trim();
  if (typeof candidate.note === 'string') candidate.note = candidate.note.trim();
  const updated = pin(candidate);
  if (!updated) throw new Error('invalid');
  document.items[index] = updated; persist(document);
  return { ...updated };
}
export function removePersonalMapPin(id: string, ownerId?: string | null) {
  const document = current(ownerId);
  const index = document.items.findIndex(item => item.id === id);
  if (index < 0) throw new Error('missing');
  const removed: RemovedPersonalMapPin = { ownerId: document.ownerId, item: document.items[index], index };
  document.items = document.items.filter(item => item.id !== id); persist(document);
  return removed;
}
export function restorePersonalMapPin(removed: RemovedPersonalMapPin, ownerId?: string | null) {
  if (!removed || removed.ownerId !== scope(ownerId) || !pin(removed.item) || !Number.isSafeInteger(removed.index) || removed.index < 0) throw new Error('invalid');
  const document = current(ownerId);
  if (document.items.some(item => item.id === removed.item.id)) return;
  if (document.items.length >= MAX_PERSONAL_MAP_PINS) throw new Error('full');
  document.items.splice(Math.min(removed.index, document.items.length), 0, { ...removed.item }); persist(document);
}
export function subscribePersonalMapPins(listener: () => void, ownerId?: string | null): () => void {
  let storageKey: string;
  try { storageKey = key(ownerId); } catch { return () => {}; }
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === storageKey) listener(); };
  const changed = (event: Event) => { if ((event as CustomEvent).detail?.key === storageKey) listener(); };
  window.addEventListener('storage', storage);
  window.addEventListener(CHANGE, changed);
  window.addEventListener('l2t:storage-change', listener);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener(CHANGE, changed); window.removeEventListener('l2t:storage-change', listener); };
}

/** Display coordinates only: this is not an OSM/Apple provider identity and
 * must never be passed to saveTravelPlace or provider-backed server RPCs. */
export function personalPinPlace(value: PersonalMapPin): Place {
  const item = pin(value);
  if (!item) throw new Error('invalid');
  return { id: item.id, category: 'attraction', name: item.name, latitude: item.latitude, longitude: item.longitude,
    description: item.note || null, hours: null, free: null, accessible: null, website: null, representedCountry: null,
    sourceUrl: `https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=17/${item.latitude}/${item.longitude}`,
    fetchedAt: item.createdAt };
}
