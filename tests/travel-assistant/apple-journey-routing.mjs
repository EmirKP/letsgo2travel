import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';

const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const second = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = key => key.export({ format: 'pem', type: 'pkcs8' });
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; return { promise: new Promise(yes => { resolve = yes; }), resolve }; };
function load(file, imports = {}, globals = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    Error, Date, URL, URLSearchParams, Buffer, Response, Request, TextDecoder, AbortController, setTimeout, clearTimeout, ...globals,
  })(name => { if (name in imports) return imports[name]; throw Error(`Missing fixture import ${name}`); }, output, output.exports);
  return output.exports;
}
const places = load('lib/travel-assistant/places.ts');
const a = { latitude: 41.900, longitude: 12.490 }, b = { latitude: 41.902, longitude: 12.493 }, c = { latitude: 41.904, longitude: 12.494 };
const meters = (from, to) => places.distanceKm(from, to) * 1000;
function fixture(from = a, to = b) {
  const middle = { latitude: from.latitude, longitude: to.longitude };
  const lengths = [meters(from, middle), meters(middle, to)];
  const steps = [{ stepPathIndex: 0, distanceMeters: 0, durationSeconds: 0 },
    ...lengths.map((distanceMeters, index) => ({ stepPathIndex: index + 1, distanceMeters, durationSeconds: distanceMeters / 1.3 }))];
  return { routes: [{ transportType: 'WALKING', stepIndexes: [0, 1, 2], distanceMeters: lengths[0] + lengths[1], durationSeconds: (lengths[0] + lengths[1]) / 1.3 }],
    steps, stepPaths: [[from], [from, middle], [middle, to]] };
}
const point = text => { const [latitude, longitude] = text.split(',').map(Number); return { latitude, longitude }; };
const tokenResponse = () => Response.json({ accessToken: 'header.payload.signature', expiresInSeconds: 1800 });
function harness({ env = {}, fetch: suppliedFetch, globals = {} } = {}) {
  let now = Date.now();
  const values = { APPLE_MAPS_TEAM_ID: 'TEAMID1234', APPLE_MAPS_KEY_ID: 'KEYID12345', APPLE_MAPS_PRIVATE_KEY: pem(pair.privateKey), ...env };
  const calls = [];
  const Clock = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const context = { Date: Clock, process: { env: values }, fetch: async (input, options) => {
    const url = new URL(input); calls.push({ url, options });
    if (suppliedFetch) return suppliedFetch(url, options);
    return url.pathname === '/v1/token' ? tokenResponse() : Response.json(fixture(point(url.searchParams.get('origin')), point(url.searchParams.get('destination'))));
  }, ...globals };
  const server = load('lib/maps/apple-maps-server.ts', { 'node:crypto': crypto }, context);
  const apple = load('lib/travel-assistant/journey-apple-routing.ts', { '../maps/apple-maps-server': server, './places': places }, context);
  const router = load('lib/travel-assistant/journey-routing.ts', { './places': places, './journey-apple-routing': apple }, context);
  return { server, apple, router, calls, values, advance(seconds) { now += seconds * 1000; }, get now() { return now; } };
}

