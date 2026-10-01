import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', resolveJsonModule: true, esModuleInterop: true } });
const zones = require('../lib/zoned-time.ts');
const budgetMath = require('../lib/country-intelligence/trip-budget.ts');
const budgets = load('mobile/src/lib/budgetCockpitIntent.ts', { '../../../lib/country-intelligence/trip-budget': budgetMath, '../../../lib/country-intelligence/city-benchmarks': require('../lib/country-intelligence/city-benchmarks.ts') });
const routeValidator = load('mobile/src/lib/routeCockpitIntent.ts', {});
const data = load('lib/cockpit/web-data.ts', { '../../mobile/src/lib/routeCockpitIntent': routeValidator, '../../mobile/src/lib/budgetCockpitIntent': budgets, '../airport-time-zones': require('../lib/airport-time-zones.ts'), '../zoned-time': zones });
const benchmark = require('../lib/country-intelligence/city-benchmarks.ts').CITY_BENCHMARKS[0];
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; return { promise: new Promise((yes, no) => { resolve = yes; reject = no; }), resolve, reject }; };
const owner = 'owner-a';
const row = (extra = {}) => ({ id: 'trip-one', user_id: owner, destination_country: 'Türkiye', destination_code: 'TR', destination_city: 'Bodrum', start_date: '2026-10-05', end_date: '2026-10-08', departure_at: null, arrival_at: null, flight_pnr: 'OLD123', status: 'upcoming', checklist_items: [{ id: 'event-one', label: 'Saved concert', kind: 'event', eventTimeZone: 'Europe/Istanbul', eventStartsAt: '2026-10-06T17:00:00Z', completed: false }], created_at: '2026-10-01T07:00:00Z', updated_at: '2026-10-01T08:00:00Z', ...extra });
const trip = () => data.webTrip(row(), owner);
const snapshot = () => ({ trip_id: 'trip-one', owner_id: owner, route_snapshot: { kind: 'saved-route', ownerId: owner, sourceRouteId: 'deleted-original-id', sourceSavedAt: '2026-09-30T12:00:00Z', routeIndex: 0, input: null, dates: { startDate: '2026-10-05', endDate: '2026-10-08' }, route: { name: 'Saved Bodrum route', country: 'Türkiye', why: 'Original saved reason', dailyPlan: ['Original harbour visit', 'Original beach day'] } }, budget_snapshot: budgets.createBudgetCockpitIntent(benchmark, 4, 3, 'TRY', { base: 'GBP', quote: 'TRY', date: '2026-10-01', rate: 61 }, owner, 'Saraybosna', Date.parse('2026-10-01T10:00:00Z')) });
function clientFixture() {
  const calls = [], pending = [];
  const client = { from(table) { const call = { table, filters: [] }; calls.push(call); const wait = deferred(); pending.push(wait);
    const query = { select(fields) { call.select = fields; return query; }, eq(key, value) { call.filters.push([key, value]); return query; }, update(value) { call.update = value; return query; }, delete() { call.delete = true; return query; }, order() { return wait.promise; }, maybeSingle() { return wait.promise; } }; return query;
  } }; return { client, calls, pending };
}
const jsx = (type, props) => ({ type, props });
function load(file, imports) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, Intl, URL, Error, process: { env: {} }, console: { error() {} } })(name => {
    if (name in imports) return imports[name];
    if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
    throw new Error(`Missing fixture ${name}`);
  }, loaded, loaded.exports); return loaded.exports;
}
function hooks() {
  const slots = []; let cursor = 0, effects = [], dirty, component, props;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((v, i) => !Object.is(v, a[i]));
  const memo = (fn, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; };
  return { react: {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const v = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(v, slots[i].value)) { slots[i].value = v; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || changed(old.deps, deps)) { slots[i] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
  }, start(fn, initial) { component = fn; props = initial; return this.render(); }, render(next) { if (next) props = { ...props, ...next }; for (let i = 0; i < 12; i++) { cursor = 0; effects = []; dirty = false; const view = component(props); effects.forEach(fn => fn()); if (!dirty) return view; } throw new Error('Unstable fixture'); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const shared = { 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' }, '@/lib/cockpit/web-data': data };

test('Web reads the same owned route/budget snapshot and renders original itinerary, benchmark and FX provenance', async () => {
  const f = clientFixture(), original = snapshot(); const wait = data.readWebJourney(f.client, trip());
  assert.deepEqual(f.calls[0].filters, [['trip_id', 'trip-one'], ['owner_id', owner]]);
  f.pending[0].resolve({ data: original, error: null }); const journey = await wait;
  assert.deepEqual(journey.route, original.route_snapshot); assert.deepEqual(journey.budget, original.budget_snapshot);
  const view = load('app/components/cockpit/CockpitJourney.tsx', { ...shared, react: {}, '@/lib/supabase-client': { supabase: f.client } }).JourneyContent({ journey, trip: trip() });
  assert.match(text(view), /Original harbour visit/); assert.match(text(view), /Original beach day/);
  assert.match(text(view), /4 gün · 3 kişi · 3 gece · 2 oda/); assert.match(text(view), /2026-05/); assert.match(text(view), /2026-10-01 · Frankfurter/);
  assert.match(text(view), /harcama kaydı veya belirlenmiş bütçe hedefi değildir/);
  assert.equal(find(view, 'a').props.href, original.budget_snapshot.sourceUrl);
  const moved = load('app/components/cockpit/CockpitJourney.tsx', { ...shared, react: {}, '@/lib/supabase-client': { supabase: f.client } }).JourneyContent({ journey, trip: { ...trip(), startDate: '2026-10-06' } });
  assert.match(text(moved), /tarihlerin değişti/);
});
test('Snapshot validation rejects another account, forged total and malformed route before display', async () => {
  for (const mutate of [value => { value.owner_id = 'owner-b'; }, value => { value.route_snapshot.ownerId = 'owner-b'; }, value => { value.budget_snapshot.estimate.total += 1; }, value => { value.route_snapshot.route.dailyPlan = [{ html: '<bad>' }]; }]) {
    const f = clientFixture(), value = snapshot(); mutate(value); const wait = data.readWebJourney(f.client, trip()); f.pending[0].resolve({ data: value }); await assert.rejects(wait, /doğrulanamadı/);
  }
});
test('Checklist and deletion use owner plus exact server revision CAS, preserving event metadata and attachments', async () => {
  const f = clientFixture(), base = trip(); const checklist = base.checklistItems.map(item => ({ ...item, completed: true }));
  const waiting = data.patchWebTrip(f.client, base, { checklist_items: checklist });
  assert.deepEqual(f.calls[0].filters, [['id', base.id], ['user_id', owner], ['updated_at', base.updatedAt]]);
  assert.deepEqual(Object.keys(f.calls[0].update), ['checklist_items']); assert.equal(f.calls[0].update.checklist_items[0].eventTimeZone, 'Europe/Istanbul');
  f.pending[0].resolve({ data: row({ updated_at: '2026-10-01T09:00:00Z', checklist_items: checklist }) }); const saved = await waiting;
  assert.equal(saved.updatedAt, '2026-10-01T09:00:00Z');
  const conflict = data.patchWebTrip(f.client, base, { checklist_items: checklist }); f.pending[1].resolve({ data: null }); await assert.rejects(conflict, data.WebTripConflict);
  const deletion = data.deleteWebTrip(f.client, base); assert.deepEqual(f.calls[2].filters, f.calls[0].filters); f.pending[2].resolve({ data: null }); await assert.rejects(deletion, data.WebTripConflict);
  assert.ok(f.calls.every(call => call.table === 'trips'), 'Trip edits never write the independent journey snapshots');
});
test('Core web trip edits share personal fields while preserving flight identity and airport-local arrival dates', () => {
  const base = trip(), values = { startDate: '2026-10-06', endDate: '2026-10-10', flightPnr: 'new123', status: 'active' };
  assert.deepEqual(JSON.parse(JSON.stringify(data.personalTripPatch(base, values))), { start_date: values.startDate, end_date: values.endDate, flight_pnr: 'NEW123', status: 'active' });
  assert.throws(() => data.personalTripPatch(base, { ...values, startDate: '2026-02-30' }));
  assert.throws(() => data.personalTripPatch({ ...base, flightLookupManaged: true }, values), /havali|havaliman/);
  const overnight = { ...base, destinationIata: 'BJV', arrivalAt: '2026-10-05T22:30:00Z' };
  assert.throws(() => data.personalTripPatch(overnight, { ...values, startDate: base.startDate, endDate: '2026-10-05' }), /varışından önce/);
  assert.equal(data.personalTripPatch(overnight, { ...values, startDate: base.startDate, endDate: '2026-10-06' }).end_date, '2026-10-06');
});
test('Editor retains draft on CAS conflict, adopts untouched remote fields, and requires explicit second save', async () => {
  const host = hooks(), writes = []; let latest = { ...trip(), endDate: '2026-10-12', status: 'active', flightPnr: 'THEIRS', updatedAt: '2026-10-01T10:00:00Z' };
  const Component = load('app/components/cockpit/CockpitTripSettings.tsx', { ...shared, react: host.react }).default;
  const props = { trip: trip(), onSave: async (base, draft) => { writes.push({ base, draft }); if (writes.length === 1) throw new data.WebTripConflict(); }, onReload: async () => latest };
  try {
    let view = host.start(Component, props); find(view, 'input', p => p.value === 'OLD123').props.onChange({ target: { value: 'MINE123' } });
    await find(host.render(), 'form').props.onSubmit({ preventDefault() {} }); view = host.render();
    assert.equal(find(view, 'button', p => p.type === 'submit').props.disabled, true); assert.equal(find(view, 'input', p => p.value === 'MINE123').props.value, 'MINE123');
    find(view, 'button', p => p.type === 'button').props.onClick(); await tick(); view = host.render();
    assert.equal(writes.length, 1); assert.equal(find(view, 'input', p => p.type === 'date' && p.value === '2026-10-12').props.value, latest.endDate);
    assert.equal(find(view, 'select').props.value, 'active');
    await find(view, 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(writes[1].base.updatedAt, latest.updatedAt); assert.equal(writes[1].draft.flightPnr, 'MINE123');
  } finally { host.dispose(); }
});
test('Web cockpit clears private trips at account switch and rejects a late previous-account list', async () => {
  const host = hooks(), f = clientFixture(), initial = deferred(); let callback;
  f.client.auth = { getSession: () => initial.promise, onAuthStateChange: fn => { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; } };
  const Component = load('app/seyahat-kokpiti/CockpitPageClient.tsx', { ...shared, react: host.react, '@/lib/zoned-time': zones, 'next/link': { default: 'Link' }, '@/app/components/cockpit/Cockpit': { default: 'Cockpit' }, '@/lib/cockpit/destinationInfo': { createDefaultChecklist: () => [] }, '@/lib/supabase-client': { supabase: f.client } }).default;
  try {
    host.start(Component); initial.resolve({ data: { session: { user: { id: owner } } } }); await tick();
    callback('SIGNED_IN', { user: { id: 'owner-b' } }); f.pending[0].resolve({ data: [row()] }); await tick();
    assert.equal(find(host.render(), 'Cockpit'), undefined);
    assert.deepEqual(f.calls[1].filters, [['user_id', 'owner-b']]); f.pending[1].resolve({ data: [row({ user_id: 'owner-b', destination_city: 'New account city' })] }); await tick();
    const cockpit = find(host.render(), 'Cockpit'); assert.equal(cockpit.props.trips[0].userId, 'owner-b');
    callback('SIGNED_OUT', null); assert.match(text(host.render()), /giriş yap/); assert.equal(find(host.render(), 'Cockpit'), undefined);
  } finally { host.dispose(); }
});
