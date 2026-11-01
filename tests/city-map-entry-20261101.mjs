import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { realLocaleModule } from './fixtures/real-locale-modules.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const jsx = (type, props, key) => ({ type, props, key });
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object'
  && !(value.type === 'Sheet' && !value.props.open) ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props
  ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const bucharest = { latitude: 44.4268, longitude: 26.1025 };
const paris = { latitude: 48.8566, longitude: 2.3522 };
const intent = (id = 73, query = 'Romanian Athenaeum', center = bucharest, label = 'Bucharest') => ({ id, query, center, label, category: 'museum' });
const point = (id, name, center = bucharest) => ({
  id: `node/${id}`, name, ...center, category: 'museum', description: null, hours: null, free: null,
  accessible: null, website: null, representedCountry: null,
  sourceUrl: `https://www.openstreetmap.org/node/${id}`, fetchedAt: '2026-11-01T00:00:00.000Z',
});

// Execute the actual effect callbacks in registration order. StrictMode's
// setup -> cleanup -> setup replay retains refs/state, just as React does.
function hooks() {
  const slots = []; let cursor = 0, pending = [], dirty = false, disposed = false, lateWrites = 0;
  const changed = (before, after) => !before || !after || before.length !== after.length || before.some((item, index) => !Object.is(item, after[index]));
  const react = {
    useState(initial) {
      const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        if (disposed) { lateWrites++; return; }
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(value) { const index = cursor++; slots[index] ??= { current: value }; return slots[index]; },
    useMemo(factory, deps) { const index = cursor++; if (changed(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps }; return slots[index].value; },
    useEffect(setup, deps) {
      const index = cursor++, previous = slots[index];
      if (changed(previous?.deps, deps)) {
        const effect = { deps, setup, cleanup: previous?.cleanup, isEffect: true }; slots[index] = effect;
        pending.push(() => { effect.cleanup?.(); effect.cleanup = effect.setup(); });
      }
    },
    lazy: () => 'UnifiedMapCanvas', Suspense: 'Suspense',
  };
  return {
    react,
    render(component) {
      for (let count = 0; count < 20; count++) {
        cursor = 0; pending = []; dirty = false;
        const tree = component(); pending.forEach(effect => effect());
        if (!dirty) return tree;
      }
      throw Error('TravelMap render did not settle');
    },
    replay() {
      const effects = slots.filter(slot => slot?.isEffect);
      effects.forEach(effect => { effect.cleanup?.(); effect.cleanup = undefined; });
      effects.forEach(effect => { effect.cleanup = effect.setup(); });
    },
    dispose() { if (!disposed) { slots.forEach(slot => slot?.cleanup?.()); disposed = true; } },
    get lateWrites() { return lateWrites; },
  };
}
function fixture({ strict = false, initialIntent = intent(), consume = true } = {}) {
  const h = hooks(), window = new EventTarget(), calls = { places: [], areas: [], handled: [], gps: 0, mutations: 0, external: 0 };
  const emptySaved = { items: [], dayIds: [] }, emptyPins = { items: [] };
  let props = { ownerId: 'owner-a', destinationCountry: 'RO', nearbySearch: initialIntent }, tree;
  const record = (list, args) => { const request = { ...args, ...deferred() }; list.push(request); return request.promise; };
  const forbiddenWrite = () => { calls.mutations++; throw Error('Map entry must not persist anything'); };
  const imports = {
    react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../../../lib/travel-assistant/places': { CATEGORY_LABELS: { museum: ['Müze', 'Museum', 'Muze', 'Muzeu'] }, distanceKm: () => 0 },
    '../lib/i18n': { useI18n: () => ({ locale: 'en', copy: (_tr, en) => en }) },
    '../lib/travelAreas': { TRAVEL_CENTRES: [{ name: 'Istanbul', country: 'TR', latitude: 41.01, longitude: 28.98 }] },
    '../lib/deviceArea': { countryMapBounds: async () => null },
    '../lib/savedPlaces': { readSavedPlaces: () => emptySaved, subscribeSavedPlaces: () => () => {}, saveTravelPlace: forbiddenWrite, setTravelDayStop: forbiddenWrite },
    '../lib/personalMapPins': { readPersonalMapPins: () => emptyPins, subscribePersonalMapPins: () => () => {}, personalPinPlace: value => value, savePersonalMapPin: forbiddenWrite, updatePersonalMapPin: forbiddenWrite },
    '../lib/travelMapClient': {
      findMapPlaces: (center, category, query, signal) => record(calls.places, { center: plain(center), category, query, signal }),
      searchMapAreas: (query, center, locale, signal) => record(calls.areas, { center: plain(center), locale, query, signal }),
      getMapDirections: () => { throw Error('Map entry must not request directions'); },
    },
    '../lib/activeTripContext': { useActiveTripContext: () => null },
    '../lib/mapJourneyClient': { knownJourneyArea: () => null },
    '../lib/native': { openExternal: () => { calls.external++; throw Error('No external handoff'); } },
    './Sheet': { Sheet: 'Sheet' }, './Icon': { Icon: 'Icon' },
    './TravelMapLibrary': { TravelMapLibrary: 'TravelMapLibrary' },
    './TravelMapDownloads': { TravelMapDownloads: 'TravelMapDownloads' },
    './TravelMapEmbassies': { TravelMapEmbassies: 'TravelMapEmbassies' },
  };
  const file = new URL('../mobile/src/components/TravelMap.tsx', import.meta.url);
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const out = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
    Error, Date, URL, AbortController, window,
    navigator: { onLine: true, geolocation: { watchPosition() { calls.gps++; throw Error('No implicit location request'); }, clearWatch() {} } },
    requestAnimationFrame: callback => callback(),
  })(name => {
    if (name.endsWith('.css')) return {};
    const locale = realLocaleModule(name); if (locale) return locale;
    assert.ok(Object.hasOwn(imports, name), `Unexpected component dependency: ${name}`); return imports[name];
  }, out, out.exports);
  const handled = id => { calls.handled.push(id); if (consume && props.nearbySearch?.id === id) props = { ...props, nearbySearch: undefined }; };
  const app = {
    calls,
    render(next = {}) { props = { ...props, ...next }; tree = h.render(() => out.exports.TravelMap({ ...props, onNearbySearchHandled: handled })); return tree; },
    async flush() { for (let i = 0; i < 3; i++) { await tick(); app.render(); } },
    click(label) {
      const button = nodes(tree).find(node => node.type === 'button' && (text(node).trim() === label || node.props['aria-label'] === label));
      assert.ok(button, `Missing action: ${label}`); assert.ok(!button.props.disabled, `Disabled action: ${label}`);
      button.props.onClick(); app.render();
    },
    get query() { return nodes(tree).find(node => node.type === 'input' && node.props.type === 'search').props.value; },
    get busy() { return nodes(tree).find(node => node.type === 'form' && node.props.role === 'search').props.children.find(node => node?.type === 'button').props.disabled; },
    get map() { return nodes(tree).find(node => node.type === 'UnifiedMapCanvas'); },
    get tree() { return tree; },
    dispose: () => h.dispose(),
    get lateWrites() { return h.lateWrites; },
  };
  app.render(); if (strict) { h.replay(); app.render(); }
  return app;
}
function resolveSearch(app, index, places = [], areas = []) {
  app.calls.places[index].resolve({ places, limited: false });
  app.calls.areas[index]?.resolve(areas);
}