test('Apple route uses a genuinely signed server-only JWT, one shared access token and complete independent walking legs', async () => {
  const h = harness();
  const [first, duplicate] = await Promise.all([h.router.getJourneyWalkingRoute([a, b, c]), h.router.getJourneyWalkingRoute([a, b, c])]);
  assert.deepEqual(clone(first), clone(duplicate)); assert.equal(h.calls.length, 3);
  const auth = h.calls[0].options.headers.Authorization.slice(7), [header, payload, signature] = auth.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: 'KEYID12345', typ: 'JWT' });
  assert.deepEqual(claims, { iss: 'TEAMID1234', iat: Math.floor(h.now / 1000), exp: Math.floor(h.now / 1000) + 600, scope: 'server_api' });
  assert.equal(crypto.verify('sha256', Buffer.from(`${header}.${payload}`), { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
  for (const call of h.calls) {
    assert.equal(call.url.origin, 'https://maps-api.apple.com'); assert.equal(call.options.redirect, 'error'); assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.method, 'GET'); assert.equal(call.url.searchParams.has('token'), false);
  }
  for (const call of h.calls.slice(1)) {
    assert.equal(call.url.searchParams.get('transportType'), 'Walking'); assert.equal(call.url.searchParams.get('requestsAlternateRoutes'), 'false');
    assert.equal(call.options.headers.Authorization, 'Bearer header.payload.signature');
  }
  assert.equal(first.geometry.type, 'MultiLineString'); assert.equal(first.geometry.coordinates.length, 2);
  assert.equal(first.geometry.coordinates[0].length, 3); assert.equal(first.legs.length, 2);
  assert.equal(first.sourceUrl, 'https://maps.apple.com/'); assert.equal(first.attribution, 'Apple Maps');
  assert.equal(first.distanceMeters, first.legs.reduce((sum, leg) => sum + leg.distanceMeters, 0));
  assert.doesNotMatch(JSON.stringify(first), /accessToken|signature|server_api|BEGIN PRIVATE KEY/);
  await h.router.getJourneyWalkingRoute([a, b, c]); assert.equal(h.calls.length, 3);
  await h.router.getJourneyWalkingRoute([b, c]); assert.equal(h.calls.length, 3);
  await h.router.getJourneyWalkingRoute([b, a]); assert.equal(h.calls.length, 4);
});

test('Walking normalization rejects wrong transport, broken paths, missing metrics and substituted endpoints without inventing bridges', () => {
  const h = harness(), original = fixture();
  assert.equal(h.apple.normalizeAppleWalkingLeg(original, a, b, new Date().toISOString()).points.length, 3);
  for (const mutate of [
    v => { v.routes[0].transportType = 'Automobile'; }, v => { v.steps[1].transportType = 'Cycling'; },
    v => { v.routes.push(clone(v.routes[0])); }, v => { v.routes[0].stepIndexes = [0, 1, 1, 2]; },
    v => { v.steps[1].stepPathIndex = 999; }, v => { v.steps[2].stepPathIndex = 1; },
    v => { v.stepPaths[2][0] = a; }, v => { v.stepPaths[2][1] = c; },
    v => { v.stepPaths[0][0] = { ...a, latitude: '41.9' }; }, v => { delete v.steps[1].durationSeconds; },
    v => { v.routes[0].durationSeconds = 1; }, v => { v.routes[0].distanceMeters *= 2; },
    v => { v.routes[0].distanceMeters = NaN; }, v => { v.stepPaths[1] = []; },
    v => { v.stepPaths[1] = Array(20_001).fill(a); }, v => { v.error = 'provider-private-error'; },
  ]) { const value = clone(original); mutate(value); assert.throws(() => h.apple.normalizeAppleWalkingLeg(value, a, b, new Date().toISOString()), /Apple walking route unavailable/); }
});

test('Independent adjacent legs keep different genuine snapped endpoints as separate lines', async () => {
  const shifted = { latitude: b.latitude + 0.0002, longitude: b.longitude };
  const h = harness({ fetch: async url => {
    if (url.pathname === '/v1/token') return tokenResponse();
    const from = point(url.searchParams.get('origin')), to = point(url.searchParams.get('destination'));
    return Response.json(fixture(from.latitude === b.latitude ? shifted : from, to));
  } });
  const result = await h.router.getJourneyWalkingRoute([a, b, c]);
  assert.equal(result.geometry.coordinates.length, 2);
  assert.notDeepEqual(clone(result.geometry.coordinates[0].at(-1)), clone(result.geometry.coordinates[1][0]));
  assert.deepEqual(clone(result.geometry.coordinates[1][0]), [shifted.longitude, shifted.latitude]);
});

