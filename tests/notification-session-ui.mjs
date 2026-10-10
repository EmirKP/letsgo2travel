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

const allPreferences = {comments:true,replies:true,follows:true,price_alert_email:true,price_alert_push:true};
function sessionHarness(filename, exportName, defaults, imports, globals = {}) {
  let host,key,tree,props=defaults;
  const react=Object.fromEntries(['useState','useRef','useEffect','useMemo','useCallback'].map(name=>[name,(...args)=>host.react[name](...args)]));
  const component=load(filename,{react,'react/jsx-runtime':{jsx,jsxs:jsx},...imports},{AbortController,...globals});
  const h={get tree(){return tree;},render(next={}){
    props={...props,...next};const outer=component[exportName](props);
    if(!host||key!==outer.key){host?.dispose();host=hookHost();key=outer.key;}
    tree=host.render(()=>outer.type(outer.props));return tree;
  },async settle(){await tick();return h.render();},dispose:()=>host.dispose()};
  h.render();return h;
}
function preferenceHarness(accessToken='token') {
  const requests=[];
  const copy=(_,en)=>en;
  const h=sessionHarness('mobile/src/components/NotificationPreferences.tsx','NotificationPreferences',{accessToken},{
    '../lib/api':{requestJson:(url,options)=>{const task=deferred();requests.push({url,options,...task});return task.promise;}},
    '../lib/i18n':{useI18n:()=>({copy})},
  });
  return Object.assign(h,{requests});
}
const checkbox=h=>nodes(h.tree).find(node=>node.type==='input');
const toggle=h=>checkbox(h).props.onChange({target:{name:checkbox(h).props.name,checked:!checkbox(h).props.checked}});

test('Preference writes are serialized and old-account writes cannot replace current preferences',async()=>{
  const h=preferenceHarness();try{
    h.requests[0].resolve({data:allPreferences});await h.settle();
    toggle(h);toggle(h);h.render();assert.equal(h.requests.length,2);assert.equal(checkbox(h).props.disabled,true);
    h.render({accessToken:'second-token'});assert.equal(h.requests[1].options.signal.aborted,true);assert.equal(checkbox(h),undefined);
    h.requests[2].resolve({data:{...allPreferences,comments:false}});await h.settle();assert.equal(checkbox(h).props.checked,false);
    h.requests[1].resolve({data:allPreferences});await h.settle();assert.equal(checkbox(h).props.checked,false);assert.equal(checkbox(h).props.disabled,false);
  }finally{h.dispose();}
});

test('Failed or malformed preference writes keep confirmed values; a reload cannot race another write',async()=>{
  const h=preferenceHarness();try{
    h.requests[0].resolve({data:allPreferences});await h.settle();toggle(h);
    h.requests[1].resolve({data:{comments:false}});await h.settle();assert.equal(checkbox(h).props.checked,true);assert.match(text(h.tree),/could not be loaded or saved/);
    button(h.tree,'Retry').props.onClick();toggle(h);h.render();assert.equal(h.requests.length,3);assert.equal(h.requests[2].options.method,undefined);assert.equal(checkbox(h).props.disabled,true);
    h.requests[2].resolve({data:{...allPreferences,comments:false}});await h.settle();assert.equal(checkbox(h).props.checked,false);
  }finally{h.dispose();}
});

test('Guests do not request private preferences',()=>{
  const h=preferenceHarness('');try{assert.equal(h.requests.length,0);assert.match(text(h.tree),/Sign in/);}finally{h.dispose();}
});

