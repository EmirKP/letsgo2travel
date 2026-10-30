import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
function modules(overrides = {}, globalOverrides = {}) {
  const cache = new Map();
  const globals = { Date, Intl, URL, URLSearchParams, Request, Response, Headers, AbortSignal, AbortController, Buffer, setTimeout, clearTimeout,
    process: { env: {} }, fetch: () => { throw Error('Network prohibited in Romanian regression tests'); }, ...globalOverrides };
  const load = filename => {
    let full = path.resolve(filename); if (!existsSync(full)) full += '.ts';
    if (cache.has(full)) return cache.get(full).exports;
    const testModule = { exports: {} }; cache.set(full, testModule);
    if (full.endsWith('.json')) { testModule.exports = JSON.parse(readFileSync(full, 'utf8')); return testModule.exports; }
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, globals)(id => {
      if (Object.hasOwn(overrides, id)) return overrides[id];
      return id.startsWith('@/') ? load(id.slice(2)) : id.startsWith('.') ? load(path.resolve(path.dirname(full), id)) : require(id);
    }, testModule, testModule.exports);
    return testModule.exports;
  };
  return load;
}

test('Server copy uses the Romanian static catalog immediately and preserves dynamic private values', () => {
  const copy = modules()('lib/locale-copy.ts').translateAppCopy;
  assert.equal(copy('ro', 'Hata', 'A valid location is required.'), 'Este necesară o locație validă.');
  const result = copy('ro', '', 'Your Private Name Ω flight is approaching. Check the saved schedule in Cockpit.');
  assert.match(result, /^Zborul tău Private Name Ω se apropie/);
  assert.equal(copy('tr', 'Türkçe', 'English', 'Shqip'), 'Türkçe'); assert.equal(copy('sq', 'Türkçe', 'English', 'Shqip'), 'Shqip');
});

test('Romanian starter descriptions, days and passport labels do not depend on a lazy client dictionary', () => {
  const load = modules();
  const starter = load('lib/route-planner.ts').fixedDestinationStarter({ origin: 'İstanbul', destination: { code: 'FCO', name: 'Roma', country: 'Italia', countryCode: 'IT' }, dayCount: 3, budget: 'Orta', vibe: ['Kültür'], who: 'Tek başıma', tempo: 'Rahat' }, 'ro');
  assert.match(starter.routes[0].why, /^Aceasta este o schiță/);
  assert.match(starter.routes[0].dailyPlan[0], /^Ziua 1: Roma/);
  assert.match(starter.routes[0].dailyPlan[0], /Ajungi, mergi la cazare/);
  assert.match(starter.routes[0].dailyPlan[2], /Încheie explorarea/);
  const passport = load('lib/planner-passport.ts');
  assert.match(passport.plannerPassportLabel({ passportCountry: 'TR', passportType: 'ordinary' }, 'ro'), /Turcia/);
  assert.equal(passport.plannerPassportLabel({ passportCountry: '', passportType: '' }, 'ro'), 'Pașaport neselectat');
});