test('Missing or malformed Apple credentials never contact upstream or silently fall through to ORS', async () => {
  for (const env of [{ APPLE_MAPS_PRIVATE_KEY: undefined }, { APPLE_MAPS_PRIVATE_KEY: 'PRIVATE_CANARY' }, { APPLE_MAPS_TEAM_ID: 'wrong' },
    { APPLE_MAPS_KEY_ID: 'wrong' }, { APPLE_MAPS_PRIVATE_KEY: pem(crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey) }]) {
    const h = harness({ env: { ...env, TRAVEL_ORS_API_KEY: 'ORS_CANARY' } });
    await assert.rejects(h.router.getJourneyWalkingRoute([a, b]), error => { assert.doesNotMatch(error.message, /PRIVATE_CANARY|ORS_CANARY|PEM|decode/); return true; });
    assert.equal(h.calls.length, 0);
  }
  const h = harness({ env: { APPLE_MAPS_TEAM_ID: undefined, APPLE_MAPS_KEY_ID: undefined, APPLE_MAPS_PRIVATE_KEY: undefined } });
  assert.equal(h.apple.hasAppleJourneyRouting(), false);
  await assert.rejects(h.router.getJourneyWalkingRoute([a, b]), /not configured/); assert.equal(h.calls.length, 0);
});

test('Token refresh and key rotation replace only server authorization, and old pending responses cannot enter the new cache', async () => {
  const h = harness();
  await h.router.getJourneyWalkingRoute([a, b]); h.advance(900);
  await h.router.getJourneyWalkingRoute([a, b]); assert.equal(h.calls.filter(c => c.url.pathname === '/v1/token').length, 1);
  h.advance(841); await h.router.getJourneyWalkingRoute([b, c]); assert.equal(h.calls.filter(c => c.url.pathname === '/v1/token').length, 2);
  h.values.APPLE_MAPS_PRIVATE_KEY = pem(second.privateKey);
  await h.router.getJourneyWalkingRoute([a, b]); assert.equal(h.calls.filter(c => c.url.pathname === '/v1/token').length, 3);
  const gate = deferred(), rotated = harness({ fetch: url => url.pathname === '/v1/token' ? tokenResponse() : gate.promise });
  const operation = rotated.router.getJourneyWalkingRoute([a, b]); await new Promise(resolve => setImmediate(resolve));
  rotated.values.APPLE_MAPS_PRIVATE_KEY = pem(second.privateKey); gate.resolve(Response.json(fixture()));
  await assert.rejects(operation); assert.equal(rotated.calls.length, 2);
});

test('Apple quota and authentication failures stop requests with no retry, credential leakage or ORS fallback', async () => {
  for (const status of [401, 403, 429]) {
    const h = harness({ env: { TRAVEL_ORS_API_KEY: 'ORS_CANARY' }, fetch: async () => new Response('PRIVATE_UPSTREAM_ERROR', { status, headers: { 'Retry-After': '120' } }) });
    await assert.rejects(h.router.getJourneyWalkingRoute([a, b]), error => { assert.doesNotMatch(error.message, /PRIVATE_UPSTREAM_ERROR|ORS_CANARY/); return true; });
    await assert.rejects(h.router.getJourneyWalkingRoute([a, b])); h.advance(61);
    await assert.rejects(h.router.getJourneyWalkingRoute([a, b])); assert.equal(h.calls.length, 1);
  }
  const h = harness({ fetch: async url => url.pathname === '/v1/token' ? tokenResponse() : new Response('', { status: 429, headers: { 'Retry-After': '120' } }) });
  await assert.rejects(h.router.getJourneyWalkingRoute([a, b])); await assert.rejects(h.router.getJourneyWalkingRoute([b, c]));
  assert.equal(h.calls.length, 2);
});

