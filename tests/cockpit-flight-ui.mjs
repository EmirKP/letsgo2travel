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
const now = Date.parse('2026-09-27T08:00:00Z');
class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: 'fragment' };
function load(path, imports, extra = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date: ClockDate, Intl, AbortController, setTimeout, clearTimeout, ...extra })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
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
  return { id: 'TK1985:IST:LHR:2026-09-28T19:00:00.000Z', flightNumber: 'TK1985', airline: 'Turkish Airlines', source: 'AeroDataBox', fetchedAt: new ClockDate().toISOString(),
    origin: airport('IST', 'Istanbul', 'TR', 'Europe/Istanbul'), destination: airport('LHR', 'London', 'GB', 'Europe/London'),
    departureAt: '2026-09-28T19:00:00.000Z', arrivalAt: '2026-09-28T23:30:00.000Z', departureDate: '2026-09-28', departureTime: '22:00', arrivalDate: '2026-09-29', arrivalTime: '00:30' };
}
const dates = load('mobile/src/lib/dates.ts', {});
const cockpitForm = load('mobile/src/lib/cockpitForm.ts', { './dates': dates, '../../../lib/airport-time-zones': airportZones, '../../../lib/zoned-time': zones });
function lookupHarness() {
  const host = hookHost(), calls = [], selections = [];
  let locale = 'en', manual = 0;
  const testModule = load('mobile/src/components/CockpitFlightLookup.tsx', {
    react: host.react, 'react/jsx-runtime': jsxRuntime,
    '../../../lib/zoned-time': zones, '../lib/config': { config: { apiBaseUrl: 'https://test.invalid' } },
    '../lib/i18n': { useI18n: () => i18n[locale] }, '../lib/dates': dates, '../lib/cockpitForm': cockpitForm,
    './DateTimeField': { DateTimeField: 'DateTimeField' }, './Icon': { Icon: 'Icon' },
  }, { fetch: (url, options = {}) => { const wait = deferred(); calls.push({ url, options, ...wait }); return wait.promise; } });
  host.start(testModule.CockpitFlightLookup, { accessToken: 'UNIT_TEST_SESSION_A', flightNumber: 'TK1985', date: '2026-09-28', onQueryChange: () => {}, onSelect: value => selections.push(value), onManual: () => manual++ });
  return { host, calls, selections, manual: () => manual, language: next => { locale = next; }, async enable(value = true) { calls[0].resolve({ ok: true, json: async () => ({ available: value }) }); await tick(); return host.render(); } };
}

test('Flight lookup blocks duplicate clicks and offers overnight results only after explicit selection', async () => {
  const h = lookupHarness();
  try {
    const view = await h.enable(); const search = button(view, 'Find flight details');
    search.props.onClick(); search.props.onClick();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].options.headers.Authorization, 'Bearer UNIT_TEST_SESSION_A');
    assert.deepEqual(JSON.parse(h.calls[1].options.body), { flightNumber: 'TK1985', date: '2026-09-28' });
    h.calls[1].resolve({ ok: true, json: async () => ({ flights: [flight()] }) }); await tick();
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
      h.calls[1].resolve({ ok: true, json: async () => ({ flights: [flight()] }) }); await tick();
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
    active.calls[1].resolve({ ok: true, json: async () => ({ flights: [flight()] }) }); await tick();
    assert.equal(results(active.host.render()).length, 0);
    assert.equal(active.manual(), 1);
  } finally { active.host.dispose(); }
});

test('Malformed and mismatched flight responses never render selectable routes', async () => {
  for (const item of [null, {}, { ...flight(), origin: null }, { ...flight(), flightNumber: 'TK9999' }, { ...flight(), arrivalTime: '21:00' }, { ...flight(), fetchedAt: 'invalid' }]) {
    const h = lookupHarness();
    try {
      button(await h.enable(), 'Find flight details').props.onClick();
      h.calls[1].resolve({ ok: true, json: async () => ({ flights: [item] }) }); await tick();
      assert.equal(results(h.host.render()).length, 0);
      assert.ok(button(h.host.render(), "I'll enter the details myself"));
    } finally { h.host.dispose(); }
  }
});

