import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'} });
const placesModel = require('../lib/travel-assistant/places.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const jsx = (type, props, key) => ({type,props,key});
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : !value || typeof value !== 'object' || (value.type==='Sheet'&&!value.props.open) ? [] : [value,...nodes(value.props?.children)];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value==='string'||typeof value==='number' ? String(value) : '';
const deferred = () => { let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
const poi = (id=1,name=`Place ${id}`,extra={}) => ({id:`node/${id}`,name,category:'museum',latitude:41.012+id/10000,longitude:28.98,description:null,hours:null,free:null,accessible:null,website:null,representedCountry:null,sourceUrl:`https://www.openstreetmap.org/node/${id}`,fetchedAt:'2026-10-27T00:00:00.000Z',...extra});
const area = (id,name,latitude=38.72,longitude=-9.14) => ({osmId:`relation/${id}`,name,address:`${name}, country`,kind:'area',latitude,longitude,sourceUrl:`https://www.openstreetmap.org/relation/${id}`});
const route = (mode='walking') => ({mode,distanceMeters:1200,durationSeconds:900,coordinates:[[28.98,41.01],[28.99,41.02]],steps:[{instruction:'Continue ahead',distanceMeters:1200,durationSeconds:900}],sourceUrl:'https://routing.openstreetmap.de',attribution:'OSRM'});
function load(file,imports,globals={}) {
  const source=ts.transpileModule(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const out={exports:{}};vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Error,Date,URL,AbortController,...globals})(name=>{
    if(name.endsWith('.css'))return{};assert.ok(Object.hasOwn(imports,name),`Missing ${file}: ${name}`);return imports[name];
  },out,out.exports);return out.exports;
}
function host() {
  const slots=[];let cursor=0,effects=[],dirty=false;
  const differs=(a,b)=>!a||!b||a.length!==b.length||a.some((value,index)=>!Object.is(value,b[index]));
  const memo=(factory,deps)=>{const at=cursor++;if(!slots[at]||differs(slots[at].deps,deps))slots[at]={value:factory(),deps};return slots[at].value;};
  const react={
    useState(initial){const at=cursor++;slots[at]??={value:typeof initial==='function'?initial():initial};return[slots[at].value,value=>{const next=typeof value==='function'?value(slots[at].value):value;if(next!==slots[at].value){slots[at].value=next;dirty=true;}}];},
    useRef(initial){const at=cursor++;slots[at]??={current:initial};return slots[at];},
    useMemo:memo,useCallback:(callback,deps)=>memo(()=>callback,deps),
    useEffect(effect,deps){const at=cursor++,old=slots[at];if(differs(old?.deps,deps)){slots[at]={deps};effects.push(()=>{old?.cleanup?.();slots[at].cleanup=effect();});}},
    lazy:()=> 'UnifiedMapCanvas',Suspense:'Suspense',
  };
  return {react,render(fn){for(let pass=0;pass<20;pass++){cursor=0;effects=[];dirty=false;const tree=fn();effects.forEach(effect=>effect());if(!dirty)return tree;}throw Error('Unstable unified map');},dispose(){slots.forEach(slot=>slot?.cleanup?.());}};
}
function fixture(initialOwner=null,initialProps={}) {
  const storage=new Map(),window=new EventTarget();let ids=0,currentHost=host(),ownerId=initialOwner,tree,props={destinationCountry:'TR',...initialProps};
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  window.localStorage=localStorage;
  class CustomEvent extends Event { constructor(name,options={}){super(name);this.detail=options.detail;} }
  const globals={window,localStorage,Event,CustomEvent};
  const id={createId:()=>`00000000-0000-4000-8000-${String(++ids).padStart(12,'0')}`};
  const collections=load('mobile/src/lib/accountCollections.ts',{'./id':id},globals);
  const saved=load('mobile/src/lib/savedPlaces.ts',{'./accountCollections':collections,'../../../lib/travel-assistant/places':placesModel},globals);
  const pins=load('mobile/src/lib/personalMapPins.ts',{'./id':id},globals);
  const calls={find:[],areas:[],routes:[],providerSaves:[],providerDays:[],privateDays:[],gps:0,watches:[],clearedWatches:[]};
  const asyncCall=(list,fields)=>{const waiting=deferred();list.push({...fields,...waiting});return waiting.promise;};
  const copy=(_tr,en)=>en;
  const deviceNavigator={onLine:true,geolocation:{watchPosition(success,failure,options){const id=++calls.gps;calls.watches.push({id,success,failure,options});return id;},clearWatch(id){calls.clearedWatches.push(id);}}};
  const react=Object.fromEntries(['useState','useMemo','useCallback','useEffect','useRef','lazy'].map(name=>[name,(...args)=>currentHost.react[name](...args)]));react.Suspense='Suspense';
  const component=load('mobile/src/components/TravelMap.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'../../../lib/travel-assistant/places':placesModel,
    '../lib/i18n':{useI18n:()=>({copy,locale:'en'})},'../lib/travelAreas':{TRAVEL_CENTRES:[{name:'Istanbul',country:'TR',latitude:41.01,longitude:28.98}]},
    '../lib/deviceArea':{countryMapBounds:async()=>null},
    '../lib/native':{openExternal:async()=>true},
    '../lib/savedPlaces':{...saved,saveTravelPlace:(place,owner)=>{calls.providerSaves.push({place,owner});return saved.saveTravelPlace(place,owner);},setTravelDayStop:(id,inDay,owner)=>{calls.providerDays.push({id,inDay,owner});return saved.setTravelDayStop(id,inDay,owner);}},
    '../lib/personalMapPins':{...pins,updatePersonalMapPin:(id,patch,owner)=>{calls.privateDays.push({id,patch,owner});return pins.updatePersonalMapPin(id,patch,owner);}},
    '../lib/travelMapClient':{findMapPlaces:(center,category,query,signal)=>asyncCall(calls.find,{center,category,query,signal}),searchMapAreas:(query,center,locale,signal)=>asyncCall(calls.areas,{query,center,locale,signal}),getMapDirections:(origin,destination,mode,locale,signal)=>asyncCall(calls.routes,{origin,destination,mode,locale,signal})},
    '../lib/activeTripContext':{useActiveTripContext:()=>null},'../lib/mapJourneyClient':{knownJourneyArea:()=>null},
    './Sheet':{Sheet:'Sheet'},'./Icon':{Icon:'Icon'},'./TravelMapLibrary':{TravelMapLibrary:'TravelMapLibrary'},'./TravelMapDownloads':{TravelMapDownloads:'TravelMapDownloads'},'./TravelMapEmbassies':{TravelMapEmbassies:'TravelMapEmbassies'},
  },{...globals,navigator:deviceNavigator,requestAnimationFrame:fn=>fn()});
  const app={
    calls,saved,pins,storage,
    render(nextOwner=ownerId,nextProps={}){if(nextOwner!==ownerId){currentHost.dispose();currentHost=host();ownerId=nextOwner;}props={...props,...nextProps};tree=currentHost.render(()=>component.TravelMap({ownerId,...props}));return tree;},
    async flush(){for(let n=0;n<2;n++){await new Promise(resolve=>setImmediate(resolve));app.render();}return tree;},
    click(label){const button=nodes(tree).find(node=>node.type==='button'&&(text(node).trim()===label||node.props['aria-label']===label));assert.ok(button,label);assert.ok(!button.props.disabled,`${label} disabled`);button.props.onClick();app.render();},
    search(value){const input=nodes(tree).find(node=>node.type==='input'&&node.props.type==='search');input.props.onChange({target:{value}});app.render();nodes(tree).find(node=>node.type==='form'&&node.props.role==='search').props.onSubmit({preventDefault(){}});app.render();},
    network(value){deviceNavigator.onLine=value;window.dispatchEvent(new Event(value?'online':'offline'));app.render();},
    get map(){const map=nodes(tree).find(node=>node.type==='UnifiedMapCanvas');assert.ok(map,'Map canvas is visible');return map;},
    get tree(){return tree;},dispose(){currentHost.dispose();},
  };app.render();return app;
}

