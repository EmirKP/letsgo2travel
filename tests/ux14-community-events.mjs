import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { realLocaleModule } from "./fixtures/real-locale-modules.mjs";

const require = createRequire(import.meta.url);
const productionLocale = realLocaleModule('../lib/locale');
function modules(overrides = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({ URL, URLSearchParams, Request, Response, Headers, AbortSignal, Date, Intl, console, setTimeout, clearTimeout,
    process: { env: { TICKETMASTER_API_KEY: "test-ticketmaster", PREDICTHQ_ACCESS_TOKEN: "test-predicthq" } }, ...globals });
  const load = filename => {
    let full = path.resolve(filename);
    if (!existsSync(full)) full += ".ts";
    if (cache.has(full)) return cache.get(full).exports;
    const loaded = { exports: {} }; cache.set(full, loaded);
    const source = ts.transpileModule(readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const resolve = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith("@/") ? load(name.slice(2)) : name.startsWith(".") ? load(path.resolve(path.dirname(full), name)) : require(name);
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context, { filename: full })(resolve, loaded, loaded.exports);
    return loaded.exports;
  };
  return load;
}

const base={countryCode:'TR',startDate:'2026-10-27',endDate:'2027-03-27',category:'concert',limit:30,query:'Müzik'};
const moment=i=>new Date(Date.UTC(2026,10,1,12,i)).toISOString();
const tm=(i,extra={})=>({id:String(i),name:'Concert '+i,url:'https://ticketmaster.com/event/'+i,classifications:[{segment:{name:'Music'}}],dates:{start:{localDate:moment(i).slice(0,10),dateTime:moment(i)}},_embedded:{venues:[{city:{name:'Istanbul'},country:{countryCode:'TR'}}]},...extra});
function service(fetch,db=null,env={TICKETMASTER_API_KEY:'test',PREDICTHQ_ACCESS_TOKEN:'test'}){return modules({'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db}},{fetch,process:{env}})('lib/travel-events.ts');}
function curatedDb(rows){return{from(){let from=0,to=49;return{select(){return this;},eq(){return this;},gte(){return this;},lte(){return this;},order(){return this;},or(){return this;},ilike(){return this;},limit(count){from=0;to=count-1;return this;},range(a,b){from=a;to=b;return this;},then(yes,no){return Promise.resolve({data:rows.slice(from,to+1),error:null}).then(yes,no);}};}};}

test('Paginated event query uses genuine provider keyword and raw offsets, preserving every filtered and unconsumed source result',async()=>{
 const calls=[],raw=Array.from({length:104},(_,i)=>tm(i));raw[1]={...raw[1],url:''};raw[6]={...raw[6],classifications:[{segment:{name:'Sports'}}]};
 const editorial=Array.from({length:5},(_,i)=>({id:'editorial-'+i,title:'Editorial '+i,starts_at:moment(i*8+2),category:'concert',country_code:'TR',city:'Istanbul',source_url:'https://example.com/e/'+i,updated_at:moment(0)}));
 const api=service(async input=>{const url=new URL(input);calls.push(url);assert.equal(url.searchParams.get('keyword'),'Müzik');assert.equal(url.searchParams.get('sort'),'date,asc');assert.equal(url.searchParams.get('size'),'50');const page=Number(url.searchParams.get('page'));return Response.json({_embedded:{events:raw.slice(page*50,page*50+50)},page:{totalPages:3}});},curatedDb(editorial));
 const all=[];let cursor;for(let pages=0;pages<10;pages++){const page=await api.searchTravelEventPage(base,cursor);assert.ok(page.events.length<=30);all.push(...page.events);cursor=page.nextCursor;if(!cursor)break;}
 assert.equal(cursor,null);assert.equal(all.length,107);assert.equal(new Set(all.map(e=>e.id)).size,107);assert.equal(all.filter(e=>e.id.startsWith('editorial-')).length,5);assert.ok(all.every((e,i)=>i===0||all[i-1].startsAt<=e.startsAt));assert.ok(calls.some(u=>u.searchParams.get('page')==='2'));
});

test('PredictHQ query follows returned next offsets and keeps the selected fallback provider stable through retries',async()=>{
 const calls=[];let fail=false;
 const api=service(async input=>{const url=new URL(input);calls.push(url);if(url.hostname.includes('ticketmaster'))return Response.json({});if(fail)return new Response(null,{status:503});assert.equal(url.searchParams.get('q'),'Müzik');const offset=Number(url.searchParams.get('offset'));return Response.json({next:offset<50?'https://api.predicthq.com/v1/events/?offset=50':null,results:Array.from({length:50},(_,i)=>({id:String(offset+i),title:'Music '+(offset+i),start:moment(offset+i),end:moment(offset+i+1),category:'concerts',country:'TR',duration:60}))});});
 const first=await api.searchTravelEventPage(base);assert.equal(first.fallbackUsed,true);assert.equal(first.events.length,30);const initialTmCalls=calls.filter(u=>u.hostname.includes('ticketmaster')).length;
 fail=true;await assert.rejects(api.searchTravelEventPage(base,first.nextCursor),/event_provider_unavailable/);fail=false;
 const second=await api.searchTravelEventPage(base,first.nextCursor);assert.equal(second.events[0].id,'predicthq:30');assert.equal(calls.filter(u=>u.hostname.includes('ticketmaster')).length,initialTmCalls);assert.ok(calls.some(u=>u.searchParams.get('offset')==='30'));
 const third=await api.searchTravelEventPage(base,second.nextCursor);assert.equal(third.events[0].id,'predicthq:60');
});

test('A successful empty primary and failed fallback return the same honest limited coverage as nonpaged search',async()=>{
 const search={countryCode:'IT',city:'Rome',placeCode:'FCO',startDate:'2026-10-30',endDate:'2026-11-06',limit:24},calls=[];
 const api=service(async input=>{const url=new URL(input);calls.push(url);if(url.hostname.includes('ticketmaster'))return Response.json({});return new Response('private upstream diagnostic',{status:503});});
 const result=await api.searchTravelEventPage(search),ordinary=await api.searchTravelEvents(search);
 assert.equal(result.events.length,0);assert.equal(result.providerConfigured,true);assert.equal(result.providers.ticketmaster.succeeded,true);assert.equal(result.providers.predicthq.attempted,true);assert.equal(result.providers.predicthq.succeeded,false);
 assert.equal(result.coverageStatus,'limited');assert.equal(result.coverageStatus,ordinary.coverageStatus);assert.equal(result.coverageLimited,true);assert.equal(result.partial,true);assert.equal(result.fallbackUsed,true);assert.equal(result.nextCursor,null);assert.equal(result.paginationLimited,false);
 assert.doesNotMatch(JSON.stringify(result),/private upstream diagnostic|predicthq_503/);
 assert.ok(calls.every(url=>url.hostname.includes('ticketmaster')?url.searchParams.get('countryCode')==='IT'&&url.searchParams.get('city')==='Rome'&&url.searchParams.get('startDateTime')==='2026-10-30T00:00:00Z'&&url.searchParams.get('endDateTime')==='2026-11-06T23:59:59Z':url.searchParams.get('country')==='IT'&&url.searchParams.get('place.scope')==='FCO'&&url.searchParams.get('start.gte')==='2026-10-30'&&url.searchParams.get('start.lte')==='2026-11-06'));
});

test('An empty successful primary keeps failed-fallback coverage incomplete through editorial pagination without restarting the provider',async()=>{
 const rows=Array.from({length:60},(_,i)=>({id:'editorial-'+i,title:'Editorial '+i,starts_at:moment(i),category:'concert',country_code:'TR',city:'Istanbul',source_url:'https://example.com/e/'+i,updated_at:moment(0)}));let reads=0;
 const api=service(async input=>{reads++;if(String(input).includes('ticketmaster'))return Response.json({});throw new Error('private provider transport diagnostic');},curatedDb(rows));
 const first=await api.searchTravelEventPage(base);assert.equal(first.events.length,30);assert.equal(first.coverageStatus,'limited');assert.equal(first.coverageLimited,true);assert.equal(first.partial,true);assert.ok(first.nextCursor);
 const cursor=JSON.parse(decodeURIComponent(first.nextCursor));assert.deepEqual(JSON.parse(cursor.scope),[base.countryCode,'','',base.startDate,base.endDate,base.category,base.query,base.limit]);assert.equal(cursor.automatic,-1);assert.equal(cursor.unavailable,true);
 const second=await api.searchTravelEventPage(base,first.nextCursor);assert.equal(second.events.length,30);assert.equal(second.events[0].id,'editorial-30');assert.equal(second.coverageStatus,'limited');assert.equal(second.coverageLimited,true);assert.equal(second.partial,true);assert.equal(second.nextCursor,null);assert.equal(reads,2);
});

test('Empty first pages still fail when all automatic sources fail or an unavailable editorial source leaves no usable results',async()=>{
 const allFailed=service(async()=>new Response(null,{status:503}));await assert.rejects(allFailed.searchTravelEventPage(base),/event_provider_unavailable/);
 const unsupportedPrimary=service(async()=>new Response(null,{status:503}));await assert.rejects(unsupportedPrimary.searchTravelEventPage({...base,countryCode:'XK'}),/event_provider_unavailable/);
 const failedDb={from(){const q={select(){return q;},eq(){return q;},gte(){return q;},lte(){return q;},order(){return q;},or(){return q;},range(){return q;},then(yes,no){return Promise.resolve({data:null,error:{code:'08006'}}).then(yes,no);}};return q;}};
 const failedEditorial=service(async input=>String(input).includes('ticketmaster')?Response.json({}):new Response(null,{status:503}),failedDb);await assert.rejects(failedEditorial.searchTravelEventPage(base),/event_provider_unavailable/);
 const complete=await service(async input=>Response.json(String(input).includes('ticketmaster')?{}:{results:[]})).searchTravelEventPage(base);assert.equal(complete.events.length,0);assert.equal(complete.coverageStatus,'no_results');assert.equal(complete.coverageLimited,false);assert.equal(complete.partial,false);assert.equal(complete.nextCursor,null);
});

test('A typed city outside airport coverage keeps only real PredictHQ localities and never relabels other towns', async () => {
 const fixture = (id, locality) => ({id, title:'Event '+id, start:'2026-11-01T12:00:00Z', category:'concerts', country:'TR', ...(locality ? {geo:{address:{locality}}} : {})});
 const api=service(async input => String(input).includes('ticketmaster') ? Response.json({}) : Response.json({results:[fixture('match','Nevşehir'),fixture('other','İstanbul'),fixture('unknown')]}));
 const results=await api.predictHqEvents({...base, city:'Nevsehir', category:'concert'});
 assert.deepEqual(results.map(item=>item.city),['Nevşehir']); assert.equal(results[0].id,'predicthq:match');
 const countrywide=await api.predictHqEvents({...base, city:undefined, category:'concert'});
 assert.equal(countrywide.length,3); assert.equal(countrywide.find(item=>item.id==='predicthq:unknown').city,'');
});

test('A changed query cannot reuse an old cursor, and Ticketmaster deep paging limit is explicit',async()=>{
 const api=service(async input=>{const url=new URL(input),page=Number(url.searchParams.get('page'));return Response.json({_embedded:{events:Array.from({length:50},(_,i)=>tm(page*50+i))},page:{totalPages:25}});});
 const first=await api.searchTravelEventPage({...base,limit:50});await assert.rejects(api.searchTravelEventPage({...base,limit:50,query:'different'},first.nextCursor),/event_cursor_invalid/);
 const decoded=JSON.parse(decodeURIComponent(first.nextCursor));decoded.automatic=950;decoded.curated=-1;
 const last=await api.searchTravelEventPage({...base,limit:50},encodeURIComponent(JSON.stringify(decoded)));assert.equal(last.events.length,50);assert.equal(last.nextCursor,null);assert.equal(last.paginationLimited,true);
 await assert.rejects(api.searchTravelEventPage(base,'%malformed'),/event_cursor_invalid/);
});


// Isolated React host; no browser, account or provider writes.
const tick=()=>new Promise(setImmediate);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const jsx=(type,props,key)=>({type,props,key});
function load(path,imports={},globals={}){
  const output={exports:{}};
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,Intl,URL,URLSearchParams,Error,...globals})(name=>{
    if(Object.hasOwn(imports,name))return imports[name];
    if(name.endsWith('/event-occurrence'))return load('lib/event-occurrence.ts');
    if(name.endsWith('.css'))return {};
    throw Error(`Missing import ${name}`);
  },output,output.exports);
  return output.exports;
}
function host(){
  const slots=[];let cursor=0,dirty=false,effects=[],renderFn;
  const changed=(old,next)=>!old||!next||old.length!==next.length||next.some((value,index)=>!Object.is(value,old[index]));
  const memo=(fn,deps)=>{const at=cursor++;if(!slots[at]||changed(slots[at].deps,deps))slots[at]={value:fn(),deps};return slots[at].value;};
  const react={
    useState(initial){const at=cursor++;slots[at]||={value:typeof initial==='function'?initial():initial};return[slots[at].value,next=>{const value=typeof next==='function'?next(slots[at].value):next;if(!Object.is(value,slots[at].value)){slots[at].value=value;dirty=true;}}];},
    useRef(initial){const at=cursor++;return slots[at]||={current:initial};},
    useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),
    useEffect(fn,deps){const at=cursor++,old=slots[at];if(changed(old?.deps,deps)){const next={deps,effect:fn};slots[at]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=fn();});}else old.effect=fn;},
  };
  return{react,render(fn){renderFn=fn||renderFn;for(let pass=0;pass<30;pass++){cursor=0;dirty=false;effects=[];const view=renderFn();effects.forEach(fn=>fn());if(!dirty)return view;}throw Error('Render did not settle');},hide(){slots.forEach(slot=>slot.cleanup?.());},show(){slots.forEach(slot=>{if(slot.effect)slot.cleanup=slot.effect();});return this.render();},dispose(){this.hide();}};
}
function nodes(value){if(!value||typeof value!=='object'||value.props?.hidden||(value.type==='Sheet'&&!value.props.open))return[];return[value,...[value.props?.children].flat(Infinity).flatMap(nodes)];}
function text(value){return Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):typeof value==='string'||typeof value==='number'?String(value):'';}
function button(view,label){const found=nodes(view).find(node=>node.type==='button'&&text(node).trim()===label);assert.ok(found,`Button ${label}`);return found;}
const dates=load('mobile/src/lib/dates.ts');
const places=load('lib/travel-assistant/places.ts');
const searchText=load('mobile/src/lib/searchText.ts');
const eventContext=load('mobile/src/lib/eventSearchContext.ts',{'../../../lib/travel-assistant/places':places,'./deviceArea':{},'./travelAreas':{TRAVEL_CENTRES:[]},'./dates':dates,'./searchText':searchText});
const eventTime=load('lib/event-time.ts',{'./zoned-time':load('lib/zoned-time.ts')});
const today=()=>dates.localIsoDate(0);

