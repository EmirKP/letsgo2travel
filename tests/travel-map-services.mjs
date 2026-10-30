import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { realLocaleModule } from './fixtures/real-locale-modules.mjs';

function load(path, imports = {}, globals = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Error, Date, URL, URLSearchParams, Request, Response, AbortSignal, TextDecoder, Buffer, setTimeout, clearTimeout, ...globals })(name => {
    if (name in imports) return imports[name];
    const localeModule = realLocaleModule(name); if (localeModule) return localeModule;
    throw Error(`Unexpected import ${name}`);
  }, output, output.exports);
  return output.exports;
}
const clone = value => JSON.parse(JSON.stringify(value));
const center = { latitude: 48.86, longitude: 2.29 };
const destination = { latitude: 48.862, longitude: 2.3 };
const routeInput = { origin: center, destination, mode: 'walking', locale: 'tr' };
const stamp = '2026-10-27T10:00:00.000Z';
const row = (id, tags, fields = {}) => ({ type: 'node', id, lat: 48.861, lon: 2.291, tags, ...fields });
const deferred = () => { let resolve; return { promise: new Promise(yes => { resolve = yes; }), resolve }; };
function model(queryOverpass = async () => ({ elements: [] }), globals = {}) {
  return load('lib/maps/travel-map-services.ts', {
    '../travel-assistant/places': load('lib/travel-assistant/places.ts', {}, globals),
    '../travel-assistant/result-cache': load('lib/travel-assistant/result-cache.ts', {}, globals),
    '../travel-assistant/overpass': { queryOverpass }, 'next/cache': { unstable_cache: fn => fn },
  }, globals);
}
function routeFixture(input = routeInput) {
  return { code: 'Ok', routes: [{ distance: 1048.2, duration: 806.3, geometry: { type: 'LineString', coordinates: [
    [input.origin.longitude, input.origin.latitude], [2.292, 48.8615], [input.destination.longitude, input.destination.latitude],
  ] }, legs: [{ steps: [
    { distance: 800, duration: 600, name: 'Quai Branly', maneuver: { type: 'depart' } },
    { distance: 248.2, duration: 206.3, name: 'Avenue de la Bourdonnais', maneuver: { type: 'turn', modifier: 'right' } },
    { distance: 0, duration: 0, name: '', maneuver: { type: 'arrive' } },
  ] }] }] };
}
function fakeClock() {
  let now = Date.parse(stamp);
  return { Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }, advance: ms => { now += ms; } };
}

test('Unified POI queries retain coarse bounded cells, antimeridian splits and fixed category selectors', () => {
  const api = model(), places = load('lib/travel-assistant/places.ts');
  for (const point of [center, { latitude: 48.86234, longitude: 2.29432 }, { latitude: 0, longitude: 179.999 }, { latitude: 85, longitude: 0 }]) {
    const query = api.travelMapPlacesQuery(point, 'all');
    assert.deepEqual([...new Set([...query.matchAll(/nwr\(([-\d.,]+)\)/g)].map(match => match[1]))], clone(places.nearbyQueryBoxes(point)));
    assert.equal(query, api.travelMapPlacesQuery(places.coarseLocation(point), 'all'));
    assert.match(query, /timeout:12/); assert.match(query, /out center tags 750/); assert.match(query, /\[shop\]/);
    assert.match(query, /museum/); assert.match(query, /pharmacy/); assert.match(query, /restaurant/); assert.doesNotMatch(query, /around:|48\.86234|2\.29432/);
  }
  assert.match(api.travelMapPlacesQuery(center, 'cafe'), /\[amenity=cafe\]/);
  assert.doesNotMatch(api.travelMapPlacesQuery(center, 'cafe'), /pharmacy|\[shop\]/);
  assert.throws(() => api.travelMapPlacesQuery(center, 'all];out;'), error => error.code === 'invalid');
});

