import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const plain = value => JSON.parse(JSON.stringify(value));
const jsx = (type, props) => ({ type, props });
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const find = (tree, type, check = () => true) => nodes(tree).find(node => node.type === type && check(node.props));
const button = (tree, label) => find(tree, 'button', props => text(props.children).trim() === label);
const tick = () => new Promise(resolve => setImmediate(resolve));
const dates = { isCalendarDate: value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, localIsoDate: () => '2026-10-01' };
function load(file, imports, globals = {}) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, Intl, ...globals })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name.endsWith('.css')) return {};
    throw Error(`Missing fixture ${name}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}
function hooks() {
  const slots = []; let cursor = 0, effects = [], dirty, component, props;
  const changed = (a,b) => !a || !b || a.length !== b.length || b.some((value,i) => !Object.is(value,a[i]));
  const memo = (fn,deps) => { const i=cursor++; if (!slots[i] || changed(slots[i].deps,deps)) slots[i]={value:fn(),deps}; return slots[i].value; };
  return { react: {
    useState(initial) { const i=cursor++; if (!slots[i]) slots[i]={value:typeof initial === 'function' ? initial() : initial}; return [slots[i].value, next => { const value=typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value,slots[i].value)) { slots[i].value=value; dirty=true; } }]; },
    useRef(initial) { const i=cursor++; return slots[i] || (slots[i]={current:initial}); },
    useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),
    useEffect(fn,deps) { const i=cursor++,old=slots[i]; if (!old || changed(old.deps,deps)) { slots[i]={...old,deps}; effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();}); } },
  }, start(fn,initial) { component=fn;props=initial;return this.render(); },
  render(next) { if(next)props={...props,...next}; for(let i=0;i<20;i++) { cursor=0;effects=[];dirty=false;const tree=component(props);effects.forEach(fn=>fn());if(!dirty)return tree; } throw Error('Unstable fixture'); },
  close() { slots.forEach(slot=>slot?.cleanup?.()); } };
}
function device() {
  const values=new Map(),listeners=new Map();let denied=false;
  const localStorage={getItem:key=>{if(denied)throw Error('blocked');return values.get(key)??null;},setItem:(key,value)=>{if(denied)throw Error('blocked');values.set(key,value);},removeItem:key=>{if(denied)throw Error('blocked');values.delete(key);}};
  const window={addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),dispatchEvent:event=>{listeners.get(event.type)?.forEach(fn=>fn(event));return true;}};
  return {values,window,deny:value=>{denied=value;},globals:{localStorage,window,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail;}}}};
}
const sourceTrip = (id='trip-a') => ({id,title:'Paris trip',destinationCity:'Paris',destinationCountry:'France',destinationCode:'FRA',startDate:'2026-10-10',endDate:'2026-10-12',adults:2,children:1,rooms:1,flightPnr:'PRIVATE',latitude:48.8,providerFlight:{secret:true}});
function contextFixture() {
  const h=hooks(),d=device();
  const context=load('mobile/src/lib/activeTripContext.ts',{react:h.react,'./dates':dates,'../data/countryIso':{alpha2FromAlpha3:code=>code==='FRA'?'FR':''}},d.globals);
  return {h,d,context};
}
test('Selected trip context is owner isolated, whitelisted, calendar-valid and keeps known same-trip party counts',()=>{
  const {d,context:c}=contextFixture(),trip=c.activeTripContextFromTrip(sourceTrip());
  assert.deepEqual(plain(trip),{tripId:'trip-a',title:'Paris trip',city:'Paris',countryCode:'FR',startDate:'2026-10-10',endDate:'2026-10-12',adults:2,children:1,rooms:1});
  assert.equal(c.writeActiveTripContext('owner-a',trip),true);
  assert.equal(c.readActiveTripContext('owner-b'),null);assert.equal(c.readActiveTripContext(null),null);
  assert.doesNotMatch([...d.values.values()].join(''),/PRIVATE|latitude|providerFlight/);
  c.writeActiveTripContext('owner-a',{tripId:'trip-a',title:'Updated Paris',countryCode:'FR',startDate:'2026-10-10',endDate:'2026-10-13'});
  assert.equal(c.readActiveTripContext('owner-a').adults,2);
  c.writeActiveTripContext('owner-a',{tripId:'trip-b',title:'Day trip',countryCode:'FR',startDate:'2026-10-10',endDate:'2026-10-10'});
  assert.equal(c.readActiveTripContext('owner-a').adults,undefined);
  assert.equal(c.normalizeActiveTripContext({...trip,startDate:'2026-02-30'}),null);
  assert.equal(c.normalizeActiveTripContext({...trip,startDate:'2026-10-10garbage'}),null);
  assert.equal(c.normalizeActiveTripContext({...trip,endDate:'2026-10-09'}),null);
  c.clearActiveTripContext('owner-a','trip-a');assert.equal(c.readActiveTripContext('owner-a').tripId,'trip-b');
  c.clearActiveTripContext('owner-a','trip-b');assert.equal(c.readActiveTripContext('owner-a'),null);
});
test('Context hook never flashes previous account data and storage failures preserve the stored selection',()=>{
  const {h,d,context:c}=contextFixture();
  c.writeActiveTripContext('owner-a',c.activeTripContextFromTrip(sourceTrip()));
  const read=props=>c.useActiveTripContext(props.owner);
  assert.equal(h.start(read,{owner:'owner-a'}).tripId,'trip-a');
  assert.equal(h.render({owner:'owner-b'}),null);
  c.writeActiveTripContext('owner-b',c.activeTripContextFromTrip(sourceTrip('trip-b')));
  assert.equal(h.render().tripId,'trip-b');
  d.deny(true);assert.equal(c.writeActiveTripContext('owner-b',c.activeTripContextFromTrip(sourceTrip('trip-c'))),false);
  d.deny(false);assert.equal(c.readActiveTripContext('owner-b').tripId,'trip-b');h.close();
});

function collaborationFixture({failCreate=false,performAction,options=[]}={}) {
  const h=hooks(),creates=[],actions=[],contexts=[],notices=[];
  const language={copy:(_tr,en)=>en,locale:'en',countryName:(_code,name)=>name};
  const trip={...sourceTrip(),destinationCode:'FR',userId:'owner-a',status:'upcoming',checklistItems:[]};
  const workspace={trip,myRole:'owner',members:[{userId:'owner-a',name:'Owner',role:'owner'}],options,budget:{currency:'EUR',targetAmount:0},expenses:[],balances:[]};
  const imports={react:h.react,'../lib/localeFormatting':{formatAppDate:date=>date.toISOString().slice(0,10)},'../lib/dates':dates,'../lib/i18n':{useI18n:()=>language},'../lib/native':{shareContent:async()=>true},
    '../lib/tripCollaboration':{listSharedTrips:async()=>[],getTripCollaboration:async()=>workspace,collaborationAction:async(_token,body)=>{actions.push(body);if(performAction)return performAction(body);return {data:{tripId:trip.id,inviteCode:'abc',inviteUrl:'https://example.test/invite'}};},tripInviteFromUrl:value=>value,rememberTripInvite:()=>{}},
    '../data/countries':{COUNTRY_LIST:[{alpha3:'FRA',name:'France'}]},'../data/countryIso':{alpha2FromAlpha3:()=> 'FR'},'../lib/supabaseData':{createCockpitTrip:async(...args)=>{creates.push(args);if(failCreate)throw Error('offline');return trip;},getSupabaseDataErrorMessage:(_cause,fallback)=>fallback},
    '../lib/activeTripContext':{activeTripContextFromTrip:()=>({tripId:trip.id}),writeActiveTripContext:(...args)=>contexts.push(args)},'../lib/id':{createId:()=> 'request-a'}};
  for(const name of ['DateTimeField','CountryPicker','Icon','TravelToolArtwork','CountryFlag','Sheet'])imports[`./${name}`]={[name]:name};
  const {TripCollaborationHub}=load('mobile/src/components/TripCollaborationHub.tsx',imports,{navigator:{}});
  h.start(TripCollaborationHub,{accessToken:'token',userId:'owner-a',refreshKey:'',initialEntry:'create',onNotice:notice=>notices.push(notice)});
  return {h,creates,actions,contexts,notices,trip};
}
test('Creating a shared trip reuses the ordinary trip record and opens its existing collaboration workspace',async()=>{
  const f=collaborationFixture();await tick();let tree=f.h.render();
  assert.ok(button(tree,'Create shared trip'));assert.ok(button(tree,'Join an invite'));
  find(tree,'CountryPicker').props.onChange('FRA');find(tree,'DateTimeField',p=>p.label==='Start date').props.onChange('2026-10-10');
  tree=f.h.render();find(tree,'DateTimeField',p=>p.label==='End date').props.onChange('2026-10-12');
  tree=f.h.render();const submit=find(tree,'form',p=>p.className==='trip-create-form').props.onSubmit;
  const first=submit({preventDefault(){}});await submit({preventDefault(){}});await first;await tick();tree=f.h.render();
  assert.equal(f.creates.length,1);assert.equal(f.creates[0][0],'owner-a');
  assert.deepEqual(plain(f.creates[0][1]),{destinationCountry:'France',destinationCode:'FR',destinationCity:'',startDate:'2026-10-10',endDate:'2026-10-12',appLanguage:'en'});
  assert.equal(find(tree,'Sheet').props.open,true);assert.match(text(tree),/Use this trip/);assert.ok(button(tree,'Invite friends'));
  await button(tree,'Invite friends').props.onClick();
  assert.deepEqual(plain(f.actions[0]),{action:'create_invite',tripId:f.trip.id,role:'editor'});assert.equal(f.contexts.length,1);f.h.close();
});
test('A failed shared-trip creation preserves dates and country for a deliberate retry',async()=>{
  const f=collaborationFixture({failCreate:true});await tick();let tree=f.h.render();
  find(tree,'CountryPicker').props.onChange('FRA');find(tree,'DateTimeField',p=>p.label==='Start date').props.onChange('2026-10-10');tree=f.h.render();
  await find(tree,'form',p=>p.className==='trip-create-form').props.onSubmit({preventDefault(){}});tree=f.h.render();
  assert.equal(find(tree,'CountryPicker').props.value,'FRA');assert.equal(find(tree,'DateTimeField',p=>p.label==='Start date').props.value,'2026-10-10');
  assert.match(text(tree),/Your details are kept/);assert.equal(f.contexts.length,0);assert.equal(f.actions.length,0);f.h.close();
});

async function openCreatedWorkspace(f) {
  await tick();let tree=f.h.render();
  find(tree,'CountryPicker').props.onChange('FRA');find(tree,'DateTimeField',p=>p.label==='Start date').props.onChange('2026-10-10');
  tree=f.h.render();await find(tree,'form',p=>p.className==='trip-create-form').props.onSubmit({preventDefault(){}});await tick();
  return f.h.render();
}

test('Two rapid invite taps create a single invitation and a later deliberate tap is allowed',async()=>{
  const f=collaborationFixture();
  try {
    let tree=await openCreatedWorkspace(f);const invite=button(tree,'Invite friends').props.onClick;
    invite();invite();await tick();tree=f.h.render();
    assert.equal(f.actions.filter(action=>action.action==='create_invite').length,1);
    assert.equal(button(tree,'Invite friends').props.disabled,false);
    button(tree,'Invite friends').props.onClick();await tick();f.h.render();
    assert.equal(f.actions.filter(action=>action.action==='create_invite').length,2);
  } finally {f.h.close();}
});

test('Two rapid join submissions accept an invitation once and open its exact shared trip',async()=>{
  const f=collaborationFixture();
  try {
    await tick();button(f.h.render(),'Join an invite').props.onClick();let tree=f.h.render();
    find(find(tree,'form',p=>p.className==='trip-invite-join'),'input').props.onChange({target:{value:'invite-code'}});
    tree=f.h.render();const join=find(tree,'form',p=>p.className==='trip-invite-join').props.onSubmit;
    const first=join({preventDefault(){}});await join({preventDefault(){}});await first;await tick();tree=f.h.render();
    assert.deepEqual(plain(f.actions),[{action:'accept_invite',inviteCode:'invite-code'}]);
    assert.equal(find(tree,'Sheet').props.open,true);assert.match(text(tree),/Paris trip/);
  } finally {f.h.close();}
});

test('A rapid second vote cannot toggle the first vote back before the busy state renders',async()=>{
  const f=collaborationFixture({options:[{id:'option-a',type:'activity',title:'Visit the Louvre',details:'',creatorName:'Owner',createdBy:'owner-a',voteCount:0,votedByMe:false}]});
  try {
    const tree=await openCreatedWorkspace(f);button(tree,'Voting').props.onClick();
    const vote=find(f.h.render(),'button',props=>props['aria-pressed']===false).props.onClick;
    vote();vote();await tick();f.h.render();
    assert.deepEqual(plain(f.actions),[{action:'toggle_vote',tripId:f.trip.id,optionId:'option-a'}]);
  } finally {f.h.close();}
});

test('A failed shared-plan suggestion unlocks a deliberate retry and keeps the entered title',async()=>{
  let attempt=0;const f=collaborationFixture({performAction:async()=>{if(++attempt===1)throw Error('offline');return {data:{}};}});
  try {
    const tree=await openCreatedWorkspace(f);button(tree,'Voting').props.onClick();
    find(f.h.render(),'input',props=>props['aria-label']==='Suggestion title').props.onChange({target:{value:'Louvre visit'}});
    const submit=find(f.h.render(),'form',props=>props.className==='trip-option-form').props.onSubmit;
    const first=submit({preventDefault(){}});await submit({preventDefault(){}});await first;let view=f.h.render();
    assert.equal(f.actions.length,1);assert.equal(find(view,'input',props=>props['aria-label']==='Suggestion title').props.value,'Louvre visit');
    assert.equal(button(view,'Start vote').props.disabled,false);
    await find(view,'form',props=>props.className==='trip-option-form').props.onSubmit({preventDefault(){}});view=f.h.render();
    assert.equal(f.actions.length,2);assert.equal(find(view,'input',props=>props['aria-label']==='Suggestion title').props.value,'');
  } finally {f.h.close();}
});
