import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { VectorTile } from '../mobile/node_modules/@mapbox/vector-tile/index.js';
import { PbfReader, PbfWriter } from '../mobile/node_modules/pbf/index.js';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, moduleTypes: { '**': 'cjs' }, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const policy = require('../lib/maps/open-map-resources.ts');
const source = readFileSync(new URL('../mobile/src/lib/openMapOffline.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const center = { latitude: 41.0082, longitude: 28.9784 };
const template = 'https://tiles.openfreemap.org/planet/20261027/{z}/{x}/{y}.pbf';
const style = () => ({ version: 8, sources: { streets: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' }, backdrop: { type: 'raster', tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'] } },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  layers: [{ id: 'backdrop', type: 'raster', source: 'backdrop' }, { id: 'names', type: 'symbol', source: 'streets', 'source-layer': 'place', layout: { 'text-field': '{name}', 'text-font': ['Noto Sans Regular', 'Noto Sans Bold'] } }] });

/** Real MVT protobuf wire data; the production VectorTile parser reads these properties. */
function vectorTile(padding = 0, properties = { name: 'İstanbul 東京' }, layerName = 'place', featureId = 1, position = [0, 0]) {
  const writer = new PbfWriter();
  writer.writeMessage(3, (_, layer) => {
    layer.writeVarintField(15, 2); layer.writeStringField(1, layerName); layer.writeVarintField(5, 4096);
    const keys = Object.keys(properties);
    for (const key of keys) { layer.writeStringField(3, key); layer.writeMessage(4, (_, value) => value.writeStringField(1, String(properties[key])), null); }
    layer.writeMessage(2, (_, feature) => { feature.writeVarintField(1, featureId); feature.writePackedVarint(2, keys.flatMap((_, index) => [index, index])); feature.writeVarintField(3, 1); feature.writePackedVarint(4, [9, position[0] * 2, position[1] * 2]); }, null);
  }, null);
  if (padding) writer.writeBytesField(100, new Uint8Array(padding));
  return writer.finish();
}
const tile = vectorTile();
assert.equal(new VectorTile(new PbfReader(tile)).layers.place.feature(0).properties.name, 'İstanbul 東京');
const place = overrides => ({ id: 'node/1', name: 'A real OSM place', category: 'museum', ...center, description: null, hours: null, free: null, accessible: null, website: null, representedCountry: null, sourceUrl: 'https://www.openstreetmap.org/node/1', fetchedAt: new Date().toISOString(), ...overrides });

