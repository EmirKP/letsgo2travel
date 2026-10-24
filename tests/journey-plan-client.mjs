import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, moduleTypes: { '**': 'cjs' }, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const model = require('../mobile/src/lib/mapJourney.ts');
const places = require('../lib/travel-assistant/places.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const request = { destination: { name: 'Tokyo', latitude: 35.68, longitude: 139.76, sourceUrl: 'https://maps.apple.com/place?place-id=tokyo' },
  dayCount: 2, startDate: '2026-11-01', locale: 'tr', party: 'family', budget: 'economical', pace: 'relaxed', walking: 'light',
  interests: ['culture', 'nature'], notes: 'Çocuklarla sakin bir gezi ve bol mola.' };
const venue = index => ({ id: `apple/venue${index}`, name: `Actual venue ${index}`, latitude: 35.68 + index * 0.0001,
  longitude: 139.76 + index * 0.0001, category: index <= 2 ? 'museum' : 'park', group: index <= 2 ? 'culture' : 'nature',
  kind: index <= 2 ? 'museum' : 'park', address: 'Tokyo', description: null, hours: null, free: null, accessible: null,
  representedCountry: null, website: null, fetchedAt: new Date().toISOString(), sourceUrl: `https://maps.apple.com/place?place-id=venue${index}` });
