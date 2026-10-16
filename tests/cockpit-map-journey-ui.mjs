import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, moduleTypes: { '**': 'cjs' }, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const model = require('../mobile/src/lib/mapJourney.ts');
const handoff = require('../mobile/src/lib/routeCockpitIntent.ts');
const jsx = (type, props) => ({ type, props });
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' ? node : '';
const nodes = node => node && typeof node === 'object' ? [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)] : [];
const find = (node, type) => nodes(node).find(item => item.type === type);
const button = (node, name) => nodes(node).find(item => item.type === 'button' && text(item).trim() === name);
const tick = () => new Promise(resolve => setImmediate(resolve));
function hooks() {
  const slots = []; let cursor = 0, dirty = false, effects = [], fn, props;
  return {
    react: {
      lazy: () => 'MapJourneyPlanner',
      useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
      useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
      useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
    },
    start(component, initial) { fn = component; props = initial; return this.render(); },
    render(next) { if (next) props = { ...props, ...next }; for (let attempt = 0; attempt < 15; attempt++) { cursor = 0; dirty = false; effects = []; const tree = fn(props); effects.forEach(effect => effect()); if (!dirty) return tree; } throw Error('unstable'); },
    close() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function snapshot() {
  let journey = model.createMapJourney({ city: 'Roma', center: { latitude: 41.9, longitude: 12.5 }, dayCount: 3 });
  journey = model.addJourneyStop(journey, { id: 'node/123', name: 'Shop', latitude: 41.9, longitude: 12.5, category: 'boutique',
    hours: null, description: null, free: null, accessible: null, website: null, representedCountry: null,
    sourceUrl: 'https://www.openstreetmap.org/node/123', fetchedAt: new Date().toISOString() }, 2, { fixedTime: '14:00', note: 'Keep this' });
  const route = handoff.createRouteCockpitIntent(model.mapJourneyToSavedRoute(journey), 0, 'owner-a');
  route.dates = { startDate: '2026-10-13', endDate: '2026-10-15' };
  return { tripId: 'trip-a', ownerId: 'owner-a', route, budget: null, updatedAt: new Date().toISOString() };
}
function fixture(detail = snapshot(), saveResult) {
  const host = hooks(), reads = [], saves = []; let handled = 0;
  const language = { copy: (_tr, en) => en, dateLocale: 'en-GB', locale: 'en' };
  const api = { readCockpitJourney: () => new Promise(resolve => reads.push(resolve)), saveCockpitJourney: async (...args) => { saves.push(args); return saveResult ? saveResult(...args) : { ...detail, route: args[3], updatedAt: new Date(Date.parse(detail.updatedAt)+saves.length).toISOString() }; },
    validJourneyIntent: (intent, owner) => handoff.validateRouteCockpitIntent(intent) && intent.ownerId === owner };
  const imports = { react: host.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, './Icon': { Icon: 'Icon' },
    './Sheet': { Sheet: 'Sheet' }, './LazyOverlay': { LazyOverlay: 'LazyOverlay' }, '../lib/id': { createId: () => 'new-map-copy' },
    '../lib/routeCockpitIntent': handoff, '../lib/mapJourney': model, '../lib/api': { ApiError: class ApiError extends Error {} }, '../lib/cockpitJourney': api,
    '../lib/i18n': { useI18n: () => language } };
  const file = 'mobile/src/components/CockpitJourneySection.tsx';
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Error, Date, Intl, AbortController })(name => {
    if (imports[name]) return imports[name]; if (name.endsWith('.css')) return {}; throw Error(name);
  }, loaded, loaded.exports);
  const trip = { id: 'trip-a', startDate: '2026-10-13', endDate: '2026-10-15', destinationCity: 'Roma', destinationCountry: 'Italy' };
  host.start(loaded.exports.CockpitJourneySection, { ownerId: 'owner-a', accessToken: 'token-a', trips: [trip], selectedTrip: trip,
    onSelectTrip() {}, onCreateTrip() {}, onHandled() { handled++; } });
  return { host, reads, saves, detail, handled: () => handled };
}

test('Cockpit opens the exact trip snapshot for an explicit version-checked update, retaining a separate copy option', async () => {
  const h = fixture();
  try {
    h.reads[0](h.detail); await tick();
    button(h.host.render(), 'Open on map').props.onClick();
    const tree = h.host.render(), editor = find(tree, 'MapJourneyPlanner');
    assert.ok(editor); assert.equal(editor.props.ownerId, 'owner-a'); assert.equal(editor.props.accessToken, 'token-a');
    assert.equal(editor.props.initialJourney.id, h.detail.route.route.mapJourney.id);
    assert.equal(typeof editor.props.onUpdateTrip, 'function');
    assert.deepEqual(JSON.parse(JSON.stringify(editor.props.initialJourney.stops)), h.detail.route.route.mapJourney.stops);
    assert.match(text(tree), /Update this trip/);
    const sheet = find(tree, 'Sheet');
    assert.equal(sheet.props.className, 'mj-sheet');
    assert.equal(sheet.props.children, editor, 'The map owns the flex sheet body without duplicate explanatory paragraphs squeezing its height');
    editor.props.initialJourney.stops[0].note = 'Edited copy';
    assert.equal(h.detail.route.route.mapJourney.stops[0].note, 'Keep this');
    assert.equal(h.saves.length, 0);
    find(tree, 'Sheet').props.onClose(); assert.equal(find(h.host.render(), 'MapJourneyPlanner'), undefined);
  } finally { h.host.close(); }
});

