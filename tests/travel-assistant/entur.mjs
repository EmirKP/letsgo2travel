import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}, expose = '') {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n${expose}})`, { Date, Intl, URL, URLSearchParams, Response, Request, AbortSignal, TextDecoder, ...globals })(name => {
    if (name in imports) return imports[name];
    if (name.endsWith('.css')) return {};
    throw Error(`Missing import ${name}`);
  }, output, output.exports);
  return output.exports;
}
const entur = load('lib/travel-assistant/entur.ts');
const transit = load('lib/travel-assistant/transit.ts');
const stop = { type: 'Feature', properties: { id: 'NSR:StopPlace:59872', layer: 'stopPlace', names: { default: 'Oslo S', display: 'Oslo S, Oslo' }, address: { countryCode: 'no' } } };
const rawStops = { features: [stop] };
const rawTrip = () => ({ data: { trip: { tripPatterns: [{ duration: 1320, expectedStartTime: '2026-10-04T20:20:00Z', expectedEndTime: '2026-10-04T20:42:00Z', legs: [{ mode: 'rail', duration: 1320, expectedStartTime: '2026-10-04T20:20:00Z', expectedEndTime: '2026-10-04T20:42:00Z', fromPlace: { name: 'Oslo S' }, toPlace: { name: 'Oslo lufthavn stasjon' }, line: { publicCode: 'FLY1', name: 'Airport train' }, situations: [{ summary: [{ language: 'no', value: 'Norsk melding' }, { language: 'en', value: '<b>Platform changed</b>' }] }] }] }] } } });
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; return { promise: new Promise(yes => { resolve = yes; }), resolve }; };
const server = globals => load('lib/travel-assistant/entur-server.ts', { './entur': entur }, globals);

test('Norway station search accepts only Norwegian canonical stop places, removes duplicates and cleans labels', () => {
  const rows = { features: [stop, stop, { ...stop, properties: { ...stop.properties, id: '940GZZLUWLO' } }, { ...stop, properties: { ...stop.properties, id: 'NSR:StopPlace:2', address: { countryCode: 'se' } } }, { ...stop, properties: { ...stop.properties, id: 'NSR:StopPlace:3', names: { display: '<b>Bergen</b>' } } }] };
  assert.deepEqual(clone(entur.normalizeEnturStops(rows)), [{ id: 'NSR:StopPlace:59872', name: 'Oslo S, Oslo' }, { id: 'NSR:StopPlace:3', name: 'Bergen' }]);
  assert.equal(transit.validStopId(stop.properties.id, 'norway'), true); assert.equal(transit.validStopId(stop.properties.id, 'london'), false);
  assert.equal(transit.validStopId('NSR:StopPlace:1} mutation', 'norway'), false);
  assert.throws(() => entur.normalizeEnturStops({ message: 'upstream error' }));
});

test('Entur timetable converts absolute times into Norway local time, preserves legs and flags partial/error responses', () => {
  const result = entur.normalizeEnturTransit(rawTrip());
  assert.equal(result.source, 'Entur'); assert.equal(result.timeZone, 'Europe/Oslo');
  assert.equal(result.journeys[0].departure, '2026-10-04T22:20:00'); assert.equal(result.journeys[0].minutes, 22);
  assert.equal(result.journeys[0].legs[0].summary, 'FLY1 · Airport train'); assert.equal(result.journeys[0].legs[0].disruptions[0], 'Platform changed');
  const sameLabel = rawTrip(); sameLabel.data.trip.tripPatterns[0].legs[0].line.name = 'FLY1';
  assert.equal(entur.normalizeEnturTransit(sameLabel).journeys[0].legs[0].summary, 'FLY1');
  assert.ok(transit.validateTransit(result)); assert.equal(transit.validateTransit({ ...result, timeZone: 'Europe/London' }), null);
  assert.equal(transit.validateTransit({ ...result, fetchedAt: '2020-01-01T00:00:00Z' }), null);
  const broken = rawTrip(); broken.data.trip.tripPatterns[0].legs.push({}); assert.throws(() => entur.normalizeEnturTransit(broken));
  assert.throws(() => entur.normalizeEnturTransit({ ...rawTrip(), errors: [{ message: 'Too complex' }] }));
  const noZone = rawTrip(); noZone.data.trip.tripPatterns[0].expectedStartTime = '2026-10-04T20:20:00'; assert.throws(() => entur.normalizeEnturTransit(noZone));
  const backwards = rawTrip(); backwards.data.trip.tripPatterns[0].legs[0].expectedEndTime = '2026-10-04T19:00:00Z'; assert.throws(() => entur.normalizeEnturTransit(backwards));
  assert.equal(entur.normalizeEnturTransit({ data: { trip: { tripPatterns: [] } } }).journeys.length, 0);
});

test('Entur requests use fixed application identity, bounded request/body and GraphQL variables; identical requests share/cache the result', async () => {
  const calls = [], wait = deferred(), timeouts = [];
  const provider = server({ AbortSignal: { timeout: ms => { timeouts.push(ms); return undefined; } }, fetch: (url, options) => { calls.push({ url, options }); return wait.promise; } });
  const from = 'NSR:StopPlace:59872', to = 'NSR:StopPlace:58211';
  const first = provider.readEnturJourney(from, to), second = provider.readEnturJourney(from, to);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://api.entur.io/journey-planner/v3/graphql');
  assert.equal(calls[0].options.headers['ET-Client-Name'], 'letsgo2travel-traveltools'); assert.equal(calls[0].options.redirect, 'error');
  const body = JSON.parse(calls[0].options.body); assert.deepEqual(body.variables, { from, to }); assert.match(body.query, /\$from:String!/);
  assert.deepEqual(timeouts, [12000]); wait.resolve(Response.json(rawTrip()));
  assert.equal((await first).journeys.length, 1); assert.equal((await second).journeys.length, 1);
  await provider.readEnturJourney(from, to); assert.equal(calls.length, 1);
  await assert.rejects(provider.readEnturJourney(from, 'https://evil.test')); assert.equal(calls.length, 1);
});

test('Entur quota cooldown applies across queries and never retries before upstream reset', async () => {
  let now = Date.parse('2026-10-04T20:00:00Z'), calls = 0;
  const provider = server({ Date: class extends Date { static now() { return now; } }, fetch: async () => {
    calls++; return calls === 1 ? new Response('', { status: 429, headers: { 'Rate-Limit-Expiry-Time': new Date(now + 180000).toUTCString() } }) : Response.json(rawStops);
  } });
  await assert.rejects(provider.searchEnturStops('Oslo')); now += 90000;
  await assert.rejects(provider.searchEnturStops('Bergen')); assert.equal(calls, 1);
  now += 100000; await provider.searchEnturStops('Bergen'); assert.equal(calls, 2);
});

test('Entur oversized or malformed bodies are not cached and upstream work is capped', async () => {
  const oversized = server({ fetch: async () => new Response('x', { headers: { 'Content-Length': '1000001' } }) });
  await assert.rejects(oversized.searchEnturStops('Oslo'), /too large/);
  const waits = []; const provider = server({ fetch: () => { const d = deferred(); waits.push(d); return d.promise; } });
  const requests = ['Oslo', 'Bergen', 'Trondheim', 'Stavanger'].map(city => provider.searchEnturStops(city));
  await assert.rejects(provider.searchEnturStops('Tromso'), /busy/); assert.equal(waits.length, 4);
  waits.forEach(d => d.resolve(Response.json(rawStops))); await Promise.all(requests);
});

test('Regional API validates coverage and never sends another provider stop ID to Entur', async () => {
  const calls = [];
  const route = load('app/api/travel-assistant/transit/route.ts', { '@/lib/travel-assistant/transit': transit,
    '@/lib/country-intelligence/fetch': { publicJson() { throw Error('No TfL expected'); } },
    '@/lib/travel-assistant/entur-server': { searchEnturStops: async q => { calls.push(q); return entur.normalizeEnturStops(rawStops); }, readEnturJourney: async (from, to) => { calls.push({ from, to }); return entur.normalizeEnturTransit(rawTrip()); } },
  });
  const get = params => route.GET(new Request(`https://test.local/api/travel-assistant/transit?${params}`));
  assert.equal((await get('city=paris&q=Gare')).status, 400);
  assert.equal((await get('city=norway&from=940GZZLUWLO&to=NSR:StopPlace:59872')).status, 400);
  assert.equal(calls.length, 0);
  const stations = await get('city=norway&q=Oslo'); assert.equal(stations.status, 200); assert.equal((await stations.json()).stops[0].name, 'Oslo S, Oslo');
  const journey = await get('city=norway&from=NSR:StopPlace:59872&to=NSR:StopPlace:58211'); assert.equal(journey.status, 200); assert.equal((await journey.json()).source, 'Entur');
});

