import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', resolveJsonModule: true, esModuleInterop: true } });
const zones = require('../lib/zoned-time.ts');
const airportZones = require('../lib/airport-time-zones.ts');
let now = Date.parse('2026-09-27T08:00:00Z');
class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: 'fragment' };
function load(path, imports, extra = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date: ClockDate, Intl, AbortController, setTimeout, clearTimeout, document: { addEventListener() {}, removeEventListener() {} }, ...extra })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === '../lib/localeFormatting') return load('mobile/src/lib/localeFormatting.ts', {}, extra);
    if (name === './locales/sq-regions') return load('mobile/src/lib/locales/sq-regions.ts', {}, extra);
    if (name === './locale' || name === '../lib/locale') return { translateCopy: (locale, tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' && sq ? sq : en, DATE_LOCALES: { tr: 'tr-TR', en: 'en-GB', sq: 'sq-AL' } };
    if (name.endsWith('.css')) return {};
    throw Error(`Unstubbed test import: ${name}`);
  }, testModule, testModule.exports);
  return testModule.exports;
}

// Execute the real component and its event closures. Only React hooks/effects and
// external services are controlled, without copying component state transitions.
function hookHost() {
  const slots = [];
  let cursor = 0, dirty = false, component, props, view, effects = [];
  const changed = (left, right) => !left || !right || left.length !== right.length || right.some((value, i) => !Object.is(value, left[i]));
  const useEffect = (effect, deps) => {
    const i = cursor++, old = slots[i];
    if (changed(old?.deps, deps)) { slots[i] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); }
  };
  const memoHook = (factory, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: factory(), deps }; return slots[i].value; };
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(slots[i].value, value)) { slots[i].value = value; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
    useMemo: memoHook, useCallback: (fn, deps) => memoHook(() => fn, deps), useEffect, useLayoutEffect: useEffect,
  };
  return {
    react,
    start(fn, initial) { component = fn; props = initial; return this.render(); },
    render(next) { if (next) props = { ...props, ...next }; for (let pass = 0; pass < 15; pass++) { cursor = 0; dirty = false; effects = []; view = component(props); effects.forEach(fn => fn()); if (!dirty) return view; } throw Error('Test render did not settle'); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function nodes(value) {
  if (!value || typeof value !== 'object') return [];
  return [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value?.props ? text(value.props.children) : '';
}
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const button = (tree, label) => find(tree, 'button', props => text(props.children).trim() === label);
const results = tree => nodes(tree).filter(node => node.props?.className === 'flight-lookup-result');
const i18n = {
  en: { copy: (tr, en) => en, locale: 'en', dateLocale: 'en-GB', countryName: (_, fallback) => fallback },
  tr: { copy: tr => tr, locale: 'tr', dateLocale: 'tr-TR', countryName: (_, fallback) => fallback },
};
const airport = (iata, city, countryCode, timeZone) => ({ iata, name: `${city} Airport`, city, country: countryCode === 'TR' ? 'Türkiye' : countryCode === 'GB' ? 'United Kingdom' : 'United States', countryCode, timeZone });
function flight() {
  return { id: 'TK1985:IST:LHR:2026-09-28T19:00:00.000Z', flightNumber: 'TK1985', airline: 'Turkish Airlines', source: 'AeroDataBox', fetchedAt: new ClockDate().toISOString(), expiresAt: new ClockDate(now + 5 * 86400000).toISOString(), receipt: 'TEST_RECEIPT', maySave: true,
    origin: airport('IST', 'Istanbul', 'TR', 'Europe/Istanbul'), destination: airport('LHR', 'London', 'GB', 'Europe/London'),
    departureAt: '2026-09-28T19:00:00.000Z', arrivalAt: '2026-09-28T23:30:00.000Z', departureDate: '2026-09-28', departureTime: '22:00', arrivalDate: '2026-09-29', arrivalTime: '00:30' };
}
const dates = load('mobile/src/lib/dates.ts', {});
const cockpitForm = load('mobile/src/lib/cockpitForm.ts', { './dates': dates, '../../../lib/airport-time-zones': airportZones, '../../../lib/zoned-time': zones });
const countryData = load('mobile/src/data/countries.ts', { './iso3166.json': { default: JSON.parse(readFileSync('mobile/src/data/iso3166.json', 'utf8')) } });
const countryIso = load('mobile/src/data/countryIso.ts', { './countries': countryData });
const journeyCountries = load('mobile/src/lib/journeyCountry.ts', {
  '../data/airportPicks': load('mobile/src/data/airportPicks.ts', {}), '../data/countries': countryData,
  '../data/countryIso': countryIso, './locales/sq-regions': load('mobile/src/lib/locales/sq-regions.ts', {}),
});
const progress = load('lib/flight-progress.ts', {});
const flightSelection = load('mobile/src/lib/flightSelection.ts', { '../../../lib/zoned-time': zones, '../../../lib/flight-progress': progress });
function lookupHarness() {
  const host = hookHost(), calls = [], selections = [];
  let locale = 'en', manual = 0;
  const testModule = load('mobile/src/components/CockpitFlightLookup.tsx', {
    react: host.react, 'react/jsx-runtime': jsxRuntime,
    '../lib/flightSelection': flightSelection, '../lib/config': { config: { apiBaseUrl: 'https://test.invalid' } },
    '../lib/i18n': { useI18n: () => i18n[locale] }, '../lib/dates': dates, '../lib/cockpitForm': cockpitForm,
    './CockpitFlightDetails': { CockpitFlightDetails: 'CockpitFlightDetails' }, './DateTimeField': { DateTimeField: 'DateTimeField' }, './Icon': { Icon: 'Icon' },
  }, { fetch: (url, options = {}) => { const wait = deferred(); calls.push({ url, options, ...wait }); return wait.promise; } });
  host.start(testModule.CockpitFlightLookup, { accessToken: 'UNIT_TEST_SESSION_A', flightNumber: 'TK1985', date: '2026-09-28', onQueryChange: () => {}, onSelect: value => selections.push(value), onManual: () => manual++ });
  return { host, calls, selections, manual: () => manual, language: next => { locale = next; }, async enable(value = true, mode = 'commercial') { calls[0].resolve({ ok: true, json: async () => ({ available: value, protocol: 3, mode }) }); await tick(); return host.render(); } };
}

test('Flight lookup blocks duplicate clicks and offers overnight results only after explicit selection', async () => {
  const h = lookupHarness();
  try {
    const view = await h.enable(); const search = button(view, 'Find flight details');
    search.props.onClick(); search.props.onClick();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].options.headers.Authorization, 'Bearer UNIT_TEST_SESSION_A');
    assert.equal(h.calls[0].options.headers.Authorization, 'Bearer UNIT_TEST_SESSION_A');
    assert.equal(h.calls[0].options.headers['X-Flight-Lookup-Version'], '3');
    assert.equal(h.calls[1].options.headers['X-Flight-Lookup-Version'], '3');
    assert.deepEqual(JSON.parse(h.calls[1].options.body), { flightNumber: 'TK1985', date: '2026-09-28' });
    h.calls[1].resolve({ ok: true, json: async () => ({ protocol: 3, flights: [flight()], reason: null }) }); await tick();
    assert.equal(h.selections.length, 0);
    assert.equal(results(h.host.render()).length, 1);
    results(h.host.render())[0].props.onClick();
    assert.equal(h.selections[0].arrivalDate, '2026-09-29');
    assert.equal(results(h.host.render()).length, 0);
  } finally { h.host.dispose(); }
});

test('Query, session and language changes invalidate delayed flight lookup responses', async () => {
  for (const change of [{ flightNumber: 'TK1986' }, { date: '2026-09-29' }, { accessToken: 'UNIT_TEST_SESSION_B' }, 'language']) {
    const h = lookupHarness();
    try {
      button(await h.enable(), 'Find flight details').props.onClick();
      if (change === 'language') { h.language('tr'); h.host.render(); } else h.host.render(change);
      assert.equal(h.calls[1].options.signal.aborted, true);
      h.calls[1].resolve({ ok: true, json: async () => ({ protocol: 3, flights: [flight()], reason: null }) }); await tick();
      assert.equal(results(h.host.render()).length, 0);
      assert.equal(h.selections.length, 0);
    } finally { h.host.dispose(); }
  }
});

test('Unavailable lookup and canceled searches leave the manual path usable', async () => {
  const h = lookupHarness();
  try {
    assert.equal(button(await h.enable(false), 'Find flight details'), undefined);
    button(h.host.render(), "I'll enter the details myself").props.onClick(); assert.equal(h.manual(), 1);
  } finally { h.host.dispose(); }
  const active = lookupHarness();
  try {
    button(await active.enable(), 'Find flight details').props.onClick();
    button(active.host.render(), "I'll enter the details myself").props.onClick();
    assert.equal(active.calls[1].options.signal.aborted, true);
    active.calls[1].resolve({ ok: true, json: async () => ({ protocol: 3, flights: [flight()], reason: null }) }); await tick();
    assert.equal(results(active.host.render()).length, 0);
    assert.equal(active.manual(), 1);
  } finally { active.host.dispose(); }
});

test('Malformed and mismatched flight responses never render selectable routes', async () => {
  for (const item of [null, {}, { ...flight(), origin: null }, { ...flight(), flightNumber: 'TK9999' }, { ...flight(), arrivalTime: '21:00' }, { ...flight(), fetchedAt: 'invalid' }, { ...flight(), receipt: null }, { ...flight(), maySave: false }, { ...flight(), expiresAt: new ClockDate(now - 1).toISOString() }, { ...flight(), expiresAt: new ClockDate(now + 8 * 86400000).toISOString() }]) {
    const h = lookupHarness();
    try {
      button(await h.enable(), 'Find flight details').props.onClick();
      h.calls[1].resolve({ ok: true, json: async () => ({ protocol: 3, flights: [item], reason: null }) }); await tick();
      assert.equal(results(h.host.render()).length, 0);
      assert.ok(button(h.host.render(), "I'll enter the details myself"));
    } finally { h.host.dispose(); }
  }
});

function cockpitHarness(initialTrips = [], missingAirportZone = "") {
  const host = hookHost(), creates = [], updates = [], deletes = [], notices = [], reminders = [], loadArgs = [], timers = [], refreshes = [];
  let interval;
  let id = 0, timerId = 0;
  const jobs = new Map(), events = new Map();
  const on = (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); };
  const off = (name, fn) => events.get(name)?.delete(fn);
  const fire = name => [...(events.get(name) || [])].forEach(fn => fn());
  const document = { visibilityState: 'visible', addEventListener: on, removeEventListener: off, getElementById: () => null };
  const navigator = { onLine: true };
  const testModule = load('mobile/src/screens/CockpitScreen.tsx', {
    react: host.react, 'react/jsx-runtime': jsxRuntime, '../../../lib/event-time': {},
    '../components/AirportField': { AirportField: 'AirportField' }, '../components/CountryPicker': { CountryPicker: 'CountryPicker' },
    '../components/DateTimeField': { DateTimeField: 'DateTimeField' }, '../components/Icon': { Icon: 'Icon' },
    '../components/CockpitTripEditor': { CockpitTripEditor: 'CockpitTripEditor' }, '../components/Sheet': { Sheet: 'Sheet' }, '../lib/journeyCountry': journeyCountries,
    '../components/CockpitJourneySection': { CockpitJourneySection: 'CockpitJourneySection' }, '../lib/cockpitJourney': { validJourneyIntent: (intent, owner) => intent?.ownerId === owner },
    '../components/PersonalTravelCards': { PersonalTravelCards: 'PersonalTravelCards' }, '../components/CockpitTicketImport': { CockpitTicketImport: 'CockpitTicketImport' }, '../components/CockpitFlightDetails': { CockpitFlightDetails: 'CockpitFlightDetails' }, '../components/PageHero': { PageHero: 'PageHero' }, '../components/CockpitFlightLookup': { CockpitFlightLookup: 'CockpitFlightLookup' },
    '../data/countries': countryData,
    '../data/countryIso': countryIso,
    '../lib/airports': { searchAirports: async query => [flight().origin, flight().destination].filter(a => a.iata === query) }, '../../../lib/flight-progress': progress, '../lib/flightSelection': flightSelection, '../../../lib/airport-time-zones': { ...airportZones, airportTimeZone: (iata, fallback) => iata === missingAirportZone ? fallback : airportZones.airportTimeZone(iata, fallback) }, '../../../lib/zoned-time': zones, '../lib/dates': dates, '../lib/cockpitForm': cockpitForm,
    '../lib/liveActivity': { PROVIDER_ACTIVITY_MIN_RETENTION_MS: 13 * 3600000, syncFlightReminders: async trips => { reminders.push(trips); }, endAllFlightActivities: async () => {} },
    '../lib/id': { createId: () => `test-item-${++id}` }, '../lib/i18n': { useI18n: () => i18n.en }, '../lib/native': { openExternal: async () => true },
    '../lib/supabaseData': { refreshCockpitFlight: (user, tripId, token, signal) => { const wait = deferred(); refreshes.push({ user, tripId, token, signal, ...wait }); return wait.promise; }, listCockpitTrips: async (...args) => { loadArgs.push(args); return initialTrips; }, areFlightFieldsSupported: () => true, getSupabaseDataErrorMessage: (_, fallback) => fallback,
      deleteCockpitTrip: (user, tripId, token, version) => { const wait = deferred(); deletes.push({ user, tripId, token, version, ...wait }); return wait.promise; },
      updateCockpitTrip: (user, tripId, payload, token, version) => { const wait = deferred(); updates.push({ user, tripId, payload, token, version, ...wait }); return wait.promise; },
      updateCockpitChecklist: (user, trip, checklistItems, token) => { const wait = deferred(); updates.push({ user, tripId: trip.id, payload: { checklistItems }, token, version: trip.updatedAt, ...wait }); return wait.promise; },
      createCockpitTrip: (user, payload, token) => { const wait = deferred(); creates.push({ user, payload, token, ...wait }); return wait.promise; } },
  }, { navigator, setTimeout: (fn, delay) => { timers.push(delay); jobs.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: key => jobs.delete(key), window: { addEventListener: on, removeEventListener: off, setInterval: fn => { interval = fn; return 1; }, clearInterval: () => {}, requestAnimationFrame: fn => fn(), confirm: () => { throw new Error('Native popup unavailable'); } }, document });
  host.start(testModule.CockpitScreen, { user: { id: 'test-user-a' }, accessToken: 'UNIT_TEST_SESSION_A', onOpenAccount: () => {}, onNotice: value => notices.push(value) });
  return { host, creates, updates, deletes, notices, reminders, loadArgs, timers, refreshes, jobs, runTimer(delay) { const job = [...jobs].find(([, job]) => job.delay === delay); assert.ok(job, `No timer for ${delay}`); jobs.delete(job[0]); job[1].fn(); }, visibility(value) { document.visibilityState = value; fire('visibilitychange'); }, online(value) { navigator.onLine = value; fire(value ? 'online' : 'offline'); }, advance(milliseconds) { now += milliseconds; interval?.(); fire('visibilitychange'); return host.render(); }, async open() { await tick(); button(host.render(), 'Add trip').props.onClick(); return host.render(); } };
}
const lookup = tree => find(tree, 'CockpitFlightLookup');
const tripForm = tree => find(tree, 'form', props => props.id === 'cockpit-trip-form');
const dateField = (tree, label) => find(tree, 'DateTimeField', props => props.label === label);

test('Route country import treats IATA separately and accepts only matching destination metadata or exact country names', () => {
  const route = (destinationCode, country = 'Unknown', input = null) => ({ kind: 'saved-route', ownerId: 'test-user-a', route: { name: 'A beautiful coast', cityOrRegion: 'Bodrum', destinationCode, country }, input });
  const fixed = { mode: 'fixed', destination: { code: 'BJV', name: 'Bodrum', country: 'Türkiye', countryCode: 'TR' } };
  assert.equal(journeyCountries.journeyCountry(route('BJV', 'Unknown', fixed)).alpha3, 'TUR');
  assert.equal(journeyCountries.journeyCountry(route('', 'Unknown', fixed)).alpha3, 'TUR');
  assert.equal(journeyCountries.journeyCountry(route('FCO', 'Unknown', fixed)).alpha3, 'ITA');
  assert.equal(journeyCountries.journeyCountry(route('CAN')), null, 'IATA CAN must not silently become Canada');
  assert.equal(journeyCountries.journeyCountry(route('BJV')), null, 'Unknown country requires selection rather than guessing from an unbundled IATA code');
  for (const name of ['Türkiye', 'Turkey', 'Turqi']) assert.equal(journeyCountries.journeyCountry(route('BJV', name)).alpha3, 'TUR');
  assert.equal(journeyCountries.journeyCountry(route('ZZZ', 'Shqipëri')).alpha3, 'ALB');
  assert.equal(journeyCountries.journeyCountry(route('ZZZ', 'North Turkey coast')), null);
  assert.equal(journeyCountries.journeyCountry({ kind: 'city-budget', countryCode: 'BA' }).alpha3, 'BIH');
});

test('A fixed Bodrum route prefills Turkey and dates; an unresolved country stays user-selectable', async () => {
  const h = cockpitHarness();
  const intent = { kind: 'saved-route', ownerId: 'test-user-a', route: { name: 'A beautiful coast', cityOrRegion: 'Bodrum', destinationCode: 'BJV', country: 'Unknown' }, input: { mode: 'fixed', destination: { code: 'BJV', name: 'Bodrum', countryCode: 'TR' } }, dates: { startDate: '2026-10-08', endDate: '2026-10-11' } };
  try {
    await tick();
    find(h.host.render(), 'CockpitJourneySection').props.onCreateTrip(intent);
    let view = h.host.render();
    assert.equal(find(view, 'CountryPicker').props.value, 'TUR');
    assert.equal(dateField(view, 'Start').props.value, '2026-10-08');
    find(view, 'CockpitJourneySection').props.onCreateTrip({ ...intent, input: null });
    view = h.host.render(); assert.equal(find(view, 'CountryPicker').props.value, '');
    find(view, 'CountryPicker').props.onChange('ITA');
    assert.equal(find(h.host.render(), 'CountryPicker').props.value, 'ITA');
  } finally { h.host.dispose(); }
});

test('Trip deletion uses explicit in-app confirmation and submits only once without a native popup', async () => {
  const base = managedTrip(), h = cockpitHarness([base]);
  const open = () => find(h.host.render(), 'button', props => props['aria-label'] === 'Delete trip').props.onClick();
  const sheet = () => find(h.host.render(), 'Sheet', props => props.title === 'Delete trip');
  try {
    await tick(); open();
    assert.equal(sheet().props.open, true); assert.equal(h.deletes.length, 0);
    button(sheet(), 'Cancel').props.onClick(); assert.equal(sheet().props.open, false); assert.equal(h.deletes.length, 0);
    open();const confirm = button(sheet(), 'Yes, delete trip'); confirm.props.onClick();confirm.props.onClick();
    assert.equal(h.deletes.length, 1);assert.equal(h.deletes[0].tripId, base.id);assert.equal(h.deletes[0].version, base.updatedAt);
    assert.equal(sheet().props.dismissible, false);assert.equal(button(sheet(), 'Deleting…').props.disabled, true);
    h.deletes[0].resolve();await tick();
    assert.equal(sheet().props.open, false);assert.ok(h.notices.some(value => /removed from your cockpit/.test(value)));
    assert.ok(h.reminders.at(-1).some(trip => trip.id === base.id && trip.status === 'cancelled'));
  } finally { h.host.dispose(); }
});

test('Trip deletion confirmation is invalidated by session changes and failed deletes preserve the trip', async () => {
  for (const beforeSubmit of [true, false]) {
    const h = cockpitHarness([managedTrip()]);
    try {
      await tick();find(h.host.render(), 'button', props => props['aria-label'] === 'Delete trip').props.onClick();
      const confirm = button(find(h.host.render(), 'Sheet'), 'Yes, delete trip');
      if (!beforeSubmit) confirm.props.onClick();
      h.host.render({ accessToken: 'UNIT_TEST_SESSION_B' });
      assert.equal(find(h.host.render(), 'Sheet').props.open, false);
      if (beforeSubmit) { confirm.props.onClick(); assert.equal(h.deletes.length, 0); }
      else { h.deletes[0].resolve();await tick();assert.equal(h.notices.length, 0); }
    } finally { h.host.dispose(); }
  }
  const h = cockpitHarness([managedTrip()]);
  try {
    await tick();find(h.host.render(), 'button', props => props['aria-label'] === 'Delete trip').props.onClick();
    button(find(h.host.render(), 'Sheet'), 'Yes, delete trip').props.onClick();h.deletes[0].reject(new Error('network failed'));await tick();await tick();
    const view = h.host.render();assert.equal(find(view, 'Sheet').props.open, false);assert.match(text(view), /trip could not be deleted/);
    assert.ok(find(view, 'button', props => props['aria-label'] === 'Delete trip'));assert.equal(h.notices.length, 0);
  } finally { h.host.dispose(); }
});

test('Failed checklist save retains the draft; successful save does not clear newer typing', async () => {
  const base = managedTrip(), h = cockpitHarness([base]);
  try {
    await tick();
    const editor = () => find(h.host.render(), 'input', props => props['aria-label'] === 'New checklist item');
    editor().props.onChange({ target: { value: 'Pack medication' } });
    find(h.host.render(), 'form', props => props.className === 'cockpit-checklist-form').props.onSubmit({ preventDefault() {} });
    assert.equal(h.updates.length, 1); assert.equal(editor().props.value, 'Pack medication');
    h.updates[0].reject(new Error('503')); await tick(); await tick();
    assert.equal(editor().props.value, 'Pack medication');
    find(h.host.render(), 'form', props => props.className === 'cockpit-checklist-form').props.onSubmit({ preventDefault() {} });
    editor().props.onChange({ target: { value: 'Next item while saving' } });
    h.updates[1].resolve({ ...base, checklistItems: h.updates[1].payload.checklistItems }); await tick();
    assert.equal(editor().props.value, 'Next item while saving');
  } finally { h.host.dispose(); }
});

test('Trip edits update the same identity with a version guard and keep personal attachments', async () => {
  const base = managedTrip(), h = cockpitHarness([base]);
  try {
    await tick(); button(h.host.render(), 'Edit trip').props.onClick();
    const editor = find(h.host.render(), 'CockpitTripEditor');
    const saving = editor.props.onSave(base, { flightPnr: 'NEW123', endDate: '2026-10-11' });
    assert.equal(h.updates[0].tripId, base.id); assert.equal(h.updates[0].version, base.updatedAt);
    assert.equal(h.creates.length, 0); assert.equal(h.updates[0].payload.checklistItems, undefined);
    h.updates[0].reject(new Error('Conflict')); assert.equal(await saving, false);
    assert.equal(find(h.host.render(), 'CockpitTripEditor').props.trip.id, base.id);
    assert.match(find(h.host.render(), 'CockpitTripEditor').props.error, /draft is kept/);
  } finally { h.host.dispose(); }
});

test('Albanian ticket labels and accents extract explicit dates without guessing ambiguous itineraries', () => {
  const parser = load('mobile/src/lib/ticketText.ts', { './dates': dates });
  const text = 'Fluturimi: TK2500\nIST -> BJV\nNisja: 05 tetor 2026 10:00\nMbërritja: 05 tetor 2026 11:20\nKodi i rezervimit: SQTEST';
  const result = parser.parseTicketText(text);
  assert.equal(result.fields.departureDate, '2026-10-05'); assert.equal(result.fields.arrivalTime, '11:20');
  assert.equal(result.fields.flightNumber, 'TK2500'); assert.equal(result.fields.flightPnr, 'SQTEST');
  assert.equal(parser.parseTicketText(text + '\nNisja: 06 tetor 2026 10:00').fields.departureDate, '');
});

test('Successful overnight flight save is optional-PNR, single-submit, and clears the previous match on reopen', async () => {
  const h = cockpitHarness();
  try {
    lookup(await h.open()).props.onSelect(flight());
    dateField(h.host.render(), 'When does your trip end?').props.onChange('2026-09-30');
    const submit = tripForm(h.host.render()).props.onSubmit;
    const first = submit({ preventDefault() {} }); const duplicate = submit({ preventDefault() {} });
    assert.equal(h.creates.length, 1);
    assert.equal(h.creates[0].payload.flightPnr, '');
    assert.equal(h.creates[0].payload.flightSelectionReceipt, 'TEST_RECEIPT');
    assert.equal(h.creates[0].payload.departureAt, null, 'Receipt saves never copy provider timestamps to the manual payload');
    assert.equal(h.creates[0].payload.arrivalAt, null);
    h.creates[0].resolve({ ...h.creates[0].payload, id: 'created-trip', status: 'upcoming', updatedAt: new ClockDate().toISOString() }); await Promise.all([first, duplicate]); await tick();
    button(h.host.render(), 'Add trip').props.onClick();
    const reopened = h.host.render();
    assert.equal(lookup(reopened).props.flightNumber, '');
    assert.equal(lookup(reopened).props.date, '');
    assert.equal(find(reopened, 'section', props => props['aria-label'] === 'Flight summary'), undefined);
    assert.equal(find(reopened, 'AirportField'), undefined);
    assert.equal(button(reopened, 'Add to cockpit'), undefined);
  } finally { h.host.dispose(); }
});

test('Active mode taps preserve a matched flight, while a changed lookup query clears the stale match', async () => {
  const h = cockpitHarness();
  try {
    lookup(await h.open()).props.onSelect(flight());
    button(h.host.render(), 'Flight').props.onClick();
    assert.equal(lookup(h.host.render()).props.flightNumber, 'TK1985');
    assert.ok(find(h.host.render(), 'section', props => props['aria-label'] === 'Flight summary'));
    lookup(h.host.render()).props.onQueryChange('TK1986', '2026-09-28');
    const changed = h.host.render();
    assert.equal(find(changed, 'section', props => props['aria-label'] === 'Flight summary'), undefined);
    assert.equal(button(changed, 'Add to cockpit'), undefined);
    lookup(changed).props.onManual();
    assert.ok(find(h.host.render(), 'AirportField'));
  } finally { h.host.dispose(); }
});

test('Manual entry clears imported fields while keeping the user query, PNR and end date', async () => {
  const h = cockpitHarness();
  try {
    lookup(await h.open()).props.onSelect(flight());
    dateField(h.host.render(), 'When does your trip end?').props.onChange('2026-10-26');
    find(h.host.render(), 'input', props => props.placeholder === 'ABC123').props.onChange({ target: { value: 'USERPNR' } });
    button(h.host.render(), "I'll enter my ticket details manually").props.onClick();
    const manual = h.host.render();
    assert.equal(lookup(manual).props.flightNumber, 'TK1985');
    assert.equal(lookup(manual).props.date, '2026-09-28');
    assert.equal(find(manual, 'input', props => props.placeholder === 'ABC123').props.value, 'USERPNR');
    assert.equal(dateField(manual, 'When does your trip end?').props.value, '2026-10-26');
    assert.ok(nodes(manual).filter(n => n.type === 'AirportField').every(n => n.props.value === null));
    assert.equal(dateField(manual, 'Departure · airport local time').props.value, '');
    assert.equal(dateField(manual, 'Arrival · airport local time').props.value, '');
    await tripForm(manual).props.onSubmit({ preventDefault() {} });
    assert.equal(h.creates.length, 0);
  } finally { h.host.dispose(); }
});

test('Trial selection previews attribution but cannot save or escape through manual autofill', async () => {
  const h = cockpitHarness();
  try {
    lookup(await h.open()).props.onSelect({ ...flight(), receipt: null, maySave: false }, 'trial');
    assert.equal(dateField(h.host.render(), 'When does your trip end?'), undefined);
    assert.equal(button(h.host.render(), 'Add to cockpit'), undefined);
    assert.match(text(h.host.render()), /Flight lookup trial/);
    assert.equal(find(h.host.render(), 'CockpitFlightDetails').props.flight.source, 'AeroDataBox');
    await tripForm(h.host.render()).props.onSubmit({ preventDefault() {} });
    assert.equal(h.creates.length, 0);
    lookup(h.host.render()).props.onManual();
    assert.ok(nodes(h.host.render()).filter(n => n.type === 'AirportField').every(n => n.props.value === null));
    assert.equal(find(h.host.render(), 'section', props => props['aria-label'] === 'Flight summary'), undefined);
  } finally { h.host.dispose(); }
});

test('Server empty reasons produce specific guidance and old protocol results are rejected', async () => {
  for (const [reason, phrase] of [['past-departure', 'departure time has passed'], ['incomplete', 'not enough information to fill this flight automatically'], ['not-found', 'No flight was found'], ['status-unavailable', 'cannot be added automatically']]) {
    const h = lookupHarness();
    try {
      button(await h.enable(), 'Find flight details').props.onClick();
      h.calls[1].resolve({ ok: true, json: async () => ({ protocol: 3, flights: [], reason }) }); await tick();
      assert.ok(text(h.host.render()).includes(phrase));
    } finally { h.host.dispose(); }
  }
  const h = lookupHarness();
  try {
    button(await h.enable(), 'Find flight details').props.onClick();
    h.calls[1].resolve({ ok: true, json: async () => ({ flights: [flight()] }) }); await tick();
    assert.equal(results(h.host.render()).length, 0);
  } finally { h.host.dispose(); }
});

test('Managed detail expiry clears only the memory overlay and never reaches reminders', async () => {
  const savedNow = now;
  const providerFlight = flight();
  const base = { id: 'managed-trip', userId: 'test-user-a', destinationCountry: '', destinationCode: '', destinationCity: null,
    startDate: '2026-09-28', endDate: '2026-10-10', departureAt: null, arrivalAt: null, appLanguage: 'en', flightPnr: 'USERPNR',
    originIata: null, destinationIata: null, airline: null, flightNumber: 'TK1985', checklistItems: [{ id: 'keep', label: 'Pack medication', completed: false, category: 'health', createdAt: new ClockDate().toISOString() }],
    status: 'upcoming', createdAt: new ClockDate().toISOString(), updatedAt: new ClockDate().toISOString(), flightLookupManaged: true,
    flightLookupExpiresAt: providerFlight.expiresAt, providerFlight };
  const h = cockpitHarness([base]);
  try {
    await tick(); let view = h.host.render(); await tick();
    assert.equal(h.loadArgs[0][3], true);
    assert.match(text(view), /London/);
    const payload = h.reminders.flat().find(item => item.id === 'managed-trip');
    assert.equal(payload.departureAt, null); assert.equal(payload.arrivalAt, null);
    assert.equal(payload.originIata, null); assert.equal(payload.destinationIata, null);
    assert.ok(!JSON.stringify(payload).includes('London')); assert.equal(Object.hasOwn(payload, 'providerFlight'), false);
    view = h.advance(5 * 86400000 + 1);
    assert.ok(!text(view).includes('London'));
    assert.match(text(view), /USERPNR/); assert.match(text(view), /Pack medication/);
    assert.match(text(view), /Your PNR and checklist are kept/);
  } finally { now = savedNow; h.host.dispose(); }
});

test('Receipt expiry prevents a late save and data expiry clears a selected form without losing PNR', async () => {
  const savedNow = now, h = cockpitHarness();
  try {
    lookup(await h.open()).props.onSelect(flight());
    dateField(h.host.render(), 'When does your trip end?').props.onChange('2026-10-10');
    find(h.host.render(), 'input', props => props.placeholder === 'ABC123').props.onChange({ target: { value: 'USERPNR' } });
    let view = h.advance(600001);
    assert.equal(button(view, 'Add to cockpit').props.disabled, true);
    await tripForm(view).props.onSubmit({ preventDefault() {} }); assert.equal(h.creates.length, 0);
    view = h.advance(5 * 86400000);
    assert.equal(find(view, 'section', props => props['aria-label'] === 'Flight summary'), undefined);
    assert.equal(lookup(view).props.flightNumber, 'TK1985');
    lookup(view).props.onManual(); view = h.host.render();
    assert.equal(find(view, 'input', props => props.placeholder === 'ABC123').props.value, 'USERPNR');
    assert.equal(dateField(view, 'When does your trip end?').props.value, '2026-10-10');
    assert.ok(nodes(view).filter(n => n.type === 'AirportField').every(n => n.props.value === null));
  } finally { now = savedNow; h.host.dispose(); }
});


test('A preview whose departure passes cannot be saved and reports the specific time issue', async () => {
  const savedNow = now, h = cockpitHarness();
  try {
    const selected = flight();
    lookup(await h.open()).props.onSelect(selected);
    dateField(h.host.render(), 'When does your trip end?').props.onChange('2026-10-10');
    const view = h.advance(Date.parse(selected.departureAt) - now + 1);
    assert.equal(button(view, 'Add to cockpit').props.disabled, true);
    await tripForm(view).props.onSubmit({ preventDefault() {} });
    assert.equal(h.creates.length, 0);
    assert.match(text(h.host.render()), /scheduled departure time has passed/);
    assert.match(text(h.host.render()), /ongoing flight details could not be verified/);
  } finally { now = savedNow; h.host.dispose(); }
});


test('Completing or cancelling a managed trip removes provider data even if the update response includes it', async () => {
  for (const status of ['completed', 'cancelled']) for (const responseIncludesProvider of [false, true]) {
    const providerFlight = flight();
    const base = { id: 'managed-trip', userId: 'test-user-a', destinationCountry: '', destinationCode: '', destinationCity: null,
      startDate: '2026-09-28', endDate: '2026-10-10', departureAt: null, arrivalAt: null, appLanguage: 'en', flightPnr: 'USERPNR',
      originIata: null, destinationIata: null, airline: null, flightNumber: 'TK1985', checklistItems: [{ id: 'keep', label: 'Pack medication', completed: false, category: 'health', createdAt: new ClockDate().toISOString() }],
      status: 'upcoming', createdAt: new ClockDate().toISOString(), updatedAt: new ClockDate().toISOString(), flightLookupManaged: true,
      flightLookupExpiresAt: providerFlight.expiresAt };
    const h = cockpitHarness([{ ...base, providerFlight }]);
    try {
      await tick(); assert.match(text(h.host.render()), /London/);
      find(h.host.render(), 'select', props => props.value === 'upcoming').props.onChange({ target: { value: status } });
      assert.equal(h.updates.length, 1); assert.equal(h.updates[0].payload.status, status);
      h.updates[0].resolve({ ...base, status, ...(responseIncludesProvider ? { providerFlight } : {}) }); await tick();
      let view = h.host.render();
      assert.ok(!text(view).includes('London')); assert.ok(!text(view).includes('Turkish Airlines'));
      assert.match(text(view), /USERPNR/); assert.match(text(view), /Pack medication/);
      assert.match(text(view), /Flight details were removed because the trip is closed/);
      assert.ok(!text(view).includes('Check your flight details again'));
      assert.equal(h.reminders.at(-1)[0].departureAt, null);
      find(view, 'select', props => props.value === status).props.onChange({ target: { value: 'upcoming' } });
      h.updates[1].resolve(base); await tick(); view = h.host.render();
      assert.ok(!text(view).includes('London'), 'Reopening must not resurrect the discarded provider snapshot');
      assert.match(text(view), /Your PNR and checklist are kept/);
    } finally { h.host.dispose(); }
  }
});


test('Selection expiry deadlines use current time even between clock ticks', async () => {
  const savedNow = now, h = cockpitHarness();
  try {
    await h.open();
    now += 50000;
    lookup(h.host.render()).props.onSelect(flight()); h.host.render();
    assert.equal(h.timers.at(-1), 600000, 'Receipt deadline must not drift by the stale screen clock');
  } finally { now = savedNow; h.host.dispose(); }
});

test('Saved provider arrivals use the verified airport timezone when the bundled lookup has no entry', async () => {
  const providerFlight = flight();
  const base = { id: 'managed-trip', userId: 'test-user-a', destinationCountry: '', destinationCode: '', destinationCity: null,
    startDate: '2026-09-28', endDate: '2026-10-10', departureAt: null, arrivalAt: null, appLanguage: 'en', flightPnr: 'USERPNR',
    originIata: null, destinationIata: null, airline: null, flightNumber: 'TK1985', checklistItems: [], status: 'upcoming',
    createdAt: new ClockDate().toISOString(), updatedAt: new ClockDate().toISOString(), flightLookupManaged: true,
    flightLookupExpiresAt: providerFlight.expiresAt, providerFlight };
  const h = cockpitHarness([base], 'LHR');
  try {
    await tick();
    const expected = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London', timeZoneName: 'short' }).format(new Date(providerFlight.arrivalAt));
    const arrival = nodes(h.host.render()).find(node => node.type === 'div' && text(node).startsWith('Scheduled arrival'));
    assert.equal(text(arrival), 'Scheduled arrival' + expected);
  } finally { h.host.dispose(); }
});


test('Lookup explains unverified ongoing details and feature trial limits in Turkish and English without blaming the ticket date', async () => {
  for (const locale of ['tr', 'en']) {
    const h = lookupHarness();
    try {
      h.language(locale); h.host.render();
      let view = await h.enable(true, 'trial');
      const trialCopy = locale === 'tr' ? 'Uçuş arama denemesi:' : 'Flight lookup trial:';
      const noSaveCopy = locale === 'tr' ? 'kokpite kaydedilemez' : 'cannot be saved to Cockpit';
      assert.ok(text(view).includes(trialCopy)); assert.ok(text(view).includes(noSaveCopy));
      assert.ok(!text(view).includes(locale === 'tr' ? 'Deneme uçuşu' : 'Trial flight preview'));
      button(view, locale === 'tr' ? 'Uçuş bilgilerini getir' : 'Find flight details').props.onClick();
      h.calls[1].resolve({ ok: true, json: async () => ({ protocol: 3, flights: [], reason: 'past-departure' }) }); await tick();
      view = h.host.render();
      assert.ok(text(view).includes(locale === 'tr' ? 'devam eden uçuş bilgisi doğrulanamadı' : 'ongoing flight details could not be verified'));
      assert.ok(text(view).includes(locale === 'tr' ? 'elle devam edebilirsin' : 'continue manually'));
      assert.ok(!text(view).includes(locale === 'tr' ? 'Biletindeki tarihi kontrol et.' : 'Check the date on your ticket.'));
      assert.equal(results(view).length, 0);
      button(view, locale === 'tr' ? 'Bilgileri kendim gireceğim' : "I'll enter the details myself").props.onClick();
      assert.equal(h.manual(), 1);
    } finally { h.host.dispose(); }
  }
});

test('A result that passes its scheduled departure before selection keeps the same coverage explanation and remains blocked', async () => {
  const savedNow = now, h = lookupHarness();
  try {
    button(await h.enable(), 'Find flight details').props.onClick();
    const result = flight();
    h.calls[1].resolve({ ok: true, json: async () => ({ protocol: 3, flights: [result], reason: null }) }); await tick();
    const choose = results(h.host.render())[0];
    now = Date.parse(result.departureAt) + 1;
    choose.props.onClick();
    const view = h.host.render();
    assert.equal(h.selections.length, 0); assert.equal(results(view).length, 0);
    assert.match(text(view), /ongoing flight details could not be verified/);
    assert.ok(button(view, "I'll enter the details myself"));
  } finally { now = savedNow; h.host.dispose(); }
});

function ongoingFlight() {
  const f = flight(), departure = now - 3600000, arrival = now + 7200000;
  const dep = zones.zonedParts(departure, f.origin.timeZone), arr = zones.zonedParts(arrival, f.destination.timeZone);
  return { ...f, departureAt: new ClockDate(departure).toISOString(), arrivalAt: new ClockDate(arrival).toISOString(),
    departureDate: dep.date, departureTime: dep.time.slice(0, 5), arrivalDate: arr.date, arrivalTime: arr.time.slice(0, 5),
    progress: progress.flightProgress('EnRoute', new ClockDate(now - 60000).toISOString(), new ClockDate(now - 3000000).toISOString(), new ClockDate(arrival + 600000).toISOString()) };
}
function managedTrip(providerFlight = flight()) {
  return { id: 'managed-trip', userId: 'test-user-a', destinationCountry: '', destinationCode: '', destinationCity: null,
    startDate: providerFlight.departureDate, endDate: '2026-10-10', departureAt: null, arrivalAt: null, appLanguage: 'en', flightPnr: 'USERPNR',
    originIata: null, destinationIata: null, airline: null, flightNumber: providerFlight.flightNumber,
    checklistItems: [{ id: 'pack', label: 'Pack charger', category: 'technology', kind: 'checklist', completed: false }], status: 'upcoming',
    createdAt: new ClockDate().toISOString(), updatedAt: new ClockDate().toISOString(), flightLookupManaged: true,
    flightLookupExpiresAt: providerFlight.expiresAt, providerFlight };
}

test('Fresh ongoing flights can be saved commercially; trial and stale source selections remain previews', async () => {
  const f = ongoingFlight();
  const parsed = flightSelection.parseFlightSelection(f, f.flightNumber, f.departureDate);
  assert.ok(parsed); assert.equal(flightSelection.canSaveFlightSelection(parsed), true);
  const h = cockpitHarness();
  try {
    lookup(await h.open()).props.onSelect(parsed, 'commercial');
    dateField(h.host.render(), 'When does your trip end?').props.onChange('2026-10-01');
    const saving = tripForm(h.host.render()).props.onSubmit({ preventDefault() {} });
    assert.equal(h.creates.length, 1); assert.equal(h.creates[0].payload.flightSelectionReceipt, 'TEST_RECEIPT');
    h.creates[0].resolve(managedTrip(f)); await saving;
  } finally { h.host.dispose(); }
  assert.equal(flightSelection.canSaveFlightSelection({ ...parsed, maySave: false, receipt: null }), false);
  const savedNow = now;
  try {
    now += 16 * 60000;
    const stale = flightSelection.parseFlightSelection(f, f.flightNumber, f.departureDate);
    assert.equal(stale.progress.freshness, 'stale'); assert.equal(flightSelection.canSaveFlightSelection(stale), false);
  } finally { now = savedNow; }
});

test('Source timing semantics remain frozen at retrieval; current freshness expires without inventing actual times', () => {
  const savedNow = now, f = ongoingFlight();
  f.progress = progress.flightProgress('Arrived', new ClockDate(now).toISOString(), f.departureAt, new ClockDate(now + 60000).toISOString());
  assert.equal(f.progress.arrival.revisedKind, 'unknown');
  try {
    now += 120000;
    const parsed = flightSelection.parseFlightMatch(f);
    assert.ok(parsed); assert.equal(parsed.progress.arrival.revisedKind, 'unknown');
    const details = load('mobile/src/components/CockpitFlightDetails.tsx', { 'react/jsx-runtime': jsxRuntime, '../lib/i18n': { useI18n: () => i18n.en } });
    const view = details.CockpitFlightDetails({ flight: parsed, now });
    assert.match(text(view), /Scheduled/); assert.doesNotMatch(text(view), /Estimated/);
    assert.equal(find(view, 'a').props.rel, 'noopener');
  } finally { now = savedNow; }
});

test('Flight display separates source actual departure, estimated arrival and original schedule', () => {
  const details = load('mobile/src/components/CockpitFlightDetails.tsx', { 'react/jsx-runtime': jsxRuntime, '../lib/i18n': { useI18n: () => i18n.en } });
  const f = ongoingFlight(), view = details.CockpitFlightDetails({ flight: f, now });
  assert.match(text(view), /Reported airborne/); assert.match(text(view), /Actual · reported by source/);
  assert.match(text(view), /Estimated · may change/); assert.match(text(view), /Scheduled/);
  assert.match(text(details.CockpitFlightDetails({ flight: f, now: now + 16 * 60000 })), /last known.*Freshness unconfirmed/);
  assert.doesNotMatch(text(details.CockpitFlightDetails({ flight: flight(), now })), /Reported airborne/);
});

test('Refresh is single-submit, terminal responses discard the overlay and preserve checklist, PNR and trip-specific notes', async () => {
  const base = managedTrip(), h = cockpitHarness([base]);
  try {
    await tick(); const refresh = button(h.host.render(), 'Refresh flight details');
    refresh.props.onClick(); refresh.props.onClick(); assert.equal(h.refreshes.length, 1);
    h.refreshes[0].resolve({ trip: { ...base, providerFlight: undefined, flightLookupExpiresAt: null }, refreshAfterSeconds: 300 });
    await tick(); const view = h.host.render();
    assert.equal(find(view, 'CockpitFlightDetails'), undefined); assert.match(text(view), /USERPNR/); assert.match(text(view), /Pack charger/);
    assert.equal(find(view, 'PersonalTravelCards').props.tripId, base.id); assert.equal(find(view, 'PersonalTravelCards').props.ownerId, base.userId);
    assert.equal(h.reminders.at(-1)[0].departureAt, null); assert.equal(h.reminders.at(-1)[0].provider, undefined);
  } finally { h.host.dispose(); }
});

test('Foreground updates require provider native permission, pause offline/hidden, discard aborted results and stop at quota', async () => {
  const base = managedTrip({ ...ongoingFlight(), nativeDisplayAllowed: true, fetchedAt: new ClockDate(now - 6 * 60000).toISOString() });
  base.flightLookupExpiresAt = new ClockDate(now + 4 * 86400000).toISOString();
  base.providerFlight.progress = progress.flightProgress('EnRoute', new ClockDate(now - 7 * 60000).toISOString(), base.providerFlight.departureAt, base.providerFlight.arrivalAt, new ClockDate(now - 6 * 60000));
  const h = cockpitHarness([base]);
  try {
    await tick(); h.host.render();
    assert.ok(h.reminders.at(-1)[0].provider); assert.equal(h.reminders.at(-1)[0].provider.status, 'EnRoute');
    h.visibility('hidden'); assert.equal([...h.jobs.values()].some(j => j.delay === 0), false);
    h.visibility('visible'); h.runTimer(0); assert.equal(h.refreshes.length, 1);
    h.online(false); assert.equal(h.refreshes[0].signal.aborted, true);
    h.refreshes[0].resolve({ trip: { ...base, providerFlight: undefined }, refreshAfterSeconds: 300 }); await tick();
    assert.ok(find(h.host.render(), 'CockpitFlightDetails'), 'A late cancelled result cannot replace the visible snapshot');
    h.online(true); h.runTimer(0); assert.equal(h.refreshes.length, 2);
    h.refreshes[1].reject({ status: 429 }); await tick();
    assert.match(text(h.host.render()), /Automatic updates stopped/);
    h.visibility('hidden'); h.visibility('visible'); assert.equal([...h.jobs.values()].some(j => j.delay === 0 || j.delay === 600000), false);
  } finally { h.host.dispose(); }
  const trial = cockpitHarness([managedTrip()]);
  try { await tick(); trial.host.render(); assert.equal(trial.refreshes.length, 0); assert.equal([...trial.jobs.values()].some(j => j.delay === 0 || j.delay === 600000), false); }
  finally { trial.host.dispose(); }
});

test('Native permission alone cannot move missing or malformed progress into reminders or automatic updates', async () => {
  for (const providerFlight of [{ ...flight(), nativeDisplayAllowed: true }, { ...ongoingFlight(), nativeDisplayAllowed: true, progress: { ...ongoingFlight().progress, freshUntil: '2099-01-01T00:00:00Z' } }]) {
    const h = cockpitHarness([managedTrip(providerFlight)]);
    try {
      await tick(); h.host.render();
      const reminder = h.reminders.at(-1)[0];
      assert.equal(reminder.departureAt, null); assert.equal(reminder.arrivalAt, null);
      assert.equal(reminder.originIata, null); assert.equal(reminder.destinationIata, null); assert.equal(reminder.provider, undefined);
      assert.equal([...h.jobs.values()].some(job => job.delay === 0 || job.delay === 300000), false);
    } finally { h.host.dispose(); }
  }
});

test('Cockpit keeps near-expiry provider fields out of native display until a refresh restores the retention buffer', async () => {
  for (const [minutes, allowed] of [[779, false], [781, true]]) {
    const base = managedTrip({ ...ongoingFlight(), nativeDisplayAllowed: true });
    base.flightLookupExpiresAt = new ClockDate(now + minutes * 60000).toISOString();
    const h = cockpitHarness([base]);
    try {
      await tick(); h.host.render();
      const reminder = h.reminders.at(-1)[0];
      assert.equal(Boolean(reminder.provider), allowed);
      assert.equal(reminder.departureAt, allowed ? base.providerFlight.departureAt : null);
      assert.ok(find(h.host.render(), 'CockpitFlightDetails'), 'Still-valid details remain available in the app');
      assert.ok([...h.jobs.values()].some(job => job.delay === 300000), 'Foreground refresh can restore the buffer without starting an unsafe native activity');
    } finally { h.host.dispose(); }
  }
});

const tickets = load('mobile/src/lib/ticketText.ts', { './dates': dates });
const ticketText = 'Flight: TK1985\nIST → LHR\nDeparture: 28 SEP 2026 22:00\nArrival: 29 SEP 2026 00:30\nPNR: USER123';
test('Ticket parser suggests explicit local dates and times; conflicting flights and ambiguous numeric dates stay blank', () => {
  const parsed = tickets.parseTicketText(ticketText);
  assert.equal(parsed.fields.flightNumber, 'TK1985'); assert.equal(parsed.fields.departureDate, '2026-09-28');
  assert.equal(parsed.fields.arrivalDate, '2026-09-29'); assert.equal(parsed.fields.departureTime, '22:00');
  assert.equal(parsed.fields.originIata, 'IST'); assert.equal(parsed.fields.flightPnr, 'USER123');
  const ambiguous = tickets.parseTicketText('Flight: TK1985\nFlight: PC651\nDeparture: 04/11/2026 12:00');
  assert.equal(ambiguous.fields.flightNumber, ''); assert.equal(ambiguous.fields.departureDate, '');
  assert.ok(ambiguous.ambiguous.includes('flightNumber'));
  assert.equal(tickets.parseTicketText('Uçuş: PC438\nKalkış: 4 Kasım 2026 15:40').fields.departureDate, '2026-11-04');
  assert.equal(tickets.parseTicketText('Uçuş: PC438\nKalkış: 04.11.2026 15:40').fields.departureDate, '2026-11-04');
  assert.equal(tickets.parseTicketText('Kalkış: 31.02.2026 15:40').fields.departureDate, '');
  assert.equal(tickets.parseTicketText('Kalkış: 04.11.2026\nKalkış: 05.11.2026').fields.departureDate, '');
});

function ticketHarness(native = false) {
  const host = hookHost(), reads = [], confirms = [];
  const bridge = { pickAndRead: options => { const wait = deferred(); reads.push({ options, ...wait }); return wait.promise; } };
  const component = load('mobile/src/components/CockpitTicketImport.tsx', {
    react: host.react, 'react/jsx-runtime': jsxRuntime, '../lib/capacitor': { isIOSNative: () => native, plugin: () => bridge },
    '../lib/i18n': { useI18n: () => i18n.en }, '../lib/ticketText': tickets, '../lib/cockpitForm': cockpitForm,
    './DateTimeField': { DateTimeField: 'DateTimeField' }, './Sheet': { Sheet: 'Sheet' }, './Icon': { Icon: 'Icon' },
  });
  host.start(component.CockpitTicketImport, { onConfirm: value => { const wait = deferred(); confirms.push({ value, ...wait }); return wait.promise; } });
  button(host.render(), 'Fill from my ticket').props.onClick(); host.render();
  return { host, reads, confirms };
}
test('Ticket text stays temporary and requires editable explicit confirmation, with duplicate confirmation blocked', async () => {
  const h = ticketHarness();
  try {
    assert.equal(button(h.host.render(), 'Choose photo'), undefined);
    find(h.host.render(), 'textarea').props.onChange({ target: { value: ticketText } });
    button(h.host.render(), 'Review details').props.onClick(); let view = h.host.render();
    assert.equal(h.confirms.length, 0); assert.equal(find(view, 'textarea'), undefined);
    find(view, 'input', p => p.value === 'USER123').props.onChange({ target: { value: 'FIXEDPNR' } });
    view = h.host.render(); const confirm = button(view, 'Confirm and use these details');
    confirm.props.onClick(); confirm.props.onClick(); assert.equal(h.confirms.length, 1);
    assert.equal(h.confirms[0].value.flightPnr, 'FIXEDPNR'); assert.equal(Object.hasOwn(h.confirms[0].value, 'text'), false);
    h.confirms[0].resolve(); await tick(); view = h.host.render();
    assert.equal(find(view, 'Sheet').props.open, false); assert.equal(find(view, 'textarea').props.value, '');
  } finally { h.host.dispose(); }
});

test('Native ticket picker uses the selected source and ignores cancellation or a result after closing', async () => {
  const h = ticketHarness(true);
  try {
    button(h.host.render(), 'Choose photo').props.onClick(); assert.equal(h.reads[0].options.source, 'photos');
    h.reads[0].resolve({ cancelled: true, text: '' }); await tick();
    assert.equal(button(h.host.render(), 'Confirm and use these details'), undefined);
    button(h.host.render(), 'Choose PDF or file').props.onClick(); assert.equal(h.reads[1].options.source, 'files');
    find(h.host.render(), 'Sheet').props.onClose();
    h.reads[1].resolve({ text: ticketText }); await tick();
    assert.equal(find(h.host.render(), 'Sheet').props.open, false); assert.equal(h.confirms.length, 0);
    assert.equal(button(h.host.render(), 'Confirm and use these details'), undefined);
  } finally { h.host.dispose(); }
});

test('Confirmed ticket fields fill the manual flow once and leave only missing details visible', async () => {
  const h = cockpitHarness();
  try {
    await h.open(); await find(h.host.render(), 'CockpitTicketImport').props.onConfirm(tickets.parseTicketText(ticketText).fields);
    const view = h.host.render();
    assert.equal(lookup(view).props.flightNumber, 'TK1985'); assert.equal(lookup(view).props.compact, true);
    assert.match(text(view), /Imported from your ticket/); assert.equal(find(view, 'AirportField'), undefined);
    assert.equal(dateField(view, 'Departure · airport local time'), undefined);
    assert.ok(dateField(view, 'When does your trip end?'));
    assert.equal(find(view, 'CockpitFlightDetails'), undefined, 'Ticket data is personal input, not provider verification');
  } finally { h.host.dispose(); }
});

test('Reading a second ticket discards old route fields if its airport cannot be verified', async () => {
  const h = cockpitHarness();
  try {
    await h.open();
    await find(h.host.render(), 'CockpitTicketImport').props.onConfirm(tickets.parseTicketText(ticketText).fields);
    await find(h.host.render(), 'CockpitTicketImport').props.onConfirm({ ...tickets.EMPTY_TICKET, flightNumber: 'PC438', originIata: 'ZZZ' });
    const view = h.host.render();
    assert.equal(lookup(view).props.flightNumber, 'PC438');
    const airports = nodes(view).filter(n => n.type === 'AirportField');
    assert.equal(airports.length, 2); assert.ok(airports.every(node => node.props.value === null));
    assert.match(text(view), /airport could not be verified/);
    assert.equal(dateField(view, 'Departure · airport local time').props.value, '');
  } finally { h.host.dispose(); }
});

test('Request cancellation aborts web transport and discards a native bridge result without another request', async () => {
  for (const native of [false, true]) {
    const calls = [], wait = deferred();
    const api = load('mobile/src/lib/api.ts', {
      './capacitor': { isNativePlatform: () => native, plugin: () => ({ request: options => { calls.push(options); return wait.promise; } }) },
      './config': { config: { apiBaseUrl: 'https://example.test' } }, './i18n': { localeFromStorage: () => 'en' },
    }, { DOMException, window: { setTimeout, clearTimeout }, fetch: (url, options) => { calls.push(options); options.signal.addEventListener('abort', () => wait.reject(new DOMException('Cancelled', 'AbortError'))); return wait.promise; } });
    const controller = new AbortController();
    const pending = api.requestJson('/flight', { signal: controller.signal });
    assert.equal(calls.length, 1); controller.abort();
    if (native) wait.resolve({ status: 200, data: { privateFlight: true } });
    else assert.equal(calls[0].signal.aborted, true);
    await assert.rejects(pending, error => error.code === 'aborted');
    await assert.rejects(api.requestJson('/flight', { signal: controller.signal }), error => error.code === 'aborted');
    assert.equal(calls.length, 1);
  }
});
