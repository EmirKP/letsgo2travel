import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const plain = value => JSON.parse(JSON.stringify(value));
const jsx = (type, props) => ({ type, props });
function evaluate(expression, globals = {}) {
  const code = ts.transpileModule(`module.exports = (${expression});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const fixtureModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, globals)(id => {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    throw Error(`Unexpected expression dependency: ${id}`);
  }, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
function modules(overrides = {}, globals = {}) {
  const cache = new Map();
  const load = filename => {
    const full = path.resolve(filename);
    if (Object.hasOwn(overrides, full)) return overrides[full];
    if (cache.has(full)) return cache.get(full).exports;
    if (/\.(webp|png|svg)$/.test(full)) return { __esModule: true, default: full };
    if (full.endsWith('.json')) return JSON.parse(readFileSync(full, 'utf8'));
    const fixtureModule = { exports: {} }; cache.set(full, fixtureModule);
    const source = ts.transpileModule(readFileSync(full, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
      Date, Intl, URL, fetch() { throw Error('No network in city-flow tests'); }, ...globals,
    })(id => {
      if (!id.startsWith('.')) throw Error(`Unexpected module dependency: ${id}`);
      const base = path.resolve(path.dirname(full), id);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!target) throw Error(`Missing city-flow dependency: ${id}`);
      return load(target);
    }, fixtureModule, fixtureModule.exports);
    return fixtureModule.exports;
  };
  return load;
}
const catalog = modules()('mobile/src/data/cityDestinations.ts');
test('Every displayed city is searchable by its localized name with the same destination and photo', () => {
  const search = modules()('mobile/src/lib/globalSearch.ts').searchApp;
  for (const locale of ['tr', 'en', 'sq', 'ro']) {
    for (const city of catalog.cityDestinations(locale)) {
      const results = search(city.name, locale, [], 'city');
      const match = results.find(result => result.destinationCode === city.code);
      assert.ok(match, `${locale}: ${city.name} must be found in app search`);
      assert.equal(match.title, city.name);
      assert.equal(match.photo, city.photo);
      assert.equal(results.filter(result => result.destinationCode === city.code).length, 1);
      assert.equal(results.filter(result => result.title === city.name && result.subtitle === city.country).length, 1, 'A legacy airport alias must not duplicate the same city');
    }
  }
});
const navigation = modules()('mobile/src/lib/cityNavigation.ts');
function ast(file) { return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function locate(source, predicate) {
  let match;
  const visit = node => { if (!match && predicate(node)) match = node; if (!match) ts.forEachChild(node, visit); };
  visit(source); assert.ok(match, 'The production expression under test must exist'); return match;
}
function variable(source, name) {
  return locate(source, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name).initializer;
}
const app = ast('mobile/src/App.tsx');
function appFunction(name, globals) {
  const declaration = variable(app, name);
  return evaluate((ts.isCallExpression(declaration) ? declaration.arguments[0] : declaration).getText(app), globals);
}

function pinsHarness(storage = new Map()) {
  let serial = 0;
  const state = { writes: 0, removes: 0, failRead: false, failWrite: false, writtenKeys: [] };
  const window = new EventTarget();
  const localStorage = {
    getItem(key) { if (state.failRead) throw Error('Blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (state.failWrite) throw Error('Quota'); storage.set(key, value); state.writes++; state.writtenKeys.push(key); },
    removeItem(key) { state.removes++; storage.delete(key); },
  };
  class CustomEvent extends Event { constructor(name, options = {}) { super(name); this.detail = options.detail; } }
  const load = modules({ [path.resolve('mobile/src/lib/id.ts')]: { createId: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}` } }, { localStorage, window, Event, CustomEvent });
  return { api: load('mobile/src/lib/personalMapPins.ts'), state, storage, window };
}