test('Malformed and oversized token/provider bodies fail closed and never become cached routes', async () => {
  for (const response of [() => Response.json({ accessToken: 'bad\nheader', expiresInSeconds: 1800 }),
    () => Response.json({ accessToken: 'a.b.c', expiresInSeconds: 0 }), () => Response.json({ accessToken: 'a.b.c', expiresInSeconds: 86400 }),
    () => new Response('x'.repeat(16_385), { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('{}', { headers: { 'Content-Type': 'text/html' } })]) {
    const h = harness({ fetch: async () => response() }); await assert.rejects(h.router.getJourneyWalkingRoute([a, b])); assert.equal(h.calls.length, 1);
  }
  for (const response of [() => new Response('x'.repeat(2_000_001), { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '2000001' } }), () => Response.json({ routes: [] })]) {
    const h = harness({ fetch: async url => url.pathname === '/v1/token' ? tokenResponse() : response() });
    await assert.rejects(h.router.getJourneyWalkingRoute([a, b])); assert.equal(h.calls.length, 2);
  }
});

test('A rejected directions token is refreshed only on an explicit attempt after cooldown', async () => {
  for (const status of [401, 403]) {
    let tokens = 0, directions = 0;
    const h = harness({ fetch: async url => {
      if (url.pathname === '/v1/token') return Response.json({ accessToken: `header.payload.token${++tokens}`, expiresInSeconds: 1800 });
      if (++directions === 1) return new Response('', { status });
      return Response.json(fixture(point(url.searchParams.get('origin')), point(url.searchParams.get('destination'))));
    } });
    await assert.rejects(h.router.getJourneyWalkingRoute([a, b]));
    assert.equal(tokens, 1); assert.equal(directions, 1);
    await assert.rejects(h.router.getJourneyWalkingRoute([a, b]));
    assert.equal(tokens, 1); assert.equal(directions, 1);
    h.advance(301); const route = await h.router.getJourneyWalkingRoute([a, b]);
    assert.equal(tokens, 2); assert.equal(directions, 2); assert.equal(route.legs.length, 1);
    assert.equal(h.calls.at(-1).options.headers.Authorization, 'Bearer header.payload.token2');
  }
});

test('A delayed rejection of an older access token cannot evict the newer rotated token', async () => {
  const gate = deferred(); let tokens = 0, oldStarted = false;
  const h = harness({ fetch: async (url, options) => {
    if (url.pathname === '/v1/token') return Response.json({ accessToken: `header.payload.token${++tokens}`, expiresInSeconds: 1800 });
    if (options.headers.Authorization === 'Bearer header.payload.token1') { oldStarted = true; return gate.promise; }
    return Response.json(fixture(point(url.searchParams.get('origin')), point(url.searchParams.get('destination'))));
  } });
  const obsolete = h.router.getJourneyWalkingRoute([a, b]);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(oldStarted, true);
  h.values.APPLE_MAPS_PRIVATE_KEY = pem(second.privateKey);
  await h.router.getJourneyWalkingRoute([b, c]); assert.equal(tokens, 2);
  gate.resolve(new Response('', { status: 401 })); await assert.rejects(obsolete);
  h.advance(301); await h.router.getJourneyWalkingRoute([c, a]);
  assert.equal(tokens, 2); assert.equal(h.calls.at(-1).options.headers.Authorization, 'Bearer header.payload.token2');
});

test('Hung transports retain both global slots after deadlines, while the caller settles and later abort results cannot cache', async () => {
  const timers = new Map(), waits = [], h = harness({
    globals: { setTimeout: (fn, ms) => { const id = Symbol(); timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) },
    fetch: url => { if (url.pathname === '/v1/token') return tokenResponse(); const wait = deferred(); waits.push(wait); return wait.promise; },
  });
  const operation = h.router.getJourneyWalkingRoute([a, b, c]);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(waits.length, 2);
  for (const timer of [...timers.values()].filter(t => t.ms === 8000)) timer.fn();
  await assert.rejects(operation); h.advance(6);
  const waiting = h.router.getJourneyWalkingRoute([c, a]);
  const rejected = assert.rejects(waiting);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.calls.length, 3);
  h.advance(16);
  for (const timer of [...timers.values()].filter(t => t.ms === 15_000)) timer.fn();
  await rejected; assert.equal(h.calls.length, 3);
  waits[0].resolve(Response.json(fixture(a, b))); waits[1].resolve(Response.json(fixture(b, c)));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.calls.length, 3);
});

