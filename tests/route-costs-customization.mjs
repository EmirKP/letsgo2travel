import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function modules(overrides = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({ Request, Response, Headers, AbortController, Date, Intl, console, setTimeout, clearTimeout, process: { env: {} }, ...globals });
  const load = filename => {
    let full = path.resolve(filename); if (!existsSync(full)) full += '.ts';
    if (cache.has(full)) return cache.get(full).exports;
    const loaded = { exports: {} }; cache.set(full, loaded);
    if (full.endsWith('.json')) { loaded.exports = JSON.parse(readFileSync(full, 'utf8')); return loaded.exports; }
    const source = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const resolve = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('@/') ? load(name.slice(2)) : name.startsWith('.') ? load(path.resolve(path.dirname(full), name)) : require(name);
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context, { filename: full })(resolve, loaded, loaded.exports);
    return loaded.exports;
  }; return load;
}
const load = modules();
const budget = load('lib/country-intelligence/trip-budget.ts');
const planner = load('lib/route-planner.ts');
const target = { code: 'BJV', name: 'Bodrum', country: 'Türkiye', countryCode: 'TR' };
const input = { mode: 'fixed', destination: target, origin: 'İstanbul', dayCount: 4, days: '4 gün', budget: 'Orta', who: 'Tek başıma', tempo: 'Dengeli', vibe: ['Deniz'], month: 'Ekim', visa: 'Vizesiz veya kolay giriş' };

