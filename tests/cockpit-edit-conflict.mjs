import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node',resolveJsonModule:true,esModuleInterop:true}});
const zones=require('../lib/zoned-time.ts'),airportZones=require('../lib/airport-time-zones.ts');
const dates=load('mobile/src/lib/dates.ts',{});
const form=load('mobile/src/lib/cockpitForm.ts',{'./dates':dates,'../../../lib/airport-time-zones':airportZones,'../../../lib/zoned-time':zones,'./locale':{translateCopy:(_locale,_tr,en)=>en}});
const edit=load('mobile/src/lib/cockpitEdit.ts',{'./cockpitForm':form,'./dates':dates,'../../../lib/airport-time-zones':airportZones,'../../../lib/zoned-time':zones,'./locale':{translateCopy:(_locale,_tr,en)=>en},'../data/countryIso':{alpha3FromAlpha2:()=> 'TUR'}});
const copy=(_tr,en)=>en;
const i18n={copy,locale:'en',dateLocale:'en-GB',countryName:(_code,name)=>name};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const jsx=(type,props)=>({type,props});
function load(file,imports){
  const loaded={exports:{}};const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const noop=()=>{};
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Date,Intl,AbortController,window:{setInterval:()=>1,clearInterval:noop,addEventListener:noop,removeEventListener:noop},document:{addEventListener:noop,removeEventListener:noop},navigator:{onLine:true},setTimeout:()=>1,clearTimeout:noop})(name=>{
    if(name in imports)return imports[name];if(name.endsWith('.css'))return {};
    if(name.startsWith('../components/')||name.startsWith('./')){const tag=name.split('/').at(-1);return {[tag]:tag};}
    throw Error(`Missing fixture ${name}`);
  },loaded,loaded.exports);return loaded.exports;
}
function hooks(){const slots=[];let cursor=0,effects=[],dirty,component,props;const changed=(a,b)=>!a||!b||a.length!==b.length||b.some((v,i)=>!Object.is(v,a[i]));const effect=(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||changed(old.deps,deps)){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}};const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;};return {react:{useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},useEffect:effect,useLayoutEffect:effect,useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps)},start(fn,initial){component=fn;props=initial;return this.render();},render(next){if(next)props={...props,...next};for(let i=0;i<15;i++){cursor=0;effects=[];dirty=false;const view=component(props);effects.forEach(fn=>fn());if(!dirty)return view;}throw Error('Unstable fixture');},dispose(){slots.forEach(slot=>slot?.cleanup?.());}};}
const nodes=t=>t&&typeof t==='object'?[t,...[t.props?.children].flat(Infinity).flatMap(nodes)]:[];
const text=t=>Array.isArray(t)?t.map(text).join(''):typeof t==='string'?t:t?.props?text(t.props.children):'';
const find=(t,type,p=()=>true)=>nodes(t).find(n=>n.type===type&&p(n.props));
const button=(t,label)=>find(t,'button',p=>text(p.children)===label);
const baseTrip=()=>({id:'test-trip',userId:'test-user-a',destinationCountry:'Türkiye',destinationCode:'TR',destinationCity:'Bodrum',startDate:'2026-10-05',endDate:'2026-10-08',status:'upcoming',updatedAt:'2026-10-01T08:00:00Z',checklistItems:[{id:'event',kind:'event',label:'Concert',eventStartsAt:'2026-10-06T18:00:00Z',completed:false}],originIata:null,destinationIata:null,departureAt:null,arrivalAt:null,flightPnr:'OLD123',flightNumber:null,airline:null});
function fixture(){const host=hooks(),editorHost=hooks(),updates=[],reads=[];let latest=baseTrip(),reloadWait=null;const shared={'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/i18n':{useI18n:()=>i18n},'../data/countries':{COUNTRY_LIST:[{alpha3:'TUR',name:'Türkiye'}]},'../data/countryIso':{alpha2FromAlpha3:()=> 'TR',alpha3FromAlpha2:()=> 'TUR'},'../lib/dates':dates,'../lib/cockpitForm':form};
  const Screen=load('mobile/src/screens/CockpitScreen.tsx',{...shared,react:host.react,'../../../lib/event-time':require('../lib/event-time.ts'),'../lib/localeFormatting':{formatAppDate:(d)=>d.toISOString().slice(0,10)},'../lib/cockpitJourney':{validJourneyIntent:()=>false},'../lib/journeyCountry':{journeyCountry:()=>null},'../lib/flightSelection':{activeFlightExpiry:()=>false},'../../../lib/flight-progress':{},'../../../lib/airport-time-zones':airportZones,'../../../lib/zoned-time':zones,'../lib/airports':{},'../lib/liveActivity':{syncFlightReminders:async()=>{},endAllFlightActivities:async()=>{}},'../lib/id':{createId:()=> 'test-id'},'../lib/native':{},'../lib/supabaseData':{listCockpitTrips:async(...args)=>{reads.push(args);return reloadWait?reloadWait.promise:[structuredClone(latest)];},areFlightFieldsSupported:()=>true,getSupabaseDataErrorMessage:(_e,fallback)=>fallback,updateCockpitTrip:(owner,id,update,token,version)=>{const wait=deferred();updates.push({owner,id,update,token,version,...wait});return wait.promise;}}}).CockpitScreen;
  const Editor=load('mobile/src/components/CockpitTripEditor.tsx',{...shared,react:editorHost.react,'../lib/cockpitEdit':edit}).CockpitTripEditor;
  host.start(Screen,{user:{id:'test-user-a'},accessToken:'UNIT_SESSION',onOpenAccount(){},onNotice(){}});
  const props=()=>find(host.render(),'CockpitTripEditor')?.props;
  return {host,editorHost,updates,reads,props,setLatest:value=>{latest=value;},deferReload:()=>{reloadWait=deferred();return reloadWait;},async open(){await tick();button(host.render(),'Edit trip').props.onClick();return editorHost.start(Editor,props());},editor:()=>editorHost.render(props()),dispose(){host.dispose();editorHost.dispose();}};
}
test('Editor conflict reload keeps the draft, adopts untouched remote changes, and requires a new save using refreshed CAS',async()=>{
  const f=fixture();try{
    let view=await f.open();find(view,'input',p=>p.value==='OLD123').props.onChange({target:{value:'MINE123'}});
    const saving=find(f.editor(),'form').props.onSubmit({preventDefault(){}});assert.equal(f.updates[0].version,baseTrip().updatedAt);
    f.updates[0].reject(Object.assign(new Error('Conflict'),{status:409}));await saving;
    view=f.editor();assert.equal(button(view,'Save changes').props.disabled,true);assert.equal(find(view,'input',p=>p.value==='MINE123').props.value,'MINE123');
    const latest={...baseTrip(),destinationCity:'İzmir',endDate:'2026-10-12',flightPnr:'THEIRS123',status:'active',updatedAt:'2026-10-01T09:00:00Z',checklistItems:[{id:'event',kind:'event',label:'Concert',eventStartsAt:'2026-10-06T18:00:00Z',completed:true}]};f.setLatest(latest);
    await button(view,'Reload latest record').props.onClick();view=f.editor();
    assert.match(text(view),/Review the fields below/);assert.equal(find(view,'input',p=>p.value==='MINE123').props.value,'MINE123');assert.equal(find(view,'input',p=>p.value==='İzmir').props.value,'İzmir');assert.equal(find(view,'DateTimeField',p=>p.label==='Trip end date').props.value,'2026-10-12');assert.equal(f.updates.length,1,'Reload never writes');
    const retry=find(view,'form').props.onSubmit({preventDefault(){}});assert.equal(f.updates[1].version,latest.updatedAt);assert.equal(f.updates[1].update.flightPnr,'MINE123');assert.equal(f.updates[1].update.destinationCity,'İzmir');assert.equal(f.updates[1].update.endDate,'2026-10-12');assert.equal(f.updates[1].update.checklistItems,undefined);assert.equal(f.updates[1].update.status,undefined);
    f.updates[1].resolve({...latest,...f.updates[1].update,updatedAt:'2026-10-01T10:00:00Z'});await retry;assert.equal(f.props(),undefined);
  }finally{f.dispose();}
});
test('Failed reload preserves draft and conflict state; old-account reload response cannot reopen its editor',async()=>{
  const f=fixture();try{
    await f.open();let saving=find(f.editor(),'form').props.onSubmit({preventDefault(){}});f.updates[0].reject(Object.assign(new Error('Conflict'),{status:409}));await saving;
    const first=f.deferReload(),loading=button(f.editor(),'Reload latest record').props.onClick();first.reject(new Error('offline'));await loading;
    assert.equal(button(f.editor(),'Save changes').props.disabled,true);assert.match(text(f.editor()),/could not be loaded/);
    const next=f.deferReload(),late=button(f.editor(),'Reload latest record').props.onClick();f.host.render({user:{id:'test-user-b'},accessToken:'UNIT_SESSION_B'});next.resolve([baseTrip()]);await late;
    assert.equal(f.props(),undefined);assert.equal(f.updates.length,1);
  }finally{f.dispose();}
});

