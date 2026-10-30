import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { countTokens } from 'gpt-tokenizer/model/gpt-oss-20b';
import { realLocaleModule } from '../fixtures/real-locale-modules.mjs';

function load(path, imports = {}, globals = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Error, Date, Intl, URL, Response, Request, Headers,
    AbortSignal, AbortController, setTimeout, clearTimeout, Buffer, process: { env: {} }, ...globals })(name => {
    if (name in imports) return imports[name]; const localeModule=realLocaleModule(name);if(localeModule)return localeModule;throw Error(`Missing import ${name}`);
  }, output, output.exports);
  return output.exports;
}
const clone = value => JSON.parse(JSON.stringify(value));
const labels = load('lib/travel-assistant/journey-plan-labels.ts');
const places = load('lib/travel-assistant/places.ts');
const input = { destination: { name: 'Konya', latitude: 37.87, longitude: 32.5 }, dayCount: 2, startDate: '2026-11-01',
  locale: 'tr', party: 'family', budget: 'economical', pace: 'balanced', walking: 'light', interests: ['culture', 'nature'], notes: 'Çocuklarla mola verelim.' };
const venue = (index, group = index % 2 ? 'nature' : 'culture') => ({ id: `apple/venue${index}`, name: `Gerçek mekân ${index}`,
  latitude: input.destination.latitude + index * 0.00001, longitude: input.destination.longitude + index * 0.00001,
  group, category: group === 'culture' ? 'museum' : 'park', kind: group === 'culture' ? 'museum' : 'park', free: null, accessible: null,
  hours: null, address: null, fetchedAt: new Date().toISOString(), sourceUrl: `https://maps.apple.com/?place-id=venue${index}` });
const settings = { JOURNEY_AI_PROVIDER: 'groq', GROQ_API_KEY: 'nonfunctional-fixture', GROQ_JOURNEY_MODEL: 'openai/gpt-oss-20b',
  GEMINI_API_KEY: 'never-use-this', GEMINI_MODEL: 'never-use-this' };
const compactPlan = () => ({ summary: 'Aileyle kültür ve doğa keşfi.', days: [
  { theme: 'İlk keşif', stops: [{ p: 'p1', m: 60 }, { p: 'p2', m: 45 }] },
  { theme: 'İkinci keşif', stops: [{ p: 'p3', m: 60 }, { p: 'p4', m: 45 }] },
] });
const response = plan => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(plan) } }] });
function fixture(options = {}) {
  const calls = { groq: [], gemini: 0, reservations: [], warnings: [] };
  const candidates = options.candidates ?? Array.from({ length: 30 }, (_, index) => venue(index));
  const globals = { process: { env: options.env ?? settings }, fetch: async (url, init) => {
    calls.groq.push({ url, init, body: JSON.parse(init.body) }); return options.fetch ? options.fetch(url, init, calls.groq.length) : response(compactPlan());
  } };
  const adapter = load('lib/travel-assistant/journey-plan-groq.ts', { 'gpt-tokenizer/model/gpt-oss-20b': { countTokens }, './journey-plan-labels': labels }, globals);
  const core = load('lib/travel-assistant/journey-plan.ts', {
    './places': places, './journey-plan-labels': labels, './journey-plan-groq': adapter,
    './journey-search': { searchJourneyPlaces: async () => ({ places: [input.destination] }) },
    './journey-discovery': { discoverJourneyPlaces: async (_center, group) => ({ places: candidates.filter(place => place.group === group),
      fetchedAt: new Date().toISOString(), attribution: 'Apple Maps' }) },
    '@google/genai': { GoogleGenAI: class { constructor() { calls.gemini++; throw Error('Gemini must never be touched'); } } },
  }, { ...globals, console: { warn: (...args) => calls.warnings.push(args) } });
  const reserve = async (tokens, signal) => { calls.reservations.push(tokens); assert.equal(signal.aborted, false); return options.reserve?.(tokens, signal); };
  return { adapter, core, calls, candidates, reserve };
}