test('Brand/name searches escape every regex metacharacter and quotation instead of accepting Overpass code', () => {
  const api = model();
  for (const input of ['Starbucks', 'Musée d’Orsay', 'A.B+(x)[y]$^?*\\', '");out;["name"="x']) {
    const query = api.travelMapPlacesQuery(center, 'all', input);
    const literals = [...query.matchAll(/\[~"\^\(name\(:\[a-zA-Z-\]\+\)\?\|brand\|operator\)\$"~("(?:\\.|[^"\\])*"),i\]/g)];
    assert.ok(literals.length > 10, query);
    const escaped = JSON.parse(literals[0][1]);
    assert.equal(escaped, input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    assert.ok(new RegExp(escaped, 'i').test(input));
    assert.equal(new RegExp(escaped, 'i').test('unrelated place'), false);
    assert.ok(literals.every(item => item[1] === literals[0][1]));
  }
  for (const invalid of ['x'.repeat(81), 'name\nvalue', 'x\u0000', {}, null]) {
    assert.equal(api.validTravelMapQuery(invalid), false);
    assert.throws(() => api.travelMapPlacesQuery(center, 'all', invalid), error => error.code === 'invalid');
  }
});

test('Real OSM identities, museums, needs, brands, shops and food share one normalized map without Apple substitutions', () => {
  const api = model(), raw = { elements: [
    row(1, { tourism: 'museum', name: '<b>Musée</b>', 'addr:street': 'Rue A', 'addr:housenumber': '2', website: 'https://museum.example/' }),
    row(2, { amenity: 'cafe', brand: 'Starbucks', opening_hours: 'Mo-Fr 09:00-18:00', wheelchair: 'yes' }),
    row(3, { amenity: 'restaurant', name: 'Restaurant', internet_access: 'wlan' }),
    row(4, { shop: 'shoes', brand: 'A shoe brand' }), row(5, { amenity: 'pharmacy' }), row(6, { leisure: 'park', name: 'Park' }),
    row(7, { shop: 'bakery', name: 'Bakery' }), row(8, { leisure: 'garden', name: 'Garden' }),
  ] };
  const values = api.normalizeTravelMapPlaces(raw, center, 'all', stamp);
  assert.equal(values.length, 8);
  assert.deepEqual(clone(values.map(item => item.category)), ['museum', 'cafe', 'restaurant', 'store', 'pharmacy', 'park', 'bakery', 'garden']);
  assert.equal(values[0].name, 'Musée'); assert.equal(values[0].address, 'Rue A, 2');
  assert.equal(values[1].name, 'Starbucks'); assert.equal(values[1].brand, 'Starbucks'); assert.equal(values[1].accessible, true);
  assert.equal(values[1].hours, 'Mo-Fr 09:00-18:00'); assert.equal(values[1].openNow, undefined);
  assert.ok(values.every(item => item.id.startsWith('node/') && item.sourceUrl === `https://www.openstreetmap.org/${item.id}` && item.fetchedAt === stamp));
  assert.equal(api.normalizeTravelMapPlaces(raw, center, 'restaurant', stamp)[0].id, 'node/3');
  assert.equal(api.normalizeTravelMapPlaces(raw, center, 'wifi', stamp)[0].id, 'node/3');
});

test('POI normalization rejects malformed IDs, out-of-area pins, duplicates, unnamed recommendations and partial upstream errors', () => {
  const api = model(), museum = row(1, { tourism: 'museum', name: 'Museum' });
  const result = api.normalizeTravelMapPlaces({ elements: [museum, museum, row('apple/3', { tourism: 'museum', name: 'Fake' }),
    row(0, { shop: 'clothes', name: 'Zero' }), row(2, { amenity: 'cafe' }), row(3, { shop: 'vacant', name: 'Vacant' }),
    row(4, { tourism: 'museum', name: 'Far' }, { lat: 49, lon: 3 }), row(5, { amenity: 'pharmacy' }, { lat: '48.86' }),
    row(6, { amenity: 'atm', website: 'javascript:alert(1)' }, { type: 'way', lat: undefined, lon: undefined, center: { lat: 48.86, lon: 2.29 } }),
  ] }, center, 'all', stamp);
  assert.equal(result.length, 2); assert.equal(result[0].id, 'way/6'); assert.equal(result[0].website, null);
  assert.equal(result[1].id, 'node/1');
  assert.throws(() => api.normalizeTravelMapPlaces({ elements: [museum], remark: 'runtime error: timeout' }, center, 'all', stamp));
  assert.throws(() => api.normalizeTravelMapPlaces({ elements: null }, center, 'all', stamp));
});

test('Concurrent searches dedupe by coarse area/category/literal query and preserve original freshness and honest limits', async () => {
  const wait = deferred(), calls = [], api = model(async query => { calls.push(query); return wait.promise; });
  const a = api.getTravelMapPlaces(center, 'all', ' Starbucks '), b = api.getTravelMapPlaces({ latitude: 48.862, longitude: 2.292 }, 'all', 'Starbucks');
  assert.equal(calls.length, 1);
  wait.resolve({ elements: Array.from({ length: 750 }, (_, i) => row(i + 1, { amenity: 'cafe', brand: 'Starbucks' })) });
  const result = await a;
  assert.equal(await b, result); assert.equal(result.query, 'Starbucks'); assert.equal(result.radius, 3000); assert.equal(result.limited, true);
  assert.equal((await api.getTravelMapPlaces(center, 'all', 'Starbucks')).fetchedAt, result.fetchedAt); assert.equal(calls.length, 1);
  await api.getTravelMapPlaces(center, 'cafe', 'Starbucks'); assert.equal(calls.length, 2);
});

test('Failed POI refresh retains the original source time with stale indication and expires old snapshots', async () => {
  const clock = fakeClock(); let fail = false, calls = 0;
  const api = model(async () => { calls++; if (fail) throw Error('offline'); return { elements: [row(1, { amenity: 'cafe', name: 'Cafe' })] }; }, { Date: clock.Date });
  const original = await api.getTravelMapPlaces(center);
  clock.advance(61 * 60000); fail = true;
  const stale = await api.getTravelMapPlaces(center);
  assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, original.fetchedAt); assert.equal(calls, 2);
  clock.advance(6 * 60 * 60000);
  await assert.rejects(api.getTravelMapPlaces(center), /offline/);
});

test('Directions validate bounded coordinates, transport mode and locale before contacting a provider', async () => {
  let calls = 0; const api = model(undefined, { fetch: () => { calls++; throw Error('must not fetch'); } });
  assert.deepEqual(clone(api.parseTravelMapRouteInput(routeInput)), routeInput);
  for (const invalid of [null, {}, { ...routeInput, origin: { latitude: '48', longitude: 2 } }, { ...routeInput, destination: { latitude: 90, longitude: 2 } },
    { ...routeInput, origin: { latitude: 48, longitude: 181 } }, { ...routeInput, mode: 'helicopter' }, { ...routeInput, locale: 'sql' }]) {
    assert.equal(api.parseTravelMapRouteInput(invalid), null);
    await assert.rejects(api.getTravelMapDirections(invalid), error => error.code === 'invalid');
  }
  await assert.rejects(api.getTravelMapDirections({ ...routeInput, destination: center }), error => error.code === 'same-location');
  await assert.rejects(api.getTravelMapDirections({ ...routeInput, destination: { latitude: 51, longitude: 3 } }), error => error.code === 'route-too-long');
  assert.equal(calls, 0);
});

test('OSRM routes retain actual road geometry and localized maneuvers rather than constructing a line between pins', () => {
  const api = model(), fixture = routeFixture(), route = api.normalizeTravelMapRoute(fixture, routeInput);
  assert.deepEqual(clone(route.coordinates), fixture.routes[0].geometry.coordinates);
  assert.equal(route.distanceMeters, 1048.2); assert.equal(route.durationSeconds, 806.3);
  assert.equal(route.steps[1].instruction, 'sağa dön · Avenue de la Bourdonnais'); assert.match(route.attribution, /FOSSGIS/);
  assert.equal(api.normalizeTravelMapRoute(fixture, { ...routeInput, locale: 'en' }).steps[1].instruction, 'Turn right · Avenue de la Bourdonnais');
  assert.equal(api.normalizeTravelMapRoute(fixture, { ...routeInput, locale: 'sq' }).steps[0].instruction, 'Nisu · Quai Branly');
  const uturn = clone(fixture); uturn.routes[0].legs[0].steps[1].maneuver.modifier = 'uturn';
  assert.match(api.normalizeTravelMapRoute(uturn, routeInput).steps[1].instruction, /U dönüşü/);
});

test('NoRoute, disconnected snapped roads, malformed geometry and invalid step values never become fabricated directions', () => {
  const api = model();
  for (const code of ['NoRoute', 'NoSegment']) assert.throws(() => api.normalizeTravelMapRoute({ code }, routeInput), error => error.code === 'no-route' && error.status === 422);
  for (const alter of [raw => { raw.routes[0].duration = NaN; }, raw => { raw.routes[0].geometry.type = 'Polygon'; },
    raw => { raw.routes[0].geometry.coordinates = [[2, 48]]; }, raw => { raw.routes[0].geometry.coordinates[1] = [2, '48']; },
    raw => { raw.routes[0].legs[0].steps[1].duration = -1; }, raw => { raw.routes[0].legs[0].steps = []; }]) {
    const raw = routeFixture(); alter(raw); assert.throws(() => api.normalizeTravelMapRoute(raw, routeInput), error => error.code === 'invalid-provider-response');
  }
  const far = routeFixture(); far.routes[0].geometry.coordinates[0] = [12, 41];
  assert.throws(() => api.normalizeTravelMapRoute(far, routeInput), error => error.code === 'no-route');
});

test('Walking and driving use distinct FOSSGIS profile paths, bounded exact geometry requests and a valid application agent', async () => {
  for (const mode of ['walking', 'driving']) {
    const calls = [], input = { ...routeInput, mode }, api = model(undefined, { fetch: async (url, options) => { calls.push({ url, options }); return Response.json(routeFixture(input)); } });
    const first = await api.getTravelMapDirections(input), cached = await api.getTravelMapDirections(input);
    assert.equal(first, cached); assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.origin, 'https://routing.openstreetmap.de'); assert.match(url.pathname, new RegExp(`/${mode === 'walking' ? 'routed-foot' : 'routed-car'}/route/v1/driving/`));
    assert.ok(url.pathname.endsWith('2.29000,48.86000;2.30000,48.86200'));
    assert.equal(url.searchParams.get('geometries'), 'geojson'); assert.equal(url.searchParams.get('steps'), 'true'); assert.equal(url.searchParams.get('alternatives'), 'false');
    assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.redirect, 'error'); assert.match(calls[0].options.headers['User-Agent'], /LetsGo2Travel.*https:/);
  }
});