test('Editing a saved DST-overlap flight preserves the chosen instant across equivalent PostgREST UTC spellings',()=>{
  for(const departureAt of ['2026-11-01T05:30:00+00:00','2026-11-01T05:30:00Z','2026-11-01T05:30:00.000Z']) {
    const trip={...baseTrip(),destinationCountry:'United Kingdom',destinationCode:'GB',destinationCity:'London',originIata:'JFK',destinationIata:'LHR',startDate:'2026-11-01',endDate:'2026-11-03',departureAt,arrivalAt:'2026-11-01T12:30:00+00:00'};
    const draft=edit.cockpitEditForm(trip);draft.flightPnr='NEW123';
    assert.equal(draft.departureTime,'01:30');assert.equal(draft.departureUtc,'2026-11-01T05:30:00.000Z');
    const result=edit.cockpitEditInput(trip,draft,'en',new Date('2026-10-01'));
    assert.equal(result.error,'');assert.equal(result.update.departureAt,'2026-11-01T05:30:00.000Z');assert.equal(result.update.flightPnr,'NEW123');
  }
});
test('Choosing an unknown airport zone derives untouched wall time from the saved UTC instant, without replacing typed date/time edits',()=>{
  const trip={...baseTrip(),originIata:'ZZZ',destinationIata:'BJV',departureAt:'2026-10-05T07:00:00+00:00',arrivalAt:'2026-10-05T10:00:00+00:00'};
  const baseline=edit.cockpitEditForm(trip);assert.equal(baseline.departureTime,'');
  const derived=edit.cockpitEditTimeZone(trip,baseline,baseline,'originAirport','America/New_York');
  assert.equal(derived.departureTime,'03:00');assert.equal(derived.startDate,'2026-10-05');assert.equal(derived.departureUtc,'2026-10-05T07:00:00.000Z');
  assert.equal(edit.cockpitEditInput(trip,derived,'en',new Date('2026-10-01')).error,'');
  const changedZone=edit.cockpitEditTimeZone(trip,baseline,derived,'originAirport','Europe/Istanbul');assert.equal(changedZone.departureTime,'10:00');
  const typed=edit.cockpitEditTimeZone(trip,baseline,{...derived,departureTime:'05:20'},'originAirport','Europe/Istanbul');assert.equal(typed.departureTime,'05:20');assert.equal(typed.departureUtc,undefined);
  const changedDate=edit.cockpitEditTimeZone(trip,baseline,{...baseline,startDate:'2026-10-06'},'originAirport','Europe/Istanbul');assert.equal(changedDate.startDate,'2026-10-06');assert.equal(changedDate.departureTime,'');
  assert.equal(edit.cockpitEditTimeZone(trip,baseline,baseline,'originAirport','Unknown/Zone').departureTime,'');
});