function response(input = request) {
  const { party, budget, pace, walking, interests, notes } = input;
  return { destination: clone(input.destination), dayCount: input.dayCount, startDate: input.startDate ?? null, preferences: { party, budget, pace, walking, interests: [...interests], notes },
    locale: input.locale, summary: 'Kültür ve doğa ilgilerine göre, ailece kolayca takip edilebilen iki gün.', generatedBy: 'ai', fetchedAt: new Date().toISOString(),
    attribution: 'Apple Maps', limitations: ['Ziyaret süreleri öneridir; yürüyüş süresi ayrıca hesaplanır.'], days: [
      { day: 1, theme: 'Kültür', explanation: 'Yakın müzeler ve mola.', stops: [1, 2].map(index => ({ place: venue(index), reason: 'Kültür ilgine uygun bir durak.', durationMinutes: 60 })) },
      { day: 2, theme: 'Doğa', explanation: 'Açık havada sakin bir gün.', stops: [3, 4].map(index => ({ place: venue(index), reason: 'Doğa ilgine uygun bir durak.', durationMinutes: 45 })) },
    ] };
}
function client(requestJson = async () => response(), environment = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync('mobile/src/lib/journeyPlanClient.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports = { './api': { requestJson }, '../../../lib/travel-assistant/places': places, './mapJourney': model };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Error, Date, JSON, crypto:webcrypto, TextEncoder, Uint8Array, setTimeout, clearTimeout, ...environment })(name => {
    if (name in imports) return imports[name]; throw Error(`Missing import ${name}`);
  }, output, output.exports);
  return output.exports;
}
function storageHarness() {
  const data = new Map();
  const localStorage = { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
  const window = new EventTarget(); Object.assign(window, { localStorage, setTimeout });
  globalThis.window = window; globalThis.localStorage = localStorage;
  return { storage: require('../mobile/src/lib/mapJourneyStorage.ts'), data };
}

test('Real AI response becomes a validated Apple map journey with every day, visit note and personalized planning field', () => {
  const api = client(), result = response();
  assert.equal(api.validateJourneyPlanResponse(result, request), result);
  const journey = api.journeyFromAiPlan(result);
  assert.equal(model.validateMapJourney(journey), true); assert.equal(journey.dayCount, 2); assert.equal(journey.city, 'Tokyo');
  assert.deepEqual(journey.stops.map(stop => [stop.place.id, stop.day, stop.order, stop.durationMinutes]), [['apple/venue1', 1, 0, 60], ['apple/venue2', 1, 1, 60], ['apple/venue3', 2, 0, 45], ['apple/venue4', 2, 1, 45]]);
  assert.deepEqual(clone(journey.planning.preferences), result.preferences); assert.equal(journey.planning.summary, result.summary);
  assert.equal(journey.planning.locale, 'tr'); assert.equal(journey.planning.generatedBy, 'ai'); assert.equal(journey.planning.edited, undefined);
  for (const stop of journey.stops) { assert.equal(stop.note, result.days[stop.day - 1].stops[stop.order].reason); assert.equal(stop.sourceUrl, stop.place.sourceUrl); assert.equal(stop.place.hours, null); }
  const saved = model.mapJourneyToSavedRoute(journey, 'tr');
  assert.deepEqual(model.mapJourneyFromSavedRoute(clone(saved)), clone(journey)); assert.equal(saved.input.budget, 'economical'); assert.equal(saved.input.who, 'family');
});

test('Client rejects old destination, locale, date, preference and interest echoes instead of applying a different survey', () => {
  const api = client();
  const edits = [value => { value.destination.name = 'Rome'; }, value => { value.destination.latitude += 0.001; }, value => { value.dayCount = 3; },
    value => { value.startDate = null; }, value => { value.locale = 'en'; }, value => { value.generatedBy = 'fallback'; },
    value => { value.destination.sourceUrl = 'https://evil.test'; },
    ...Object.entries({ party: 'solo', budget: 'comfortable', pace: 'busy', walking: 'standard', notes: 'Old request' }).map(([key, replacement]) => value => { value.preferences[key] = replacement; }),
    value => { value.preferences.interests.reverse(); }, value => { value.preferences.interests = ['shopping']; }];
  for (const edit of edits) { const value = response(); edit(value); assert.throws(() => api.validateJourneyPlanResponse(value, request), /invalid-plan|plan-mismatch/); }
  for (const locale of ['tr', 'en', 'sq']) {
    const input = { ...request, locale, startDate: null }; assert.equal(api.validateJourneyPlanResponse(response(input), input).locale, locale);
  }
});

test('Forged Apple identities and source links, duplicated venues, wrong days and distant coordinates never enter the saved plan', () => {
  const api = client();
  const edits = [value => { value.days[0].stops[0].place.sourceUrl = 'https://evil.test/place?place-id=venue1'; },
    value => { value.days[0].stops[0].place.sourceUrl = 'https://maps.apple.com/place?place-id=other'; },
    value => { value.days[0].stops[0].place.sourceUrl += '&redirect=https://evil.test'; },
    value => { value.days[0].stops[0].place.id = 'apple/../../bad'; },
    value => { value.days[0].stops[0].place.sourceUrl = 'javascript:alert(1)'; },
    value => { value.days[1].stops[0].place = clone(value.days[0].stops[0].place); },
    value => { value.days[0].day = 2; }, value => { value.days.pop(); }, value => { value.days[0].stops.pop(); },
    value => { value.days[0].stops[0].place.latitude = 40; }, value => { value.days[0].stops[0].place.longitude = '139.76'; },
    value => { value.days[0].stops[0].durationMinutes = 241; }, value => { value.days[0].stops[0].durationMinutes = 14; }, value => { value.days[0].stops[0].durationMinutes = '60'; },
    value => { value.days[0].theme = ' '; }, value => { value.days[0].explanation = ''; }, value => { value.days[0].stops[0].reason = ' '; },
    value => { value.days[0].stops[0].reason += '\u007f'; },
    value => { value.days[0].stops[0].reason = '<iframe>unsafe</iframe>'; }, value => { value.days[0].stops[0].place.imageUrl = 'https://evil.test/photo.jpg'; }];
  for (const edit of edits) { const value = response(); edit(value); assert.throws(() => api.validateJourneyPlanResponse(value, request), /invalid-plan/); }
});

test('Corrupt, stale and oversized planning metadata cannot bypass full journey validation', () => {
  const api = client();
  for (const edit of [value => { value.fetchedAt = '2020-01-01T00:00:00.000Z'; }, value => { value.fetchedAt = new Date(Date.now() + 120_000).toISOString(); },
    value => { value.fetchedAt = 'not-a-date'; }, value => { value.summary = ''; }, value => { value.limitations = Array.from({ length: 9 }, () => 'Too many'); },
    value => { value.preferences.notes = 'x'.repeat(1001); }, value => { value.days[0].theme = 'x'.repeat(121); }]) {
    const value = response(); edit(value); assert.throws(() => api.validateJourneyPlanResponse(value, request), /invalid-plan|plan-mismatch/);
  }
  const journey = api.journeyFromAiPlan(response());
  assert.equal(model.validateMapJourney({ ...journey, planning: { ...journey.planning, generatedBy: 'invented' } }), false);
  assert.equal(model.validateMapJourney({ ...journey, planning: { ...journey.planning, edited: 'yes' } }), false);
  assert.equal(model.validateMapJourney({ ...journey, planning: { ...journey.planning, days: [] } }), false);
});

test('Apple POIs and AI rationale survive actual guest/account storage, while each account keeps its own saved plans', () => {
  const h = storageHarness(), journey = client().journeyFromAiPlan(response());
  assert.equal(h.storage.saveMapJourney(journey).status, 'device');
  assert.deepEqual(h.storage.readMapJourneys().items, [clone(journey)]);
  assert.equal(h.storage.saveMapJourney(journey, 'account-a', 'tr').status, 'queued');
  const reread = h.storage.readMapJourneys('account-a'); assert.equal(reread.error, null); assert.deepEqual(reread.items, [clone(journey)]);
  assert.deepEqual(h.storage.readMapJourneys('account-b').items, []);
  assert.equal(reread.items[0].stops[0].place.sourceUrl, 'https://maps.apple.com/place?place-id=venue1');
  assert.equal(reread.items[0].planning.preferences.notes, request.notes);
  const corrupt = JSON.parse(h.data.get('l2t.mobile.saved-routes.v1.user-account-a')); corrupt[0].plan.routes[0].mapJourney.stops[0].place.sourceUrl = 'https://maps.apple.com/place?place-id=someone-else';
  h.data.set('l2t.mobile.saved-routes.v1.user-account-a', JSON.stringify(corrupt));
  assert.equal(h.storage.readMapJourneys('account-a').error, 'corrupt'); assert.throws(() => h.storage.saveMapJourney(journey, 'account-a'), /corrupt/);
  assert.deepEqual(h.storage.readMapJourneys().items, [clone(journey)]);
});

test('Editing an AI itinerary preserves its original explanation and preferences but marks the route as edited', () => {
  const original = client().journeyFromAiPlan(response()), originalSnapshot = clone(original);
  const changed = model.updateJourneyStop(original, original.stops[0].id, { note: 'My own note', durationMinutes: 90 });
  assert.equal(changed.planning.edited, true); assert.deepEqual(clone(changed.planning.preferences), response().preferences);
  assert.equal(changed.planning.summary, original.planning.summary); assert.equal(changed.stops[0].note, 'My own note'); assert.deepEqual(clone(original), originalSnapshot);
  const saved = model.mapJourneyToSavedRoute(changed, 'en'); assert.equal(saved.plan.routes[0].why, 'Your editable daily map itinerary.');
  assert.deepEqual(model.mapJourneyFromSavedRoute(clone(saved)), clone(changed));
  const moved = model.moveJourneyStop(original, original.stops[0].id, 2); assert.equal(moved.planning.edited, true); assert.equal(moved.stops.find(s => s.id === original.stops[0].id).day, 2);
  const removed = model.removeJourneyStop(original, original.stops[0].id); assert.equal(removed.planning.edited, true); assert.equal(removed.stops.length, 3);
  assert.equal(original.planning.edited, undefined);
});

test('Generation forwards the exact survey, current bearer and cancellation signal once with a bounded request timeout', async () => {
  const calls = [], controller = new AbortController();
  const api = client(async (path, options) => { calls.push({ path, options }); return response(); });
  const result = await api.generateJourneyPlan(request, 'current-session', controller.signal,'owner'); assert.equal(result.generatedBy, 'ai');
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/api/travel-assistant/journey-plan?quotaVersion=2'); assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(clone(calls[0].options.body), { ...request, placeCategoryVersion: 2 }); assert.equal(calls[0].options.signal, controller.signal); assert.ok(calls[0].options.timeoutMs<=55_000 && calls[0].options.timeoutMs>54_000);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer current-session');
  await assert.rejects(api.generateJourneyPlan(request, '', controller.signal,'owner'),{code:'plan_sign_in'});
  await assert.rejects(api.generateJourneyPlan(request, 'session', controller.signal),{code:'plan_sign_in'});assert.equal(calls.length,1);
  let attempts = 0; const failure = new Error('plan_limit');
  await assert.rejects(client(async () => { attempts++; throw failure; }).generateJourneyPlan(request, 'session', controller.signal,'owner'), error => error === failure);
  assert.equal(attempts, 1); assert.equal(request.notes, 'Çocuklarla sakin bir gezi ve bol mola.');
});

