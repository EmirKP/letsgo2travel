import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const loaderSource = compile('mobile/src/lib/appleMapKit.ts');
const authorizationSource = compile('mobile/src/lib/appleMapAuthorization.ts');
const componentSource = compile('mobile/src/components/AppleJourneyMap.tsx');
const placesModule = { exports: {} };
vm.runInNewContext(`(function(module,exports){${compile('lib/travel-assistant/places.ts')}\n})`, { URL })(placesModule, placesModule.exports);
const categoryModule = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${compile('mobile/src/components/journeyMapCategory.ts')}\n})`)(() => placesModule.exports, categoryModule, categoryModule.exports);
const json = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
class Events {
  listeners = new Map();
  addEventListener(name, callback) { const set = this.listeners.get(name) ?? new Set(); set.add(callback); this.listeners.set(name, set); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  fire(name, data = {}) { for (const callback of [...this.listeners.get(name) ?? []]) callback(data); }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
function mapKit() {
  const kit = new Events();
  kit.maps = []; kit.initCalls = []; kit.autoAuthorize = true;
  kit.load = async () => kit;
  kit.init = options => { kit.initCalls.push(options); if (kit.autoAuthorize) kit.fire('configuration-change', { status: 'Initialized' }); };
  kit.Coordinate = class { constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); } };
  kit.CoordinateSpan = class { constructor(latitudeDelta, longitudeDelta) { Object.assign(this, { latitudeDelta, longitudeDelta }); } };
  kit.CoordinateRegion = class { constructor(center, span) { Object.assign(this, { center, span }); } };
  kit.Padding = class { constructor(top, right, bottom, left) { Object.assign(this, { top, right, bottom, left }); } };
  kit.MarkerAnnotation = class { constructor(coordinate, options) { Object.assign(this, options, { coordinate, options }); } };
  kit.Annotation = class { constructor(coordinate, factory, options) {
    const allowed = new Set(['title', 'accessibilityLabel', 'animates', 'draggable', 'calloutEnabled', 'selected', 'enabled', 'clusteringIdentifier', 'displayPriority']);
    for (const key of Object.keys(options)) assert.ok(allowed.has(key), `Unsupported custom Annotation option: ${key}`);
    Object.assign(this, options, { coordinate, options, element: factory() });
  } };
  kit.PolylineOverlay = class { constructor(coordinates, options) { Object.assign(this, { coordinates, options }); } };
  kit.Style = class { constructor(options) { Object.assign(this, options); } };
  kit.MapType = { MutedStandard: 'mutedStandard' };
  kit.ColorScheme = { Adaptive: 'adaptive', Dark: 'dark', Light: 'light' };
  kit.FeatureVisibility = { Hidden: 'hidden' };
  kit.Map = class extends Events {
    calls = []; annotations = []; overlays = []; destroyed = false;
    constructor(element, options) { super(); Object.assign(this, { element, options, region: options.region, colorScheme: options.colorScheme }); kit.maps.push(this); }
    get center() { return this.region.center; }
    set selectedAnnotation(value) { this.selected = value; if (value) this.fire('select', { annotation: value }); }
    get selectedAnnotation() { return this.selected; }
    setRegionAnimated(region, animate) { this.region = region; this.calls.push(['region', json(region), animate]); this.fire('region-change-end'); }
    setCenterAnimated(center, animate) { this.region = { ...this.region, center }; this.calls.push(['center', json(center), animate]); this.fire('region-change-end'); }
    showItems(items, options) {
      this.calls.push(['fit', items, options]);
      const lat = items.map(item => item.coordinate.latitude), lon = items.map(item => item.coordinate.longitude);
      this.region = { center: { latitude: (Math.min(...lat) + Math.max(...lat)) / 2, longitude: (Math.min(...lon) + Math.max(...lon)) / 2 }, span: { latitudeDelta: 0.1, longitudeDelta: 0.1 } };
      this.fire('region-change-end');
    }
    destroy() { this.destroyed = true; }
  };
  return kit;
}
function loaderFixture(existing) {
  const scripts = [], timers = new Map(); let timerId = 0;
  const window = existing ? { mapkit: existing } : {};
  const document = { head: { appendChild(script) { scripts.push(script); } }, createElement() { return { attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, remove() { this.removed = true; } }; } };
  const fixtureModule = { exports: {} };
  vm.runInNewContext(`(function(module,exports){${loaderSource}\n})`, {
    window, document, setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
  })(fixtureModule, fixtureModule.exports);
  return { ...fixtureModule.exports, scripts, window, timers,
    ready(kit, index = scripts.length - 1) { window.mapkit = kit; window[scripts[index].attrs['data-callback']](); },
    expire() { const active = [...timers.values()]; timers.clear(); active.forEach(callback => callback()); },
  };
}

test('Apple loader rejects absent/private credentials before any download, and shares one official CDN request', async () => {
  const f = loaderFixture();
  await assert.rejects(f.loadAppleMapKit('', 'en'), { code: 'missing_configuration' });
  await assert.rejects(f.loadAppleMapKit('-----BEGIN PRIVATE KEY-----', 'en'), { code: 'missing_configuration' });
  assert.equal(f.scripts.length, 0);
  const first = f.loadAppleMapKit('public-domain-token', 'en'), second = f.loadAppleMapKit('public-domain-token', 'tr');
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, 'https://cdn.apple-mapkit.com/mk/6/mapkit.core.js');
  assert.equal(f.scripts[0].attrs['data-libraries'], 'full-map');
  assert.equal('data-token' in f.scripts[0].attrs, false, 'Token is delivered to the authorization callback, not DOM attributes');
  const kit = mapKit(); f.ready(kit);
  assert.deepEqual(await Promise.all([first, second]), [kit, kit]);
  assert.equal(kit.initCalls.length, 1);
  let token; kit.initCalls[0].authorizationCallback(value => { token = value; });
  assert.equal(token, 'public-domain-token');
  assert.equal(kit.language, 'tr');
  assert.equal(f.timers.size, 0);
  assert.equal(kit.listenerCount, 0);
});

test('Apple loader waits for both successful authorization and full-map, rejects auth failures, and permits a real retry', async () => {
  const kit = mapKit(); kit.autoAuthorize = false; const libraries = deferred(); kit.load = () => libraries.promise;
  const f = loaderFixture(kit); let resolved = false;
  const pending = f.loadAppleMapKit('token', 'en').then(value => { resolved = true; return value; });
  await tick(); libraries.resolve(kit); await tick();
  assert.equal(resolved, false, 'CDN/library success cannot claim authorized maps');
  kit.fire('configuration-change', { status: 'Initialized' });
  assert.equal(await pending, kit);
  const retry = f.loadAppleMapKit('token', 'en', true);
  const sameRetry = f.loadAppleMapKit('token', 'en', true);
  await tick(); kit.fire('error', { status: 'Unauthorized', token: 'must not leak' });
  await assert.rejects(retry, error => error.code === 'unavailable' && !error.message.includes('token'));
  await assert.rejects(sameRetry, { code: 'unavailable' });
  assert.equal(kit.listenerCount, 0);
  kit.autoAuthorize = true;
  assert.equal(await f.loadAppleMapKit('token', 'en'), kit);
  assert.equal(kit.initCalls.length, 3);
});

test('Apple CDN and auth deadlines clear failed work; late completion cannot settle a replacement request', async () => {
  const f = loaderFixture(); const timedOut = f.loadAppleMapKit('token', 'en');
  const oldCallback = f.scripts[0].attrs['data-callback']; f.expire();
  await assert.rejects(timedOut, { code: 'unavailable' });
  assert.equal(f.scripts[0].removed, true);
  const replacement = f.loadAppleMapKit('token', 'en');
  assert.equal(f.scripts.length, 2);
  f.window[oldCallback]();
  const kit = mapKit(); kit.autoAuthorize = false; f.ready(kit); await tick();
  f.expire(); await assert.rejects(replacement, { code: 'unavailable' });
  assert.equal(kit.listenerCount, 0);
  kit.fire('configuration-change', { status: 'Initialized' });
  kit.autoAuthorize = true;
  assert.equal(await f.loadAppleMapKit('token', 'en'), kit);
});

test('MapKit invokes a renewable provider for initialization and later refreshes, sharing initialization by provider identity', async () => {
  const kit = mapKit(); let issued = 0; const received = [];
  kit.init = options => { kit.initCalls.push(options); options.authorizationCallback(token => { received.push(token); kit.fire('configuration-change', { status: 'Initialized' }); }); };
  const provider = async () => `renewed-${++issued}`;
  const f = loaderFixture(kit);
  assert.deepEqual(await Promise.all([f.loadAppleMapKit(provider, 'en'), f.loadAppleMapKit(provider, 'tr')]), [kit, kit]);
  assert.equal(kit.initCalls.length, 1); assert.deepEqual(received, ['renewed-1']);
  kit.initCalls[0].authorizationCallback(token => received.push(token)); await tick();
  assert.deepEqual(received, ['renewed-1', 'renewed-2']); assert.equal(f.timers.size, 0);
});

test('Renewal failure and timeout surface after initialization; retry fences old callbacks and consumes late rejections', async () => {
  const kit = mapKit(), f = loaderFixture(kit), errors = []; let answer = Promise.resolve('first');
  const provider = () => answer;
  const unsubscribe = f.subscribeAppleMapAuthorizationErrors(error => errors.push(error.code));
  await f.loadAppleMapKit(provider, 'en');
  let called = false;
  answer = Promise.reject(new Error('private provider diagnostics'));
  kit.initCalls[0].authorizationCallback(() => { called = true; }); await tick();
  assert.deepEqual(errors, ['unavailable']); assert.equal(called, false);
  const hanging = deferred(); answer = hanging.promise;
  kit.initCalls[0].authorizationCallback(() => { called = true; }); await tick(); f.expire();
  assert.deepEqual(errors, ['unavailable', 'unavailable']);
  await f.loadAppleMapKit(provider, 'en', true);
  hanging.reject(new Error('late secret')); await tick(); assert.equal(called, false);
  const old = deferred(); answer = old.promise;
  kit.initCalls[1].authorizationCallback(() => { called = true; }); await tick();
  await f.loadAppleMapKit(provider, 'en', true);
  old.resolve('stale-token'); await tick(); assert.equal(called, false);
  answer = Promise.resolve('fresh');
  kit.initCalls[2].authorizationCallback(() => { throw Error('SDK refused callback'); }); await tick();
  assert.deepEqual(errors, ['unavailable', 'unavailable', 'unavailable']);
  unsubscribe(); assert.equal(f.timers.size, 0);
});

const authorizationNow = 1_800_000_000;
function jwt(origin = 'http://127.0.0.1:5173', changes = {}, headerChanges = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256', typ: 'JWT', kid: 'ABC123DEFG', ...headerChanges })}.${encode({ iss: 'DEF123GHIJ', iat: authorizationNow, exp: authorizationNow + 600, scope: 'mapkit_js', origin, ...changes })}.${Buffer.alloc(64).toString('base64url')}`;
}
const tokenBody = token => ({ token, expiresAt: new Date(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp * 1000).toISOString() });
const tokenResponse = (body = tokenBody(jwt()), status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function authorizationFixture(options = {}) {
  let now = authorizationNow * 1000, timerId = 0;
  const timers = new Map(), calls = [], fixtureModule = { exports: {} };
  const location = new URL(options.origin ?? 'http://127.0.0.1:5173');
  const config = { apiBaseUrl: 'https://www.letsgo2travel.com.tr', appleMapsToken: '', ...options.config };
  class AppleMapKitError extends Error { constructor(code) { super(code); this.code = code; } }
  const window = { location };
  vm.runInNewContext(`(function(require,module,exports){${authorizationSource}\n})`, {
    window, URL, atob, TextDecoder, AbortController,
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
    fetch: async (...args) => { calls.push(args); return options.fetch ? options.fetch(...args) : tokenResponse(); },
  })(name => {
    if (name === './config') return { config };
    if (name === './appleMapKit') return { AppleMapKitError };
    throw Error(`Unexpected authorization import ${name}`);
  }, fixtureModule, fixtureModule.exports);
  return { ...fixtureModule.exports, window, config, calls, timers,
    advance(seconds) { now += seconds * 1000; },
    expire() { const active = [...timers.values()]; timers.clear(); active.forEach(callback => callback()); },
  };
}

test('Only a current correctly scoped static token matching the actual browser origin bypasses the signing endpoint', async () => {
  const production = 'https://www.letsgo2travel.com.tr';
  const permanent = jwt('www.letsgo2travel.com.tr', { exp: undefined });
  const f = authorizationFixture({ origin: production, config: { appleMapsToken: permanent } });
  assert.equal(await f.getJourneyMapAuthorization(), permanent); assert.equal(f.calls.length, 0);
  const cases = [permanent, jwt('http://127.0.0.1:5174'), jwt('127.0.0.1'), jwt(undefined, { exp: authorizationNow - 1 }),
    jwt(undefined, { scope: 'server_api' }), jwt(undefined, {}, { alg: 'HS256' }), '-----BEGIN PRIVATE KEY-----'];
  for (const token of cases) {
    const local = authorizationFixture({ config: { appleMapsToken: token } });
    assert.equal(await local.getJourneyMapAuthorization(), jwt()); assert.equal(local.calls.length, 1);
    assert.equal(local.calls[0][0], 'https://www.letsgo2travel.com.tr/api/maps/token');
    assert.equal(local.calls[0][1].credentials, 'omit'); assert.equal(local.calls[0][1].redirect, 'error');
    assert.equal(local.calls[0][1].body, '{}'); assert.equal('Authorization' in local.calls[0][1].headers, false);
  }
});

test('Dynamic authorization shares concurrent requests and refreshes at the sixty-second boundary without persistent storage', async () => {
  let request = 0;
  const f = authorizationFixture({ fetch: () => tokenResponse(tokenBody(jwt(undefined, request++ ? { iat: authorizationNow + 540, exp: authorizationNow + 1140 } : {}))) });
  const results = await Promise.all([f.getJourneyMapAuthorization(), f.getJourneyMapAuthorization()]);
  assert.equal(results[0], results[1]); assert.equal(f.calls.length, 1);
  f.advance(539); assert.equal(await f.getJourneyMapAuthorization(), results[0]); assert.equal(f.calls.length, 1);
  f.advance(1); assert.notEqual(await f.getJourneyMapAuthorization(), results[0]); assert.equal(f.calls.length, 2);
  assert.equal(f.timers.size, 0);
});

test('Signed response validation rejects wrong origins, scopes, algorithms, expiry mismatches and unbounded or malformed bodies', async () => {
  const cases = [
    tokenBody(jwt('http://localhost:5173')), tokenBody(jwt(undefined, { scope: 'server_api' })),
    tokenBody(jwt(undefined, {}, { alg: 'HS256' })), tokenBody(jwt(undefined, { exp: authorizationNow + 3600 })),
    { ...tokenBody(jwt()), expiresAt: new Date((authorizationNow + 599) * 1000).toISOString() },
    { token: jwt(), expiresAt: 'not a date' },
  ];
  for (const body of cases) await assert.rejects(authorizationFixture({ fetch: () => tokenResponse(body) }).getJourneyMapAuthorization(), { code: 'unavailable' });
  for (const response of [new Response('x'.repeat(12001), { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '12001' } }),
    new Response('<html>sign in</html>', { headers: { 'Content-Type': 'text/html' } })]) {
    await assert.rejects(authorizationFixture({ fetch: () => response }).getJourneyMapAuthorization(), { code: 'unavailable' });
  }
  await assert.rejects(authorizationFixture({ fetch: () => tokenResponse({ code: 'map_token_unavailable' }, 503) }).getJourneyMapAuthorization(), { code: 'missing_configuration' });
  await assert.rejects(authorizationFixture({ fetch: () => tokenResponse({ code: 'map_origin_forbidden' }, 403) }).getJourneyMapAuthorization(), { code: 'unavailable' });
});