// Run the actual App navigation/handlers in memory. Unrelated React, network,
// device and account effects never run; the browser history model is synthetic.
function appHarness({ href = 'https://local.test/#home', historyState = null, historyEntries, historyIndex = 0, locale = 'en' } = {}) {
  const state = { activeView: 'home', cityCode: navigation.cityCodeFromUrl(href), cityDiscoveryCountry: navigation.cityCountryFromUrl(href), cityDiscoveryQuery: '', cityBudgetRequest: null, visitedViews: ['home'], scrollPositions: {}, exploreSearch: { query: '', requestId: 0 }, routeResetToken: 0, mapRequestId: 0, toolRequest: null, notices: [], events: [], readyRoutes: [], countryChoices: [], savedCityRequests: [] };
  const location = { href, origin: 'https://local.test' }, listeners = new Map();
  const entries = historyEntries ? plain(historyEntries) : [{ url: href, state: historyState }]; let position = historyEntries ? historyIndex : 0;
  const window = {
    location, scrollY: 0, scrollTo() {}, requestAnimationFrame: fn => fn(), matchMedia: () => ({ matches: true }),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    history: {
      scrollRestoration: 'auto', get state() { return entries[position].state; },
      pushState(value, _title, url) { entries.splice(position + 1); entries.push({ url: new URL(url, location.href).href, state: plain(value) }); position++; location.href = entries[position].url; },
      replaceState(value, _title, url) { entries[position] = { url: new URL(url, location.href).href, state: plain(value) }; location.href = entries[position].url; },
      back() { if (!position) return; position--; location.href = entries[position].url; listeners.get('popstate')?.({ state: plain(entries[position].state) }); },
    },
  };
  const context = { Date, URL, window, locale, ownerId: 'owner-a', cityCode: state.cityCode, cityDiscoveryCountry: state.cityDiscoveryCountry, cityDiscoveryQuery: '', savedCities: { owner: 'owner-a', codes: [] }, CityDestinationScreen: 'CityDestinationScreen', CityDiscoveryScreen: 'CityDiscoveryScreen',
    toggleCitySaved: code => state.savedCityRequests.push(code),
    ...navigation, ...catalog, copy: (_tr, en) => en, activeViewRef: { current: 'home' }, activeTabRef: { current: 'home' }, historyDepth: { current: 0 }, mainRef: { current: null }, toolRequestCounter: { current: 0 },
    tabDefinitions: ['home', 'trips', 'community', 'companion', 'profile'].map(id => ({ id })), impact: async () => {},
    selectTravelCountry: code => state.countryChoices.push(code), openNearbyEvents: value => state.events.push(plain(value)), openSeededRoute: (route, kind) => state.readyRoutes.push({ route, kind }), showNotice: value => state.notices.push(value),
    localIsoDate: offset => { const date = new Date('2030-07-10T12:00:00Z'); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); },
  };
  for (const key of ['ActiveView', 'CityCode', 'CityDiscoveryCountry', 'CityDiscoveryQuery', 'CityBudgetRequest', 'VisitedViews', 'ScrollPositions', 'ExploreSearch', 'OpenTransfer', 'ExploreCode', 'NavigationDirection', 'ActiveTab', 'CommunityCountryCode', 'RoutePlaceName', 'RouteArea', 'SurpriseRoute', 'RouteResetToken', 'MapRequestId', 'ToolRequest']) {
    const field = key[0].toLowerCase() + key.slice(1);
    context[`set${key}`] = value => { state[field] = typeof value === 'function' ? value(state[field]) : value; context[field] = state[field]; };
  }
  for (const name of ['rootTabFor', 'navigationTabFor', 'viewFromUrl']) {
    const declaration = locate(app, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    context[name] = evaluate(declaration.getText(app), context);
  }
  context.validViews = evaluate(variable(app, 'validViews').getText(app), context);
  state.activeView = context.viewFromUrl(href) || 'home'; context.activeView = state.activeView; context.activeViewRef.current = state.activeView;
  context.activeTabRef.current = context.rootTabFor(state.activeView);
  const budget = locate(app, node => ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.name.elements[0]?.name?.getText(app) === 'cityBudgetRequest');
  state.cityBudgetRequest = evaluate(budget.initializer.arguments[0].getText(app), context)();
  const effect = locate(app, node => ts.isCallExpression(node) && node.expression.getText(app) === 'useEffect' && node.arguments[0]?.getText(app).includes('const initialCityCode = cityCodeFromUrl'));
  evaluate(effect.arguments[0].getText(app), context)();
  for (const name of ['navigate', 'searchDestinations', 'openCity', 'openCityCountry', 'planCity', 'mapCity', 'goBack', 'renderView']) context[name] = appFunction(name, context);
  return { state, context, window, entries, get position() { return position; }, destination: () => context.renderView('city') };
}

