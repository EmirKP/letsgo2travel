import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { geoBounds, geoContains } from 'd3-geo';
const plain=value=>JSON.parse(JSON.stringify(value));
function load(path,imports={},globals={},extra=''){
 const out={exports:{}};const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${source}\n${extra}\n})`,{Date,Promise,Set,Map,...globals})(name=>{if(name.endsWith('.css'))return{};if(name in imports)return imports[name];throw Error('Missing import '+name);},out,out.exports);return out.exports;
}
const places=load('lib/travel-assistant/places.ts');
const centers=load('mobile/src/lib/travelAreas.ts');
function locationHarness(mode='normal'){
 let now=1000,next=0;const timers=new Map(),calls=[];
 const api=load('mobile/src/lib/travelAssistant.ts',{'./api':{requestJson:async()=>{}},'./config':{config:{}},'./mapJourneyClient':{discoverJourneyPlaces:async()=>{throw Error('A location lookup must not search for places');}},'../../../lib/travel-assistant/money':load('lib/travel-assistant/money.ts'),'../../../lib/travel-assistant/places':places,'../../../lib/travel-assistant/responses':{createPlacesLoader:()=>{},validateQuote:()=>null}},
  {Date:{now:()=>now},navigator:mode==='missing'?{}:{geolocation:{getCurrentPosition(success,error,options){if(mode==='throw')throw Error('provider');calls.push({success,error,options});}}},setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,until:now+delay});return id;},clearTimeout:id=>timers.delete(id)});
 return{api,calls,timers,tick(ms){now+=ms;for(const [id,t] of [...timers])if(t.until<=now){timers.delete(id);t.fn();}}};
}

test('country lookup resolves TR/AL/GB/NO and coastal Istanbul without guessing countries in open ocean or invalid coordinates',async()=>{
 const api=load('mobile/src/lib/deviceArea.ts',{'d3-geo':{geoBounds,geoContains},'./travelAssistant':{locateForTravel:async()=>({latitude:41.01,longitude:28.98})},'../../../lib/travel-assistant/money':load('lib/travel-assistant/money.ts'),'../../../lib/travel-assistant/places':places,'./travelAreas':centers,'../data/locationCountries.json':{default:JSON.parse(readFileSync('mobile/src/data/locationCountries.json','utf8'))}});
 for(const [latitude,longitude,expected] of [[39.93,32.85,'TR'],[41.01,28.98,'TR'],[41.33,19.82,'AL'],[51.51,-.13,'GB'],[59.91,10.75,'NO'],[30,-30,''],[0,0,''],[91,0,''],[0,181,''],[NaN,0,'']])assert.equal(await api.countryAt({latitude,longitude}),expected,`${latitude},${longitude}`);
 assert.equal((await api.locateDeviceArea()).city,'İstanbul');
});

test('simultaneous requests share one permission prompt; cache is rounded, memory-only and expires',async()=>{
 const h=locationHarness();const a=h.api.locateForTravel(),b=h.api.locateForTravel();assert.equal(a,b);assert.equal(h.calls.length,1);
 h.calls[0].success({coords:{latitude:41.01234,longitude:28.98765}});assert.deepEqual(plain(await a),{latitude:41.01,longitude:28.99});assert.equal(h.timers.size,0);
 assert.deepEqual(plain(await h.api.locateForTravel()),{latitude:41.01,longitude:28.99});assert.equal(h.calls.length,1);
 h.tick(60_001);const next=h.api.locateForTravel();assert.equal(h.calls.length,2);h.calls[1].success({coords:{latitude:41.33,longitude:19.82}});await next;
 assert.deepEqual(plain(h.calls[0].options),{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
});

test('denial, absent and throwing providers fail promptly; denied tools do not repeatedly prompt',async()=>{
 const h=locationHarness();const a=h.api.locateForTravel();h.calls[0].error({code:1});await assert.rejects(a,/denied/);await assert.rejects(h.api.locateForTravel(),/denied/);assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);
 h.tick(60_001);const retry=h.api.locateForTravel();h.calls[1].error({code:2});await assert.rejects(retry,/unavailable/);
 for(const mode of ['missing','throw']){const x=locationHarness(mode);await assert.rejects(x.api.locateForTravel(),/unavailable/);assert.equal(x.timers.size,0);}
});

test('timeout fences late provider callbacks so a newer location cannot be overwritten by an abandoned result',async()=>{
 const h=locationHarness();const old=h.api.locateForTravel();h.tick(14001);await assert.rejects(old,/unavailable/);
 const latest=h.api.locateForTravel();h.calls[1].success({coords:{latitude:51.51,longitude:-.13}});await latest;
 h.calls[0].success({coords:{latitude:41.01,longitude:28.98}});h.calls[0].error({code:1});
 assert.deepEqual(plain(await h.api.locateForTravel()),{latitude:51.51,longitude:-.13});assert.equal(h.calls.length,2);
});

const jsx=(type,props,key)=>({type,props,key});
const nodes=value=>!value||typeof value!=='object'?[]:[value,...[value.props?.children].flat(Infinity).flatMap(nodes)];
const node=(value,type)=>nodes(value).find(n=>n.type===type);
function offlineHarness(props={}){
 const slots=[],effects=[];let cursor=0,resolve,requests=0,locations=0;const location=new Promise(done=>{resolve=done;});
 const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
  useRef(initial){const i=cursor++;return slots[i]||=( {current:initial});},useCallback:fn=>fn,useMemo:fn=>fn(),
  useEffect(fn,deps){const i=cursor++;if(!slots[i]){slots[i]={deps};effects.push(fn);}},
 };
 const offline={readOfflineMaps:()=>[],hasUnreadableOfflineMaps:()=>false,saveOfflineMap:()=>{throw Error('Unexpected automatic save');}};
 const api=load('mobile/src/components/TravelOfflineMap.tsx',{'react':react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},leaflet:{default:{}},'../lib/localeFormatting':{formatAppDate:()=>''},'../../../lib/travel-assistant/money':load('lib/travel-assistant/money.ts'),'../../../lib/travel-assistant/places':places,'../lib/i18n':{useI18n:()=>({copy:(_,en)=>en,dateLocale:'en'})},'../hooks/useCurrentTime':{useCurrentTime:()=>1000},'../lib/config':{config:{}},'../lib/api':{requestJson:async()=>{requests++;},ApiError:class extends Error{}},'../lib/travelAssistant':{locateForTravel:()=>{locations++;return location;}},'../lib/offlineMaps':offline,'../../../lib/travel-assistant/offline-map':{validateOfflinePack:()=>null},'./Sheet':{Sheet:'Sheet'},'../lib/native':{openExternal:()=>{}},'./TravelAreaPicker':{TravelAreaPicker:'TravelAreaPicker'},'../lib/travelAreas':centers},{AbortController});
 return{render(){cursor=0;const view=api.TravelOfflineMap(props);effects.splice(0).forEach(fn=>fn());return view;},resolve,get requests(){return requests;},get locations(){return locations;}};
}
test('offline map only preselects GPS; never downloads automatically and late GPS cannot override manual area',async()=>{
 const h=offlineHarness();h.render();h.resolve({latitude:41.01,longitude:28.98});await new Promise(setImmediate);
 assert.deepEqual(plain(node(h.render(),'TravelAreaPicker').props.value),{latitude:41.01,longitude:28.98});assert.equal(h.requests,0);
 const manual=offlineHarness();node(manual.render(),'TravelAreaPicker').props.onChange({latitude:51.51,longitude:-.13});manual.resolve({latitude:41.01,longitude:28.98});await new Promise(setImmediate);
 assert.deepEqual(plain(node(manual.render(),'TravelAreaPicker').props.value),{latitude:51.51,longitude:-.13});assert.equal(manual.requests,0);
});

test('A selected country keeps offline maps on the destination and waits for an explicit area and download', () => {
 const h=offlineHarness({destinationCountry:'FR'});let view=h.render();
 assert.equal(h.locations,0);assert.equal(h.requests,0);assert.equal(node(view,'TravelAreaPicker').props.country,'FR');
 assert.equal(node(view,'TravelAreaPicker').props.value,null,'No invented country-centre point is selected for a small-area download');
 assert.equal(nodes(view).find(item=>item.type==='button'&&text(item)==='Download selected area').props.disabled,true);
 node(view,'TravelAreaPicker').props.onChange({latitude:48.86,longitude:2.35});view=h.render();
 assert.equal(h.locations,0);assert.equal(h.requests,0,'Area selection alone must never download');
 assert.equal(nodes(view).find(item=>item.type==='button'&&text(item)==='Download selected area').props.disabled,false);
});

function hooks(){
 const slots=[],effects=[],cleanups=[];let cursor=0;
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useRef(initial){const i=cursor++;return slots[i]||={current:initial};},useEffect(fn){const i=cursor++;if(!slots[i]){slots[i]=true;effects.push(fn);}},useEffectEvent:fn=>fn,useMemo:fn=>fn(),lazy:()=> 'LazyChild',Suspense:'Suspense'};
 return{react,render(fn){cursor=0;const tree=fn();effects.splice(0).forEach(fn=>cleanups.push(fn()));return tree;},unmount(){cleanups.forEach(fn=>fn?.());}};
}
const text=v=>Array.isArray(v)?v.map(text).join(''):v?.props?text(v.props.children):typeof v==='string'?v:'';
const sharedImports={
 'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'../lib/localeFormatting':{formatAppDate:()=>''},
 '../lib/i18n':{useI18n:()=>({copy:(_,en)=>en,locale:'en'})},'../hooks/useCurrentTime':{useCurrentTime:()=>1000},
 '../lib/native':{openExternal:async()=>true},'./Icon':{Icon:'Icon'},'../lib/config':{config:{}},'../lib/api':{requestJson:async()=>{}},
};
test('manual nearby area selection interrupts a pending GPS request and prevents an old automatic network search',async()=>{
 let finish;const pending=new Promise(done=>{finish=done;});const calls=[];const h=hooks();
 const api=load('mobile/src/components/TravelNearby.tsx',{...sharedImports,react:h.react,
  '../../../lib/travel-assistant/money':load('lib/travel-assistant/money.ts'),'../../../lib/travel-assistant/places':places,'../../../lib/travel-assistant/responses':{validatePlaces:data=>data},
  '../lib/travelAssistant':{locateForTravel:()=>pending,loadPlaces:async center=>{calls.push(center);return{places:[]};},directionsUrl:()=>''},
  '../lib/savedPlaces':{readSavedPlaces:()=>({items:[]}),subscribeSavedPlaces:()=>()=>{}},'./Sheet':{Sheet:'Sheet'},'./TravelAreaPicker':{TravelAreaPicker:'TravelAreaPicker'},
 });
 const render=()=>h.render(()=>api.TravelNearby({mode:'explore',citizenship:'TR'}));render();
 const picker=node(render(),'TravelAreaPicker');assert.notEqual(picker.props.disabled,true);
 picker.props.onChange({latitude:51.51,longitude:-.13});finish({latitude:41.01,longitude:28.98});await new Promise(setImmediate);
 assert.equal(calls.length,0);assert.deepEqual(plain(node(render(),'TravelAreaPicker').props.value),{latitude:51.51,longitude:-.13});
 nodes(render()).find(n=>n.type==='button'&&text(n)==='Search selected area').props.onClick();await new Promise(setImmediate);
 assert.deepEqual(plain(calls),[{latitude:51.51,longitude:-.13}]);h.unmount();
});
test('transit location is a suggestion: a late fix cannot replace a typed departure',async()=>{
 let finish;const pending=new Promise(done=>{finish=done;});const h=hooks();
 const api=load('mobile/src/components/TravelTransit.tsx',{...sharedImports,react:h.react,'../lib/travelAssistant':{locateForTravel:()=>pending},'../../../lib/travel-assistant/transit':{transitDirectionsUrl:()=>'',validateTransit:()=>null,validStopId:()=>false}}, {},'exports.worldForTest=WorldwideTransit;');
 const render=()=>h.render(()=>api.worldForTest());render();
 node(render(),'input').props.onChange({target:{value:'My hotel, London'}});finish({latitude:41.01,longitude:28.98});await new Promise(setImmediate);
 assert.equal(node(render(),'input').props.value,'My hotel, London');h.unmount();
});

test('A destination map waits for the selected area and requests GPS only through its explicit nearby action',async()=>{
 let locations=0;const calls=[];const h=hooks();
 const api=load('mobile/src/components/TravelNearby.tsx',{...sharedImports,react:h.react,
  '../../../lib/travel-assistant/places':places,'../../../lib/travel-assistant/responses':{validatePlaces:data=>data},
  '../lib/travelAssistant':{locateForTravel:async()=>{locations++;return{latitude:41.01,longitude:28.98};},loadPlaces:async center=>{calls.push(center);return{places:[]};},directionsUrl:()=>''},
  '../lib/savedPlaces':{readSavedPlaces:()=>({items:[]}),subscribeSavedPlaces:()=>()=>{}},'./Sheet':{Sheet:'Sheet'},'./TravelAreaPicker':{TravelAreaPicker:'TravelAreaPicker'},
 });
 const render=()=>h.render(()=>api.TravelNearby({mode:'explore',citizenship:'',destinationCountry:'FR'}));
 let view=render();assert.equal(locations,0);assert.equal(calls.length,0);assert.equal(node(view,'TravelAreaPicker').props.country,'FR');
 node(view,'TravelAreaPicker').props.onChange({latitude:48.86,longitude:2.35});view=render();
 nodes(view).find(n=>n.type==='button'&&text(n)==='Search selected area').props.onClick();await new Promise(setImmediate);
 assert.equal(locations,0);assert.deepEqual(plain(calls),[{latitude:48.86,longitude:2.35}]);
 nodes(render()).find(n=>n.type==='button'&&text(n)==='Find places near me').props.onClick();await new Promise(setImmediate);
 assert.equal(locations,1);assert.deepEqual(plain(calls.at(-1)),{latitude:41.01,longitude:28.98});h.unmount();
});

test('Destination transit stays empty until addresses are entered and location remains an explicit choice',async()=>{
 let locations=0;const h=hooks();const opened=[];
 const api=load('mobile/src/components/TravelTransit.tsx',{...sharedImports,react:h.react,'../lib/native':{openExternal:async url=>{opened.push(url);return true;}},'../lib/travelAssistant':{locateForTravel:async()=>{locations++;return{latitude:41.01,longitude:28.98};}},'../../../lib/travel-assistant/transit':{transitDirectionsUrl:(from,to)=>from&&to?`https://maps.example/${from}/${to}`:'',validateTransit:()=>null,validStopId:()=>false}}, {},'exports.worldForTest=WorldwideTransit;');
 const render=()=>h.render(()=>api.worldForTest({destinationCountry:'FR',destinationLabel:'France'}));let view=render();
 assert.equal(locations,0);assert.match(text(view),/Travel country: France/);
 const fields=nodes(view).filter(n=>n.type==='input');assert.deepEqual(fields.map(n=>n.props.value),['','']);
 fields[0].props.onChange({target:{value:'My hotel, Paris'}});fields[1].props.onChange({target:{value:'Louvre, Paris'}});view=render();
 nodes(view).find(n=>n.type==='button'&&text(n)==='Open transit routes').props.onClick();await new Promise(setImmediate);
 assert.equal(locations,0);assert.match(opened[0],/My hotel, Paris\/Louvre, Paris/);
 nodes(view).find(n=>n.type==='button'&&text(n)==='Use my location as departure').props.onClick();await new Promise(setImmediate);
 assert.equal(locations,1);assert.equal(node(render(),'input').props.value,'41.01,28.98');h.unmount();
});