test('Authorization deadlines and explicit retry recover without caching abandoned responses or rejecting late fetches unhandled', async () => {
  const old = deferred(); let count = 0;
  const f = authorizationFixture({ fetch: () => count++ ? tokenResponse() : old.promise });
  const hanging = f.getJourneyMapAuthorization(); await tick(); f.expire();
  await assert.rejects(hanging, { code: 'unavailable' });
  assert.equal(f.calls[0][1].signal.aborted, true);
  assert.equal(await f.getJourneyMapAuthorization(), jwt()); assert.equal(f.calls.length, 2);
  old.reject(new Error('late fetch failure')); await tick();
  f.invalidateJourneyMapAuthorization(); assert.equal(await f.getJourneyMapAuthorization(), jwt()); assert.equal(f.calls.length, 3);
  const abandoned = deferred(); let attempt = 0;
  const fresh = jwt(undefined, { iat: authorizationNow + 1, exp: authorizationNow + 601 });
  const g = authorizationFixture({ fetch: () => attempt++ ? tokenResponse(tokenBody(fresh)) : abandoned.promise });
  const first = g.getJourneyMapAuthorization(); g.invalidateJourneyMapAuthorization();
  assert.equal(await g.getJourneyMapAuthorization(), fresh);
  abandoned.resolve(tokenResponse()); await first;
  assert.equal(await g.getJourneyMapAuthorization(), fresh); assert.equal(g.calls.length, 2);
});