test('Groq is explicitly selected, server-only and never falls back to Gemini for missing or rejected configuration', async () => {
  for (const env of [{ ...settings, GROQ_API_KEY: '' }, { ...settings, GROQ_JOURNEY_MODEL: 'other/model' }, { ...settings, JOURNEY_AI_PROVIDER: 'unknown' }]) {
    const app = fixture({ env }); assert.equal(app.core.journeyPlanModel(), null);
    await assert.rejects(app.core.createJourneyPlan(input, new AbortController().signal), error => error.code === 'plan_unavailable');
    assert.equal(app.calls.groq.length, 0); assert.equal(app.calls.gemini, 0);
  }
  const app = fixture(); const result = await app.core.createJourneyPlan(input, new AbortController().signal, { reserveProviderAttempt: app.reserve });
  assert.equal(result.generatedBy, 'ai'); assert.equal(result.days.length, 2); assert.equal(app.calls.gemini, 0);
  assert.deepEqual(clone(result.preferences), { party: input.party, budget: input.budget, pace: input.pace, walking: input.walking, interests: input.interests, notes: input.notes });
  assert.equal(new Set(result.days.flatMap(day => day.stops.map(stop => stop.place.id))).size, 4);
  const call = app.calls.groq[0]; assert.equal(call.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(call.init.redirect, 'error'); assert.equal(call.init.cache, 'no-store');
  assert.equal(call.body.response_format.json_schema.strict, true); assert.equal(call.body.reasoning_effort, 'low');
  assert.equal(call.body.include_reasoning, false); assert.ok(!JSON.stringify(result).includes('nonfunctional-fixture'));
  assert.equal(app.calls.reservations.length, 1); assert.ok(app.calls.reservations[0] <= 7500);
});

test('Compact free-plan budgeting retains all preferences, all days, interests and enough unique choices through fourteen days', () => {
  const { adapter, core } = fixture();
  const groups = ['culture', 'food', 'shopping', 'nature'];
  const dense = groups.flatMap((group, groupIndex) => Array.from({ length: 100 }, (_, index) => ({ ...venue(index + groupIndex * 100, group),
    name: ['Mevlana Müzesi', '東京国立博物館', 'المتحف الوطني', 'Qendra historike'][groupIndex] + ` ${index}` })));
  for (const dayCount of [1, 2, 7, 14]) for (const pace of ['relaxed', 'balanced', 'busy']) {
    const preferences = { ...input, dayCount, pace, interests: groups, notes: `${input.notes} `.repeat(24).slice(0, 500) + ' <|endoftext|>' };
    const selected = core.selectJourneyPlanCandidates(preferences, dense);
    const request = adapter.buildGroqJourneyRequest(preferences, selected, Array(dayCount).fill(360));
    assert.ok(request.reservedTokens <= 7500); assert.ok(request.body.max_completion_tokens <= 3300);
    assert.ok(request.candidates.length >= dayCount * 2);
    assert.deepEqual(new Set(request.candidates.map(place => place.group)), new Set(groups));
    const data = JSON.parse(request.body.messages[1].content);
    assert.equal(data.preferences.notes, preferences.notes); assert.equal(data.preferences.dayCount, dayCount);
    assert.equal(data.preferences.party, input.party); assert.equal(data.preferences.walking, input.walking);
    assert.equal(data.dayVisitMinutes.length, dayCount);
  }
});

test('Fourteen-day compact response expands only genuine metadata and passes unchanged schedule, uniqueness and interest validation', async () => {
  const candidates = Array.from({ length: 100 }, (_, index) => venue(index));
  const app = fixture({ candidates, fetch: (_url, init) => {
    const request = JSON.parse(init.body), data = JSON.parse(request.messages[1].content);
    assert.equal(data.preferences.dayCount, 14);
    return response({ summary: 'Kültür ve doğa ile iki hafta.', days: Array.from({ length: 14 }, (_, day) => ({ theme: `${day + 1}. gün`,
      stops: data.candidates.slice(day * 4, day * 4 + 4).map(row => ({ p: row[0], m: 45 })) })) });
  } });
  const result = await app.core.createJourneyPlan({ ...input, dayCount: 14 }, new AbortController().signal, { reserveProviderAttempt: app.reserve });
  assert.equal(result.days.length, 14); assert.equal(result.days.flatMap(day => day.stops).length, 56);
  for (const stop of result.days.flatMap(day => day.stops)) assert.deepEqual(clone(stop.place), candidates.find(place => place.id === stop.place.id));
  assert.equal(app.calls.groq.length, 1);
});

test('Strict shape still rejects invented or duplicate places and one shared output-repair budget makes at most two calls', async () => {
  const app = fixture({ fetch: (_url, _init, call) => { const plan = compactPlan(); if (call === 1) plan.days[0].stops[0].p = 'p999'; return response(plan); } });
  const result = await app.core.createJourneyPlan(input, new AbortController().signal, { reserveProviderAttempt: app.reserve });
  assert.equal(result.days.length, 2); assert.equal(app.calls.groq.length, 2); assert.equal(app.calls.reservations.length, 2);
  const invalid = fixture({ fetch: () => { const plan = compactPlan(); plan.days[1].stops[1].p = 'p1'; return response(plan); } });
  await assert.rejects(invalid.core.createJourneyPlan(input, new AbortController().signal, { reserveProviderAttempt: invalid.reserve }), error => error.code === 'plan_failed');
  assert.equal(invalid.calls.groq.length, 2); assert.equal(invalid.calls.gemini, 0);
});

test('Groq 429 retains only safe retry metadata; daily request exhaustion and ambiguous token quotas never auto retry', async () => {
  for (const [headers, code] of [[{ 'retry-after': '2', 'x-ratelimit-remaining-requests': '0' }, 'plan_daily_capacity'],
    [{ 'retry-after': '1', 'x-ratelimit-remaining-tokens': '0', 'x-ratelimit-remaining-requests': '500' }, 'plan_busy']]) {
    const app = fixture({ fetch: () => new Response('private provider message with account information', { status: 429, headers }) });
    await assert.rejects(app.core.createJourneyPlan(input, new AbortController().signal, { reserveProviderAttempt: app.reserve }), error => error.code === code);
    assert.equal(app.calls.groq.length, 1); assert.equal(app.calls.reservations.length, 1);
    assert.ok(!JSON.stringify(app.calls.warnings).includes('private provider'));
  }
});

test('Reservation refusal and abort fence late provider work; transport and body hangs settle without a hidden retry', async () => {
  const denied = fixture({ reserve: () => { throw new Error('budget'); } });
  await assert.rejects(denied.core.createJourneyPlan(input, new AbortController().signal, { reserveProviderAttempt: denied.reserve }));
  assert.equal(denied.calls.groq.length, 0);
  let release;
  const pending = fixture({ reserve: () => new Promise(resolve => { release = resolve; }) });
  const controller = new AbortController();
  const run = pending.core.createJourneyPlan(input, controller.signal, { reserveProviderAttempt: pending.reserve });
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  controller.abort(); await assert.rejects(run, error => error.code === 'plan_timeout'); release();
  await new Promise(resolve => setTimeout(resolve, 1)); assert.equal(pending.calls.groq.length, 0);
  for (const fetch of [() => new Promise(() => {}), () => new Response(new ReadableStream({ start() {} }))]) {
    const app = fixture({ fetch }); const abort = new AbortController();
    const run = app.adapter.generateBoundedGroqJourneyJson({ prompt: 'Return JSON', signal: abort.signal, reserveProviderAttempt: app.reserve });
    abort.abort(); await assert.rejects(run, error => error.status === 408); assert.ok(app.calls.groq.length <= 1);
  }
});

test('Oversized, incomplete and malformed provider results cannot become a successful route', async () => {
  for (const fetch of [() => new Response('x'.repeat(100_001)),
    () => Response.json({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(compactPlan()) } }] }),
    () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{invalid' } }] })]) {
    const app = fixture({ fetch });
    await assert.rejects(app.core.createJourneyPlan(input, new AbortController().signal, { reserveProviderAttempt: app.reserve }));
    assert.ok(app.calls.groq.length <= 2); assert.equal(app.calls.gemini, 0);
  }
});