test('Daily provider capacity and future service errors propagate once without polling, preserving the operation for a deliberate retry', async () => {
  for (const code of ['plan_daily_capacity', 'plan_busy', 'future_service_error']) {
    const values = new Map(), calls = [], signal = new AbortController().signal;
    const localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const failure = Object.assign(Error('Service unavailable'), { status: 503, code });
    const api = client(async (_path, options) => { calls.push(options); throw failure; }, { localStorage });
    await assert.rejects(api.generateJourneyPlan(request, 'current-token', signal, 'capacity-owner'), error => error === failure);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1); assert.equal(values.size, 1);
    const recovered = client(async (_path, options) => { calls.push(options); return response(); }, { localStorage });
    const result = await recovered.generateJourneyPlan(request, 'rotated-token', signal, 'capacity-owner');
    assert.equal(result.generatedBy, 'ai'); assert.equal(calls.length, 2);
    assert.equal(calls[1].headers['Idempotency-Key'], calls[0].headers['Idempotency-Key']);
    assert.equal(values.size, 1); assert.equal(request.notes, 'Çocuklarla sakin bir gezi ve bol mola.');
  }
});

test('Lost response keeps a durable owner-scoped operation across reload and token rotation; success retains recovery and edits rotate it', async()=>{
  const values=new Map(),ids=[];
  const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const signal=new AbortController().signal;
  const offline=async(_path,options)=>{ids.push(options.headers['Idempotency-Key']);throw Error('response lost');};
  await assert.rejects(client(offline,{localStorage}).generateJourneyPlan(request,'token-a',signal,'owner-a'));
  await assert.rejects(client(offline,{localStorage}).generateJourneyPlan(request,'rotated-token',signal,'owner-a'));assert.equal(ids[0],ids[1]);
  const recovered=response();recovered.fetchedAt=new Date(Date.now()-60*60_000).toISOString();
  const api=client(async(_path,options)=>{ids.push(options.headers['Idempotency-Key']);return recovered;},{localStorage});
  assert.equal((await api.generateJourneyPlan(request,'new-token',signal,'owner-a')).fetchedAt,recovered.fetchedAt);assert.equal(ids[2],ids[0]);assert.equal(values.size,1);
  await api.generateJourneyPlan(request,'new-token',signal,'owner-a');assert.equal(ids[3],ids[0]);
  const failed=client(offline,{localStorage});await assert.rejects(failed.generateJourneyPlan(request,'token-a',signal,'owner-a'));
  await assert.rejects(failed.generateJourneyPlan({...request,notes:'Different wishes'},'token-a',signal,'owner-a'));assert.notEqual(ids.at(-1),ids.at(-2));
  await assert.rejects(failed.generateJourneyPlan(request,'token-b',signal,'owner-b'));assert.notEqual(ids.at(-1),ids[4]);
  for(const value of values.values()){assert.ok(!value.includes('token'));assert.ok(!value.includes('Different wishes'));assert.ok(!value.includes(request.notes));}
});

