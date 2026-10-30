import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, moduleTypes: { '**': 'cjs' }, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const model = require('../lib/maps/map-place-search.ts');
const params = value => model.parseMapSearchInput(new URLSearchParams(value));
const row = (overrides = {}) => ({ osm_type: 'relation', osm_id: 1741311, lat: '44.8178131', lon: '20.4568974', name: 'Belgrad', display_name: 'Belgrad, Sırbistan', category: 'boundary', type: 'administrative', addresstype: 'city', ...overrides });
const response = value => Response.json(value);

function harness(fetcher) {
  let time = 100_000;
  const starts = [], calls = [];
  const search = model.createMapPlaceSearch({ now: () => time, sleep: async delay => { time += delay; }, fetch: async (url, options) => {
    starts.push(time); calls.push({ url: new URL(url), options });
    return fetcher ? fetcher(url, options) : response([row()]);
  } });
  return { search, starts, calls, advance: value => { time += value; } };
}

test('search validates complete parameters and coarsens location before making a cache key or request', () => {
  assert.deepEqual(params({ q: '  Belgrad  ', lat: '41.0082376', lon: '28.9783589', lang: 'sq' }), { query: 'Belgrad', locale: 'sq', latitude: 41, longitude: 29 });
  assert.deepEqual(params({ q: 'New   York' }), { query: 'New York', locale: 'tr' });
  for (const input of ['q=a', 'q=' + 'x'.repeat(81), 'q=Belgrad&lat=1', 'q=Belgrad&lon=2', 'q=Belgrad&lat=91&lon=1', 'q=Belgrad&lat=1&lon=181', 'q=Belgrad&lat=Infinity&lon=1', 'q=Belgrad&lat=0x1&lon=1', 'q=Belgrad&lat=&lon=1', 'q=Belgrad&lang=xx', 'q=Paris&q=Berlin', 'q=a%00b']) assert.equal(params(input), null, input);
});

test('nearby preference allows global cities; identification and locale are sent, exact GPS is not', async () => {
  const h = harness();
  const result = await h.search({ query: 'Belgrad', locale: 'tr', latitude: 41.0082376, longitude: 28.9783589 });
  assert.equal(result[0].name, 'Belgrad');
  const { url, options } = h.calls[0];
  assert.equal(url.hostname, 'nominatim.openstreetmap.org');
  assert.equal(url.searchParams.get('q'), 'Belgrad');
  assert.equal(url.searchParams.get('viewbox'), '28.5,41.5,29.5,40.5');
  assert.equal(url.searchParams.get('bounded'), '0');
  assert.equal(url.searchParams.get('limit'), '6');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
  assert.equal(url.searchParams.get('addressdetails'), '1');
  assert.equal(url.searchParams.get('accept-language'), 'tr');
  assert.match(options.headers['User-Agent'], /LetsGo2Travel.*https:\/\/www.letsgo2travel.com.tr/);
  assert.equal(options.headers['Accept-Language'], 'tr');
  assert.equal(options.redirect, 'error');
  assert.equal(url.href.includes('0082376'), false);
  assert.equal(result[0].sourceUrl, 'https://www.openstreetmap.org/relation/1741311');
  assert.equal(result[0].kind, 'area');
  assert.equal(result[0].category, undefined);
});

test('provider results preserve real OSM identity, reject malformed places, map POIs and dedupe', () => {
  const results = model.normalizeMapSearchResults([
    row(), row(), row({ osm_id: 2, osm_type: 'node', name: 'National Museum', category: 'tourism', type: 'museum', addresstype: 'tourism' }),
    row({ osm_id: 3, osm_type: 'way', name: 'Market', category: 'shop', type: 'supermarket', addresstype: 'shop' }),
    row({ osm_id: 4, osm_type: 'way', name: 'Coffee', category: 'amenity', type: 'cafe', addresstype: 'amenity' }),
    row({ osm_id: 5, osm_type: 'node', name: 'Interesting place', category: 'tourism', type: 'unknown', addresstype: 'tourism' }),
    row({ osm_type: 'apple', osm_id: 6 }), row({ osm_id: -3 }), row({ osm_id: '1e4' }), row({ osm_id: Number.MAX_SAFE_INTEGER + 1 }), row({ lat: '' }), row({ lat: 91 }), row({ lat: null }),
  ]);
  assert.equal(results.length, 5);
  assert.deepEqual(results.map(result => result.category), [undefined, 'museum', 'market', 'cafe', 'attraction']);
  assert.deepEqual(results.map(result => result.osmId), ['relation/1741311', 'node/2', 'way/3', 'way/4', 'node/5']);
  assert.ok(results.every(result => result.sourceUrl === `https://www.openstreetmap.org/${result.osmId}`));
  assert.equal(model.normalizeMapSearchResults([row({ name: '<b>Belgrad</b>\u0000' })])[0].name, 'Belgrad');
  assert.throws(() => model.normalizeMapSearchResults({ data: [] }), /invalid-provider-response/);
});