test('City URLs survive refresh and Back, including switching cities without leaving the city view', () => {
  const h = appHarness();
  h.context.openCity('CDG'); assert.equal(h.window.location.href, 'https://local.test/#city/CDG');
  h.context.openCity('FCO'); assert.equal(h.window.location.href, 'https://local.test/#city/FCO'); assert.equal(h.state.cityCode, 'FCO');
  const depth = h.entries.length; h.context.openCity('FCO'); assert.equal(h.entries.length, depth, 'Reopening the current city does not add a duplicate history entry');
  const refreshed = appHarness({ href: h.window.location.href, historyEntries: h.entries, historyIndex: h.position });
  assert.equal(refreshed.state.cityCode, 'FCO'); assert.equal(refreshed.destination().props.destination.name, 'Rome');
  refreshed.context.goBack(); assert.equal(refreshed.state.cityCode, 'CDG'); assert.equal(refreshed.window.location.href, 'https://local.test/#city/CDG');
  h.window.history.back(); assert.equal(h.state.cityCode, 'CDG'); assert.equal(h.window.location.href, 'https://local.test/#city/CDG');
  h.window.history.back(); assert.equal(h.state.activeView, 'home'); assert.equal(h.window.location.href, 'https://local.test/#home');
});

test('All destinations retain the Home tab, exact city entry and account-scoped hearts across refresh and Back', () => {
  const h = appHarness();
  h.context.navigate('cities');
  assert.equal(h.state.activeView, 'cities');
  assert.equal(h.context.activeTabRef.current, 'home');
  assert.equal(h.window.location.href, 'https://local.test/#cities');
  h.context.savedCities = { owner: 'owner-a', codes: ['FCO'] };
  const screen = h.context.renderView('cities');
  assert.equal(screen.type, 'CityDiscoveryScreen');
  assert.deepEqual(plain(screen.props.savedCityCodes), ['FCO']);
  screen.props.onToggleCitySaved('CDG');
  assert.deepEqual(h.state.savedCityRequests, ['CDG']);
  screen.props.onQueryChange('Sırbistan');
  assert.equal(h.context.renderView('cities').props.initialQuery, 'Sırbistan');
  h.context.savedCities = { owner: 'another-owner', codes: ['FCO'] };
  assert.deepEqual(plain(h.context.renderView('cities').props.savedCityCodes), []);
  screen.props.onOpenCity('FCO');
  assert.equal(h.state.cityCode, 'FCO');
  h.context.goBack();
  assert.equal(h.state.activeView, 'cities');
  const refreshed = appHarness({ href: h.window.location.href, historyEntries: h.entries, historyIndex: h.position });
  assert.equal(refreshed.state.activeView, 'cities');
  refreshed.context.renderView('cities').props.onBack();
  assert.equal(refreshed.state.activeView, 'home');
});

