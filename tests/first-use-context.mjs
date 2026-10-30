import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { realLocaleModule } from './fixtures/real-locale-modules.mjs';

const tick=()=>new Promise(setImmediate);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const jsx=(type,props,key)=>({type,props,key});
function load(path,imports={},globals={}){
  const output={exports:{}};
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,Intl,URL,URLSearchParams,Error,...globals})(name=>{
    if(Object.hasOwn(imports,name))return imports[name];
    const localeModule=realLocaleModule(name);if(localeModule)return localeModule;
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
    useEffect(fn,deps){const at=cursor++,old=slots[at];if(changed(old?.deps,deps)){const next={deps};slots[at]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=fn();});}},
  };
  return{react,render(fn){renderFn=fn||renderFn;for(let pass=0;pass<30;pass++){cursor=0;dirty=false;effects=[];const view=renderFn();effects.forEach(fn=>fn());if(!dirty)return view;}throw Error('Render did not settle');},dispose(){slots.forEach(slot=>slot.cleanup?.());}};
}
function nodes(value){if(!value||typeof value!=='object'||value.props?.hidden||(value.type==='Sheet'&&!value.props.open))return[];return[value,...[value.props?.children].flat(Infinity).flatMap(nodes)];}
function text(value){return Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):typeof value==='string'||typeof value==='number'?String(value):'';}
function button(view,label){const found=nodes(view).find(node=>node.type==='button'&&text(node).trim()===label);assert.ok(found,`Button ${label}`);return found;}
const dates=load('mobile/src/lib/dates.ts');
const places=load('lib/travel-assistant/places.ts');
const searchText=load('mobile/src/lib/searchText.ts');
const eventContext=load('mobile/src/lib/eventSearchContext.ts',{'../../../lib/travel-assistant/places':places,'./deviceArea':{},'./travelAreas':{TRAVEL_CENTRES:[]},'./dates':dates,'./searchText':searchText});
const eventTime=load('lib/event-time.ts',{'./zoned-time':load('lib/zoned-time.ts')});
const today=()=>dates.localIsoDate(0),week=()=>dates.localIsoDate(7);

test('Nearby context resolves country locally, keeps a nearby same-country city and uses the next seven calendar days',async()=>{
  const calls=[];
  const context=load('mobile/src/lib/eventSearchContext.ts',{
    '../../../lib/travel-assistant/places':places,
    './deviceArea':{countryAt:async point=>{calls.push(point);return'FR';}},
    './travelAreas':{TRAVEL_CENTRES:[{name:'Paris',latitude:48.86,longitude:2.35},{name:'Rome',latitude:41.9,longitude:12.5}]},
    './dates':dates,'./searchText':searchText,
  });
  const center={latitude:48.85,longitude:2.35};
  const result=await context.nearbyEventContext(center);
  assert.deepEqual({...result},{countryCode:'FR',cityName:'Paris',startDate:today(),endDate:week()});
  assert.equal(calls[0],center);
});

test('Unknown, remote or foreign-border locations do not silently select Turkey or the wrong city',async()=>{
  for(const scenario of ['unknown','far','border']){
    let calls=0;
    const api=load('mobile/src/lib/eventSearchContext.ts',{
      '../../../lib/travel-assistant/places':places,
      './deviceArea':{countryAt:async()=>{calls++;return scenario==='unknown'?'':scenario==='border'&&calls>1?'DE':'FR';}},
      './travelAreas':{TRAVEL_CENTRES:[{name:'Other country',latitude:scenario==='far'?41.9:48.85,longitude:scenario==='far'?12.5:2.35}]},
      './dates':dates,'./searchText':searchText,
    });
    const result=await api.nearbyEventContext({latitude:48.85,longitude:2.35});
    assert.equal(result.countryCode,scenario==='unknown'?'':'FR');assert.equal(result.cityName,undefined);
    assert.equal(calls,scenario==='border'?2:1);
  }
});