function eventsHarness(initialContext,{initialFilters,initialSaved=[],saveFails=false,mergeFails=false,reminderFailure=false,reminderRead,initialOwner=null,trips=[],featuredRows=[],reminderRows=[],permissionState='granted',locale='en'}={}){
  const h=host(),cityRequests=[],searchRequests=[],merged=[],notices=[],filters=[],reminders=[],tripLists=[],attachments=[],external=[],created=[],cancelled=[],resumeHandlers=new Set();let contextHandled=0,accountOpens=0;
  const saved=new Map([['guest',initialSaved],['a',[{id:'a-private-event'}]],['b',[]]]);
  if(initialOwner)saved.set(initialOwner,initialSaved);
  const countryRows=[{alpha3:'TUR',name:'Türkiye'},{alpha3:'FRA',name:'France'},{alpha3:'ITA',name:'Italy'}];
  const imports={
    react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
    '../hooks/useCurrentTime':{useCurrentTime:()=>Date.now()},
    '../lib/localeFormatting':{formatAppDate:()=>''},'../../../lib/event-time':eventTime,
    '../components/CountryFlag':{CountryFlag:'CountryFlag'},'../components/DateTimeField':{DateTimeField:'DateTimeField'},'../components/Icon':{Icon:'Icon'},'../components/Sheet':{Sheet:'Sheet'},'../components/CountryPicker':{CountryPicker:'CountryPicker'},
    '../components/EventCompanionsPanel':{EventCompanionsPanel:'EventCompanionsPanel'},
    '../data/countries':{COUNTRY_LIST:countryRows},'../data/countryIso':{alpha2FromAlpha3:code=>({TUR:'TR',FRA:'FR',ITA:'IT'})[code]},
    '../lib/api':{listEventCities:country=>{const d=deferred();cityRequests.push({country,...d});return d.promise;},listTravelEvents:params=>{const d=deferred();searchRequests.push({params,...d});return d.promise;}},
    '../lib/featuredEvents':{loadFeaturedEvents:async()=>({events:featuredRows})},'../lib/dates':dates,'../lib/eventSearchContext':eventContext,
    '../lib/searchText':load('mobile/src/lib/searchText.ts'),
    '../lib/eventReminders':{readEventReminderState:async()=>({items:reminderRows,error:false}),eventReminderPermission:async()=> permissionState,openEventNotificationSettings:async()=>false,cancelEventReminder:async(eventId,owner)=>{cancelled.push({eventId,owner});return true;},reconcileEventReminders:async()=>{if(reminderRead)return reminderRead();if(reminderFailure)throw Error('reminder registry unavailable');return 0;},scheduleEventReminder:async(event,locale,owner)=>{reminders.push({event,locale,owner});return permissionState==='granted'?{ok:true}:{ok:false,reason:'permission'};}},
    '../lib/accountResume':{onAccountResume:callback=>{resumeHandlers.add(callback);return()=>resumeHandlers.delete(callback);}},
    '../lib/i18n':{useI18n:()=>({locale,copy:(...args)=>productionLocale.translateCopy(locale,...args),countryName:(_,name)=>name,dateLocale:locale})},'../lib/native':{openExternal:async url=>{external.push(url);return true;}},
    '../lib/storage':{getSavedTravelEvents:owner=>saved.get(owner||'guest')||[],mergeSavedTravelEvents:(events,owner)=>{if(mergeFails)throw Error('storage full');merged.push({events,owner});return{events:saved.get(owner||'guest')||[]};},toggleSavedTravelEvent:(event,owner)=>{if(saveFails)throw Error('storage full');const current=saved.get(owner||'guest')||[],adding=!current.some(item=>item.id===event.id),next=adding?[...current,event]:current.filter(item=>item.id!==event.id);saved.set(owner||'guest',next);return{events:next,saved:adding};}},
    '../lib/supabaseData':{attachTravelEventToCockpitTrip:async(owner,trip,event)=>{attachments.push({owner,trip,event});return{trip,attached:true};},getSupabaseDataErrorMessage:(_,fallback)=>fallback,listCockpitTrips:async(owner,token)=>{tripLists.push({owner,token});return trips;}},
  };
  const source=load('mobile/src/screens/EventsScreen.tsx',imports,{window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}}});
  let props={initialContext,initialFilters,ownerId:initialOwner,accessToken:initialOwner?'test-token':'',onOpenAccount(){accountOpens++;},onCreateEventTrip:event=>created.push(event),onNavigate(){},onNotice:notice=>notices.push(notice),onFiltersChange:value=>filters.push(value),onContextHandled:()=>contextHandled++,onFocusHandled:()=>{props.focusEventId='';}};
  const render=(next={})=>{props={...props,...next};return h.render(()=>source.EventsScreen(props));};
  const api={render,cityRequests,searchRequests,merged,notices,saved,filters,reminders,tripLists,attachments,external,created,get accountOpens(){return accountOpens;},get contextHandled(){return contextHandled;},
    country(code){nodes(render()).find(node=>node.type==='CountryPicker').props.onChange(code);return render();},
    async settle(){await tick();return render();},
    async cities(index,rows){cityRequests[index].resolve(rows);return api.settle();},
    async result(index,data=[],meta={}){searchRequests[index].resolve({data,meta:{providerConfigured:true,updatedAt:new Date().toISOString(),...meta}});return api.settle();},
    failSave(value){saveFails=value;},
    hide:()=>h.hide(),show:()=>h.show(),dispose:()=>h.dispose(),cancelled,setPermission:value=>{permissionState=value;},resume:()=>resumeHandlers.forEach(callback=>callback()),
  };render();return api;
}


