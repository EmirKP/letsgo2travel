import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
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
function curatedDb(rows){return{from(){let from=0,to=49;return{select(){return this;},eq(){return this;},gte(){return this;},lte(){return this;},order(){return this;},or(){return this;},range(a,b){from=a;to=b;return this;},then(yes,no){return Promise.resolve({data:rows.slice(from,to+1),error:null}).then(yes,no);}};}};}

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

function eventsHarness(initialContext,{initialFilters,initialSaved=[],saveFails=false,mergeFails=false,reminderFailure=false,reminderRead,initialOwner=null,trips=[],featuredRows=[]}={}){
  const h=host(),cityRequests=[],searchRequests=[],merged=[],notices=[],filters=[],reminders=[],tripLists=[],attachments=[],external=[],created=[];let contextHandled=0,accountOpens=0;
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
    '../lib/eventReminders':{cancelEventReminder:async()=>true,reconcileEventReminders:async()=>{if(reminderRead)return reminderRead();if(reminderFailure)throw Error('reminder registry unavailable');return 0;},scheduleEventReminder:async(event,locale,owner)=>{reminders.push({event,locale,owner});return{ok:true};}},
    '../lib/i18n':{useI18n:()=>({locale:'en',copy:(_,en)=>en,countryName:(_,name)=>name,dateLocale:'en'})},'../lib/native':{openExternal:async url=>{external.push(url);return true;}},
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
    hide:()=>h.hide(),show:()=>h.show(),dispose:()=>h.dispose(),
  };render();return api;
}


const uiEvent=(id,startsAt,extra={})=>({id,title:id,city:'Paris',countryCode:'FR',category:'culture',startsAt,timePrecision:'exact',status:'scheduled',provider:'curated',sourceUrl:'https://example.com/'+id,updatedAt:new Date().toISOString(),...extra});
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