function cockpitHarness() {
  const host = hookHost(), creates = [], notices = [];
  let id = 0;
  const testModule = load('mobile/src/screens/CockpitScreen.tsx', {
    react: host.react, 'react/jsx-runtime': jsxRuntime, '../../../lib/event-time': {},
    '../components/AirportField': { AirportField: 'AirportField' }, '../components/CountryPicker': { CountryPicker: 'CountryPicker' },
    '../components/DateTimeField': { DateTimeField: 'DateTimeField' }, '../components/Icon': { Icon: 'Icon' },
    '../components/PageHero': { PageHero: 'PageHero' }, '../components/CockpitFlightLookup': { CockpitFlightLookup: 'CockpitFlightLookup' },
    '../data/countries': { COUNTRY_LIST: [{ alpha3: 'GBR', name: 'United Kingdom' }] },
    '../data/countryIso': { alpha2FromAlpha3: () => 'GB', alpha3FromAlpha2: () => 'GBR' },
    '../../../lib/airport-time-zones': airportZones, '../../../lib/zoned-time': zones, '../lib/dates': dates, '../lib/cockpitForm': cockpitForm,
    '../lib/liveActivity': { syncFlightReminders: async () => {}, endAllFlightActivities: async () => {} },
    '../lib/id': { createId: () => `test-item-${++id}` }, '../lib/i18n': { useI18n: () => i18n.en }, '../lib/native': { openExternal: async () => true },
    '../lib/supabaseData': { listCockpitTrips: async () => [], areFlightFieldsSupported: () => true, getSupabaseDataErrorMessage: (_, fallback) => fallback,
      createCockpitTrip: (user, payload, token) => { const wait = deferred(); creates.push({ user, payload, token, ...wait }); return wait.promise; } },
  }, { window: { setInterval: () => 1, clearInterval: () => {}, confirm: () => true } });
  host.start(testModule.CockpitScreen, { user: { id: 'test-user-a' }, accessToken: 'UNIT_TEST_SESSION_A', onOpenAccount: () => {}, onNotice: value => notices.push(value) });
  return { host, creates, notices, async open() { await tick(); button(host.render(), 'Add trip').props.onClick(); return host.render(); } };
}
const lookup = tree => find(tree, 'CockpitFlightLookup');
const tripForm = tree => find(tree, 'form', props => props.id === 'cockpit-trip-form');
const dateField = (tree, label) => find(tree, 'DateTimeField', props => props.label === label);

test('Successful overnight flight save is optional-PNR, single-submit, and clears the previous match on reopen', async () => {
  const h = cockpitHarness();
  try {
    lookup(await h.open()).props.onSelect(flight());
    dateField(h.host.render(), 'When does your trip end?').props.onChange('2026-09-30');
    const submit = tripForm(h.host.render()).props.onSubmit;
    const first = submit({ preventDefault() {} }); const duplicate = submit({ preventDefault() {} });
    assert.equal(h.creates.length, 1);
    assert.equal(h.creates[0].payload.flightPnr, '');
    assert.equal(h.creates[0].payload.departureAt, '2026-09-28T19:00:00.000Z');
    assert.equal(h.creates[0].payload.arrivalAt, '2026-09-28T23:30:00.000Z');
    h.creates[0].resolve({ ...h.creates[0].payload, id: 'created-trip', status: 'upcoming', updatedAt: new ClockDate().toISOString() }); await Promise.all([first, duplicate]); await tick();
    button(h.host.render(), 'Add trip').props.onClick();
    const reopened = h.host.render();
    assert.equal(lookup(reopened).props.flightNumber, '');
    assert.equal(lookup(reopened).props.date, '');
    assert.equal(find(reopened, 'section', props => props['aria-label'] === 'Flight summary'), undefined);
    assert.equal(find(reopened, 'AirportField'), undefined);
    assert.equal(button(reopened, 'Add to cockpit').props.disabled, true);
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
    assert.equal(button(changed, 'Add to cockpit').props.disabled, true);
    lookup(changed).props.onManual();
    assert.ok(find(h.host.render(), 'AirportField'));
  } finally { h.host.dispose(); }
});

test('Editing an imported DST-overlap time clears its old UTC selection and requires a fresh choice', async () => {
  const h = cockpitHarness();
  try {
    const overlap = { ...flight(), origin: airport('LHR', 'London', 'GB', 'Europe/London'), destination: airport('JFK', 'New York', 'US', 'America/New_York'),
      departureDate: '2026-10-25', departureTime: '01:30', departureAt: '2026-10-25T00:30:00.000Z', arrivalDate: '2026-10-25', arrivalTime: '05:00', arrivalAt: '2026-10-25T09:00:00.000Z' };
    lookup(await h.open()).props.onSelect(overlap);
    dateField(h.host.render(), 'When does your trip end?').props.onChange('2026-10-26');
    button(h.host.render(), 'Edit details').props.onClick();
    dateField(h.host.render(), 'Departure · airport local time').props.onChange('01:31');
    const ambiguity = nodes(h.host.render()).find(node => node.type === 'label' && text(node).startsWith('Clocks go back:'));
    assert.ok(ambiguity);
    assert.equal(find(ambiguity, 'select').props.value, '');
    await tripForm(h.host.render()).props.onSubmit({ preventDefault() {} });
    assert.equal(h.creates.length, 0);
    assert.match(text(h.host.render()), /occurs twice/);
  } finally { h.host.dispose(); }
});