const uiEvent=(id,startsAt,extra={})=>({id,title:id,city:'Paris',countryCode:'FR',category:'culture',startsAt,timePrecision:'exact',status:'scheduled',provider:'curated',sourceUrl:'https://example.com/'+id,updatedAt:new Date().toISOString(),...extra});

test('An arbitrary city can be typed without airport suggestions, persists on return, and invalidates old paging', async () => {
 const h=eventsHarness(undefined);
 try {
  await h.cities(0,[{name:'İstanbul',placeCode:'IST'}]); await h.result(0,[],{nextCursor:'old-country-page'});
  const field=()=>nodes(h.render()).find(node=>node.props?.id==='event-city-input');
  field().props.onChange({target:{value:'Nevşehir'}}); h.render();
  assert.equal(button(h.render(),'Show more events').props.disabled,true);
  button(h.render(),'Find events').props.onClick(); h.render();
  assert.equal(h.searchRequests.at(-1).params.city,'Nevşehir'); assert.equal(h.searchRequests.at(-1).params.placeCode,undefined);
  assert.equal(h.searchRequests.at(-1).params.cursor,undefined); assert.equal(h.filters.at(-1).cityName,'Nevşehir');
 } finally { h.dispose(); }
});

test('A reminder can be turned off from event details without deleting the saved event or scheduling again', async () => {
 const event=uiEvent('reminder-owned',new Date(Date.now()+7200000).toISOString());
 const h=eventsHarness(undefined,{initialOwner:'a',initialSaved:[event],reminderRows:[{eventId:event.id,state:'scheduled'}]});
 try {
  await h.settle(); h.render({focusEventId:event.id});
  button(h.render(),'Manage reminder').props.onClick(); h.render();
  button(h.render(),'Turn off reminder').props.onClick(); await h.settle();
  assert.deepEqual(h.cancelled,[{eventId:event.id,owner:'a'}]);
  assert.equal(h.saved.get('a')[0].id,event.id); assert.equal(h.reminders.length,0);
  assert.ok(h.notices.some(notice=>notice.includes('The event stays saved')));
 } finally { h.dispose(); }
});

