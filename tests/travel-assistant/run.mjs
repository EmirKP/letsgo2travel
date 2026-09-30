import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly:true, compilerOptions:{module:'CommonJS',moduleResolution:'node'} });
const { emergencyContacts,dialUrl,EMERGENCY_CONTACTS } = require('../../lib/travel-assistant/emergency.ts');
const { coordinates,coarseLocation,normalizePlaces,filterPlaces,overpassQuery,safeWebsite } = require('../../lib/travel-assistant/places.ts');
const { makeQuote,parseAmount } = require('../../lib/travel-assistant/money.ts');
const { embassiesFor,GUIDE_CARDS,EMBASSIES } = require('../../lib/travel-assistant/guides.ts');
const { evidenceStatus,dateStamp } = require('../../lib/travel-assistant/evidence.ts');
const { validateQuote,validatePlaces,createPlacesLoader,PLACES_MAX_AGE_MS } = require('../../lib/travel-assistant/responses.ts');
test('Unknown country never inherits emergency numbers; calls contain a single number',()=>{
  assert.deepEqual(emergencyContacts('ZZ'),[]);
  assert.equal(emergencyContacts('DE').find(x=>x.category==='police').number,'110');
  assert.equal(dialUrl('112/911'),null);
  assert.equal(dialUrl('javascript:alert(1)'),null);
  assert.equal(dialUrl('+4930275850'),'tel:+4930275850');
});
test('Coordinates reject coercion and query injection; provider only receives coarse location',()=>{
  assert.equal(coordinates({latitude:'52.5',longitude:13.4}),null);
  assert.equal(coordinates({latitude:NaN,longitude:13}),null);
  assert.equal(coordinates({latitude:86,longitude:13}),null);
  assert.deepEqual(coarseLocation({latitude:52.512345,longitude:13.412345}),{latitude:52.51,longitude:13.41});
  const query=overpassQuery({latitude:52.512345,longitude:13.412345},'needs');
  assert.ok(query.includes('around:3000,52.51,13.41'));
  assert.ok(query.includes('out center tags 250'));
  assert.throws(()=>overpassQuery({latitude:52,longitude:13},'injected'));
});
test('POI modes are separate, malformed and duplicate points rejected, missing attributes stay unknown',()=>{
  const raw={elements:[
    {type:'node',id:1,lat:52.5,lon:13.4,tags:{amenity:'pharmacy',name:'Apotheke'}},
    {type:'node',id:1,lat:52.5,lon:13.4,tags:{amenity:'pharmacy'}},
    {type:'way',id:2,center:{lat:52.51,lon:13.41},tags:{tourism:'museum',fee:'no',wheelchair:'yes',opening_hours:'24/7'}},
    {type:'node',id:3,lat:999,lon:13,tags:{amenity:'police'}},
  ]};
  const needs=normalizePlaces(raw,'needs','2026-09-16');
  assert.equal(needs.length,1);assert.equal(needs[0].free,null);assert.equal(needs[0].hours,null);
  assert.equal(filterPlaces(needs,{free:true},{latitude:52.5,longitude:13.4}).length,0);
  const explore=normalizePlaces(raw,'explore','2026-09-16');
  assert.equal(explore.length,1);assert.equal(explore[0].category,'museum');
  assert.equal(filterPlaces(explore,{free:true,accessible:true,alwaysOpen:true},{latitude:52.5,longitude:13.4}).length,1);
  assert.equal(safeWebsite('javascript:alert(1)'),null);
  assert.equal(safeWebsite('https://user:password@example.com'),null);
  assert.equal(safeWebsite('https://127.0.0.1'),null);
});
test('Consulates require both citizenship and destination; evidence accompanies all guide cards',()=>{
  assert.equal(embassiesFor('TR','DE').length,1);
  assert.equal(embassiesFor('US','DE').length,0);
  assert.equal(embassiesFor('TR','ZZ').length,0);
  for(const card of GUIDE_CARDS){assert.match(card.sourceUrl,/^https:\/\//);assert.match(card.verifiedAt,/^\d{4}-\d{2}-\d{2}$/);}
});
test('FX pairs, previous trading day, rise/fall and staleness are deterministic',()=>{
  const now=new Date('2026-09-16T12:00:00Z');
  const point=(date,rate,base='EUR',quote='TRY')=>({date,rate,base,quote});
  const rate=makeQuote([point('2026-09-14',40),point('2026-09-15',44),point('2026-09-17',99),point('2026-09-16',80,'USD')],'EUR','TRY',now);
  assert.equal(rate.rate,44);assert.equal(rate.previousRate,40);assert.ok(Math.abs(rate.changePercent-10)<0.00001);
  assert.equal(makeQuote([point('2026-09-15',44),point('2026-09-16',22)],'EUR','TRY',now).changePercent,-50);
  assert.equal(makeQuote([point('2026-09-01',40)],'EUR','TRY',now),null);
  assert.equal(makeQuote([point('2026-09-16',Infinity)],'EUR','TRY',now),null);
  assert.equal(makeQuote([point('2026-02-30',40)],'EUR','TRY',new Date('2026-03-01')),null);
  assert.equal(makeQuote([point('2026-09-15',40)],'EUR','TRY',now).changePercent,null);
});
test('Calculator handles Turkish decimals and rejects ambiguous grouped or invalid input',()=>{
  assert.equal(parseAmount('12,50'),12.5);assert.equal(parseAmount('12.50'),12.5);
  for(const text of ['1.234,56','-1','Infinity','', '1000000001'])assert.equal(parseAmount(text),null);
});

test('All 47 priority countries have sourced, single-number emergency records without invented coverage',()=>{
  const priority='TR DE FR IT ES PT NL BE CH AT GR GB IE DK SE NO FI PL CZ HU HR RS BA ME AL XK GE AZ AE SA QA EG MA TN US CA MX JP KR TH SG MY ID VN IN AU NZ'.split(' ');
  assert.deepEqual([...new Set(EMERGENCY_CONTACTS.map(c=>c.country))].sort(),priority.sort());
  const keys=new Set();
  for(const c of EMERGENCY_CONTACTS){
    const key=`${c.country}:${c.category}`;
    assert.ok(!keys.has(key),key);keys.add(key);
    assert.ok(dialUrl(c.number),key);
    assert.ok(['www.gov.uk','www.malaysia.gov.my'].includes(new URL(c.sourceUrl).hostname),key);
    assert.equal(evidenceStatus(c,new Date('2026-09-26T12:00:00Z')),'checked');
  }
  assert.equal(emergencyContacts(' my ').find(c=>c.category==='fire').number,'999');
  assert.equal(emergencyContacts('ME').length,1);
  assert.ok(emergencyContacts('SA').every(c=>c.note?.tr && c.note?.en));
  assert.equal(emergencyContacts('MA').find(c=>c.category==='gendarmerie').number,'177');
});
test('Mission cards preserve jurisdiction and WhatsApp restrictions',()=>{
  assert.equal(EMBASSIES.length,50);
  assert.equal(new Set(EMBASSIES.map(e=>e.hostCountry)).size,46);
  assert.equal(new Set(EMBASSIES.map(e=>e.id)).size,50);
  for(const e of EMBASSIES){
    assert.equal(e.representedCountry,'TR'); assert.match(e.phone,/^\+[1-9]\d{7,14}$/);
    if(e.emergencyPhone)assert.match(e.emergencyPhone,/^\+[1-9]\d{7,14}$/);
    assert.ok(new URL(e.sourceUrl).hostname.endsWith('.mfa.gov.tr'));
    assert.ok(e.name.tr && e.name.en && e.address);
    assert.equal(evidenceStatus(e,new Date('2026-09-26')),'checked');
  }
  assert.equal(embassiesFor('tr','id')[0].emergencyChannel,'whatsapp');
  assert.ok(embassiesFor('TR','NL')[0].note);
  assert.equal(embassiesFor('TR','TR').length,0);
});
test('Freshness respects calendar dates, midnight expiry and review dates without inventing verification',()=>{
  const evidence={sourceUrl:'https://example.com',verifiedAt:'2026-09-26',reviewAfter:'2026-12-25'};
  assert.equal(dateStamp('2026-02-30'),null);
  assert.equal(evidenceStatus({...evidence,verifiedAt:'2026-09-27'},new Date('2026-09-26')),'unverified');
  assert.equal(evidenceStatus({...evidence,reviewAfter:'2026-09-01'},new Date('2026-09-26')),'unverified');
  assert.equal(evidenceStatus(evidence,new Date('2026-12-24T23:59:59Z')),'checked');
  assert.equal(evidenceStatus(evidence,new Date('2026-12-25')),'review-due');
  const japan=GUIDE_CARDS.find(c=>c.country==='JP' && c.category==='tax-free');
  assert.equal(evidenceStatus(japan,new Date('2026-10-31T23:59:59Z')),'checked');
  assert.equal(evidenceStatus(japan,new Date('2026-11-01')),'expired');
});
const fixedNow=Date.parse('2026-09-26T12:00:00.000Z');
const berlin={latitude:52.52,longitude:13.4};
function resultAt(time=fixedNow,center=berlin){return {places:[],center,fetchedAt:new Date(time).toISOString(),limited:false,radius:3000};}
test('Map responses reject wrong cells, unsafe points, old data and malformed timestamps',()=>{
  const result=resultAt();
  assert.ok(validatePlaces(result,berlin,'needs',fixedNow));
  assert.equal(validatePlaces(result,{latitude:48.86,longitude:2.35},'needs',fixedNow),null);
  assert.equal(validatePlaces(resultAt(fixedNow-PLACES_MAX_AGE_MS-1),berlin,'needs',fixedNow),null);
  assert.equal(validatePlaces({...result,fetchedAt:'2026-02-30T00:00:00.000Z'},berlin,'needs',fixedNow),null);
  assert.equal(validatePlaces(resultAt(fixedNow+120000),berlin,'needs',fixedNow),null);
  assert.equal(validatePlaces({...result,places:[{}]},berlin,'needs',fixedNow),null);
  const place=normalizePlaces({elements:[{type:'node',id:1,lat:52.52,lon:13.4,tags:{amenity:'pharmacy'}}]},'needs',result.fetchedAt)[0];
  assert.ok(validatePlaces({...result,places:[place]},berlin,'needs',fixedNow));
  assert.equal(validatePlaces({...result,places:[{...place,website:'javascript:alert(1)'}]},berlin,'needs',fixedNow),null);
  assert.equal(validatePlaces({...result,places:[place,place]},berlin,'needs',fixedNow),null);
  assert.equal(validatePlaces({...result,places:[place]},berlin,'explore',fixedNow),null);
});
test('Offline map fallback is bounded to one result, its original time, mode and coarse cell',async()=>{
  let fail=false,now=fixedNow;
  const load=createPlacesLoader(async center=>{if(fail)throw Error('offline');return resultAt(now,center);},()=>now);
  assert.equal((await load(berlin,'needs')).stale,false);
  fail=true;now+=60000;
  const fallback=await load({latitude:52.5201,longitude:13.4001},'needs');
  assert.equal(fallback.stale,true);assert.equal(fallback.fetchedAt,new Date(fixedNow).toISOString());
  await assert.rejects(()=>load(berlin,'explore'));
  await assert.rejects(()=>load({latitude:48.86,longitude:2.35},'needs'));
  now=fixedNow+PLACES_MAX_AGE_MS+1;
  await assert.rejects(()=>load(berlin,'needs'));
  fail=false;now=fixedNow;
  await load({latitude:48.86,longitude:2.35},'needs');
  fail=true;await assert.rejects(()=>load(berlin,'needs'));
});
test('A slower previous search cannot overwrite the newest map fallback',async()=>{
  let fail=false;
  const pending=[];
  const load=createPlacesLoader(center=>fail?Promise.reject(Error('offline')):new Promise(resolve=>pending.push(()=>resolve(resultAt(fixedNow,center)))),()=>fixedNow);
  const paris={latitude:48.86,longitude:2.35};
  const old=load(berlin,'needs'),latest=load(paris,'needs');
  await Promise.resolve();
  pending[1]();await latest;pending[0]();await old;
  fail=true;assert.equal((await load(paris,'needs')).stale,true);
  await assert.rejects(()=>load(berlin,'needs'));
});
test('Online and cached FX reject wrong pairs, invalid calendar dates and forged movement',()=>{
  const q={base:'EUR',quote:'TRY',rate:44,date:'2026-09-25',previousRate:40,previousDate:'2026-09-24',changePercent:10,fetchedAt:new Date(fixedNow).toISOString(),sourceUrl:'https://frankfurter.dev/'};
  assert.ok(validateQuote(q,'EUR','TRY',fixedNow));
  for(const change of [{base:'USD'},{date:'2026-02-30'},{date:'2026-09-27'},{rate:Infinity},{rate:-1},{previousRate:0},{changePercent:500},{sourceUrl:'https://example.com'},{previousDate:q.date}])assert.equal(validateQuote({...q,...change},'EUR','TRY',fixedNow),null);
  assert.equal(validateQuote({...q,quote:'EUR'},'EUR','EUR',fixedNow),null);
  assert.ok(validateQuote({...q,quote:'EUR',rate:1,previousRate:null,previousDate:null,changePercent:null},'EUR','EUR',fixedNow));
});

function service(fetcher) {
  const output={exports:{}};
  const source=ts.transpileModule(readFileSync(new URL('../../lib/travel-assistant/server.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const context=vm.createContext({URL,URLSearchParams,AbortSignal,TextDecoder,Date,fetch:fetcher,process:{env:{}}});
  const provider={exports:{}};
  const providerSource=ts.transpileModule(readFileSync(new URL('../../lib/travel-assistant/overpass.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext(`(function(module,exports){${providerSource}\n})`,context)(provider,provider.exports);
  const localRequire=name=>name==='./overpass'?provider.exports:name==='next/cache'?{unstable_cache:fn=>fn}:name==='../country-intelligence/fetch'?{publicJson:async()=>null}:require(`../../lib/travel-assistant/${name.replace('./','')}.ts`);
  vm.runInContext(`(function(require,module,exports){${source}\n})`,context)(localRequire,output,output.exports);
  return output.exports;
}
test('Provider requests for the same coarse cell share one in-flight call',async()=>{
  let calls=0,release;
  const backend=service(async()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  const a=backend.getPlaces({latitude:52.5201,longitude:13.4001},'needs');
  const b=backend.getPlaces({latitude:52.5202,longitude:13.4002},'needs');
  assert.equal(calls,1);
  release(new Response(JSON.stringify({elements:[]})));
  const values=await Promise.all([a,b]);
  assert.equal(values[0],values[1]);
});
test('Provider failure activates cooldown; partial responses are never labelled complete',async()=>{
  let calls=0;
  const backend=service(async()=>{calls++;return new Response(JSON.stringify({elements:[],remark:'runtime error: timeout'}));});
  await assert.rejects(()=>backend.getPlaces({latitude:52.52,longitude:13.4},'explore'));
  await assert.rejects(()=>backend.getPlaces({latitude:48.86,longitude:2.35},'explore'));
  assert.equal(calls,1);
});
test('A slow provider cannot create unlimited concurrent requests',async()=>{
  const releases=[];
  const backend=service(async()=>new Promise(resolve=>releases.push(resolve)));
  const a=backend.getPlaces({latitude:52.52,longitude:13.4},'needs');
  const b=backend.getPlaces({latitude:48.86,longitude:2.35},'needs');
  await assert.rejects(()=>backend.getPlaces({latitude:35.68,longitude:139.76},'needs'));
  assert.equal(releases.length,2);
  for(const release of releases)release(new Response(JSON.stringify({elements:[]})));
  await Promise.all([a,b]);
});