/** An asynchronous, atomic IDB contract fake: transactions stage writes and clone buffers. */
function indexedDBHarness(initial = new Map()) {
  const state = { records: new Map(initial), failWrite: false, beforePut: null, beforeCommit: null, onOpen: null, commits: 0 };
  const database = { createObjectStore() {}, transaction(_store, mode = 'readonly') {
    const staged = new Map(state.records); let pending = 0, aborted = false, scheduled = false;
    const tx = { oncomplete: null, onerror: null, onabort: null, abort() { if (aborted) return; aborted = true; setImmediate(() => tx.onabort?.()); }, objectStore() { return {
      getAll: () => request(() => [...staged.values()]), getAllKeys: () => request(() => [...staged.keys()]), get: key => request(() => staged.get(key)),
      put: value => request(() => { state.beforePut?.(tx); if (state.failWrite) throw new Error('quota'); staged.set(value.id, structuredClone(value)); return value.id; }),
      delete: key => request(() => staged.delete(key)),
    }; } };
    function finish() {
      if (pending || aborted || scheduled) return;
      scheduled = true; setImmediate(() => { scheduled = false; if (pending || aborted) return; state.beforeCommit?.(tx, mode); if (aborted) return;
        if (mode === 'readwrite') { state.records = staged; state.commits++; } tx.oncomplete?.();
      });
    }
    function request(run) {
      const req = { result: undefined, onsuccess: null, onerror: null }; pending++;
      setImmediate(() => { if (aborted) return; try { req.result = structuredClone(run()); if (!aborted) req.onsuccess?.(); }
        catch { req.onerror?.(); tx.onerror?.(); tx.abort(); } pending--; finish(); });
      return req;
    }
    return tx;
  } };
  return { state, indexedDB: { open() { const req = { result: database, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
    setImmediate(() => { state.onOpen?.(); req.onupgradeneeded?.(); req.onsuccess?.(); }); return req; } } };
}

function harness(options = {}) {
  const db = indexedDBHarness(options.records), calls = [], window = new EventTarget(), exports = {};
  const json = value => Response.json(value);
  const fetch = async (url, request) => {
    request?.signal?.throwIfAborted(); const target = new URL(url).searchParams.get('url'); calls.push(target);
    if (options.respond) { const custom = await options.respond(target, request); if (custom) return custom; }
    if (target === policy.OPEN_MAP_STYLE) return json(options.style || style());
    if (target === 'https://tiles.openfreemap.org/planet') return json({ tiles: [template, 'https://untrusted.example/mirror/{z}/{x}/{y}.pbf'], maxzoom: 14, minzoom: 0 });
    if (target.endsWith('.pbf')) return new Response(target.includes('/fonts/') ? new Uint8Array([1, 2, 3]) : options.tile || tile);
    return target.endsWith('.json') ? json({}) : new Response(new Uint8Array([137, 80, 78, 71]));
  };
  vm.runInNewContext(compiled, { exports, require: id => {
    if (id === '@mapbox/vector-tile') return { VectorTile };
    if (id === 'pbf') return { PbfReader };
    if (id.includes('open-map-resources')) return policy;
    if (id === './config') return { config: { apiBaseUrl: 'https://app.test' } };
    if (id.includes('open-map-pois')) return require('../lib/maps/open-map-pois.ts');
    throw new Error(`Unexpected import ${id}`);
  }, window, indexedDB: db.indexedDB, fetch, ArrayBuffer, Uint8Array, TextDecoder, AbortController, DOMException, URL, Event, structuredClone, console });
  const download = (overrides = {}) => exports.downloadOpenMapRegion({ center, name: 'İstanbul', radiusKm: 1, places: [place()], signal: new AbortController().signal, onProgress() {}, ...overrides });
  return { model: exports, state: db.state, indexedDB: db.indexedDB, calls, download, window };
}

test('A transient synchronous IndexedDB open failure can be retried without reloading or touching saved regions',async()=>{
  const h=harness(),open=h.indexedDB.open;let attempts=0;
  h.indexedDB.open=()=>{attempts++;if(attempts===1)throw new DOMException('Temporary unavailable storage','SecurityError');return open();};
  await assert.rejects(h.model.listOpenMapPacks());
  assert.equal((await h.model.listOpenMapPacks()).length,0);assert.equal(attempts,2);
  assert.equal((await h.model.listOpenMapPacks()).length,0);assert.equal(attempts,2,'A recovered connection remains reusable');
  assert.equal(h.state.commits,0);assert.equal(h.state.records.size,0);assert.equal(h.calls.length,0);
});

test('strict resource allowlist permits canonical fonts and legitimate bounded map assets only', () => {
  assert.equal(policy.allowedOpenMapUrl('https://tiles.openfreemap.org/fonts/Noto Sans Regular/0-255.pbf'), 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf');
  for (const url of ['https://evil.example/planet', 'http://tiles.openfreemap.org/planet', 'https://tiles.openfreemap.org.evil.test/planet', 'https://user:pass@tiles.openfreemap.org/planet', 'https://tiles.openfreemap.org/planet?target=evil', 'https://tiles.openfreemap.org/planet#extra', 'https://tiles.openfreemap.org/styles/../planet', 'https://tiles.openfreemap.org/%2e%2e/planet', 'https://tiles.openfreemap.org/planet/a/14/16384/1.pbf', 'https://tiles.openfreemap.org/planet/a/17/1/1.pbf', 'https://tiles.openfreemap.org/fonts/Noto Sans Regular/1-256.pbf', 'https://tiles.openfreemap.org/fonts/Noto Sans Regular/65536-65791.pbf', 'https://tiles.openfreemap.org/admin', 'https://tiles.openfreemap.org/planet\n']) assert.equal(policy.allowedOpenMapUrl(url), null, url);
  assert.equal(policy.allowedOpenMapTemplate(template, 'tile'), template);
  assert.equal(policy.allowedOpenMapTemplate('https://evil.test/{z}/{x}/{y}.pbf', 'tile'), null);
  assert.equal(policy.allowedOpenMapTemplate(template + '?q=extra', 'tile'), null);
  const tiles = policy.regionTiles(policy.regionBounds(center.latitude, center.longitude, 1), template);
  assert.ok(tiles.length > 0 && tiles.length < 3000);
  assert.ok(tiles.every(url => policy.allowedOpenMapUrl(url)));
  assert.throws(() => policy.regionTiles({ west: -179, east: 179, south: -80, north: 80 }, template), /area_too_large/);
  assert.throws(() => policy.regionTiles({ west: 4, east: 3, south: 1, north: 2 }, template), /invalid_area/);
  assert.throws(() => policy.regionBounds(90, 0, 1), /invalid_area/);
  assert.throws(() => policy.regionBounds(41, 29, 50), /invalid_area/);
});

test('actual download persists a complete atomic pack, reopens cold, resolves encoded glyph stacks offline and never fetches outside it', async () => {
  const h = harness(); let eventCount = 0; h.window.addEventListener('l2t-open-map-packs', () => eventCount++);
  const completed = await h.download({ places: [place(), place({ id: 'apple/2', sourceUrl: 'https://maps.apple.com/place/2' }), place({ id: 'node/3', sourceUrl: 'https://www.openstreetmap.org/node/3', latitude: 50 })] });
  assert.equal(h.state.commits, 1); assert.equal(eventCount, 1);
  assert.equal(completed.bytes, [...h.state.records.values()][0].resources.reduce((sum, resource) => sum + resource.data.byteLength, 0));
  assert.ok(completed.bytes < 50_000_000 && completed.resourceCount < 3000);
  assert.ok(h.calls.some(url => url.includes('/fonts/Noto%20Sans%20Regular%2CNoto%20Sans%20Bold/26368-26623.pbf')));
  assert.ok(h.calls.every(url => policy.allowedOpenMapUrl(url)));
  const cold = harness({ records: h.state.records });
  const listed = await cold.model.listOpenMapPacks(); assert.equal(listed.length, 1); assert.equal(listed[0].id, completed.id);
  const pack = await cold.model.readOpenMapPack(completed.id);
  assert.equal(pack.places.length, 1); assert.equal(pack.places[0].id, 'node/1');
  assert.equal(pack.style.sources.backdrop, undefined); assert.equal(pack.style.sources.streets.url, undefined); assert.deepEqual([...pack.style.sources.streets.tiles], [template]);
  const prepared = cold.model.preparedMapStyle(pack.style, pack.id);
  const expandedGlyph = prepared.glyphs.replace('{fontstack}', encodeURIComponent('Noto Sans Regular,Noto Sans Bold')).replace('{range}', '26368-26623');
  assert.deepEqual([...new Uint8Array((await cold.model.resolveMapResource(expandedGlyph, new AbortController().signal)).data)], [1, 2, 3]);
  const tileUrl = pack.resources.find(resource => resource.url.includes('/planet/20261027/')).url;
  const resolved = await cold.model.resolveMapResource(cold.model.mapResourceUrl(tileUrl, pack.id), new AbortController().signal);
  assert.equal(new VectorTile(new PbfReader(resolved.data)).layers.place.feature(0).properties.name, 'İstanbul 東京');
  const outside = 'https://tiles.openfreemap.org/planet/20261027/14/0/0.pbf';
  await assert.rejects(cold.model.resolveMapResource(cold.model.mapResourceUrl(outside, pack.id), new AbortController().signal), /outside_download/);
  assert.equal(cold.calls.length, 0);
});

test('downloaded vector-tile POIs reopen as real OSM places without extra place-provider requests or invented opening hours', async () => {
  const zoom = 14, n = 2 ** zoom;
  const tileX = (center.longitude + 180) / 360 * n;
  const tileY = (1 - Math.asinh(Math.tan(center.latitude * Math.PI / 180)) / Math.PI) / 2 * n;
  const x = Math.floor(tileX), y = Math.floor(tileY);
  const poi = vectorTile(0, { name: 'Downloaded museum', class: 'museum', subclass: 'museum' }, 'poi', 1231, [Math.round((tileX - x) * 4096), Math.round((tileY - y) * 4096)]);
  const h = harness({ respond: target => target.endsWith(`/14/${x}/${y}.pbf`) ? new Response(poi) : null });
  const complete = await h.download({ places: [] });
  assert.ok(h.calls.every(url => policy.allowedOpenMapUrl(url)));
  assert.equal(h.calls.length, complete.resourceCount);
  const cold = harness({ records: h.state.records });
  const pack = await cold.model.readOpenMapPack(complete.id);
  assert.equal(pack.places.length, 1);
  assert.equal(pack.places[0].id, 'node/123');
  assert.equal(pack.places[0].name, 'Downloaded museum');
  assert.equal(pack.places[0].sourceUrl, 'https://www.openstreetmap.org/node/123');
  assert.equal(pack.places[0].hours, null);
  assert.equal(cold.calls.length, 0);
});

test('installed MapLibre getJSON receives parsed TileJSON and sprite metadata from the custom protocol; binary and cached resources retain their types', async () => {
  const h = harness(), ajax = {};
  const code = ts.transpileModule(readFileSync(new URL('../mobile/node_modules/maplibre-gl/src/util/ajax.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: ajax, ArrayBuffer, URL, require: id => {
    if (id === './util.ts') return { extend: Object.assign, isWorker: () => false, ensureError: value => value };
    if (id === './abort_error.ts') return { throwIfAborted: signal => signal.throwIfAborted() };
    if (id === '../source/protocol_crud.ts') return { getProtocol: () => (request, controller) => h.model.resolveMapResource(request.url, controller.signal, request.type) };
    if (id === './actor_messages.ts') return { MessageType: {} };
    throw new Error(`Unexpected MapLibre import ${id}`);
  } });
  const tileJson = await ajax.getJSON({ url: h.model.mapResourceUrl('https://tiles.openfreemap.org/planet') }, new AbortController());
  assert.equal(tileJson.data.tiles[0], template); assert.ok(tileJson.data.tiles.length > 0);
  const spriteUrl = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json';
  assert.equal(JSON.stringify(await ajax.getJSON({ url: h.model.mapResourceUrl(spriteUrl) }, new AbortController())), '{"data":{}}');
  const binary = await ajax.getArrayBuffer({ url: h.model.mapResourceUrl(template.replace('{z}', '14').replace('{x}', '1').replace('{y}', '1')) }, new AbortController());
  assert.ok(binary.data instanceof ArrayBuffer);
  assert.equal(new VectorTile(new PbfReader(binary.data)).layers.place.feature(0).properties.name, 'İstanbul 東京');
  const complete = await h.download(); const cold = harness({ records: h.state.records });
  const cached = await cold.model.resolveMapResource(cold.model.mapResourceUrl(spriteUrl, complete.id), new AbortController().signal, 'json');
  assert.equal(JSON.stringify(cached), '{"data":{}}'); assert.equal(cold.calls.length, 0);
  const text = await cold.model.resolveMapResource(cold.model.mapResourceUrl(spriteUrl, complete.id), new AbortController().signal, 'string');
  assert.equal(text.data, '{}');
});

test('a small multilingual region downloads only glyphs used by its style instead of crossing 50MB on invisible translations', async () => {
  const labels = style();
  labels.layers = ['Regular', 'Bold', 'Italic'].map((family, index) => ({ id: `labels-${index}`, type: 'symbol', source: 'streets', 'source-layer': 'place', layout: { 'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']], 'text-font': [`Noto Sans ${family}`] } }));
  const translated = Array.from({ length: 255 }, (_, index) => String.fromCodePoint((index + 1) * 256 + 64)).join('');
  const h = harness({ style: labels, tile: vectorTile(0, { name: 'İstanbul', 'name:latin': 'İstanbul', 'name:unused': translated }),
    respond: target => target.includes('/fonts/') ? new Response(new Uint8Array(200_000)) : null });
  const complete = await h.download();
  const fonts = h.calls.filter(url => url.includes('/fonts/'));
  assert.equal(fonts.length, 9); // Includes the combining dot needed by a lowercase dotted İ.
  assert.ok(fonts.every(url => /\/(0-255|256-511|768-1023)\.pbf$/.test(url)));
  assert.ok(complete.bytes < 2_000_000 && complete.resourceCount < 30);
  assert.equal(h.state.commits, 1);
});