function eventsHarness(initialContext,{initialFilters,initialSaved=[],saveFails=false,initialOwner=null,trips=[]}={}){
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
    '../lib/featuredEvents':{loadFeaturedEvents:async()=>({events:[]})},'../lib/dates':dates,'../lib/eventSearchContext':eventContext,
    '../lib/searchText':load('mobile/src/lib/searchText.ts'),
    '../lib/eventReminders':{readEventReminderState:async()=>({items:[],error:false}),eventReminderPermission:async()=> 'granted',openEventNotificationSettings:async()=>false,cancelEventReminder:async()=>true,reconcileEventReminders:async()=>0,scheduleEventReminder:async(event,locale,owner)=>{reminders.push({event,locale,owner});return{ok:true};}},
    '../lib/accountResume':{onAccountResume:()=>()=>{}},
    '../lib/i18n':{useI18n:()=>({locale:'en',copy:(_,en)=>en,countryName:(_,name)=>name,dateLocale:'en'})},'../lib/native':{openExternal:async url=>{external.push(url);return true;}},
    '../lib/storage':{getSavedTravelEvents:owner=>saved.get(owner||'guest')||[],mergeSavedTravelEvents:(events,owner)=>{merged.push({events,owner});return{events:saved.get(owner||'guest')||[]};},toggleSavedTravelEvent:(event,owner)=>{if(saveFails)throw Error('storage full');const current=saved.get(owner||'guest')||[],adding=!current.some(item=>item.id===event.id),next=adding?[...current,event]:current.filter(item=>item.id!==event.id);saved.set(owner||'guest',next);return{events:next,saved:adding};}},
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
    dispose:()=>h.dispose(),
  };render();return api;
}

test('Event lesson recovery marks confirmed empty results separately from loading, failures and unavailable providers',async()=>{
  const h=eventsHarness(undefined),search=view=>nodes(view).find(node=>node.props?.['data-guide']==='event-search');
  try{
    assert.equal(search(h.render()).props['data-guide-event-recovery'],undefined);
    let view=await h.result(0,[]);assert.equal(search(view).props['data-guide-event-recovery'],'empty');
    button(view,'Find events').props.onClick();view=h.render();assert.equal(search(view).props['data-guide-event-recovery'],undefined,'Loading is not empty');
    h.searchRequests[1].reject(Error('Network unavailable'));await h.settle();view=h.render();assert.equal(search(view).props['data-guide-event-recovery'],undefined,'A failed request is not empty');
    assert.match(text(view),/could not be loaded/);
    button(view,'Find events').props.onClick();h.render();view=await h.result(2,[],{coverageStatus:'provider_unavailable'});
    assert.equal(search(view).props['data-guide-event-recovery'],undefined,'An unavailable provider cannot be described as a successful empty search');
  }finally{h.dispose();}
});

test('Event save lesson publishes success only after a new durable save and keeps existing saved items distinct',async()=>{
  const event=id=>({id,title:id,city:'Paris',countryCode:'FR',category:'culture',startsAt:`${today()}T12:00:00Z`,status:'scheduled',provider:'curated',sourceUrl:'https://example.test/event',updatedAt:new Date().toISOString()}),old=event('already-saved'),fresh=event('new-result');
  const h=eventsHarness(undefined,{initialSaved:[old],saveFails:true});
  const search=view=>nodes(view).find(node=>node.props?.['data-guide']==='event-search'),saves=view=>nodes(view).filter(node=>node.props?.['data-guide']==='event-save');
  try{
    let view=await h.result(0,[old]);assert.equal(search(view).props['data-guide-event-recovery'],'saved');assert.equal(saves(view)[0].props['data-guide-save-success'],undefined);
    button(view,'Find events').props.onClick();h.render();view=await h.result(1,[old,fresh]);assert.equal(search(view).props['data-guide-event-recovery'],undefined);
    assert.equal(saves(view)[0].props['aria-pressed'],true);assert.equal(saves(view)[1].props['aria-pressed'],false);
    saves(view)[1].props.onClick();view=h.render();assert.equal(saves(view)[1].props['data-guide-save-success'],undefined);assert.equal(saves(view)[1].props['aria-pressed'],false);assert.match(h.notices.at(-1),/Could not update saved events/);
    h.failSave(false);saves(view)[1].props.onClick();view=h.render();assert.equal(saves(view)[1].props['aria-pressed'],true);assert.equal(saves(view)[1].props['data-guide-save-success'],'1');assert.equal(search(view).props['data-guide-event-recovery'],'saved');
    assert.equal(h.saved.get('guest').length,2);
  }finally{h.dispose();}
});

