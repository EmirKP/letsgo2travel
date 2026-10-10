import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const owner='10000000-0000-4000-8000-000000000001', other='20000000-0000-4000-8000-000000000002';
const settle=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const plain=value=>JSON.parse(JSON.stringify(value));
class ApiError extends Error {constructor(code,status){super(code);this.code=code;this.status=status;}}
function server(){
 const rows=new Map(),calls=[];
 return {rows,calls,async request(url,options={}){
  const parsed=new URL(url),body=options.body;calls.push({url,options});
  if(parsed.pathname.endsWith('/account_collections')){const key=`${parsed.searchParams.get('owner_id').slice(3)}:${parsed.searchParams.get('kind').slice(3)}`;return rows.has(key)?[plain(rows.get(key))]:[];}
  if(parsed.pathname.endsWith('/save_account_collection')){const key=`${body.p_owner_id}:${body.p_kind}`,previous=rows.get(key);if((previous?.revision||0)!==body.p_expected_revision)throw new ApiError('40001',400);const next={revision:body.p_expected_revision+1,document:plain(body.p_document)};rows.set(key,next);return [plain(next)];}
  throw Error(`Unexpected ${url}`);
 }};
}
function device(shared=server(), {native=true,heldRegistration=false,request}={}){
 const values=new Map(),timers=new Map(),nativeEvents=new Map();let timerId=0,removed=0;
 const localStorage={get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 const window=new EventTarget(),document=new EventTarget();document.visibilityState='visible';Object.assign(window,{localStorage});
 const setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout=id=>timers.delete(id);
 Object.assign(window,{setTimeout,clearTimeout});
 const registration=deferred(),listener={remove:async()=>{removed++;}};
 const imports={
  './api':{ApiError,requestJson:request||((...args)=>shared.request(...args))},
  './config':{config:{supabaseUrl:'https://fixture.invalid',supabaseAnonKey:'public'},isSupabaseConfigured:true},
  './i18n':{localeFromStorage:()=> 'en'},
  './capacitor':{isNativePlatform:()=>native,addPluginListener:async(_plugin,event,callback)=>{nativeEvents.set(event,callback);return heldRegistration?registration.promise:listener;}},
 };
 const cache=new Map();const context=vm.createContext({window,document,localStorage,Event,EventTarget,CustomEvent,Date,URL,URLSearchParams,Intl,console,crypto:globalThis.crypto,setTimeout,clearTimeout});
 const load=file=>{let full=path.resolve(file);if(!existsSync(full))full=['.ts','.json'].map(ext=>full+ext).find(existsSync)||full;if(cache.has(full))return cache.get(full).exports;const moduleRecord={exports:{}};cache.set(full,moduleRecord);if(full.endsWith('.json'))return moduleRecord.exports=JSON.parse(readFileSync(full,'utf8'));const output=ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInContext(`(function(require,module,exports){${output}\n})`,context,{filename:full})(name=>Object.hasOwn(imports,name)?imports[name]:load(path.resolve(path.dirname(full),name)),moduleRecord,moduleRecord.exports);return moduleRecord.exports;};
 return {load,values,window,document,timers,registration,listener,nativeEvents,get removed(){return removed;},runTimers(){const pending=[...timers];timers.clear();pending.forEach(([,item])=>item.fn());},places:()=>load('mobile/src/lib/savedPlaces.ts'),events:()=>load('mobile/src/lib/storage.ts'),sync:()=>load('mobile/src/lib/accountCollectionSync.ts'),collections:()=>load('mobile/src/lib/accountCollections.ts')};
}
const place=(id,name=`Place ${id}`)=>({id:`node/${id}`,name,category:'museum',latitude:41,longitude:29,description:null,hours:null,free:null,accessible:null,website:null,representedCountry:null,sourceUrl:`https://www.openstreetmap.org/node/${id}`,fetchedAt:'2026-10-01T00:00:00.000Z'});
const event=id=>({id,title:`Event ${id}`,startsAt:'2026-12-01T12:00:00Z',updatedAt:'2026-10-01T00:00:00Z',status:'scheduled',city:'Istanbul'});

test('Native resume works with stale hidden visibility and coalesces adjacent browser events',async()=>{
 const d=device();let reads=0;const stop=d.load('mobile/src/lib/accountResume.ts').onAccountResume(()=>reads++);await settle();
 d.document.visibilityState='hidden';d.nativeEvents.get('appStateChange')({isActive:false});assert.equal(d.timers.size,0);
 d.nativeEvents.get('appStateChange')({isActive:true});d.document.visibilityState='visible';d.document.dispatchEvent(new Event('visibilitychange'));d.window.dispatchEvent(new Event('online'));assert.equal(d.timers.size,1);
 d.runTimers();assert.equal(reads,1);stop();assert.equal(d.removed,1);
});
test('Logout cancels queued foreground refresh and removes late native registration',async()=>{
 const d=device(server(),{heldRegistration:true});let reads=0;const stop=d.load('mobile/src/lib/accountResume.ts').onAccountResume(()=>reads++);
 d.nativeEvents.get('appStateChange')({isActive:true});stop();d.registration.resolve(d.listener);await settle();d.runTimers();assert.equal(reads,0);assert.equal(d.removed,1);
});
test('Old unscoped places remain guest-only; each signed-in account has isolated bookmarks and notes',()=>{
 const d=device(),p=d.places();p.saveTravelPlace(place(1));assert.equal(p.readSavedPlaces().items.length,1);assert.equal(p.readSavedPlaces(owner).items.length,0);
 p.saveTravelPlace(place(2),owner);p.updateTravelPlaceNote('node/2','Private note',owner);assert.equal(p.readSavedPlaces(other).items.length,0);assert.equal(p.readSavedPlaces().items[0].place.id,'node/1');
 assert.equal(p.readSavedPlaces(owner).items[0].note,'Private note');
});
test('Android and iOS merge offline saves, notes and day ordering, then propagate deletion without resurrection',async()=>{
 const s=server(),a=device(s),b=device(s);a.places().saveTravelPlace(place(1),owner);b.places().saveTravelPlace(place(2),owner);
 await a.sync().syncAccountCollection(owner,'token','saved_places');await b.sync().syncAccountCollection(owner,'token','saved_places');await a.sync().syncAccountCollection(owner,'token','saved_places');
 assert.equal(a.places().readSavedPlaces(owner).items.length,2);a.places().setTravelDayStop('node/1',true,owner);a.places().setTravelDayStop('node/2',true,owner);a.places().moveTravelDayStop('node/2',-1,owner);
 await a.sync().syncAccountCollection(owner,'token','saved_places');await b.sync().syncAccountCollection(owner,'token','saved_places');assert.deepEqual(plain(b.places().readSavedPlaces(owner).dayIds),['node/2','node/1']);
 b.places().updateTravelPlaceNote('node/1','Offline stale edit',owner);a.places().deleteTravelPlace('node/1',owner);await a.sync().syncAccountCollection(owner,'token','saved_places');await b.sync().syncAccountCollection(owner,'token','saved_places');
 assert.equal(b.places().readSavedPlaces(owner).items.some(x=>x.place.id==='node/1'),false);assert.deepEqual(plain(b.places().readSavedPlaces(owner).dayIds),['node/2']);
 b.places().saveTravelPlace(place(1),owner);await b.sync().syncAccountCollection(owner,'token','saved_places');assert.equal(Object.keys(s.rows.get(`${owner}:saved_places`).document.items).length,2,'an explicit new save is allowed');
});
test('Legacy events migrate only from the exact owner and removal syncs to the other device',async()=>{
 const s=server(),a=device(s),b=device(s);a.values.set(`l2t.mobile.saved-events.v1.user-${owner}`,JSON.stringify([event('event-1')]));a.values.set('l2t.mobile.saved-events.v1.guest',JSON.stringify([event('guest-1')]));
 await a.sync().syncAccountCollection(owner,'token','saved_events');await b.sync().syncAccountCollection(owner,'token','saved_events');assert.deepEqual(plain(b.events().getSavedTravelEvents(owner).map(x=>x.id)),['event-1']);
 assert.equal(a.events().getSavedTravelEvents(other).length,0);assert.equal(a.events().getSavedTravelEvents().length,1);
 b.events().removeSavedTravelEvent('event-1',owner);await b.sync().syncAccountCollection(owner,'token','saved_events');await a.sync().syncAccountCollection(owner,'token','saved_events');assert.equal(a.events().getSavedTravelEvents(owner).length,0);
});
test('A revision conflict rebases only pending changes and never loops indefinitely',async()=>{
 const s=server();let conflict=true;const d=device(s,{request:async(url,options)=>{if(url.endsWith('/save_account_collection')&&conflict){conflict=false;s.rows.set(`${owner}:saved_events`,{revision:1,document:{items:{'event-remote':event('event-remote')},dayIds:[]}});throw new ApiError('40001',400);}return s.request(url,options);}});
 d.events().toggleSavedTravelEvent(event('event-local'),owner);await d.sync().syncAccountCollection(owner,'token','saved_events');assert.equal(d.events().getSavedTravelEvents(owner).length,2);
 let failures=0;const bad=device(server(),{request:async(url)=>{if(url.endsWith('/save_account_collection')){failures++;throw new ApiError('40001',400);}return [];}});bad.events().toggleSavedTravelEvent(event('pending'),owner);await assert.rejects(bad.sync().syncAccountCollection(owner,'token','saved_events'));assert.equal(failures,4);assert.equal(bad.collections().readCollection(owner,'saved_events').pending.length,1);
});
test('An edit made during an upload stays queued and cannot be accidentally acknowledged',async()=>{
 const s=server(),hold=deferred();const d=device(s,{request:async(url,options)=>{const result=await s.request(url,options);if(url.endsWith('/save_account_collection'))await hold.promise;return result;}});
 d.places().saveTravelPlace(place(1),owner);const pending=d.sync().syncAccountCollection(owner,'token','saved_places');await settle();d.places().updateTravelPlaceNote('node/1','Typed while syncing',owner);hold.resolve();await pending;
 assert.equal(d.places().readSavedPlaces(owner).items[0].note,'Typed while syncing');assert.equal(d.collections().readCollection(owner,'saved_places').pending.length,1);
});
test('A late response after logout cannot change the account cache',async()=>{
 const s=server(),hold=deferred();let active=true;const d=device(s,{request:async()=>hold.promise});d.events().toggleSavedTravelEvent(event('pending'),owner);const before=[...d.values];const pending=d.sync().syncAccountCollection(owner,'token','saved_events',()=>active);await settle();active=false;hold.resolve([{revision:1,document:{items:{'other':event('other')},dayIds:[]}}]);await pending;assert.deepEqual([...d.values],before);
});
test('Unreadable local queues and failed writes preserve earlier data and do not upload an empty collection',async()=>{
 const s=server(),d=device(s);const key=d.collections().collectionKey(owner,'saved_places');d.values.set(key,'{broken');await assert.rejects(d.sync().syncAccountCollection(owner,'token','saved_places'));assert.equal(d.values.get(key),'{broken');assert.equal(s.calls.length,0);
});
const tripRow=(id,createdAt='2026-10-01T00:00:00Z')=>({id,user_id:owner,title:`Plan ${id}`,destination:'Rome',created_at:createdAt,trip_data:{mobile_kind:'route_plan',client_key:`saved-plan-${id}`,saved_at:'2026-10-01T00:00:00Z',input:{},plan:{routes:[{name:'Rome',country:'Italy'}]}}});
// Model the database predicates independently of page sizes. Offset requests
// deliberately retain their real shifting-page behavior for the regression.
function tripPage(rows,query){
 const cursor=query.get('or');let remaining=rows;
 if(cursor?.includes('created_at.is.null')){
  const match=/^\(and\(created_at\.is\.null,id\.lt\.(-?\d+)\),created_at\.not\.is\.null\)$/.exec(cursor);assert.ok(match,`Unsupported cursor ${cursor}`);
  remaining=rows.filter(row=>row.created_at!==null||BigInt(row.id)<BigInt(match[1]));
 }else if(cursor){
  const match=/^\(created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\.(-?\d+)\)\)$/.exec(cursor);assert.ok(match,`Unsupported cursor ${cursor}`);assert.equal(match[1],match[2]);
  remaining=rows.filter(row=>row.created_at!==null&&(row.created_at<match[1]||row.created_at===match[1]&&BigInt(row.id)<BigInt(match[3])));
 }
 const offset=Number(query.get('offset')||0);return plain(remaining.slice(offset,offset+100));
}

