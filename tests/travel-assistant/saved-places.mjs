import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const places = require('../../lib/travel-assistant/places.ts');
const source = ts.transpileModule(readFileSync(new URL('../../mobile/src/lib/savedPlaces.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const legacySource = ts.transpileModule(readFileSync(new URL('../fixtures/saved-places-build75.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const collectionSource = ts.transpileModule(readFileSync(new URL('../../mobile/src/lib/accountCollections.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
const place = (id = 1, overrides = {}) => ({
  id: `node/${id}`, category: 'museum', latitude: 52.52, longitude: 13.4, name: `Museum ${id}`,
  description: 'A community listing', hours: 'Mo-Fr 09:00-17:00', free: false, accessible: null,
  website: 'https://museum.example.org/visit', representedCountry: null,
  sourceUrl: `https://www.openstreetmap.org/node/${id}`, fetchedAt: '2025-01-01T12:00:00.000Z', ...overrides,
});
function harness(moduleSource = source, storage = new Map()) {
  const state = { writes: 0, failRead: false, failWrite: false };
  const window = new EventTarget();
  const localStorage = {
    getItem: key => { if (state.failRead) throw Error('disabled'); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (state.failWrite) throw Error('quota'); storage.set(key, value); state.writes++; },
    removeItem: key => { if (state.failWrite) throw Error('disabled'); storage.delete(key); state.writes++; },
  };
  window.localStorage = localStorage;
  class CustomEvent extends Event { constructor(name, options = {}) { super(name); this.detail = options.detail; } }
  const context = { Date, URL, localStorage, window, Event, CustomEvent };
  const collections = { exports: {} };
  let operation = 0;
  vm.runInNewContext(`(function(require,module,exports){${collectionSource}\n})`, context)(() => ({ createId: () => `operation-${++operation}` }), collections, collections.exports);
  const out = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${moduleSource}\n})`, context)(name => name === './accountCollections' ? collections.exports : places, out, out.exports);
  return { api: out.exports, storage, state, window, collections: collections.exports };
}

test('Reading saved places has no persistence side effects and keeps old snapshots offline', () => {
  const h = harness();
  assert.deepEqual(plain(h.api.readSavedPlaces()), { items: [], dayIds: [], error: null });
  assert.equal(h.state.writes, 0);
  const original = place();
  h.api.saveTravelPlace(original);
  assert.deepEqual(plain(h.api.readSavedPlaces().items[0].place), original);
  assert.equal(h.api.readSavedPlaces().items[0].place.fetchedAt, '2025-01-01T12:00:00.000Z');
  const fresh = harness();
  fresh.storage.set(fresh.api.SAVED_PLACES_KEY, h.storage.get(h.api.SAVED_PLACES_KEY));
  assert.deepEqual(plain(fresh.api.readSavedPlaces().items[0].place), original);
  assert.equal(fresh.state.writes, 0);
});

test('Duplicate saves preserve notes, snapshot date, saved date and day order', () => {
  const h = harness();
  h.api.saveTravelPlace(place()); h.api.saveTravelPlace(place(2));
  h.api.updateTravelPlaceNote('node/1', ' Visit after lunch ');
  h.api.setTravelDayStop('node/2', true); h.api.setTravelDayStop('node/1', true);
  const before = h.storage.get(h.api.SAVED_PLACES_KEY);
  h.api.saveTravelPlace(place(1, { name: 'Changed provider name', fetchedAt: '2026-09-27T10:00:00.000Z' }));
  assert.equal(h.storage.get(h.api.SAVED_PLACES_KEY), before);
  assert.equal(h.api.readSavedPlaces().items.find(i => i.place.id === 'node/1').note, 'Visit after lunch');
});

test('Day stops have independent ordering and deletion removes dangling entries', () => {
  const h = harness();
  for (let id = 1; id <= 3; id++) { h.api.saveTravelPlace(place(id)); h.api.setTravelDayStop(`node/${id}`, true); }
  h.api.moveTravelDayStop('node/3', -1);
  assert.deepEqual(plain(h.api.readSavedPlaces().dayIds), ['node/1', 'node/3', 'node/2']);
  h.api.moveTravelDayStop('node/1', -1);
  h.api.deleteTravelPlace('node/3');
  assert.deepEqual(plain(h.api.readSavedPlaces().dayIds), ['node/1', 'node/2']);
  h.api.setTravelDayStop('node/1', false);
  assert.equal(h.api.readSavedPlaces().items.length, 2);
  assert.deepEqual(plain(h.api.readSavedPlaces().dayIds), ['node/2']);
  assert.throws(() => h.api.setTravelDayStop('node/300', true), /missing/);
});

test('Storage quota failures preserve the last written notes and day order', () => {
  const h = harness();
  h.api.saveTravelPlace(place()); h.api.saveTravelPlace(place(2));
  h.api.setTravelDayStop('node/1', true); h.api.setTravelDayStop('node/2', true);
  const before = h.storage.get(h.api.SAVED_PLACES_KEY);
  h.state.failWrite = true;
  for (const change of [() => h.api.saveTravelPlace(place(3)), () => h.api.updateTravelPlaceNote('node/1', 'new'),
    () => h.api.moveTravelDayStop('node/2', -1), () => h.api.deleteTravelPlace('node/1'), () => h.api.resetSavedPlaces()]) {
    assert.throws(change, /unavailable/);
    assert.equal(h.storage.get(h.api.SAVED_PLACES_KEY), before);
  }
});

test('Unreadable and future-version storage is reported and never overwritten automatically', () => {
  for (const raw of ['{invalid JSON', '{"version":2,"items":[],"dayIds":[]}', 'x'.repeat(256_001)]) {
    const h = harness(); h.storage.set(h.api.SAVED_PLACES_KEY, raw);
    assert.equal(h.api.readSavedPlaces().error, 'corrupt');
    assert.throws(() => h.api.saveTravelPlace(place()), /corrupt/);
    assert.throws(() => h.api.deleteTravelPlace('node/1'), /corrupt/);
    assert.equal(h.storage.get(h.api.SAVED_PLACES_KEY), raw);
    assert.equal(h.state.writes, 0);
    h.api.resetSavedPlaces();
    assert.equal(h.api.readSavedPlaces().error, null);
  }
  const h = harness(); h.state.failRead = true;
  assert.equal(h.api.readSavedPlaces().error, 'unavailable');
  assert.throws(() => h.api.saveTravelPlace(place()), /unavailable/);
  assert.equal(h.state.writes, 0);
});

test('Untrusted snapshots reject unsafe URLs, invalid coordinates, oversized fields and duplicate IDs', () => {
  const h = harness();
  for (const invalid of [
    { latitude: 99 }, { longitude: Infinity }, { sourceUrl: 'https://attacker.example/node/1' },
    { website: 'javascript:alert(1)' }, { website: 'http://museum.example.org' },
    { website: 'https://user:password@museum.example.org' }, { website: 'https://127.0.0.1/' },
    { name: 'x'.repeat(181) }, { id: 'node/-1' }, { category: 'unknown' },
    { fetchedAt: '2026-02-30T00:00:00.000Z' }, { free: 'true' },
  ]) assert.throws(() => h.api.saveTravelPlace(place(1, invalid)), /invalid/);
  h.api.saveTravelPlace(place());
  const data = JSON.parse(h.storage.get(h.api.SAVED_PLACES_KEY));
  data.items.push(data.items[0]);
  h.storage.set(h.api.SAVED_PLACES_KEY, JSON.stringify(data));
  assert.equal(h.api.readSavedPlaces().error, 'corrupt');
});

test('Schema bounds the total list, the day list and notes without dropping existing records', () => {
  const h = harness();
  for (let id = 1; id <= h.api.MAX_SAVED_PLACES; id++) h.api.saveTravelPlace(place(id));
  assert.throws(() => h.api.saveTravelPlace(place(61)), /full/);
  assert.equal(h.api.readSavedPlaces().items.length, 60);
  for (let id = 1; id <= h.api.MAX_DAY_STOPS; id++) h.api.setTravelDayStop(`node/${id}`, true);
  assert.throws(() => h.api.setTravelDayStop('node/13', true), /day-full/);
  assert.equal(h.api.readSavedPlaces().dayIds.length, 12);
  assert.throws(() => h.api.updateTravelPlaceNote('node/1', 'x'.repeat(281)), /invalid/);
  h.api.updateTravelPlaceNote('node/1', 'x'.repeat(280));
  assert.equal(h.api.readSavedPlaces().items.find(i => i.place.id === 'node/1').note.length, 280);
});

test('Stored day references must be unique and point at saved places', () => {
  for (const dayIds of [['node/1', 'node/1'], ['node/2'], [null]]) {
    const h = harness(); h.api.saveTravelPlace(place());
    const data = JSON.parse(h.storage.get(h.api.SAVED_PLACES_KEY));
    data.dayIds = dayIds;
    h.storage.set(h.api.SAVED_PLACES_KEY, JSON.stringify(data));
    assert.equal(h.api.readSavedPlaces().error, 'corrupt');
  }
});

test('Subscriptions update same-window saves, other-window changes and account cleanup', () => {
  const h = harness(); let calls = 0;
  const unsubscribe = h.api.subscribeSavedPlaces(() => calls++);
  h.api.saveTravelPlace(place()); assert.equal(calls, 1);
  h.window.dispatchEvent(Object.assign(new Event('storage'), { key: 'other-key' })); assert.equal(calls, 1);
  h.window.dispatchEvent(Object.assign(new Event('storage'), { key: h.api.SAVED_PLACES_KEY })); assert.equal(calls, 2);
  h.window.dispatchEvent(Object.assign(new Event('storage'), { key: null })); assert.equal(calls, 3);
  h.api.resetSavedPlaces(); assert.equal(calls, 4);
  unsubscribe(); h.api.saveTravelPlace(place()); assert.equal(calls, 4);
});

test('Bank and transit bookmarks keep old readers usable while preserving exact current categories and account retries', () => {
  for (const owner of [undefined, 'traveller-one']) {
    const h = harness();
    const legacy = harness(legacySource, h.storage);
    const bank = place(2, { category: 'bank', name: 'Local bank' });
    const transit = place(3, { category: 'transit', name: 'Metro station' });
    h.api.saveTravelPlace(place(), owner);
    h.api.saveTravelPlace(bank, owner);
    h.api.saveTravelPlace(transit, owner);
    h.api.updateTravelPlaceNote('node/2', 'Keep this note', owner);
    h.api.setTravelDayStop('node/3', true, owner);
    const before = h.state.writes;
    assert.deepEqual(plain(h.api.readSavedPlaces(owner).items.find(item => item.place.id === bank.id).place), bank);
    assert.deepEqual(plain(h.api.readSavedPlaces(owner).items.find(item => item.place.id === transit.id).place), transit);
    assert.equal(h.state.writes, before, 'decoding never silently rewrites storage');
    assert.equal(bank.category, 'bank', 'encoding never mutates the live place');
    const old = legacy.api.readSavedPlaces(owner);
    assert.equal(old.error, null);
    assert.equal(old.items.length, 3);
    assert.equal(old.items.find(item => item.place.id === bank.id).place.category, 'attraction');
    assert.equal(old.items.find(item => item.place.id === bank.id).note, 'Keep this note');
    assert.deepEqual(plain(old.dayIds), ['node/3']);
    if (owner) {
      const envelope = h.collections.readCollection(owner, 'saved_places');
      const add = envelope.pending.find(op => op.action === 'add' && op.key === bank.id);
      assert.equal(add.value.place.category, 'attraction', 'the retry queue also uses compatible snapshots');
      assert.equal(legacy.api.validateAccountPlaces(envelope.document), true);
      legacy.api.updateTravelPlaceNote(bank.id, 'Edited on an installed version', owner);
      assert.equal(h.api.readSavedPlaces(owner).items.find(item => item.place.id === bank.id).place.category, 'bank');
    } else {
      legacy.api.updateTravelPlaceNote(bank.id, 'Edited on an installed version');
      assert.equal(h.api.readSavedPlaces().error, null, 'an older guest rewrite remains valid even if it omits optional detail');
    }
    assert.equal(h.api.readSavedPlaces(owner).items.find(item => item.place.id === bank.id).note, 'Edited on an installed version');
    legacy.api.deleteTravelPlace(transit.id, owner);
    assert.equal(h.api.readSavedPlaces(owner).items.some(item => item.place.id === transit.id), false, 'optional details cannot resurrect a deleted bookmark');
    assert.deepEqual(plain(h.api.readSavedPlaces(owner).dayIds), []);
  }
});

test('Optional bookmark category detail is bounded to the exact base category, identity and supported version', () => {
  const h = harness();
  h.api.saveTravelPlace(place(1, { category: 'bank' }));
  const original = JSON.parse(h.storage.get(h.api.SAVED_PLACES_KEY));
  assert.equal(original.items[0].place.category, 'attraction');
  for (const detail of [null, {}, { version: 1, placeId: 'node/99', category: 'bank', fallback: 'attraction' },
    { version: 2, placeId: 'node/1', category: 'bank', fallback: 'attraction' },
    { version: 1, placeId: 'node/1', category: 'forged', fallback: 'attraction' }]) {
    const invalid = plain(original);
    invalid.items[0].journeyCategory = detail;
    h.storage.set(h.api.SAVED_PLACES_KEY, JSON.stringify(invalid));
    assert.equal(h.api.readSavedPlaces().error, null);
    assert.equal(h.api.readSavedPlaces().items[0].place.category, 'attraction');
  }
  original.items[0].place.category = 'museum';
  h.storage.set(h.api.SAVED_PLACES_KEY, JSON.stringify(original));
  assert.equal(h.api.readSavedPlaces().items[0].place.category, 'museum', 'old-client replacement takes precedence');
  const unencoded = harness(legacySource);
  unencoded.storage.set(unencoded.api.SAVED_PLACES_KEY, JSON.stringify({ version: 1, items: [{ place: place(1, { category: 'bank' }), savedAt: '2026-10-18T10:00:00.000Z', note: '' }], dayIds: [] }));
  assert.equal(unencoded.api.readSavedPlaces().error, 'corrupt', 'the frozen reader demonstrates why raw new categories are incompatible');
});
