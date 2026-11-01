import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const tick = () => new Promise(setImmediate);
const plain = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function modules(overrides = {}, globals = {}) {
  const cache = new Map();
  const load = filename => {
    const full = path.resolve(filename);
    if (cache.has(full)) return cache.get(full).exports;
    if (/\.(webp|png|svg)$/.test(full)) return { __esModule: true, default: full };
    if (full.endsWith('.json')) return JSON.parse(readFileSync(full, 'utf8'));
    const loadedModule = { exports: {} }; cache.set(full, loadedModule);
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
      Date, Intl, URL, URLSearchParams,
      fetch() { throw Error('No real network in city event intent tests'); }, ...globals,
    }, { filename: full })(id => {
      if (Object.hasOwn(overrides, id)) return overrides[id];
      if (id.endsWith('.css')) return {};
      if (!id.startsWith('.')) throw Error(`Unexpected dependency ${id}`);
      const base = path.resolve(path.dirname(full), id);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!target) throw Error(`Missing dependency ${id}`);
      return load(target);
    }, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  };
  return load;
}
function hooks() {
  const slots = []; let cursor = 0, dirty = false, effects = [], component;
  const changed = (before, after) => !before || !after || before.length !== after.length || after.some((value, index) => !Object.is(value, before[index]));
  const memo = (fn, deps) => { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value; };
  return {
    react: {
      useState(initial) { const index = cursor++; slots[index] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
      useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
      useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
      useEffect(fn, deps) { const index = cursor++, previous = slots[index]; if (changed(previous?.deps, deps)) { const next = { deps }; slots[index] = next; effects.push(() => { previous?.cleanup?.(); next.cleanup = fn(); }); } },
    },
    render(fn) { component = fn || component; for (let pass = 0; pass < 30; pass++) { cursor = 0; dirty = false; effects = []; const tree = component(); effects.forEach(effect => effect()); if (!dirty) return tree; } throw Error('Fixture render did not settle'); },
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
  };
}
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' && !(value.type === 'Sheet' && !value.props?.open)
  ? [value, ...nodes(value.props?.children)] : [];
const input = tree => nodes(tree).find(node => node.props?.id === 'event-name-query');
const dates = modules()('mobile/src/lib/dates.ts');
const catalog = modules()('mobile/src/data/cityDestinations.ts');
const app = ts.createSourceFile('App.tsx', readFileSync('mobile/src/App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function attribute(tag, name) {
  let found;
  const visit = node => {
    if (found) return;
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(app) === tag) {
      found = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === name)?.initializer?.expression;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(app); assert.ok(found, `${tag}.${name} must exist in production App`); return found.getText(app);
}
function evaluate(expression, globals) {
  const code = ts.transpileModule(`module.exports = (${expression});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(`(function(module,exports){${code}\n})`, globals)(loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
function cityIntent(locale, code = 'FCO') {
  let context;
  evaluate(attribute('CityDestinationScreen', 'onEvents'), {
    destination: catalog.cityDestination(code, locale), cityDestination: catalog.cityDestination,
    localIsoDate: dates.localIsoDate, openNearbyEvents: next => { context = plain(next); },
  })();
  return context;
}
function countryIntent(countryCode) {
  let context;
  evaluate(attribute('ExploreScreen', 'onOpenCountryEvents'), {
    activeTrip: null, localIsoDate: dates.localIsoDate,
    openNearbyEvents: next => { context = plain(next); },
  })(countryCode);
  return context;
}
async function nearbyIntent() {
  // Country resolution is the only mocked boundary. Use the real distance,
  // travel centres and context builder without requesting device location.
  const context = modules({ './deviceArea': { countryAt: async () => 'IT' } })('mobile/src/lib/eventSearchContext.ts');
  return plain(await context.nearbyEventContext({ latitude: 41.90, longitude: 12.50 }));
}
function previousFilters() {
  return { countryCode: 'FR', cityName: 'Paris', cityPlaceCode: 'paris-id',
    startDate: dates.localIsoDate(1), endDate: dates.localIsoDate(9), category: 'concert', query: 'Previous artist' };
}
function fixture({ locale = 'en', initialContext, initialFilters, ownerId = 'owner-a', savedEvents = [] } = {}) {
  const host = hooks(), cityRequests = [], searchRequests = [], reported = [], handled = [], writes = [];
  let currentLocale = locale, props = { initialContext, initialFilters, ownerId, accessToken: '' };
  const copy = (tr, en, sq) => currentLocale === 'tr' ? tr : currentLocale === 'sq' ? sq || en : en;
  const imports = {
    react: host.react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../hooks/useCurrentTime': { useCurrentTime: () => Date.now() },
    '../lib/i18n': { useI18n: () => ({ locale: currentLocale, copy, countryName: (_code, fallback) => fallback, dateLocale: currentLocale }) },
    '../lib/localeFormatting': { formatAppDate: () => '' },
    '../../../lib/event-time': { eventDateLabel: () => '', eventTimeLabel: () => '', eventLocalDate: () => '', hasEventTime: () => true },
    '../data/countries': { COUNTRY_LIST: [{ alpha3: 'TUR', name: 'Türkiye' }, { alpha3: 'FRA', name: 'France' }, { alpha3: 'ITA', name: 'Italy' }, { alpha3: 'ROU', name: 'Romania' }] },
    '../data/countryIso': { alpha2FromAlpha3: code => ({ TUR: 'TR', FRA: 'FR', ITA: 'IT', ROU: 'RO' })[code] },
    '../lib/dates': dates,
    '../lib/eventSearchContext': modules({ '../../../lib/travel-assistant/places': {}, './deviceArea': {}, './travelAreas': { TRAVEL_CENTRES: [] } })('mobile/src/lib/eventSearchContext.ts'),
    '../lib/api': {
      listEventCities: country => { const pending = deferred(); cityRequests.push({ country, ...pending }); return pending.promise; },
      listTravelEvents: params => { const pending = deferred(); searchRequests.push({ params: plain(params), ...pending }); return pending.promise; },
    },
    '../lib/featuredEvents': { loadFeaturedEvents: async () => { throw Error('Featured events must not open during city intent tests'); } },
    '../lib/accountResume': { onAccountResume: () => () => {} },
    '../lib/eventReminders': { readEventReminderState: async () => ({ items: [], error: false }), reconcileEventReminders: async () => 0 },
    '../lib/native': { openExternal: () => { throw Error('No external UI in city intent tests'); } },
    '../lib/storage': { getSavedTravelEvents: owner => owner === ownerId ? savedEvents : [], mergeSavedTravelEvents: () => { writes.push('merge'); return { events: savedEvents }; }, toggleSavedTravelEvent: () => { throw Error('No bookmark writes in city intent tests'); } },
    '../lib/supabaseData': { listCockpitTrips: async () => [], getSupabaseDataErrorMessage: (_error, fallback) => fallback },
  };
  for (const name of ['CountryFlag', 'DateTimeField', 'Icon', 'Sheet', 'CountryPicker', 'EventCompanionsPanel']) imports[`../components/${name}`] = { [name]: name };
  const screen = modules(imports, {
    window: { addEventListener() {}, removeEventListener() {} }, document: { addEventListener() {}, removeEventListener() {} },
  })('mobile/src/screens/EventsScreen.tsx');
  const onNotice = () => {};
  const render = (next = {}) => { props = { ...props, ...next }; return host.render(() => screen.EventsScreen({
    ...props, onFiltersChange: value => reported.push(plain(value)), onContextHandled: () => handled.push(true),
    onOpenAccount() {}, onOpenSaved() {}, onNavigate() {}, onNotice,
  })); };
  const api = { render, cityRequests, searchRequests, reported, handled, writes,
    async cities(index, rows = []) { cityRequests[index].resolve(rows); await tick(); return render(); },
    async failCities(index) { cityRequests[index].reject(Error('Synthetic city-list failure')); await tick(); return render(); },
    async result(index) { searchRequests[index].resolve({ data: [], meta: { providerConfigured: true } }); await tick(); return render(); },
    locale(value) { currentLocale = value; return render(); }, dispose: () => host.dispose(),
  };
  render(); return api;
}

for (const locale of ['tr', 'en', 'sq', 'ro']) {
  test(`${locale}: actual country-only discovery intent excludes the previous city and artist`, async () => {
    const initialContext = countryIntent('RO');
    assert.equal(initialContext.source, undefined); assert.equal(initialContext.cityName, undefined);
    const h = fixture({ locale, initialContext, initialFilters: previousFilters() });
    assert.equal(input(h.render()).props.value, '');
    assert.equal(nodes(h.render()).find(node => node.props?.id === 'event-city-input').props.value, '');
    assert.equal(h.searchRequests.length, 1);
    const request = h.searchRequests[0].params;
    assert.equal(request.countryCode, 'RO'); assert.equal(request.city, undefined); assert.equal(request.placeCode, undefined);
    assert.equal(request.query, ''); assert.equal(request.category, 'all');
    assert.equal(request.startDate, initialContext.startDate); assert.equal(request.endDate, initialContext.endDate);
    await h.cities(0, [{ name: 'Bucharest', placeCode: 'bucharest-id' }]);
    assert.equal(h.searchRequests.length, 1, 'Loading city suggestions must not select or search a city automatically');
    assert.equal(h.handled.length, 1); assert.equal(h.reported.at(-1).cityName, undefined); assert.equal(h.reported.at(-1).query, '');
    assert.deepEqual(h.writes, []); h.dispose();
  });

  test(`${locale}: nearby context without a source resets once and preserves later deliberate edits`, async () => {
    const initialContext = await nearbyIntent();
    assert.equal(initialContext.source, undefined); assert.equal(initialContext.countryCode, 'IT'); assert.equal(initialContext.cityName, 'Roma');
    const h = fixture({ locale, initialContext, initialFilters: previousFilters() });
    assert.equal(input(h.render()).props.value, ''); assert.equal(h.searchRequests.length, 0);
    await h.cities(0, [{ name: 'Roma', placeCode: 'rome-id' }]);
    const request = h.searchRequests[0].params;
    assert.equal(request.countryCode, 'IT'); assert.equal(request.city, 'Roma'); assert.equal(request.placeCode, 'rome-id');
    assert.equal(request.query, ''); assert.equal(request.category, 'all'); assert.equal(h.handled.length, 1);
    await h.result(0);
    input(h.render()).props.onChange({ target: { value: 'My Rome artist' } });
    h.render({ initialContext: undefined, initialFilters: previousFilters() });
    const view = h.locale(locale === 'ro' ? 'en' : 'ro');
    assert.equal(input(view).props.value, 'My Rome artist');
    nodes(view).find(node => node.type === 'form' && node.props.role === 'search').props.onSubmit({ preventDefault() {} });
    h.render(); assert.equal(h.searchRequests[1].params.query, 'My Rome artist'); assert.equal(h.searchRequests[1].params.city, 'Roma');
    assert.equal(h.handled.length, 1); h.dispose();
  });

  test(`${locale}: profile and saved-event detail overrides keep the existing search and exact event`, () => {
    const event = { id: 'saved-milan-event', title: 'Exact Milan event', city: 'Milan', countryCode: 'IT',
      category: 'culture', status: 'scheduled', startsAt: `${dates.localIsoDate(1)}T12:00:00Z`,
      sourceUrl: 'https://example.test/event', description: 'Fixture event' };
    for (const kind of ['profileEvent', 'focusEventId']) {
      const h = fixture({ locale, initialFilters: previousFilters(), savedEvents: [event] });
      let handled = 0;
      const view = h.render(kind === 'profileEvent'
        ? { profileEvent: event, onProfileEventHandled: () => { handled++; } }
        : { focusEventId: event.id, onFocusHandled: () => { handled++; } });
      const detail = nodes(view).find(node => node.type === 'Sheet' && node.props.open);
      assert.ok(detail); assert.equal(nodes(detail).find(node => node.type === 'h3').props.children, event.title);
      assert.equal(input(view).props.value, 'Previous artist'); assert.equal(h.searchRequests[0].params.city, 'Paris');
      assert.equal(h.handled.length, 0); assert.equal(handled, 1);
      assert.deepEqual(h.writes, []); h.dispose();
    }
  });

  test(`${locale}: actual city callback starts the first search in its own city without an inherited artist`, async () => {
    const initialContext = cityIntent(locale), h = fixture({ locale, initialContext, initialFilters: previousFilters() });
    assert.equal(initialContext.source, 'city'); assert.equal(initialContext.cityName, 'Rome'); assert.equal(initialContext.countryCode, 'IT');
    assert.equal(h.cityRequests[0].country, 'IT'); assert.equal(h.searchRequests.length, 0, 'Wait for country city options before the automatic request');
    assert.equal(input(h.render()).props.value, '');
    await h.cities(0, [{ name: 'Roma', placeCode: 'rome-id' }]);
    assert.equal(h.searchRequests.length, 1);
    const request = h.searchRequests[0].params;
    assert.equal(request.countryCode, 'IT'); assert.equal(request.city, 'Roma'); assert.equal(request.placeCode, 'rome-id');
    assert.equal(request.query, ''); assert.equal(request.category, 'all');
    assert.equal(request.startDate, initialContext.startDate); assert.equal(request.endDate, initialContext.endDate);
    assert.equal(h.handled.length, 1); assert.equal(h.reported.at(-1).query, ''); assert.deepEqual(h.writes, []);
    h.dispose();
  });

  test(`${locale}: ordinary event return keeps the saved keyword and locale changes preserve current edits`, async () => {
    const filters = previousFilters(), h = fixture({ locale, initialFilters: filters });
    assert.equal(input(h.render()).props.value, 'Previous artist');
    assert.equal(h.searchRequests[0].params.query, 'Previous artist');
    assert.equal(h.searchRequests[0].params.countryCode, 'FR'); assert.equal(h.searchRequests[0].params.city, 'Paris');
    assert.equal(h.searchRequests[0].params.category, 'concert');
    await h.cities(0, [{ name: 'Paris', placeCode: 'paris-id' }]); await h.result(0);
    input(h.render()).props.onChange({ target: { value: 'My next artist' } });
    const view = h.locale(locale === 'ro' ? 'tr' : 'ro');
    assert.equal(input(view).props.value, 'My next artist');
    assert.equal(h.searchRequests.length, 1, 'Changing language alone must not run or reset the search');
    nodes(view).find(node => node.type === 'form' && node.props.role === 'search').props.onSubmit({ preventDefault() {} });
    h.render(); assert.equal(h.searchRequests[1].params.query, 'My next artist');
    assert.equal(h.searchRequests[1].params.city, 'Paris'); h.dispose();
  });

  test(`${locale}: the one-time city keyword reset does not clear a newly typed artist after context acknowledgement`, async () => {
    const h = fixture({ locale, initialContext: cityIntent(locale, 'OTP'), initialFilters: previousFilters() });
    await h.cities(0, [{ name: 'Bucharest', placeCode: 'bucharest-id' }]); await h.result(0);
    input(h.render()).props.onChange({ target: { value: 'Chosen artist' } });
    h.render({ initialContext: undefined, initialFilters: { ...previousFilters(), query: 'Unrelated later cache' } });
    const view = h.locale(locale === 'sq' ? 'en' : 'sq');
    assert.equal(input(view).props.value, 'Chosen artist');
    nodes(view).find(node => node.type === 'form' && node.props.role === 'search').props.onSubmit({ preventDefault() {} });
    h.render(); const request = h.searchRequests[1].params;
    assert.equal(request.query, 'Chosen artist'); assert.equal(request.city, 'Bucharest'); assert.equal(request.countryCode, 'RO');
    assert.equal(h.handled.length, 1); h.dispose();
  });
}

test('An unreadable city list retains the exact city intent and still excludes the old keyword', async () => {
  const h = fixture({ initialContext: cityIntent('en'), initialFilters: previousFilters() });
  await h.failCities(0);
  assert.equal(h.searchRequests.length, 1);
  const request = h.searchRequests[0].params;
  assert.equal(request.countryCode, 'IT'); assert.equal(request.city, 'Rome'); assert.equal(request.placeCode, undefined);
  assert.equal(request.query, ''); assert.equal(request.category, 'all'); h.dispose();
});

test('The actual App owner guard excludes another account’s saved event filters on a fresh ordinary screen', () => {
  const filters = previousFilters();
  const getFilters = ownerId => evaluate(attribute('EventsScreen', 'initialFilters'), {
    ownerId, eventFilters: { owner: 'owner-a', tripKey: '', filters }, activeTripKey: '',
  });
  assert.deepEqual(plain(getFilters('owner-a')), filters);
  assert.equal(getFilters('owner-b'), undefined);
  const h = fixture({ ownerId: 'owner-b', initialFilters: getFilters('owner-b') });
  assert.equal(input(h.render()).props.value, '');
  assert.equal(h.searchRequests[0].params.query, ''); assert.equal(h.searchRequests[0].params.countryCode, 'TR');
  assert.deepEqual(h.writes, []); h.dispose();
});

test('The actual App trip guard opens a changed active trip without the previous trip filters', async () => {
  const scope = { ownerId: 'owner-a', activeTripKey: 'new-trip', eventSearchContext: null,
    activeTrip: { countryCode: 'IT', city: 'Milan', startDate: dates.localIsoDate(1), endDate: dates.localIsoDate(5) },
    eventFilters: { owner: 'owner-a', tripKey: 'old-trip', filters: previousFilters() } };
  const initialContext = evaluate(attribute('EventsScreen', 'initialContext'), scope);
  const initialFilters = evaluate(attribute('EventsScreen', 'initialFilters'), scope);
  assert.equal(initialFilters, undefined); assert.equal(initialContext.source, undefined);
  const h = fixture({ initialContext, initialFilters });
  await h.cities(0, [{ name: 'Milan', placeCode: 'milan-id' }]);
  assert.equal(h.searchRequests[0].params.city, 'Milan'); assert.equal(h.searchRequests[0].params.query, '');
  assert.equal(h.handled.length, 1); h.dispose();
});