test('label glyph discovery preserves non-name fields, static non-Latin text, source layers and the correct font family', async () => {
  const labels = style();
  labels.layers = [
    { id: 'name', type: 'symbol', source: 'streets', 'source-layer': 'place', layout: { 'text-field': '{name}', 'text-font': ['Noto Sans Regular'] } },
    { id: 'reference', type: 'symbol', source: 'streets', 'source-layer': 'place', layout: { 'text-field': ['concat', '案内', ['to-string', ['get', 'ref']]], 'text-font': ['Noto Sans Bold'], 'text-transform': 'uppercase' } },
    { id: 'absent-source', type: 'symbol', source: 'streets', 'source-layer': 'not-in-this-tile', layout: { 'text-field': '{name:zh}', 'text-font': ['Noto Sans Italic'] } },
  ];
  const h = harness({ style: labels, tile: vectorTile(0, { name: 'İstanbul', ref: 'Б12ᾀ', 'name:zh': '東京' }) });
  await h.download();
  const requested = h.calls.filter(url => url.includes('/fonts/'));
  assert.ok(requested.some(url => url.includes('/Noto%20Sans%20Bold/1024-1279.pbf')));
  assert.ok(requested.some(url => url.includes('/Noto%20Sans%20Bold/768-1023.pbf')));
  const staticRange = Math.floor('案'.codePointAt(0) / 256) * 256;
  assert.ok(requested.some(url => url.includes(`/Noto%20Sans%20Bold/${staticRange}-${staticRange + 255}.pbf`)));
  assert.ok(requested.filter(url => url.includes('/Noto%20Sans%20Regular/')).every(url => /\/(0-255|256-511|768-1023)\.pbf$/.test(url)));
  assert.ok(requested.filter(url => url.includes('/Noto%20Sans%20Italic/')).every(url => /\/(0-255|256-511)\.pbf$/.test(url)));
});