test('Transport UI explicitly offers Norway and resets regional component identity instead of reusing London selections', () => {
  const slots = []; let cursor = 0;
  const jsx = (type, props, key) => ({ type, props, key });
  const react = { useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; } };
  const ui = load('mobile/src/components/TravelTransit.tsx', { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../lib/i18n': { useI18n: () => ({ copy: (_tr, en) => en }) },
    '../lib/localeFormatting': {}, '../lib/api': {}, '../lib/config': {}, '../hooks/useCurrentTime': {}, '../lib/native': {}, '../lib/travelAssistant': {}, './Icon': {}, '../../../lib/travel-assistant/transit': transit,
  });
  const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
  const render = () => { cursor = 0; return ui.TravelTransit(); };
  let view = render(); nodes(view).find(node => node.type === 'button' && node.props.children === 'Norway · Entur').props.onClick(); view = render();
  const regional = nodes(view).find(node => node.props?.city === 'norway'); assert.equal(regional.key, 'norway');
  nodes(view).find(node => node.type === 'button' && node.props.children === 'London · TfL').props.onClick();
  assert.equal(nodes(render()).find(node => node.props?.city === 'london').key, 'london');
});

test('Public API export includes Entur adapter dependencies', () => {
  const exporter = readFileSync('scripts/prepare-travel-assistant-staging.mjs', 'utf8');
  assert.ok(exporter.includes("'lib/travel-assistant/entur.ts'")); assert.ok(exporter.includes("'lib/travel-assistant/entur-server.ts'"));
});