test('Explicit nearby city is resolved before the first search, including category clicks during loading',async()=>{
  const h=eventsHarness({countryCode:'FR',cityName:'Paris',startDate:today(),endDate:week()});
  try{
    assert.equal(h.cityRequests[0].country,'FR');assert.equal(h.searchRequests.length,0);
    assert.equal(button(h.render(),'Find events').props.disabled,true);
    const concert=button(h.render(),'Concert');assert.equal(concert.props.disabled,true);concert.props.onClick();h.render();
    assert.equal(h.searchRequests.length,0,'A handler cannot start a countrywide request while context city is unresolved');
    await h.cities(0,[{name:'Paris',placeCode:'PAR'}]);
    assert.equal(h.searchRequests.length,1);
    assert.deepEqual({...h.searchRequests[0].params},{countryCode:'FR',city:'Paris',placeCode:'PAR',startDate:today(),endDate:week(),category:'concert',limit:30,query:'',paginated:true,cursor:undefined});
  }finally{h.dispose();}
});

test('A city absent from airport suggestions keeps its real city and country instead of broadening the search',async()=>{
  const h=eventsHarness({countryCode:'FR',cityName:'Paris',startDate:today(),endDate:week()});
  try{
    await h.cities(0,[{name:'Lyon',placeCode:'LYS'}]);
    assert.equal(h.searchRequests.length,1);assert.equal(h.searchRequests[0].params.countryCode,'FR');assert.equal(h.searchRequests[0].params.city,'Paris');assert.equal(h.searchRequests[0].params.placeCode,undefined);
    assert.doesNotMatch(text(h.render()),/all cities in the selected country/);assert.equal(h.searchRequests[0].params.endDate,week());
  }finally{h.dispose();}
});

test('Unknown nearby country waits for a deliberate selection; Worldwide remains a valid deliberate choice',async()=>{
  const h=eventsHarness({countryCode:'',startDate:today(),endDate:week()});
  try{
    assert.equal(h.cityRequests.length,0);assert.equal(h.searchRequests.length,0);
    assert.match(text(h.render()),/country could not be determined/);
    h.country('');button(h.render(),'Find events').props.onClick();h.render();
    assert.equal(h.searchRequests.length,1);assert.equal(h.searchRequests[0].params.countryCode,'');assert.equal(h.cityRequests.length,0);
  }finally{h.dispose();}
});

test('Normal event filters retain manual country/date choices and a worldwide search skips country-only city lookup',async()=>{
  const h=eventsHarness();
  try{
    assert.equal(h.searchRequests[0].params.countryCode,'TR');await h.result(0);await h.cities(0,[]);
    h.country('IT');await h.cities(1,[{name:'Roma',placeCode:'ROM'}]);
    nodes(h.render()).find(node=>node.props?.id==='event-city-input').props.onChange({target:{value:'Roma'}});
    const fields=nodes(h.render()).filter(node=>node.type==='DateTimeField');fields[1].props.onChange(week());h.render();
    button(h.render(),'Find events').props.onClick();h.render();
    assert.equal(h.searchRequests[1].params.countryCode,'IT');assert.equal(h.searchRequests[1].params.placeCode,'ROM');assert.equal(h.searchRequests[1].params.endDate,week());
    await h.result(1);h.country('');button(h.render(),'Find events').props.onClick();h.render();
    assert.equal(h.searchRequests[2].params.countryCode,'');assert.equal(h.searchRequests[2].params.endDate,week());
    assert.equal(h.cityRequests.some(request=>request.country===''),false);
  }finally{h.dispose();}
});

test('A late city response cannot overwrite a country the user manually chose during resolution',async()=>{
  const h=eventsHarness({countryCode:'FR',cityName:'Paris',startDate:today(),endDate:week()});
  try{
    h.country('IT');assert.equal(h.cityRequests.length,2);
    await h.cities(1,[{name:'Roma',placeCode:'ROM'}]);assert.equal(h.searchRequests[0].params.countryCode,'IT');
    await h.cities(0,[{name:'Paris',placeCode:'PAR'}]);
    assert.equal(nodes(h.render()).find(node=>node.type==='CountryPicker').props.value,'IT');
    assert.equal(nodes(h.render()).find(node=>node.props?.id==='event-city-input').props.value,'');
    assert.equal(h.searchRequests.length,1);
  }finally{h.dispose();}
});

