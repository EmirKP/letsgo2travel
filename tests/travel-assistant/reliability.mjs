import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {normalizeOfflineMap, validateOfflinePack} = require('../../lib/travel-assistant/offline-map.ts');
const {transitDirectionsUrl} = require('../../lib/travel-assistant/transit.ts');
const {createPlacesLoader} = require('../../lib/travel-assistant/responses.ts');
const center = {latitude:41.01,longitude:28.98};
const raw = {elements:[{type:'way',id:1,tags:{highway:'residential',name:'Street'},geometry:[{lat:41.01,lon:28.98},{lat:41.011,lon:28.981}]},{type:'way',id:2,tags:{amenity:'hospital',name:'Hospital'},geometry:[{lat:41.01,lon:28.98},{lat:41.011,lon:28.981}]}]};
function moduleFrom(path,imports={},globals={}) {
  const source = ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const loaded={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Date,URL,URLSearchParams,Response,Request,Buffer,AbortSignal,TextDecoder,...globals})(name=>imports[name],loaded,loaded.exports);
  return loaded.exports;
}

test('Map outages fail over once within one time budget and avoid the failed host for the next request',async()=>{
  const calls=[],timeouts=[]; let now=100000;
  const provider=moduleFrom('lib/travel-assistant/overpass.ts',{}, {
    process:{env:{}}, Date:class extends Date {static now(){return now;}},
    AbortSignal:{timeout:milliseconds=>{timeouts.push(milliseconds);return undefined;}},
    fetch:async(url,options)=>{
      calls.push({host:url.hostname,query:options.body.get('data')});
      if(url.hostname==='overpass.private.coffee'){now+=3000;throw new Error('network timeout');}
      return Response.json({elements:[{type:'node',id:123}]});
    },
  });
  const first=await provider.queryOverpass('bounded query');
  assert.equal(first.elements[0].id,123);
  assert.deepEqual(timeouts,[3000,23000]);
  assert.deepEqual(calls.map(call=>call.host),['overpass.private.coffee','maps.mail.ru']);
  assert.ok(calls.every(call=>call.query==='bounded query'));
  await provider.queryOverpass('another bounded query');
  assert.equal(calls.length,3); assert.equal(calls[2].host,'maps.mail.ru');
});
test('Map provider denials and rate limits pause requests without hopping to another host',async()=>{
  for(const status of [400,403,406,429]){
    let calls=0;
    const provider=moduleFrom('lib/travel-assistant/overpass.ts',{}, {process:{env:{}},fetch:async()=>{calls++;return new Response('',{status});}});
    await assert.rejects(()=>provider.queryOverpass('query'),/declined/);
    await assert.rejects(()=>provider.queryOverpass('query'),/busy/);
    assert.equal(calls,1);
  }
});
test('Map server errors use the second service but custom providers remain exclusive',async()=>{
  const calls=[]; let cancelled=0;
  const fallback=moduleFrom('lib/travel-assistant/overpass.ts',{}, {process:{env:{}},fetch:async url=>{calls.push(url.hostname);return calls.length===1?new Response(new ReadableStream({cancel(){cancelled++;}}),{status:503}):Response.json({elements:[]});}});
  assert.equal((await fallback.queryOverpass('query')).elements.length,0);assert.equal(calls.length,2);assert.equal(cancelled,1);
  const customCalls=[];
  const custom=moduleFrom('lib/travel-assistant/overpass.ts',{}, {process:{env:{TRAVEL_OVERPASS_URL:'https://maps.example.test/interpreter'}},fetch:async url=>{customCalls.push(url.hostname);throw new Error('unreachable');}});
  await assert.rejects(()=>custom.queryOverpass('private configured query'),/unreachable/);
  assert.deepEqual(customCalls,['maps.example.test']);
});
test('Two failed map providers stop, and partial or malformed data never becomes an empty success',async()=>{
  let calls=0;
  const failed=moduleFrom('lib/travel-assistant/overpass.ts',{}, {process:{env:{}},fetch:async()=>{calls++;throw new Error('network unavailable');}});
  await assert.rejects(()=>failed.queryOverpass('query'));await assert.rejects(()=>failed.queryOverpass('query'));
  assert.equal(calls,2);
  for(const body of [null,{elements:[],remark:'timeout'},{}]){
    let reads=0;
    const partial=moduleFrom('lib/travel-assistant/overpass.ts',{}, {process:{env:{}},fetch:async()=>{reads++;return Response.json(body);}});
    await assert.rejects(()=>partial.queryOverpass('query'),/Incomplete/);assert.equal(reads,1);
  }
});
test('Building outlines become offline hospital points and unsafe cached fields are rejected',()=>{
  const pack=normalizeOfflineMap(raw,center);
  assert.equal(pack.places.length,1); assert.equal(pack.places[0].category,'hospital'); assert.ok(validateOfflinePack(pack));
  for (const changed of [{website:'javascript:alert(1)'},{category:'injected'},{fetchedAt:'2020-01-01'},{sourceUrl:'https://www.openstreetmap.org/node/999'}])
    assert.equal(validateOfflinePack({...pack,places:[{...pack.places[0],...changed}]}),null);
  assert.equal(validateOfflinePack({...pack,places:[pack.places[0],pack.places[0]]}),null);
  assert.equal(validateOfflinePack({...pack,roads:[null]}),null);
  const busyArea={elements:[raw.elements[0],...Array.from({length:60},(_,i)=>({...raw.elements[1],id:i+2}))]};
  const limited=normalizeOfflineMap(busyArea,center);
  assert.equal(limited.places.length,50);assert.equal(limited.limited,true);
});
test('Damaged stored packs cannot be overwritten or silently deleted by subsequent operations',()=>{
  let stored='{damaged'; let writes=0;
  const storage=moduleFrom('mobile/src/lib/offlineMaps.ts',{'../../../lib/travel-assistant/offline-map':{validateOfflinePack}},{Blob,localStorage:{getItem:()=>stored,setItem:(_,v)=>{stored=v;writes++;},removeItem:()=>{stored=null;writes++;}}});
  assert.equal(storage.hasUnreadableOfflineMaps(),true);
  assert.throws(()=>storage.saveOfflineMap(normalizeOfflineMap(raw,center)),/corrupt/);
  assert.throws(()=>storage.deleteOfflineMap('41.01:28.98'),/corrupt/);
  assert.equal(writes,0); assert.equal(stored,'{damaged');
  storage.resetOfflineMaps();
  assert.equal(writes,1);assert.equal(storage.hasUnreadableOfflineMaps(),false);
  storage.saveOfflineMap(normalizeOfflineMap(raw,center));
  assert.equal(storage.readOfflineMaps().length,1);
});
test('Repeated identical point searches share a request while different map modes do not',async()=>{
  const pending=[];
  const loader=createPlacesLoader((c,mode)=>new Promise(resolve=>pending.push({c,mode,resolve})));
  const first=loader(center,'needs'),second=loader({...center,latitude:41.0101},'needs'),third=loader(center,'explore');
  await Promise.resolve();
  assert.equal(pending.length,2);
  for (const p of pending) p.resolve({center:p.c,places:[],fetchedAt:new Date().toISOString(),radius:3000,limited:false});
  const [a,b]=await Promise.all([first,second,third]); assert.equal(a,b);
});
test('A synchronous provider failure does not poison later retries for the same map cell',async()=>{
  let attempts=0;
  const loader=createPlacesLoader(c=>{if(++attempts===1) throw new Error('offline'); return Promise.resolve({center:c,places:[],fetchedAt:new Date().toISOString(),radius:3000,limited:false});});
  await assert.rejects(loader(center,'needs'),/offline/);
  const result=await loader(center,'needs');
  assert.equal(attempts,2);assert.equal(result.places.length,0);
});
test('Worldwide transport handoff preserves both addresses, safely encodes them and rejects empty or identical endpoints',()=>{
  const u=new URL(transitDirectionsUrl(' İstanbul & Kadıköy ','Bodrum ? centre'));
  assert.equal(u.origin,'https://www.google.com'); assert.equal(u.searchParams.get('origin'),'İstanbul & Kadıköy');assert.equal(u.searchParams.get('destination'),'Bodrum ? centre');assert.equal(u.searchParams.get('travelmode'),'transit');
  assert.equal(transitDirectionsUrl('','Paris'),null);assert.equal(transitDirectionsUrl('Paris',' paris '),null);
});
test('A failed TfL interchange expansion does not hide healthy station results',async()=>{
  const transit=require('../../lib/travel-assistant/transit.ts');
  const route=moduleFrom('app/api/travel-assistant/transit/route.ts',{
    '@/lib/travel-assistant/transit':transit,
    '@/lib/country-intelligence/fetch':{publicJson:async(url)=>{if(url.includes('/Search?'))return {matches:[{id:'HUBWAT',name:'Waterloo'},{id:'940GZZLUVIC',name:'Victoria'}]};throw new Error('one hub unavailable');}},
  });
  const response=await route.GET(new Request('https://local/api?city=london&q=station'));
  assert.equal(response.status,200); assert.deepEqual((await response.json()).stops,[{id:'940GZZLUVIC',name:'Victoria'}]);
});
test('HEIC can use native browser decoding, 48MP inputs are resized, and JPEG stays within the server byte budget',async()=>{
  const qualities=[];let revoked=0;
  const photoModule=moduleFrom('mobile/src/lib/travelPhoto.ts',{}, {
    URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL:()=>revoked++},
    Image:class{naturalWidth=8000;naturalHeight=6000;decode(){return Promise.resolve();}},setTimeout,clearTimeout,
    document:{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:(_,quality)=>{qualities.push(quality);return 'data:image/jpeg;base64,'+'a'.repeat(quality===0.8?1_400_000:1_200_000);}})},
  });
  const photo=await photoModule.prepareImage({name:'photo.heic',type:'image/heic',size:8_000_000});
  assert.ok(photo.length<1_320_000);assert.deepEqual(qualities,[0.8,0.7]);assert.equal(revoked,1);
});
test('Albanian weather suggestions remain Albanian and invalid coordinates never reach the provider',async()=>{
  let calls=0;
  const route=moduleFrom('app/api/travel-now/route.ts',{'next/server':{NextResponse:Response}}, {fetch:async()=>{calls++;return Response.json({timezone:'Europe/Tirane',current:{temperature_2m:24,apparent_temperature:24,precipitation:0,weather_code:0,time:'2026-09-30T12:00'}});}});
  const request=body=>new Request('https://local',{method:'POST',body:JSON.stringify(body)});
  assert.equal((await route.POST(request({latitude:null,longitude:0,locale:'sq'}))).status,400);assert.equal(calls,0);
  const response=await route.POST(request({...center,locale:'sq',interest:'calm',budget:'free'}));
  const {data}=await response.json(); assert.equal(data.weather.description,'Kthjellët');assert.match(data.recommendations[0].title,/shëtitje/);assert.match(data.privacy,/Vendndodhja/);
});

