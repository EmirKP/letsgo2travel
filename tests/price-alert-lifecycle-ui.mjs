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
  const api={ApiError,requestJson:async()=>({data:{price_alert_email:true,price_alert_push:false,comments:true,replies:true,follows:true}}),listAlerts:token=>call('list',token),deleteAlert:(...a)=>call('delete',...a),restoreAlert:(...a)=>call('restore',...a),updateAlert:(...a)=>call('patch',...a),createAlert:(...a)=>call('create',...a)};
  const {PriceAlertsScreen}=load('mobile/src/screens/PriceAlertsScreen.tsx',{
    react:host.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    '../components/AirportField':{AirportField:'AirportField'},'../components/DateTimeField':{DateTimeField:'DateTimeField'},'../components/Icon':{Icon:'Icon'},'../components/TravelToolArtwork':{TravelToolArtwork:'TravelToolArtwork'},'../components/PageHero':{PageHero:'PageHero'},
    '../lib/api':api,'../components/NotificationPreferences':{NotificationPreferences:'NotificationPreferences'},'../lib/dates':load('mobile/src/lib/dates.ts',{}),'../lib/push':{enablePushForUser:async()=>({ok:true}),isPushAvailable:()=>false},
    '../lib/localeFormatting':{formatAppDate:(date)=>date.toISOString()},'../lib/i18n':{useI18n:()=>({copy,dateLocale:'en-GB',locale:'en'})},'../lib/locale':{translateCopy:(_,__,en)=>en},
  },{AbortController,window:{setTimeout:(fn)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)}});
  const props={user:{id:'owner'},accessToken:'token',onOpenAccount(){},onNotice:msg=>notices.push(msg)};
  let tree;
  const h={requests,notices,render(next={}){Object.assign(props,next);tree=host.render(()=>PriceAlertsScreen(props));return tree;},get tree(){return tree;},async settle(){await tick();return h.render();},dispose:()=>host.dispose(),expire(){for(const fn of timers.values())fn();h.render();}};
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

test('Lost restore response does not hide a server-confirmed restored alert after refresh',async()=>{
  const h=await ready();try{
    button(h.tree,'Delete alert').props.onClick();h.requests.at(-1).resolve({success:true});await h.settle();
    button(h.tree,'Undo').props.onClick();h.requests.at(-1).reject(Error('response lost'));await h.settle();
    assert.equal(button(h.tree,'Delete alert'),undefined);
    button(h.tree,'Refresh').props.onClick();h.requests.at(-1).resolve([fixture()]);await h.settle();
    assert.ok(button(h.tree,'Delete alert'));assert.ok(button(h.tree,'Pause'));
  }finally{h.dispose();}
});

