import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { validJourneyPlaceSource } = require('../../lib/travel-assistant/places.ts');
const source = ts.transpileModule(readFileSync(new URL('../../mobile/src/lib/personalMapPins.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
const location = { latitude: 41.015, longitude: 28.979 };
const key = owner => `l2t.personal-map-pins.v1:${owner ? `user:${encodeURIComponent(owner)}` : 'guest'}`;
function harness(storage = new Map()) {
  const state = { writes: 0, removes: 0, failRead: false, failWrite: false };
  const window = new EventTarget();
  const localStorage = {
    getItem: name => { if (state.failRead) throw Error('disabled'); return storage.get(name) ?? null; },
    setItem: (name, value) => { if (state.failWrite) throw Error('quota'); storage.set(name, value); state.writes++; },
    removeItem: name => { storage.delete(name); state.removes++; },
  };
  class CustomEvent extends Event { constructor(type, options = {}) { super(type); this.detail = options.detail; } }
  const out = { exports: {} }; let counter = 0;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, localStorage, window, Event, CustomEvent })(() => ({
    createId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  }), out, out.exports);
  return { api: out.exports, storage, state, window };
}

test('Personal pins have their own namespace, are readable offline without writes, and never impersonate provider places', () => {
  const h = harness(); assert.deepEqual(plain(h.api.readPersonalMapPins()), { items: [], error: null });
  assert.equal(h.state.writes, 0);
  const pin = h.api.savePersonalMapPin(location, '  My meeting point  ');
  assert.match(pin.id, /^personal\/00000000-0000-4000-8000-\d{12}$/);
  assert.equal(pin.name, 'My meeting point'); assert.equal(pin.inDay, false);
  const fresh = harness(h.storage), before = fresh.state.writes;
  assert.deepEqual(plain(fresh.api.readPersonalMapPins().items[0]), plain(pin)); assert.equal(fresh.state.writes, before);
  const display = h.api.personalPinPlace(pin);
  assert.equal(display.id, pin.id); assert.equal(display.latitude, location.latitude);
  assert.equal(validJourneyPlaceSource(display.id, display.sourceUrl), false);
  assert.match(display.sourceUrl, /\?mlat=41\.015&mlon=28\.979#map=17\//);
  assert.equal(display.hours, null); assert.equal(display.website, null);
  assert.deepEqual([...h.storage.keys()], [key()]);
});

test('Guest and account pin stores are isolated, including copied-document owner checks', () => {
  const h = harness(); h.api.savePersonalMapPin(location, 'Guest'); h.api.savePersonalMapPin(location, 'Private A', 'owner-a');
  h.api.savePersonalMapPin(location, 'Private B', 'owner-b');
  assert.equal(h.api.readPersonalMapPins().items[0].name, 'Guest');
  assert.equal(h.api.readPersonalMapPins('owner-a').items[0].name, 'Private A');
  assert.equal(h.api.readPersonalMapPins('owner-b').items[0].name, 'Private B');
  h.storage.set(key('owner-b'), h.storage.get(key('owner-a')));
  const before = h.storage.get(key('owner-b'));
  assert.equal(h.api.readPersonalMapPins('owner-b').error, 'corrupt');
  assert.throws(() => h.api.savePersonalMapPin(location, 'Replacement', 'owner-b'), /corrupt/);
  assert.equal(h.storage.get(key('owner-b')), before);
});

test('Malformed and future pin documents cannot be silently repaired or overwritten', () => {
  const seed = harness(); const item = seed.api.savePersonalMapPin(location, 'Keep');
  const invalid = [
    'not json', JSON.stringify({ version: 2, ownerId: null, items: [] }),
    ...[
      { ...item, id: 'node/1' }, { ...item, latitude: 91 }, { ...item, longitude: '28' },
      { ...item, name: ' ' }, { ...item, name: 'a\nb' }, { ...item, note: 'a'.repeat(281) },
      { ...item, inDay: 1 }, { ...item, createdAt: 'yesterday' },
    ].map(pin => JSON.stringify({ version: 1, ownerId: null, items: [pin] })),
    JSON.stringify({ version: 1, ownerId: null, items: [item, item] }),
    ' '.repeat(256001),
  ];
  for (const raw of invalid) {
    const h = harness(new Map([[key(), raw]]));
    assert.equal(h.api.readPersonalMapPins().error, 'corrupt');
    assert.throws(() => h.api.savePersonalMapPin(location, 'New'), /corrupt/);
    assert.equal(h.storage.get(key()), raw); assert.equal(h.state.writes, 0); assert.equal(h.state.removes, 0);
  }
});

test('Pin input validation refuses invalid coordinates, owner scopes, identity changes and oversized fields', () => {
  const h = harness();
  for (const point of [{ latitude: NaN, longitude: 1 }, { latitude: 0, longitude: Infinity }, { latitude: -91, longitude: 0 }, { latitude: 0, longitude: 181 }]) {
    assert.throws(() => h.api.savePersonalMapPin(point, 'Bad'), /invalid/);
  }
  for (const name of ['', ' ', 'x'.repeat(101), 'name\u0000']) assert.throws(() => h.api.savePersonalMapPin(location, name), /invalid/);
  assert.throws(() => h.api.savePersonalMapPin(location, 'Bad', 'a\nowner'), /invalid|unavailable/);
  const pin = h.api.savePersonalMapPin(location, 'Original'), before = h.storage.get(key());
  for (const patch of [{ id: 'node/1' }, { latitude: 2 }, { createdAt: new Date().toISOString() }, { note: 'n'.repeat(281) }, { inDay: 'true' }, { name: ' ' }]) {
    assert.throws(() => h.api.updatePersonalMapPin(pin.id, patch), /invalid/); assert.equal(h.storage.get(key()), before);
  }
});

test('Notes and day membership retain the private pin identity; delete Undo does not rewind unrelated edits', () => {
  const h = harness(), first = h.api.savePersonalMapPin(location, 'First', 'a');
  const second = h.api.savePersonalMapPin({ latitude: 40, longitude: 29 }, 'Second', 'a');
  h.api.updatePersonalMapPin(first.id, { name: ' First renamed ', note: '  Meet\nafter lunch  ', inDay: true }, 'a');
  const removed = h.api.removePersonalMapPin(first.id, 'a');
  h.api.updatePersonalMapPin(second.id, { note: 'New unrelated note' }, 'a');
  assert.throws(() => h.api.restorePersonalMapPin(removed, 'b'), /invalid/);
  h.api.restorePersonalMapPin(removed, 'a');
  const items = h.api.readPersonalMapPins('a').items, restored = items.find(pin => pin.id === first.id);
  assert.equal(restored.name, 'First renamed'); assert.equal(restored.note, 'Meet\nafter lunch'); assert.equal(restored.inDay, true);
  assert.equal(restored.createdAt, first.createdAt); assert.equal(restored.latitude, first.latitude);
  assert.equal(items.find(pin => pin.id === second.id).note, 'New unrelated note');
  const writes = h.state.writes; h.api.restorePersonalMapPin(removed, 'a'); assert.equal(h.state.writes, writes);
});

test('Quota or unavailable storage preserves the old document and emits no false saved notification', () => {
  const h = harness(), pin = h.api.savePersonalMapPin(location, 'Keep'), before = h.storage.get(key());
  let changes = 0; const unsubscribe = h.api.subscribePersonalMapPins(() => changes++);
  h.state.failWrite = true;
  assert.throws(() => h.api.updatePersonalMapPin(pin.id, { note: 'Unsaved' }), /unavailable/);
  assert.throws(() => h.api.removePersonalMapPin(pin.id), /unavailable/);
  assert.equal(h.storage.get(key()), before); assert.equal(changes, 0); assert.equal(h.state.removes, 0);
  h.state.failWrite = false; h.state.failRead = true;
  assert.equal(h.api.readPersonalMapPins().error, 'unavailable');
  assert.throws(() => h.api.savePersonalMapPin(location, 'New'), /unavailable/);
  assert.equal(h.storage.get(key()), before); unsubscribe();
});

test('Personal pin capacity stops before overwriting records and can recover after deletion', () => {
  const h = harness(); let first;
  for (let index = 0; index < h.api.MAX_PERSONAL_MAP_PINS; index++) { const item = h.api.savePersonalMapPin(location, `Pin ${index}`); first ??= item; }
  const before = h.storage.get(key()); assert.throws(() => h.api.savePersonalMapPin(location, 'Overflow'), /full/);
  assert.equal(h.storage.get(key()), before); const removed = h.api.removePersonalMapPin(first.id);
  h.api.savePersonalMapPin(location, 'New pin'); assert.throws(() => h.api.restorePersonalMapPin(removed), /full/);
  assert.equal(h.api.readPersonalMapPins().items.length, 100);
});

test('Personal pin subscriptions filter accounts and storage events, and cleanup removes every listener', () => {
  const h = harness(); let a = 0, b = 0;
  const offA = h.api.subscribePersonalMapPins(() => a++, 'a'), offB = h.api.subscribePersonalMapPins(() => b++, 'b');
  h.api.savePersonalMapPin(location, 'A', 'a'); assert.equal(a, 1); assert.equal(b, 0);
  const storage = name => { const event = new Event('storage'); Object.defineProperty(event, 'key', { value: name }); h.window.dispatchEvent(event); };
  storage(key('b')); assert.equal(a, 1); assert.equal(b, 1);
  storage('unrelated'); assert.equal(a, 1); assert.equal(b, 1);
  h.window.dispatchEvent(new Event('l2t:storage-change')); assert.equal(a, 2); assert.equal(b, 2);
  offA(); offB(); storage(null); h.api.savePersonalMapPin(location, 'Second A', 'a');
  assert.equal(a, 2); assert.equal(b, 2);
});

const jsx = (type, props, key) => ({ type, props, key });
const uiNodes = value => Array.isArray(value) ? value.flatMap(uiNodes) : !value || typeof value !== 'object' ? [] : [value, ...uiNodes(value.props?.children)];
const uiText = value => Array.isArray(value) ? value.map(uiText).join('') : value?.props ? uiText(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
function libraryUI(storage, initialOwner) {
  let slots = [], cursor = 0, effects = [], dirty = false, tree, ownerId = initialOwner, previousKey;
  const state = { selects: [], directions: [], explores: 0 };
  const react = {
    useState(initial) { const at = cursor++; slots[at] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[at].value, value => { const next = typeof value === 'function' ? value(slots[at].value) : value; if (next !== slots[at].value) { slots[at].value = next; dirty = true; } }]; },
    useEffect(effect, deps) { const at = cursor++, old = slots[at]; if (!old || deps.some((item, index) => item !== old.deps[index])) { slots[at] = { deps }; effects.push(() => { old?.cleanup?.(); slots[at].cleanup = effect(); }); } },
    useId: () => `id-${cursor++}`,
  };
  const out = { exports: {} }, librarySource = ts.transpileModule(readFileSync(new URL('../../mobile/src/components/TravelMapLibrary.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${librarySource}\n})`, {})(name => {
    if (name.endsWith('.css')) return {};
    const imports = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../lib/personalMapPins': storage.api, '../lib/i18n': { useI18n: () => ({ copy: (_tr, en) => en }) }, './Icon': { Icon: 'Icon' }, './TravelSavedPlaces': { TravelSavedPlaces: 'TravelSavedPlaces' } };
    assert.ok(Object.hasOwn(imports, name), name); return imports[name];
  }, out, out.exports);
  const app = {
    state,
    render(nextOwner = ownerId) {
      ownerId = nextOwner;
      const wrapper = out.exports.TravelMapLibrary({ ownerId, onSelectPlace: place => state.selects.push(place), onDirections: place => state.directions.push(place), onExplore: () => state.explores++ });
      if (previousKey !== wrapper.key) { slots.forEach(slot => slot?.cleanup?.()); slots = []; previousKey = wrapper.key; }
      for (let count = 0; count < 8; count++) { cursor = 0; effects = []; dirty = false; tree = wrapper.type(wrapper.props); effects.forEach(effect => effect()); if (!dirty) return tree; }
      throw Error('Unstable personal library');
    },
    rows() { return uiNodes(tree).filter(node => node.type?.name === 'PersonalPinRow'); },
    click(label) { const button = uiNodes(tree).find(node => node.type === 'button' && uiText(node).trim() === label); assert.ok(button, label); button.props.onClick(); app.render(); },
    get tree() { return tree; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
  app.render(); return app;
}

test('Unified library embeds the original account saved-place controls and routes personal display points separately', () => {
  const h = harness(), pin = h.api.savePersonalMapPin(location, 'Meeting point', 'owner-a');
  const app = libraryUI(h, 'owner-a');
  assert.match(uiText(app.tree), /Private to this account · Only on this device/);
  const embedded = uiNodes(app.tree).find(node => node.type === 'TravelSavedPlaces');
  assert.equal(embedded.props.ownerId, 'owner-a'); assert.equal(embedded.props.hideMap, true);
  assert.equal(embedded.props.onExploreLabel, 'Find places on the map'); embedded.props.onExplore(); assert.equal(app.state.explores, 1);
  const row = app.rows()[0], before = [...h.storage]; row.props.onSelect(); row.props.onDirections();
  assert.equal(app.state.selects[0].id, pin.id); assert.equal(app.state.directions[0].id, pin.id);
  assert.deepEqual([...h.storage], before); app.dispose();
});

test('Personal library edits, day membership and retryable removal Undo use only the owner-bound local store', () => {
  const h = harness(); h.api.savePersonalMapPin(location, 'Pin', 'owner-a'); const app = libraryUI(h, 'owner-a');
  assert.equal(app.rows()[0].props.onSave('Renamed', 'My private note'), true); app.render();
  app.rows()[0].props.onDay(); app.render(); assert.equal(h.api.readPersonalMapPins('owner-a').items[0].inDay, true);
  app.rows()[0].props.onRemove(); app.render(); assert.equal(app.rows().length, 0); assert.match(uiText(app.tree), /Pin removed/);
  h.state.failWrite = true; app.click('Undo'); assert.match(uiText(app.tree), /could not be saved/); assert.equal(app.rows().length, 0);
  h.state.failWrite = false; app.click('Undo'); assert.equal(app.rows()[0].props.item.name, 'Renamed');
  assert.equal(app.rows()[0].props.item.note, 'My private note'); assert.equal(app.rows()[0].props.item.inDay, true);
  assert.deepEqual([...h.storage.keys()], [key('owner-a')]); app.dispose();
});

test('Changing library owner remounts private state and discards the previous owner Undo token', () => {
  const h = harness(); h.api.savePersonalMapPin(location, 'Private A', 'owner-a'); h.api.savePersonalMapPin(location, 'Private B', 'owner-b');
  const app = libraryUI(h, 'owner-a'); app.rows()[0].props.onRemove(); app.render(); assert.match(uiText(app.tree), /Undo/);
  app.render('owner-b'); assert.doesNotMatch(uiText(app.tree), /Undo|Private A/); assert.equal(app.rows()[0].props.item.name, 'Private B');
  app.render('owner-a'); assert.doesNotMatch(uiText(app.tree), /Undo|Private B/); assert.equal(app.rows().length, 0); app.dispose();
});