test('Shared planner Romanian copy stays small and leaves unknown user text untouched', () => {
  const source = readFileSync('lib/planner-copy.ts', 'utf8');
  const ast = ts.createSourceFile('lib/planner-copy.ts', source, ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter(ts.isImportDeclaration).map(node => node.moduleSpecifier.text);
  assert.deepEqual(imports, ['../mobile/src/lib/locale']);
  assert.ok(Buffer.byteLength(source) < 12000, 'The shared planner must not embed the full Romanian catalog');
  assert.ok(!source.includes('locales/ro') && !source.includes('outputs/'));
  for (const file of ['lib/planner-passport.ts', 'lib/planner-preferences.ts', 'lib/route-planner.ts']) {
    const text = readFileSync(file, 'utf8');
    assert.match(text, /from '\.\/planner-copy'/);
    assert.ok(!text.includes('./locale-copy'));
  }
  const copy = modules()('lib/planner-copy.ts').translateAppCopy;
  assert.equal(copy('ro', '', 'Passport not selected'), 'Pașaport neselectat');
  assert.equal(copy('ro', '', 'Day 14'), 'Ziua 14');
  assert.equal(copy('ro', '', 'Private origin Ω → Private destination λ: a 14-day starter outline for your chosen destination.'), 'Private origin Ω → Private destination λ: o schiță inițială de 14 zile pentru destinația aleasă.');
  assert.equal(copy('ro', '', 'Private record Ω with unknown English text'), 'Private record Ω with unknown English text');
});

test('The real AI-plan request parser retains Romanian and its free fixed starter returns Romanian copy', async () => {
  const load = modules({ 'next/server': { NextResponse: Response }, '@google/genai': { GoogleGenAI: class { constructor() { throw Error('Provider prohibited'); } } }, '@/lib/supabaseAdmin': { getSupabaseAdmin: () => null },
    '@/lib/ai-route-quota': { aiRouteReply: (body, status = 200, headers = {}) => Response.json(body, { status, headers }), aiRouteErrorReply: () => { throw Error('Unexpected quota path'); } } });
  const route = load('app/api/ai-plan/route.ts');
  const response = await route.POST(new Request('https://local.test/api/ai-plan', { method: 'POST', body: JSON.stringify({ locale: 'ro', mode: 'fixed', destination: { code: 'FCO' }, origin: 'İstanbul', dayCount: 3, party: { adults: 2, children: 0, childAges: [] } }) }));
  assert.equal(response.status, 200); const body = await response.json();
  assert.equal(body.isFallback, true); assert.match(body.data.routes[0].why, /^Aceasta este o schiță/);
  assert.match(body.data.routes[0].dailyPlan[0], /^Ziua 1:/);
});

test('Romanian forum requests and journey prompts preserve the requested target language', () => {
  const load = modules();
  assert.equal(load('lib/community/translation.ts').parseForumTranslationRequest({ text: 'Private user text', targetLanguage: 'ro' }).targetLanguage, 'ro');
  const labels = load('lib/travel-assistant/journey-plan-labels.ts');
  assert.equal(labels.journeyInterestLabel('food', 'ro'), 'mâncare și băuturi');
  const prompt = load('lib/travel-assistant/journey-plan-groq.ts').buildGroqJourneyRequest({ destination: { name: 'Roma', latitude: 41.9, longitude: 12.5 }, locale: 'ro', dayCount: 1, party: 'solo', budget: 'balanced', pace: 'balanced', walking: 'light', interests: ['culture'], notes: '' }, [{ id: 'node/1', name: 'Actual venue name', latitude: 41.9, longitude: 12.5, group: 'culture', category: 'museum', kind: 'museum', free: null, accessible: null, sourceUrl: 'https://www.openstreetmap.org/node/1', fetchedAt: new Date().toISOString() }], [300]);
  assert.match(JSON.stringify(prompt.body), /Romanian \(România\)/);
  assert.match(readFileSync('app/api/country-community/translate/route.ts', 'utf8'), /targetLanguage === 'ro' \? 'Romanian/);
});

test('Romanian flight start notifications keep their locale and destination without translating user titles', () => {
  const load = modules(); const title = 'Private destination Ω';
  const payload = load('lib/live-activity-cron.ts').buildStartPayload({ id: 'synthetic-trip', userId: 'synthetic-owner', title, departureAtMs: Date.now() + 60000, language: 'ro' });
  assert.equal(payload.attributes.language, 'ro'); assert.equal(payload.attributes.title, title);
  assert.equal(payload.alert.title, 'Zborul tău se apropie ✈️'); assert.match(payload.alert.body, /Private destination Ω/);
  const mail = load('lib/account-deletion-notification.ts').completionMail({ locale: 'ro', recipient_email: 'test@example.invalid', request_id: 'synthetic-request' });
  assert.equal(mail.subject, 'Contul tău LetsGo2Travel a fost șters'); assert.match(mail.html, /Contul tău a fost șters/);
});

test('Romanian event dates and native accepted languages stay consistent', () => {
  const times = modules()('lib/event-time.ts');
  assert.equal(times.eventDateLabel({ startsAt: '' }, 'ro-RO'), 'Data nu a fost anunțată');
  assert.equal(times.eventTimeLabel({ startsAt: '2030-01-01', timePrecision: 'date' }, 'ro-RO'), 'Ora nu a fost anunțată');
  const widget = readFileSync('ios/App/FlightActivityWidget/FlightActivityWidget.swift', 'utf8');
  assert.match(widget, /case tr, en, sq, ro/); assert.match(widget, /ro_RO/);
  const english = [...widget.matchAll(/\.text\("(?:[^"\\]|\\.)*",\s*"((?:[^"\\]|\\.)*)",/g)].map(match => match[1]);
  for (const text of english) assert.ok(widget.includes(`"${text}":`), `Missing native Romanian label ${text}`);
  assert.match(readFileSync('ios/App/App/FlightLiveActivityPlugin.swift', 'utf8'), /\["tr", "en", "sq", "ro"\]\.contains/g);
  assert.match(readFileSync('lib/maps/map-place-search.ts', 'utf8'), /ro: 'ro-RO'/);
});

test('Romanian live recommendations retain their language for every weather branch', async () => {
  let weatherCode = 0;
  const load = modules({ 'next/server': { NextResponse: Response } }, { fetch: async () => Response.json({ timezone: 'Europe/Bucharest', current: { temperature_2m: 20, apparent_temperature: 19, precipitation: 0, weather_code: weatherCode, time: '2030-05-01T10:00' } }) });
  const route = load('app/api/travel-now/route.ts');
  for (const [code, expected] of [[0, 'Senin'], [2, 'Parțial noros'], [45, 'Ceață'], [51, 'Ploios'], [71, 'Ninsoare'], [80, 'Averse'], [95, 'Furtunos']]) {
    weatherCode = code;
    const response = await route.POST(new Request('https://local.test/api/travel-now', { method: 'POST', body: JSON.stringify({ latitude: 44.43, longitude: 26.1, locale: 'ro' }) }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.weather.description, expected);
    assert.match(body.data.privacy, /^Locația ta/);
    assert.ok(body.data.recommendations.length > 0);
    assert.ok(body.data.recommendations.every(item => !/^(Check|Explore|Visit|Enjoy|Take|Walk|Try|A nearby|A short|Look)/.test(item.title)));
  }
});

test('The prepared Romanian migration accepts all four languages without rewriting existing rows', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid); create table public.trips(app_language text); create table public.trip_flight_provider_data(trip_id uuid); create table public.support_issues(locale text); create table public.account_deletion_jobs(locale text); create table public.kvkk_requests(user_id uuid,request_locale text); insert into public.trips values ('tr');`);
    const sql = readFileSync('supabase/migrations/20261030160000_romanian_app_language.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec(`insert into public.trips values ('ro'),('sq'),('en'); insert into public.support_issues values ('ro'); insert into public.account_deletion_jobs values ('ro');`);
    assert.equal((await db.query('select count(*)::int n from public.trips')).rows[0].n, 4);
    await assert.rejects(db.exec(`insert into public.trips values ('xx')`), /check constraint/);
    assert.match(sql, /service role required/); assert.match(sql, /for update/i);
    assert.match(sql, /p_app_language not in \('tr', 'en', 'sq', 'ro'\)/);
  } finally { await db.close(); }
});
