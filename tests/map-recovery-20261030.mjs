import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {Marker} from '../mobile/node_modules/maplibre-gl/dist/maplibre-gl.mjs';

const require=createRequire(import.meta.url);
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const model=require('../lib/maps/open-map-pois.ts');
const places=require('../lib/travel-assistant/places.ts');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/openfreemap-paris-pois.json',import.meta.url),'utf8'));
const paris={latitude:48.86,longitude:2.335};
const transpile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

test('Real Paris tile museums keep genuine OSM identities and unknown hours; category, viewport and query narrow results',()=>{
  const result=model.openMapFeaturePlaces(fixture.features,paris,{category:'museum',locale:'en'});
  assert.ok(result.some(p=>p.name==='Louvre Museum'));
  assert.ok(result.some(p=>p.name==='Museum of Orsay'));
  assert.ok(result.every(p=>p.category==='museum'&&places.validJourneyPlaceSource(p.id,p.sourceUrl)&&p.hours===null&&p.accessible===null));
  assert.equal(model.openMapFeaturePlaces(fixture.features,paris,{category:'pharmacy'}).length,0);
  const narrowed=model.openMapFeaturePlaces(fixture.features,paris,{category:'museum',query:'Louvre',locale:'en'});
  assert.ok(narrowed.length>0);assert.ok(narrowed.every(p=>/Louvre/i.test(p.name)));
  assert.equal(model.openMapFeaturePlaces(fixture.features,paris,{bounds:{west:2.34,east:2.341,south:48.84,north:48.841}}).length,0);
  assert.equal(model.openMapFeaturePlaces(fixture.features,{latitude:41,longitude:29}).length,0);
  assert.equal(model.openMapOsmIdentity(1231),'node/123');assert.equal(model.openMapOsmIdentity(1232),'way/123');assert.equal(model.openMapOsmIdentity(1233),'relation/123');
  for(const bad of [1234,1230,-1,11.2,Number.MAX_SAFE_INTEGER+1,'1231'])assert.equal(model.openMapOsmIdentity(bad),null);
  assert.equal(model.openMapFeaturePlaces([...fixture.features,...fixture.features],paris).length,model.openMapFeaturePlaces(fixture.features,paris).length);
});

const canvasSource=fs.readFileSync(new URL('../mobile/src/components/UnifiedMapCanvas.tsx',import.meta.url),'utf8');
const canvasAst=ts.createSourceFile('UnifiedMapCanvas.tsx',canvasSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function callbacks(){const result={};function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='on'&&ts.isStringLiteral(node.arguments[0]))result[node.arguments[0].text]=node.arguments[1].getText(canvasAst);ts.forEachChild(node,visit);}visit(canvasAst);return result;}
function fakeElement(){const attributes=new Map();return {classList:{add(){},remove(){},toggle(){}},style:{},addEventListener(){},removeEventListener(){},remove(){},setAttribute:(k,v)=>attributes.set(k,v),getAttribute:k=>attributes.get(k)??null,hasAttribute:k=>attributes.has(k),removeAttribute:k=>attributes.delete(k)};}
const point=(x,y)=>({x,y,_add(){return this;},round(){return this;},distSqr(other){return (x-other.x)**2+(y-other.y)**2;}});
function fakeMap(){return {_camera:{transform:{getCoveringTilesDetailsProvider:()=>({allowWorldCopies:()=>true}),isLocationOccluded:()=>false,locationToScreenPoint:p=>point(p.lng,p.lat),center:{lng:0,lat:0},width:100,height:100}},getCanvasContainer:()=>({appendChild(){}}),on(){return this;},off(){return this;},project:p=>point(p.lng,p.lat),getPitch:()=>0,getBearing:()=>0,terrain:null};}

test('The actual first-location effect sets position before adding the installed MapLibre Marker',()=>{
  let callback;function visit(node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='useEffect'&&node.arguments[0]?.getText(canvasAst).includes('const point=[props.location.longitude'))callback=node.arguments[0];ts.forEachChild(node,visit);}visit(canvasAst);assert.ok(callback);
  const userMarker={current:null},props={location:{longitude:2.35,latitude:48.85}},context={Marker,userMarker,props,map:{current:fakeMap()},ready:1,copy:(_tr,en)=>en,document:{createElement:fakeElement},Number};
  const effect=vm.runInNewContext(transpile(`const effect=${callback.getText(canvasAst)};effect;`),context);
  assert.doesNotThrow(effect);assert.equal(userMarker.current.getLngLat().lng,2.35);
  props.location={longitude:2.36,latitude:48.86};assert.doesNotThrow(effect);assert.equal(userMarker.current.getLngLat().lng,2.36);
  props.location=null;effect();assert.equal(userMarker.current,null);
});

test('Successful map load clears an initial transient error; only matching tile recovery clears later source errors',()=>{
  const handlers=callbacks(),state={error:false},context={active:true,loaded:false,failedSources:new Set(),setReady:()=>{},setError:v=>state.error=v,m:{isStyleLoaded:()=>true},console:{warn(){}}};
  const env=vm.createContext(context);
  const call=(name,event)=>vm.runInContext(transpile(`const handler=${handlers[name].replaceAll('import.meta.env.DEV','false')};handler;`).replace(/const handler/g,`var handler`),env)(event);
  call('error',{error:Error('temporary')});assert.equal(state.error,true);call('load',{});assert.equal(state.error,false);
  for(const key of ['one','two'])call('error',{sourceId:'base',tile:{tileID:{key}},error:Error('temporary tile')});
  call('sourcedata',{sourceId:'base',tile:{state:'loaded',tileID:{key:'unrelated'}}});assert.equal(state.error,true);
  call('sourcedata',{sourceId:'base',tile:{state:'loaded',tileID:{key:'one'}}});assert.equal(state.error,true);
  call('sourcedata',{sourceId:'base',tile:{state:'loaded',tileID:{key:'two'}}});assert.equal(state.error,false);
});

test('503 busy and Retry-After survive the real client boundary; retry cooldown prevents repeated provider requests',async()=>{
  let now=100000,calls=0;
  const exports={},source=transpile(fs.readFileSync(new URL('../mobile/src/lib/travelMapClient.ts',import.meta.url),'utf8'));
  class Clock extends Date{static now(){return now;}}
  vm.runInNewContext(source,{exports,require:id=>{
    if(id==='./config')return {config:{apiBaseUrl:'https://example.test'}};
    if(id.endsWith('/places'))return places;
    if(id.endsWith('/map-search-result'))return {normalizeMapAreaResult:()=>null};
    throw Error(id);
  },Date:Clock,Error,URLSearchParams,AbortSignal,fetch:async()=>{calls++;return calls===1?new Response(JSON.stringify({code:'busy'}),{status:503,headers:{'Retry-After':'30','Content-Type':'application/json'}}):Response.json({data:{places:[],limited:false}});}});
  await assert.rejects(exports.findMapPlaces(paris),e=>e.code==='busy'&&e.retryAfter===30&&e.status===503);
  await assert.rejects(exports.findMapPlaces(paris,'museum'),e=>e.code==='busy'&&e.retryAfter===30);assert.equal(calls,1);
  now+=31000;assert.equal((await exports.findMapPlaces(paris)).places.length,0);assert.equal(calls,2);
});