for (const strict of [false, true]) test(`City place handoff starts one live search with its visible query and survives effect replay (StrictMode=${strict})`, async t => {
  const app = fixture({ strict }); t.after(app.dispose); await app.flush();
  assert.deepEqual(plain(app.map.props.center), bucharest);
  assert.equal(app.calls.places.length, 1); assert.equal(app.calls.areas.length, 1);
  assert.equal(app.calls.places[0].signal.aborted, false, 'The consumed intent still owns a live request');
  assert.equal(app.query, 'Romanian Athenaeum', 'The user must see the exact place being searched');
  assert.deepEqual(app.calls.handled, [73]); assert.equal(app.busy, true);
  assert.deepEqual(app.calls.places[0].center, bucharest); assert.equal(app.calls.places[0].query, app.query);
  resolveSearch(app, 0, [point(1, 'Romanian Athenaeum')]); await app.flush();
  assert.equal(app.busy, false);
  assert.deepEqual(plain(app.map.props.places.map(place => place.name)), ['Romanian Athenaeum']);
  assert.equal(app.calls.gps + app.calls.mutations + app.calls.external, 0);
});

test('A failed city handoff exits loading and its retry retains the original city, category and query', async t => {
  const app = fixture({ strict: true }); t.after(app.dispose); await app.flush();
  app.calls.places[0].reject(new Error('network')); app.calls.areas[0].reject(new Error('network')); await app.flush();
  assert.equal(app.busy, false); assert.match(text(app.tree), /Places could not load/);
  app.click('Retry search'); assert.equal(app.busy, true);
  const retried = app.calls.places[1]; assert.ok(retried);
  assert.deepEqual(retried.center, bucharest); assert.equal(retried.category, 'museum'); assert.equal(retried.query, 'Romanian Athenaeum');
  resolveSearch(app, 1, [point(2, 'Retried Athenaeum')]); await app.flush();
  assert.equal(app.busy, false); assert.doesNotMatch(text(app.tree), /Places could not load/);
});

