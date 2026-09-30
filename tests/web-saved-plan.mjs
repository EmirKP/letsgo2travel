import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports={}) {
  const loaded={exports:{}};
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,Intl,URL})(name=>{if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>key})};if(name in imports)return imports[name];throw Error(`Missing fixture ${name}`);},loaded,loaded.exports);
  return loaded.exports;
}
const helper=load('lib/saved-plan-detail.ts');
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):typeof tree==='string'||typeof tree==='number'?String(tree):tree?.props?text(tree.props.children):'';
const nodes=tree=>tree&&typeof tree==='object'?[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)]:[];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:value=>resolve(value)};};
function hooks(){
  const slots=[];let cursor=0,effects=[],dirty,component,props;
  const changed=(a,b)=>!a||!b||a.length!==b.length||b.some((v,i)=>!Object.is(v,a[i]));
  return {react:{
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||changed(old.deps,deps)){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
    useMemo(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},
  },start(fn,initial={}){component=fn;props=initial;return this.render();},render(){for(let i=0;i<10;i++){cursor=0;effects=[];dirty=false;const view=component(props);effects.forEach(fn=>fn());if(!dirty)return view;}throw Error('Unstable render');},dispose(){slots.forEach(slot=>slot?.cleanup?.());}};
}
const snapshot={id:42,title:'My saved Bodrum',created_at:'2026-10-01T08:00:00Z',trip_data:{mobile_kind:'route_plan',saved_at:'2026-09-30T09:00:00Z',input:{origin:'İstanbul',days:'2 days'},plan:{summary:'Saved, not regenerated',routes:[{name:'Bodrum',country:'Türkiye',why:'Original plan',dailyPlan:['Original harbour visit','Original beach day'],warnings:['Saved source warning'],visaSourceUrl:'https://example.test/official'}]}}};
function fixture({list=false,id='42'}={}){
  const host=hooks(), calls=[],pending=[],initial=deferred();let authChange,unsubscribed=false;
  const supabase={auth:{getSession:()=>initial.promise,onAuthStateChange:fn=>(authChange=fn,{data:{subscription:{unsubscribe(){unsubscribed=true;}}}})},from(table){const filters=[];const query={select(fields){calls.push({table,fields,filters});return query;},eq(k,v){filters.push([k,v]);return query;},maybeSingle(){const request=deferred();pending.push(request);return request.promise;},order(){const request=deferred();pending.push(request);return request.promise;}};return query;}};
  const jsx=(type,props)=>({type,props});
  const imports={react:host.react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'next/navigation':{useSearchParams:()=>new URLSearchParams({id})},'next/link':{default:'Link'},'next/image':{default:'Image'},'lucide-react':{},'@/lib/supabase-client':{supabase},'@/lib/saved-plan-detail':helper,'../store/tripStore':{useTripStore:select=>select({savedTrips:[],hasHydrated:true,removeTrip(){},clearTrips(){}})}};
  const screen=load(list?'app/planlarim/page.tsx':'app/planlarim/kayit/saved-plan-detail.tsx',imports).default;
  host.start(screen);return {host,calls,pending,initial,signIn:owner=>authChange('SIGNED_IN',owner?{user:{id:owner}}:null),get unsubscribed(){return unsubscribed;}};
}

test('Web saved-plan list opens the precise stored record and clears account records on logout',async()=>{
  const f=fixture({list:true});try{
    f.initial.resolve({data:{session:{user:{id:'owner-a'}}}});await tick();
    assert.deepEqual(f.calls[0].filters,[['user_id','owner-a']]);f.pending[0].resolve({data:[snapshot],error:null});await tick();
    const link=nodes(f.host.render()).find(node=>node.type==='Link'&&text(node).includes('Planı aç'));
    assert.equal(link.props.href,'/planlarim/kayit?id=42');
    f.signIn(null);assert.doesNotMatch(text(f.host.render()),/My saved Bodrum/);
  }finally{f.host.dispose();}assert.equal(f.unsubscribed,true);
});
test('Opening a saved web route fetches by both record and current owner, renders original stops and never generates AI',async()=>{
  const f=fixture();try{
    f.initial.resolve({data:{session:{user:{id:'owner-a'}}}});await tick();
    assert.deepEqual(f.calls[0].filters,[['id','42'],['user_id','owner-a']]);
    f.pending[0].resolve({data:snapshot,error:null});await tick();const view=f.host.render();
    assert.match(text(view),/Saved, not regenerated/);assert.match(text(view),/Original harbour visit/);assert.match(text(view),/Original beach day/);
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].table,'user_trips');
  }finally{f.host.dispose();}
});
test('Account switch rejects the previous saved-plan response; missing record and signed-out state do not expose it',async()=>{
  const f=fixture();try{
    f.initial.resolve({data:{session:{user:{id:'owner-a'}}}});await tick();
    f.signIn('owner-b');f.pending[0].resolve({data:snapshot,error:null});await tick();assert.doesNotMatch(text(f.host.render()),/My saved Bodrum/);
    assert.deepEqual(f.calls[1].filters,[['id','42'],['user_id','owner-b']]);f.pending[1].resolve({data:null,error:null});await tick();assert.match(text(f.host.render()),/bulunamadı/);
    f.signIn(null);assert.match(text(f.host.render()),/giriş yapmalısın/);assert.equal(f.calls.length,2);
  }finally{f.host.dispose();}
});
test('Malformed links are rejected before a data query; stored unsafe URLs and invalid payloads never become render props',async()=>{
  const f=fixture({id:'../other'});try{f.initial.resolve({data:{session:{user:{id:'owner-a'}}}});await tick();assert.equal(f.calls.length,0);assert.match(text(f.host.render()),/Geçerli bir kayıt/);}finally{f.host.dispose();}
  const value=structuredClone(snapshot);value.trip_data.plan.routes[0].visaSourceUrl='javascript:alert(1)';value.trip_data.plan.routes[0].dailyPlan.push({html:'unsafe'});
  const parsed=helper.readSavedPlanDetail(value);assert.equal(parsed.routes[0].visaSourceUrl,'');assert.equal(parsed.routes[0].dailyPlan.length,2);assert.equal(parsed.createdAt,snapshot.trip_data.saved_at);
  assert.equal(helper.readSavedPlanDetail({trip_data:{plan:{routes:[{name:{bad:'object'}}]}}}),null);
});