test('aborting during database opening or active replacement transaction keeps the previous complete pack', async () => {
  const initial = harness(); await initial.download();
  for (const timing of ['open', 'put', 'commit']) {
    const h = harness({ records: initial.state.records }), controller = new AbortController();
    if (timing === 'open') h.state.onOpen = () => controller.abort();
    if (timing === 'put') h.state.beforePut = () => controller.abort();
    if (timing === 'commit') h.state.beforeCommit = (_tx, mode) => { if (mode === 'readwrite') controller.abort(); };
    await assert.rejects(h.download({ name: 'Must not replace', signal: controller.signal }), error => error.name === 'AbortError');
    assert.equal(h.state.commits, 0, timing);
    assert.equal([...h.state.records.values()][0].name, 'İstanbul', timing);
  }
});

test('provider and storage failure preserve old packs and leave no partial pack or continued worker progress', async () => {
  const initial = harness(); await initial.download();
  let progress = 0;
  const failed = harness({ records: initial.state.records, respond: url => url.includes('/planet/20261027/') ? new Response('unavailable', { status: 503 }) : null });
  await assert.rejects(failed.download({ onProgress() { progress++; } }), /map_unavailable/);
  const after = progress; await new Promise(resolve => setImmediate(resolve)); assert.equal(progress, after);
  assert.equal(failed.state.commits, 0); assert.equal(failed.state.records.size, 1);
  const quota = harness({ records: initial.state.records }); quota.state.failWrite = true;
  await assert.rejects(quota.download({ name: 'Fail write' }), /storage_unavailable/);
  assert.equal(quota.state.commits, 0); assert.equal([...quota.state.records.values()][0].name, 'İstanbul');
});