test('Country catalogue history survives city entry, refresh, same-view country changes and a direct-link Back', () => {
  const h = appHarness(); h.context.navigate('cities');
  h.context.renderView('cities').props.onOpenCountry('FR');
  assert.equal(h.window.location.href, 'https://local.test/#cities/FR');
  assert.equal(h.context.renderView('cities').props.countryCode, 'FR');
  assert.equal(h.context.activeTabRef.current, 'home');
  h.context.openCity('CDG'); h.context.goBack();
  assert.equal(h.state.activeView, 'cities'); assert.equal(h.state.cityDiscoveryCountry, 'FR');
  const refreshed = appHarness({ href: h.window.location.href, historyEntries: h.entries, historyIndex: h.position });
  assert.equal(refreshed.context.renderView('cities').props.countryCode, 'FR');
  assert.equal(refreshed.window.location.href, 'https://local.test/#cities/FR');
  refreshed.context.goBack(); assert.equal(refreshed.state.cityDiscoveryCountry, null);
  assert.equal(refreshed.window.location.href, 'https://local.test/#cities');
  h.context.openCityCountry('IT');
  assert.equal(h.context.renderView('cities').props.countryCode, 'IT');
  const depth = h.entries.length; h.context.openCityCountry('IT'); assert.equal(h.entries.length, depth);
  h.context.openCityCountry('ZZ'); assert.equal(h.entries.length, depth);
  const deep = appHarness({ href: 'https://local.test/#cities/FR' });
  deep.context.goBack(); assert.equal(deep.state.activeView, 'cities'); assert.equal(deep.state.cityDiscoveryCountry, null);
  assert.equal(deep.window.location.href, 'https://local.test/#cities');
  for (const value of ['#cities/FR/extra', '#cities/F', '#cities/%46R', '#cities/FR?x', '#city/FCO']) assert.equal(navigation.cityCountryFromUrl(`https://local.test/${value}`), null);
  assert.equal(navigation.cityCountryFromUrl('https://local.test/#/cities/fr'), 'FR');
  for (const value of ['fr', ' FRA', '../FR', 'FR?x']) assert.throws(() => navigation.cityCatalogueHash(value), /invalid_country/);
});

test('Malformed city links cannot pick another destination, and unknown canonical-shaped codes have an explicit empty result', () => {
  for (const code of ['CDG', 'DPS', 'HND', 'FCO']) assert.equal(navigation.cityCodeFromUrl(`https://local.test/${navigation.cityHash(code)}`), code);
  assert.equal(navigation.cityCodeFromUrl('https://local.test/?from=home#/city/fco'), 'FCO');
  for (const hash of ['#city/', '#city/FCO/extra', '#city/%46CO', '#city/FC', '#city/FCO?next=home', '#city/<x>', '#profile']) assert.equal(navigation.cityCodeFromUrl(`https://local.test/${hash}`), null);
  for (const code of ['', 'fco', '../FCO', 'FCO?x', ' FCO']) assert.throws(() => navigation.cityHash(code), /invalid_destination/);
  const h = appHarness(); h.context.openCity('ZZZ'); assert.equal(h.state.activeView, 'home'); assert.equal(h.entries.length, 1);
  const invalid = appHarness({ href: 'https://local.test/#city/ZZZ' }); assert.equal(catalog.cityDestination('ZZZ', 'en'), null); assert.equal(invalid.destination().type, 'section');
});

test('Budget history preserves the canonical city across Back and refresh while ignoring unrelated or unbounded state', () => {
  const h = appHarness({ locale: 'sq' }); h.context.openCity('FCO'); h.destination().props.onBudget();
  assert.equal(h.state.cityBudgetRequest.query, 'Rome'); assert.equal(h.window.history.state.budgetCityQuery, 'Rome');
  h.context.navigate('costs', { budgetCityQuery: 'Paris' }); assert.equal(h.state.cityBudgetRequest.query, 'Paris');
  h.window.history.back(); assert.equal(h.state.cityBudgetRequest.query, 'Rome');
  const refreshed = appHarness({ href: h.window.location.href, historyEntries: h.entries, historyIndex: h.position });
  assert.equal(refreshed.state.cityBudgetRequest.query, 'Rome'); assert.equal(refreshed.window.history.state.budgetCityQuery, 'Rome');
  refreshed.context.goBack(); assert.equal(refreshed.state.activeView, 'city'); assert.equal(refreshed.state.cityCode, 'FCO');
  refreshed.context.goBack(); assert.equal(refreshed.state.activeView, 'home');
  const long = appHarness({ href: 'https://local.test/#costs', historyState: { budgetCityQuery: `  ${'a'.repeat(150)}  ` } });
  assert.equal(long.state.cityBudgetRequest.query.length, 120); assert.equal(long.window.history.state.budgetCityQuery.length, 120);
  for (const [href, budgetCityQuery] of [['#home', 'Rome'], ['#costs', 7], ['#costs', '   ']]) assert.equal(appHarness({ href: `https://local.test/${href}`, historyState: { budgetCityQuery } }).state.cityBudgetRequest, null);
  assert.equal(appHarness({ href: 'https://local.test/#city/FCO', historyState: { view: 'city', depth: 4000 } }).context.historyDepth.current, 1000);
  assert.equal(appHarness({ href: 'https://local.test/#city/FCO', historyState: { view: 'city', depth: -3 } }).context.historyDepth.current, 0);
  assert.equal(appHarness({ href: 'https://local.test/#home', historyState: { view: 'home', depth: 10 } }).context.historyDepth.current, 0);
});