test('Simultaneous identical route requests share one provider operation and loaded geometry', async () => {
  const wait = deferred(); let calls = 0;
  const api = model(undefined, { fetch: () => { calls++; return wait.promise; } });
  const one = api.getTravelMapDirections(routeInput), two = api.getTravelMapDirections(routeInput);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1);
  wait.resolve(Response.json(routeFixture())); assert.equal(await one, await two);
});

test('Different route requests share one process budget with at least one second between provider starts', async () => {
  const starts = [], input2 = { ...routeInput, mode: 'driving' };
  const api = model(undefined, { fetch: async () => { starts.push(Date.now()); return Response.json(routeFixture()); } });
  await Promise.all([api.getTravelMapDirections(routeInput), api.getTravelMapDirections(input2)]);
  assert.equal(starts.length, 2); assert.ok(starts[1] - starts[0] >= 990, `Starts only ${starts[1] - starts[0]}ms apart`);
});

test('Provider quota denial blocks following requests, preserves Retry-After and does not switch hosts', async () => {
  const clock = fakeClock(), calls = [];
  const api = model(undefined, { Date: clock.Date, fetch: async url => { calls.push(url); return new Response('quota', { status: 429, headers: { 'Retry-After': '120' } }); } });
  await assert.rejects(api.getTravelMapDirections(routeInput), error => error.code === 'busy' && error.retryAfter === 120);
  await assert.rejects(api.getTravelMapDirections({ ...routeInput, mode: 'driving' }), error => error.code === 'busy' && error.retryAfter === 120);
  assert.equal(calls.length, 1); assert.equal(new URL(calls[0]).hostname, 'routing.openstreetmap.de');
});