test('Map cooldown honors Retry-After and diagnostics never expose configured URLs or queries',async()=>{
  let now=100000, calls=0; const logs=[];
  const provider=moduleFrom('lib/travel-assistant/overpass.ts',{}, {
    process:{env:{TRAVEL_OVERPASS_URL:'https://maps.example.test/interpreter?key=private-token'}},
    Date:class extends Date {static now(){return now;}}, console:{warn:(...args)=>logs.push(args)},
    fetch:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}});},
  });
  await assert.rejects(provider.queryOverpass('exact location 41.12345,28.12345'),/declined/);
  now+=61000;
  await assert.rejects(provider.queryOverpass('another query'),/busy/); assert.equal(calls,1);
  now+=60000;
  await assert.rejects(provider.queryOverpass('retry query'),/declined/); assert.equal(calls,2);
  assert.equal(logs[0][0],'travel_map_provider_failure'); assert.equal(logs[0][1].provider,'configured');
  assert.equal(logs[0][1].code,'http-429'); assert.equal(logs[0][1].durationMs,0);
  assert.doesNotMatch(JSON.stringify(logs),/private-token|maps\.example|41\.12345|28\.12345|query/);
});

test('The last healthy provider stays preferred after the failed provider cooldown expires',async()=>{
  let now=100000; const calls=[];
  const provider=moduleFrom('lib/travel-assistant/overpass.ts',{}, {
    process:{env:{}}, Date:class extends Date {static now(){return now;}},
    fetch:async url=>{calls.push(url.hostname); if(url.hostname==='overpass.private.coffee')throw new Error('down');return Response.json({elements:[]});},
  });
  await provider.queryOverpass('first'); now+=61000; await provider.queryOverpass('second');
  assert.deepEqual(calls,['overpass.private.coffee','maps.mail.ru','maps.mail.ru']);
});