const notification=(id='one',kind='comment')=>({id,kind,author:{username:`person-${id}`,key:`user:${id}`},postId:kind==='follow'?null:'post-one',commentId:kind==='follow'?null:'comment-one',createdAt:'2026-10-11T12:00:00Z',readAt:null});
function centerHarness() {
  const requests=[],writes=[],intents=[],reads=new Map(),unread=[];
  const copy=(_,en)=>en;
  const request=(kind,token,signal)=>{const task=deferred();requests.push({kind,token,signal,...task});return task.promise;};
  const h=sessionHarness('mobile/src/components/NotificationCenter.tsx','NotificationCenter',{
    open:true,ownerId:'owner-one',accessToken:'token',online:true,onClose(){},onNavigate(){},onOpenRelease(){},
    onUnreadChange:value=>{unread.push(value);},onOpenSocial:value=>{intents.push(value);},
  },{
    '../lib/localeFormatting':{formatAppDate:()=> '11 Oct'},
    '../lib/api':{getVisaAppointmentNotifications:token=>request('visa',token),listAlerts:token=>request('alert',token),markVisaAppointmentNotificationRead:async()=>{}},
    '../lib/storage':{getReadNotificationIds:owner=>reads.get(owner)||[],getSavedRoutePlans:()=>[],hasSeenRelease:()=>true,
      markNotificationsRead:(ids,owner)=>{const next=[...new Set([...(reads.get(owner)||[]),...ids])];reads.set(owner,next);return next;}},
    '../lib/config':{config:{buildNumber:'test'},releaseId:'test'},
    './Icon':{Icon:'icon'},'./Sheet':{Sheet:'sheet'},'../lib/i18n':{useI18n:()=>({copy,dateLocale:'en-GB'})},
    '../lib/social':{socialRead:(_params,token,signal)=>request('social',token,signal),socialWrite:async(action,value,token)=>writes.push({action,value,token})},
  },{window:{addEventListener(){},removeEventListener(){}}});
  const resolveBatch=(offset,items=[])=>{requests[offset].resolve([]);requests[offset+1].resolve([]);requests[offset+2].resolve({items,nextOffset:null});};
  return Object.assign(h,{requests,writes,intents,reads,unread,resolveBatch});
}
const socialButton=(h,id)=>nodes(h.tree).find(node=>node.type==='button'&&text(node).includes(`@person-${id}`));

test('Notification account changes clear private items immediately and ignore old list responses',async()=>{
  const h=centerHarness();try{
    h.resolveBatch(0,[notification('one')]);await h.settle();assert.ok(socialButton(h,'one'));
    h.render({open:false});h.render({open:true});assert.equal(h.requests.length,6);
    h.render({ownerId:'owner-two',accessToken:'token'});assert.equal(h.requests[5].signal.aborted,true);assert.equal(socialButton(h,'one'),undefined);
    h.resolveBatch(6,[notification('two')]);await h.settle();h.resolveBatch(3,[notification('stale')]);await h.settle();
    assert.ok(socialButton(h,'two'));assert.equal(socialButton(h,'stale'),undefined);assert.equal(socialButton(h,'one'),undefined);
  }finally{h.dispose();}
});

test('Refresh and malformed schema failures retain confirmed notifications',async()=>{
  const h=centerHarness();try{
    h.resolveBatch(0,[notification()]);await h.settle();h.render({open:false});h.render({open:true});
    h.requests[3].reject(Error('offline'));h.requests[4].reject(Error('offline'));h.requests[5].resolve({items:[{...notification(),author:null}]});await h.settle();
    assert.ok(socialButton(h,'one'));assert.match(text(h.tree),/could not refresh/);
  }finally{h.dispose();}
});

test('Real social event schemas navigate to posts or follower profiles and acknowledge the right IDs',async()=>{
  const h=centerHarness();try{
    h.resolveBatch(0,[notification('comment'),notification('reply','reply'),notification('follow','follow')]);await h.settle();
    for(const id of ['comment','reply','follow'])socialButton(h,id).props.onClick();await h.settle();
    assert.deepEqual(h.intents.map(value=>JSON.parse(JSON.stringify(value))),[{postId:'post-one'},{postId:'post-one'},{profileKey:'user:follow'}]);
    assert.deepEqual(h.writes.map(value=>({action:value.action,id:value.value.id,token:value.token})),[
      {action:'notifications-read',id:'comment',token:'token'},{action:'notifications-read',id:'reply',token:'token'},{action:'notifications-read',id:'follow',token:'token'},
    ]);
    assert.equal(h.unread.at(-1),0);assert.equal(h.reads.has('owner-two'),false);
  }finally{h.dispose();}
});