test('Denied notification permission offers settings instructions, rechecks after resume and requires an explicit reminder retry', async () => {
 const event=uiEvent('permission-owned',new Date(Date.now()+7200000).toISOString());
 const h=eventsHarness(undefined,{initialOwner:'a',initialSaved:[event],permissionState:'denied'});
 try {
  await h.settle(); h.render({focusEventId:event.id});
  button(h.render(),'Remind me').props.onClick(); await h.settle();
  assert.match(text(h.render()),/Notifications are disabled/);
  button(h.render(),'Open notification settings').props.onClick(); await h.settle();
  assert.match(text(h.render()),/Settings → Notifications → LetsGo2Travel/);
  h.setPermission('granted'); h.resume(); await h.settle();
  assert.equal(h.reminders.length,1,'Resume only checks permission; it does not silently schedule');
  button(h.render(),'Set reminder').props.onClick(); await h.settle();
  assert.equal(h.reminders.length,2); assert.equal(h.saved.get('a').length,1);
  assert.ok(h.notices.some(notice=>notice.includes('Event saved and reminder set')));
 } finally { h.dispose(); }
});
const cardTitles=view=>nodes(view).filter(n=>n.type==='h3').map(text);

for(const failure of ['bookmarks','reminders'])test(`Successful event results and paging survive a failed local ${failure} update`,async()=>{
 const event=uiEvent('ticketmaster:real-upcoming',new Date(Date.now()+7200000).toISOString());
 const h=eventsHarness(undefined,{mergeFails:failure==='bookmarks',reminderFailure:failure==='reminders'});
 try{
  const view=await h.result(0,[event],{nextCursor:'provider-page-2',coverageLimited:true});
  assert.ok(cardTitles(view).includes(event.title),'A local persistence failure must not discard provider results');
  assert.doesNotMatch(text(view),/Events could not be loaded|storage full|reminder registry unavailable/);
  assert.equal(button(view,'Find events').props.disabled,false);
  assert.ok(h.notices.some(notice=>/saved events could not be refreshed|Event reminders could not be refreshed/.test(notice)));
  button(view,'Show more events').props.onClick();h.render();
  assert.equal(h.searchRequests.at(-1).params.cursor,'provider-page-2');
 }finally{h.dispose();}
});

test('Slow reminder maintenance cannot hold event results in loading or publish a notice after the screen is left',async()=>{
 let resolveReminder;
 const h=eventsHarness(undefined,{reminderRead:()=>new Promise(resolve=>{resolveReminder=resolve;})});
 try{
  const event=uiEvent('ticketmaster:ready-first',new Date(Date.now()+7200000).toISOString());
  const view=await h.result(0,[event]);
  assert.ok(cardTitles(view).includes(event.title));
  assert.equal(button(view,'Find events').props.disabled,false,'The successful search is ready independently of native reminders');
  h.dispose();resolveReminder(1);await tick();assert.deepEqual(h.notices,[]);
 }finally{h.dispose();}
});

test('Rapid repeated event search taps issue one provider request and permit a later retry',async()=>{
 const h=eventsHarness(undefined);
 try{
  let view=await h.result(0,[]);const search=button(view,'Find events');
  search.props.onClick();search.props.onClick();h.render();
  assert.equal(h.searchRequests.length,2,'Only one new request should start before React commits the disabled button');
  h.searchRequests[1].reject(Error('network unavailable'));view=await h.settle();
  button(view,'Find events').props.onClick();h.render();assert.equal(h.searchRequests.length,3);
 }finally{h.dispose();}
});

test('Returning to a retained event screen during a pending search restarts it and ignores its hidden response',async()=>{
 const h=eventsHarness(undefined);
 try{
  assert.equal(h.searchRequests.length,1);h.hide();h.show();
  assert.equal(h.searchRequests.length,2,'Returning cannot remain stuck with the previous loading state');
  const stale=uiEvent('ticketmaster:stale-hidden',new Date(Date.now()+7200000).toISOString());
  let view=await h.result(0,[stale]);assert.equal(cardTitles(view).includes(stale.title),false);
  const current=uiEvent('ticketmaster:current-return',new Date(Date.now()+7200000).toISOString());
  view=await h.result(1,[current]);assert.ok(cardTitles(view).includes(current.title));assert.equal(button(view,'Find events').props.disabled,false);
 }finally{h.dispose();}
});

for(const meta of [{providerConfigured:false},{providerConfigured:false,coverageStatus:'not_configured'},{coverageStatus:'not_configured'}])test(`An unavailable live search explains the missing listings and returns to usable filters without claiming a completed search: ${JSON.stringify(meta)}`,async()=>{
 const h=eventsHarness(undefined,{initialFilters:{countryCode:'FR',startDate:today(),endDate:dates.localIsoDate(7),category:'culture'}});
 try{
  let view=await h.result(0,[],meta);
  assert.match(text(view),/Live event search is unavailable right now/);
  assert.match(text(view),/We cannot show verified listings for this selection yet/);
  assert.doesNotMatch(text(view),/automatic event provider|not enabled|editorial|admin|No events found for these dates/i);
  const guide=nodes(view).find(n=>n.props?.['data-guide']==='event-search');
  assert.equal(guide.props['data-guide-complete'],undefined);assert.equal(guide.props['data-guide-event-recovery'],undefined);
  const filters=nodes(view).find(n=>n.type==='details'&&n.props.className==='event-filter-disclosure');
  let focused=0,scrolled=0;filters.props.ref.current={open:false,scrollIntoView(){scrolled++;},querySelector(){return{focus(){focused++;}};}};
  button(view,'Change country or dates').props.onClick();assert.equal(filters.props.ref.current.open,true);assert.equal(focused,1);assert.equal(scrolled,1);
  assert.equal(h.searchRequests.length,1,'Returning to the filters does not silently change the search');
  button(view,'Find events').props.onClick();h.render();view=await h.result(1,[],{providerConfigured:true,coverageStatus:'no_results'});
  assert.match(text(view),/No events found for these dates/);assert.doesNotMatch(text(view),/cannot show verified listings/);
  assert.equal(nodes(view).find(n=>n.props?.['data-guide']==='event-search').props['data-guide-event-recovery'],'empty');
 }finally{h.dispose();}
});