const labels = { map: 'Journey map', zoomIn: 'Zoom in', zoomOut: 'Zoom out', tilesUnavailable: 'Map unavailable', retryTiles: 'Retry map',
  stop: (order, day, name) => `Day ${day}, stop ${order}: ${name}`, place: name => `Discover ${name}`, cluster: count => `Zoom to ${count} places` };
const stops = [
  { id: 'palace', name: 'Palace', day: 1, order: 1, latitude: 41.01, longitude: 28.98 },
  { id: 'museum', name: 'Museum', day: 1, order: 2, latitude: 41.02, longitude: 28.99 },
  { id: 'park', name: 'Park', day: 2, order: 1, latitude: 41.07, longitude: 29.02 },
];
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
function componentFixture(extra = {}, load) {
  const kit = mapKit(), slots = []; let props = { center: { latitude: 41, longitude: 29 }, stops, labels, onSelectPlace() {}, ...extra };
  let cursor = 0, effects = [], dirty = false, tree, disposed = false, locale = 'en';
  let theme = { preference: 'system', resolved: 'light' };
  const themeListeners = new Set();
  const loadCalls = [], observers = [];
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  const react = {
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useEffect(fn, dependencies) { const index = cursor++, old = slots[index]; if (!old || changed(old.dependencies, dependencies)) { slots[index] = { ...old, dependencies }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  };
  react.useLayoutEffect = react.useEffect;
  const fixtureModule = { exports: {} };
  class AppleMapKitError extends Error { constructor(code) { super(code); this.code = code; } }
  const document = { createElement(tag) { return { tag, style: {}, attributes: {}, children: [], setAttribute(key, value) { this.attributes[key] = value; }, appendChild(child) { child.parent = this; this.children.push(child); },
    querySelector(selector) { return this.children.find(child => selector.startsWith('.') ? child.className === selector.slice(1) : child.tag === selector); },
    cloneNode() { const copy = document.createElement(this.tag); Object.assign(copy.attributes, this.attributes); this.children.forEach(child => copy.appendChild(child.cloneNode())); return copy; },
    remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); } }; }, createElementNS(_ns, tag) { return this.createElement(tag); } };
  vm.runInNewContext(`(function(require,module,exports){${componentSource}\n})`, {
    URL, document,
    ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    fetch() { throw Error('Map pan must not start a discovery or routing request'); },
  })(name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === '../lib/config') return { config: { appleMapsToken: 'public-token' } };
    if (name === '../lib/i18n') return { useI18n: () => ({ locale, copy: (tr, en, sq) => ({ tr, en, sq })[locale] }) };
    if (name === '../lib/theme') return { getThemeSnapshot: () => theme, subscribeTheme: listener => { themeListeners.add(listener); return () => themeListeners.delete(listener); } };
    if (name === '../lib/appleMapKit') return { AppleMapKitError, subscribeAppleMapAuthorizationErrors: () => () => {}, loadAppleMapKit: (...args) => { loadCalls.push(args); return load ? load(kit, AppleMapKitError) : Promise.resolve(kit); } };
    if (name === '../lib/appleMapAuthorization') return { getJourneyMapAuthorization: async () => 'public-token', invalidateJourneyMapAuthorization() {} };
    if (name === '../../../lib/travel-assistant/places') return placesModule.exports;
    if (name === './journeyMapCategory') return categoryModule.exports;
    if (name.endsWith('.css')) return {};
    throw Error(`Unexpected map import ${name}`);
  }, fixtureModule, fixtureModule.exports);
  const app = {
    kit, loadCalls, observers, themeListeners,
    render(next = {}) {
      if (disposed) return tree;
      props = { ...props, ...next };
      for (let i = 0; i < 20; i++) {
        cursor = 0; dirty = false; effects = []; tree = fixtureModule.exports.AppleJourneyMap(props);
        for (const node of nodes(tree)) if (node.props?.ref && !node.props.ref.current) node.props.ref.current = { clientWidth: 800, clientHeight: 800 };
        effects.forEach(fn => fn()); if (!dirty) return tree;
      }
      throw Error('Map did not settle');
    },
    async flush() { await tick(); this.render(); await tick(); return this.render(); },
    get map() { return kit.maps.at(-1); }, get tree() { return tree; },
    language(value) { locale = value; this.render(); },
    theme(resolved, preference = resolved) { theme = { preference, resolved }; [...themeListeners].forEach(listener => listener()); },
    dispose() { disposed = true; slots.forEach(slot => slot?.cleanup?.()); },
  };
  app.render(); return app;
}