test('Saved-route pagination uses timestamp and ID cursors across timestamp ties and new inserts',async()=>{
 const calls=[],rows=Array.from({length:101},(_,index)=>tripRow(101-index));
 const d=device(server(),{request:async url=>{const query=new URL(url).searchParams;calls.push(query);const page=tripPage(rows,query);if(calls.length===1)rows.unshift(tripRow(102));return page;}});
 const result=await d.load('mobile/src/lib/supabaseData.ts').listUserTrips(owner,'token','route_plan');assert.deepEqual(plain(result.map(row=>row.id)),Array.from({length:101},(_,index)=>101-index));assert.equal(calls.length,2);
 assert.ok(calls.every(query=>query.get('order')==='created_at.desc.nullsfirst,id.desc'&&query.get('user_id')===`eq.${owner}`&&!query.has('offset')));
 assert.equal(calls[1].get('or'),'(created_at.lt."2026-10-01T00:00:00Z",and(created_at.eq."2026-10-01T00:00:00Z",id.lt.2))');
});

test('A deletion between route pages never tombstones or deletes the route shifted across the page boundary',async()=>{
 const rows=Array.from({length:101},(_,index)=>tripRow(101-index));let reads=0;const deleted=[];
 const d=device(server(),{request:async(url,options={})=>{
  const query=new URL(url).searchParams;
  if(options.method==='DELETE'){const id=Number(query.get('id').slice(3));deleted.push(id);const index=rows.findIndex(row=>row.id===id);return index<0?[]:rows.splice(index,1);}
  const page=tripPage(rows,query);if(++reads===1)rows.shift();return page;
 }});
 const box=d.load('mobile/src/lib/routeOutbox.ts'),sync=d.load('mobile/src/lib/routeSync.ts');
 box.writeRouteOutbox(owner,Object.fromEntries(rows.map(row=>[row.trip_data.client_key,{kind:'save',revision:`ack-${row.id}`,pending:false,route:{id:row.trip_data.client_key,createdAt:row.created_at,input:{},plan:row.trip_data.plan}}])),true);
 await sync.syncSavedRoutes(owner,'token');
 assert.equal(box.readRouteOutbox(owner)['saved-plan-1'].kind,'save','the skipped boundary route must remain a saved route');
 await sync.syncSavedRoutes(owner,'token');
 assert.equal(rows.some(row=>row.id===1),true,'a later reconciliation must preserve the real server record');assert.deepEqual(deleted,[]);
 assert.equal(d.events().getSavedRoutePlans(owner).length,100,'only the route actually removed on the other device should disappear');
});