test('OSRM NoSegment from HTTP 400 has a user-actionable no-route error; oversized and non-JSON responses are bounded failures', async () => {
  for (const [response, code] of [[Response.json({ code: 'NoSegment' }, { status: 400 }), 'no-route'],
    [new Response('not-json'), 'invalid-provider-response'], [new Response('x'.repeat(4000001)), 'route-too-large']]) {
    const api = model(undefined, { fetch: async () => response });
    await assert.rejects(api.getTravelMapDirections(routeInput), error => error.code === code);
  }
});

function routes(services) {
  const service = { ...model(), ...services }, imports = { '@/lib/maps/travel-map-services': service, '@/lib/travel-assistant/places': load('lib/travel-assistant/places.ts'), '@/lib/travel-assistant/http': load('lib/travel-assistant/http.ts') };
  return { places: load('app/api/maps/places/route.ts', imports), directions: load('app/api/maps/directions/route.ts', imports), service };
}
test('Public map GET validates query inputs and native CORS while returning exact source results', async () => {
  const calls = [], data = { places: [], fetchedAt: stamp, query: 'Starbucks' }, api = routes({ getTravelMapPlaces: async (...args) => { calls.push(args); return data; } });
  const response = await api.places.GET(new Request('https://app.example/api/maps/places?lat=48.86&lon=2.29&category=cafe&q=Starbucks'));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { data });
  assert.deepEqual(clone(calls[0]), [center, 'cafe', 'Starbucks']); assert.equal(response.headers.get('access-control-allow-origin'), '*');
  for (const query of ['lat=&lon=2', 'lat=1e2&lon=2', 'lat=86&lon=2', 'lat=48&lon=181', 'lat=48&lon=2&category=sql', `lat=48&lon=2&q=${'x'.repeat(81)}`, 'lat=48&lon=2&q=%0A']) {
    assert.equal((await api.places.GET(new Request(`https://app.example/api/maps/places?${query}`))).status, 400);
  }
  assert.equal(calls.length, 1); assert.equal(api.places.OPTIONS().status, 204);
});