test('Known local city spellings resolve only within their country instead of widening a Rome search to all Italy',async()=>{
  assert.equal(eventContext.matchesEventCity('Rome','Roma','IT'),true);
  assert.equal(eventContext.matchesEventCity('Rome','Roma','AU'),false);
  assert.equal(eventContext.matchesEventCity('Pristina','Prishtina','XK'),true);
  const h=eventsHarness({countryCode:'IT',cityName:'Roma',startDate:today(),endDate:week()});
  try{
    await h.cities(0,[{name:'Rome',placeCode:'FCO'}]);
    assert.equal(h.searchRequests[0].params.city,'Rome');assert.equal(h.searchRequests[0].params.placeCode,'FCO');
    assert.doesNotMatch(text(h.render()),/no city filter/);
  }finally{h.dispose();}
});

test('Returning restores country, city, dates and category even when the city-option refresh fails',async()=>{
  const previous={countryCode:'FR',cityPlaceCode:'PAR',cityName:'Paris',startDate:today(),endDate:week(),category:'food'};
  const h=eventsHarness(undefined,{initialFilters:previous});
  try{
    assert.deepEqual({...h.searchRequests[0].params},{countryCode:'FR',city:'Paris',placeCode:'PAR',startDate:today(),endDate:week(),category:'food',limit:30,query:'',paginated:true,cursor:undefined});
    assert.deepEqual({...h.filters[0]},{...previous,query:''});assert.equal(h.contextHandled,0);
    h.cityRequests[0].reject(Error('Options temporarily offline'));await h.settle();
    const city=nodes(h.render()).find(node=>node.props?.id==='event-city-input');assert.equal(city.props.value,'Paris');
    assert.match(text(h.render()),/your selection is kept/);
    await h.result(0);button(h.render(),'Find events').props.onClick();h.render();
    assert.equal(h.searchRequests[1].params.placeCode,'PAR');assert.equal(h.searchRequests[1].params.category,'food');
  }finally{h.dispose();}
});

test('Returning retains the artist query with its place and dates while a changed query starts at the first page',async()=>{
  const previous={countryCode:'FR',cityPlaceCode:'PAR',cityName:'Paris',startDate:today(),endDate:week(),category:'concert',query:'Sezen Aksu'};
  const h=eventsHarness(undefined,{initialFilters:previous});let persisted;
  try{
    let view=h.render();assert.equal(nodes(view).find(node=>node.props?.id==='event-name-query').props.value,'Sezen Aksu');
    assert.equal(h.searchRequests[0].params.query,'Sezen Aksu');assert.equal(h.searchRequests[0].params.cursor,undefined);
    view=await h.result(0,[],{nextCursor:'old-query-page-2'});
    nodes(view).find(node=>node.props?.id==='event-name-query').props.onChange({target:{value:'Tarkan'}});view=h.render();
    assert.equal(button(view,'Show more events').props.disabled,true,'An old search page cannot continue after the artist changes');
    nodes(view).find(node=>node.type==='form'&&node.props.className==='event-name-search').props.onSubmit({preventDefault(){}});h.render();
    assert.equal(h.searchRequests[1].params.query,'Tarkan');assert.equal(h.searchRequests[1].params.cursor,undefined);assert.equal(h.searchRequests[1].params.paginated,true);
    persisted={...h.filters.at(-1)};assert.deepEqual(persisted,{...previous,query:'Tarkan'});
  }finally{h.dispose();}
  const returned=eventsHarness(undefined,{initialFilters:persisted});
  try{
    assert.equal(nodes(returned.render()).find(node=>node.props?.id==='event-name-query').props.value,'Tarkan');
    assert.deepEqual({...returned.searchRequests[0].params},{countryCode:'FR',city:'Paris',placeCode:'PAR',startDate:today(),endDate:week(),category:'concert',limit:30,query:'Tarkan',paginated:true,cursor:undefined});
    assert.deepEqual({...returned.filters[0]},persisted);
  }finally{returned.dispose();}
});