test('Map fallback cache is bounded, preserves source time, and expires instead of reviving old data',()=>{
  const {createMapResultCache}=require('../../lib/travel-assistant/result-cache.ts');
  let now=Date.now(); const original=new Date(now).toISOString();
  const cache=createMapResultCache(value=>value.fetchedAt,()=>now);
  for(let i=0;i<17;i++)cache.remember(`cell-${i}`,{fetchedAt:original,id:i});
  assert.equal(cache.read('cell-0'),null); assert.equal(cache.read('cell-1',true).id,1);
  assert.equal(cache.read('other-mode'),null);
  now+=3600001;
  assert.equal(cache.read('cell-1',true),null); assert.equal(cache.read('cell-1').fetchedAt,original);
  now+=5*3600000;
  assert.equal(cache.read('cell-1'),null);
  assert.throws(()=>cache.remember('expired',{fetchedAt:original}),/Expired/);
  assert.throws(()=>cache.remember('invalid',{fetchedAt:'bad'}),/Expired/);
  assert.throws(()=>cache.remember('future',{fetchedAt:new Date(now+60001).toISOString()}),/Expired/);
});

test('Client fresh map reuse avoids requests; explicit refresh retains a failed snapshot with its warning',async()=>{
  let calls=0, now=Date.now(), down=false;
  const loader=createPlacesLoader(async c=>{calls++;if(down)throw new Error('outage');return {center:c,places:[],fetchedAt:new Date(now).toISOString(),radius:3000,limited:false};},()=>now);
  const first=await loader(center,'needs'); now+=1000; down=true;
  assert.equal((await loader(center,'needs')).fetchedAt,first.fetchedAt); assert.equal(calls,1);
  const stale=await loader(center,'needs',{refresh:true}); assert.equal(stale.stale,true); assert.equal(stale.fetchedAt,first.fetchedAt);
  assert.equal((await loader(center,'needs')).stale,true); assert.equal(calls,2);
  await assert.rejects(loader(center,'explore'),/outage/);
  now+=6*3600000;await assert.rejects(loader(center,'needs'),/outage/);
});