test('City save uses one existing personal-pin document write and owner-filtered events, with no route or provider record', () => {
  const h = pinsHarness(), city = catalog.cityDestination('FCO', 'en'); let ownerChanges = 0, otherChanges = 0;
  const stop = h.api.subscribePersonalMapPins(() => ownerChanges++, 'owner-a'), other = h.api.subscribePersonalMapPins(() => otherChanges++, 'owner-b');
  assert.equal(h.api.toggleCityMapPin(city, 'owner-a'), true); assert.equal(h.state.writes, 1); assert.equal(h.state.removes, 0); assert.equal(h.storage.size, 1);
  const item = h.api.readPersonalMapPins('owner-a').items[0]; assert.equal(item.destinationCode, 'FCO'); assert.equal(item.name, 'Rome'); assert.equal(item.latitude, city.center.latitude);
  assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'destinationCode', 'id', 'inDay', 'latitude', 'longitude', 'name', 'note']);
  assert.match(item.id, /^personal\//); assert.equal(item.inDay, false); assert.equal(h.api.personalPinPlace(item).id, item.id);
  assert.equal(ownerChanges, 1); assert.equal(otherChanges, 0); assert.equal(h.api.readPersonalMapPins().items.length, 0); assert.equal(h.api.readPersonalMapPins('owner-b').items.length, 0);
  h.api.toggleCityMapPin(city); assert.equal(h.state.writes, 2); assert.equal(h.api.readPersonalMapPins().items.length, 1); assert.equal(h.api.readPersonalMapPins('owner-a').items.length, 1); stop(); other();
});

test('City un-save is code-based after rename and never deletes a user pin at exactly the same coordinates', () => {
  const h = pinsHarness(), city = catalog.cityDestination('FCO', 'en');
  const manual = h.api.savePersonalMapPin(city.center, 'My meeting spot', 'owner-a'); h.api.updatePersonalMapPin(manual.id, { note: 'Meet at noon', inDay: true }, 'owner-a');
  const keep = plain(h.api.readPersonalMapPins('owner-a').items[0]); h.api.toggleCityMapPin(city, 'owner-a');
  const saved = h.api.readPersonalMapPins('owner-a').items.find(item => item.destinationCode === 'FCO');
  h.api.updatePersonalMapPin(saved.id, { name: 'My renamed base', note: 'Private note', inDay: true }, 'owner-a');
  assert.equal(h.api.readPersonalMapPins('owner-a').items.find(item => item.id === saved.id).destinationCode, 'FCO');
  assert.equal(h.api.toggleCityMapPin({ ...city, name: 'Roma' }, 'owner-a'), false); assert.deepEqual(plain(h.api.readPersonalMapPins('owner-a').items), [keep]);
  assert.equal(h.api.toggleCityMapPin(city, 'owner-a'), true); const again = h.api.readPersonalMapPins('owner-a').items.find(item => item.destinationCode === 'FCO');
  assert.notEqual(again.id, saved.id); assert.equal(again.note, ''); assert.equal(again.inDay, false); assert.deepEqual(plain(h.api.readPersonalMapPins('owner-a').items.find(item => item.id === manual.id)), keep);
});

