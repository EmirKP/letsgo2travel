import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Error, Date, Intl, URL, URLSearchParams, Response, Request, AbortSignal, AbortController, setTimeout, clearTimeout, Buffer, TextDecoder, process: { env: {} }, ...globals })(name => {
    if (name in imports) return imports[name];
    throw Error(`Missing import ${name}`);
  }, output, output.exports);
  return output.exports;
}
const clone = value => JSON.parse(JSON.stringify(value));
const places = load('lib/travel-assistant/places.ts');
const resultCache = load('lib/travel-assistant/result-cache.ts');
const http = load('lib/travel-assistant/http.ts');
const routing = globals => load('lib/travel-assistant/journey-routing.ts', { './places': places,
  './journey-apple-routing': { hasAppleJourneyRouting: () => false } }, globals);
const photos = (globals = {}) => load('lib/travel-assistant/journey-photos.ts', { './places': places, './journey-routing': routing(), './journey-apple-places': { hasAppleJourneyPlaces: () => false } }, globals);
const discovery = (queryOverpass = async () => ({ elements: [] }), globals = {}) => load('lib/travel-assistant/journey-discovery.ts', {
  './places': places, './overpass': { queryOverpass }, './result-cache': resultCache, './journey-photos': photos(), './journey-apple-places': { hasAppleJourneyPlaces: () => false }, 'next/cache': { unstable_cache: fn => fn },
}, globals);
const center = { latitude: 41.90, longitude: 12.49 };
const row = (id, tags, fields = {}) => ({ type: 'node', id, lat: 41.902, lon: 12.491, tags: { name: 'Rome place', ...tags }, ...fields });
const stamp = '2026-10-13T10:00:00.000Z';
const points = [{ latitude: 41.9000, longitude: 12.4900 }, { latitude: 41.9020, longitude: 12.4930 }, { latitude: 41.9040, longitude: 12.4940 }];
function walkingFixture() {
  const geometry = [[12.4900, 41.9000], [12.4900, 41.9010], [12.4930, 41.9020], [12.4940, 41.9040]];
  const meter = (a, b) => places.distanceKm({ latitude: a[1], longitude: a[0] }, { latitude: b[1], longitude: b[0] }) * 1000;
  const distances = [meter(geometry[0], geometry[1]) + meter(geometry[1], geometry[2]), meter(geometry[2], geometry[3])];
  const segments = distances.map(distance => ({ distance, duration: distance / 1.3 }));
  return { type: 'FeatureCollection', metadata: { query: { profile: 'foot-walking' } }, features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: geometry }, properties: {
    segments, way_points: [0, 2, 3], summary: { distance: distances.reduce((a, b) => a + b), duration: segments.reduce((sum, leg) => sum + leg.duration, 0) },
  } }] };
}
const deferred = () => { let resolve; return { promise: new Promise(yes => { resolve = yes; }), resolve }; };
const client = requestJson => load('mobile/src/lib/mapJourneyClient.ts', {
  './api': { requestJson }, './travelAreas': { TRAVEL_CENTRES: [{ ...center, name: 'Roma' }] },
  './searchText': { normalizeSearchText: text => text.trim().toLowerCase() }, '../../../lib/travel-assistant/places': places,
});
const photoFixture = (file = 'Rome.jpg') => ({ ns: 6, title: `File:${file}`, imagerepository: 'local', imageinfo: [{
  thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(file)}/160px-${encodeURIComponent(file)}`,
  descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
  mime: 'image/jpeg', thumbmime: 'image/jpeg', mediatype: 'BITMAP', thumbwidth: 160, thumbheight: 120,
  extmetadata: { Artist: { value: '<a href="https://example.test">Jane &amp; Jo</a>' },
    LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' } },
}] });

test('Only explicitly linked Commons raster files are accepted; unsafe hosts, encoded paths and non-photo documents stay absent', () => {
  assert.equal(places.commonsPhotoFile('File:Rome_cafe.jpg'), 'Rome cafe.jpg');
  assert.equal(places.commonsPhotoFile('https://commons.wikimedia.org/wiki/File:Rome_cafe.jpg'), 'Rome cafe.jpg');
  assert.equal(places.commonsPhotoFile(photoFixture().imageinfo[0].thumburl), 'Rome.jpg');
  for (const value of ['Category:Rome', 'Rome.jpg', 'File:Rome.svg', 'File:Rome.pdf', 'File:Rome.html', 'File:Rome.jpg|File:Other.jpg',
    'File:../Rome.jpg', 'File:Rome\n.jpg', 'File:Rome%2F.jpg', 'File:' + 'x'.repeat(250) + '.jpg',
    'https://evil.test/Rome.jpg', 'https://upload.wikimedia.org.evil.test/wikipedia/commons/a/ab/Rome.jpg',
    'https://user:pass@upload.wikimedia.org/wikipedia/commons/a/ab/Rome.jpg', 'http://upload.wikimedia.org/wikipedia/commons/a/ab/Rome.jpg',
    'https://commons.wikimedia.org/wiki/File:%3Cscript%3E.jpg', 'https://commons.wikimedia.org/wiki/File:a%2fb.jpg']) {
    assert.equal(places.commonsPhotoFile(value), null, value);
  }
  const image = photoFixture().imageinfo[0].thumburl;
  assert.equal(places.safeJourneyPhotoUrl(image), image);
  assert.equal(places.safeJourneyPhotoUrl(image.replace('160px-', '999px-')), null);
  assert.equal(places.safeJourneyPhotoUrl(image.replace('/160px-Rome.jpg', '/160px-Other.jpg')), null);
  assert.equal(places.safeJourneyPhotoUrl(image + '?redirect=elsewhere'), null);
  assert.equal(places.safeJourneyPhotoUrl('https://commons.wikimedia.org/wiki/Special:FilePath/Rome.jpg?width=160'), null);
});

test('Photo metadata requires the exact requested file, genuine bounded bitmap, author and matching supported license', () => {
  const model = photos(), page = photoFixture(), value = model.normalizeCommonsPhotos({ query: { pages: [page] } }, ['Rome.jpg']).get('Rome.jpg');
  assert.equal(value.imageAttribution, 'Jane & Jo'); assert.equal(value.imageLicenseLabel, 'CC BY-SA 4.0');
  assert.equal(value.imageSourceUrl, 'https://commons.wikimedia.org/wiki/File:Rome.jpg');
  assert.equal(places.validJourneyPhoto(value), true); assert.equal(places.validJourneyPhoto({}), true);
  assert.equal(places.validJourneyPhoto({ imageUrl: value.imageUrl }), false);
  for (const mutate of [p => { p.title = 'File:Other.jpg'; }, p => { p.imageinfo[0].thumburl = photoFixture('Other.jpg').imageinfo[0].thumburl; },
    p => { p.imageinfo[0].extmetadata.Artist = {}; }, p => { p.imageinfo[0].mime = 'image/svg+xml'; }, p => { p.imageinfo[0].thumbheight = 10000; },
    p => { p.imageinfo[0].extmetadata.LicenseUrl.value = 'https://creativecommons.org/licenses/by-nc/4.0/'; },
    p => { p.imageinfo[0].extmetadata.LicenseShortName.value = 'CC BY 3.0'; },
    p => { p.imageinfo[0].descriptionurl = 'https://evil.test/File:Rome.jpg'; }, p => { p.imageinfo[0].extmetadata.Attribution = { value: 'x'.repeat(801) }; }]) {
    const invalid = clone(page); mutate(invalid); assert.equal(model.normalizeCommonsPhotos({ query: { pages: [invalid] } }, ['Rome.jpg']).size, 0);
  }
  for (const [label, url] of [['CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'], ['Public domain', 'https://creativecommons.org/publicdomain/mark/1.0/'], ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/']]) {
    const supported = clone(page); supported.imageinfo[0].extmetadata.LicenseShortName.value = label; supported.imageinfo[0].extmetadata.LicenseUrl.value = url;
    assert.equal(model.normalizeCommonsPhotos({ query: { pages: [supported] } }, ['Rome.jpg']).size, 1);
  }
});

test('Current Commons thumbnail host and fixed imageinfo campaign fields normalize without accepting arbitrary redirects or queries', () => {
  const page = photoFixture('Fontana_dei_Libri.jpeg');
  page.imageinfo[0].thumburl = page.imageinfo[0].thumburl.replace('upload.wikimedia.org', 'thumb.wikimedia.org')
    + '?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail';
  page.imageinfo[0].extmetadata.LicenseUrl.value = 'https://creativecommons.org/licenses/by-sa/4.0';
  const photo = photos().normalizeCommonsPhotos({ query: { pages: [page] } }, ['Fontana dei Libri.jpeg']).get('Fontana dei Libri.jpeg');
  assert.ok(photo); assert.match(photo.imageUrl, /^https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\//);
  assert.doesNotMatch(photo.imageUrl, /\?/); assert.equal(photo.imageLicenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(places.validJourneyPhoto(photo), true);
  assert.equal(places.safeJourneyPhotoUrl(page.imageinfo[0].thumburl + '&redirect=https://evil.test'), null);
  assert.equal(places.safeJourneyPhotoUrl(page.imageinfo[0].thumburl.replace('utm_content=thumbnail', 'utm_content=original&utM_content=thumbnail')), null);
  assert.equal(places.safeJourneyPhotoUrl('https://thumb.wikimedia.org/wikipedia/commons/a/ab/Rome.jpg'), null);
});

test('Optional photos use one bounded batch for twelve explicit files, share concurrent work and cache full attribution', async () => {
  const calls = [], wait = deferred(), model = photos({ fetch: (url, options) => { calls.push({ url, options }); return wait.promise; } });
  const raw = { elements: Array.from({ length: 15 }, (_, i) => row(i + 1, { shop: 'gift', wikimedia_commons: `File:Place_${i + 1}.jpg` })) };
  const plain = discovery().normalizeDiscovery(raw, center, 'shopping', stamp), original = JSON.stringify(plain);
  const first = model.enrichJourneyPhotos(plain, raw), second = model.enrichJourneyPhotos(plain, raw);
  assert.equal(calls.length, 1); assert.equal(calls[0].url.hostname, 'commons.wikimedia.org');
  assert.equal(calls[0].url.searchParams.get('titles').split('|').length, 12);
  assert.equal(calls[0].url.searchParams.get('prop'), 'imageinfo'); assert.equal(calls[0].options.redirect, 'error');
  wait.resolve(Response.json({ query: { pages: Array.from({ length: 12 }, (_, i) => photoFixture(`Place_${i + 1}.jpg`)) } }));
  const enriched = await first; assert.equal((await second).length, 15);
  assert.equal(enriched.filter(item => item.imageUrl).length, 12); assert.equal(enriched[12].imageUrl, undefined);
  assert.equal(enriched[0].fetchedAt, stamp); assert.equal(JSON.stringify(plain), original);
  await model.enrichJourneyPhotos(plain, raw); assert.equal(calls.length, 1);
});

test('Photo metadata timeout, quota denial and malformed response preserve every place without retrying or releasing a hung transport slot', async () => {
  let now = Date.now(), calls = 0; const timers = [], wait = deferred();
  const model = photos({ Date: class extends Date { static now() { return now; } }, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    fetch: () => { calls++; return wait.promise; } });
  const raw = { elements: [row(1, { shop: 'gift', image: 'File:Rome.jpg' })] }, plain = discovery().normalizeDiscovery(raw, center, 'shopping', stamp);
  const running = model.enrichJourneyPhotos(plain, raw); timers[0]();
  assert.deepEqual(clone(await running), clone(plain)); now += 10 * 60_000;
  assert.deepEqual(clone(await model.enrichJourneyPhotos(plain, raw)), clone(plain)); assert.equal(calls, 1);
  wait.resolve(Response.json({ query: { pages: [photoFixture()] } })); await new Promise(resolve => setImmediate(resolve));
  let deniedCalls = 0; const denied = photos({ fetch: async () => { deniedCalls++; return new Response('quota', { status: 429, headers: { 'Retry-After': '120' } }); } });
  assert.deepEqual(clone(await denied.enrichJourneyPhotos(plain, raw)), clone(plain));
  assert.deepEqual(clone(await denied.enrichJourneyPhotos(plain, raw)), clone(plain)); assert.equal(deniedCalls, 1);
  const malformed = photos({ fetch: async () => Response.json({ query: { pages: [photoFixture('Other.jpg')] } }) });
  assert.deepEqual(clone(await malformed.enrichJourneyPhotos(plain, raw)), clone(plain));
});

test('Mobile successful discovery keeps only complete safe photo metadata and rejects photo/source/license substitutions', () => {
  const photo = photos().normalizeCommonsPhotos({ query: { pages: [photoFixture()] } }, ['Rome.jpg']).get('Rome.jpg');
  const now = new Date().toISOString(), plain = discovery().normalizeDiscovery({ elements: [row(1, { shop: 'gift' })] }, center, 'shopping', now);
  const response = { places: [{ ...plain[0], ...photo }], center, radius: 3000, fetchedAt: now, limited: false, attribution: '© OpenStreetMap contributors' };
  assert.equal(client().validateDiscoveryResponse(response, center, 'shopping').places[0].imageAttribution, 'Jane & Jo');
  for (const patch of [{ imageUrl: 'https://evil.test/Rome.jpg' }, { imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Other.jpg' },
    { imageAttribution: undefined }, { imageLicenseLabel: 'CC BY 4.0' }, { imageLicenseUrl: 'https://evil.test/license' }]) {
    assert.throws(() => client().validateDiscoveryResponse({ ...response, places: [{ ...response.places[0], ...patch }] }, center, 'shopping'));
  }
});

test('Discovery issues separate bounded category queries with coarse area coordinates and no caller-supplied selectors', () => {
  const model = discovery();
  for (const group of ['food', 'shopping', 'culture', 'nature', 'essentials']) {
    const query = model.discoveryQuery({ latitude: 41.902999, longitude: 12.494444 }, group);
    const [south, west, north, east] = query.match(/nwr\(([-\d.,]+)\)/)[1].split(',').map(Number);
    assert.ok(Math.abs((south + north) / 2 - 41.9) < 0.00001); assert.ok(Math.abs((west + east) / 2 - 12.49) < 0.00001);
    assert.ok(north - south < 0.06); assert.ok(east - west < 0.08); assert.doesNotMatch(query, /around:/);
    assert.match(query, /out center tags 250/); assert.match(query, /timeout:12/);
    assert.equal(query, model.discoveryQuery({ latitude: 41.9, longitude: 12.49 }, group));
  }
  assert.match(model.discoveryQuery(center, 'shopping'), /boutique\|clothes\|craft\|gift\|souvenir/);
  assert.match(model.discoveryQuery(center, 'food'), /bakery\|pastry\|confectionery/);
  assert.throws(() => model.discoveryQuery({ latitude: '41.9', longitude: 12.49 }, 'food'));
  assert.throws(() => model.discoveryQuery(center, 'food];out;'));
});

test('Dense-city discovery avoids broad building/artwork scans and splits dateline bounds into two small indexed areas', () => {
  const model = discovery(), culture = model.discoveryQuery(center, 'culture');
  assert.doesNotMatch(culture, /\|building|attraction\|artwork/); assert.match(culture, /artwork_type=statue/);
  assert.match(culture, /\[~"\^name\(:en\)\?\$"~"\."\]/);
  assert.doesNotMatch(model.discoveryQuery(center, 'essentials'), /\^name/);
  const dateline = model.discoveryQuery({ latitude: -18, longitude: 180 }, 'nature');
  const boxes = [...dateline.matchAll(/nwr\(([-\d.,]+)\)/g)].map(match => match[1].split(',').map(Number));
  assert.equal(boxes.length, 6);
  for (const [south, west, north, east] of boxes) { assert.ok(south < north); assert.ok(west <= east); assert.ok(east - west < 1); }
  assert.ok(boxes.some(box => box[1] === -180)); assert.ok(boxes.some(box => box[3] === 180));
});

test('Real food, shopping and nature records preserve provenance without fabricated ratings or local-business claims', () => {
  const model = discovery();
  const food = model.normalizeDiscovery({ elements: [row(1, { amenity: 'cafe' }), row(2, { shop: 'bakery' }), row(3, { amenity: 'restaurant' }), row(4, { shop: 'pastry' })] }, center, 'food', stamp);
  assert.deepEqual(clone(food.map(item => item.category)), ['cafe', 'bakery', 'restaurant', 'sweets']);
  const shopping = model.normalizeDiscovery({ elements: [row(5, { shop: 'boutique' }), row(6, { craft: 'pottery' }), row(7, { shop: 'gift' }), row(8, { amenity: 'marketplace' })] }, center, 'shopping', stamp);
  assert.deepEqual(clone(shopping.map(item => item.category)), ['boutique', 'craft', 'gift', 'market']);
  assert.equal(shopping[0].sourceUrl, 'https://www.openstreetmap.org/node/5'); assert.equal(shopping[0].fetchedAt, stamp);
  assert.equal(shopping[0].hours, null); assert.equal(shopping[0].free, null); assert.equal(shopping[0].accessible, null);
  assert.equal('rating' in shopping[0], false); assert.equal('localFavorite' in shopping[0], false);
  assert.equal(model.normalizeDiscovery({ elements: [row(9, { leisure: 'garden' })] }, center, 'nature', stamp)[0].category, 'garden');
  assert.equal(model.normalizeDiscovery({ elements: [row(10, { tourism: 'museum' })] }, center, 'culture', stamp)[0].category, 'museum');
  assert.equal(model.normalizeDiscovery({ elements: [row(11, { amenity: 'pharmacy', name: '' })] }, center, 'essentials', stamp)[0].category, 'pharmacy');
});

test('Discovery rejects wrong-area, duplicate, unnamed, malformed and wrong-group records; unsafe fields never become links', () => {
  const model = discovery();
  const result = model.normalizeDiscovery({ elements: [row(1, { shop: 'gift', name: '<b>Souvenirs</b>', website: 'javascript:alert(1)', 'addr:street': '<b>Via</b>' }), row(1, { shop: 'gift' }),
    row(2, { shop: 'gift', name: '' }), row(3, { shop: 'gift' }, { lat: 51 }), row(4, { shop: 'gift' }, { lon: '12.49' }),
    row(5, { amenity: 'cafe' }), row(-1, { shop: 'gift' })] }, center, 'shopping', stamp);
  assert.equal(result.length, 1); assert.equal(result[0].name, 'Souvenirs'); assert.equal(result[0].address, 'Via'); assert.equal(result[0].website, null);
  assert.throws(() => model.normalizeDiscovery({ elements: [], remark: 'runtime failure' }, center, 'food', stamp));
});

test('Concurrent same-area discovery shares the existing provider budget and cache, while categories remain independent', async () => {
  const wait = deferred(), calls = [];
  const model = discovery(query => { calls.push(query); return wait.promise; });
  const first = model.discoverJourneyPlaces(center, 'shopping'), second = model.discoverJourneyPlaces({ latitude: 41.901, longitude: 12.491 }, 'shopping');
  assert.equal(calls.length, 1); wait.resolve({ elements: [row(1, { shop: 'gift' })] });
  assert.equal((await first).places.length, 1); assert.equal((await second).places.length, 1);
  await model.discoverJourneyPlaces(center, 'shopping'); assert.equal(calls.length, 1);
  await model.discoverJourneyPlaces(center, 'culture'); assert.equal(calls.length, 2);
});

test('Discovery outage can reuse only the same area and category with its original date, then expires the fallback', async () => {
  let now = Date.now(), fails = false;
  const clock = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const model = load('lib/travel-assistant/journey-discovery.ts', { './places': places, './journey-photos': photos(), './journey-apple-places': { hasAppleJourneyPlaces: () => false },
    './overpass': { queryOverpass: async () => { if (fails) throw Error('Outage'); return { elements: [row(1, { shop: 'gift' })] }; } },
    './result-cache': { createMapResultCache: timestamp => resultCache.createMapResultCache(timestamp, () => now) },
    'next/cache': { unstable_cache: fn => fn },
  }, { Date: clock });
  const first = await model.discoverJourneyPlaces(center, 'shopping');
  now += 2 * 3600_000; fails = true;
  const cached = await model.discoverJourneyPlaces(center, 'shopping');
  assert.equal(cached.stale, true); assert.equal(cached.fetchedAt, first.fetchedAt);
  await assert.rejects(model.discoverJourneyPlaces(center, 'food'));
  await assert.rejects(model.discoverJourneyPlaces({ latitude: 42, longitude: 12.49 }, 'shopping'));
  now += 5 * 3600_000; await assert.rejects(model.discoverJourneyPlaces(center, 'shopping'));
});

test('Walking response preserves real geometry and per-leg times, rejecting driving, missing stops and contradictory data', () => {
  const model = routing(); const original = walkingFixture(); const route = model.normalizeWalkingRoute(original, points, stamp);
  assert.deepEqual(clone(route.geometry), original.features[0].geometry); assert.equal(route.legs.length, 2); assert.equal(route.profile, 'foot-walking');
  assert.equal(route.durationSeconds, original.features[0].properties.summary.duration);
  for (const change of [raw => { raw.metadata.query.profile = 'driving-car'; }, raw => { raw.features[0].properties.segments.pop(); },
    raw => { raw.features[0].properties.way_points = [0, 1, 3]; }, raw => { raw.features[0].geometry.coordinates[0] = [0, 0]; },
    raw => { raw.features[0].properties.summary.duration += 1000; }, raw => { raw.features[0].properties.warnings = [{ code: 3 }]; },
    raw => { raw.features[0].geometry.coordinates[1] = [22, 42]; }]) {
    const invalid = clone(original); change(invalid); assert.throws(() => model.normalizeWalkingRoute(invalid, points, stamp));
  }
});

test('Walking requests require nearby numeric stops and configured foot provider, never using a demo or invented line', async () => {
  let called = 0; const model = routing({ fetch: () => { called++; throw Error('Unexpected'); } });
  assert.equal(model.journeyStops([points[0]]), null); assert.equal(model.journeyStops([points[0], points[0]]), null);
  assert.equal(model.journeyStops([points[0], { latitude: 51, longitude: 12 }]), null);
  assert.equal(model.journeyStops([points[0], { latitude: '41.90', longitude: 12.49 }]), null);
  await assert.rejects(model.getJourneyWalkingRoute(points), /not configured/); assert.equal(called, 0);
  const wrongProfile = routing({ process: { env: { TRAVEL_ORS_URL: 'https://routes.test/v2/directions/driving-car/geojson' } }, fetch: () => { called++; } });
  await assert.rejects(wrongProfile.getJourneyWalkingRoute(points), /profile/); assert.equal(called, 0);
});

test('ORS calls keep credentials on the server, preserve stop order, bound work and reuse confirmed results', async () => {
  const calls = [], wait = deferred(); const model = routing({ process: { env: { TRAVEL_ORS_API_KEY: 'test-server-only' } }, fetch: (url, options) => { calls.push({ url: url.href, options }); return wait.promise; } });
  const one = model.getJourneyWalkingRoute(points), two = model.getJourneyWalkingRoute(points);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson');
  assert.equal(calls[0].options.headers.Authorization, 'test-server-only'); assert.equal(calls[0].options.redirect, 'error');
  const body = JSON.parse(calls[0].options.body); assert.deepEqual(body.coordinates, points.map(point => [point.longitude, point.latitude])); assert.deepEqual(body.radiuses, [100, 100, 100]);
  wait.resolve(Response.json(walkingFixture())); const result = await one; await two;
  assert.doesNotMatch(JSON.stringify(result), /test-server-only/); await model.getJourneyWalkingRoute(points); assert.equal(calls.length, 1);
});

test('Routing quota denial pauses all routes without another provider and failure never becomes an empty successful route', async () => {
  let now = 1_800_000_000_000, calls = 0;
  const model = routing({ Date: class extends Date { static now() { return now; } }, process: { env: { TRAVEL_ORS_API_KEY: 'test-key' } }, fetch: async () => {
    calls++; return new Response('quota', { status: 429, headers: { 'Retry-After': '180' } });
  } });
  await assert.rejects(model.getJourneyWalkingRoute(points)); now += 100_000;
  await assert.rejects(model.getJourneyWalkingRoute([points[1], points[2]]), /busy/); assert.equal(calls, 1);
  now += 100_000; await assert.rejects(model.getJourneyWalkingRoute(points)); assert.equal(calls, 2);
});

test('Distinct routing work is capped at two in-flight requests and invalid upstream geometry is never cached', async () => {
  const waits = [];
  const model = routing({ process: { env: { TRAVEL_ORS_API_KEY: 'test-key' } }, fetch: () => { const wait = deferred(); waits.push(wait); return wait.promise; } });
  const one = model.getJourneyWalkingRoute(points), two = model.getJourneyWalkingRoute(points.map(p => ({ ...p, latitude: p.latitude + 0.0001 })));
  await assert.rejects(model.getJourneyWalkingRoute(points.map(p => ({ ...p, latitude: p.latitude + 0.0002 }))), /busy/);
  assert.equal(waits.length, 2);
  waits[0].resolve(Response.json({ type: 'FeatureCollection', features: [] }));
  waits[1].resolve(Response.json(walkingFixture()));
  await assert.rejects(one, /Invalid/); await two;
  await assert.rejects(model.getJourneyWalkingRoute(points), /busy/);
});

test('Upstream streaming and declared response sizes are bounded before route normalization', async () => {
  const model = routing();
  await assert.rejects(model.providerJson(new Response('x'.repeat(101)), 100), /too large/);
  await assert.rejects(model.providerJson(new Response('x', { headers: { 'Content-Length': '101' } }), 100), /too large/);
  assert.throws(() => model.providerUrl('https://user:pass@routes.test/route'));
  assert.throws(() => model.providerUrl('http://routes.test/route'));
  assert.throws(() => model.providerUrl('https://127.0.0.1/route'));
});

test('Address search is explicitly configured and canonical results contain no untrusted URLs or labels', async () => {
  const model = load('lib/travel-assistant/journey-search.ts', { './places': places, './journey-routing': routing(), './journey-apple-places': { hasAppleJourneyPlaces: () => false } });
  await assert.rejects(model.searchJourneyPlaces('Rome Italy', 'en'), /not configured/);
  const result = model.normalizeJourneySearch([{ osm_type: 'node', osm_id: 3, lat: '41.90', lon: '12.49', name: '<b>Roma</b>', display_name: 'Roma, Italia', url: 'javascript:bad' },
    { osm_type: 'way', osm_id: 4, lat: '', lon: 0, name: 'Bad' }]);
  assert.equal(result.length, 1); assert.equal(result[0].name, 'Roma'); assert.equal(result[0].sourceUrl, 'https://www.openstreetmap.org/node/3');
  assert.equal(model.journeySearchQuery('x'), null); assert.equal(model.journeySearchQuery(' Rome   Italy '), 'Rome Italy');
});

test('Dedicated geocoder calls are shared, cached, query-encoded and never go to public Nominatim automatically', async () => {
  const calls = []; const globals = { process: { env: { TRAVEL_GEOCODER_URL: 'https://geocoder.test/search' } }, fetch: async (url, options) => {
    calls.push({ url, options }); return Response.json([{ osm_type: 'node', osm_id: 1, lat: '41.90', lon: '12.49', name: 'Rome' }]);
  } };
  const model = load('lib/travel-assistant/journey-search.ts', { './places': places, './journey-routing': routing(), './journey-apple-places': { hasAppleJourneyPlaces: () => false } }, globals);
  await Promise.all([model.searchJourneyPlaces('Rome & Italy', 'en'), model.searchJourneyPlaces('Rome & Italy', 'en')]);
  assert.equal(calls.length, 1); assert.equal(calls[0].url.searchParams.get('q'), 'Rome & Italy'); assert.equal(calls[0].url.searchParams.get('limit'), '8');
  await model.searchJourneyPlaces('Rome & Italy', 'en'); assert.equal(calls.length, 1);
  await assert.rejects(model.searchJourneyPlaces('London', 'en'), /busy/);
  const publicService = load('lib/travel-assistant/journey-search.ts', { './places': places, './journey-routing': routing(), './journey-apple-places': { hasAppleJourneyPlaces: () => false } }, { process: { env: { TRAVEL_GEOCODER_URL: 'https://nominatim.openstreetmap.org/search' } } });
  await assert.rejects(publicService.searchJourneyPlaces('Rome', 'en'), /dedicated/);
});

test('All new APIs bound request bytes and reject invalid inputs before provider work, with actionable unavailable codes', async () => {
  const invoke = (route, body) => route.POST(new Request('https://app.test/api', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  let calls = 0;
  const discover = load('app/api/travel-assistant/discover/route.ts', { '@/lib/travel-assistant/http': http, '@/lib/travel-assistant/places': places,
    '@/lib/travel-assistant/journey-discovery': { DISCOVERY_GROUPS: ['shopping'], discoverJourneyPlaces: async () => { calls++; throw Error('private provider details'); } } });
  assert.equal((await invoke(discover, { ...center, category: 'bad' })).status, 400); assert.equal(calls, 0);
  assert.equal((await invoke(discover, 'x'.repeat(1025))).status, 413);
  const failure = await invoke(discover, { ...center, category: 'shopping' }); assert.equal(failure.status, 503); assert.equal((await failure.json()).code, 'discovery_unavailable');
  const walk = load('app/api/travel-assistant/journey-route/route.ts', { '@/lib/travel-assistant/http': http, '@/lib/travel-assistant/journey-routing': routing() });
  assert.equal((await invoke(walk, { stops: [points[0]] })).status, 400);
  const unavailable = await invoke(walk, { stops: points }); assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).code, 'routing_unavailable');
  const searchModel = load('lib/travel-assistant/journey-search.ts', { './places': places, './journey-routing': routing(), './journey-apple-places': { hasAppleJourneyPlaces: () => false } });
  const search = load('app/api/travel-assistant/journey-search/route.ts', { '@/lib/travel-assistant/http': http, '@/lib/travel-assistant/journey-search': searchModel });
  assert.equal((await invoke(search, { query: 'Ro' })).status, 400);
  assert.equal((await (await invoke(search, { query: 'Rome', locale: 'en' })).json()).code, 'geocoding_unavailable');
});

test('Staging export includes the discovery, walking, search and all transitive journey dependencies', () => {
  const source = readFileSync('scripts/prepare-travel-assistant-staging.mjs', 'utf8');
  for (const path of ['app/api/travel-assistant/discover/route.ts', 'app/api/travel-assistant/journey-route/route.ts', 'app/api/travel-assistant/journey-search/route.ts',
    'lib/travel-assistant/journey-types.ts', 'lib/travel-assistant/journey-discovery.ts', 'lib/travel-assistant/journey-photos.ts', 'lib/travel-assistant/journey-routing.ts', 'lib/travel-assistant/journey-search.ts']) assert.ok(source.includes(`'${path}'`));
});

test('Mobile discovery accepts the canonical 231-place Rome response and rejects stale, wrong-cell or forged successful bodies', () => {
  const model = client(), now = new Date().toISOString(), server = discovery();
  const result = { center, radius: 3000, limited: true, fetchedAt: now, attribution: '© OpenStreetMap contributors',
    places: server.normalizeDiscovery({ elements: Array.from({ length: 231 }, (_, index) => row(index + 1, { shop: 'gift' })) }, center, 'shopping', now) };
  assert.equal(model.validateDiscoveryResponse(result, { latitude: 41.902, longitude: 12.491 }, 'shopping').places.length, 231);
  for (const change of [r => { r.center.longitude = 12.5; }, r => { r.places[0].sourceUrl = 'https://evil.test/place'; },
    r => { r.places[0].category = 'cafe'; }, r => { r.places[0].longitude = '12.49'; }, r => { r.places[0].website = 'javascript:bad'; },
    r => { r.places[0].name = '<img src=x>'; }, r => { r.places[0].fetchedAt = '2020-01-01T00:00:00.000Z'; },
    r => { r.places.push(r.places[0]); }, r => { r.fetchedAt = '2020-01-01T00:00:00.000Z'; }, r => { r.places = null; }]) {
    const bad = clone(result); change(bad); assert.throws(() => model.validateDiscoveryResponse(bad, center, 'shopping'));
  }
  const staleAt = new Date(Date.now() - 2 * 3600_000).toISOString();
  const stale = { ...result, stale: true, fetchedAt: staleAt, places: result.places.map(p => ({ ...p, fetchedAt: staleAt })) };
  assert.equal(model.validateDiscoveryResponse(stale, center, 'shopping').stale, true);
  assert.throws(() => model.validateDiscoveryResponse({ ...stale, stale: false }, center, 'shopping'));
});

test('Mobile routing rejects malformed geometry, changed stops, missing legs and fabricated timing before map rendering', () => {
  const model = client(), result = routing().normalizeWalkingRoute(walkingFixture(), points, new Date().toISOString());
  assert.equal(model.validateWalkingResponse(result, points).geometry.coordinates.length, 4);
  for (const change of [r => { r.geometry.coordinates = null; }, r => { r.geometry.coordinates[0] = [0, 0]; },
    r => { r.legs.pop(); }, r => { r.durationSeconds += 999; }, r => { r.profile = 'driving-car'; },
    r => { r.legs[0].durationSeconds = 1; }, r => { r.fetchedAt = new Date(Date.now() - 3600_000).toISOString(); }]) {
    const bad = clone(result); change(bad); assert.throws(() => model.validateWalkingResponse(bad, points));
  }
  assert.throws(() => model.validateWalkingResponse(result, [points[2], points[1], points[0]]));
});

test('Mobile explicit address search sends selected language, validates genuine results and retains offline known-city lookup', async () => {
  const calls = [], result = { places: [{ ...center, id: 'node/1', name: 'Rome hotel', address: 'Via Roma', sourceUrl: 'https://www.openstreetmap.org/node/1' }],
    fetchedAt: new Date().toISOString(), attribution: '© OpenStreetMap contributors' };
  const model = client(async (path, options) => { calls.push({ path, options }); return result; });
  assert.equal((await model.searchJourneyArea('Rome')).length, 1); assert.equal(calls.length, 0);
  assert.equal((await model.searchJourneyArea('A hotel Rome', undefined, 'sq'))[0].name, 'Rome hotel');
  assert.equal(calls[0].options.body.locale, 'sq'); assert.equal(calls[0].path, '/api/travel-assistant/journey-search');
  assert.throws(() => model.validateJourneySearch({ places: [] }));
  assert.throws(() => model.validateJourneySearch({ ...result, places: [{ ...result.places[0], latitude: NaN }] }));
  assert.throws(() => model.validateJourneySearch({ ...result, places: [{ ...result.places[0], sourceUrl: 'javascript:bad' }] }));
});

test('Around-route discovery covers a compact day with one actual stop and never searches a synthetic centroid', () => {
  let calls = 0; const model = client(() => { calls++; throw Error('No network in area selection'); });
  const result = model.discoveryCentersForRoute(points, center);
  assert.equal(result.centers.length, 1); assert.equal(result.coveredStopCount, 3); assert.equal(result.omittedStopCount, 0); assert.equal(result.complete, true);
  assert.ok(points.some(stop => stop.latitude === result.centers[0].latitude && stop.longitude === result.centers[0].longitude));
  assert.equal(calls, 0);
  const empty = model.discoveryCentersForRoute([], center);
  assert.deepEqual(clone(empty), { centers: [center], totalStopCount: 0, coveredStopCount: 0, omittedStopCount: 0, complete: true });
});

test('Around-route searches remain bounded for four distant clusters and report exactly the omitted stops', () => {
  const model = client(), stops = [0, 1, 2, 3].flatMap(cluster => Array.from({ length: 4 - cluster }, (_, offset) => ({ latitude: 41.9 + cluster * 0.1 + offset * 0.001, longitude: 12.49 })));
  const before = clone(stops), result = model.discoveryCentersForRoute(stops, center);
  assert.equal(result.centers.length, 3); assert.equal(result.totalStopCount, 10); assert.equal(result.coveredStopCount, 9); assert.equal(result.omittedStopCount, 1); assert.equal(result.complete, false);
  for (const selected of result.centers) assert.ok(stops.some(stop => stop.latitude === selected.latitude && stop.longitude === selected.longitude));
  const actualCovered = stops.filter(stop => result.centers.some(selected => places.distanceKm(places.coarseLocation(selected), stop) <= 3)).length;
  assert.equal(result.coveredStopCount, actualCovered); assert.deepEqual(stops, before);
  assert.equal(new Set(result.centers.map(selected => JSON.stringify(places.coarseLocation(selected)))).size, 3);
});

test('Around-route coverage respects provider rounding, duplicate cells and the dateline without treating distant legs as searched', () => {
  const model = client(), dateline = [{ latitude: -18, longitude: 179.999 }, { latitude: -18, longitude: -179.999 }, { latitude: -18.001, longitude: 179.998 }];
  const wrapped = model.discoveryCentersForRoute(dateline, center);
  assert.equal(wrapped.centers.length, 1); assert.equal(wrapped.coveredStopCount, 3);
  const far = [center, { latitude: 42.1, longitude: 12.49 }];
  const result = model.discoveryCentersForRoute(far, center);
  assert.equal(result.centers.length, 2); assert.equal(result.complete, true);
  const middle = { latitude: 42, longitude: 12.49 };
  assert.ok(result.centers.every(selected => places.distanceKm(selected, middle) > 3));
  assert.throws(() => model.discoveryCentersForRoute([{ latitude: NaN, longitude: 12 }], center));
  assert.throws(() => model.discoveryCentersForRoute([], { latitude: 0, longitude: 999 }));
  assert.throws(() => model.discoveryCentersForRoute(Array.from({ length: 121 }, () => center), center));
});


test('OSM beach tags become genuine coastal stops without treating ordinary parks as beaches', () => {
  const model = discovery();
  assert.match(model.discoveryQuery(center, 'nature'), /natural=beach/);
  const found = model.normalizeDiscovery({ elements: [row(501, { natural: 'beach', name: 'Coastal beach' }), row(502, { leisure: 'park' })] }, center, 'nature', stamp);
  assert.deepEqual([...found.map(place => place.category)], ['beach', 'park']);
  assert.equal(found[0].sourceUrl, 'https://www.openstreetmap.org/node/501');
});


test('Discovery capability isolates legacy and new POI responses without mutating the shared provider result', async () => {
  const now = new Date().toISOString();
  const existing = discovery().normalizeDiscovery({ elements: [row(601, { leisure: 'park' }), row(602, { natural: 'beach' })] }, center, 'nature', now);
  const shared = { places: existing, center, fetchedAt: now, radius: 3000, limited: false, attribution: '© OpenStreetMap contributors' };
  let providerCalls = 0;
  const api = load('app/api/travel-assistant/discover/route.ts', { '@/lib/travel-assistant/http': http, '@/lib/travel-assistant/places': places,
    '@/lib/travel-assistant/journey-discovery': { DISCOVERY_GROUPS: ['nature'], discoverJourneyPlaces: async () => { providerCalls++; return shared; } } });
  const invoke = body => api.POST(new Request('https://app.test/discover', { method: 'POST', body: JSON.stringify({ ...center, category: 'nature', ...body }) }));
  const old = await (await invoke({})).json();
  assert.deepEqual(old.places.map(place => place.category), ['park']); assert.equal(old.limited, true);
  const fresh = await (await invoke({placeCategoryVersion: 2})).json();
  assert.deepEqual(fresh.places.map(place => place.category), ['park', 'beach']); assert.equal(fresh.limited, false);
  assert.equal(shared.places.length, 2, 'Legacy filtering cannot poison the shared provider cache');
  assert.deepEqual((await (await invoke({})).json()).places.map(place => place.category), ['park']);
  const count = providerCalls;
  for (const invalid of [null, 1, 4, '2', true, []]) assert.equal((await invoke({placeCategoryVersion: invalid})).status, 400);
  assert.equal(providerCalls, count);
});

test('New mobile discovery explicitly opts into beach and hiking categories', async () => {
  const calls = [], now = new Date().toISOString();
  const found = discovery().normalizeDiscovery({ elements: [row(701, { natural: 'beach' })] }, center, 'nature', now);
  const mobile = client(async (_path, options) => { calls.push(options); return { places: found, center, fetchedAt: now, radius: 3000, limited: false, attribution: '© OpenStreetMap contributors' }; });
  const result = await mobile.discoverJourneyPlaces(center, 'nature');
  assert.equal(calls[0].body.placeCategoryVersion, 3); assert.equal(result.places[0].category, 'beach');
});

test('Journey essentials include genuine banks and transit stops while older client categories remain intact', async () => {
  const model = discovery();
  const elements = [row(801, { amenity: 'bank' }), row(802, { railway: 'subway_entrance' }), row(803, { highway: 'bus_stop' }), row(804, { amenity: 'atm' }), row(805, { railway: 'rail' })];
  const found = model.normalizeDiscovery({ elements }, center, 'essentials', stamp);
  assert.deepEqual([...found.map(place => place.category)], ['bank', 'transit', 'transit', 'atm']);
  assert.deepEqual([...places.normalizePlaces({ elements }, 'needs', stamp).map(place => place.category)], ['atm'], 'Existing nearby clients never receive a category they cannot parse');
  assert.match(model.discoveryQuery(center, 'essentials'), /subway_entrance/);
  assert.match(model.discoveryQuery(center, 'essentials'), /out center tags 250/);
  const shared = { places: found, center, fetchedAt: stamp, radius: 3000, limited: false, attribution: '© OpenStreetMap contributors' };
  const api = load('app/api/travel-assistant/discover/route.ts', { '@/lib/travel-assistant/http': http, '@/lib/travel-assistant/places': places,
    '@/lib/travel-assistant/journey-discovery': { DISCOVERY_GROUPS: ['essentials'], discoverJourneyPlaces: async () => shared } });
  const invoke = async version => (await api.POST(new Request('https://app.test/discover', { method: 'POST', body: JSON.stringify({ ...center, category: 'essentials', ...(version ? { placeCategoryVersion: version } : {}) }) }))).json();
  for (const version of [undefined, 2]) {
    const old = await invoke(version); assert.deepEqual(old.places.map(place => place.category), ['atm']); assert.equal(old.limited, true);
  }
  const current = await invoke(3); assert.equal(current.places.length, 4); assert.equal(current.limited, false);
  assert.equal(shared.places.length, 4, 'Capability filtering must not poison another client’s shared cache');
});