test('three-pack limit is enforced atomically while existing regions can be replaced', async () => {
  const h = harness();
  for (let n = 0; n < 3; n++) await h.download({ center: { latitude: center.latitude + n / 10, longitude: center.longitude } });
  assert.equal(h.state.records.size, 3);
  await assert.rejects(h.download({ center: { latitude: center.latitude + 1, longitude: center.longitude } }), /pack_limit/);
  assert.equal(h.state.records.size, 3);
  await h.download({ name: 'Updated existing' });
  assert.equal(h.state.records.size, 3); assert.equal(h.state.records.get(`${center.latitude.toFixed(3)}:${center.longitude.toFixed(3)}:1`).name, 'Updated existing');
  await h.model.deleteOpenMapPack(`${center.latitude.toFixed(3)}:${center.longitude.toFixed(3)}:1`);
  assert.equal((await h.model.listOpenMapPacks()).length, 2);
});

test('per-resource stream cap and total pack byte cap reject oversized data without storing partial state', async () => {
  let cancelled = false;
  const oversized = harness({ respond: () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8_000_001)); }, cancel() { cancelled = true; } })) });
  await assert.rejects(oversized.model.fetchOpenMapResource(policy.OPEN_MAP_STYLE), /map_resource_too_large/);
  assert.equal(cancelled, true);
  const large = harness({ tile: vectorTile(7_900_000) });
  await assert.rejects(large.download({ radiusKm: 3 }), /area_too_large/);
  assert.equal(large.state.records.size, 0); assert.equal(large.state.commits, 0);
});