test('Confirmed usage settles every response before validation while errors, absent and impossible usage retain the full reserve', async () => {
  const settled = [];
  const app = fixture({ reserve: () => ({ settle: async total => { settled.push(total); } }), fetch: (_url, _init, call) => {
    const plan = compactPlan(); if (call === 1) plan.days[0].stops[0].p = 'p999';
    return Response.json({ usage: { prompt_tokens: 400, completion_tokens: 200, total_tokens: 600 }, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(plan) } }] });
  } });
  await app.core.createJourneyPlan(input, new AbortController().signal, { reserveProviderAttempt: app.reserve });
  assert.deepEqual(settled, [600, 600]); assert.equal(app.calls.reservations.length, 2);
  for (const usage of [undefined, { prompt_tokens: 1, completion_tokens: 1, total_tokens: 0 },
    { prompt_tokens: 1, completion_tokens: 1, total_tokens: 3 }, { prompt_tokens: 9000, completion_tokens: 1, total_tokens: 9001 }]) {
    const app = fixture({ reserve: () => ({ settle: async () => assert.fail('Invalid usage must not release reserved capacity') }), fetch: () =>
      Response.json({ usage, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(compactPlan()) } }] }) });
    await app.core.createJourneyPlan(input, new AbortController().signal, { reserveProviderAttempt: app.reserve });
  }
});

test('Sea labels and compact interest evidence never turn an inland park into a coastal venue', () => {
  const { adapter } = fixture(); const land = venue(1), coast = { ...venue(2, 'nature'), category: 'beach', name: 'Konyaaltı Plajı' };
  const preferences = { ...input, dayCount: 1, interests: ['sea', 'nature'] };
  const request = adapter.buildGroqJourneyRequest(preferences, [land, coast], [360]);
  const rows = JSON.parse(request.body.messages[1].content).candidates;
  assert.equal(rows[0][4], 'nature'); assert.equal(rows[1][4], 'sea,nature');
  const result = adapter.expandGroqJourneyOutput({ summary: 'İki durak', days: [{ theme: 'Keşif', stops: [{ p: 'p1', m: 45 }, { p: 'p2', m: 45 }] }] }, preferences, [land, coast]);
  assert.match(result.days[0].stops[0].reason, /doğa/); assert.doesNotMatch(result.days[0].stops[0].reason, /deniz/);
});

test('An oversized valid request fails with an actionable capacity code before any provider reservation or call', async () => {
  const candidates = Array.from({ length: 160 }, (_, index) => ({ ...venue(index), name: '東京国立博物館自然歴史公園'.repeat(8) + index }));
  const app = fixture({ candidates });
  await assert.rejects(app.core.createJourneyPlan({ ...input, dayCount: 14, pace: 'busy', notes: '東京観光旅行計画希望'.repeat(90) }, new AbortController().signal,
    { reserveProviderAttempt: app.reserve }), error => error.code === 'plan_request_too_large');
  assert.equal(app.calls.reservations.length, 0); assert.equal(app.calls.groq.length, 0); assert.equal(app.calls.gemini, 0);
});
