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
const dates = load('mobile/src/lib/dates.ts', {});
const locale = load('mobile/src/lib/locale.ts', { './locales/sq': { SQ_MESSAGES: {} } });
const countryIso = load('mobile/src/data/countryIso.ts', { './countries': { ISO_3166: require('../mobile/src/data/iso3166.json') } });
const timeImports = { '../../../lib/airport-time-zones': require('../lib/airport-time-zones.ts'), '../../../lib/zoned-time': zones, './dates': dates, './locale': locale };
const mobileForm = load('mobile/src/lib/cockpitForm.ts', timeImports);
const mobileEdit = load('mobile/src/lib/cockpitEdit.ts', { ...timeImports, './cockpitForm': mobileForm, '../data/countryIso': countryIso });
const webEdit = load('app/components/cockpit/web-edit.ts', { '../../../mobile/src/lib/cockpitEdit': mobileEdit, '../../../lib/cockpit/web-data': data });
const journeyData = load('app/components/cockpit/web-journey.ts', { '../../../mobile/src/lib/routeCockpitIntent': routeValidator, '../../../mobile/src/lib/budgetCockpitIntent': budgets, '../../../lib/cockpit/web-data': data });
const benchmark = require('../lib/country-intelligence/city-benchmarks.ts').CITY_BENCHMARKS[0];
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; return { promise: new Promise((yes, no) => { resolve = yes; reject = no; }), resolve, reject }; };
const owner = 'owner-a';
const row = (extra = {}) => ({ id: 'trip-one', user_id: owner, destination_country: 'Türkiye', destination_code: 'TR', destination_city: 'Bodrum', start_date: '2026-10-05', end_date: '2026-10-08', departure_at: null, arrival_at: null, flight_pnr: 'OLD123', status: 'upcoming', checklist_items: [{ id: 'event-one', label: 'Saved concert', kind: 'event', eventTimeZone: 'Europe/Istanbul', eventStartsAt: '2026-10-06T17:00:00Z', completed: false }], created_at: '2026-10-01T07:00:00Z', updated_at: '2026-10-01T08:00:00Z', ...extra });
const trip = () => data.webTrip(row(), owner);
const snapshot = () => ({ trip_id: 'trip-one', owner_id: owner, updated_at: '2026-10-01T10:30:00Z', route_snapshot: { kind: 'saved-route', ownerId: owner, sourceRouteId: 'deleted-original-id', sourceSavedAt: '2026-09-30T12:00:00Z', routeIndex: 0, input: null, dates: { startDate: '2026-10-05', endDate: '2026-10-08' }, route: { name: 'Saved Bodrum route', country: 'Türkiye', why: 'Original saved reason', dailyPlan: ['Original harbour visit', 'Original beach day'] } }, budget_snapshot: budgets.createBudgetCockpitIntent(benchmark, 4, 3, 'TRY', { base: 'GBP', quote: 'TRY', date: '2026-10-01', rate: 61 }, owner, 'Saraybosna', Date.parse('2026-10-01T10:00:00Z')) });
function clientFixture() {
  const calls = [], pending = [];
  const client = { from(table) { const call = { table, filters: [] }; calls.push(call); const wait = deferred(); pending.push(wait);
    const query = { select(fields) { call.select = fields; return query; }, eq(key, value) { call.filters.push([key, value]); return query; }, update(value) { call.update = value; return query; }, insert(value) { call.insert = value; return query; }, delete() { call.delete = true; return query; }, order() { return query; }, limit(value) { call.limit = value; return query; }, then(...args) { return wait.promise.then(...args); }, maybeSingle() { return wait.promise; } }; return query;
  } }; return { client, calls, pending };
}
const jsx = (type, props) => ({ type, props });
function load(file, imports, globals = {}) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, Intl, URL, Error, AbortController, setTimeout, clearTimeout, process: { env: {} }, console: { error() {} }, ...globals })(name => {
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
const shared = { 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' }, '@/lib/cockpit/web-data': data,
  './web-journey': journeyData, './CockpitAttachmentEditor': { default: 'AttachmentEditor' }, './web-edit': webEdit, '@/app/components/cockpit/web-edit': webEdit,
  '../../../mobile/src/lib/cockpitEdit': mobileEdit, '../../../mobile/src/lib/cockpitForm': mobileForm,
  '../../../mobile/src/data/iso3166.json': { default: require('../mobile/src/data/iso3166.json') }, './CockpitAirportField': { default: 'AirportField' } };

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
    assert.equal(find(view, 'select', p => p.value === 'active').props.value, 'active');
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

const signedIn = (f, userId = owner) => { f.client.auth = { getSession: async () => ({ data: { session: { user: { id: userId } } } }) }; return f; };
const plain = value => JSON.parse(JSON.stringify(value));
const manualFlight = () => data.webTrip(row({ origin_iata: 'IST', destination_iata: 'BJV', airline: 'Turkish Airlines', flight_number: 'TK2500', departure_at: '2026-10-05T08:00:00Z', arrival_at: '2026-10-05T09:20:00Z' }), owner);

test('Saved route selector reads owned cloud plans and retains the chosen alternative with its original input', async () => {
  const route = snapshot().route_snapshot.route;
  const saved = { id: 21, user_id: owner, created_at: '2026-10-01T09:00:00Z', trip_data: { mobile_kind: 'route_plan', client_key: 'mobile-route-21', saved_at: '2026-09-30T12:00:00Z', input: { origin: 'İstanbul', days: '4', vibe: ['Beach'] }, plan: { routes: [route, { ...route, name: 'Second alternative' }] } } };
  const f = signedIn(clientFixture()), reading = journeyData.readWebSavedRoutes(f.client, owner); await tick();
  assert.deepEqual(f.calls[0].filters, [['user_id', owner], ['trip_data->>mobile_kind', 'route_plan']]);
  f.pending[0].resolve({ data: [saved, { ...saved, user_id: 'owner-b' }, { ...saved, trip_data: { ...saved.trip_data, plan: { routes: [{ name: 'Broken route' }] } } }] });
  const choices = await reading;
  assert.equal(choices.length, 2); assert.equal(choices[1].intent.route.name, 'Second alternative');
  assert.equal(choices[1].intent.sourceRouteId, 'mobile-route-21'); assert.equal(choices[1].intent.routeIndex, 1);
  assert.deepEqual(plain(choices[1].intent.input), saved.trip_data.input);
  const scoped = journeyData.attachmentForTrip(choices[1].intent, trip());
  assert.deepEqual(plain(scoped.dates), { startDate: trip().startDate, endDate: trip().endDate });
  assert.equal(choices[1].intent.dates, undefined, 'Attaching never rewrites the source route');
  assert.throws(() => journeyData.attachmentForTrip(choices[1].intent, { ...trip(), endDate: trip().startDate }), /daha uzun/);
  assert.throws(() => journeyData.attachmentForTrip({ ...choices[1].intent, ownerId: 'owner-b' }, trip()), /hesap/);
});

test('Journey writes use exact independent revision CAS and patch only the selected attachment', async () => {
  const f = signedIn(clientFixture()), original = snapshot(), previous = data.parseWebJourney(original, trip());
  const intent = { ...original.route_snapshot, route: { ...original.route_snapshot.route, name: 'New route' } };
  const waiting = journeyData.saveWebJourney(f.client, trip(), intent, previous); await tick();
  assert.equal(f.calls[0].table, 'trip_journey_details');
  assert.deepEqual(f.calls[0].filters, [['trip_id', trip().id], ['owner_id', owner], ['updated_at', original.updated_at]]);
  assert.deepEqual(Object.keys(f.calls[0].update), ['route_snapshot']);
  f.pending[0].resolve({ data: { ...original, route_snapshot: intent, updated_at: '2026-10-01T11:00:00Z' } });
  const result = await waiting; assert.deepEqual(result.budget, original.budget_snapshot); assert.equal(result.updatedAt, '2026-10-01T11:00:00Z');
  const budgetSave = journeyData.saveWebJourney(f.client, trip(), original.budget_snapshot, result); await tick();
  assert.deepEqual(Object.keys(f.calls[1].update), ['budget_snapshot']);
  f.pending[1].resolve({ data: null }); await assert.rejects(budgetSave, data.WebTripConflict);
  assert.ok(f.calls.every(call => call.table !== 'trips'), 'No checklist, event or flight fields are rewritten');
});

test('First attachment insertion and server date/serialization conflicts require reloading without overwriting', async () => {
  for (const code of ['23505', '40001', '40P01']) {
    const f = signedIn(clientFixture()), original = snapshot();
    const saving = journeyData.saveWebJourney(f.client, trip(), original.route_snapshot, null); await tick();
    assert.equal(f.calls[0].insert.owner_id, owner); assert.equal(f.calls[0].insert.trip_id, trip().id);
    assert.equal(f.calls[0].insert.budget_snapshot, undefined);
    f.pending[0].resolve({ error: { code } }); await assert.rejects(saving, data.WebTripConflict);
  }
  const f = signedIn(clientFixture(), 'other-account');
  await assert.rejects(journeyData.saveWebJourney(f.client, trip(), snapshot().route_snapshot, null), /Hesabın değişti/);
  assert.equal(f.calls.length, 0, 'Account switch is checked before the write');
});

test('Detailed manual flight editor shares airport-local date/time validation and keeps unrelated fields out of the patch', async () => {
  const base = manualFlight(), form = webEdit.webEditForm(base);
  assert.equal(form.departureTime, '11:00'); assert.equal(form.arrivalTime, '12:20'); assert.equal(form.flightNumber, 'TK2500');
  const changed = { ...form, departureTime: '22:45', arrivalDate: '2026-10-06', arrivalTime: '00:05', flightNumber: 'TK2501', airline: 'Updated airline', departureUtc: undefined, arrivalUtc: undefined, status: 'active' };
  const patch = webEdit.detailedTripPatch(base, webEdit.webEditUpdate(changed));
  assert.equal(patch.departure_at, '2026-10-05T19:45:00.000Z'); assert.equal(patch.arrival_at, '2026-10-05T21:05:00.000Z');
  assert.equal(patch.flight_number, 'TK2501'); assert.equal(patch.airline, 'Updated airline'); assert.equal(patch.status, 'active');
  for (const key of ['checklist_items', 'flight_lookup_managed', 'route_snapshot', 'budget_snapshot']) assert.equal(key in patch, false);
  const f = clientFixture(), saving = data.patchWebTrip(f.client, base, patch);
  assert.deepEqual(f.calls[0].filters, [['id', base.id], ['user_id', owner], ['updated_at', base.updatedAt]]);
  f.pending[0].resolve({ data: row({ ...patch, updated_at: '2026-10-02T00:00:00Z' }) }); const updated = await saving;
  assert.equal(updated.checklistItems[0].eventStartsAt, base.checklistItems[0].eventStartsAt);
  assert.throws(() => webEdit.detailedTripPatch(base, webEdit.webEditUpdate({ ...changed, endDate: '2026-10-05' })), /varış tarihi/);
  assert.throws(() => webEdit.detailedTripPatch(base, webEdit.webEditUpdate({ ...changed, arrivalDate: '2026-10-05', arrivalTime: '12:00' })), /kalkıştan sonra/);
  assert.throws(() => webEdit.detailedTripPatch(base, webEdit.webEditUpdate({ ...changed, originAirport: { ...form.originAirport, iata: 'XYZ', timeZone: '' } })), /saat dilimi/);
});

test('Manual flight DST overlap needs an explicit choice, nonexistent time is rejected, and provider fields stay protected', () => {
  const base = manualFlight(), form = webEdit.webEditForm(base);
  const dst = { ...form, startDate: '2026-10-25', endDate: '2026-10-27', originAirport: { ...form.originAirport, iata: 'LHR', timeZone: 'Europe/London' }, departureTime: '01:30', arrivalDate: '2026-10-25', arrivalTime: '09:00', departureUtc: undefined, arrivalUtc: undefined };
  assert.throws(() => webEdit.detailedTripPatch(base, webEdit.webEditUpdate(dst)), /iki kez/);
  const ambiguity = mobileForm.flightTimes(dst).departure;
  assert.equal(ambiguity.reason, 'ambiguous');
  const patch = webEdit.detailedTripPatch(base, webEdit.webEditUpdate({ ...dst, departureUtc: ambiguity.candidates[1] }));
  assert.equal(patch.departure_at, ambiguity.candidates[1]);
  assert.throws(() => webEdit.detailedTripPatch(base, webEdit.webEditUpdate({ ...dst, startDate: '2026-03-29', departureUtc: undefined })), /mevcut değil/);
  const protectedPatch = webEdit.detailedTripPatch({ ...base, flightLookupManaged: true }, { startDate: base.startDate, endDate: base.endDate, flightPnr: 'NEW123', status: 'active', details: { ...form, originAirport: { ...form.originAirport, iata: 'LHR' }, flightNumber: 'FORGED' } });
  assert.deepEqual(Object.keys(protectedPatch).sort(), ['end_date', 'flight_pnr', 'start_date', 'status']);
});

test('Journey UI blocks double submit, retains the selection during conflict and only saves after refresh and explicit confirmation', async () => {
  const host = hooks(), reads = [], writes = [], original = snapshot(); let refreshes = 0;
  const Component = load('app/components/cockpit/CockpitJourney.tsx', { ...shared, react: host.react, '@/lib/supabase-client': { supabase: {} },
    '@/lib/cockpit/web-data': { ...data, readWebJourney: () => { const d = deferred(); reads.push(d); return d.promise; } },
    './web-journey': { ...journeyData, saveWebJourney: (...args) => { const d = deferred(); writes.push({ args, ...d }); return d.promise; } },
  }).default;
  try {
    host.start(Component, { trip: trip(), onReloadTrip: async () => { refreshes++; return trip(); } });
    reads[0].resolve(data.parseWebJourney(original, trip())); await tick();
    let view = host.render(), editor = find(view, 'AttachmentEditor');
    const intent = original.route_snapshot, save = editor.props.onAttach(intent); editor.props.onAttach(intent);
    assert.equal(writes.length, 1); assert.equal(find(host.render(), 'AttachmentEditor').props.disabled, true);
    writes[0].reject(new data.WebTripConflict()); await save; view = host.render();
    assert.equal(find(view, 'AttachmentEditor').props.disabled, true); assert.match(text(view), /başka bir cihazda/);
    find(view, 'button', p => text(p.children).includes('Güncel kaydı')).props.onClick(); await tick(); host.render();
    assert.equal(refreshes, 1); assert.equal(writes.length, 1);
    const latest = { ...original, updated_at: '2026-10-02T11:00:00Z' }; reads[1].resolve(data.parseWebJourney(latest, trip())); await tick();
    editor = find(host.render(), 'AttachmentEditor'); assert.equal(editor.props.disabled, false);
    const retry = editor.props.onAttach(intent); assert.equal(writes[1].args[3].updatedAt, latest.updated_at);
    writes[1].resolve(data.parseWebJourney(latest, trip())); await retry;
    assert.match(text(host.render()), /Seyahatine eklendi/);
  } finally { host.dispose(); }
});

test('Budget editor uses the current account, supports counts/currency and blocks stale or failed FX rather than fabricating a rate', async () => {
  const host = hooks(), requests = [], writes = [];
  const Component = load('app/components/cockpit/CockpitAttachmentEditor.tsx', { ...shared, react: host.react, 'next/link': { default: 'Link' }, '@/lib/supabase-client': { supabase: {} },
    '../../../lib/country-intelligence/city-benchmarks': require('../lib/country-intelligence/city-benchmarks.ts'), '../../../lib/country-intelligence/trip-budget': budgetMath,
    '../../../mobile/src/lib/budgetCockpitIntent': budgets, './web-journey': { ...journeyData, readWebSavedRoutes: async () => [] },
  }, { fetch: (url, init) => { const d = deferred(); requests.push({ url, init, ...d }); return d.promise; } }).default;
  try {
    let view = host.start(Component, { trip: { ...trip(), destinationCode: benchmark.code, destinationCity: benchmark.city.tr }, journey: null, disabled: false, onAttach: async value => writes.push(value) }); await tick();
    find(view, 'button', p => text(p.children) === 'Bütçe tahmini').props.onClick(); view = host.render();
    assert.match(requests[0].url, /base=GBP&quote=TRY/);
    find(view, 'select', p => p.value === 'TRY').props.onChange({ target: { value: 'EUR' } }); view = host.render();
    assert.equal(requests[0].init.signal.aborted, true);
    requests[0].resolve({ ok: true, json: async () => ({ base: 'GBP', quote: 'TRY', rate: 999, date: '2026-10-04' }) });
    requests[1].resolve({ ok: false }); await tick(); view = host.render();
    assert.match(text(view), /Güncel kur alınamadı/); assert.equal(find(view, 'button', p => p.type === 'submit').props.disabled, true);
    find(view, 'select', p => p.value === 'EUR').props.onChange({ target: { value: 'GBP' } }); view = host.render();
    find(view, 'input', p => p.max === 30).props.onChange({ target: { value: '3' } }); find(view, 'input', p => p.max === 20).props.onChange({ target: { value: '4' } }); view = host.render();
    assert.equal(find(view, 'button', p => p.type === 'submit').props.disabled, false);
    find(view, 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(writes[0].ownerId, owner); assert.equal(writes[0].estimate.days, 3); assert.equal(writes[0].estimate.people, 4);
    assert.equal(writes[0].exchangeRate, null); assert.equal(writes[0].displayCurrency, 'GBP'); assert.equal(budgets.validateBudgetCockpitIntent(writes[0]), true);
  } finally { host.dispose(); }
});

test('Budget preselection matches the actual city and country, never the first city in its country', () => {
  const rows = require('../lib/country-intelligence/city-benchmarks.ts').CITY_BENCHMARKS;
  for (const [country, city, expected] of [['FR', 'Paris', 'FR-paris'], ['GB', 'Londra', 'GB-london'], ['AT', 'Vienna', 'AT-vienna'], ['IT', ' Roma ', 'IT-rome']]) {
    assert.equal(journeyData.initialBudgetCityId({ destinationCode: country, destinationCity: city }, rows), expected);
  }
  for (const [country, city] of [['FR', 'Bordeaux'], ['FR', ''], ['FR', null], ['AU', 'Roma'], ['', 'Paris']]) {
    assert.equal(journeyData.initialBudgetCityId({ destinationCode: country, destinationCity: city }, rows), '');
  }
});

test('Legacy flights keep personal edits usable without inventing missing airport or arrival details', () => {
  const legacy = { ...trip(), departureAt: '2026-10-05T08:00:00Z' }, baseline = webEdit.webEditForm(legacy);
  const draft = { ...baseline, flightPnr: 'NEW123', status: 'active', endDate: '2026-10-10' };
  assert.equal(webEdit.webTripDetailsChanged(legacy, draft), false);
  assert.deepEqual(plain(webEdit.detailedTripPatch(legacy, webEdit.webEditUpdate(draft))), {
    start_date: legacy.startDate, end_date: '2026-10-10', flight_pnr: 'NEW123', status: 'active',
  });
  assert.equal(webEdit.webTripDetailsChanged(legacy, { ...draft, departureTime: '12:00' }), true);
  assert.throws(() => webEdit.detailedTripPatch(legacy, webEdit.webEditUpdate({ ...draft, departureTime: '12:00' })), /havalimanı/);
  assert.throws(() => webEdit.detailedTripPatch(legacy, webEdit.webEditUpdate({ ...draft, mode: 'other' })), /uçuş türü/);
  assert.throws(() => webEdit.detailedTripPatch(legacy, webEdit.webEditUpdate({ ...draft, endDate: '2026-10-01' })), /tarihlerini/);
});

test('Legacy flight settings do not let required blank flight inputs block a PNR-only save', async () => {
  const host = hooks(), writes = [], legacy = { ...trip(), departureAt: '2026-10-05T08:00:00Z' };
  const Component = load('app/components/cockpit/CockpitTripSettings.tsx', { ...shared, react: host.react }).default;
  try {
    let view = host.start(Component, { trip: legacy, onSave: async (_trip, update) => writes.push(update), onReload: async () => ({ ...legacy, flightPnr: 'NEW123' }) });
    assert.ok(nodes(view).filter(node => node.type === 'input' && node.props.value === '').every(node => !node.props.required));
    find(view, 'input', p => p.value === 'OLD123').props.onChange({ target: { value: 'NEW123' } });
    await find(host.render(), 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(writes.length, 1); assert.equal(writes[0].flightPnr, 'NEW123');
    view = host.render(); find(view, 'input', p => p.type === 'time').props.onChange({ target: { value: '12:00' } });
    view = host.render(); assert.ok(nodes(view).filter(node => node.type === 'input' && node.props.type === 'time').every(node => node.props.required));
    await find(view, 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(writes.length, 1, 'Changing flight data still requires the missing airport and arrival fields');
  } finally { host.dispose(); }
});