test('All 50 city hearts fit the existing saved collection and removing one preserves every other city', () => {
  const h = pinsHarness(), cities = catalog.cityDestinations('tr');
  assert.equal(cities.length, 50);
  for (const city of cities) assert.equal(h.api.toggleCityMapPin(city, 'owner-a'), true);
  const saved = h.api.readPersonalMapPins('owner-a');
  assert.equal(saved.error, null);
  assert.equal(saved.items.length, 50);
  assert.equal(new Set(saved.items.map(item => item.destinationCode)).size, 50);
  assert.equal(h.api.readPersonalMapPins('owner-b').items.length, 0);
  const removed = cities[25];
  const preserved = plain(saved.items.filter(item => item.destinationCode !== removed.code));
  assert.equal(h.api.toggleCityMapPin(removed, 'owner-a'), false);
  assert.deepEqual(plain(h.api.readPersonalMapPins('owner-a').items), preserved);
});

test('Storage failures, copied owners and malformed destination metadata never overwrite prior city bookmarks', () => {
  const h = pinsHarness(), rome = catalog.cityDestination('FCO', 'en'), paris = catalog.cityDestination('CDG', 'en'); h.api.toggleCityMapPin(rome, 'owner-a');
  const key = h.state.writtenKeys[0], before = h.storage.get(key); let changes = 0; h.api.subscribePersonalMapPins(() => changes++, 'owner-a');
  h.state.failWrite = true; assert.throws(() => h.api.toggleCityMapPin(rome, 'owner-a'), /unavailable/); assert.throws(() => h.api.toggleCityMapPin(paris, 'owner-a'), /unavailable/);
  assert.equal(h.storage.get(key), before); assert.equal(h.state.writes, 1); assert.equal(h.state.removes, 0); assert.equal(changes, 0);
  h.state.failWrite = false; h.state.failRead = true; assert.throws(() => h.api.toggleCityMapPin(paris, 'owner-a'), /unavailable/); assert.equal(h.storage.get(key), before); h.state.failRead = false;
  h.api.toggleCityMapPin(paris, 'owner-b'); const otherKey = h.state.writtenKeys.at(-1); h.storage.set(otherKey, before);
  assert.equal(h.api.readPersonalMapPins('owner-b').error, 'corrupt'); assert.throws(() => h.api.toggleCityMapPin(paris, 'owner-b'), /corrupt/); assert.equal(h.storage.get(otherKey), before);
  const corrupt = JSON.parse(before); corrupt.items[0].destinationCode = 'fco'; h.storage.set(key, JSON.stringify(corrupt)); const raw = h.storage.get(key);
  assert.equal(h.api.readPersonalMapPins('owner-a').error, 'corrupt'); assert.throws(() => h.api.toggleCityMapPin(rome, 'owner-a'), /corrupt/); assert.equal(h.storage.get(key), raw);
});

test('The existing Places library count includes city bookmarks once and capacity never evicts earlier pins', () => {
  const h = pinsHarness(), rome = catalog.cityDestination('FCO', 'en'), paris = catalog.cityDestination('CDG', 'en');
  h.api.toggleCityMapPin(rome, 'owner-a'); h.api.savePersonalMapPin(rome.center, 'Another pin', 'owner-a');
  const plans = ast('mobile/src/screens/PlansScreen.tsx');
  const count = () => evaluate(variable(plans, 'categories').getText(plans), { copy: (_tr, en) => en, routes: [], cloudRoutes: [], savedEvents: [], favorites: [], savedPlaces: { items: [{ id: 'provider-a' }, { id: 'provider-b' }] }, personalPins: h.api.readPersonalMapPins('owner-a') });
  assert.equal(count().find(item => item.id === 'places').count, 4); assert.equal(count().find(item => item.id === 'routes').count, 0);
  h.api.toggleCityMapPin(rome, 'owner-a'); assert.equal(count().find(item => item.id === 'places').count, 3);
  h.api.toggleCityMapPin(rome, 'owner-a'); for (let i = 2; i < h.api.MAX_PERSONAL_MAP_PINS; i++) h.api.savePersonalMapPin(rome.center, `Pin ${i}`, 'owner-a');
  const before = h.storage.get(h.state.writtenKeys.at(-1)); assert.throws(() => h.api.toggleCityMapPin(paris, 'owner-a'), /full/); assert.equal(h.storage.get(h.state.writtenKeys.at(-1)), before);
  assert.equal(h.api.toggleCityMapPin(rome, 'owner-a'), false); assert.equal(h.api.toggleCityMapPin(paris, 'owner-a'), true); assert.equal(h.api.readPersonalMapPins('owner-a').items.length, 100);
});

