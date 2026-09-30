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
  const module={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Date,URL,URLSearchParams,Response,Request,Buffer,AbortSignal,TextDecoder,...globals})(name=>imports[name],module,module.exports);
  return module.exports;
}
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
  const module=moduleFrom('mobile/src/lib/travelPhoto.ts',{}, {
    URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL:()=>revoked++},
    Image:class{naturalWidth=8000;naturalHeight=6000;decode(){return Promise.resolve();}},setTimeout,clearTimeout,
    document:{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:(_,quality)=>{qualities.push(quality);return 'data:image/jpeg;base64,'+'a'.repeat(quality===0.8?1_400_000:1_200_000);}})},
  });
  const photo=await module.prepareImage({name:'photo.heic',type:'image/heic',size:8_000_000});
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