test('Map markers and list use the same provider IDs; selecting a POI saves its actual snapshot and day membership',async()=>{
  const app=fixture('account-a');assert.equal(app.calls.gps,0);app.click('Search this area');
  app.calls.find[0].resolve({places:[poi(1),poi(2)],limited:false});await app.flush();
  assert.deepEqual(plain(app.map.props.places.map(place=>place.id)),['node/1','node/2']);
  app.click('List');const rows=nodes(app.tree).find(node=>node.props?.className==='um-results-list').props.children;
  assert.deepEqual(plain(rows.map(row=>row.key)),['node/1','node/2']);rows[0].props.onClick();app.render();app.click('Save');
  assert.equal(app.saved.readSavedPlaces('account-a').items[0].place.sourceUrl,'https://www.openstreetmap.org/node/1');
  app.click('Add to my route');assert.deepEqual(plain(app.saved.readSavedPlaces('account-a').dayIds),['node/1']);
  assert.equal(app.calls.providerDays[0].owner,'account-a');app.dispose();
});

test('Manual map pins remain private and adding them to the day never enters provider save/account operations',()=>{
  const app=fixture('account-a');app.click('Add pin');app.map.props.onPoint({latitude:41.014,longitude:28.979},'Meeting point');app.render();app.click('Save pin');
  const pin=app.pins.readPersonalMapPins('account-a').items[0];assert.match(pin.id,/^personal\//);assert.match(text(app.tree),/PERSONAL PIN/);
  app.click('Mark for trip');assert.equal(app.pins.readPersonalMapPins('account-a').items[0].inDay,true);
  assert.equal(app.calls.providerSaves.length,0);assert.equal(app.calls.providerDays.length,0);assert.equal(app.saved.readSavedPlaces('account-a').items.length,0);
  nodes(app.tree).find(node=>node.type==='button'&&node.key==='saved').props.onClick();app.render();const library=nodes(app.tree).find(node=>node.type==='TravelMapLibrary');assert.equal(library.props.ownerId,'account-a');
  library.props.onSelectPlace(app.pins.personalPinPlace(pin));app.render();assert.equal(app.map.props.selectedId,pin.id);app.dispose();
});

test('Global city results appear before a pending POI search resolves, and the selected city rejects stale old-area results',async()=>{
  const app=fixture();app.search('Lisbon');assert.equal(app.calls.find.length,1);assert.equal(app.calls.areas.length,1);
  app.calls.areas[0].resolve([area(12,'Lisbon')]);await app.flush();
  const city=nodes(app.tree).find(node=>node.type==='button'&&text(node).includes('LisbonLisbon, country'));assert.ok(city,'City remains selectable while POIs are still pending');
  city.props.onClick();app.render();assert.equal(app.calls.find[0].signal.aborted,true);assert.equal(app.map.props.center.latitude,38.72);
  app.calls.find[0].resolve({places:[poi(99,'Stale Istanbul')],limited:false});app.calls.find[1].resolve({places:[poi(5,'Lisbon museum',{latitude:38.721,longitude:-9.14})],limited:false});await app.flush();
  assert.deepEqual(plain(app.map.props.places.map(place=>place.name)),['Lisbon museum']);assert.equal(app.map.props.center.latitude,38.72);app.dispose();
});

test('A place chosen from global search keeps the previous map point as its route start',async()=>{
  const app=fixture(),origin={latitude:41.02,longitude:29.01};app.map.props.onMove(origin);app.render();
  app.search('Museum');const destination={...area(18,'Found museum',41.03,29.02),kind:'place',category:'museum'};
  app.calls.areas[0].resolve([destination]);await app.flush();
  nodes(app.tree).find(node=>node.type==='button'&&text(node).includes('Found museumFound museum, country')).props.onClick();app.render();
  assert.equal(app.calls.find[0].signal.aborted,true);
  app.click('Show directions');assert.deepEqual(plain(app.calls.routes[0].origin),origin);
  assert.equal(app.calls.routes[0].destination.id,'relation/18');assert.equal(app.calls.routes[0].destination.latitude,41.03);assert.equal(app.calls.routes[0].destination.longitude,29.02);
  app.dispose();
});

test('Opening a saved library or downloaded map cancels an earlier search before it can replace that view',async()=>{
  const app=fixture();app.click('Search this area');
  nodes(app.tree).find(node=>node.type==='button'&&node.key==='saved').props.onClick();app.render();
  assert.equal(app.calls.find[0].signal.aborted,true,'Entering saved places must stop the search');
  app.calls.find[0].resolve({places:[poi(99,'Late live place')],limited:true});await app.flush();
  assert.ok(nodes(app.tree).some(node=>node.type==='TravelMapLibrary'),'A completed old search cannot pull the user out of Saved');
  nodes(app.tree).find(node=>node.type==='button'&&node.key==='map').props.onClick();app.render();app.click('List');app.search('');
  nodes(app.tree).find(node=>node.type==='button'&&node.key==='offline').props.onClick();app.render();
  const pack={id:'paris',name:'Paris offline',center:{latitude:48.86,longitude:2.35},bounds:{south:48.84,north:48.88,west:2.32,east:2.38},places:[]};
  nodes(app.tree).find(node=>node.type==='TravelMapDownloads').props.onOpenPack(pack);app.render();
  app.calls.find[1].resolve({places:[poi(98,'Late search over download')],limited:false});await app.flush();
  assert.equal(app.map.props.pack.id,'paris');assert.deepEqual(plain(app.map.props.center),pack.center);
  assert.equal(app.map.props.places.length,0);assert.doesNotMatch(text(app.tree),/limited results/);app.dispose();
});

test('A saved-place selection wins over a pending search and directions reveal the route map from list view',async()=>{
  const app=fixture(),savedPlace=poi(7,'Saved museum');app.saved.saveTravelPlace(savedPlace,null);app.render();
  app.click('Search this area');nodes(app.tree).find(node=>node.type==='button'&&node.key==='saved').props.onClick();app.render();
  nodes(app.tree).find(node=>node.type==='TravelMapLibrary').props.onSelectPlace(savedPlace);app.render();
  app.calls.find[0].resolve({places:[poi(99,'Late place')],limited:false});await app.flush();
  assert.equal(app.map.props.selectedId,savedPlace.id);assert.deepEqual(plain(app.map.props.center),{latitude:savedPlace.latitude,longitude:savedPlace.longitude});
  app.click('List');app.click('Show directions');assert.ok(app.map,'Directions should switch the result view to the route map');
  assert.equal(app.calls.routes[0].destination.id,savedPlace.id);app.dispose();
});

test('An offline direction request from Saved reveals the actual place and a visible explanation without a route request',()=>{
  const app=fixture(),savedPlace=poi(7,'Saved museum');app.saved.saveTravelPlace(savedPlace,null);app.render();app.network(false);
  nodes(app.tree).find(node=>node.type==='button'&&node.key==='saved').props.onClick();app.render();
  nodes(app.tree).find(node=>node.type==='TravelMapLibrary').props.onDirections(savedPlace);app.render();
  assert.equal(app.map.props.selectedId,savedPlace.id);assert.match(text(app.tree),/New directions need internet/);
  assert.deepEqual(plain(app.map.props.center),{latitude:savedPlace.latitude,longitude:savedPlace.longitude});
  assert.equal(app.calls.routes.length,0);assert.equal(app.calls.gps,0);app.dispose();
});

test('A selected POI preserves the previous map centre as route origin and a late old route cannot overwrite another selection',async()=>{
  const app=fixture();const origin={latitude:41.02,longitude:29.01};app.map.props.onMove(origin);app.render();app.map.props.onSelect(poi(1));app.render();
  app.click('Show directions');assert.deepEqual(plain(app.calls.routes[0].origin),origin);assert.equal(app.calls.routes[0].destination.id,'node/1');
  app.map.props.onSelect(poi(2));app.render();assert.equal(app.calls.routes[0].signal.aborted,true);
  app.calls.routes[0].resolve(route());await app.flush();assert.equal(app.map.props.selectedId,'node/2');assert.equal(app.map.props.route,undefined);assert.doesNotMatch(text(app.tree),/Walking route/);app.dispose();
});

test('Choosing a new city cancels old directions before a late route can draw over the new region',async()=>{
  const app=fixture();app.map.props.onSelect(poi());app.render();app.click('Show directions');app.search('Lisbon');
  app.calls.areas[0].resolve([area(12,'Lisbon')]);await app.flush();
  nodes(app.tree).find(node=>node.type==='button'&&text(node).includes('LisbonLisbon, country')).props.onClick();app.render();
  assert.equal(app.calls.routes[0].signal.aborted,true,'Selecting another region must invalidate old directions');
  app.calls.routes[0].resolve(route());app.calls.find.at(-1).resolve({places:[],limited:false});await app.flush();assert.equal(app.map.props.route,undefined);app.dispose();
});

test('The real owner-keyed integration remounts map drafts and late requests before displaying another account',async()=>{
  const integration=readFileSync(new URL('../mobile/src/components/TravelAssistant.tsx',import.meta.url),'utf8');
  assert.match(integration,/<TravelMap\s+key=\{ownerId\s*\|\|\s*['"]guest['"]\}/,'TravelAssistant must own the account boundary');
  const app=fixture('account-a');app.pins.savePersonalMapPin({latitude:41.012,longitude:28.98},'Private A','account-a');app.render();
  app.map.props.onSelect(poi(1,'Private selected A'));app.render();app.click('Show directions');app.click('Search this area');
  app.render('account-b');assert.equal(app.calls.routes[0].signal.aborted,true);assert.equal(app.calls.find[0].signal.aborted,true);
  assert.equal(app.map.props.selectedId,undefined);assert.equal(app.map.props.places.length,0);assert.doesNotMatch(text(app.tree),/Private A|Private selected A/);
  app.calls.routes[0].resolve(route());app.calls.find[0].resolve({places:[poi(99,'Old account result')],limited:false});await app.flush();
  assert.equal(app.map.props.places.length,0);assert.equal(app.pins.readPersonalMapPins('account-a').items[0].name,'Private A');assert.equal(app.pins.readPersonalMapPins('account-b').items.length,0);app.dispose();
});

test('GPS starts only on My location, passes real fixes to the canvas, and later fixes preserve a manually panned area',()=>{
  const app=fixture();assert.equal(app.calls.gps,0);app.render();assert.equal(app.calls.gps,0);
  app.click('My location');assert.equal(app.calls.gps,1);const watch=app.calls.watches[0];
  assert.equal(watch.options.enableHighAccuracy,true);assert.equal(watch.options.timeout,15000);
  const first={latitude:41.025,longitude:28.995};watch.success({coords:first});app.render();
  assert.deepEqual(plain(app.map.props.location),first);assert.deepEqual(plain(app.map.props.center),first);
  assert.match(text(app.tree),/Location is shown live/);
  const focus=app.map.props.focusRequest,pan={latitude:41.04,longitude:29.02};app.map.props.onMove(pan);app.render();
  const second={latitude:41.026,longitude:28.997};watch.success({coords:second});app.render();
  assert.deepEqual(plain(app.map.props.location),second);assert.deepEqual(plain(app.map.props.center),first);
  assert.equal(app.map.props.focusRequest,focus,'A moving blue point must not force a new map focus after the first fix');
  app.click('Search this area');assert.deepEqual(plain(app.calls.find[0].center),pan,'The manually panned search area survives a later GPS fix');
  app.click('My location');assert.deepEqual(plain(app.map.props.center),second,'An explicit recenter uses the latest fix');app.dispose();
  assert.deepEqual(app.calls.clearedWatches,[watch.id]);
});

test('Stopping GPS clears its watch and ignores late success or denial callbacks from the stopped watcher',()=>{
  const app=fixture();app.click('My location');const watch=app.calls.watches[0],first={latitude:41.025,longitude:28.995};
  watch.success({coords:first});app.render();app.click('Stop');
  assert.deepEqual(app.calls.clearedWatches,[watch.id]);assert.doesNotMatch(text(app.tree),/Location is shown live/);
  const center=plain(app.map.props.center),stoppedLocation=plain(app.map.props.location),focus=app.map.props.focusRequest;
  watch.success({coords:{latitude:51.5,longitude:-0.1}});watch.failure({code:1});app.render();
  assert.deepEqual(plain(app.map.props.location),stoppedLocation);assert.deepEqual(plain(app.map.props.center),center);
  assert.equal(app.map.props.focusRequest,focus);assert.doesNotMatch(text(app.tree),/permission was not granted/);
  app.click('My location');assert.equal(app.calls.gps,2,'Tracking can be deliberately restarted after Stop');app.dispose();
  assert.deepEqual(app.calls.clearedWatches,[watch.id,app.calls.watches[1].id]);
});

test('GPS permission denial cleans the watcher and leaves city search and selection usable',async()=>{
  const app=fixture();app.click('My location');const watch=app.calls.watches[0];watch.failure({code:1});app.render();
  assert.match(text(app.tree),/Location permission was not granted. You can search for a city/);
  assert.equal(app.map.props.location,null);assert.deepEqual(app.calls.clearedWatches,[watch.id]);
  app.search('Lisbon');app.calls.areas[0].resolve([area(12,'Lisbon')]);await app.flush();
  nodes(app.tree).find(node=>node.type==='button'&&text(node).includes('LisbonLisbon, country')).props.onClick();app.render();
  assert.equal(app.map.props.center.latitude,38.72);assert.equal(app.map.props.center.longitude,-9.14);
  assert.equal(app.calls.gps,1,'Manual city selection must not request location permission again');app.dispose();
});

test('A GPS fix outside the opened offline region reports its limit and never recenters away from the downloaded map',()=>{
  const app=fixture();app.click('Downloads');
  const pack={id:'paris',name:'Paris offline',center:{latitude:48.86,longitude:2.35},bounds:{south:48.84,north:48.88,west:2.32,east:2.38},places:[]};
  nodes(app.tree).find(node=>node.type==='TravelMapDownloads').props.onOpenPack(pack);app.render();
  app.click('My location');const watch=app.calls.watches[0],outside={latitude:41.025,longitude:28.995};watch.success({coords:outside});app.render();
  assert.deepEqual(plain(app.map.props.location),outside);assert.deepEqual(plain(app.map.props.center),pack.center);assert.equal(app.map.props.pack.id,'paris');
  assert.match(text(app.tree),/Your location is outside this download/);
  app.click('My location');assert.deepEqual(plain(app.map.props.center),pack.center);assert.equal(app.calls.gps,1);
  assert.equal(app.calls.find.length,0);assert.equal(app.calls.routes.length,0,'GPS does not start an online search or directions request');app.dispose();
});

test('Embassy entry opens the official directory with explicit destination/citizenship choices and no GPS or provider request',()=>{
  const app=fixture('account-a',{destinationCountry:'DE',initialSection:'embassies'});
  const panel=()=>nodes(app.tree).find(node=>node.type==='TravelMapEmbassies');
  assert.equal(panel().props.country,'DE');assert.equal(panel().props.citizenship,'');assert.equal(panel().props.open,true);
  assert.equal(nodes(app.tree).find(node=>node.type==='button'&&node.key==='embassy').props['aria-pressed'],true);
  const categoryBar=nodes(app.tree).find(node=>node.props?.className==='um-categories');
  assert.deepEqual(plain(categoryBar.props.children.slice(0,2).map(node=>node.key)),['all','embassy'],'Consulates is visible directly after All on a phone');
  assert.equal(nodes(app.tree).find(node=>node.type==='button'&&node.key==='map').props['aria-pressed'],true);
  assert.equal(app.calls.gps,0);assert.equal(app.calls.find.length,0);assert.equal(app.calls.areas.length,0);
  panel().props.onCountryChange('GB');panel().props.onCitizenshipChange('TR');app.render();app.click('List');
  assert.equal(panel().props.country,'GB');assert.equal(panel().props.citizenship,'TR');
  app.click('Museums');assert.equal(panel(),undefined);app.click('Consulates');
  assert.equal(panel().props.country,'GB');assert.equal(panel().props.citizenship,'TR');assert.equal(panel().props.open,true);
  assert.equal(app.calls.find.at(-1).category,'embassy');assert.equal(app.calls.gps,0);
  app.render('account-a',{destinationCountry:'FR'});assert.equal(panel().props.country,'GB','The directory keeps the country explicitly chosen inside it');
  app.dispose();
});

test('Official embassy contacts remain available when live POIs fail; address actions search inside the same Map without invented coordinates',async()=>{
  const app=fixture('account-a');app.click('Consulates');
  const panel=()=>nodes(app.tree).find(node=>node.type==='TravelMapEmbassies');
  panel().props.onCountryChange('DE');panel().props.onCitizenshipChange('TR');app.render();
  app.calls.find[0].reject(Error('provider_unavailable'));await app.flush();
  assert.equal(panel().props.country,'DE');assert.equal(panel().props.citizenship,'TR');assert.equal(panel().props.open,true);
  const guides=require('../lib/travel-assistant/guides.ts'),official=guides.embassiesFor('TR','DE')[0];assert.ok(official?.address);
  panel().props.onDirections(official.address);app.render();
  assert.equal(panel().props.open,false);assert.equal(app.calls.find.at(-1).category,'embassy');assert.equal(app.calls.find.at(-1).query,official.address);
  assert.equal(app.calls.areas.at(-1).query,official.address);assert.equal(app.calls.routes.length,0,'An official address does not invent route coordinates');
  assert.equal(app.map.props.selectedId,undefined);assert.equal(app.calls.gps,0);
  app.calls.find.at(-1).resolve({places:[],limited:false});app.calls.areas.at(-1).resolve([]);await app.flush();
  assert.match(text(app.tree),/Select the mission matching the address, then open directions/);
  panel().props.onShowMap(official.address);app.render();assert.equal(app.calls.areas.at(-1).query,official.address);assert.equal(app.calls.routes.length,0);app.dispose();
});

test('The embassy selector panel forwards both explicit selections and map actions to existing official EmbassyCards',()=>{
  const actions=[],props={country:'DE',citizenship:'TR',open:true,onOpenChange:value=>actions.push(['open',value]),onCountryChange:value=>actions.push(['country',value]),onCitizenshipChange:value=>actions.push(['citizenship',value]),onShowMap:address=>actions.push(['map',address]),onDirections:address=>actions.push(['directions',address])};
  const embassyModule=load('mobile/src/components/TravelMapEmbassies.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},'../data/countries':{COUNTRY_LIST:[{alpha3:'DEU',name:'Germany'},{alpha3:'TUR',name:'Turkey'},{alpha3:'GBR',name:'United Kingdom'}]},
    '../data/countryIso':{alpha2FromAlpha3:code=>({DEU:'DE',TUR:'TR',GBR:'GB'})[code]},'../lib/i18n':{useI18n:()=>({copy:(_tr,en)=>en,countryName:(_code,name)=>name})},
    './CountryPicker':{CountryPicker:'CountryPicker'},'./TravelSafety':{EmbassyCards:'EmbassyCards'},'./Icon':{Icon:'Icon'},
  });
  const tree=embassyModule.TravelMapEmbassies(props),pickers=nodes(tree).filter(node=>node.type==='CountryPicker');
  assert.deepEqual(pickers.map(picker=>picker.props.value),['DE','TR']);pickers[0].props.onChange('GB');pickers[1].props.onChange('DE');
  const cards=nodes(tree).find(node=>node.type==='EmbassyCards');assert.equal(cards.props.country,'DE');assert.equal(cards.props.citizenship,'TR');
  cards.props.onShowMap('Official address');cards.props.onDirections('Official address');
  assert.deepEqual(actions,[['country','GB'],['citizenship','DE'],['map','Official address'],['directions','Official address']]);
  const empty=embassyModule.TravelMapEmbassies({...props,citizenship:''});assert.equal(nodes(empty).some(node=>node.type==='EmbassyCards'),false);assert.match(text(empty),/Choose a country and citizenship/);
});

test('Long official embassy addresses are normalized to the existing 80-character search bound without fabricating a destination',()=>{
  const app=fixture('account-a',{initialSection:'embassies'}),official=require('../lib/travel-assistant/embassies.ts').EMBASSIES.find(row=>row.address.length>80);
  assert.ok(official);const sourceAddress=official.address;
  const panel=nodes(app.tree).find(node=>node.type==='TravelMapEmbassies');panel.props.onShowMap(`  ${sourceAddress.replace(/ /g,'  ')}  `);app.render();
  const expected=sourceAddress.normalize('NFC').replace(/\s+/g,' ').trim().slice(0,80).trimEnd();
  assert.equal(app.calls.find[0].query,expected);assert.equal(app.calls.areas[0].query,expected);assert.ok(expected.length<=80);
  assert.equal(nodes(app.tree).find(node=>node.type==='input'&&node.props.type==='search').props.value,expected);
  assert.equal(official.address,sourceAddress,'The bundled official card retains its complete public address');
  assert.equal(app.map.props.selectedId,undefined);assert.equal(app.calls.routes.length,0);app.dispose();
});

test('Existing EmbassyCards keeps genuine bundled contact details and routes optional Map actions by exact public address',()=>{
  const guides=require('../lib/travel-assistant/guides.ts'),emergency=require('../lib/travel-assistant/emergency.ts'),external=[],actions=[];
  const safety=load('mobile/src/components/TravelSafety.tsx',{
    react:{useState:()=>[false,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx},'../../../lib/travel-assistant/guides':guides,'../../../lib/travel-assistant/emergency':emergency,
    '../lib/i18n':{useI18n:()=>({copy:(_tr,en)=>en,locale:'en'})},'../lib/native':{openExternal:async url=>{external.push(url);return true;},shareContent:async()=>true},
    '../lib/travelAssistant':{directionsUrl:address=>`legacy-directions:${address}`,locateForTravel:async()=>{throw Error('No location request expected');}},
    './Icon':{Icon:'Icon'},'../../../lib/travel-assistant/evidence':{evidenceStatus:()=> 'checked'},'../hooks/useCurrentTime':{useCurrentTime:()=>Date.now()},
  });
  const official=guides.embassiesFor('TR','DE')[0],tree=safety.EmbassyCards({country:'DE',citizenship:'TR',onShowMap:address=>actions.push(['map',address]),onDirections:address=>actions.push(['directions',address])});
  assert.match(text(tree),new RegExp(official.phone.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.ok(text(tree).includes(official.address));
  nodes(tree).find(node=>node.type==='button'&&text(node)==='Show on map').props.onClick();nodes(tree).find(node=>node.type==='button'&&text(node)==='Directions').props.onClick();
  assert.deepEqual(actions,[['map',official.address],['directions',official.address]]);assert.equal(external.length,0);
  const legacy=safety.EmbassyCards({country:'DE',citizenship:'TR'});nodes(legacy).find(node=>node.type==='button'&&text(node)==='Show on map').props.onClick();nodes(legacy).find(node=>node.type==='button'&&text(node)==='Directions').props.onClick();
  assert.ok(external[0].includes(encodeURIComponent(official.address)));assert.equal(external[1],`legacy-directions:${official.address}`);
});