test('Genuine Apple map uses muted basemap, numbered day colors and accessible native discovery clustering', async () => {
  const chosen = [], app = componentFixture({ discoveredPlaces: [
    { id: 'cafe', name: 'Cafe', latitude: 41.001, longitude: 29.001 },
    { id: 'bakery', name: 'Bakery', latitude: 41.00101, longitude: 29.00101 },
    { ...stops[0] }, { id: 'bad', name: 'Bad', latitude: NaN, longitude: 29 },
  ], onSelectPlace: (point, kind) => chosen.push([point.id, kind]), contentInsets: { top: 140, right: 12, bottom: 200, left: 12 } });
  try {
    await app.flush(); const m = app.map;
    assert.equal(m.options.mapType, 'mutedStandard');
    assert.equal(m.options.showsUserLocation, false);
    assert.deepEqual(json(m.padding), { top: 140, right: 12, bottom: 200, left: 12 });
    assert.equal(m.annotations.length, 5);
    assert.deepEqual(json(m.annotations.slice(0, 3).map(pin => pin.element.textContent)), ['1', '2', '1']);
    assert.equal(m.annotations[0].element.style.background, m.annotations[1].element.style.background);
    assert.notEqual(m.annotations[0].element.style.background, m.annotations[2].element.style.background);
    assert.equal(m.annotations[1].accessibilityLabel, 'Day 1, stop 2: Museum');
    assert.equal(m.annotations[0].clusteringIdentifier, null);
    assert.equal(m.annotations[3].clusteringIdentifier, 'journey-discovery');
    m.fire('select', { annotation: m.annotations[1] });
    assert.deepEqual(chosen, [['museum', 'stop']]);
    const cluster = { memberAnnotations: m.annotations.slice(3) }; m.options.annotationForCluster(cluster);
    assert.equal(cluster.accessibilityLabel, 'Zoom to 2 places');
    m.fire('select', { annotation: cluster });
    assert.equal(m.calls.at(-1)[0], 'fit'); assert.equal(chosen.length, 1);
    app.render({ selectedPlaceId: 'cafe' });
    assert.equal(m.selectedAnnotation.title, 'Cafe'); assert.equal(m.selectedAnnotation.clusteringIdentifier, null);
    assert.equal(chosen.length, 1, 'Programmatic selected-pin synchronization must not emit a user selection');
    app.render({ activeDay: 2 });
    assert.deepEqual(json(m.annotations.filter(pin => /^\d+$/.test(pin.element.textContent)).map(pin => pin.title)), ['Park']);
  } finally { app.dispose(); }
});