test('App city actions retain canonical budget/event context and exact map points without saving a fake route', () => {
  for (const locale of ['tr', 'en', 'sq', 'ro']) {
    const h = appHarness({ locale }); h.context.openCity('FCO'); const city = h.destination().props.destination, actions = h.destination().props;
    actions.onBudget(); assert.equal(h.state.cityBudgetRequest.query, locale === 'tr' ? 'Roma' : 'Rome');
    actions.onEvents(); assert.deepEqual(h.state.events[0], { source: 'city', countryCode: 'IT', cityName: 'Rome', startDate: '2030-07-10', endDate: '2030-07-17' });
    actions.onMap(city.highlights[1]); assert.deepEqual(h.state.countryChoices, ['IT']); assert.equal(h.state.toolRequest.tool, 'map'); assert.equal(h.state.toolRequest.country, 'IT');
    assert.deepEqual(plain(h.state.toolRequest.mapSearch.center), { latitude: city.highlights[1].latitude, longitude: city.highlights[1].longitude }); assert.equal(h.state.toolRequest.mapSearch.label, city.highlights[1].name);
    actions.onPlan(); assert.deepEqual(plain(h.state.routeArea), { ...plain(city.center), name: city.name }); assert.equal(h.state.activeView, 'route'); assert.equal(h.state.routeResetToken, 1); assert.equal(h.state.mapRequestId, 1); assert.equal(h.state.readyRoutes.length, 0);
    actions.onOpenReadyRoute(); assert.equal(h.state.readyRoutes.length, 1); assert.equal(h.state.readyRoutes[0].route.destinationCode, 'FCO'); assert.equal(h.state.readyRoutes[0].kind, 'explore');
    h.context.openCity('HND'); h.destination().props.onOpenReadyRoute(); assert.equal(h.state.readyRoutes.length, 1, 'A city without a real ready route does not fabricate one');
    h.context.savedCities = { owner: 'previous-owner', codes: ['HND'] }; assert.equal(h.destination().props.saved, false, 'Another owner cannot flash a saved city');
  }
});

test('Nearby map searches start after the incoming city intent id rather than colliding with it', () => {
  const source = ast('mobile/src/screens/TravelCompanionScreen.tsx');
  const initial = variable(source, 'nearbySearchId').arguments[0];
  const callback = locate(source, node => ts.isJsxAttribute(node) && node.name.text === 'onSearch' && node.initializer?.getText(source).includes('++nearbySearchId.current')).initializer.expression;
  for (const incoming of [undefined, { id: 1 }, { id: 18 }]) {
    const writes = [], globals = { initialMapSearch: incoming, setNearbySearch: next => writes.push(next) };
    globals.nearbySearchId = { current: evaluate(initial.getText(source), globals) };
    const onSearch = evaluate(callback.getText(source), globals); onSearch('museum', { latitude: 41.9, longitude: 12.5 }, 'museum'); onSearch('cafe', { latitude: 41.91, longitude: 12.51 }, 'cafe');
    assert.deepEqual(writes.map(item => item.id), [(incoming?.id || 0) + 1, (incoming?.id || 0) + 2]); assert.equal(writes[1].category, 'cafe');
  }
});
