import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function load(filename, imports, globals = {}) {
  const code = ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX }}).outputText;
  const result = {exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,Intl,...globals})(name => {
    if(name.endsWith('.css')) return {};
    if(Object.hasOwn(imports,name)) return imports[name];
    throw Error(name);
  },result,result.exports);
  return result.exports;
}
function nodes(value) { return !value || typeof value !== 'object' ? [] : [value,...[value.props?.children].flat(Infinity).flatMap(nodes)]; }
function text(value) { return Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (text(node.props.children).trim() === label || node.props['aria-label'] === label));
function hookHost() {
  const slots = []; let cursor,dirty,effects,tree;
  const changed=(a,b)=>!a||!b||a.length!==b.length||b.some((value,i)=>!Object.is(value,a[i]));
  const react={
    useState(initial){const i=cursor++; if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial}; return [slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
    useRef(initial){const i=cursor++; if(!slots[i])slots[i]={current:initial};return slots[i];},
    useMemo(fn,deps){const i=cursor++;if(changed(slots[i]?.deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},
    useCallback(fn,deps){return react.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old?.deps,deps)){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  return {react,render(fn){for(let i=0;i<20;i++){cursor=0;dirty=false;effects=[];tree=fn();effects.forEach(e=>e());if(!dirty)return tree;}throw Error('Render loop');},dispose(){slots.forEach(s=>s?.cleanup?.());}};
}
const fixture = overrides => ({id:'a1',origin_code:'IST',destination_code:'LHR',origin_label:'Istanbul',destination_label:'London',departure_date:'2099-01-01',created_at:'2026-10-01',is_active:true,status:'active',notify_email:true,notify_push:false,...overrides});
function harness() {
  const host=hookHost(), requests=[], notices=[], timers=new Map(); let timerId=0;
  const call=(kind,...args)=>{const task=deferred();requests.push({kind,args,...task});return task.promise;};
  const copy=(_,en)=>en;
  class ApiError extends Error {}
  const api={ApiError,listAlerts:token=>call('list',token),deleteAlert:(...a)=>call('delete',...a),restoreAlert:(...a)=>call('restore',...a),updateAlert:(...a)=>call('patch',...a),createAlert:(...a)=>call('create',...a)};
  const {PriceAlertsScreen}=load('mobile/src/screens/PriceAlertsScreen.tsx',{
    react:host.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    '../components/AirportField':{AirportField:'AirportField'},'../components/DateTimeField':{DateTimeField:'DateTimeField'},'../components/Icon':{Icon:'Icon'},'../components/TravelToolArtwork':{TravelToolArtwork:'TravelToolArtwork'},'../components/PageHero':{PageHero:'PageHero'},
    '../lib/api':api,'../lib/dates':load('mobile/src/lib/dates.ts',{}),'../lib/push':{enablePushForUser:async()=>({ok:true}),isPushAvailable:()=>false},
    '../lib/localeFormatting':{formatAppDate:(date)=>date.toISOString()},'../lib/i18n':{useI18n:()=>({copy,dateLocale:'en-GB',locale:'en'})},'../lib/locale':{translateCopy:(_,__,en)=>en},
  },{window:{setTimeout:(fn)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)}});
  const props={user:{id:'owner'},accessToken:'token',onOpenAccount(){},onNotice:msg=>notices.push(msg)};
  let tree;
  const h={requests,notices,render(){tree=host.render(()=>PriceAlertsScreen(props));return tree;},get tree(){return tree;},async settle(){await tick();return h.render();},dispose:()=>host.dispose(),expire(){for(const fn of timers.values())fn();h.render();}};
  h.render(); return h;
}
async function ready(overrides) {const h=harness();h.requests[0].resolve([fixture(overrides)]);await h.settle();return h;}

test('Expired alert shows a clear state and no resume/channel controls, while deletion remains available',async()=>{
  const h=await ready({departure_date:'2020-01-01',is_active:false,status:'paused'});
  try {assert.match(text(h.tree),/EXPIRED/);assert.equal(button(h.tree,'Resume'),undefined);assert.equal(nodes(h.tree).filter(n=>n.type==='input'&&n.props.type==='checkbox').length,0);assert.ok(button(h.tree,'Delete alert'));}finally{h.dispose();}
});

test('Confirmed deletion remains hidden when an older refresh finishes; rapid duplicate taps issue one delete',async()=>{
  const h=await ready();try{
    button(h.tree,'Refresh').props.onClick();h.render();const stale=h.requests.at(-1);
    const remove=button(h.tree,'Delete alert');remove.props.onClick();remove.props.onClick();h.render();
    assert.equal(h.requests.filter(r=>r.kind==='delete').length,1);
    h.requests.at(-1).resolve({success:true});await h.settle();assert.ok(button(h.tree,'Undo'));assert.equal(button(h.tree,'Delete alert'),undefined);
    stale.resolve([fixture()]);await h.settle();assert.equal(button(h.tree,'Delete alert'),undefined);
  }finally{h.dispose();}
});

test('Failed delete keeps the alert visible and provides an error, no misleading undo/success state',async()=>{
  const h=await ready();try{button(h.tree,'Delete alert').props.onClick();h.requests.at(-1).reject(Error('offline'));await h.settle();assert.ok(button(h.tree,'Delete alert'));assert.equal(button(h.tree,'Undo'),undefined);assert.match(text(h.tree),/could not be deleted/);}finally{h.dispose();}
});

test('Undo waits for server confirmation and restores the original paused state',async()=>{
  const h=await ready({is_active:false,status:'paused'});try{
    button(h.tree,'Delete alert').props.onClick();h.requests.at(-1).resolve({success:true});await h.settle();
    button(h.tree,'Undo').props.onClick();h.render();const request=h.requests.at(-1);assert.equal(request.kind,'restore');assert.equal(request.args[1],false);assert.equal(button(h.tree,'Delete alert'),undefined);
    request.resolve({success:true});await h.settle();assert.ok(button(h.tree,'Resume'));assert.ok(button(h.tree,'Delete alert'));
  }finally{h.dispose();}
});

test('Undo expires without restoring and failed undo never creates a phantom local alert',async()=>{
  for(const fail of [false,true]){const h=await ready();try{
    button(h.tree,'Delete alert').props.onClick();h.requests.at(-1).resolve({success:true});await h.settle();
    if(fail){button(h.tree,'Undo').props.onClick();h.requests.at(-1).reject(Error('failed'));await h.settle();assert.match(text(h.tree),/could not be restored/);}else h.expire();
    assert.equal(button(h.tree,'Undo'),undefined);assert.equal(button(h.tree,'Delete alert'),undefined);
  }finally{h.dispose();}}
});