test('Discovery categories have distinct shapes, translated names and a visible selection label without changing route numbers or camera', async () => {
  const kinds = ['museum', 'restaurant', 'cafe', 'atm', 'bank', 'transit'];
  const discoveredPlaces = kinds.map((category, index) => ({ id: `category-${category}`, category, name: `Place ${category}`, latitude: 41 + index / 1000, longitude: 29 }));
  const app = componentFixture({ discoveredPlaces });
  try {
    await app.flush();
    const pins = app.map.annotations.slice(3), paths = pins.map(pin => pin.element.querySelector('svg').children[0].attributes.d);
    assert.equal(new Set(paths).size, kinds.length, 'Categories must be distinguishable without perceiving marker color');
    for (const pin of pins) {
      assert.equal(pin.clusteringIdentifier, 'journey-discovery');
      assert.equal(pin.element.style.width, '44px');
      assert.equal(pin.element.style.borderRadius, '14px');
      assert.equal(pin.element.querySelector('.journey-marker-label').style.display, 'none');
    }
    assert.match(pins[5].accessibilityLabel, /Metro and public transport/);
    app.render({ selectedPlaceId: 'category-transit' });
    assert.equal(pins[5].element.querySelector('.journey-marker-label').style.display, 'block');
    assert.match(pins[5].element.querySelector('.journey-marker-label').textContent, /Place transit · Metro/);
    assert.equal(pins[5].clusteringIdentifier, null);
    const cameraCount = app.map.calls.length;
    app.language('tr');
    const translated = app.map.annotations.at(-1);
    assert.match(translated.accessibilityLabel, /Metro ve toplu taşıma/);
    assert.equal(app.map.calls.length, cameraCount, 'Translation refresh cannot move a selected or manually panned map');
    app.render({ selectedPlaceId: null });
    assert.equal(translated.element.querySelector('.journey-marker-label').style.display, 'none');
    assert.equal(translated.clusteringIdentifier, 'journey-discovery');
    assert.deepEqual(json(app.map.annotations.slice(0, 3).map(pin => pin.element.textContent)), ['1', '2', '1']);
    const unknown = categoryModule.exports.journeyMapCategory('__proto__', 'sq');
    assert.equal(unknown.symbol, 'mappin'); assert.equal(unknown.label, 'Vend');
  } finally { app.dispose(); }
});

