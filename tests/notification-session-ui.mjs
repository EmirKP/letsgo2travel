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
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,Intl,setInterval,clearInterval,...globals})(name => {
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

test('Retry confirms a server-saved preference after a lost response and updates its parent',async()=>{
  const h=preferenceHarness();const saved=[];
  const push=()=>nodes(h.tree).find(node=>node.type==='input'&&node.props.name==='price_alert_push');
  try{
    h.render({onSaved:preferences=>saved.push(preferences)});
    h.requests[0].resolve({data:{...allPreferences,price_alert_push:false}});await h.settle();
    assert.equal(saved.at(-1).price_alert_push,false);
    push().props.onChange({target:{name:'price_alert_push',checked:true}});
    h.requests[1].reject(Error('response lost after server commit'));await h.settle();
    assert.equal(push().props.checked,false);assert.equal(saved.length,1);
    button(h.tree,'Retry').props.onClick();h.render();
    h.requests[2].resolve({data:allPreferences});await h.settle();
    assert.equal(push().props.checked,true);assert.equal(saved.at(-1).price_alert_push,true);
    assert.equal(saved.length,2);assert.equal(h.requests.length,3);
  }finally{h.dispose();}
});

const notification=(id='one',kind='comment')=>({id,kind,author:{username:`person-${id}`,key:`user:${id}`},postId:kind==='follow'?null:'post-one',commentId:kind==='follow'?null:'comment-one',createdAt:'2026-10-11T12:00:00Z',readAt:null});
function centerHarness(initial={},write) {
  const requests=[],writes=[],intents=[],reads=new Map(),unread=[];
  const copy=(_,en)=>en;
  const request=(kind,token,signal)=>{const task=deferred();requests.push({kind,token,signal,...task});return task.promise;};
  const h=sessionHarness('mobile/src/components/NotificationCenter.tsx','NotificationCenter',{
    open:true,ownerId:'owner-one',accessToken:'token',online:true,onClose(){},onNavigate(){},onOpenRelease(){},
    onUnreadChange:value=>{unread.push(value);},onOpenSocial:value=>{intents.push(value);},...initial,
  },{
    '../lib/localeFormatting':{formatAppDate:()=> '11 Oct'},
    '../lib/api':{getVisaAppointmentNotifications:token=>request('visa',token),listAlerts:token=>request('alert',token),markVisaAppointmentNotificationRead:async()=>{}},
    '../lib/storage':{getReadNotificationIds:owner=>reads.get(owner)||[],getSavedRoutePlans:()=>[],hasSeenRelease:()=>true,
      markNotificationsRead:(ids,owner)=>{const next=[...new Set([...(reads.get(owner)||[]),...ids])];reads.set(owner,next);return next;}},
    '../lib/config':{config:{buildNumber:'test'},releaseId:'test'},
    './Icon':{Icon:'icon'},'./Sheet':{Sheet:'sheet'},'../lib/i18n':{useI18n:()=>({copy,dateLocale:'en-GB'})},
    '../lib/social':{socialRead:(_params,token,signal)=>request('social',token,signal),socialWrite:async(action,value,token)=>{writes.push({action,value,token});if(write)return write(action,value,token);}},
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
    assert.deepEqual(h.intents.map(value=>JSON.parse(JSON.stringify(value))),[{postId:'post-one',commentId:'comment-one'},{postId:'post-one',commentId:'comment-one'},{profileKey:'user:follow'}]);
    assert.deepEqual(h.writes.map(value=>({action:value.action,id:value.value.id,token:value.token})),[
      {action:'notifications-read',id:'comment',token:'token'},{action:'notifications-read',id:'reply',token:'token'},{action:'notifications-read',id:'follow',token:'token'},
    ]);
    assert.equal(h.unread.at(-1),0);assert.equal(h.reads.has('owner-two'),false);
  }finally{h.dispose();}
});


test('closed inbox refreshes unread badge and older pages preserve the server total beyond the first twenty',async()=>{
 const h=centerHarness({open:false});try{
  assert.equal(h.requests.length,3);
  h.requests[0].resolve([]);h.requests[1].resolve([]);h.requests[2].resolve({items:[notification('first')],nextOffset:20,unreadCount:45});
  await h.settle();assert.equal(h.unread.at(-1),45);
  button(h.tree,'Show older notifications').props.onClick();h.render();assert.equal(h.requests.length,4);
  h.requests[3].resolve({items:[notification('older')],nextOffset:40,unreadCount:45});await h.settle();
  assert.ok(socialButton(h,'first'));assert.ok(socialButton(h,'older'));assert.equal(h.unread.at(-1),45);
  socialButton(h,'older').props.onClick();await h.settle();assert.equal(h.unread.at(-1),44);
 }finally{h.dispose();}
});

test('Opening the same unread notification twice acknowledges it once and preserves the server-wide unread total',async()=>{
 const h=centerHarness();try{
  h.requests[0].resolve([]);h.requests[1].resolve([]);h.requests[2].resolve({items:[notification('one'),notification('two')],nextOffset:20,unreadCount:45});await h.settle();
  const row=socialButton(h,'one');row.props.onClick();row.props.onClick();await h.settle();assert.equal(h.writes.length,1);assert.equal(h.unread.at(-1),44,'Only the chosen item is read, not another unseen item');
  socialButton(h,'one').props.onClick();await h.settle();assert.equal(h.writes.length,1,'An already acknowledged item can reopen without repeating the write');assert.equal(h.unread.at(-1),44);
  socialButton(h,'two').props.onClick();await h.settle();assert.equal(h.unread.at(-1),43);
 }finally{h.dispose();}
});

test('A rejected read acknowledgement leaves the unread badge intact and permits an explicit retry',async()=>{
 let fail=true;const h=centerHarness({},async()=>{if(fail)throw Error('offline');});try{
  h.resolveBatch(0,[notification('one'),notification('two')]);await h.settle();socialButton(h,'one').props.onClick();await h.settle();assert.equal(h.unread.at(-1),2);assert.match(text(h.tree),/Could not save read status/);
  fail=false;socialButton(h,'one').props.onClick();await h.settle();assert.equal(h.writes.length,2);assert.equal(h.unread.at(-1),1);assert.doesNotMatch(text(h.tree),/Could not save read status/);
 }finally{h.dispose();}
});

test('An inbox refresh started before a read acknowledgement cannot restore its stale unread total',async()=>{
 const h=centerHarness();try{
  h.resolveBatch(0,[notification('one'),notification('two')]);await h.settle();h.render({open:false});h.render({open:true});assert.equal(h.requests.length,6);
  socialButton(h,'one').props.onClick();await h.settle();assert.equal(h.unread.at(-1),1);
  h.resolveBatch(3,[notification('one'),notification('two')]);await h.settle();assert.equal(h.unread.at(-1),1,'The older snapshot cannot make the acknowledged item unread again');assert.equal(h.requests.length,9,'An obsolete snapshot requests a fresh authoritative page');
  h.requests[6].resolve([]);h.requests[7].resolve([]);h.requests[8].resolve({items:[{...notification('one'),readAt:'2026-10-30T19:00:00Z'},notification('two')],nextOffset:null,unreadCount:1});await h.settle();assert.equal(h.unread.at(-1),1);
 }finally{h.dispose();}
});

test('An older notification page cannot restore an unread total from before a confirmed read',async()=>{
 const h=centerHarness();try{
  h.requests[0].resolve([]);h.requests[1].resolve([]);h.requests[2].resolve({items:[notification('first')],nextOffset:20,unreadCount:45});await h.settle();button(h.tree,'Show older notifications').props.onClick();h.render();
  socialButton(h,'first').props.onClick();await h.settle();assert.equal(h.unread.at(-1),44);h.requests[3].resolve({items:[notification('older')],nextOffset:40,unreadCount:45});await h.settle();assert.equal(h.unread.at(-1),44);assert.equal(h.requests.length,7);
  h.requests[4].resolve([]);h.requests[5].resolve([]);h.requests[6].resolve({items:[{...notification('first'),readAt:'2026-10-30T19:00:00Z'}],nextOffset:20,unreadCount:44});await h.settle();assert.equal(h.unread.at(-1),44);
 }finally{h.dispose();}
});

test('A read-all acknowledgement prevents a late per-item acknowledgement from consuming a newer unread notification',async()=>{
 const pending=deferred(),h=centerHarness({},async(_action,value)=>{if(value.id==='one')return pending.promise;});try{
  h.resolveBatch(0,[notification('one'),notification('two')]);await h.settle();socialButton(h,'one').props.onClick();button(h.tree,'Mark all as read').props.onClick();await h.settle();assert.equal(h.unread.at(-1),0);
  h.render({open:false});h.render({open:true});h.requests[3].resolve([]);h.requests[4].resolve([]);h.requests[5].resolve({items:[{...notification('one'),readAt:'2026-10-30T19:00:00Z'},notification('new')],nextOffset:null,unreadCount:1});await h.settle();pending.resolve();await h.settle();assert.equal(h.unread.at(-1),1);assert.ok(socialButton(h,'new'));
 }finally{h.dispose();}
});

test('A pending old-account read acknowledgement cannot change the new owner inbox or unread badge',async()=>{
 const pending=deferred(),h=centerHarness({},()=>pending.promise);try{
  h.resolveBatch(0,[notification('one'),notification('two')]);await h.settle();socialButton(h,'one').props.onClick();h.render({ownerId:'owner-two',accessToken:'other-token'});h.resolveBatch(3,[notification('other')]);await h.settle();assert.equal(h.unread.at(-1),1);
  pending.resolve();await h.settle();assert.equal(h.unread.at(-1),1);assert.equal(socialButton(h,'one'),undefined);assert.ok(socialButton(h,'other'));assert.equal(h.writes[0].token,'token');
 }finally{h.dispose();}
});

test('An explicit read-all retry clears its confirmed read failure without adding another action',async()=>{
 let fail=true;const h=centerHarness({},async()=>{if(fail)throw Error('response lost');});try{
  h.resolveBatch(0,[notification('one'),notification('two')]);await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();
  assert.equal(h.unread.at(-1),2);assert.match(text(h.tree),/Could not save read status/);
  fail=false;button(h.tree,'Mark all as read').props.onClick();await h.settle();assert.equal(h.unread.at(-1),0);assert.match(text(h.tree),/all caught up/);assert.doesNotMatch(text(h.tree),/Could not save read status/);assert.equal(h.writes.length,2);assert.equal(button(h.tree,'Mark all as read'),undefined);
 }finally{h.dispose();}
});

test('Read-all recovery preserves independent refresh and older-page failures',async()=>{
 for(const warningKind of ['refresh','older']){
  let fail=true;const h=centerHarness({},async()=>{if(fail)throw Error('read failure');});try{
   h.requests[0].resolve([]);h.requests[1].resolve([]);h.requests[2].resolve({items:[notification('one')],nextOffset:20,unreadCount:1});await h.settle();
   if(warningKind==='older'){button(h.tree,'Show older notifications').props.onClick();h.render();h.requests[3].reject(Error('older failure'));}
   else {h.render({open:false});h.render({open:true});h.requests[3].reject(Error('visa failure'));h.requests[4].resolve([]);h.requests[5].resolve({items:[notification('one')],nextOffset:20,unreadCount:1});}
   await h.settle();const expected=warningKind==='older'?/Could not load older notifications/:/Some notifications could not refresh/;assert.match(text(h.tree),expected);
   button(h.tree,'Mark all as read').props.onClick();await h.settle();assert.match(text(h.tree),expected);assert.match(text(h.tree),/Could not save read status/);
   fail=false;button(h.tree,'Mark all as read').props.onClick();await h.settle();assert.equal(h.unread.at(-1),0);assert.match(text(h.tree),expected);assert.doesNotMatch(text(h.tree),/Could not save read status/);
  }finally{h.dispose();}
 }
});

test('A successful background refresh cannot dismiss an unconfirmed read-all failure',async()=>{
 const h=centerHarness({},async()=>{throw Error('read failure');});try{
  h.resolveBatch(0,[notification('one')]);await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();assert.match(text(h.tree),/Could not save read status/);
  h.render({open:false});h.render({open:true});h.resolveBatch(3,[notification('one')]);await h.settle();assert.equal(h.unread.at(-1),1);assert.match(text(h.tree),/Could not save read status/);assert.equal(h.writes.length,1,'Refresh must not replay a write');
 }finally{h.dispose();}
});

test('A different item acknowledgement cannot clear another item read failure',async()=>{
 let failOne=true;const h=centerHarness({},async(_action,value)=>{if(value.id==='one'&&failOne)throw Error('first item read failure');});try{
  h.resolveBatch(0,[notification('one'),notification('two')]);await h.settle();socialButton(h,'one').props.onClick();await h.settle();assert.match(text(h.tree),/Could not save read status/);
  socialButton(h,'two').props.onClick();await h.settle();assert.equal(h.unread.at(-1),1);assert.match(text(h.tree),/Could not save read status/);
  failOne=false;socialButton(h,'one').props.onClick();await h.settle();assert.equal(h.unread.at(-1),0);assert.doesNotMatch(text(h.tree),/Could not save read status/);assert.equal(h.writes.length,3);
 }finally{h.dispose();}
});

test('A confirmed read-all covers a late individual or earlier bulk failure',async()=>{
 for(const earlierKind of ['item','all']){
  const pending=deferred();let attempts=0;const h=centerHarness({},()=>{if(++attempts===1)return pending.promise;});try{
   h.resolveBatch(0,[notification('one'),notification('two')]);await h.settle();
   if(earlierKind==='item')socialButton(h,'one').props.onClick();else button(h.tree,'Mark all as read').props.onClick();
   button(h.tree,'Mark all as read').props.onClick();await h.settle();assert.equal(h.unread.at(-1),0);pending.reject(Error('late old failure'));await h.settle();assert.equal(h.unread.at(-1),0);assert.doesNotMatch(text(h.tree),/Could not save read status/);assert.equal(h.writes.length,2);
  }finally{h.dispose();}
 }
});

test('Old-session read failures cannot replace the current owner or refreshed-token feedback',async()=>{
 for(const next of [{ownerId:'owner-two',accessToken:'token-two'},{accessToken:'refreshed-token'}]){
  const pending=deferred();let writes=0;const h=centerHarness({},()=>++writes===1?pending.promise:Promise.reject(Error('current failure')));try{
   h.resolveBatch(0,[notification('one')]);await h.settle();button(h.tree,'Mark all as read').props.onClick();h.render(next);h.resolveBatch(3,[notification('current')]);await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();assert.match(text(h.tree),/Could not save read status/);
   pending.resolve();await h.settle();assert.equal(h.unread.at(-1),1);assert.ok(socialButton(h,'current'));assert.equal(socialButton(h,'one'),undefined);assert.match(text(h.tree),/Could not save read status/);assert.equal(h.writes.at(-1).token,next.accessToken);
  }finally{h.dispose();}
 }
});

const readRow = id => ({...notification(id),readAt:'2026-11-02T00:00:00Z'});
function inboxBatch(h,offset,items,metadata={}) {
 h.requests[offset].resolve([]);h.requests[offset+1].resolve([]);
 h.requests[offset+2].resolve({items,nextOffset:null,...metadata});
}
function reopenInbox(h) {h.render({open:false});h.render({open:true});return h.requests.length-3;}
const hasUnreadDot=(h,id)=>socialButton(h,id)?.props.className.includes('unread');

test('Individual opens and a fresh explicit global zero reconcile an earlier failed read-all intent',async()=>{
 let closes=0;const h=centerHarness({onClose:()=>{closes++;}},async(_action,value)=>{if(!value.id)throw Error('bulk response lost');});try{
  inboxBatch(h,0,[notification('one'),notification('two')],{unreadCount:2});await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();
  socialButton(h,'one').props.onClick();h.render({open:false});await h.settle();
  inboxBatch(h,reopenInbox(h),[readRow('one'),notification('two')],{unreadCount:1});await h.settle();
  socialButton(h,'two').props.onClick();h.render({open:false});await h.settle();
  assert.match(text(h.tree),/Could not save read status/,'Known item ACKs alone do not prove the global goal');
  inboxBatch(h,reopenInbox(h),[readRow('one'),readRow('two')],{unreadCount:0});await h.settle();
  assert.doesNotMatch(text(h.tree),/Could not save read status/);assert.equal(h.unread.at(-1),0);assert.equal(button(h.tree,'Mark all as read'),undefined);assert.equal(closes,2);
  assert.equal(h.writes.length,3);assert.equal(h.intents.length,2);assert.ok(h.intents.every(intent=>intent.postId==='post-one'&&intent.commentId==='comment-one'));
 }finally{h.dispose();}
});

test('A lost bulk acknowledgement is reconciled by fresh explicit zero even when the inbox is empty',async()=>{
 const h=centerHarness({},async()=>{throw Error('lost write response');});try{
  inboxBatch(h,0,[notification('one')],{unreadCount:1});await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();assert.match(text(h.tree),/Could not save read status/);
  inboxBatch(h,reopenInbox(h),[],{unreadCount:0});await h.settle();assert.doesNotMatch(text(h.tree),/Could not save read status/);assert.equal(h.unread.at(-1),0);assert.equal(h.writes.length,1);assert.equal(h.requests.length,6);
 }finally{h.dispose();}
});

test('An accepted older-page global zero reconciles retained dots without inventing a permanent read acknowledgement',async()=>{
 const h=centerHarness({},async(_action,value)=>{if(!value.id)throw Error('lost bulk response');});try{
  inboxBatch(h,0,[notification('one')],{nextOffset:20,unreadCount:1});await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();
  button(h.tree,'Show older notifications').props.onClick();h.render();const page=readRow('older'),before=JSON.stringify(page);h.requests[3].resolve({items:[page],nextOffset:40,unreadCount:0});await h.settle();
  assert.equal(h.unread.at(-1),0);assert.equal(hasUnreadDot(h,'one'),false);assert.equal(hasUnreadDot(h,'older'),false);assert.doesNotMatch(text(h.tree),/Could not save read status/);assert.equal(JSON.stringify(page),before);assert.equal(h.writes.length,1);
  inboxBatch(h,reopenInbox(h),[notification('one'),notification('previously-hidden')],{unreadCount:2});await h.settle();assert.equal(hasUnreadDot(h,'one'),true);assert.equal(hasUnreadDot(h,'previously-hidden'),true);
  socialButton(h,'one').props.onClick();await h.settle();socialButton(h,'previously-hidden').props.onClick();await h.settle();assert.equal(h.writes.length,3);assert.equal(h.unread.at(-1),0);
 }finally{h.dispose();}
});

test('Later positive older-page row data replaces a temporary observed-read decoration',async()=>{
 const h=centerHarness({},async(_action,value)=>{if(!value.id)throw Error('lost bulk response');});try{
  inboxBatch(h,0,[notification('one')],{nextOffset:20,unreadCount:1});await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();
  button(h.tree,'Show older notifications').props.onClick();h.render();h.requests[3].resolve({items:[readRow('older')],nextOffset:40,unreadCount:0});await h.settle();assert.equal(hasUnreadDot(h,'one'),false);
  button(h.tree,'Show older notifications').props.onClick();h.render();h.requests[4].resolve({items:[notification('one')],nextOffset:null,unreadCount:1});await h.settle();
  assert.equal(h.unread.at(-1),1);assert.equal(hasUnreadDot(h,'one'),true);assert.doesNotMatch(text(h.tree),/Could not save read status/);socialButton(h,'one').props.onClick();await h.settle();assert.equal(h.writes.length,2);assert.equal(h.unread.at(-1),0);
 }finally{h.dispose();}
});

test('Fallback zero, positive global totals and contradictory unread rows never confirm all-read recovery',async()=>{
 for(const response of [
  {items:[readRow('one')],nextOffset:null},
  {items:[readRow('one')],nextOffset:20},
  {items:[readRow('one')],nextOffset:20,unreadCount:3},
  {items:[notification('one')],nextOffset:null,unreadCount:0},
  {items:[{...notification('one'),readAt:''}],nextOffset:null,unreadCount:0},
 ]){
  const h=centerHarness({},async()=>{throw Error('unconfirmed write');});try{
   inboxBatch(h,0,[notification('one')],{unreadCount:1});await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();const offset=reopenInbox(h);
   h.requests[offset].resolve([]);h.requests[offset+1].resolve([]);h.requests[offset+2].resolve(response);await h.settle();assert.match(text(h.tree),/Could not save read status/);assert.equal(h.writes.length,1);
  }finally{h.dispose();}
 }
});

test('Authoritative read reconciliation preserves independent list and pagination warnings',async()=>{
 for(const kind of ['list','older']){
  const h=centerHarness({},async()=>{throw Error('write response lost');});try{
   inboxBatch(h,0,[notification('one')],{nextOffset:20,unreadCount:1});await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();
   if(kind==='list'){
    const offset=reopenInbox(h);h.requests[offset].reject(Error('visa list unavailable'));h.requests[offset+1].resolve([]);h.requests[offset+2].resolve({items:[readRow('one')],nextOffset:null,unreadCount:0});
   }else{
    button(h.tree,'Show older notifications').props.onClick();h.render();h.requests[3].reject(Error('older page unavailable'));await h.settle();
    button(h.tree,'Show older notifications').props.onClick();h.render();h.requests[4].resolve({items:[readRow('older')],nextOffset:null,unreadCount:0});
   }
   await h.settle();assert.doesNotMatch(text(h.tree),/Could not save read status/);assert.match(text(h.tree),kind==='list'?/Some notifications could not refresh/:/Could not load older notifications/);assert.equal(h.writes.length,1);
  }finally{h.dispose();}
 }
});

test('A zero snapshot requested before a newer read attempt or failure cannot dismiss that intent',async()=>{
 for(const order of ['new-attempt','new-failure']){
  const pending=deferred();const h=centerHarness({},()=>pending.promise);try{
   inboxBatch(h,0,[notification('one')],{unreadCount:1});await h.settle();let offset;
   if(order==='new-attempt')offset=reopenInbox(h);
   button(h.tree,'Mark all as read').props.onClick();h.render();
   if(order==='new-failure')offset=reopenInbox(h);
   pending.reject(Error('current write not confirmed'));await h.settle();
   inboxBatch(h,offset,[readRow('one')],{unreadCount:0});await h.settle();
   assert.match(text(h.tree),/Could not save read status/);assert.equal(h.unread.at(-1),1);assert.ok(button(h.tree,'Mark all as read'));assert.equal(h.requests.length,6,'Ignoring an old zero must not add a request');assert.equal(h.writes.length,1);
  }finally{h.dispose();}
 }
});

test('A read-state observation covers late pending item failures without permanently acknowledging unknown IDs',async()=>{
 const pending=deferred();let attempts=0;const h=centerHarness({},()=>++attempts===1?pending.promise:Promise.resolve());try{
  inboxBatch(h,0,[notification('one')],{unreadCount:1});await h.settle();socialButton(h,'one').props.onClick();h.render({open:false});
  inboxBatch(h,reopenInbox(h),[],{unreadCount:0});await h.settle();assert.equal(h.unread.at(-1),0);pending.reject(Error('late item failure'));await h.settle();assert.doesNotMatch(text(h.tree),/Could not save read status/);
  inboxBatch(h,reopenInbox(h),[notification('one')],{unreadCount:1});await h.settle();assert.equal(hasUnreadDot(h,'one'),true);socialButton(h,'one').props.onClick();await h.settle();assert.equal(h.writes.length,2);assert.equal(h.unread.at(-1),0);
 }finally{h.dispose();}
});

test('A late observed item success cannot consume a genuinely newer unread count',async()=>{
 const pending=deferred(),h=centerHarness({},()=>pending.promise);try{
  inboxBatch(h,0,[notification('one')],{unreadCount:1});await h.settle();socialButton(h,'one').props.onClick();h.render({open:false});
  inboxBatch(h,reopenInbox(h),[readRow('one')],{unreadCount:0});await h.settle();
  inboxBatch(h,reopenInbox(h),[readRow('one'),notification('new')],{unreadCount:1});await h.settle();pending.resolve();await h.settle();assert.equal(h.unread.at(-1),1);assert.equal(hasUnreadDot(h,'new'),true);assert.equal(h.writes.length,1);
 }finally{h.dispose();}
});

test('A late observed bulk result cannot erase newer positive data or a newer write failure',async()=>{
 for(const outcome of ['success','failure']){
  const pending=deferred();let attempts=0;const h=centerHarness({},()=>++attempts===1?pending.promise:Promise.reject(Error('newer bulk failure')));try{
   inboxBatch(h,0,[notification('one')],{unreadCount:1});await h.settle();button(h.tree,'Mark all as read').props.onClick();h.render();
   inboxBatch(h,reopenInbox(h),[readRow('one')],{unreadCount:0});await h.settle();inboxBatch(h,reopenInbox(h),[notification('new')],{unreadCount:1});await h.settle();
   button(h.tree,'Mark all as read').props.onClick();await h.settle();assert.match(text(h.tree),/Could not save read status/);
   if(outcome==='success')pending.resolve();else pending.reject(Error('old bulk failure'));await h.settle();
   assert.equal(h.unread.at(-1),1);assert.equal(hasUnreadDot(h,'new'),true);assert.match(text(h.tree),/Could not save read status/);assert.equal(h.writes.length,2);
  }finally{h.dispose();}
 }
});

test('Accepted main and older global-zero observations fence earlier positive snapshots',async()=>{
 for(const zeroPath of ['main','older']){
  const h=centerHarness();try{
   inboxBatch(h,0,[notification('one')],{nextOffset:20,unreadCount:1});await h.settle();const main=reopenInbox(h);
   button(h.tree,'Show older notifications').props.onClick();h.render();const older=h.requests.length-1;
   if(zeroPath==='main'){
    inboxBatch(h,main,[readRow('one')],{nextOffset:20,unreadCount:0});await h.settle();h.requests[older].resolve({items:[notification('stale')],nextOffset:40,unreadCount:7});
   }else{
    h.requests[older].resolve({items:[readRow('older')],nextOffset:40,unreadCount:0});await h.settle();inboxBatch(h,main,[notification('stale')],{nextOffset:20,unreadCount:7});
   }
   await h.settle();assert.equal(h.unread.at(-1),0);assert.equal(socialButton(h,'stale'),undefined);assert.equal(h.writes.length,0);assert.equal(h.requests.length,10,'Keep the existing obsolete-snapshot authoritative-refresh path');
   inboxBatch(h,7,[notification('genuinely-new')],{nextOffset:null,unreadCount:1});await h.settle();assert.equal(h.unread.at(-1),1);assert.equal(hasUnreadDot(h,'genuinely-new'),true);
  }finally{h.dispose();}
 }
});

test('Old-owner and refreshed-token zero observations cannot dismiss a current session read failure',async()=>{
 for(const next of [{ownerId:'owner-two',accessToken:'token-two'},{accessToken:'refreshed-token'}]){
  const h=centerHarness({},async()=>{throw Error('current write failure');});try{
   inboxBatch(h,0,[notification('one')],{unreadCount:1});await h.settle();const old=reopenInbox(h);h.render(next);inboxBatch(h,6,[notification('current')],{unreadCount:1});await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();
   inboxBatch(h,old,[readRow('one')],{unreadCount:0});await h.settle();assert.equal(h.unread.at(-1),1);assert.ok(socialButton(h,'current'));assert.equal(socialButton(h,'one'),undefined);assert.match(text(h.tree),/Could not save read status/);assert.equal(h.writes.length,1);assert.equal(h.writes[0].token,next.accessToken);
  }finally{h.dispose();}
 }
});

test('An overlapping main positive response is included in the later accepted older-zero projection',async()=>{
 const h=centerHarness({},async(_action,value)=>{if(!value.id)throw Error('lost bulk response');});try{
  inboxBatch(h,0,[notification('old')],{nextOffset:20,unreadCount:1});await h.settle();button(h.tree,'Mark all as read').props.onClick();await h.settle();
  const main=reopenInbox(h);button(h.tree,'Show older notifications').props.onClick();h.render();const older=h.requests.length-1;
  inboxBatch(h,main,[notification('fresh-retained')],{nextOffset:20,unreadCount:1});await h.settle();assert.equal(hasUnreadDot(h,'fresh-retained'),true);assert.equal(socialButton(h,'old'),undefined);
  h.requests[older].resolve({items:[readRow('older')],nextOffset:40,unreadCount:0});await h.settle();
  assert.equal(h.unread.at(-1),0);assert.equal(hasUnreadDot(h,'fresh-retained'),false);assert.equal(hasUnreadDot(h,'older'),false);assert.doesNotMatch(text(h.tree),/Could not save read status/);assert.equal(h.writes.length,1);
  button(h.tree,'Show older notifications').props.onClick();h.render();h.requests.at(-1).resolve({items:[notification('fresh-retained')],nextOffset:null,unreadCount:1});await h.settle();
  assert.equal(h.unread.at(-1),1);assert.equal(hasUnreadDot(h,'fresh-retained'),true);socialButton(h,'fresh-retained').props.onClick();await h.settle();assert.equal(h.writes.length,2);assert.equal(h.unread.at(-1),0);
 }finally{h.dispose();}
});