test('Account or trip changes close private map copies, while token rotation preserves the open draft', async () => {
  const h = fixture();
  try {
    h.reads[0](h.detail); await tick(); button(h.host.render(), 'Open on map').props.onClick(); h.host.render();
    const rotated = h.host.render({ accessToken: 'rotated' });
    assert.equal(find(rotated, 'MapJourneyPlanner').props.accessToken, 'rotated');
    const other = h.host.render({ ownerId: 'owner-b', accessToken: 'token-b' });
    assert.equal(find(other, 'MapJourneyPlanner'), undefined);
    h.reads[1](h.detail); await tick();
    assert.equal(find(h.host.render(), 'MapJourneyPlanner'), undefined);
    assert.doesNotMatch(text(h.host.render()), /Keep this/);
  } finally { h.host.close(); }
});

test('A structured map attachment leaves country unknown, prompts selection and keeps its nested snapshot unchanged', async () => {
  const h = fixture();
  try {
    h.reads[0](null); await tick();
    const incoming = structuredClone(h.detail.route); delete incoming.dates;
    const tree = h.host.render({ intent: incoming });
    assert.match(text(tree), /no verified country/);
    await button(tree, 'Attach to selected trip').props.onClick(); await tick();
    assert.equal(h.saves.length, 1); assert.equal(h.saves[0][3].route.country, '');
    assert.deepEqual(h.saves[0][3].route.mapJourney, incoming.route.mapJourney);
    assert.deepEqual(JSON.parse(JSON.stringify(h.saves[0][3].dates)), { startDate: '2026-10-13', endDate: '2026-10-15' });
    assert.equal(incoming.dates, undefined); assert.equal(h.handled(), 1);
  } finally { h.host.close(); }
});


test('Updating the attached map uses the same owner, trip and version; successful repeat saves use the returned version', async () => {
  const h = fixture();
  try {
    h.reads[0](h.detail); await tick(); button(h.host.render(), 'Open on map').props.onClick();
    let editor = find(h.host.render(), 'MapJourneyPlanner');
    const changed = model.updateJourneyStop(editor.props.initialJourney, editor.props.initialJourney.stops[0].id, { note: 'Changed itinerary' });
    await editor.props.onUpdateTrip(changed);
    assert.equal(h.saves.length, 1);
    assert.deepEqual(h.saves[0].slice(0, 3), ['owner-a', 'trip-a', 'token-a']);
    assert.equal(h.saves[0][4], h.detail);
    assert.equal(h.saves[0][3].route.mapJourney.id, h.detail.route.route.mapJourney.id);
    assert.equal(h.saves[0][3].route.mapJourney.stops[0].note, 'Changed itinerary');
    assert.equal(h.detail.route.route.mapJourney.stops[0].note, 'Keep this');
    assert.equal(h.saves[0][3].route.mapJourney.startDate, '2026-10-13');
    editor = find(h.host.render(), 'MapJourneyPlanner');
    await editor.props.onUpdateTrip(changed);
    assert.notEqual(h.saves[1][4].updatedAt, h.detail.updatedAt, 'A second edit compares against the successful server response');
  } finally { h.host.close(); }
});

test('Failed update preserves the open edited snapshot and never claims a changed trip', async () => {
  const h = fixture(snapshot(), async () => { throw Error('network'); });
  try {
    h.reads[0](h.detail); await tick(); button(h.host.render(), 'Open on map').props.onClick();
    const editor = find(h.host.render(), 'MapJourneyPlanner');
    const changed = model.updateJourneyStop(editor.props.initialJourney, editor.props.initialJourney.stops[0].id, { note: 'Preserved draft' });
    await assert.rejects(editor.props.onUpdateTrip(changed), /could not be updated.*edits remain/);
    assert.ok(find(h.host.render(), 'MapJourneyPlanner'));
    assert.equal(h.detail.route.route.mapJourney.stops[0].note, 'Keep this');
    await assert.rejects(find(h.host.render(), 'MapJourneyPlanner').props.onUpdateTrip(changed));
    assert.equal(h.saves[1][4], h.detail, 'A failed write never advances the optimistic version');
  } finally { h.host.close(); }
});

test('Old editor callbacks cannot write another account or trip and late success cannot expose its private data', async () => {
  let finish;
  const h = fixture(snapshot(), (...args) => new Promise(resolve => { finish = () => resolve({ ...h.detail, route: args[3] }); }));
  try {
    h.reads[0](h.detail); await tick(); button(h.host.render(), 'Open on map').props.onClick();
    const editor = find(h.host.render(), 'MapJourneyPlanner');
    const saving = editor.props.onUpdateTrip(editor.props.initialJourney);
    h.host.render({ ownerId: 'owner-b', accessToken: 'token-b' });
    finish(); await saving;
    assert.equal(find(h.host.render(), 'MapJourneyPlanner'), undefined);
    assert.doesNotMatch(text(h.host.render()), /Keep this/);
    await assert.rejects(editor.props.onUpdateTrip(editor.props.initialJourney), /trip changed/);
    assert.equal(h.saves.length, 1);
  } finally { h.host.close(); }
});

test('A pending token-refresh read cannot overwrite a newly updated trip', async () => {
  const h = fixture();
  try {
    h.reads[0](h.detail); await tick(); button(h.host.render(), 'Open on map').props.onClick();
    const editor = find(h.host.render({ accessToken: 'rotated' }), 'MapJourneyPlanner');
    const changed = model.updateJourneyStop(editor.props.initialJourney, editor.props.initialJourney.stops[0].id, { note: 'Latest edit' });
    await editor.props.onUpdateTrip(changed);
    assert.equal(h.saves[0][2], 'rotated');
    h.reads[1](h.detail); await tick();
    const tree = h.host.render(); find(tree, 'Sheet').props.onClose();
    button(h.host.render(), 'Open on map').props.onClick();
    assert.equal(find(h.host.render(), 'MapJourneyPlanner').props.initialJourney.stops[0].note, 'Latest edit');
  } finally { h.host.close(); }
});