test('Apple camera preserves manual pans, responds to explicit center/day/selection and never starts search on movement', async () => {
  const viewports = [], app = componentFixture({ activeDay: 1, onViewportChange: viewport => viewports.push(json(viewport)) });
  try {
    await app.flush(); const m = app.map;
    m.setCenterAnimated({ latitude: 42, longitude: 30 }, false);
    const calls = m.calls.length, reports = viewports.length;
    app.render({ stops: stops.map(stop => ({ ...stop })), labels: { ...labels } });
    assert.equal(m.calls.length, calls);
    m.fire('region-change-end'); app.observers[0].callback();
    assert.equal(viewports.length, reports);
    app.render({ center: { latitude: 48.86, longitude: 2.35 } });
    assert.equal(m.calls.at(-1)[0], 'region'); assert.deepEqual(json(m.center), { latitude: 48.86, longitude: 2.35 });
    app.render({ activeDay: 2 }); assert.deepEqual(json(m.center), { latitude: 41.07, longitude: 29.02 });
    app.render({ activeDay: null, selectedPlaceId: 'museum' });
    assert.equal(m.calls.at(-1)[0], 'center'); assert.deepEqual(json(m.center), { latitude: 41.02, longitude: 28.99 });
    const afterSelect = m.calls.length;
    app.render({ stops: stops.map(stop => ({ ...stop, name: `Translated ${stop.name}` })) });
    assert.equal(m.calls.length, afterSelect);
    app.language('tr'); assert.equal(app.kit.language, 'tr'); assert.equal(app.loadCalls.length, 1);
    m.setCenterAnimated({ latitude: 42, longitude: 390 }, false);
    assert.deepEqual(viewports.at(-1).center, { latitude: 42, longitude: 30 });
  } finally { app.dispose(); }
  assert.equal(app.map.destroyed, true); assert.equal(app.map.listenerCount, 0);
  assert.equal(app.kit.listenerCount, 0); assert.equal(app.observers[0].disconnected, true);
});