test('Directions API never caches private location pairs and rejects oversized or malformed bodies before provider contact', async () => {
  const calls = [], api = routes({ getTravelMapDirections: async input => { calls.push(input); return { distanceMeters: 1048, coordinates: [[2.29, 48.86], [2.3, 48.862]] }; } });
  const post = body => api.directions.POST(new Request('https://app.example/api/maps/directions', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
  const response = await post(routeInput);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('access-control-allow-origin'), '*'); assert.deepEqual(clone(calls[0]), routeInput);
  assert.equal((await post({ ...routeInput, origin: { latitude: '48', longitude: 2 } })).status, 400);
  assert.equal((await post({ ...routeInput, unused: 'x'.repeat(3000) })).status, 400);
  assert.equal((await api.directions.POST(new Request('https://app.example/api/maps/directions', { method: 'POST', body: '{' }))).status, 400);
  assert.equal(calls.length, 1); assert.equal(api.directions.OPTIONS().status, 204); assert.match(api.directions.OPTIONS().headers.get('access-control-allow-methods'), /POST/);
});

test('Typed routing failures remain private and truthful at the API boundary', async () => {
  const base = model();
  for (const [code, status, retryAfter] of [['no-route', 422, 0], ['busy', 503, 120]]) {
    const api = routes({ TravelMapServiceError: base.TravelMapServiceError, getTravelMapDirections: async () => { throw new base.TravelMapServiceError(code, status, retryAfter); } });
    const response = await api.directions.POST(new Request('https://app.example/api/maps/directions', { method: 'POST', body: JSON.stringify(routeInput) }));
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { code }); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('retry-after'), retryAfter ? String(retryAfter) : null);
  }
});