test('Globally muted channel is explained even when the per-alert checkbox is selected',async()=>{
  const h=await ready({notify_push:true});try{
    assert.match(text(h.tree),/Phone notification · muted in settings/);
    assert.match(text(h.tree),/A globally muted channel will not send notifications/);
    const preferences=nodes(h.tree).find(n=>n.type==='NotificationPreferences');assert.ok(preferences);
    button(h.tree,'Create alert').props.onClick();h.render();
    assert.doesNotMatch(text(h.tree),/You'll get an instant notification/);
    assert.match(text(h.tree),/general preference and device permission/);
    preferences.props.onSaved({price_alert_email:true,price_alert_push:true,comments:true,replies:true,follows:true});h.render();
    assert.doesNotMatch(text(h.tree),/Phone notification · muted in settings/);
    assert.equal(nodes(h.tree).find(n=>n.type==='NotificationPreferences'),undefined);
  }finally{h.dispose();}
});

const alertCard = tree => nodes(tree).find(node => node.type === 'article' && node.props.className?.includes('alert-card'));
const channelField = (tree, index) => nodes(alertCard(tree)).filter(node => node.type === 'input' && node.props.type === 'checkbox')[index];
const patchCases = [
  { name: 'Pause', initial: { is_active: true }, change: h => button(h.tree, 'Pause').props.onClick(), body: { is_active: false }, confirmed: tree => !!button(tree, 'Resume') },
  { name: 'Resume', initial: { is_active: false, status: 'paused' }, change: h => button(h.tree, 'Resume').props.onClick(), body: { is_active: true }, confirmed: tree => !!button(tree, 'Pause') },
  { name: 'email channel', initial: { notify_email: true, notify_push: true }, change: h => channelField(h.tree, 0).props.onChange({ target: { checked: false } }), body: { notify_email: false }, confirmed: tree => channelField(tree, 0).props.checked === false },
  { name: 'push channel', initial: { notify_email: true, notify_push: true }, change: h => channelField(h.tree, 1).props.onChange({ target: { checked: false } }), body: { notify_push: false }, confirmed: tree => channelField(tree, 1).props.checked === false },
];

for (const operation of patchCases) test(`${operation.name} acknowledgement survives a token-refresh read started during its PATCH in either response order`, async () => {
  for (const order of ['patch-first', 'read-first']) {
    const h = await ready(operation.initial);
    try {
      button(h.tree, 'Create alert').props.onClick(); h.render();
      nodes(h.tree).find(node => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '1234' } }); h.render();
      operation.change(h); h.render();
      const patch = h.requests.find(request => request.kind === 'patch');
      assert.ok(patch); assert.deepEqual(JSON.parse(JSON.stringify(patch.args[1])), operation.body);
      assert.equal(channelField(h.tree, 0).props.disabled, true);
      h.render({ accessToken: 'fresh-token' });
      const refreshedRead = h.requests.filter(request => request.kind === 'list').at(-1);
      assert.equal(refreshedRead.args[0], 'fresh-token');
      if (order === 'read-first') { refreshedRead.resolve([fixture(operation.initial)]); await h.settle(); }
      patch.resolve({ success: true }); await h.settle();
      assert.equal(operation.confirmed(h.tree), true, 'PATCH acknowledgement must be visible');
      if (order === 'patch-first') { refreshedRead.resolve([fixture(operation.initial)]); await h.settle(); }
      assert.equal(operation.confirmed(h.tree), true, 'An earlier snapshot cannot roll back acknowledged fields');
      assert.equal(nodes(h.tree).find(node => node.props?.className?.split(' ').includes('alert-list')).props['aria-busy'], false);
      assert.equal(button(h.tree, 'Refresh').props.disabled, false, 'Discarded reads cannot leave loading stuck');
      assert.equal(nodes(h.tree).find(node => node.type === 'input' && node.props.type === 'number').props.value, '1234');
      assert.equal(h.requests.filter(request => request.kind === 'patch').length, 1, 'Token rotation never repeats the mutation');
      assert.equal(h.notices.length, 1);
    } finally { h.dispose(); }
  }
});

test('A genuine explicit refresh after PATCH acknowledgement remains authoritative', async () => {
  const h = await ready();
  try {
    button(h.tree, 'Pause').props.onClick(); h.render();
    h.requests.find(request => request.kind === 'patch').resolve({ success: true }); await h.settle();
    assert.ok(button(h.tree, 'Resume'));
    button(h.tree, 'Refresh').props.onClick(); h.render();
    h.requests.at(-1).resolve([fixture({ is_active: true, status: 'active' })]); await h.settle();
    assert.ok(button(h.tree, 'Pause'), 'A truly later server state must not be pinned behind a local mutation cache');
    assert.equal(h.requests.filter(request => request.kind === 'patch').length, 1);
  } finally { h.dispose(); }
});

test('Failed PATCH preserves a token-refresh authoritative result, error and busy recovery in either response order', async () => {
  for (const order of ['patch-first', 'read-first']) {
    const h = await ready();
    try {
      button(h.tree, 'Pause').props.onClick(); h.render(); const patch = h.requests.find(request => request.kind === 'patch');
      h.render({ accessToken: 'fresh-token' }); const refreshedRead = h.requests.filter(request => request.kind === 'list').at(-1);
      if (order === 'read-first') { refreshedRead.resolve([fixture({ is_active: false, status: 'paused' })]); await h.settle(); }
      patch.reject(Error('response lost')); await h.settle();
      if (order === 'patch-first') { refreshedRead.resolve([fixture({ is_active: false, status: 'paused' })]); await h.settle(); }
      assert.ok(button(h.tree, 'Resume'), 'Failed mutation must not undo a newer successful server read');
      assert.match(text(h.tree), /Alert status could not be updated/);
      assert.equal(h.notices.length, 0); assert.equal(button(h.tree, 'Refresh').props.disabled, false);
      assert.equal(h.requests.filter(request => request.kind === 'patch').length, 1);
    } finally { h.dispose(); }
  }
});