for (const outcome of ['success', 'failure']) test(`An old city ${outcome} cannot release the new search or replace its results`, async t => {
  const app = fixture(); t.after(app.dispose); await app.flush();
  app.render({ nearbySearch: intent(74, 'Louvre', paris, 'Paris') }); await app.flush();
  assert.equal(app.calls.places[0].signal.aborted, true);
  assert.equal(app.calls.places[1].signal.aborted, false);
  assert.equal(app.query, 'Louvre'); assert.deepEqual(plain(app.map.props.center), paris);
  if (outcome === 'success') resolveSearch(app, 0, [point(1, 'Obsolete Bucharest')]);
  else { app.calls.places[0].reject(new Error('old outage')); app.calls.areas[0].reject(new Error('old outage')); }
  await app.flush();
  assert.equal(app.busy, true); assert.equal(app.map.props.places.length, 0);
  assert.doesNotMatch(text(app.tree), /Places could not load|Obsolete Bucharest/);
  resolveSearch(app, 1, [point(2, 'Louvre', paris)]); await app.flush();
  assert.equal(app.busy, false); assert.deepEqual(plain(app.map.props.places.map(place => place.name)), ['Louvre']);
  assert.deepEqual(app.calls.handled, [73, 74]);
});

test('The same handoff id is not replayed by parent renders, but an explicit new id can repeat the query', async t => {
  const app = fixture({ consume: false, strict: true }); t.after(app.dispose); await app.flush();
  app.render({ nearbySearch: intent() }); await app.flush();
  assert.equal(app.calls.places.length, 1); assert.deepEqual(app.calls.handled, [73]);
  resolveSearch(app, 0); await app.flush();
  app.render({ nearbySearch: intent(74) }); await app.flush();
  assert.equal(app.calls.places.length, 2); assert.deepEqual(app.calls.handled, [73, 74]);
  resolveSearch(app, 1); await app.flush(); assert.equal(app.busy, false);
});

test('Leaving for Saved cancels the city request; a late provider cannot reopen the map or keep loading', async t => {
  const app = fixture(); t.after(app.dispose); await app.flush();
  app.click('Saved'); assert.equal(app.calls.places[0].signal.aborted, true); assert.equal(app.busy, false);
  resolveSearch(app, 0, [point(3, 'Late result')]); await app.flush();
  assert.ok(nodes(app.tree).some(node => node.type === 'TravelMapLibrary')); assert.equal(app.map, undefined);
  app.click('Explore'); assert.equal(app.busy, false); assert.equal(app.query, 'Romanian Athenaeum');
});

test('Unmount before queued entry starts makes no request; unmount after entry fences late provider writes', async () => {
  const abandoned = fixture(); abandoned.dispose(); await tick();
  assert.equal(abandoned.calls.places.length, 0); assert.deepEqual(abandoned.calls.handled, []); assert.equal(abandoned.lateWrites, 0);
  const pending = fixture({ strict: true }); await pending.flush(); pending.dispose();
  assert.equal(pending.calls.places[0].signal.aborted, true);
  resolveSearch(pending, 0, [point(4, 'After unmount')]); await tick(); await tick();
  assert.equal(pending.lateWrites, 0);
});

test('Ordinary map opening remains idle and does not request location or invent a nearby search', async t => {
  const app = fixture({ initialIntent: null, strict: true }); t.after(app.dispose); await app.flush();
  assert.equal(app.calls.places.length, 0); assert.equal(app.calls.areas.length, 0);
  assert.equal(app.calls.gps + app.calls.mutations + app.calls.external, 0);
  assert.equal(app.query, ''); assert.equal(app.busy, false);
});