test('Verified event listings remain usable when live search is unavailable without displaying the missing-listings placeholder',async()=>{
 const h=eventsHarness(undefined);
 try{
  const event=uiEvent('curated:verified-listing',new Date(Date.now()+7200000).toISOString());
  const view=await h.result(0,[event],{providerConfigured:false,coverageStatus:'not_configured'});
  assert.ok(cardTitles(view).includes(event.title));assert.match(text(view),/Verified event listings are shown/);
  assert.doesNotMatch(text(view),/cannot show verified listings|No events found|automatic event provider|editorial/i);
 }finally{h.dispose();}
});

test('A guest event-to-trip action is retained and resumes the exact event after owner remount without creating a trip',async()=>{
 const event=uiEvent('ticketmaster:retained-event',new Date(Date.now()+7200000).toISOString()),pending=[];
 const guest=eventsHarness(undefined,{initialSaved:[event]});
 try{
  let view=guest.render({focusEventId:event.id,onTripIntentPending:value=>pending.push(value)});const detail=nodes(view).find(n=>n.type==='Sheet'&&n.props.open&&n.props.title==='Event details');
  button(detail,'Add to trip').props.onClick();await guest.settle();assert.equal(guest.accountOpens,1);assert.equal(pending[0].id,event.id);assert.deepEqual(guest.tripLists,[]);
 }finally{guest.dispose();}
 const member=eventsHarness(undefined,{initialOwner:'a'});let handled=0;
 try{
  member.render({pendingTripEvent:pending[0],onTripIntentHandled:()=>handled++});let view=await member.settle();
  const picker=nodes(view).find(n=>n.type==='Sheet'&&n.props.open&&n.props.title==='Add event to trip');assert.ok(picker);assert.match(text(picker),/ticketmaster:retained-event/);assert.equal(member.tripLists.length,1);assert.equal(member.tripLists[0].owner,'a');assert.equal(handled,1);assert.deepEqual(member.created,[]);
  member.render();await member.settle();assert.equal(member.tripLists.length,1,'Rerenders do not repeat a consumed intent');
 }finally{member.dispose();}
});

test('Featured concerts open the common detail with the original source ID and save, trip and chat actions',async()=>{
 const event=uiEvent('ticketmaster:featured-real-id',new Date(Date.now()+7200000).toISOString(),{title:'A real concert',ticketUrl:'https://tickets.example/real'});
 const h=eventsHarness(undefined,{initialOwner:'a',featuredRows:[event]});
 try{
  let view=h.render();nodes(view).find(n=>n.type==='details'&&n.props.className==='daily-featured-disclosure').props.onToggle({currentTarget:{open:true}});h.render();view=await h.settle();
  const list=nodes(view).find(n=>n.props?.className==='featured-event-list');nodes(list).find(n=>n.type==='button').props.onClick();view=h.render();
  const detail=nodes(view).find(n=>n.type==='Sheet'&&n.props.open&&n.props.title==='Event details');assert.ok(detail);assert.match(text(detail),/A real concert/);assert.deepEqual(h.external,[]);
  assert.equal(nodes(detail).find(n=>n.type==='EventCompanionsPanel').props.event.id,event.id);assert.ok(button(detail,'Add to trip'));button(detail,'Save').props.onClick();view=h.render();assert.equal(h.saved.get('a').some(saved=>saved.id===event.id),true);
  button(detail,'Open source').props.onClick();assert.deepEqual(h.external,[event.ticketUrl]);
 }finally{h.dispose();}
});

test('Event list prioritizes upcoming and date-only events, labels started events truthfully and preserves pages on retry',async()=>{
 const h=eventsHarness(undefined);const future=uiEvent('future',new Date(Date.now()+7200000).toISOString()),ongoing=uiEvent('ongoing',new Date(Date.now()-3600000).toISOString(),{endsAt:new Date(Date.now()+7200000).toISOString()}),unknown=uiEvent('time-unknown',today(),{timePrecision:'date',localDate:today()});
 try{
  let view=await h.result(0,[ongoing,future,unknown],{nextCursor:'cursor-one'});assert.deepEqual(new Set(cardTitles(view)),new Set(['time-unknown','future']));
  button(view,'Show events that have started (1)').props.onClick();view=h.render();assert.deepEqual(new Set(cardTitles(view)),new Set(['time-unknown','future','ongoing']));assert.equal(cardTitles(view).at(-1),'ongoing');assert.match(text(view),/Start time has passed/);assert.doesNotMatch(text(view),/Ended/);
  button(view,'Show more events').props.onClick();h.render();assert.equal(h.searchRequests[1].params.cursor,'cursor-one');assert.equal(h.searchRequests[1].params.paginated,true);h.searchRequests[1].reject(Error('provider unavailable'));view=await h.settle();assert.deepEqual(new Set(cardTitles(view)),new Set(['time-unknown','future','ongoing']));assert.equal(cardTitles(view).at(-1),'ongoing');assert.match(text(view),/Could not load more events/);
  button(view,'Show more events').props.onClick();h.render();assert.equal(h.searchRequests[2].params.cursor,'cursor-one');view=await h.result(2,[future,uiEvent('later',new Date(Date.now()+10800000).toISOString())],{nextCursor:null});assert.deepEqual(new Set(cardTitles(view)),new Set(['time-unknown','future','later','ongoing']));assert.equal(cardTitles(view).at(-1),'ongoing');assert.equal(nodes(view).filter(n=>n.type==='button'&&text(n)==='Show more events').length,0);
 }finally{h.dispose();}
});

test('Visible artist search and quick dates issue fresh paged searches with the shown query and range',async()=>{
 const h=eventsHarness(undefined);try{
  await h.result(0,[]);let view=h.render();const input=nodes(view).find(n=>n.props?.id==='event-name-query');input.props.onChange({target:{value:'Artist'}});view=h.render();nodes(view).find(n=>n.type==='form'&&n.props.role==='search').props.onSubmit({preventDefault(){}});h.render();assert.equal(h.searchRequests[1].params.query,'Artist');assert.equal(h.searchRequests[1].params.cursor,undefined);assert.equal(h.searchRequests[1].params.paginated,true);
  view=await h.result(1,[]);button(view,'30 days').props.onClick();h.render();assert.equal(h.searchRequests[2].params.startDate,today());assert.equal(h.searchRequests[2].params.endDate,dates.localIsoDate(30));assert.equal(h.searchRequests[2].params.query,'Artist');
 }finally{h.dispose();}
});


test('Automatic outage preserves successful first-page editorial results with unavailable metadata and no invented live coverage',async()=>{
 const rows=Array.from({length:60},(_,i)=>({id:'editorial-'+i,title:'Editorial '+i,starts_at:moment(i),category:'concert',country_code:'TR',city:'Istanbul',source_url:'https://example.com/e/'+i,updated_at:moment(0)}));let reads=0;
 const api=service(async()=>{reads++;return new Response(null,{status:503});},curatedDb(rows),{TICKETMASTER_API_KEY:'test'});
 const first=await api.searchTravelEventPage(base);assert.equal(first.events.length,30);assert.equal(first.coverageStatus,'provider_unavailable');assert.equal(first.coverageLimited,true);assert.equal(first.partial,true);assert.ok(first.nextCursor);
 const second=await api.searchTravelEventPage(base,first.nextCursor);assert.equal(second.events.length,30);assert.equal(second.coverageStatus,'provider_unavailable');assert.equal(second.nextCursor,null);assert.equal(reads,1,'Editorial pagination does not silently restart a failed automatic provider');
});

