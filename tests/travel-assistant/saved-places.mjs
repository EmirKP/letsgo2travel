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


test('Undo restores the exact guest snapshot, note and day position without rewinding unrelated edits', () => {
  const h = harness();
  for (const id of [1, 2, 3]) { h.api.saveTravelPlace(place(id)); h.api.setTravelDayStop(`node/${id}`, true); }
  h.api.updateTravelPlaceNote('node/2', 'Original note');
  const before = plain(h.api.readSavedPlaces());
  const removal = h.api.removeTravelPlaceWithUndo('node/2');
  assert.deepEqual(plain(removal.state.dayIds), ['node/1', 'node/3']);
  h.api.updateTravelPlaceNote('node/1', 'Later edit'); h.api.saveTravelPlace(place(4));
  const restored = h.api.restoreTravelPlace(removal.removed);
  assert.deepEqual(plain(restored.dayIds), before.dayIds);
  assert.deepEqual(plain(restored.items.find(item => item.place.id === 'node/2')), before.items.find(item => item.place.id === 'node/2'));
  assert.equal(restored.items.find(item => item.place.id === 'node/1').note, 'Later edit');
  assert.ok(restored.items.some(item => item.place.id === 'node/4'));
});

test('Account Undo commits the original item and ordered day membership in one retryable queue write', () => {
  const h = harness(), owner = 'account-a';
  for (const id of [1, 2, 3]) { h.api.saveTravelPlace(place(id), owner); h.api.setTravelDayStop(`node/${id}`, true, owner); }
  h.api.updateTravelPlaceNote('node/2', 'Private note', owner);
  const original = plain(h.api.readSavedPlaces(owner).items.find(item => item.place.id === 'node/2'));
  const { removed } = h.api.removeTravelPlaceWithUndo('node/2', owner);
  const before = h.storage.get(h.collections.collectionKey(owner, 'saved_places'));
  h.state.failWrite = true;
  assert.throws(() => h.api.restoreTravelPlace(removed, owner));
  assert.equal(h.storage.get(h.collections.collectionKey(owner, 'saved_places')), before, 'A failure commits neither a partial item nor a partial retry queue');
  h.state.failWrite = false; const writes = h.state.writes;
  const restored = h.api.restoreTravelPlace(removed, owner);
  assert.equal(h.state.writes, writes + 1);
  assert.deepEqual(plain(restored.dayIds), ['node/1', 'node/2', 'node/3']);
  assert.deepEqual(plain(restored.items.find(item => item.place.id === 'node/2')), original);
  assert.deepEqual(plain(h.collections.readCollection(owner, 'saved_places').pending.slice(-3).map(op => op.action)), ['add', 'day-add', 'day-before']);
});

test('Undo tokens cannot move private places between accounts or between account and guest scopes', () => {
  const h = harness(); h.api.saveTravelPlace(place(1), 'owner-a');
  const { removed } = h.api.removeTravelPlaceWithUndo('node/1', 'owner-a'); const before = [...h.storage];
  for (const owner of ['owner-b', null, undefined]) assert.throws(() => h.api.restoreTravelPlace(removed, owner), /invalid/);
  assert.deepEqual([...h.storage], before);
  h.api.saveTravelPlace(place(2)); const guest = h.api.removeTravelPlaceWithUndo('node/2').removed;
  assert.throws(() => h.api.restoreTravelPlace(guest, 'owner-a'), /invalid/);
});

test('Undo never overwrites a later re-save of the same place or its newly edited note and day sequence', () => {
  for (const owner of [undefined, 'owner-a']) {
    const h = harness(); h.api.saveTravelPlace(place(), owner); h.api.updateTravelPlaceNote('node/1', 'Before', owner); h.api.setTravelDayStop('node/1', true, owner);
    const { removed } = h.api.removeTravelPlaceWithUndo('node/1', owner);
    h.api.saveTravelPlace(place(1, {name:'Later snapshot'}), owner); h.api.updateTravelPlaceNote('node/1', 'After', owner);
    const before = plain(h.api.readSavedPlaces(owner)); const writes = h.state.writes;
    assert.deepEqual(plain(h.api.restoreTravelPlace(removed, owner)), before);
    assert.equal(h.state.writes, writes);
  }
});