test('Returning on a later calendar day clamps expired filters before the first automatic request',()=>{
  const h=eventsHarness(undefined,{initialFilters:{countryCode:'FR',cityPlaceCode:'PAR',cityName:'Paris',startDate:dates.localIsoDate(-2),endDate:dates.localIsoDate(-1),category:'culture'}});
  try{
    assert.equal(h.searchRequests.length,1);assert.equal(h.searchRequests[0].params.startDate,today());assert.equal(h.searchRequests[0].params.endDate,today());
    assert.doesNotMatch(text(h.render()),/Choose a valid date range/);
  }finally{h.dispose();}
});

test('A deliberate nearby intent overrides previous manual filters and is consumed once without losing its visible scope',async()=>{
  const previous={countryCode:'FR',cityPlaceCode:'PAR',cityName:'Paris',startDate:today(),endDate:dates.localIsoDate(30),category:'concert'};
  const h=eventsHarness({countryCode:'IT',cityName:'Roma',startDate:today(),endDate:week()},{initialFilters:previous});
  try{
    assert.equal(h.searchRequests.length,0);assert.equal(h.contextHandled,0);
    await h.cities(0,[{name:'Rome',placeCode:'FCO'}]);
    assert.deepEqual({...h.searchRequests[0].params},{countryCode:'IT',city:'Rome',placeCode:'FCO',startDate:today(),endDate:week(),category:'all',limit:30,query:'',paginated:true,cursor:undefined});
    assert.equal(h.contextHandled,1);
    h.render({initialContext:undefined});
    assert.match(text(h.render()),/Opened for your approximate location/);assert.equal(h.contextHandled,1);
    await h.result(0);h.country('FR');
    assert.doesNotMatch(text(h.render()),/Opened for your approximate location/);
    assert.equal(h.filters.at(-1).countryCode,'FR');assert.equal(h.filters.at(-1).cityPlaceCode,'');
  }finally{h.dispose();}
});

test('Consumed nearby context still resolves its original city when a failed option lookup is retried',async()=>{
  const h=eventsHarness({countryCode:'IT',cityName:'Roma',startDate:today(),endDate:week()});
  try{
    h.cityRequests[0].reject(Error('City options unavailable'));await h.settle();
    assert.match(text(h.render()),/City suggestions are unavailable.*your selection is kept/);assert.doesNotMatch(text(h.render()),/no city filter for Roma/);assert.equal(h.contextHandled,1);assert.equal(h.searchRequests[0].params.city,'Roma');
    await h.result(0);h.render({initialContext:undefined});
    const error=nodes(h.render()).find(node=>node.props?.className==='event-city-error');button(error,'Retry').props.onClick();h.render();
    await h.cities(1,[{name:'Rome',placeCode:'FCO'}]);
    assert.equal(nodes(h.render()).find(node=>node.props?.id==='event-city-input').props.value,'Roma');
    button(h.render(),'Find events').props.onClick();h.render();assert.equal(h.searchRequests.at(-1).params.placeCode,'FCO');assert.equal(h.contextHandled,1);
  }finally{h.dispose();}
});

test('Provider outages, disabled feeds and partial coverage never claim a verified empty event search',async()=>{
  for(const meta of [
    {coverageStatus:'provider_unavailable'},
    {coverageStatus:'not_configured',providerConfigured:false},
    {providerConfigured:false},
    {coverageStatus:'limited',coverageLimited:true},
  ]){
    const h=eventsHarness();
    try{
      const view=await h.result(0,[],meta);
      assert.doesNotMatch(text(view),/No events found for these dates/);
      assert.equal(nodes(view).find(node=>node.props?.['data-guide']==='event-search').props['data-guide-event-recovery'],undefined);
      assert.equal(nodes(view).find(node=>node.props?.['data-guide']==='event-search').props['data-guide-complete'],undefined,'An unavailable source must not advance the lesson as a successful search');
      if(meta.coverageStatus==='provider_unavailable'){
        assert.match(text(view),/could not check the results/);
        assert.equal(button(view,'Retry').props.disabled,false);
      }
    }finally{h.dispose();}
  }
});