test('Editorial outages cannot return a successful empty page with an unchanged cursor',async()=>{
 const failedDb={from(){const q={select(){return q;},eq(){return q;},gte(){return q;},lte(){return q;},order(){return q;},or(){return q;},range(){return q;},then(yes,no){return Promise.resolve({data:null,error:{code:'08006'}}).then(yes,no);}};return q;}};
 const empty=service(async()=>Response.json({}),failedDb,{TICKETMASTER_API_KEY:'test'});await assert.rejects(empty.searchTravelEventPage(base),/event_provider_unavailable/);
 const populated=service(async()=>Response.json({_embedded:{events:Array.from({length:30},(_,i)=>tm(i))},page:{totalPages:1}}),failedDb,{TICKETMASTER_API_KEY:'test'});const first=await populated.searchTravelEventPage(base);assert.equal(first.events.length,30);assert.ok(first.nextCursor);await assert.rejects(populated.searchTravelEventPage(base,first.nextCursor),/event_provider_unavailable/);
});

test('Contradictory empty upstream pages fail for retry instead of repeating page zero or offset zero forever',async()=>{
 let malformed=false;const api=service(async()=>Response.json({_embedded:{events:malformed?[]:Array.from({length:50},(_,i)=>tm(i))},page:{totalPages:2}}),null,{TICKETMASTER_API_KEY:'test'});
 const first=await api.searchTravelEventPage(base);malformed=true;await assert.rejects(api.searchTravelEventPage(base,first.nextCursor),/event_provider_unavailable/);await assert.rejects(api.searchTravelEventPage(base),/event_provider_unavailable/);
 const phq=service(async()=>Response.json({results:[],next:'https://api.predicthq.com/v1/events/?offset=50'}),null,{PREDICTHQ_ACCESS_TOKEN:'test'});await assert.rejects(phq.searchTravelEventPage(base),/event_provider_unavailable/);
});

test('Distinct non-Latin titles are preserved by source and client deduplication',async()=>{
 const titles=['東京の音楽','京都の音楽'];const api=service(async()=>Response.json({_embedded:{events:titles.map((name,i)=>tm(i,{name,dates:{start:{localDate:'2026-11-01',dateTime:moment(0)}}}))}}),null,{TICKETMASTER_API_KEY:'test'});assert.equal((await api.searchTravelEventPage({...base,query:''})).events.length,2);
 const h=eventsHarness(undefined);try{const same=new Date(Date.now()+7200000).toISOString();const view=await h.result(0,titles.map((title,i)=>uiEvent('unicode-'+i,same,{title})));assert.deepEqual(cardTitles(view),titles);}finally{h.dispose();}
});

test('Distinct source occurrence IDs retain different sessions, venues and date-only entries in paged and nonpaged search',async()=>{
 const title='Fictional travelling performance',day='2026-11-01';
 const show=(id,time,venue)=>tm(0,{id,name:title,dates:{timezone:'Europe/Istanbul',start:{localDate:day,...(time?{dateTime:`${day}T${time}:00Z`}:{timeTBA:true})}},_embedded:{venues:[{name:venue,city:{name:'Istanbul'},country:{countryCode:'TR'}}]}});
 const raw=[show('date-only',null,'Hall A'),show('matinee','12:00','Hall A'),show('other-venue','12:00','Hall B'),show('distinct-source-id','12:00','Hall A'),show('evening','18:00','Hall A')];
 const api=service(async()=>Response.json({_embedded:{events:raw},page:{totalPages:1}}),null,{TICKETMASTER_API_KEY:'test'});
 const expected=new Set(raw.map(row=>'ticketmaster:'+row.id));
 for(const result of [await api.searchTravelEventPage({...base,query:''}),await api.searchTravelEvents({...base,query:''})]){
  assert.equal(result.events.length,raw.length);assert.deepEqual(new Set(result.events.map(event=>event.id)),expected);
 }
});

test('The event list retains distinct same-day occurrence IDs and opens the exact evening chat intent',async()=>{
 const h=eventsHarness(undefined),day=dates.localIsoDate(1),title='Fictional travelling performance';
 const rows=[uiEvent('ticketmaster:matinee',`${day}T12:00:00Z`,{title,provider:'ticketmaster',venue:'Hall A'}),uiEvent('ticketmaster:evening',`${day}T18:00:00Z`,{title,provider:'ticketmaster',venue:'Hall A'}),uiEvent('ticketmaster:other-venue',`${day}T12:00:00Z`,{title,provider:'ticketmaster',venue:'Hall B'})];
 try{
  let view=await h.result(0,rows);assert.equal(cardTitles(view).length,3);
  const entryButtons=nodes(view).filter(node=>node.type==='button'&&text(node).trim()==='Who’s going? · Chat');
  assert.equal(entryButtons.length,3);entryButtons[2].props.onClick();view=h.render();
  const panel=nodes(view).find(node=>node.type==='EventCompanionsPanel');assert.equal(panel.props.event,rows[1]);assert.equal(panel.props.event.id,'ticketmaster:evening');
  assert.equal(h.accountOpens,0);assert.equal(h.reminders.length,0);assert.equal(h.attachments.length,0);
 }finally{h.dispose();}
});

for(const nextCursor of [null,'next-raw-source-page'])test(`Limited empty event coverage is unconfirmed and has explicit retry without losing paging: ${String(nextCursor)}`,async()=>{
 const h=eventsHarness(undefined);
 try{
  let view=await h.result(0,[],{coverageLimited:true,coverageStatus:'limited',nextCursor});
  assert.match(text(view),/We could not fully check this selection/);assert.match(text(view),/This does not mean there are no events/);
  assert.doesNotMatch(text(view),/Verified event listings are shown|No events found for these dates/);
  const note=nodes(view).find(node=>String(node.props?.className||'').includes('event-provider-note'));
  assert.equal(note.props.role,'status');assert.ok(button(note,'Retry'));
  assert.equal(Boolean(nodes(view).find(node=>node.type==='button'&&text(node).trim()==='Show more events')),Boolean(nextCursor));
  const prior={...h.searchRequests[0].params};button(note,'Retry').props.onClick();h.render();
  assert.equal(h.searchRequests.length,2);assert.deepEqual({...h.searchRequests[1].params},prior);assert.equal(h.reminders.length,0);assert.equal(h.attachments.length,0);
  view=await h.result(1,[],{coverageStatus:'no_results',coverageLimited:false});assert.match(text(view),/No events found for these dates/);assert.doesNotMatch(text(view),/could not fully check/);
 }finally{h.dispose();}
});