test('Undo storage and day-limit failures are atomic and the same token remains retryable', () => {
  const h = harness(); h.api.saveTravelPlace(place()); h.api.updateTravelPlaceNote('node/1', 'Keep me'); h.api.setTravelDayStop('node/1', true);
  const { removed } = h.api.removeTravelPlaceWithUndo('node/1');
  h.state.failWrite = true; const before = h.storage.get(h.api.SAVED_PLACES_KEY);
  assert.throws(() => h.api.restoreTravelPlace(removed), /unavailable/); assert.equal(h.storage.get(h.api.SAVED_PLACES_KEY), before);
  h.state.failWrite = false;
  for (let id=2; id <= h.api.MAX_DAY_STOPS + 1; id++) { h.api.saveTravelPlace(place(id)); h.api.setTravelDayStop(`node/${id}`, true); }
  const full = h.storage.get(h.api.SAVED_PLACES_KEY);
  assert.throws(() => h.api.restoreTravelPlace(removed), /day-full/); assert.equal(h.storage.get(h.api.SAVED_PLACES_KEY), full);
  h.api.setTravelDayStop('node/2', false);
  const restored = h.api.restoreTravelPlace(removed);
  assert.equal(restored.items.find(item => item.place.id === 'node/1').note, 'Keep me');
  assert.ok(restored.dayIds.includes('node/1'));
});