test('Apple basemap follows resolved app appearance before loading and on live changes without resetting the map or selection', async () => {
  const app = componentFixture({ selectedPlaceId: 'museum' });
  app.theme('dark');
  try {
    await app.flush();
    const m = app.map;
    assert.equal(m.options.colorScheme, 'dark', 'manual app theme overrides a light operating system');
    assert.equal(m.colorScheme, 'dark');
    m.setCenterAnimated({ latitude: 42, longitude: 30 }, false);
    const calls = m.calls.length, pins = m.annotations, selected = m.selectedAnnotation;
    app.theme('light');
    assert.equal(m.colorScheme, 'light');
    app.theme('dark', 'system');
    assert.equal(m.colorScheme, 'dark', 'system preference uses the app-resolved appearance');
    assert.equal(app.kit.maps.length, 1);
    assert.equal(app.loadCalls.length, 1);
    assert.equal(m.calls.length, calls);
    assert.equal(m.annotations, pins);
    assert.equal(m.selectedAnnotation, selected);
    assert.deepEqual(json(m.center), { latitude: 42, longitude: 30 });
  } finally { app.dispose(); }
  assert.equal(app.themeListeners.size, 0);
  app.theme('light');
  assert.equal(app.map.colorScheme, 'dark', 'unmounted maps receive no theme updates');
});

test('Apple route overlays contain only supplied complete geometry, filter active days and unwrap date-line paths', async () => {
  const app = componentFixture();
  try {
    await app.flush(); assert.equal(app.map.overlays.length, 0);
    app.render({ routes: [
      { id: 'route', day: 1, coordinates: [[41.01, 28.98], [41.015, 28.983], [41.02, 28.99]] },
      { id: 'broken', day: 2, coordinates: [[41, 29], [NaN, 29.1], [41.1, 29.2]] },
    ] });
    assert.equal(app.map.overlays.length, 2);
    assert.deepEqual(json(app.map.overlays[1].coordinates), [{ latitude: 41.01, longitude: 28.98 }, { latitude: 41.015, longitude: 28.983 }, { latitude: 41.02, longitude: 28.99 }]);
    assert.equal(app.map.overlays.every(line => line.options.enabled === false), true);
    app.render({ activeDay: 2 }); assert.equal(app.map.overlays.length, 0);
    app.render({ routes: [{ id: 'date', day: 2, coordinates: [[1, 179.8], [1, -179.8]] }] });
    assert.deepEqual(json(app.map.overlays[0].coordinates), [{ latitude: 1, longitude: 179.8 }, { latitude: 1, longitude: 180.2 }]);
  } finally { app.dispose(); }
});

test('Apple renders all supplied walking legs beyond fourteen paths and retains valid twenty-thousand-point geometry', async () => {
  const app = componentFixture();
  try {
    await app.flush();
    const detailed = Array.from({ length: 20_000 }, (_, index) => [41 + index / 1_000_000, 29 + index / 1_000_000]);
    const legs = Array.from({ length: 119 }, (_, index) => ({ id: `leg-${index}`, day: index % 14 + 1, coordinates: [[41, 29], [41.001, 29.001]] }));
    app.render({ routes: [...legs, { id: 'detailed', day: 14, coordinates: detailed }] });
    assert.equal(app.map.overlays.length, 240, 'Every confirmed leg retains both its outline and colored route');
    assert.equal(app.map.overlays.at(-1).coordinates.length, 20_000);
    assert.deepEqual(json(app.map.overlays.at(-1).coordinates.at(-1)), { latitude: detailed.at(-1)[0], longitude: detailed.at(-1)[1] });
    app.render({ routes: [...legs, { id: 'oversized', day: 14, coordinates: [...detailed, [41.02, 29.02]] }] });
    assert.equal(app.map.overlays.length, 238, 'Malformed over-budget path does not erase the other confirmed legs');
  } finally { app.dispose(); }
});

test('Apple photo annotations use verified raster URLs, retain day numbers and fall back when the actual photo fails', async () => {
  const photo = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Palace.jpg/320px-Palace.jpg';
  const app = componentFixture({ stops: [{ ...stops[0], imageUrl: photo }, { ...stops[1], imageUrl: 'https://evil.example/photo.jpg' }],
    discoveredPlaces: [{ id: 'unsafe', name: 'Unsafe', latitude: 41, longitude: 29, imageUrl: 'javascript:alert(1)' }] });
  try {
    await app.flush(); const pins = app.map.annotations;
    assert.ok(pins[0].element, 'An actual verified image uses the custom Apple annotation');
    assert.equal(pins[0].accessibilityLabel, 'Day 1, stop 1: Palace');
    assert.equal(pins[0].element.textContent, '1');
    const image = pins[0].element.children.find(child => child.tag === 'img');
    assert.equal(image.src, photo);
    assert.equal(image.referrerPolicy, 'no-referrer');
    assert.equal(pins[1].element.children.some(child => child.tag === 'img'), false, 'Unverified image host falls back to the numbered marker');
    assert.equal(pins[2].element.children.some(child => child.tag === 'img'), false, 'An unsafe URL is never assigned to an image');
    image.onerror();
    assert.equal(image.removed, true); assert.equal(pins[0].element.textContent, '1');
    app.render({ selectedPlaceId: 'palace' });
    assert.ok(app.map.selectedAnnotation.element.style.border.includes('#0864f1'));
  } finally { app.dispose(); }
});