test('Confirmed pending generation polls the same operation, while cancellation and transport errors do not resubmit blindly', async()=>{
  const ids=[];let count=0;const signal=new AbortController().signal;
  const api=client(async(_path,options)=>{ids.push(options.headers['Idempotency-Key']);if(++count===1)throw Object.assign(Error('pending'),{code:'plan_pending'});return response();},{setTimeout:fn=>setTimeout(fn,0)});
  assert.equal((await api.generateJourneyPlan(request,'token',signal,'owner')).generatedBy,'ai');assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
  const controller=new AbortController();let calls=0;
  await assert.rejects(client(async()=>{calls++;controller.abort();throw Object.assign(Error('pending'),{code:'plan_pending'});}).generateJourneyPlan(request,'token',controller.signal,'owner'));assert.equal(calls,1);
});


test('First-day start and expanded interests are checked against the request and persist in the saved schedule', () => {
  const api = client(), input = { ...request, firstDayStartTime: '15:30', interests: ['city', 'sea', 'adventure', 'nature'] };
  const result = { ...response(input), firstDayStartTime: input.firstDayStartTime };
  assert.equal(api.validateJourneyPlanResponse(result, input), result);
  assert.throws(() => api.validateJourneyPlanResponse({ ...result, firstDayStartTime: '09:00' }, input));
  assert.throws(() => api.validateJourneyPlanResponse(response(input), input));
  const journey = api.journeyFromAiPlan(result);
  assert.equal(journey.firstDayStartTime, '15:30');
  assert.deepEqual([...journey.planning.preferences.interests], input.interests);
  assert.equal(model.scheduleJourneyDay(journey, 1).stops[0].startMinutes, 930);
  assert.equal(model.mapJourneyFromSavedRoute(model.mapJourneyToSavedRoute(journey)).firstDayStartTime, '15:30');
});