test('Ordinary old-token read remains fenced while a same-owner alert draft survives token refresh and form close', async () => {
  const h = harness();
  try {
    h.render({ accessToken: 'fresh-token' });
    h.requests[1].resolve([fixture({ destination_label: 'Current city' })]); await h.settle();
    h.requests[0].resolve([fixture({ destination_label: 'Old city' })]); await h.settle();
    assert.match(text(h.tree), /Current city/); assert.doesNotMatch(text(h.tree), /Old city/);
    button(h.tree, 'Create alert').props.onClick(); h.render();
    nodes(h.tree).find(node => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '1234' } }); h.render();
    button(h.tree, 'Close form').props.onClick(); h.render(); button(h.tree, 'Create alert').props.onClick(); h.render();
    assert.equal(nodes(h.tree).find(node => node.type === 'input' && node.props.type === 'number').props.value, '1234');
    assert.ok(h.requests.every(request => request.kind === 'list'));
  } finally { h.dispose(); }
});

test('Undo acknowledgement survives a token-refresh read begun during restore while later explicit reads remain authoritative', async () => {
  for (const active of [false, true]) for (const order of ['restore-first', 'read-first']) {
    const h = await ready({ is_active: active, status: active ? 'active' : 'paused' });
    try {
      button(h.tree, 'Delete alert').props.onClick(); h.render(); h.requests.at(-1).resolve({ success: true }); await h.settle();
      button(h.tree, 'Undo').props.onClick(); h.render(); const restore = h.requests.find(request => request.kind === 'restore');
      assert.equal(restore.args[1], active, 'Undo retains the original paused or active status');
      h.render({ accessToken: 'fresh-token' }); const refreshedRead = h.requests.filter(request => request.kind === 'list').at(-1);
      if (order === 'read-first') { refreshedRead.resolve([]); await h.settle(); }
      restore.resolve({ success: true }); await h.settle(); assert.ok(button(h.tree, 'Delete alert'));
      if (order === 'restore-first') { refreshedRead.resolve([]); await h.settle(); }
      assert.ok(button(h.tree, 'Delete alert'), 'A pre-restore empty snapshot cannot erase the acknowledged restored row');
      assert.ok(button(h.tree, active ? 'Pause' : 'Resume'));
      assert.doesNotMatch(text(h.tree), /No price alerts yet/);
      assert.equal(button(h.tree, 'Refresh').props.disabled, false);
      assert.equal(h.requests.filter(request => request.kind === 'restore').length, 1);
      assert.deepEqual(h.notices, ['Alert restored.']);
      button(h.tree, 'Refresh').props.onClick(); h.render(); h.requests.at(-1).resolve([]); await h.settle();
      assert.equal(button(h.tree, 'Delete alert'), undefined, 'A genuinely later authoritative empty list is still accepted');
      assert.match(text(h.tree), /No price alerts yet/);
    } finally { h.dispose(); }
  }
});

test('Lost restore acknowledgement keeps the refreshed authoritative row in either response order without automatic restore retry', async () => {
  for (const order of ['restore-first', 'read-first']) {
    const h = await ready();
    try {
      button(h.tree, 'Delete alert').props.onClick(); h.render(); h.requests.at(-1).resolve({ success: true }); await h.settle();
      button(h.tree, 'Undo').props.onClick(); h.render(); const restore = h.requests.find(request => request.kind === 'restore');
      h.render({ accessToken: 'fresh-token' }); const refreshedRead = h.requests.filter(request => request.kind === 'list').at(-1);
      if (order === 'read-first') { refreshedRead.resolve([fixture()]); await h.settle(); }
      restore.reject(Error('response lost')); await h.settle();
      if (order === 'restore-first') { refreshedRead.resolve([fixture()]); await h.settle(); }
      assert.ok(button(h.tree, 'Delete alert'), 'Tombstone is removed before the uncertain restore attempt, so a successful fresh GET is authoritative');
      assert.ok(button(h.tree, 'Pause')); assert.match(text(h.tree), /could not be restored/);
      assert.equal(h.notices.length, 0); assert.equal(button(h.tree, 'Refresh').props.disabled, false);
      assert.equal(h.requests.filter(request => request.kind === 'restore').length, 1);
    } finally { h.dispose(); }
  }
});