test('Route cursors preserve nullable legacy timestamps, microseconds and string BIGINT IDs',async()=>{
 const timestamp='2026-10-01T00:00:00.123456+00:00',calls=[];
 const rows=Array.from({length:203},(_,index)=>tripRow(String(9007199254741200n-BigInt(index)),index<101?null:index<202?timestamp:'2026-10-01T00:00:00.123455+00:00'));
 const d=device(server(),{request:async url=>{const query=new URL(url).searchParams;calls.push(query);return tripPage(rows,query);}});
 const result=await d.load('mobile/src/lib/supabaseData.ts').listUserTrips(owner,'token','route_plan');assert.deepEqual(plain(result.map(row=>row.id)),rows.map(row=>row.id));assert.equal(calls.length,3);
 assert.equal(calls[1].get('or'),'(and(created_at.is.null,id.lt.9007199254741101),created_at.not.is.null)');
 assert.equal(calls[2].get('or'),`(created_at.lt."${timestamp}",and(created_at.eq."${timestamp}",id.lt.9007199254741001))`);
});

test('An unreadable route page cursor fails before a partial account list can be reconciled',async()=>{
 for(const invalid of [{id:Number.MAX_SAFE_INTEGER+1},{created_at:'not-a-timestamp'}]){
  let calls=0;const rows=Array.from({length:100},(_,index)=>tripRow(100-index));Object.assign(rows[99],invalid);
  const d=device(server(),{request:async()=>{calls++;return rows;}});
  await assert.rejects(d.load('mobile/src/lib/supabaseData.ts').listUserTrips(owner,'token','route_plan'),error=>error.status===503);assert.equal(calls,1);
 }
});
test('A server repeating the same route page fails instead of deleting uncaptured account items or fetching forever',async()=>{
 let calls=0;const rows=Array.from({length:100},(_,id)=>({id,user_id:owner,trip_data:{mobile_kind:'route_plan'},created_at:'2026-10-01T00:00:00Z'}));const d=device(server(),{request:async()=>{calls++;return rows;}});
 await assert.rejects(d.load('mobile/src/lib/supabaseData.ts').listUserTrips(owner,'token','route_plan'),error=>error.status===503);assert.equal(calls,2);
});