test('Allowance reads use the current bearer without generating a route and reject forged counts or reset times', async()=>{
  const reset=new Date();reset.setUTCHours(24,0,0,0);
  const valid={limit:3,used:0,remaining:3,pending:false,resetAt:reset.toISOString(),timeZone:'UTC'};
  const calls=[],signal=new AbortController().signal,api=client(async(...args)=>{calls.push(args);return valid;});
  assert.deepEqual(clone(await api.loadJourneyPlanQuota('rotated-token',signal)),valid);
  assert.equal(calls[0][0],'/api/travel-assistant/journey-plan?quotaVersion=2');assert.equal(calls[0][1].headers.Authorization,'Bearer rotated-token');
  assert.equal(calls[0][1].signal,signal);assert.equal(calls[0][1].method,undefined);assert.equal(calls[0][1].timeoutMs,8000);
  await assert.rejects(api.loadJourneyPlanQuota('',signal),{code:'plan_sign_in'});assert.equal(calls.length,1);
  for(const changes of [{limit:2},{limit:4},{used:'0'},{used:-1},{used:4},{used:0.5},{used:NaN},{used:Infinity},{used:1},{pending:true},{remaining:2},{timeZone:'Europe/Istanbul'},{resetAt:'invalid'},{resetAt:new Date(Date.now()+3600_000).toISOString()},{resetAt:'2020-01-01T00:00:00Z'}])assert.throws(()=>api.validateJourneyPlanQuota({...valid,...changes}),/invalid-plan-quota/);
  assert.equal(api.validateJourneyPlanQuota({...valid,pending:true,remaining:0}).used,0);
  for (let used=0;used<=3;used++) {
    assert.equal(api.validateJourneyPlanQuota({...valid,used,remaining:3-used}).remaining,3-used);
    assert.equal(api.validateJourneyPlanQuota({...valid,used,remaining:0,pending:true}).remaining,0);
  }
  assert.equal(api.validateJourneyPlanQuota({...valid,limit:1,used:0,remaining:1}).limit,1,'A staged server rollout still accepts the previous allowance contract');
  assert.equal(api.validateJourneyPlanQuota({...valid,limit:1,used:1,remaining:0}).remaining,0);
});

test('Successful map response retains exact owner-scoped recovery across reload, while edits and other accounts cannot reuse it',async()=>{
  const values=new Map(),ids=[],localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const transport=async(_path,options)=>{ids.push(options.headers['Idempotency-Key']);return response();};
  await client(transport,{localStorage}).generateJourneyPlan(request,'token-a',new AbortController().signal,'owner-a');
  const reopened=client(transport,{localStorage});
  assert.equal(reopened.hasPendingJourneyPlan('owner-a'),true);
  assert.equal(await reopened.hasJourneyPlanRecovery(request,'owner-a'),true);
  assert.equal(await reopened.hasJourneyPlanRecovery({...request,notes:'Edited'},'owner-a'),false);
  assert.equal(await reopened.hasJourneyPlanRecovery(request,'owner-b'),false);
  await reopened.generateJourneyPlan(request,'token-rotated',new AbortController().signal,'owner-a');assert.equal(ids[1],ids[0]);
});