const occurrence = load('lib/event-occurrence.ts');
const occurrenceBase = Object.freeze({id:'ticketmaster:one',provider:'ticketmaster',title:'Fictional performance',countryCode:'TR',city:'Istanbul',venue:'Public Hall',startsAt:'2026-11-01T12:00:00Z',timePrecision:'exact'});
for(const [name,patch,expected]of[
 ['same canonical ID despite changed metadata',{id:'ticketmaster:one',title:'Changed title',provider:'unknown',startsAt:'bad',venue:''},true],
 ['different source IDs at same provider',{id:'ticketmaster:two'},false],
 ['known cross-provider exact occurrence',{id:'curated:one',provider:'curated'},true],
 ['same instant with another offset',{id:'curated:one',provider:'curated',startsAt:'2026-11-01T15:00:00+03:00'},true],
 ['same instant with millisecond encoding',{id:'curated:one',provider:'curated',startsAt:'2026-11-01T12:00:00.000Z'},true],
 ['different same-day exact session',{id:'curated:one',provider:'curated',startsAt:'2026-11-01T18:00:00Z'},false],
 ['different venue',{id:'curated:one',provider:'curated',venue:'Another Hall'},false],
 ['different city',{id:'curated:one',provider:'curated',city:'Ankara'},false],
 ['different country',{id:'curated:one',provider:'curated',countryCode:'FR'},false],
 ['different title',{id:'curated:one',provider:'curated',title:'Another performance'},false],
 ['missing venue',{id:'curated:one',provider:'curated',venue:''},false],
 ['missing city',{id:'curated:one',provider:'curated',city:''},false],
 ['missing country',{id:'curated:one',provider:'curated',countryCode:''},false],
 ['missing title',{id:'curated:one',provider:'curated',title:''},false],
 ['unknown provider',{id:'unknown:one',provider:'unknown'},false],
 ['unknown timing precision',{id:'curated:one',provider:'curated',timePrecision:undefined},false],
 ['date-only timing',{id:'curated:one',provider:'curated',timePrecision:'date',startsAt:'2026-11-01'},false],
 ['partial clock',{id:'curated:one',provider:'curated',startsAt:'2026-11-01T12:00Z'},false],
 ['offset-unaware clock',{id:'curated:one',provider:'curated',startsAt:'2026-11-01T12:00:00'},false],
 ['malformed clock',{id:'curated:one',provider:'curated',startsAt:'2026-11-01T12:00:00+00:99'},false],
 ['missing ID',{id:'',provider:'curated'},false],
])test(`Shared occurrence comparison: ${name}`,()=>{
 const right=Object.freeze({...occurrenceBase,...patch}),before=JSON.stringify([occurrenceBase,right]);
 assert.equal(occurrence.sameEventOccurrence(occurrenceBase,right),expected);
 assert.equal(occurrence.sameEventOccurrence(right,occurrenceBase),expected);
 assert.equal(JSON.stringify([occurrenceBase,right]),before,'Comparison never changes canonical IDs or source fields');
});

test('Occurrence comparison validates real calendar clocks and preserves Unicode distinctions and date-only ambiguity',()=>{
 const alias=patch=>({...occurrenceBase,id:'curated:one',provider:'curated',...patch});
 assert.equal(occurrence.sameEventOccurrence({...occurrenceBase,startsAt:'2026-03-02T12:00:00Z'},alias({startsAt:'2026-02-30T12:00:00Z'})),false);
 assert.equal(occurrence.sameEventOccurrence({...occurrenceBase,startsAt:'2026-11-02T00:00:00Z'},alias({startsAt:'2026-11-01T24:00:00Z'})),false);
 assert.equal(occurrence.sameEventOccurrence({...occurrenceBase,startsAt:'2026-11-01T23:30:00Z'},alias({startsAt:'2026-11-02T02:30:00+03:00'})),true);
 assert.equal(occurrence.sameEventOccurrence({...occurrenceBase,startsAt:'2026-11-01T12:00:00.100Z'},alias({startsAt:'2026-11-01T12:00:00.1Z'})),true);
 assert.equal(occurrence.sameEventOccurrence({...occurrenceBase,title:'東京の音楽'},alias({title:'京都の音楽'})),false);
 assert.equal(occurrence.sameEventOccurrence({...occurrenceBase,title:'Beyoncé · Live'},alias({title:'BEYONCE Live'})),true);
 assert.equal(occurrence.sameEventOccurrence({...occurrenceBase,timePrecision:'date',startsAt:'2026-11-01'},alias({timePrecision:'date',startsAt:'2026-11-01'})),false);
 assert.equal(occurrence.sameEventOccurrence(null,alias({})),false);
 assert.equal(occurrence.sameEventOccurrence({id:''},{id:''}),false);
});

test('Finite source batches keep ambiguous same-provider IDs instead of indirectly merging both into an earlier cross-provider listing',()=>{
 const b=Object.freeze({...occurrenceBase,id:'curated:b',provider:'curated'}),a1=occurrenceBase,a2=Object.freeze({...occurrenceBase,id:'ticketmaster:two'});
 const result=occurrence.uniqueServiceEventOccurrences([b,a1,a2]);
 assert.equal(result.length,3);assert.equal(result[0],b);assert.equal(result[1],a1);assert.equal(result[2],a2);
 const ordinary=occurrence.uniqueServiceEventOccurrences([b,a1]);assert.equal(ordinary.length,1);assert.equal(ordinary[0],b);
 const repeated=occurrence.uniqueServiceEventOccurrences([b,{...b,title:'Later metadata'},a1]);assert.equal(repeated.length,1);assert.equal(repeated[0],b);
 assert.deepEqual(Array.from(occurrence.uniqueCanonicalEventIds([b,a1,a2,{...b,title:'Repeat'}]),event=>event.id),[b.id,a1.id,a2.id]);
});

test('Service cross-provider exact duplicates retain first source identity while finite-batch ambiguity preserves all original IDs',async()=>{
 const title='Fictional shared performance',instant='2026-11-01T12:00:00.000Z';
 const editorial={id:'curated:first',provider:'curated',title,category:'concert',country_code:'TR',city:'Istanbul',venue:'Public Hall',starts_at:instant,status:'scheduled',source_url:'https://official.example/first',updated_at:instant,featured:true};
 const automatic=id=>tm(0,{id,name:title,dates:{timezone:'Europe/Istanbul',start:{localDate:'2026-11-01',dateTime:'2026-11-01T15:00:00+03:00'}},_embedded:{venues:[{name:'Public Hall',city:{name:'Istanbul'},country:{countryCode:'TR'}}]}});
 for(const count of [1,2]){
  const api=service(async()=>Response.json({_embedded:{events:Array.from({length:count},(_,i)=>automatic('source-'+i))},page:{totalPages:1}}),curatedDb([editorial]),{TICKETMASTER_API_KEY:'test'});
  for(const result of [await api.searchTravelEventPage({...base,query:''}),await api.searchTravelEvents({...base,query:''}),await api.searchTravelEvents({...base,query:'',featured:true})]){
   assert.equal(result.events.length,count===1?1:3);
   assert.equal(result.events[0].id,'curated:first');assert.equal(result.events[0].sourceUrl,editorial.source_url);
   if(count===2)assert.deepEqual(new Set(result.events.map(event=>event.id)),new Set(['curated:first','ticketmaster:source-0','ticketmaster:source-1']));
  }
 }
});