test('Trip budget scales rooms, one daily dinner and whole transit passes, never the full basket', () => {
  const row = { basket: 500, hotel: 200, meal: 60, travel: 10 };
  assert.deepEqual(JSON.parse(JSON.stringify(budget.tripBudget(row, 3, 2))), { days: 3, people: 2, nights: 2, rooms: 1, hotel: 200, meals: 180, travel: 40, total: 420, perPerson: 210, perPersonDay: 70 });
  const solo = budget.tripBudget(row, 3, 1); assert.equal(solo.hotel, 200); assert.equal(solo.total, 310);
  const odd = budget.tripBudget(row, 3, 3); assert.equal(odd.rooms, 2); assert.equal(odd.hotel, 400);
  const dayTrip = budget.tripBudget(row, 1, 1); assert.equal(dayTrip.hotel, 0); assert.equal(dayTrip.total, 40);
  assert.equal(row.basket, 500);
});
test('Budget input rejects fractional, negative, exponent, empty and excessive counts', () => {
  const row = { hotel: 200, meal: 60, travel: 10 };
  for (const days of ['', '1.5', '1e1', '-1', '31', Infinity, NaN]) assert.equal(budget.tripBudget(row, days, 2), null);
  for (const people of ['0', '21', '2.5', '']) assert.equal(budget.tripBudget(row, 3, people), null);
  assert.equal(budget.tripBudget({ ...row, meal: -1 }, 3, 2), null);
  assert.equal(budget.tripBudget({ ...row, travel: 0 }, 3, 2).travel, 0);
});
test('Budget conversion checks selected pair, age and finite rate; GBP works offline', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const quote = { base: 'GBP', quote: 'TRY', rate: 70, date: '2026-09-29' };
  assert.equal(budget.usableBudgetRate(quote, 'TRY', now), 70);
  assert.equal(budget.usableBudgetRate(quote, 'EUR', now), null);
  for (const bad of [{ date: '2026-09-20' }, { date: '2026-10-01' }, { rate: NaN }, { rate: 0 }, { base: 'EUR' }]) assert.equal(budget.usableBudgetRate({ ...quote, ...bad }, 'TRY', now), null);
  assert.equal(budget.usableBudgetRate(null, 'GBP', now), 1);
});
test('Budget preferences persist valid currency/duration/group without corrupting good values on blank input', () => {
  const saved = new Map(); const localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const prefs = modules({}, { localStorage })('mobile/src/lib/budgetPreferences.ts');
  prefs.saveBudgetPreferences({ currency: 'EUR', days: '5', people: '3' });
  prefs.saveBudgetPreferences({ currency: 'EUR', days: '', people: '3' });
  assert.deepEqual(JSON.parse(JSON.stringify(prefs.readBudgetPreferences())), { currency: 'EUR', days: '5', people: '3' });
  saved.set('l2t-cost-preferences-v1', '{broken'); assert.equal(prefs.readBudgetPreferences().currency, 'TRY');
});
test('Fixed fallback retains exact target and requested day count in all three languages, including one-day trips', () => {
  for (const locale of ['tr', 'en', 'sq']) for (const dayCount of [1, 4, 14]) {
    const result = planner.fixedDestinationStarter({ ...input, dayCount }, locale);
    assert.equal(result.routes.length, 1); assert.equal(result.routes[0].name, 'Bodrum'); assert.equal(result.routes[0].destinationCode, 'BJV');
    assert.equal(result.routes[0].dailyPlan.length, dayCount); assert.equal(result.routes[0].scores.overall, 0);
    assert.ok(result.routes[0].dailyPlan.every(day => day.includes('Bodrum')));
    assert.doesNotMatch(result.summary, /Rome|Saraybosna|Tiflis/);
  }
});
test('Target validation rejects unrelated model destination even if it echoes the selected airport code', () => {
  assert.equal(planner.routeMatchesDestination({ name: 'Rome', cityOrRegion: 'Paris', destinationCode: 'BJV' }, target), false);
  assert.equal(planner.routeMatchesDestination({ name: 'BODRUM' }, target), true);
  assert.equal(planner.routeMatchesDestination({ name: 'Bodrum or Rome' }, target), false);
  assert.equal(planner.routeMatchesDestination({ name: 'Bodrum', cityOrRegion: 'Rome' }, target), false, 'An echoed title cannot hide a contradictory city');
  assert.equal(planner.routeMatchesDestination({ name: 'Bodrum', cityOrRegion: '---' }, target), false);
  assert.equal(planner.routeMatchesDestination({ name: '!!!' }, { ...target, name: '???' }), false, 'Empty normalized names never match');
  assert.equal(planner.routeMatchesDestination({ name: '東京' }, { ...target, name: '東京' }), true);
  assert.equal(planner.routeMatchesDestination({ name: '大阪' }, { ...target, name: '東京' }), false);
});
test('Stop editing is immutable and bounds ordering, deletion, count and length', () => {
  const original = ['Walk', 'Museum', 'Coast'];
  assert.deepEqual(Array.from(planner.editPlanStops(original, { type: 'move', index: 1, delta: -1 })), ['Museum', 'Walk', 'Coast']);
  assert.deepEqual(Array.from(planner.editPlanStops(original, { type: 'remove', index: 1 })), ['Walk', 'Coast']);
  assert.equal(planner.editPlanStops(['Only'], { type: 'remove', index: 0 }).length, 1);
  assert.equal(planner.editPlanStops(Array(30).fill('Stop'), { type: 'add', text: 'More' }).length, 30);
  assert.deepEqual(original, ['Walk', 'Museum', 'Coast']);
  assert.equal(planner.editPlanStops(original, { type: 'edit', index: 0, text: 'x'.repeat(1000) })[0].length, 600);
});
test('Snapshot separates destination and interests from later form changes', () => {
  const state = load('mobile/src/lib/plannerState.ts'); const original = { ...input, destination: { ...target }, vibe: ['Deniz'] }; const snapshot = state.snapshotPlannerInput(original);
  original.destination.name = 'Rome'; original.vibe.push('Shopping');
  assert.equal(snapshot.destination.name, 'Bodrum'); assert.equal(snapshot.vibe.length, 1);
});
function api({ generated, fail = false, enabled = false, cached } = {}) {
  const prompts = [];
  const cacheDb = cached ? { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { output_json: cached } }) }) }) }) } : null;
  const runtime = modules({
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => cacheDb },
    '@google/genai': { GoogleGenAI: class { models = { generateContent: async request => { prompts.push(request.contents); if (fail) throw Error('offline'); return { text: JSON.stringify(generated) }; } }; } },
  }, { process: { env: enabled ? { AI_PLAN_ENABLED: 'true', GEMINI_API_KEY: 'TEST_ONLY' } : {} } });
  return { ...runtime('app/api/ai-plan/route.ts'), prompts, airports: runtime('lib/airport-search.ts') };
}
const request = (body, id = Math.random()) => new Request('https://example.test/api/ai-plan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': String(id) }, body: JSON.stringify(body) });
test('API validates fixed target against real airport catalogue and does not trust client names', async () => {
  const route = api();
  for (const body of [{ ...input, destination: undefined }, { ...input, destination: { code: '???' } }, { ...input, dayCount: 99 }]) assert.equal((await route.POST(request(body))).status, 400);
  const response = await route.POST(request({ ...input, destination: { ...target, name: 'Injected unrelated place', country: 'Nowhere' } }));
  const result = await response.json(); assert.equal(response.status, 200); assert.equal(result.isFallback, true);
  assert.equal(result.data.routes[0].name, route.airports.findAirportByIata('BJV').city); assert.equal(result.data.routes[0].dailyPlan.length, 4);
});
test('AI wrong-target response or provider failure returns the selected destination outline, never discovery alternatives', async () => {
  for (const options of [{ generated: { routes: [{ name: 'Rome', country: 'Italy', destinationCode: 'BJV', dailyPlan: ['1','2','3','4'] }] } }, { generated: { routes: [{ name: 'Bodrum', cityOrRegion: 'Rome', country: 'Italy', dailyPlan: ['1','2','3','4'] }] } }, { fail: true }]) {
    const route = api({ ...options, enabled: true });
    const result = await (await route.POST(request(input))).json();
    assert.equal(result.isFallback, true); assert.equal(result.data.routes.length, 1); assert.equal(result.data.routes[0].destinationCode, 'BJV');
    assert.equal(result.data.routes[0].name, route.airports.findAirportByIata('BJV').city);
  }
});
test('Fixed AI request asks for exact target and duration in Albanian; valid result remains one route', async () => {
  const city = load('lib/airport-search.ts').findAirportByIata('BJV').city;
  const route = api({ enabled: true, generated: { summary: 'Plani yt', routes: [{ name: city, country: 'Türkiye', dailyPlan: ['Dita 1: Mbërritja', 'Dita 2: Shëtitje', 'Dita 3: Bregdeti', 'Dita 4: Kthimi'], scores: { overall: 80 } }] } });
  const result = await (await route.POST(request({ ...input, locale: 'sq' }))).json();
  assert.equal(result.isFallback, false); assert.equal(result.data.routes.length, 1); assert.equal(result.data.routes[0].dailyPlan.length, 4);
  assert.equal(result.data.routes[0].idealDuration, '4 ditë');
  assert.match(route.prompts[0], /Arnavutça/); assert.match(route.prompts[0], /tam 4 günlük/); assert.match(route.prompts[0], /Alternatif destinasyon/);
});

