import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
require('ts-node').register({transpileOnly:true,moduleTypes:{'**':'cjs'},compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const model=require('../mobile/src/lib/mapJourney.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
const jsx=(type,props)=>({type,props});
const nodes=tree=>tree&&typeof tree==='object'?[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)]:[];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):typeof tree==='string'||typeof tree==='number'?String(tree):tree?.props?text(tree.props.children):'';
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&text(node.props.children).trim()===label);
let now=Date.parse('2026-10-24T09:00:00Z');
class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
function load(file,imports,globals={}){
  const loaded={exports:{}};
  const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{Date:ClockDate,URLSearchParams,...globals})(name=>{if(Object.hasOwn(imports,name))return imports[name];if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name.endsWith('.css'))return{};throw Error(name);},loaded,loaded.exports);
  return loaded.exports;
}
function device(){
  const values=new Map(),listeners=new Map();let denied=false;
  const localStorage={getItem:key=>{if(denied)throw Error('blocked');return values.get(key)??null;},setItem:(key,value)=>{if(denied)throw Error('blocked');values.set(key,value);},removeItem:key=>{if(denied)throw Error('blocked');values.delete(key);}};
  const window={addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),dispatchEvent:event=>{listeners.get(event.type)?.forEach(fn=>fn(event));return true;}};
  return{values,window,deny:value=>{denied=value;},globals:{localStorage,window,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}}};
}
function journey(){
  let result=model.createMapJourney({city:'Roma',center:{latitude:41.9,longitude:12.5},dayCount:2,startDate:'2026-10-24'});
  for(let i=0;i<3;i++)result=model.addJourneyStop(result,{id:`node/${i+1}`,name:`Stop ${i+1}`,latitude:41.9+i/100,longitude:12.5,category:'boutique',hours:null,description:null,free:null,accessible:null,website:null,representedCountry:null,sourceUrl:`https://www.openstreetmap.org/node/${i+1}`,fetchedAt:new Date(now).toISOString()},1,{fixedTime:i===0?'10:00':null});
  return result;
}
function fixture({ios=true,nativeAvailable=true}={}){
  now=Date.parse('2026-10-24T09:00:00Z');const d=device(),calls=[];
  const progress=load('mobile/src/lib/journeyProgress.ts',{'./mapJourney':model},d.globals);
  let availability=async()=>({available:nativeAvailable});
  const native={isAvailable:()=>availability(),setJourneyOwner:async options=>calls.push(['owner',options]),syncJourneyActivity:async options=>{calls.push(['sync',options]);return{active:true};},endJourneyActivity:async options=>calls.push(['end',options])};
  const bridge=load('mobile/src/lib/journeyLiveActivity.ts',{'./capacitor':{isIOSNative:()=>ios,plugin:name=>{assert.equal(name,'JourneyLiveActivity');return native;}},'./mapJourney':model,'./journeyProgress':progress},d.globals);
  return{d,progress,bridge,calls,holdAvailability:fn=>{availability=fn;}};
}
test('Only manual stop completion advances progress; resume preserves the fixed eight-hour window and exact account/day',()=>{
  const {d,progress:p}=fixture(),j=journey(),ids=model.journeyDayStops(j,1).map(stop=>stop.id);
  let state=p.readJourneyProgress('owner-a',j,1);assert.equal(state.startedAt,null);assert.equal(p.journeyProgressIsActive(state),false);
  state=p.startJourneyProgress('owner-a',j,1);assert.equal(p.journeyProgressIsActive(state),true);assert.deepEqual(plain(state.completedStopIds),[]);
  const expiry=state.expiresAt;now+=3*3600000;
  state=p.readJourneyProgress('owner-a',j,1);assert.equal(state.expiresAt,expiry);assert.equal(state.completedStopIds.length,0,'Clock time never completes a stop');
  state=p.completeJourneyStop('owner-a',j,1,ids[0],true);assert.deepEqual(plain(state.completedStopIds),[ids[0]]);assert.equal(state.expiresAt,expiry);
  assert.equal(p.readJourneyProgress('owner-b',j,1).startedAt,null);assert.equal(p.readJourneyProgress('owner-a',j,2).startedAt,null);assert.equal(p.readJourneyProgress(null,j,1).startedAt,null);
  assert.doesNotMatch([...d.values.values()].join(''),/latitude|longitude|Roma|Stop 1|flight|PNR/);
  now=Date.parse(expiry);state=p.readJourneyProgress('owner-a',j,1);assert.equal(p.journeyProgressIsActive(state),false);assert.equal(state.endedAt,expiry);
  assert.throws(()=>p.completeJourneyStop('owner-a',j,1,ids[1],true),/inactive/);
});
test('Stop reorder/deletion reconciles IDs without invented visits; another started day ends the earlier active guide',()=>{
  const {progress:p}=fixture(),j=journey(),ids=model.journeyDayStops(j,1).map(stop=>stop.id);
  p.startJourneyProgress('owner-a',j,1);p.completeJourneyStop('owner-a',j,1,ids[0],true);
  const reordered={...j,stops:j.stops.map(stop=>({...stop,order:2-stop.order}))};
  let state=p.persistReconciledJourneyProgress('owner-a',reordered,1);assert.deepEqual(plain(state.stopIds),[...ids].reverse());assert.deepEqual(plain(state.completedStopIds),[ids[0]]);
  const deleted={...reordered,stops:reordered.stops.filter(stop=>stop.id!==ids[0])};
  state=p.persistReconciledJourneyProgress('owner-a',deleted,1);assert.equal(state.completedStopIds.length,0);assert.equal(state.stopIds.length,2);
  assert.throws(()=>p.completeJourneyStop('owner-a',deleted,1,ids[0],true),/inactive/);
  const another={...j,id:'another-journey'};p.startJourneyProgress('owner-a',another,1);assert.equal(p.journeyProgressIsActive(p.readJourneyProgress('owner-a',j,1)),false);
  p.endJourneyProgress('owner-a',another,1);assert.equal(p.journeyProgressIsActive(p.readJourneyProgress('owner-a',another,1)),false);
});
test('Corrupt, cross-owner and extended-TTL progress is rejected without overwriting it; failed writes never claim completion',()=>{
  const {d,progress:p}=fixture(),j=journey(),state=p.startJourneyProgress('owner-a',j,1);
  assert.equal(p.validJourneyProgress({...state,ownerId:'owner-b'},'owner-a'),false);
  assert.equal(p.validJourneyProgress({...state,expiresAt:new Date(now+9*3600000).toISOString()},'owner-a'),false);
  assert.equal(p.validJourneyProgress({...state,completedStopIds:['forged']},'owner-a'),false);
  const key=[...d.values.keys()][0],before=d.values.get(key);d.deny(true);
  assert.throws(()=>p.completeJourneyStop('owner-a',j,1,state.stopIds[0],true));d.deny(false);assert.equal(d.values.get(key),before);
  d.values.set(key,'broken');assert.throws(()=>p.readJourneyProgress('owner-a',j,1));assert.throws(()=>p.startJourneyProgress('owner-a',j,1));assert.equal(d.values.get(key),'broken');
});
test('Completing the final real stop ends the guide, while explicit restart begins a fresh bounded session',()=>{
  const {progress:p}=fixture(),j=journey();let state=p.startJourneyProgress('owner-a',j,1);const firstStart=state.startedAt;
  for(const stopId of state.stopIds)state=p.completeJourneyStop('owner-a',j,1,stopId,true);
  assert.equal(p.journeyProgressIsActive(state),false);assert.equal(state.completedStopIds.length,3);assert.equal(state.endedAt,new Date(now).toISOString());
  now+=1000;state=p.startJourneyProgress('owner-a',j,1);assert.notEqual(state.startedAt,firstStart);assert.deepEqual(plain(state.completedStopIds),[]);assert.equal(Date.parse(state.expiresAt)-Date.parse(state.startedAt),p.JOURNEY_GUIDE_TTL_MS);
});
test('Bridge sends a bounded planned next stop only, updates manual count, ends on TTL and leaves all flight surfaces untouched',async()=>{
  const {progress:p,bridge:b,calls}=fixture(),j=journey();await b.syncJourneyLiveActivityOwner('owner-a');
  let state=p.startJourneyProgress('owner-a',j,1);let result=await b.syncJourneyLiveActivity('owner-a',j,1,state,'en','trip-a');assert.equal(result.active,true);
  let payload=calls.find(call=>call[0]==='sync')[1];assert.equal(payload.completed,0);assert.equal(payload.total,3);assert.equal(payload.nextStopName,'Stop 1');assert.equal(payload.nextScheduledTime,'10:00');
  const link=new URL(payload.deepLink);assert.equal(link.hostname,'journey');assert.equal(link.searchParams.get('journeyId'),j.id);assert.equal(link.searchParams.get('day'),'1');assert.equal(link.searchParams.get('tripId'),'trip-a');
  assert.doesNotMatch(JSON.stringify(payload),/latitude|longitude|provider|flight|PNR/);
  state=p.completeJourneyStop('owner-a',j,1,state.stopIds[0],true);await b.syncJourneyLiveActivity('owner-a',j,1,state,'en','trip-a');payload=calls.filter(call=>call[0]==='sync').at(-1)[1];assert.equal(payload.completed,1);assert.equal(payload.nextStopName,'Stop 2');
  now=Date.parse(state.expiresAt);result=await b.syncJourneyLiveActivity('owner-a',j,1,state,'en','trip-a');assert.equal(result.active,false);assert.equal(calls.at(-1)[0],'end');
});
test('Logout clears the old owner progress and a delayed availability reply cannot start another account guide',async()=>{
  const {progress:p,bridge:b,calls}=fixture(),j=journey();await b.syncJourneyLiveActivityOwner('owner-a');
  const state=p.startJourneyProgress('owner-a',j,1);let resolve;const pending=new Promise(yes=>{resolve=yes;});
  // Hold the native availability query after it has started, then change owner.
  const held=fixture();const j2=journey();await held.bridge.syncJourneyLiveActivityOwner('owner-a');const state2=held.progress.startJourneyProgress('owner-a',j2,1);
  held.holdAvailability(()=>pending);const syncing=held.bridge.syncJourneyLiveActivity('owner-a',j2,1,state2,'tr');await Promise.resolve();
  const switching=held.bridge.syncJourneyLiveActivityOwner('owner-b');resolve({available:true});const result=await syncing;await switching;
  assert.equal(result.reason,'owner-changed');assert.equal(held.calls.filter(call=>call[0]==='sync').length,0);assert.equal(held.progress.readJourneyProgress('owner-a',j2,1).startedAt,null);
  await b.syncJourneyLiveActivityOwner(null);assert.equal(p.readJourneyProgress('owner-a',j,1).startedAt,null);assert.equal(calls.at(-1)[1].ownerId,'guest');assert.equal((await b.syncJourneyLiveActivity('owner-a',j,1,state,'en')).reason,'owner-changed');
});
test('Unsupported platforms keep real local progress and never call a native activity API',async()=>{
  const {progress:p,bridge:b,calls}=fixture({ios:false}),j=journey();await b.syncJourneyLiveActivityOwner(null);const state=p.startJourneyProgress(null,j,1);
  const result=await b.syncJourneyLiveActivity(null,j,1,state,'tr');assert.equal(result.active,false);assert.equal(result.reason,'unsupported');assert.equal(calls.length,0);assert.equal(p.journeyProgressIsActive(p.readJourneyProgress(null,j,1)),true);
});
test('An obsolete same-owner callback cannot revive an ended guide or overwrite a newer explicit session',async()=>{
  const {progress:p,bridge:b,calls}=fixture(),j=journey();await b.syncJourneyLiveActivityOwner('owner-a');const original=p.startJourneyProgress('owner-a',j,1);
  p.endJourneyProgress('owner-a',j,1);let result=await b.syncJourneyLiveActivity('owner-a',j,1,original,'en');assert.equal(result.active,false);assert.equal(calls.at(-1)[0],'end');
  now+=1000;const newer=p.startJourneyProgress('owner-a',j,1);await b.syncJourneyLiveActivity('owner-a',j,1,newer,'en');const count=calls.length;
  result=await b.syncJourneyLiveActivity('owner-a',j,1,original,'en');assert.equal(result.reason,'session-changed');assert.equal(calls.length,count,'Stale same-day callback neither ends nor replaces the newer activity');
});