test('Country area picker offers only matching city shortcuts and opens the destination map without selecting a point',()=>{
 for(const country of ['FR','GB','ID']){
  const h=hooks();let frames=0;
  const api=load('mobile/src/components/TravelAreaPicker.tsx',{...sharedImports,react:h.react,leaflet:{default:{}},'../../../lib/travel-assistant/places':places,'../lib/travelAreas':centers,'../lib/deviceArea':{countryMapBounds:async()=>{frames++;return null;}}});
  const changes=[];const tree=h.render(()=>api.TravelAreaPicker({value:null,country,onChange:point=>changes.push(point)}));
  const options=nodes(tree).filter(n=>n.type==='option').map(text);
  assert.ok(!options.includes('İstanbul'));
  if(country==='FR')assert.ok(options.includes('Paris'));
  if(country==='GB')assert.ok(options.includes('London'));
  if(country==='ID')assert.equal(options.length,0,'Without curated cities the country map is still available');
  assert.equal(node(tree,'button').props['aria-expanded'],true);assert.equal(changes.length,0);assert.equal(frames,0,'Rendering picker does not infer a search area');
 }
});

test('Country map framing uses on-device boundaries, including dateline areas, and never requests location',async()=>{
 let locations=0;
 const api=load('mobile/src/lib/deviceArea.ts',{'d3-geo':{geoBounds,geoContains},'./travelAssistant':{locateForTravel:async()=>{locations++;throw Error('unexpected');}},'../../../lib/travel-assistant/places':places,'./travelAreas':centers,'../data/locationCountries.json':{default:JSON.parse(readFileSync('mobile/src/data/locationCountries.json','utf8'))}});
 for(const code of ['FR','GB','ID','FJ']){
  const bounds=await api.countryMapBounds(code);assert.ok(bounds);
  assert.ok(bounds[0][0]<=bounds[1][0]);assert.ok(bounds[0][1]<=bounds[1][1]);
  assert.ok(bounds[1][1]-bounds[0][1]<=360);
 }
 assert.equal(await api.countryMapBounds('ZZ'),null);assert.equal(locations,0);
});