test('Distinct source occurrences keep raw pagination offsets and every original provider ID',async()=>{
 const raw=Array.from({length:4},(_,i)=>tm(i,{id:'session-'+i,name:'Fictional sessions',dates:{start:{localDate:'2026-11-01',dateTime:moment(i*60)}},_embedded:{venues:[{name:'Same Hall',city:{name:'Istanbul'},country:{countryCode:'TR'}}]}}));
 const api=service(async()=>Response.json({_embedded:{events:raw},page:{totalPages:1}}),null,{TICKETMASTER_API_KEY:'test'}),search={...base,query:'',limit:2};
 const first=await api.searchTravelEventPage(search);assert.deepEqual(Array.from(first.events,event=>event.id),['ticketmaster:session-0','ticketmaster:session-1']);
 const cursor=JSON.parse(decodeURIComponent(first.nextCursor));assert.equal(cursor.v,1);assert.equal(cursor.provider,'ticketmaster');assert.equal(cursor.curated,-1);assert.equal(cursor.automatic,2);assert.equal(cursor.scope,JSON.stringify(['TR','','',base.startDate,base.endDate,'concert','',2]));
 const second=await api.searchTravelEventPage(search,first.nextCursor);assert.deepEqual(Array.from(second.events,event=>event.id),['ticketmaster:session-2','ticketmaster:session-3']);assert.equal(second.nextCursor,null);
});

test('Mobile pagination preserves returned canonical IDs without inferring cross-page aliases and deduplicates only actual repeated IDs',async()=>{
 const h=eventsHarness(undefined),at=new Date(Date.now()+7200000).toISOString(),b=uiEvent('curated:first',at,{title:'Fictional same metadata',provider:'curated',venue:'Same Hall'}),a2={...b,id:'ticketmaster:later-source-id',provider:'ticketmaster'};
 try{
  let view=await h.result(0,[b],{nextCursor:'page-two'});button(view,'Show more events').props.onClick();h.render();
  view=await h.result(1,[{...b,description:'Repeated ID'},a2]);assert.equal(cardTitles(view).length,2);
  const entries=nodes(view).filter(node=>node.type==='button'&&text(node).trim()==='Who’s going? · Chat');entries[1].props.onClick();view=h.render();
  assert.equal(nodes(view).find(node=>node.type==='EventCompanionsPanel').props.event,a2);
  assert.equal(h.searchRequests[1].params.cursor,'page-two');assert.equal(h.reminders.length,0);assert.equal(h.attachments.length,0);
 }finally{h.dispose();}
});

for(const [locale,expected]of Object.entries({tr:'Bu seçimin sonuçlarını tam olarak kontrol edemedik.',en:'We could not fully check this selection.',sq:'Nuk mund ta kontrollonim plotësisht këtë zgjedhje.',ro:'Nu am putut verifica complet această selecție.'}))test(`Limited-empty recovery uses the normal ${locale} copy catalog and preserves nonempty qualification`,async()=>{
 await productionLocale.loadLocaleMessages(locale);
 const h=eventsHarness(undefined,{locale});try{
  let view=await h.result(0,[],{coverageLimited:true,coverageStatus:'limited'});assert.ok(text(view).includes(expected));
  const note=nodes(view).find(node=>String(node.props?.className||'').includes('event-provider-note'));
  const retry=nodes(note).find(node=>node.type==='button');assert.ok(retry);retry.props.onClick();h.render();
  view=await h.result(1,[uiEvent('curated:visible',new Date(Date.now()+7200000).toISOString())],{coverageLimited:true,coverageStatus:'limited'});
  assert.equal(cardTitles(view).length,1);assert.equal(text(view).includes(expected),false);
  assert.ok(text(view).includes(productionLocale.translateCopy(locale,'Bu ülke için canlı etkinlik kapsamı şu anda sınırlı. Doğrulanmış etkinlik duyuruları gösteriliyor.','Live event coverage is currently limited for this country. Verified event listings are shown.','Mbulimi i aktiviteteve për këtë shtet është i kufizuar. Shfaqen njoftime të verifikuara.')));
 }finally{h.dispose();}
});

function aliasBoundary({curatedClock='2026-11-01T21:00:00+03:00',curatedNext=false,automaticNext=false,repeatId=false}={}){
 const title='Fictional one-to-one occurrence',instant='2026-11-01T18:00:00Z';
 const editorial={id:'curated:alias',provider:'curated',title,category:'concert',country_code:'TR',city:'Istanbul',venue:'Public Hall',starts_at:curatedClock,status:'scheduled',source_url:'https://official.example/curated-alias',updated_at:instant};
 const automatic=(id,time=instant,extra={})=>tm(0,{id,name:title,dates:{timezone:'Europe/Istanbul',start:{localDate:'2026-11-01',dateTime:time}},_embedded:{venues:[{name:'Public Hall',city:{name:'Istanbul'},country:{countryCode:'TR'}}]},...extra});
 const editorialRows=repeatId?[]:[editorial,...(curatedNext?[{...editorial,id:'curated:next',title:'Genuine next occurrence',starts_at:'2026-11-01T23:00:00Z',source_url:'https://official.example/next'}]:[])];
 const raw=[automatic('alias'),...(automaticNext?[automatic('next','2026-11-01T23:00:00Z',{name:'Genuine next occurrence'})]:[]),...(repeatId?[automatic('alias',instant,{name:'Repeated same ID'})]:[])];
 const api=service(async()=>Response.json({_embedded:{events:raw},page:{totalPages:1}}),curatedDb(editorialRows),{TICKETMASTER_API_KEY:'test'});
 return{api,search:{...base,query:'',limit:1},title};
}

test('A known excluded one-to-one alias at a page boundary is exhausted without a phantom second page',async()=>{
 const {api,search,title}=aliasBoundary();const first=await api.searchTravelEventPage(search);
 assert.equal(first.events.length,1);assert.equal(first.events[0].id,'ticketmaster:alias');assert.equal(first.events[0].title,title);
 assert.equal(first.nextCursor,null,'The already excluded curated alias must not reappear alone on another page');
});

test('Draining an excluded curated alias stops before the genuine next occurrence and keeps its exact raw position',async()=>{
 const {api,search}=aliasBoundary({curatedNext:true});const first=await api.searchTravelEventPage(search);
 const cursor=JSON.parse(decodeURIComponent(first.nextCursor));assert.equal(cursor.curated,1);assert.equal(cursor.automatic,-1);assert.equal(cursor.v,1);assert.equal(cursor.provider,'ticketmaster');
 const next=await api.searchTravelEventPage(search,first.nextCursor);assert.deepEqual(Array.from(next.events,event=>event.id),['curated:next']);assert.equal(next.nextCursor,null);
});

test('The mirrored source ordering drains only the excluded automatic alias and preserves the next provider position',async()=>{
 const {api,search}=aliasBoundary({curatedClock:'2026-11-01T15:00:00-03:00',automaticNext:true});const first=await api.searchTravelEventPage(search);
 assert.equal(first.events[0].id,'curated:alias');
 const cursor=JSON.parse(decodeURIComponent(first.nextCursor));assert.equal(cursor.curated,-1);assert.equal(cursor.automatic,1);assert.equal(cursor.v,1);assert.equal(cursor.provider,'ticketmaster');
 const next=await api.searchTravelEventPage(search,first.nextCursor);assert.deepEqual(Array.from(next.events,event=>event.id),['ticketmaster:next']);assert.equal(next.nextCursor,null);
});

test('Repeated actual IDs at a source frontier do not create another page or replace the first event',async()=>{
 const {api,search,title}=aliasBoundary({repeatId:true});const first=await api.searchTravelEventPage(search);
 assert.equal(first.events.length,1);assert.equal(first.events[0].id,'ticketmaster:alias');assert.equal(first.events[0].title,title);assert.equal(first.nextCursor,null);
});