test('Retrying an unavailable event source keeps the selected filters and can recover to a genuine empty result',async()=>{
  const initialFilters={countryCode:'FR',cityPlaceCode:'PAR',cityName:'Paris',startDate:today(),endDate:week(),category:'culture'};
  const h=eventsHarness(undefined,{initialFilters});
  try{
    let view=await h.result(0,[],{coverageStatus:'provider_unavailable'});
    const before=JSON.parse(JSON.stringify(h.searchRequests[0].params));
    button(view,'Retry').props.onClick();view=h.render();
    assert.equal(button(view,'Searching').props.disabled,true);
    assert.deepEqual(JSON.parse(JSON.stringify(h.searchRequests[1].params)),before);
    view=await h.result(1,[],{coverageStatus:'no_results'});
    assert.match(text(view),/No events found for these dates/);
    assert.doesNotMatch(text(view),/could not check the results/);
  }finally{h.dispose();}
});

function savedEvent(change={}){
  return{id:'saved-concert',title:'Saved concert',description:'A saved real-provider listing',city:'Paris',countryCode:'FR',venue:'Hall',category:'concert',startsAt:`${week()}T18:00:00Z`,localDate:week(),timeZone:'UTC',timePrecision:'exact',endsAt:null,status:'scheduled',provider:'curated',imageUrl:null,ticketUrl:null,sourceUrl:'https://example.test/concert',updatedAt:new Date().toISOString(),...change};
}
const detailSheet=view=>nodes(view).find(node=>node.type==='Sheet'&&node.props.title==='Event details');

test('A saved event exposes the existing reminder and trip actions without searching for the event again',async()=>{
  const event=savedEvent(),trip={id:'trip-paris',status:'upcoming',destinationCity:'Paris',startDate:today(),endDate:week(),checklistItems:[]};
  const h=eventsHarness(undefined,{initialOwner:'a',initialSaved:[event],trips:[trip]});
  try{
    let view=h.render({focusEventId:event.id});
    assert.ok(detailSheet(view));
    assert.equal(button(detailSheet(view),'Remind me').props.disabled,false);
    button(detailSheet(view),'Open source').props.onClick();await h.settle();
    assert.deepEqual(h.external,[event.sourceUrl]);
    button(detailSheet(h.render()),'Remind me').props.onClick();await h.settle();
    assert.equal(h.reminders.length,1);assert.equal(h.reminders[0].owner,'a');assert.equal(h.reminders[0].event.id,event.id);
    button(detailSheet(h.render()),'Add to trip').props.onClick();view=await h.settle();
    assert.equal(detailSheet(view),undefined,'The detail sheet does not stack above the trip picker');
    assert.equal(h.tripLists[0].owner,'a');
    const options=nodes(view).find(node=>node.props.className==='event-trip-options');
    assert.ok(options);nodes(options).find(node=>node.type==='button').props.onClick();view=await h.settle();
    assert.equal(h.attachments.length,1);assert.equal(h.attachments[0].owner,'a');assert.equal(h.attachments[0].event.id,event.id);
    assert.ok(detailSheet(view),'Return to the same event after attaching it');
  }finally{h.dispose();}
});

test('Saved event actions preserve date, status, guest and account boundaries',async()=>{
  for(const change of [{status:'cancelled'},{status:'completed'},{startsAt:'2000-01-01T18:00:00Z',localDate:'2000-01-01'}]){
    const event=savedEvent(change),h=eventsHarness(undefined,{initialSaved:[event]});
    try{
      const sheet=detailSheet(h.render({focusEventId:event.id}));assert.ok(sheet);
      assert.equal(nodes(sheet).some(node=>node.type==='button'&&['Add to trip','Remind me'].includes(text(node))),false);
      assert.ok(button(sheet,'Open source'));assert.equal(h.tripLists.length,0);assert.equal(h.reminders.length,0);
    }finally{h.dispose();}
  }
  const unknown=savedEvent({timePrecision:'date'}),h=eventsHarness(undefined,{initialSaved:[unknown]});
  try{
    let view=h.render({focusEventId:unknown.id});
    assert.equal(button(detailSheet(view),'Remind me').props.disabled,true);
    assert.match(text(detailSheet(view)),/confirmed start time/);
    button(detailSheet(view),'Add to trip').props.onClick();view=h.render();
    assert.equal(h.accountOpens,1);assert.equal(h.tripLists.length,0);assert.equal(h.reminders.length,0);
    view=h.render({ownerId:'b'});assert.equal(detailSheet(view),undefined,'The first new-account render cannot retain the old saved-event detail');
  }finally{h.dispose();}
});