test('same manual request dedupes in flight and caches for 24h without sharing mutable result objects', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const h = harness(async () => { await gate; return response([row()]); });
  const input = { query: 'Belgrad', locale: 'en', latitude: 41.001, longitude: 29.001 };
  const first = h.search(input), second = h.search({ ...input, latitude: 41.002 });
  await Promise.resolve();
  assert.equal(h.calls.length, 1);
  release();
  const [a, b] = await Promise.all([first, second]);
  a[0].name = 'mutated';
  assert.equal(b[0].name, 'Belgrad');
  const cached = await h.search(input);
  assert.equal(cached[0].name, 'Belgrad');
  assert.equal(h.calls.length, 1);
  h.advance(24 * 60 * 60 * 1000 - 1);
  await h.search(input);
  assert.equal(h.calls.length, 1);
  h.advance(2);
  await h.search(input);
  assert.equal(h.calls.length, 2);
});

test('queue serializes distinct searches at no more than one start each second and rejects overflow', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let active = 0, maximum = 0;
  const h = harness(async () => { active++; maximum = Math.max(maximum, active); await gate; active--; return response([row()]); });
  const requests = ['Paris', 'Rome', 'Belgrad', 'Tokyo'].map(query => h.search({ query, locale: 'tr' }));
  await assert.rejects(h.search({ query: 'London', locale: 'tr' }), /busy/);
  release();
  await Promise.all(requests);
  assert.equal(maximum, 1);
  assert.deepEqual(h.starts, [100_000, 101_000, 102_000, 103_000]);
});

test('provider cooldown avoids repeated blocked requests; failures and oversized streamed responses are not cached', async () => {
  let status = 429;
  const h = harness(() => status === 429 ? new Response('blocked', { status, headers: { 'retry-after': '120' } }) : response([row()]));
  const input = { query: 'Belgrad', locale: 'tr' };
  await assert.rejects(h.search(input), error => error.code === 'busy' && error.retryAfter === 120);
  await assert.rejects(h.search(input), /busy/);
  assert.equal(h.calls.length, 1);
  status = 200; h.advance(120_001);
  assert.equal((await h.search(input)).length, 1);
  let calls = 0;
  const over = harness(() => { calls++; return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(512_001))); controller.close(); } })); });
  await assert.rejects(over.search(input), /invalid-provider-response/);
  await assert.rejects(over.search(input), /invalid-provider-response/);
  assert.equal(calls, 2);
  const broken = harness(() => response({ error: 'upstream failure' }));
  await assert.rejects(broken.search(input), /invalid-provider-response/);
});

test('slow provider is aborted and search can recover on the next manual request', async () => {
  let calls = 0;
  const search = model.createMapPlaceSearch({ timeoutMs: 15, fetch: async (url, options) => {
    calls++;
    if (calls === 1) return new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); });
    return response([row()]);
  } });
  await assert.rejects(search({ query: 'Belgrad', locale: 'en' }), error => error.code === 'search-timeout');
  assert.equal((await search({ query: 'Belgrad', locale: 'en' }))[0].name, 'Belgrad');
});

test('timeout also cancels a stalled body after response headers arrive', async () => {
  let cancelled = false;
  const search = model.createMapPlaceSearch({ timeoutMs: 15, fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('[')); }, cancel() { cancelled = true; },
  })) });
  await assert.rejects(search({ query: 'Belgrad', locale: 'en' }), error => error.code === 'search-timeout');
  assert.equal(cancelled, true);
});

test('provider can switch without mobile update; public production requires one globally limited gateway', () => {
  assert.equal(model.mapSearchProviderUrl({ query: 'Paris', locale: 'en' }, 'https://geocoder.example.test/search').hostname, 'geocoder.example.test');
  for (const endpoint of ['http://example.test/search', 'https://user:password@example.test/search', 'https://example.test/search?q=hidden', 'https://example.test/search#hidden']) assert.throws(() => model.mapSearchProviderUrl({ query: 'Paris', locale: 'en' }, endpoint), /search-not-configured/);
  const previous = { node: process.env.NODE_ENV, gateway: process.env.MAP_SEARCH_SINGLE_GATEWAY, provider: process.env.MAP_SEARCH_PROVIDER_URL };
  try {
    process.env.NODE_ENV = 'production'; delete process.env.MAP_SEARCH_SINGLE_GATEWAY; delete process.env.MAP_SEARCH_PROVIDER_URL;
    assert.throws(() => model.getMapPlaceSearch({ query: 'Paris', locale: 'en' }), /search-not-configured/);
  } finally {
    for (const [key, value] of [['NODE_ENV', previous.node], ['MAP_SEARCH_SINGLE_GATEWAY', previous.gateway], ['MAP_SEARCH_PROVIDER_URL', previous.provider]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('HTTP route rejects invalid input before search and returns only bounded contract plus private no-store headers', async () => {
  const calls = [];
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../app/api/maps/search/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, Response, require: () => ({ ...model, getMapPlaceSearch: async input => { calls.push(input); return model.normalizeMapSearchResults([row()]); } }) });
  const invalid = await exports.GET(new Request('https://app.test/api/maps/search?q=a&lat=20'));
  assert.equal(invalid.status, 400); assert.equal(calls.length, 0);
  const ok = await exports.GET(new Request('https://app.test/api/maps/search?q=Belgrad&lang=en&lat=41.0082376&lon=28.9783589'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(calls[0], { query: 'Belgrad', locale: 'en', latitude: 41, longitude: 29 });
  assert.equal((await ok.json()).data[0].osmId, 'relation/1741311');
  assert.equal(exports.OPTIONS().status, 204);
});