test('Fixed duration labels follow the requested days even when the model returns a conflicting duration', async () => {
  const city = load('lib/airport-search.ts').findAirportByIata('BJV').city;
  const route = api({ enabled: true, generated: { routes: [{ name: city, country: 'Türkiye', idealDuration: '99 days', dailyPlan: ['1','2','3','4'], scores: { overall: 80 } }] } });
  const result = await (await route.POST(request({ ...input, locale: 'en' }))).json();
  assert.equal(result.isFallback, false);
  assert.equal(result.data.routes[0].idealDuration, '4 days');
});

test('Rejected cached fixed plans are marked as starter outlines rather than AI-generated results', async () => {
  for (const change of [{ cityOrRegion: 'Rome' }, { dailyPlan: ['1', '2'] }]) {
    const route = api({ cached: { routes: [{ name: 'Bodrum', country: 'Türkiye', dailyPlan: ['1', '2', '3', '4'], scores: { overall: 80 }, ...change }] } });
    const result = await (await route.POST(request(input))).json();
    assert.equal(result.isFallback, true); assert.notEqual(result.cached, true);
    assert.equal(result.data.routes[0].destinationCode, 'BJV');
    assert.equal(result.data.routes[0].dailyPlan.length, 4);
  }
});

test('Discovery replies without a summary retain Albanian UI language', async () => {
  const route = api({ enabled: true, generated: { routes: [{ name: 'Bodrum', country: 'Türkiye', scores: { overall: 80 } }] } });
  const result = await (await route.POST(request({ ...input, mode: 'discover', destination: undefined, dayCount: undefined, locale: 'sq' }))).json();
  assert.match(result.data.summary, /^Përgatitëm itinerare/);
});
test('All eight ready-route profiles have Albanian copy and isolated editable arrays', () => {
  const routes = load('mobile/src/data/routes.ts');
  for (const code of ['GYD','TBS','SJJ','BEG','TIA','FCO','DXB','BKK']) {
    const sq = routes.routeByDestinationCode(code, 'sq'); const en = routes.routeByDestinationCode(code, 'en');
    assert.notEqual(sq.why, en.why); assert.ok(sq.dailyPlan.every(item => /^Dit/.test(item)));
    sq.dailyPlan.push('Changed'); assert.ok(!routes.routeByDestinationCode(code, 'sq').dailyPlan.includes('Changed'));
  }
});