test('Passport labels can use the same explicit localized country as the discovery screen on WebViews',()=>{
  const api=load('lib/planner-passport.ts',{'./country-intelligence/passports':{DESTINATION_INDEX:new Map(),PASSPORTS:{DE:{}},passportEntry(){},passportStayLabel(){}}});
  assert.equal(api.plannerPassportLabel({passportCountry:'DE',passportType:'ordinary'},'sq','Gjermania'),'Gjermania · E zakonshme');
  assert.equal(api.plannerPassportLabel({passportCountry:'DE',passportType:'ordinary'},'en'),'Germany · Ordinary');
  assert.equal(api.plannerPassportLabel({passportCountry:'',passportType:''},'sq','Gjermania'),'Pasaporta nuk është zgjedhur');
});

function accountHarness({locale='en',loading=false,recoveryPending=false}={}){
  const h=host(),requests=[],notices=[];let closes=0;
  const auth={user:null,configured:true,loading,recoveryPending,clearAuthError(){},signInWithEmail:(email,password)=>{const d=deferred();requests.push({email,password,...d});return d.promise;}};
  const source=load('mobile/src/components/AccountSheet.tsx',{
    react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/localeFormatting':{formatAppDate:()=>''},
    '../lib/capacitor':{isIOSNative:()=>false},'../lib/config':{config:{}},'./LegalSheet':{LegalSheet:'LegalSheet'},
    '../lib/supabaseData':{},'./Icon':{Icon:'Icon'},'./Sheet':{Sheet:'Sheet'},'../lib/i18n':{useI18n:()=>({copy:(tr,en,sq)=>locale==='tr'?tr:locale==='sq'?(sq||en):en,dateLocale:'en'})},'./AccountDeletionPanel':{AccountDeletionPanel:'AccountDeletionPanel'},
  });
  const render=()=>h.render(()=>source.AccountSheet({open:true,auth,onClose:()=>closes++,onNotice:value=>notices.push(value)}));
  return{render,auth,requests,notices,get closes(){return closes;},dispose:()=>h.dispose()};
}

test('The guest action is explicit in all three languages and clears credentials without authenticating',()=>{
  for(const [locale,label] of [['tr','Misafir olarak devam et'],['en','Continue as a guest'],['sq','Vazhdo si vizitor']]){
    const h=accountHarness({locale});
    try{
      let view=h.render();for(const node of nodes(view).filter(node=>node.type==='input'))node.props.onChange({target:{value:node.props.type==='email'?'example@example.invalid':'disposable-test-password'}});
      view=h.render();button(view,label).props.onClick();view=h.render();
      assert.equal(h.closes,1);assert.equal(h.requests.length,0);
      assert.ok(nodes(view).filter(node=>node.type==='input').every(node=>node.props.value===''));
    }finally{h.dispose();}
  }
});

test('Guest continuation cannot interrupt pending authentication or bypass password recovery',async()=>{
  const h=accountHarness();
  try{
    let view=h.render();for(const node of nodes(view).filter(node=>node.type==='input'))node.props.onChange({target:{value:node.props.type==='email'?'example@example.invalid':'test-password'}});
    button(h.render(),'Sign in').props.onClick();view=h.render();assert.equal(h.requests.length,1);
    assert.equal(button(view,'Continue as a guest').props.disabled,true);
    h.requests[0].reject(Error('Temporary auth failure'));await tick();view=h.render();assert.equal(button(view,'Continue as a guest').props.disabled,false);
  }finally{h.dispose();}
  const recovery=accountHarness({recoveryPending:true});
  try{assert.equal(nodes(recovery.render()).some(node=>node.type==='button'&&text(node)==='Continue as a guest'),false);}finally{recovery.dispose();}
});