test('concurrent asset downloads stop at the 3000-resource cap before any pack is committed', async () => {
  const manyFonts = style();
  manyFonts.layers = Array.from({ length: 900 }, (_, index) => ({ ...manyFonts.layers[1], id: `font-${index}`, layout: { 'text-field': '{name}', 'text-font': [`Noto Sans Font ${index}`] } }));
  const h = harness({ style: manyFonts }); let largest = 0;
  await assert.rejects(h.download({ onProgress(_bytes, count) { largest = Math.max(largest, count); } }), /area_too_large/);
  assert.ok(largest <= policy.OPEN_MAP_MAX_RESOURCES);
  assert.ok(h.calls.length <= policy.OPEN_MAP_MAX_RESOURCES);
  assert.equal(h.state.commits, 0); assert.equal(h.state.records.size, 0);
});

test('corrupt size declarations and untrusted resource/style URLs cannot reopen as downloaded maps', async () => {
  const h = harness(); const item = await h.download(); const good = h.state.records.get(item.id);
  for (const mutate of [pack => { pack.bytes = 1; }, pack => { pack.resourceCount++; }, pack => { pack.resources[0].url = 'https://evil.test/data'; }, pack => { pack.style.sources.streets.tiles = ['https://evil.test/{z}/{x}/{y}.pbf']; }, pack => { pack.bounds.west = -180; }, pack => { pack.bounds.west = NaN; }, pack => { pack.places = [null]; }]) {
    const pack = structuredClone(good); mutate(pack);
    const cold = harness({ records: new Map([[pack.id, pack]]) });
    assert.equal(await cold.model.readOpenMapPack(pack.id), null);
    assert.equal((await cold.model.listOpenMapPacks()).length, 0);
  }
});

test('resource route rejects external URLs before fetch and caps upstream binary data', async () => {
  let calls = 0, cancelled = false;
  const exports = {};
  const route = ts.transpileModule(readFileSync(new URL('../app/api/maps/resource/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(route, { exports, require: () => policy, URL, Response, Uint8Array, AbortSignal, fetch: async () => { calls++; return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8_000_001)); }, cancel() { cancelled = true; } })); } });
  const bad = await exports.GET(new Request('https://app.test/api/maps/resource?url=https://evil.test/planet'));
  assert.equal(bad.status, 400); assert.equal(calls, 0); assert.equal(bad.headers.get('access-control-allow-origin'), '*');
  const tooLarge = await exports.GET(new Request(`https://app.test/api/maps/resource?url=${encodeURIComponent(policy.OPEN_MAP_STYLE)}`));
  assert.equal(tooLarge.status, 502); assert.equal(cancelled, true); assert.equal(tooLarge.headers.get('cache-control'), 'no-store');
});