test('Selection reuses annotation objects and photo elements while updating only old and new selection styles', async () => {
  const photo = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Palace.jpg/320px-Palace.jpg';
  const app = componentFixture({ stops: [{ ...stops[0], imageUrl: photo }], discoveredPlaces: [
    { id: 'cafe', name: 'Cafe', latitude: 41, longitude: 29, imageUrl: photo },
    { id: 'shop', name: 'Shop', latitude: 41.01, longitude: 29.01 },
  ] });
  try {
    await app.flush();
    const m = app.map, original = m.annotations, photoElement = original[1].element;
    const image = photoElement.children.find(child => child.tag === 'img');
    image.onerror();
    app.render({ selectedPlaceId: 'cafe' });
    assert.equal(m.annotations, original, 'Selection must not replace the map annotation collection');
    assert.equal(m.selectedAnnotation, original[1]);
    assert.equal(original[1].element, photoElement);
    assert.equal(photoElement.children.includes(image), false, 'A failed image must not be loaded again on selection');
    assert.equal(original[1].clusteringIdentifier, null);
    assert.equal(original[1].displayPriority, 1000);
    assert.match(photoElement.style.border, /#0864f1/);
    app.render({ selectedPlaceId: 'shop' });
    assert.equal(m.annotations, original);
    assert.equal(original[1].clusteringIdentifier, 'journey-discovery');
    assert.equal(original[1].displayPriority, 750);
    assert.match(photoElement.style.border, /#ffffff/);
    assert.equal(original[2].selected, true);
    assert.equal(original[2].element.style.background, '#0065f5');
    app.render({ selectedPlaceId: null });
    assert.equal(m.selectedAnnotation, null);
    assert.equal(original[2].selected, false);
    assert.equal(original[2].element.style.background, '#536579');
    assert.equal(m.annotations, original);
  } finally { app.dispose(); }
});

test('Expanded panels and keyboard resizing never pass impossible insets or reset the manually positioned Apple camera', async () => {
  const app = componentFixture({ contentInsets: { top: 130, bottom: 760, left: 12, right: 12 } });
  try {
    await app.flush(); const m = app.map;
    assert.ok(m.padding.top + m.padding.bottom <= 760.000001, 'A 40px visible map frame remains at maximum panel height');
    m.setCenterAnimated({ latitude: 42, longitude: 30 }, false);
    const calls = m.calls.length;
    m.element.clientHeight = 240; m.element.clientWidth = 320;
    app.observers[0].callback(); app.render();
    assert.ok(m.padding.top + m.padding.bottom <= 200.000001, 'Keyboard height is applied without a new parent props object');
    assert.equal(m.calls.length, calls, 'Resize updates padding but does not refit stops or undo the user pan');
    assert.deepEqual(json(m.center), { latitude: 42, longitude: 30 });
    m.element.clientHeight = 900; app.observers[0].callback(); app.render();
    assert.ok(m.padding.top + m.padding.bottom <= 860.000001);
    app.render({ contentInsets: { top: 100, bottom: 100, left: 12, right: 12 } });
    assert.deepEqual(json(m.padding), { top: 100, bottom: 100, left: 12, right: 12 }, 'Ordinary insets are restored after the panel closes');
  } finally { app.dispose(); }
});

test('Missing token is explicit, retry invokes loader again, runtime errors preserve the plan and late loads do not mount after exit', async () => {
  let calls = 0;
  const app = componentFixture({}, (kit, Failure) => ++calls === 1 ? Promise.reject(new Failure('missing_configuration')) : Promise.resolve(kit));
  try {
    await app.flush(); assert.equal(app.kit.maps.length, 0);
    assert.ok(nodes(app.tree).some(node => node.type === 'span' && node.props.children.includes('not set up')));
    nodes(app.tree).find(node => node.type === 'button').props.onClick(); app.render(); await app.flush();
    assert.equal(app.map.annotations.length, 3); assert.equal(app.loadCalls.at(-1)[2], true);
    app.kit.fire('error', { status: 'Unauthorized' }); app.render();
    assert.ok(nodes(app.tree).some(node => node.type === 'span' && node.props.children.includes('could not load')));
    assert.equal(app.map.annotations.length, 3);
    const previous = app.map;
    nodes(app.tree).find(node => node.type === 'button').props.onClick(); app.render(); await app.flush();
    assert.equal(previous.destroyed, true); assert.notEqual(app.map, previous);
  } finally { app.dispose(); }
  const pending = deferred(), late = componentFixture({}, () => pending.promise);
  late.dispose(); pending.resolve(late.kit); await tick();
  assert.equal(late.kit.maps.length, 0);
});