test('Two independent itinerary days share two actual Apple connections and queue their extra legs in FIFO order', async () => {
  const waits = []; let active = 0, peak = 0;
  const h = harness({ fetch: async url => {
    if (url.pathname === '/v1/token') return tokenResponse();
    active++; peak = Math.max(peak, active);
    const gate = deferred(); waits.push({ gate, url });
    await gate.promise; active--;
    return Response.json(fixture(point(url.searchParams.get('origin')), point(url.searchParams.get('destination'))));
  } });
  const d = { latitude: 41.91, longitude: 12.5 }, e = { latitude: 41.912, longitude: 12.503 }, f = { latitude: 41.914, longitude: 12.504 };
  const days = Promise.all([h.router.getJourneyWalkingRoute([a, b, c]), h.router.getJourneyWalkingRoute([d, e, f])]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(waits.length, 2, 'Extra day legs wait instead of failing or opening extra connections');
  waits[0].gate.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(waits.length, 3);
  assert.deepEqual(point(waits[2].url.searchParams.get('origin')), d);
  waits[1].gate.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(waits.length, 4);
  assert.deepEqual(point(waits[3].url.searchParams.get('origin')), e);
  waits[2].gate.resolve(); waits[3].gate.resolve();
  const results = await days;
  assert.equal(peak, 2);
  assert.deepEqual(results.map(result => result.legs.length), [2, 2]);
  assert.equal(h.calls.length, 5, 'One shared token exchange plus four distinct legs');
});

test('The Apple transport queue is bounded and queued cancellation frees capacity without an upstream request', async () => {
  const waits = []; let block = false;
  const h = harness({ fetch: async url => {
    if (url.pathname === '/v1/token') return tokenResponse();
    if (block) { const gate = deferred(); waits.push(gate); await gate.promise; }
    return Response.json(fixture());
  } });
  const params = new URLSearchParams({ origin: '41.9,12.49', destination: '41.902,12.493', transportType: 'Walking' });
  await h.server.appleMapsDirections(params, h.now + 15000); block = true;
  const first = h.server.appleMapsDirections(params, h.now + 15000), second = h.server.appleMapsDirections(params, h.now + 15000);
  await new Promise(resolve => setImmediate(resolve));
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  const queued = controllers.map(controller => h.server.appleMapsDirections(params, h.now + 15000, controller.signal));
  const cancelled = queued.map(promise => assert.rejects(promise));
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(h.server.appleMapsDirections(params, h.now + 15000));
  assert.equal(waits.length, 2);
  controllers[0].abort(); await cancelled[0];
  const replacement = new AbortController();
  const replacementRejected = assert.rejects(h.server.appleMapsDirections(params, h.now + 15000, replacement.signal));
  await new Promise(resolve => setImmediate(resolve));
  controllers.slice(1).forEach(controller => controller.abort()); replacement.abort();
  await Promise.all([...cancelled, replacementRejected]);
  waits.forEach(gate => gate.resolve()); await Promise.all([first, second]);
  assert.equal(waits.length, 2, 'Neither cancelled nor queue-overflow work may reach the provider');
  block = false;
  await h.server.appleMapsDirections(params, h.now + 15000);
  assert.equal(h.calls.length, 5, 'Cancellation and overflow must not set provider cooldown');
});

test('Expired queue entries are removed before a slot opens and never consume the provider budget', async () => {
  const timers = new Map(), waits = []; let block = false;
  const h = harness({
    globals: { setTimeout: (fn, ms) => { const id = Symbol(); timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) },
    fetch: async url => {
      if (url.pathname === '/v1/token') return tokenResponse();
      if (block) { const gate = deferred(); waits.push(gate); await gate.promise; }
      return Response.json(fixture());
    },
  });
  const params = new URLSearchParams({ origin: '41.9,12.49', destination: '41.902,12.493', transportType: 'Walking' });
  await h.server.appleMapsDirections(params, h.now + 15000); block = true;
  const active = [h.server.appleMapsDirections(params, h.now + 15000), h.server.appleMapsDirections(params, h.now + 15000)];
  await new Promise(resolve => setImmediate(resolve));
  const expired = assert.rejects(h.server.appleMapsDirections(params, h.now + 1000));
  await new Promise(resolve => setImmediate(resolve));
  h.advance(2); [...timers.values()].find(timer => timer.ms === 1000).fn(); await expired;
  waits.forEach(gate => gate.resolve()); await Promise.all(active);
  assert.equal(waits.length, 2);
  block = false; await h.server.appleMapsDirections(params, h.now + 15000);
  assert.equal(h.calls.length, 5);
  assert.equal(timers.size, 0);
});

test('A failed active transport rejects its queue before any waiting call can be sent', async () => {
  const waits = []; let block = false;
  const h = harness({ fetch: async url => {
    if (url.pathname === '/v1/token') return tokenResponse();
    if (!block) return Response.json(fixture());
    const gate = deferred(); waits.push(gate); return gate.promise;
  } });
  const params = new URLSearchParams({ origin: '41.9,12.49', destination: '41.902,12.493', transportType: 'Walking' });
  await h.server.appleMapsDirections(params, h.now + 15000); block = true;
  const first = h.server.appleMapsDirections(params, h.now + 15000), second = h.server.appleMapsDirections(params, h.now + 15000);
  const failed = assert.rejects(first);
  await new Promise(resolve => setImmediate(resolve));
  const queued = assert.rejects(h.server.appleMapsDirections(params, h.now + 15000));
  await new Promise(resolve => setImmediate(resolve));
  waits[0].resolve(new Response('malformed', { headers: { 'content-type': 'application/json' } }));
  await Promise.all([failed, queued]);
  waits[1].resolve(Response.json(fixture())); await second;
  assert.equal(waits.length, 2);
});

test('The total day deadline fences later legs even when a shared request is still pending', async () => {
  const timers = new Map(), gate = deferred(); let routeCalls = 0;
  const h = harness({ globals: { setTimeout: (fn, ms) => { const id = Symbol(); timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) },
    fetch: url => { if (url.pathname === '/v1/token') return tokenResponse(); routeCalls++; return gate.promise; } });
  const result = h.router.getJourneyWalkingRoute([a, b, c, { latitude: 41.906, longitude: 12.497 }]);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(routeCalls, 2);
  h.advance(16); [...timers.values()].find(t => t.ms === 15_000).fn(); await assert.rejects(result);
  gate.resolve(Response.json(fixture(a, b))); await new Promise(resolve => setImmediate(resolve));
  assert.equal(routeCalls, 2);
});

test('Every Apple service call consumes the shared per-minute budget, including token exchange', async () => {
  const h = harness();
  const params = new URLSearchParams({ origin: '41.9,12.49', destination: '41.902,12.493', transportType: 'Walking' });
  for (let i = 0; i < 59; i++) await h.server.appleMapsDirections(params, h.now + 15000);
  assert.equal(h.calls.length, 60);
  await assert.rejects(h.server.appleMapsDirections(params, h.now + 15000)); assert.equal(h.calls.length, 60);
  h.advance(60); await h.server.appleMapsDirections(params, h.now + 15000); assert.equal(h.calls.length, 61);
});

test('Public route response has generic errors and export includes all Apple provider dependencies', async () => {
  const h = harness({ fetch: async () => new Response('PRIVATE_APPLE_ERROR', { status: 401 }) });
  const route = load('app/api/travel-assistant/journey-route/route.ts', {
    '@/lib/travel-assistant/journey-routing': h.router, '@/lib/travel-assistant/http': { boundedJson: request => request.json() },
  });
  const response = await route.POST(new Request('https://app.example/api/travel-assistant/journey-route', { method: 'POST', body: JSON.stringify({ stops: [a, b] }) }));
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'routing_unavailable');
  const source = readFileSync('scripts/prepare-travel-assistant-staging.mjs', 'utf8');
  assert.ok(source.includes("'lib/maps/apple-maps-server.ts'")); assert.ok(source.includes("'lib/travel-assistant/journey-apple-routing.ts'"));
});
