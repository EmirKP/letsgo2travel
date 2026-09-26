import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {normalizeTransit,normalizeStops,validateTransit,tubeStopsInHub}=require('../../lib/travel-assistant/transit.ts');
const {normalizeOfflineMap,validateOfflinePack,offlineMapQuery}=require('../../lib/travel-assistant/offline-map.ts');
const {validatePhotoGuide}=require('../../lib/travel-assistant/photo.ts');
const {boundedJson}=require('../../lib/travel-assistant/http.ts');
const c={latitude:52.52,longitude:13.4};

test('Explicit country-news refresh revalidates HTTP cache as well as app cache',async()=>{
  const requests=[];const source=ts.transpileModule(readFileSync('mobile/src/lib/countryIntelligence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const out={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Date})(name=>name==='./api'?{requestJson:async(path,options)=>{requests.push({path,options});return {count:requests.length};}}:require(name),out,out.exports);
  await out.exports.loadCountryData('/api/country-brief?country=TR');
  await out.exports.loadCountryData('/api/country-brief?country=TR');assert.equal(requests.length,1);
  await out.exports.loadCountryData('/api/country-brief?country=TR',true);assert.equal(requests.length,2);assert.equal(requests[1].options.headers['Cache-Control'],'no-cache');
});

test('Transport keeps all transfer legs and rejects partial or stale journeys',()=>{
  const leg={duration:8,instruction:{summary:'Northern line'},departurePoint:{commonName:'Waterloo'},arrivalPoint:{commonName:'Euston'},departureTime:'2026-09-26T23:57:00',arrivalTime:'2026-09-27T00:05:00',mode:{id:'tube'},disruptions:[{description:'Lift closed'}]};
  const raw={journeys:[{duration:8,startDateTime:leg.departureTime,arrivalDateTime:leg.arrivalTime,legs:[leg]}]};
  const value=normalizeTransit(raw);assert.equal(value.journeys[0].legs[0].disruptions[0],'Lift closed');assert.ok(validateTransit(value));
  assert.equal(validateTransit({...value,fetchedAt:'2020-01-01T00:00:00Z'}),null);
  assert.throws(()=>normalizeTransit({...raw,journeys:[{...raw.journeys[0],legs:[leg,{}]}]}));
  assert.deepEqual(normalizeStops({matches:[{id:'940GZZLUWLO',name:'Waterloo'},{id:'940GZZLUWLO',name:'duplicate'},{id:'https://evil.example',name:'invalid'}]}),[{id:'940GZZLUWLO',name:'Waterloo'}]);
  assert.deepEqual(normalizeStops({matches:[{id:'HUBWAT',name:'Waterloo'}]}),[{id:'HUBWAT',name:'Waterloo'}]);
  assert.deepEqual(tubeStopsInHub({children:[{id:'940GZZLUWLO',commonName:'Waterloo Underground',modes:['tube']},{id:'490G000275',commonName:'Bus stop',modes:['bus']}]}),[{id:'940GZZLUWLO',name:'Waterloo Underground'}]);
});
test('Offline street packs bound geography, strip markup in rendering and reject partial provider queries',()=>{
  const raw={elements:[{type:'way',id:1,tags:{highway:'residential',name:'Road'},geometry:[{lat:52.52,lon:13.4},{lat:52.521,lon:13.401}]},{type:'node',id:2,lat:52.52,lon:13.4,tags:{amenity:'pharmacy',name:'Apotheke'}}]};
  const pack=normalizeOfflineMap(raw,c);assert.ok(validateOfflinePack(pack));assert.equal(pack.places.length,1);
  assert.equal(validateOfflinePack({...pack,roads:[{name:'Bad',points:[[52.52,13.4],[0,0]]}]}),null);
  assert.equal(validateOfflinePack({...pack,id:'wrong-cell'}),null);
  assert.throws(()=>normalizeOfflineMap({...raw,remark:'timeout'},c));
  assert.match(offlineMapQuery({latitude:52.52013,longitude:13.40028}),/around:1500,52.52,13.4/);
  assert.throws(()=>offlineMapQuery({latitude:999,longitude:13}));
});
test('Download storage preserves old packs on quota failure and supports explicit deletion',()=>{
  let stored=null;let quota=false;
  const source=ts.transpileModule(readFileSync('mobile/src/lib/offlineMaps.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const out={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Blob,localStorage:{getItem:()=>stored,setItem:(_,v)=>{if(quota)throw Error('quota');stored=v;}}})(()=>({validateOfflinePack}),out,out.exports);
  const pack=normalizeOfflineMap({elements:[{type:'way',id:1,tags:{highway:'footway'},geometry:[{lat:52.52,lon:13.4},{lat:52.521,lon:13.4}]}]},c);
  out.exports.saveOfflineMap(pack);const before=stored;quota=true;assert.throws(()=>out.exports.saveOfflineMap(pack));assert.equal(stored,before);quota=false;out.exports.deleteOfflineMap(pack.id);assert.equal(out.exports.readOfflineMaps().length,0);
});
test('Chunked request size is enforced without trusting Content-Length',async()=>{
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"a":"'+'x'.repeat(1024)+'"}'));controller.close();}});
  await assert.rejects(()=>boundedJson(new Request('http://local',{method:'POST',body:stream,duplex:'half'}),100));
  assert.deepEqual(await boundedJson(new Request('http://local',{method:'POST',body:'{"ok":true}'}),100),{ok:true});
});
test('Photo response rejects incomplete, oversized and untyped provider output',()=>{
  const valid={title:'Stone building',observation:'Arches are visible.',context:'The exact building cannot be identified.',uncertain:true};
  assert.ok(validatePhotoGuide(valid));assert.equal(validatePhotoGuide({...valid,uncertain:'false'}),null);assert.equal(validatePhotoGuide({...valid,observation:'a'.repeat(1201)}),null);assert.equal(validatePhotoGuide(null),null);
});
test('Photo API enforces session, explicit consent and shared quota before contacting AI',async()=>{
  const sharp=require('sharp');const photo=await sharp({create:{width:20,height:20,channels:3,background:'#336699'}}).jpeg().withMetadata().toBuffer();
  const source=ts.transpileModule(readFileSync('app/api/travel-assistant/photo/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  let authenticated=true,allowed=true,quotaCalls=0,aiCalls=0;let modelImage;
  const out={exports:{}};
  const imports={
    sharp,
    '@google/genai':{GoogleGenAI:class{models={generateContent:async input=>{aiCalls++;modelImage=Buffer.from(input.contents[0].parts[1].inlineData.data,'base64');return {text:JSON.stringify({title:'Building',observation:'Arches',context:'Unknown location',uncertain:true})};}};}},
    '@/lib/authenticated-user':{requireAuthenticatedUser:async()=>authenticated?{ok:true,user:{id:'test'},supabase:{rpc:async()=>{quotaCalls++;return {data:allowed,error:null};}}}:{ok:false,response:Response.json({error:'auth'},{status:401})}},
    '@/lib/travel-assistant/http':{boundedJson},'@/lib/travel-assistant/photo':{validatePhotoGuide},
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Buffer,Response,AbortSignal,process:{env:{AI_CAMERA_ENABLED:'true',GEMINI_CAMERA_MODEL:'fixture-model',GEMINI_API_KEY:'NONFUNCTIONAL_FIXTURE'}}})(name=>imports[name],out,out.exports);
  const request=consent=>new Request('http://local',{method:'POST',body:JSON.stringify({image:photo.toString('base64'),locale:'tr',consent})});
  authenticated=false;assert.equal((await out.exports.POST(request(true))).status,401);assert.equal(aiCalls,0);
  authenticated=true;assert.equal((await out.exports.POST(request(false))).status,400);assert.equal(quotaCalls,0);
  allowed=false;assert.equal((await out.exports.POST(request(true))).status,429);assert.equal(aiCalls,0);
  allowed=true;const result=await out.exports.POST(request(true));assert.equal(result.status,200);assert.equal(aiCalls,1);assert.equal((await sharp(modelImage).metadata()).exif,undefined);assert.equal(result.headers.get('cache-control'),'private, no-store');
});
test('Photo quota is atomic, service-only and capped per user and globally',async()=>{
  const db=new PGlite();try{
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role; create schema auth; create table auth.users(id uuid primary key);');
    await db.exec(readFileSync('supabase/migrations/20260926170000_travel_photo_quota.sql','utf8'));
    const id='10000000-0000-4000-8000-000000000001';
    await db.query('insert into auth.users values ($1)',[id]);
    await db.exec('set role authenticated');await assert.rejects(()=>db.query('select public.consume_travel_photo_quota($1)',[id]));
    await db.exec('reset role; set role service_role');
    for(let i=0;i<5;i++)assert.equal((await db.query('select public.consume_travel_photo_quota($1) as ok',[id])).rows[0].ok,true);
    assert.equal((await db.query('select public.consume_travel_photo_quota($1) as ok',[id])).rows[0].ok,false);
    await db.exec("reset role; update public.travel_photo_quota set uses=100 where scope='global'; set role service_role;");
    assert.equal((await db.query("select public.consume_travel_photo_quota('20000000-0000-4000-8000-000000000002') as ok")).rows[0].ok,false);
    await db.exec('reset role');await db.query('delete from auth.users where id=$1',[id]);
    assert.equal((await db.query('select count(*)::integer as count from public.travel_photo_quota where user_id=$1',[id])).rows[0].count,0);
  }finally{await db.close();}
});