const jsx = (type, props, key) => ({type, props, key});
const uiNodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(uiNodes)];
const uiText = value => Array.isArray(value) ? value.map(uiText).join('') : value?.props ? uiText(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
function savedPlacesUI(storageHarness, initialOwner, extraProps = {}) {
  const slots=[];let cursor=0, effects=[], dirty=false, tree, ownerId=initialOwner;
  const react={
    useState(initial){const at=cursor++;slots[at]??={value:typeof initial==='function'?initial():initial};return[slots[at].value,next=>{const value=typeof next==='function'?next(slots[at].value):next;if(value!==slots[at].value){slots[at].value=value;dirty=true;}}];},
    useEffect(effect,deps){const at=cursor++,old=slots[at];if(!old||deps.some((d,i)=>d!==old.deps[i])){slots[at]={deps};effects.push(()=>{old?.cleanup?.();slots[at].cleanup=effect();});}},
    useId(){return `id-${cursor++}`;},lazy:()=> 'TravelPointMap',Suspense:'Suspense',
  };
  const out={exports:{}};
  const code=ts.transpileModule(readFileSync(new URL('../../mobile/src/components/TravelSavedPlaces.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date})(name=>{
    if(name.endsWith('.css'))return{};
    const imports={react,'react/jsx-runtime':{jsx,jsxs:jsx},'../../../lib/travel-assistant/places':places,'../lib/savedPlaces':storageHarness.api,'../lib/i18n':{useI18n:()=>({copy:(_tr,en)=>en,locale:'en'})},'../lib/native':{openExternal:async()=>true},'../lib/travelAssistant':{directionsUrl:()=>''},'../lib/localeFormatting':{formatAppDate:()=>''},'./Icon':{Icon:'Icon'}};
    assert.ok(Object.hasOwn(imports,name),`UI import ${name}`);return imports[name];
  },out,out.exports);
  const app={
    render(nextOwner=ownerId){ownerId=nextOwner;for(let count=0;count<8;count++){cursor=0;effects=[];dirty=false;tree=out.exports.TravelSavedPlaces({ownerId,...extraProps});effects.forEach(effect=>effect());if(!dirty)return tree;}throw Error('Unstable saved-place UI');},
    remove(id){const card=uiNodes(tree).find(node=>node.type?.name==='SavedPlaceCard'&&node.props.item.place.id===id);assert.ok(card);card.props.onDelete();return app.render();},
    click(label){const control=uiNodes(tree).find(node=>node.type==='button'&&uiText(node).trim()===label);assert.ok(control,label);control.props.onClick();return app.render();},
    get tree(){return tree;},dispose(){slots.forEach(slot=>slot?.cleanup?.());},
  };app.render();return app;
}

test('Saved-place UI offers retryable Undo that restores the note and day order through the real storage API', () => {
  const h=harness();h.api.saveTravelPlace(place());h.api.updateTravelPlaceNote('node/1','Do not lose this');h.api.setTravelDayStop('node/1',true);
  const app=savedPlacesUI(h);app.remove('node/1');assert.match(uiText(app.tree),/Undo/);assert.equal(h.api.readSavedPlaces().items.length,0);
  h.state.failWrite=true;app.click('Undo');assert.match(uiText(app.tree),/Could not save the change/);assert.match(uiText(app.tree),/Undo/);
  h.state.failWrite=false;app.click('Undo');assert.doesNotMatch(uiText(app.tree),/Restore the last removed/);
  assert.equal(h.api.readSavedPlaces().items[0].note,'Do not lose this');assert.deepEqual(plain(h.api.readSavedPlaces().dayIds),['node/1']);app.dispose();
});

test('Changing the account discards the previous saved-place UI Undo instead of exposing or restoring private data', () => {
  const h=harness();h.api.saveTravelPlace(place(1,{name:'Private A'}),'owner-a');h.api.saveTravelPlace(place(2,{name:'Private B'}),'owner-b');
  const app=savedPlacesUI(h,'owner-a');app.remove('node/1');assert.match(uiText(app.tree),/Undo/);
  app.render('owner-b');assert.doesNotMatch(uiText(app.tree),/Private A|Undo/);assert.equal(h.api.readSavedPlaces('owner-b').items[0].place.name,'Private B');
  app.render('owner-a');assert.doesNotMatch(uiText(app.tree),/Undo/);assert.equal(h.api.readSavedPlaces('owner-a').items.length,0);app.dispose();
});

test('Unified map embedding hides the previous map and routes saved places while preserving notes, day order and account operations', () => {
  const h = harness(), selected = [], directions = [];
  h.api.saveTravelPlace(place(1, { id: 'apple/real-place', sourceUrl: 'https://maps.apple.com/place?place-id=real-place' }), 'owner-a');
  h.api.updateTravelPlaceNote('apple/real-place', 'Keep my original note', 'owner-a');
  h.api.setTravelDayStop('apple/real-place', true, 'owner-a');
  const standalone = savedPlacesUI(h, 'owner-a');
  assert.equal(uiNodes(standalone.tree).filter(node => node.type === 'TravelPointMap').length, 1);
  standalone.dispose();
  const before = [...h.storage], writes = h.state.writes;
  const app = savedPlacesUI(h, 'owner-a', { hideMap: true, onSelectPlace: place => selected.push(place), onDirections: place => directions.push(place) });
  const privacy = uiNodes(app.tree).find(node => node.type === 'details' && node.props.className === 'tsp-storage-details');
  assert.ok(privacy); assert.notEqual(privacy.props.open, true); assert.match(uiText(privacy), /How are my records stored\?/);
  assert.match(uiText(privacy), /Deleted records are also removed from other devices after syncing/);
  assert.match(uiText(privacy), /Search and location history are not saved/);
  assert.equal(uiNodes(app.tree).filter(node => node.type === 'TravelPointMap').length, 0);
  const card = uiNodes(app.tree).find(node => node.type?.name === 'SavedPlaceCard');
  card.props.onSelect(); card.props.onDirections();
  assert.equal(selected[0].id, 'apple/real-place'); assert.equal(directions[0].id, 'apple/real-place');
  assert.deepEqual([...h.storage], before); assert.equal(h.state.writes, writes);
  card.props.onNote('Updated in the embedded library'); app.render();
  assert.equal(h.api.readSavedPlaces('owner-a').items[0].note, 'Updated in the embedded library');
  assert.deepEqual(plain(h.api.readSavedPlaces('owner-a').dayIds), ['apple/real-place']);
  assert.equal(h.api.readSavedPlaces('owner-b').items.length, 0); app.dispose();
});
