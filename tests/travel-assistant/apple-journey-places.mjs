import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';

function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    Error, Date, URL, URLSearchParams, Response, Request, Buffer, TextDecoder, AbortController, setTimeout, clearTimeout, ...globals,
  })(name => { if (name in imports) return imports[name]; throw Error(`Missing ${name}`); }, module, module.exports);
  return module.exports;
}
const clone = value => JSON.parse(JSON.stringify(value));
const places = load('lib/travel-assistant/places.ts');
const center = { latitude: 35.01, longitude: 135.77 };
const row = (id = 'I123ABC', poiCategory = 'Museum', coordinate = center) => ({ id, poiCategory, coordinate,
  name: '<b>Real museum</b>', formattedAddressLines: ['Kyoto\nJapan'], hours: 'invented', free: true, photo: 'https://evil.test/photo' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(search) {
  let identity = 'key-a', now = Date.now();
  const Clock = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const calls = [];
  const server = { appleMapsServerConfigured: () => true, appleMapsServerIdentity: () => identity, appleMapsSearch: async (params, deadline) => {
    calls.push({ params, deadline }); return search ? search(params, deadline) : { results: [row()] };
  } };
  const apple = load('lib/travel-assistant/journey-apple-places.ts', { '../maps/apple-maps-server': server, './places': places }, { Date: Clock });
  return { apple, calls, server, setIdentity: value => { identity = value; }, advance: ms => { now += ms; } };
}
const client = () => load('mobile/src/lib/mapJourneyClient.ts', { './api': { requestJson: async () => {} }, './travelAreas': { TRAVEL_CENTRES: [] },
  './searchText': { normalizeSearchText: value => value.toLowerCase() }, '../../../lib/travel-assistant/places': places });

test('Worldwide city search submits explicit locale and city filters, preserves provider coordinates and deduplicates absent-ID address results', async () => {
  const city = { coordinate: center, name: 'Kyoto', formattedAddressLines: ['Kyoto', 'Japan'] };
  const h = harness(() => ({ results: [city, city, { ...city, coordinate: { latitude: '35', longitude: 135 } }] }));
  const [first, second] = await Promise.all([h.apple.searchAppleJourneyPlaces('Kyoto, Japan', 'tr'), h.apple.searchAppleJourneyPlaces('Kyoto, Japan', 'tr')]);
  assert.equal(h.calls.length, 1); assert.deepEqual(clone(first), clone(second));
  assert.equal(h.calls[0].params.get('q'), 'Kyoto, Japan'); assert.equal(h.calls[0].params.get('lang'), 'tr-TR');
  assert.equal(h.calls[0].params.get('includeAddressCategories'), 'Locality,SubLocality');
  assert.equal(h.calls[0].params.has('userLocation'), false);
  assert.equal(first.places.length, 1); assert.equal(first.places[0].id, 'apple-area/35.01,135.77');
  assert.equal(first.places[0].sourceUrl, 'https://maps.apple.com/place?coordinate=35.01,135.77');
  assert.equal(first.attribution, 'Apple Maps');
  assert.equal(client().validateJourneySearch(first)[0].name, 'Kyoto');
  await h.apple.searchAppleJourneyPlaces('Kyoto, Japan', 'tr'); assert.equal(h.calls.length, 1);
  await h.apple.searchAppleJourneyPlaces('Kyoto, Japan', 'sq'); assert.equal(h.calls.length, 2);
  for (const [query, locale] of [['<script>', 'en'], ['ab', 'en'], ['Kyoto', '__proto__']]) await assert.rejects(h.apple.searchAppleJourneyPlaces(query, locale));
});

test('Apple discovery sends bounded coarse regional category searches and never fabricates hours, fees, photos or provider identities', async () => {
  const h = harness(() => ({ results: [row(), row(), row('I987', 'Restaurant'), row('I876', 'Museum', { latitude: 36, longitude: 135 })], paginationInfo: { nextPageToken: 'private-provider-cursor' } }));
  const result = await h.apple.discoverAppleJourneyPlaces({ latitude: 35.01234, longitude: 135.77234 }, 'culture');
  assert.equal(h.calls.length, 2); assert.equal(result.places.length, 1); assert.equal(result.limited, true);
  for (const { params, deadline } of h.calls) {
    assert.equal(params.has('searchLocation'), false); assert.equal(params.has('userLocation'), false);
    assert.equal(params.get('searchRegionPriority'), 'required'); assert.equal(params.get('resultTypeFilter'), 'Poi');
    assert.match(params.get('includePoiCategories'), /Museum/); assert.equal(params.get('enablePagination'), 'true');
    assert.ok(deadline - Date.now() <= 22_000); assert.equal(params.has('pageToken'), false);
  }
  const p = result.places[0];
  assert.equal(p.id, 'apple/I123ABC'); assert.equal(p.name, 'Real museum'); assert.equal(p.address, 'Kyoto Japan');
  for (const field of ['hours', 'free', 'description', 'accessible', 'website']) assert.equal(p[field], null);
  assert.equal(p.imageUrl, undefined); assert.equal(result.attribution, 'Apple Maps');
  assert.doesNotMatch(JSON.stringify(result), /private-provider-cursor|invented|evil.test/);
  assert.equal(client().validateDiscoveryResponse(result, center, 'culture').places.length, 1);
  await h.apple.discoverAppleJourneyPlaces(center, 'culture'); assert.equal(h.calls.length, 2);
});

test('Destination names fit the 160-character planning contract without truncating longer city identities', () => {
  const h = harness();
  const accepted = 'A'.repeat(160), rejected = accepted + 'B';
  const apple = h.apple.normalizeAppleJourneySearch({ results: [{ coordinate: center, name: accepted },
    { coordinate: { ...center, longitude: 135.78 }, name: rejected }] });
  assert.equal(apple.length, 1); assert.equal(apple[0].name, accepted);
  const osm = load('lib/travel-assistant/journey-search.ts', { './places': places, './journey-routing': {}, './journey-apple-places': {} });
  const result = osm.normalizeJourneySearch([{ osm_type: 'node', osm_id: 1, lat: 35.01, lon: 135.77, name: accepted },
    { osm_type: 'node', osm_id: 2, lat: 35.01, lon: 135.78, name: rejected },
    { osm_type: 'node', osm_id: 3, lat: 35.01, lon: 135.79, display_name: rejected }]);
  assert.equal(result.length, 1); assert.equal(result[0].name, accepted);
});

test('Normalization rejects forged sources, missing IDs and categories, remote or invalid coordinates without calling unrelated business types museums', () => {
  const h = harness(), stamp = new Date().toISOString();
  const bad = [row('../evil'), row('x?x=1'), { ...row(), id: undefined }, row('I2', 'Restaurant'), row('I3', 'toString'),
    row('I4', 'Museum', { latitude: '35', longitude: 135 }), row('I5', 'Museum', { latitude: 40, longitude: 135 }), { ...row('I6'), name: '' }];
  const values = h.apple.normalizeAppleJourneyDiscovery({ results: [row(), ...bad] }, center, 'culture', stamp);
  assert.equal(values.length, 1);
  assert.equal(h.apple.normalizeAppleJourneyDiscovery({ results: [row('I7', 'Store')] }, center, 'shopping', stamp)[0].category, 'store');
  assert.equal(h.apple.normalizeAppleJourneyDiscovery({ results: [row('I8', 'ReligiousSite')] }, center, 'culture', stamp)[0].category, 'attraction');
  for (const raw of [{}, { results: [] , error: 'provider failure' }, { results: new Array(101).fill(row()) }]) {
    assert.throws(() => h.apple.normalizeAppleJourneySearch(raw));
    assert.throws(() => h.apple.normalizeAppleJourneyDiscovery(raw, center, 'culture', stamp));
  }
  assert.equal(places.validJourneyPlaceSource('apple-area/35,135', 'https://maps.apple.com/place?coordinate=35,135'), false);
  assert.equal(places.validJourneyPlaceSource('apple/I1', 'https://maps.apple.com.evil.test/place?place-id=I1'), false);
});

test('Antimeridian discovery uses the exact coarse location instead of a wraparound global rectangle', async () => {
  const h = harness(() => ({ results: [] }));
  await h.apple.discoverAppleJourneyPlaces({ latitude: 0, longitude: 179.999 }, 'nature');
  assert.equal(h.calls[0].params.get('searchLocation'), '0,180');
  assert.equal(h.calls[0].params.has('searchRegion'), false);
});

test('Essentials searches its five real service categories separately and bounds their combined result within one deadline', async () => {
  let index = 0;
  const h = harness(params => ({ results: Array.from({ length: 100 }, () => row(`I${++index}`, params.get('q') === 'pharmacy' ? 'Pharmacy' : 'Hospital')) }));
  const result = await h.apple.discoverAppleJourneyPlaces(center, 'essentials');
  assert.deepEqual(h.calls.map(call => call.params.get('q')), ['pharmacy', 'hospital', 'police', 'ATM', 'restrooms']);
  assert.equal(new Set(h.calls.map(call => call.deadline)).size, 1);
  assert.equal(result.places.length, 250); assert.equal(result.limited, true);
  assert.equal(client().validateDiscoveryResponse(result, center, 'essentials').places.length, 250);
});

test('Duplicate searches share work, concurrent requests are bounded and failed second category never caches a partial discovery', async () => {
  const wait = deferred(); const h = harness(() => wait.promise);
  const a = h.apple.searchAppleJourneyPlaces('Kyoto', 'en'), duplicate = h.apple.searchAppleJourneyPlaces('Kyoto', 'en');
  const b = h.apple.searchAppleJourneyPlaces('Osaka', 'en');
  await assert.rejects(h.apple.searchAppleJourneyPlaces('Istanbul', 'en')); assert.equal(h.calls.length, 2);
  wait.resolve({ results: [] }); await Promise.all([a, b, duplicate]);
  let count = 0; const partial = harness(() => { if (++count === 2) throw Error('failed second category'); return { results: [row()] }; });
  await assert.rejects(partial.apple.discoverAppleJourneyPlaces(center, 'culture'));
  const result = await partial.apple.discoverAppleJourneyPlaces(center, 'culture');
  assert.equal(partial.calls.length, 4); assert.equal(result.places.length, 1);
});

test('Key rotation fences pending Apple place results and cache expiry cannot resurrect earlier provider data', async () => {
  const waiting = deferred(), h = harness(() => waiting.promise);
  const pending = h.apple.searchAppleJourneyPlaces('Kyoto', 'en'); h.setIdentity('key-b'); waiting.resolve({ results: [row()] });
  await assert.rejects(pending);
  await h.apple.searchAppleJourneyPlaces('Kyoto', 'en'); assert.equal(h.calls.length, 2);
  h.advance(3600_001); await h.apple.searchAppleJourneyPlaces('Kyoto', 'en'); assert.equal(h.calls.length, 3);
  h.advance(-7_200_000); await h.apple.searchAppleJourneyPlaces('Kyoto', 'en'); assert.equal(h.calls.length, 4);
});

test('Configured Apple place failures never fall through to OSM or an unrelated geocoder', async () => {
  let fallback = 0;
  const apple = { hasAppleJourneyPlaces: () => true, searchAppleJourneyPlaces: async () => { throw Error('Apple failure'); },
    discoverAppleJourneyPlaces: async () => { throw Error('Apple failure'); } };
  const search = load('lib/travel-assistant/journey-search.ts', { './places': places, './journey-apple-places': apple,
    './journey-routing': { providerUrl: () => { fallback++; } } }, { process: { env: { TRAVEL_GEOCODER_URL: 'https://other.test' } } });
  const discovery = load('lib/travel-assistant/journey-discovery.ts', { './places': places, './journey-apple-places': apple,
    './overpass': { queryOverpass: () => { fallback++; } }, './journey-photos': {}, 'next/cache': { unstable_cache: fn => fn },
    './result-cache': load('lib/travel-assistant/result-cache.ts') });
  await assert.rejects(search.searchJourneyPlaces('Kyoto', 'en')); await assert.rejects(discovery.discoverJourneyPlaces(center, 'culture'));
  assert.equal(fallback, 0);
});

test('Browser validations reject cross-provider attributions, substituted Apple identities and coordinate search links', async () => {
  const h = harness(), result = await h.apple.discoverAppleJourneyPlaces(center, 'culture'), c = client();
  for (const mutate of [v => { v.attribution = '© OpenStreetMap contributors'; }, v => { v.places[0].sourceUrl += '&fake=true'; },
    v => { v.places[0].id = 'node/1'; }, v => { v.places[0].category = 'restaurant'; }]) {
    const v = clone(result); mutate(v); assert.throws(() => c.validateDiscoveryResponse(v, center, 'culture'));
  }
  const raw = { results: [{ coordinate: center, name: 'Kyoto' }] }, search = { places: h.apple.normalizeAppleJourneySearch(raw), fetchedAt: new Date().toISOString(), attribution: 'Apple Maps' };
  for (const mutate of [v => { v.places[0].longitude = 1; }, v => { v.places[0].sourceUrl += '&q=wrong'; }, v => { v.attribution = '© OpenStreetMap contributors'; }]) {
    const v = clone(search); mutate(v); assert.throws(() => c.validateJourneySearch(v));
  }
});

test('Apple search uses the shared server-only signed transport and rejected access is refreshed on an explicit attempt after cooldown', async () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  let now = Date.now(), denied = true; const calls = [];
  const Clock = class extends Date { static now() { return now; } };
  const server = load('lib/maps/apple-maps-server.ts', { 'node:crypto': crypto }, { Date: Clock, process: { env: {
    APPLE_MAPS_TEAM_ID: 'TEAMID1234', APPLE_MAPS_KEY_ID: 'KEYID12345', APPLE_MAPS_PRIVATE_KEY: privateKey.export({ format: 'pem', type: 'pkcs8' }),
  } }, fetch: async (url, options) => {
    calls.push({ url, options }); return new URL(url).pathname === '/v1/token' ? Response.json({ accessToken: 'header.payload.signature', expiresInSeconds: 1800 })
      : denied ? new Response('', { status: 401 }) : Response.json({ results: [row()] });
  } });
  const params = new URLSearchParams({ q: 'Kyoto & Osaka' });
  await assert.rejects(server.appleMapsSearch(params, now + 12_000));
  denied = false; await assert.rejects(server.appleMapsSearch(params, now + 12_000)); assert.equal(calls.length, 2);
  now += 301_000; const result = await server.appleMapsSearch(params, now + 12_000); assert.equal(result.results.length, 1);
  assert.equal(calls.length, 4); assert.equal(calls.filter(c => new URL(c.url).pathname === '/v1/token').length, 2);
  for (const call of calls) { assert.equal(new URL(call.url).origin, 'https://maps-api.apple.com'); assert.equal(call.options.redirect, 'error'); }
  assert.equal(new URL(calls[3].url).searchParams.get('q'), 'Kyoto & Osaka');
  assert.doesNotMatch(JSON.stringify(result), /signature|PRIVATE KEY/);
});


test('Nature discovery retains verified Apple beach and hiking categories and their source identities', async () => {
  const h = harness(params => ({ results: params.get('q') === 'parks' ? [row('PARK', 'Park')] : [row('BEACH', 'Beach'), row('TRAIL', 'Hiking')] }));
  const result = await h.apple.discoverAppleJourneyPlaces(center, 'nature');
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.params.get('includePoiCategories').includes('Beach') && call.params.get('includePoiCategories').includes('Hiking')));
  assert.deepEqual([...result.places.map(place => place.category)].sort(), ['beach', 'hiking', 'park']);
  const validated = client().validateDiscoveryResponse(result, center, 'nature');
  assert.equal(validated.places.length, 3);
  assert.equal(validated.places.find(place => place.category === 'beach').sourceUrl, 'https://maps.apple.com/place?place-id=BEACH');
});