test('Actual places and offline endpoints preserve only the same cached area during outages, and mark shared stale cache',async()=>{
  const places=require('../../lib/travel-assistant/places.ts');
  const offline=require('../../lib/travel-assistant/offline-map.ts');
  const http=require('../../lib/travel-assistant/http.ts');
  for(const kind of ['places','offline']){
    let now=Date.now(), down=false, calls=0, shared=null;
    class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
    const cache=moduleFrom('lib/travel-assistant/result-cache.ts',{}, {Date:Clock});
    const next={unstable_cache:fn=>(...args)=>shared?Promise.resolve(shared):fn(...args)};
    const overpass={queryOverpass:async()=>{calls++;if(down)throw new Error('actual upstream unavailable');return raw;}};
    let request;
    if(kind==='places'){
      const server=moduleFrom('lib/travel-assistant/server.ts',{'next/cache':next,'../country-intelligence/fetch':{},'./places':places,'./money':{},'./overpass':overpass,'./result-cache':cache},{Date:Clock});
      request=async(c=center,mode='needs')=>server.getPlaces(c,mode);
    }else{
      const route=moduleFrom('app/api/travel-assistant/offline-map/route.ts',{'next/cache':next,'@/lib/travel-assistant/places':places,'@/lib/travel-assistant/offline-map':{...offline,normalizeOfflineMap:(data,c)=>offline.normalizeOfflineMap(data,c,new Date(now))},'@/lib/travel-assistant/overpass':overpass,'@/lib/travel-assistant/http':http,'@/lib/travel-assistant/result-cache':cache},{Date:Clock});
      request=async(c=center)=>{const response=await route.POST(new Request('https://local/offline',{method:'POST',body:JSON.stringify(c)}));if(!response.ok)throw new Error(`status ${response.status}`);return response.json();};
    }
    const first=await request();const timestamp=kind==='places'?'fetchedAt':'downloadedAt';
    now+=1000;down=true;
    assert.equal((await request())[timestamp],first[timestamp]);assert.equal(calls,1);
    now+=3600000;
    const stale=await request(); assert.equal(stale.stale,true);assert.equal(stale[timestamp],first[timestamp]);assert.equal(calls,2);
    await assert.rejects(request({latitude:48.85,longitude:2.35}));
    if(kind==='places')await assert.rejects(request(center,'explore'));
    // Next's cache can return an old successful value while provider revalidation fails.
    shared=first; const sharedStale=await request();assert.equal(sharedStale.stale,true);assert.equal(sharedStale[timestamp],first[timestamp]);
    now+=5*3600000;await assert.rejects(request());
  }
});