function legacyClient(fetch,localStorage) {
  const source=ts.transpileModule(readFileSync('mobile/src/lib/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const result={exports:{}},imports={'./capacitor':{isNativePlatform:()=>false},'./config':{config:{apiBaseUrl:'https://fixture.test'}},'./i18n':{localeFromStorage:()=> 'en'}};
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Error,Date,Intl,JSON,URL,AbortController,DOMException,crypto:webcrypto,TextEncoder,Uint8Array,fetch,setTimeout,clearTimeout,window:{localStorage,setTimeout,clearTimeout}})(name=>{assert.ok(name in imports,name);return imports[name];},result,result.exports);
  return result.exports;
}
const legacyInput={origin:'Istanbul',days:'3 gün',dayCount:3,month:'Ekim',budget:'Orta',accommodation:'Otel',who:'Tek başıma',tempo:'Dengeli',vibe:['Kültür'],visa:'Fark etmez'};
test('Legacy planner authenticates before transport and retains successful or uncertain idempotent recovery without storing tokens',async()=>{
  const values=new Map(),calls=[],localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  let fail=true;
  const transport=async(url,options)=>{calls.push({url,options});if(fail)throw Error('lost response');return Response.json({success:true,data:{routes:[{name:'Rome',country:'Italy'}]}});};
  const api=legacyClient(transport,localStorage);
  await assert.rejects(api.generateRoutePlan(legacyInput,'en'),{code:'plan_sign_in'});assert.equal(calls.length,0);
  const account={ownerId:'account-a',accessToken:'first-token',signal:new AbortController().signal};
  await assert.rejects(api.generateRoutePlan(legacyInput,'en',account));assert.equal(calls.length,1);
  fail=false;const fresh=legacyClient(transport,localStorage);
  assert.equal(await fresh.hasRoutePlanRecovery(legacyInput,'en','account-a'),true);
  assert.equal(await fresh.hasRoutePlanRecovery({...legacyInput,dayCount:4},'en','account-a'),false);
  assert.equal(await fresh.hasRoutePlanRecovery(legacyInput,'en','account-b'),false);
  const result=await fresh.generateRoutePlan(legacyInput,'en',{...account,accessToken:'rotated-token'});assert.equal(result.data.routes[0].name,'Rome');
  assert.equal(calls[1].options.headers.Authorization,'Bearer rotated-token');assert.equal(calls[1].options.headers['Idempotency-Key'],calls[0].options.headers['Idempotency-Key']);
  const afterSuccess=legacyClient(transport,localStorage);await afterSuccess.generateRoutePlan(legacyInput,'en',account);
  assert.equal(calls[2].options.headers['Idempotency-Key'],calls[0].options.headers['Idempotency-Key']);
  for(const stored of values.values())assert.doesNotMatch(stored,/first-token|rotated-token|Istanbul/);
});

test('Legacy planner malformed response keeps recovery and a changed request receives a distinct operation',async()=>{
  const values=new Map(),ids=[],localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const api=legacyClient(async(_url,options)=>{ids.push(options.headers['Idempotency-Key']);return Response.json({success:true,data:null});},localStorage);
  const account={ownerId:'account-a',accessToken:'token'};
  assert.equal((await api.generateRoutePlan(legacyInput,'en',account)).data,null);
  assert.equal(api.hasPendingRoutePlan('account-a'),true);
  await api.generateRoutePlan({...legacyInput,dayCount:4},'en',account);assert.notEqual(ids[0],ids[1]);
});

test('Legacy sign-in draft is claimed by one owner across remounts, recovery drafts isolate owners, and failed removal cannot replay private inputs',()=>{
  const values=new Map();let removalFails=false;
  const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>{if(removalFails)throw Error('blocked');values.delete(k);}};
  function drafts(){
    const output={exports:{}},source=ts.transpileModule(readFileSync('mobile/src/lib/plannerSignInDraft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Date,JSON,window:{localStorage}})(()=>({validTravelParty:()=>true}),output,output.exports);return output.exports;
  }
  const value={form:legacyInput,origin:null,destination:null},api=drafts();
  assert.equal(api.preparePlannerSignInDraft(value),true);assert.equal(api.takePlannerSignInDraft(null),null);
  assert.deepEqual(clone(drafts().takePlannerSignInDraft('owner-a')),value);assert.equal(drafts().takePlannerSignInDraft('owner-b'),null);
  assert.deepEqual(clone(drafts().takePlannerSignInDraft('owner-a')),value,'The committed owner can resume after another component remount');
  api.savePlannerRecoveryDraft('owner-a',value);assert.equal(drafts().readPlannerRecoveryDraft('owner-b'),null);
  assert.deepEqual(clone(drafts().readPlannerRecoveryDraft('owner-a')),value);
  assert.equal(api.clearPlannerRecoveryDraft('owner-a'),true);assert.equal(drafts().readPlannerRecoveryDraft('owner-a'),null);
  api.preparePlannerSignInDraft(value);removalFails=true;assert.equal(drafts().takePlannerSignInDraft('owner-a'),null);
});
