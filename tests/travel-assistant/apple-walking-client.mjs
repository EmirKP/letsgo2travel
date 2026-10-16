import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}) {
  const fixtureModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Error, Date, URL })(name => {
    if (name in imports) return imports[name];
    throw Error(`Unexpected import: ${name}`);
  }, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
const places = load('lib/travel-assistant/places.ts');
const client = requestJson => load('mobile/src/lib/mapJourneyClient.ts', {
  './api': { requestJson }, './travelAreas': { TRAVEL_CENTRES: [] },
  './searchText': { normalizeSearchText: text => text.toLowerCase() }, '../../../lib/travel-assistant/places': places,
});
const clone = value => JSON.parse(JSON.stringify(value));
const stops = [{ latitude: 41.900, longitude: 12.490 }, { latitude: 41.920, longitude: 12.510 }, { latitude: 41.930, longitude: 12.520 }];
const pathDistance = path => path.slice(1).reduce((sum, point, index) => sum + places.distanceKm(
  { latitude: path[index][1], longitude: path[index][0] }, { latitude: point[1], longitude: point[0] }) * 1000, 0);
function appleFixture() {
  const paths = [
    [[12.490, 41.900], [12.501, 41.908], [12.510, 41.9196]],
    [[12.510, 41.9204], [12.515, 41.926], [12.520, 41.930]],
  ];
  const legs = paths.map(path => ({ distanceMeters: pathDistance(path), durationSeconds: pathDistance(path) / 1.3 }));
  return { profile: 'foot-walking', geometry: { type: 'MultiLineString', coordinates: paths }, legs,
    distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0), durationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    fetchedAt: new Date().toISOString(), sourceUrl: 'https://maps.apple.com/', attribution: 'Apple Maps' };
}

test('Apple walking paths retain adjacent-leg snapping gaps, precise metrics and verified source without mutating the response', () => {
  const raw = appleFixture(), before = clone(raw), result = client().validateWalkingResponse(raw, stops);
  assert.deepEqual(clone(result), raw); assert.deepEqual(raw, before);
  assert.equal(result.geometry.type, 'MultiLineString'); assert.equal(result.geometry.coordinates.length, 2);
  assert.notDeepEqual(clone(result.geometry.coordinates[0].at(-1)), clone(result.geometry.coordinates[1][0]));
  result.geometry.coordinates[0][0][0] = 0;
  assert.deepEqual(raw, before, 'validated geometry must not share mutable vertices with the response');
});

test('Apple successful responses reject missing, reversed, reordered, wrong-area and malformed leg paths', () => {
  const model = client();
  for (const change of [r => r.geometry.coordinates.pop(), r => r.geometry.coordinates.reverse(),
    r => r.geometry.coordinates[0].reverse(), r => { r.geometry.coordinates[0][0] = [0, 0]; },
    r => { r.geometry.coordinates[1][0] = [12.5, 41.9]; }, r => { r.geometry.coordinates[0] = []; },
    r => { r.geometry.coordinates[0][1] = ['12.501', 41.908]; }, r => { r.geometry.coordinates[0][1] = [NaN, 41.908]; },
    r => { r.geometry.coordinates[0][1] = [12.501, 41.908, 0]; }, r => { r.geometry.coordinates = null; },
    r => { r.legs.pop(); }, r => { r.fetchedAt = new Date(Date.now() - 17 * 60_000).toISOString(); }]) {
    const bad = appleFixture(); change(bad); assert.throws(() => model.validateWalkingResponse(bad, stops));
  }
  assert.throws(() => model.validateWalkingResponse(appleFixture(), [...stops].reverse()));
});

test('Every Apple leg must match its own geometry and walking metrics, even if forged totals still add up', () => {
  const model = client();
  for (const change of [r => { r.durationSeconds += 100; }, r => { r.distanceMeters += 100; },
    r => { r.legs[0].durationSeconds = 1; r.durationSeconds = r.legs.reduce((sum, leg) => sum + leg.durationSeconds, 0); },
    r => { r.legs[0].distanceMeters -= 500; r.legs[1].distanceMeters += 500; },
    r => { r.geometry.coordinates[1].splice(1, 0, [13, 42]); }]) {
    const bad = appleFixture(); change(bad); assert.throws(() => model.validateWalkingResponse(bad, stops));
  }
});

test('Route source, attribution and geometry type form exact Apple or ORS contracts', () => {
  const model = client();
  for (const change of [r => { r.sourceUrl = 'https://maps.apple.com.evil.test/'; }, r => { r.sourceUrl = 'https://maps.apple.com/?route=1'; },
    r => { r.attribution = 'openrouteservice.org | © OpenStreetMap contributors'; }, r => { r.attribution = 'Apple'; },
    r => { r.geometry = { type: 'LineString', coordinates: r.geometry.coordinates.flat() }; },
    r => { r.profile = 'automobile'; }]) {
    const bad = appleFixture(); change(bad); assert.throws(() => model.validateWalkingResponse(bad, stops));
  }
  const ors = appleFixture();
  const path = [[12.490, 41.900], [12.501, 41.908], [12.510, 41.920], [12.515, 41.926], [12.520, 41.930]];
  ors.geometry = { type: 'LineString', coordinates: path };
  ors.legs = [pathDistance(path.slice(0, 3)), pathDistance(path.slice(2))].map(distanceMeters => ({ distanceMeters, durationSeconds: distanceMeters / 1.3 }));
  ors.distanceMeters = ors.legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  ors.durationSeconds = ors.legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
  ors.sourceUrl = 'https://openrouteservice.org/'; ors.attribution = 'openrouteservice.org | © OpenStreetMap contributors';
  assert.deepEqual(clone(model.validateWalkingResponse(ors, stops)), ors);
  assert.throws(() => model.validateWalkingResponse({ ...ors, geometry: appleFixture().geometry }, stops));
});

test('The twenty-thousand vertex bound applies to all Apple legs together, preserving the exact limit', () => {
  const raw = appleFixture(), model = client();
  raw.geometry.coordinates = raw.geometry.coordinates.map(path => [path[0], ...Array.from({ length: 9998 }, () => path[1]), path[2]]);
  assert.equal(model.validateWalkingResponse(raw, stops).geometry.coordinates.reduce((sum, path) => sum + path.length, 0), 20_000);
  raw.geometry.coordinates[1].splice(1, 0, raw.geometry.coordinates[1][1]);
  assert.throws(() => model.validateWalkingResponse(raw, stops));
});

test('Walking client forwards cancellation and the existing eighteen-second budget, then validates the genuine Apple response', async () => {
  const calls = [], raw = appleFixture(), controller = new AbortController();
  const model = client(async (path, options) => { calls.push({ path, options }); return raw; });
  const result = await model.loadWalkingRoute(stops, controller.signal);
  assert.equal(result.geometry.type, 'MultiLineString'); assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/travel-assistant/journey-route'); assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.timeoutMs, 18_000); assert.deepEqual(clone(calls[0].options.body), { stops });
  await assert.rejects(model.loadWalkingRoute([stops[0]], controller.signal)); assert.equal(calls.length, 1);
});