test('Albanian HTTP requests and incomplete AI replies keep Albanian copy across native and web transports', async () => {
  for (const native of [false, true]) {
    const calls = []; let status = 200;
    const reply = () => ({ success: true, data: { routes: [{ name: 'Bodrum', country: 'Türkiye' }] } });
    const transport = async options => { calls.push(options); return { status, data: status === 200 ? reply() : {} }; };
    const runtime = modules({
      './capacitor': { isNativePlatform: () => native, plugin: () => ({ request: transport }) },
      './config': { config: { apiBaseUrl: 'https://example.test' } },
      './i18n': { localeFromStorage: () => 'sq' },
    }, { window: { setTimeout, clearTimeout }, DOMException, fetch: async (url, options) => {
      const result = await transport({ url, ...options });
      return Response.json(result.data, { status: result.status });
    } });
    const client = runtime('mobile/src/lib/api.ts');
    const response = await client.generateRoutePlan(input, 'sq');
    assert.equal(calls[0].headers['Accept-Language'], 'sq');
    assert.equal(response.data.routes[0].visaStatus, 'Verifiko para udhëtimit');
    assert.equal(response.data.routes[0].estimatedBudget, 'Ndryshon sipas datave');
    assert.equal(response.data.routes[0].idealDuration, '3–5 ditë');
    assert.match(response.data.routes[0].why, /^Bodrum përputhet/);
    assert.match(response.data.routes[0].dailyPlan[0], /^Dita 1:/);
    assert.match(response.data.summary, /^Itineraret që përputhen/);
    status = 503;
    await assert.rejects(() => client.requestJson('/failed'), /Gabim i serverit \(503\)/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(() => client.requestJson('/cancelled', { signal: controller.signal }), /Kërkesa u anulua/);
    assert.equal(calls.length, 2, 'Cancelled requests do not reach either transport');
  }
});


const routeCosts = load('lib/country-intelligence/route-budget.ts');
const partyPreferences = load('lib/planner-preferences.ts');
const budgetNow = Date.parse('2026-10-04T12:00:00Z');
const costRow = { id: 'test', code: 'IT', city: { tr: 'Roma', en: 'Rome' }, hotel: 200, meal: 60, travel: 10, basket: 999 };
const familyInput = { ...input, tier: 'plus', currency: 'EUR', party: { adults: 2, children: 1, childAges: [4] } };
const euroQuote = { base: 'GBP', quote: 'EUR', rate: 1.2, date: '2026-10-02' };

test('Family route cost uses room rounding, explicit tier assumptions and user activity allowance without invented prices', () => {
  const estimate = routeCosts.routeBudgetEstimate(costRow, familyInput, 3, null, euroQuote, null, budgetNow);
  assert.equal(estimate.rooms, 2); assert.equal(estimate.people, 3);
  assert.equal(estimate.hotel, 400 * 1.5 * 1.2);
  assert.equal(estimate.meals, 270 * 1.35 * 1.2);
  assert.equal(estimate.travel, 60 * 1.3 * 1.2);
  assert.equal(estimate.activities, null); assert.equal(estimate.partial, true);
  const full = routeCosts.routeBudgetEstimate(costRow, { ...familyInput, activityBudgetPerPersonDay: 5 }, 3, null, euroQuote, null, budgetNow);
  assert.equal(full.activities, 45); assert.equal(full.total, estimate.total + 45); assert.equal(full.partial, false);
  assert.equal(full.perPersonDay, full.total / 9);
  const free = routeCosts.routeBudgetEstimate(costRow, { ...familyInput, activityBudgetPerPersonDay: 0 }, 3, null, euroQuote, null, budgetNow);
  assert.equal(free.partial, false); assert.equal(free.activities, 0);
  assert.equal(costRow.basket, 999);
});

test('Monthly CPI requires a matching historical local-currency bridge; annual inflation and stale FX cannot inflate a total', () => {
  const adjustment = { currency: 'EUR', referenceFx: { base: 'GBP', quote: 'EUR', rate: 1.1, date: '2026-05-05' }, inflation: { provider: 'Eurostat', referenceMonth: '2026-05', referenceIndex: 100, index: 105, period: '2026-08' } };
  const actual = routeCosts.routeBudgetEstimate(costRow, familyInput, 3, adjustment, euroQuote, null, budgetNow);
  assert.equal(actual.inflationApplied, true); assert.ok(Math.abs(actual.hotel - 400 * 1.5 * 1.1 * 1.05) < 0.000001);
  for (const inflation of [{ ...adjustment.inflation, provider: 'World Bank', annualPercent: 50 }, { ...adjustment.inflation, referenceMonth: '2020-01' }, { ...adjustment.inflation, referenceIndex: -100 }, { ...adjustment.inflation, period: '2027-01' }]) {
    const result = routeCosts.routeBudgetEstimate(costRow, familyInput, 3, { ...adjustment, inflation }, euroQuote, null, budgetNow);
    assert.equal(result.inflationApplied, false); assert.equal(result.hotel, 720);
  }
  const expired = routeCosts.routeBudgetEstimate(costRow, familyInput, 3, null, { ...euroQuote, date: '2026-09-01' }, null, budgetNow);
  assert.equal(expired.total, null); assert.equal(expired.hotel, null);
  const wrongPair = routeCosts.routeBudgetEstimate(costRow, familyInput, 3, null, { ...euroQuote, quote: 'USD' }, null, budgetNow);
  assert.equal(wrongPair.total, null);
  const gbp = routeCosts.routeBudgetEstimate(costRow, { ...familyInput, currency: 'GBP' }, 3, null, null, null, budgetNow);
  assert.equal(gbp.hotel, 600);
});

test('Destination cost lookup never substitutes a country average or unrelated city', () => {
  assert.equal(routeCosts.routeCityBenchmark({ name: 'Bodrum', cityOrRegion: 'Bodrum', destinationCode: 'BJV' }), null);
  assert.equal(routeCosts.routeCityBenchmark({ name: 'Roma', destinationCode: 'FCO' }).city.en, 'Rome');
  assert.equal(routeCosts.routeCityBenchmark({ name: 'Tiranë', destinationCode: 'TIA' }).code, 'AL');
});

test('Preferences snapshot isolates ages, normalizes legacy premium and leaves old route payloads compatible', () => {
  const original = { ...input, accommodation: 'Otel', budget: 'Yüksek / premium', party: { adults: 2, children: 1, childAges: [4] }, currency: 'EUR' };
  const snapshot = load('mobile/src/lib/plannerState.ts').snapshotPlannerInput(original);
  original.party.childAges[0] = 9; original.party.adults = 1;
  assert.equal(snapshot.party.childAges[0], 4); assert.equal(snapshot.party.adults, 2); assert.equal(snapshot.tier, 'plus'); assert.equal(snapshot.budget, 'Plus');
  assert.equal(partyPreferences.normalizePlannerPreferences({ budget: 'Orta', who: 'Tek başıma' }).party.adults, 1);
  for (const party of [{ adults: 0, children: 1, childAges: [4] }, { adults: 20, children: 1, childAges: [4] }, { adults: 2, children: 1, childAges: [-1] }, { adults: 2, children: 2, childAges: [4] }]) assert.equal(partyPreferences.validTravelParty(party), false);
});

test('API validates family counts and ages, includes normalized tier and ages in the AI prompt, and enforces discovery duration', async () => {
  const city = load('lib/airport-search.ts').findAirportByIata('BJV').city;
  const endpoint = api({ enabled: true, generated: { routes: [{ name: city, country: 'Türkiye', dailyPlan: ['1','2','3','4'], scores: { overall: 85 } }] } });
  assert.equal((await endpoint.POST(request({ ...familyInput, party: { adults: 2, children: 1, childAges: [] } }))).status, 400);
  const response = await (await endpoint.POST(request(familyInput))).json();
  assert.equal(response.isFallback, false); assert.match(endpoint.prompts[0], /Plus: prioritise comfortable stays/); assert.match(endpoint.prompts[0], /2 adults, 1 children; child ages: 4/); assert.match(endpoint.prompts[0], /reduce pace for young children/);
  const discovery = await (await endpoint.POST(request({ ...familyInput, mode: 'discover', destination: undefined, dayCount: 7, locale: 'sq' }))).json();
  assert.equal(discovery.isFallback, true); assert.equal(discovery.data.routes.length, 3);
  for (const route of discovery.data.routes) { assert.equal(route.dailyPlan.length, 7); assert.match(route.dailyPlan[0], /pushime/); }
});


test('Malformed, impossible and future FX dates never become current converted costs', () => {
  for (const date of ['2026-10-40', 'not-a-date', '2026-10-05', '2026-10-02T12:00:00Z', '2026-09-31']) {
    const result = routeCosts.routeBudgetEstimate(costRow, familyInput, 3, null, { ...euroQuote, date }, null, budgetNow);
    assert.equal(result.total, null, date);
  }
});


test('Fresh and cached discovery reject malformed day content and keep duration consistent with the budget snapshot', async () => {
  const body = { ...familyInput, mode: 'discover', destination: undefined, dayCount: 4, locale: 'en' };
  const makePlan = days => ({ routes: ['Rome', 'Paris', 'London'].map(name => ({ name, country: 'Italy', dailyPlan: days, idealDuration: '10 days' })) });
  for (const cached of [false, true]) {
    const malformed = makePlan(['day one', ' ', null, 4]);
    const endpoint = api(cached ? { cached: malformed } : { enabled: true, generated: malformed });
    const result = await (await endpoint.POST(request(body))).json();
    assert.equal(result.isFallback, true); assert.equal(result.data.routes.length, 3);
    assert.ok(result.data.routes.every(route => route.dailyPlan.length === 4 && route.idealDuration === '4 days'));
    const valid = makePlan(['day one', 'day two', 'day three', 'day four']);
    const accepted = api(cached ? { cached: valid } : { enabled: true, generated: valid });
    const actual = await (await accepted.POST(request(body))).json();
    assert.equal(actual.isFallback, false); assert.ok(actual.data.routes.every(route => route.idealDuration === '4 days'));
  }
});


test('Cost lookup rejects contradictory titles, explicit unsupported cities and airport identities', () => {
  for (const route of [
    { name: 'Rome', cityOrRegion: 'Bodrum', destinationCode: 'BJV' },
    { name: 'Rome', cityOrRegion: 'Bodrum', destinationCode: 'FCO' },
    { name: 'Rome', cityOrRegion: 'Paris', destinationCode: 'CDG' },
    { name: 'Rome', cityOrRegion: 'Rome', destinationCode: 'BJV' },
    { name: 'Paris', cityOrRegion: 'Paris', destinationCode: 'FCO' },
  ]) assert.equal(routeCosts.routeCityBenchmark(route), null);
  assert.equal(routeCosts.routeCityBenchmark({ name: 'Romë', cityOrRegion: 'Romë', destinationCode: 'FCO' }).city.en, 'Rome');
});

test('Rome and Roma city searches rank real Italian airports first while explicit RMA remains Australia', () => {
  const airports = load('lib/airport-search.ts');
  for (const query of ['Rome', 'Roma']) {
    const results = airports.searchAirports(query);
    assert.equal(results[0].iata, 'FCO'); assert.equal(results[1].iata, 'CIA');
    assert.ok(results.slice(0, 2).every(row => row.countryCode === 'IT'));
    assert.ok(!results.some(row => row.iata === 'ROM'), 'Do not introduce a fictional metro airport record');
  }
  assert.equal(airports.searchAirports('RMA')[0].countryCode, 'AU');
});


test('City prices retain country identity and support only verified airport municipality aliases', () => {
  const airports = load('lib/airport-search.ts');
  const australian = airports.findAirportByIata('RMA');
  assert.equal(routeCosts.routeCityBenchmark({ name: australian.city, cityOrRegion: australian.city, destinationCode: 'RMA', country: australian.country }), null);
  for (const code of ['IST', 'SAW']) {
    const airport = airports.findAirportByIata(code);
    const row = routeCosts.routeCityBenchmark({ name: airport.city, cityOrRegion: airport.city, destinationCode: code, country: airport.country });
    assert.equal(row, null, 'The measured catalog has no Istanbul baseline; never substitute a European city');
  }
  assert.equal(routeCosts.routeCityBenchmark({ name: 'Roma', cityOrRegion: 'Roma', destinationCode: 'FCO', country: 'Italy' }).code, 'IT');
  assert.equal(routeCosts.routeCityBenchmark({ name: 'Tiranë', destinationCode: 'TIA', country: 'Shqipëri' }).code, 'AL');
});