function hooks(){
  const slots=[];let cursor=0,effects=[],dirty,component,props;
  const effect=(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}};
  return{react:{useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},useEffect:effect,useLayoutEffect:effect},
    start(fn,initial){component=fn;props=initial;return this.render();},render(next){if(next)props={...props,...next};for(let pass=0;pass<20;pass++){cursor=0;effects=[];dirty=false;const tree=component(props);effects.forEach(fn=>fn());if(!dirty)return tree;}throw Error('Unstable UI');},close(){slots.forEach(slot=>slot?.cleanup?.());}};
}
test('The real guide starts explicitly, records manual stops, preserves failed edits and blocks stale-account buttons',async()=>{
  const f=fixture({ios:false}),host=hooks(),j=journey(),language={copy:(_tr,en)=>en,locale:'en'};
  const {JourneyLiveGuide}=load('mobile/src/components/JourneyLiveGuide.tsx',{react:host.react,'../lib/mapJourney':model,'../lib/journeyProgress':f.progress,'../lib/journeyLiveActivity':f.bridge,'../lib/accountResume':{onAccountResume:()=>()=>{}},'../lib/i18n':{useI18n:()=>language},'./Icon':{Icon:'Icon'}},{...f.d.globals,setTimeout:()=>1,clearTimeout:()=>{}});
  let tree=host.start(JourneyLiveGuide,{journey:j,day:1,ownerId:'owner-a'});await Promise.resolve();
  assert.ok(button(tree,"Start today's itinerary"));assert.equal(f.progress.readJourneyProgress('owner-a',j,1).startedAt,null);
  button(tree,"Start today's itinerary").props.onClick();tree=host.render();await Promise.resolve();
  assert.match(text(tree),/Next stop|NEXT STOP/);const first=button(tree,'Stop 1Complete');first.props.onClick();tree=host.render();assert.match(text(tree),/1\/3 stops completed/);
  const next=button(tree,'Stop 2Complete');f.d.deny(true);next.props.onClick();tree=host.render();assert.match(text(tree),/Progress could not be saved/);f.d.deny(false);assert.equal(f.progress.readJourneyProgress('owner-a',j,1).completedStopIds.length,1);
  host.render({ownerId:'owner-b'});next.props.onClick();assert.equal(f.progress.readJourneyProgress('owner-a',j,1).startedAt,null,'Owner change clears the earlier guide and stale buttons cannot restore it');assert.equal(f.progress.readJourneyProgress('owner-b',j,1).startedAt,null);
  tree=host.render();assert.ok(button(tree,"Start today's itinerary"));assert.doesNotMatch(text(tree),/1\/3 stops completed/);host.close();
});
test('Before-start persistence is single-submit and failed, changed-plan or changed-owner results never start a guide',async()=>{
  for(const outcome of ['failed','owner-changed','plan-changed','saved']){
    const f=fixture({ios:false}),host=hooks(),j=journey(),language={copy:(_tr,en)=>en,locale:'en'};let resolve,saves=0;const wait=new Promise(yes=>{resolve=yes;});
    const {JourneyLiveGuide}=load('mobile/src/components/JourneyLiveGuide.tsx',{react:host.react,'../lib/mapJourney':model,'../lib/journeyProgress':f.progress,'../lib/journeyLiveActivity':f.bridge,'../lib/accountResume':{onAccountResume:()=>()=>{}},'../lib/i18n':{useI18n:()=>language},'./Icon':{Icon:'Icon'}},{...f.d.globals,setTimeout:()=>1,clearTimeout:()=>{}});
    let tree=host.start(JourneyLiveGuide,{journey:j,day:1,ownerId:'owner-a',beforeStart:()=>{saves++;return wait;}});
    try{
      assert.match(text(tree),/Starting saves the plan first/);const start=button(tree,"Start today's itinerary");start.props.onClick();start.props.onClick();assert.equal(saves,1);assert.equal(f.progress.readJourneyProgress('owner-a',j,1).startedAt,null);
      tree=host.render();assert.match(text(tree),/Saving the plan/);
      if(outcome==='owner-changed')host.render({ownerId:'owner-b'});
      if(outcome==='plan-changed')host.render({journey:{...j,title:'Edited while saving'}});
      resolve(outcome!=='failed');await new Promise(yes=>setImmediate(yes));tree=host.render();
      assert.equal(f.progress.readJourneyProgress('owner-a',j,1).startedAt!==null,outcome==='saved',outcome);
      if(outcome==='failed')assert.match(text(tree),/guide did not start/);
      assert.equal(f.progress.readJourneyProgress('owner-b',j,1).startedAt,null);
    }finally{host.close();}
  }
});
