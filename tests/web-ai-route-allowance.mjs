import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('app/rota-asistani/page.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type, props) => ({ type, props });
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const tick = () => new Promise(resolve => setTimeout(resolve, 2));
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const quotaValue=(changes={})=>{const reset=new Date();reset.setUTCHours(24,0,0,0);return {limit:3,used:0,remaining:3,pending:false,resetAt:reset.toISOString(),timeZone:'UTC',...changes};};
const result = { success: true, isFallback: false, data: { summary: 'Real result', routes: [{ name: 'Konya', country: 'Türkiye', dailyPlan: ['A real itinerary'], warnings: [], scores: {}, cta: {} }] } };
function fixture({ session = { user: { id: 'owner-a' }, access_token: 'token-a' }, fetch = async () => response(200, result), stored = new Map(), getSession, digest,
  search = '?preset=ilk-kez-yurtdisi' } = {}) {
  let cursor = 0, dirty = false, effects = [], authChanged;
  const slots = [], calls = [];
  const react = {
    useState(initial) { const i = cursor++; slots[i] ||= { value: initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true; }]; },
    useRef(initial) { const i = cursor++; slots[i] ||= { current: initial }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((v, n) => !Object.is(old.deps[n], v))) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'framer-motion': { motion: new Proxy({}, { get: (_t, key) => key }), AnimatePresence: 'presence' },
    'lucide-react': new Proxy({}, { get: (_t, key) => key }), 'next/link': { default: 'link' }, 'next/image': { default: 'image' },
    '../components/PlaneLoader': { default: 'loader' }, '../components/AiDestinationCard': { default: 'route-card' },
    '@/lib/supabase-client': { supabase: { auth: { getSession: async () => getSession ? getSession() : ({ data: { session } }), onAuthStateChange: cb => { authChanged = cb; return { data: { subscription: { unsubscribe() {} } } }; } } } },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    AbortController, crypto: { randomUUID: () => webcrypto.randomUUID(), subtle: { digest: (...args) => digest ? digest(...args) : webcrypto.subtle.digest(...args) } }, TextEncoder, Uint8Array, Date, URLSearchParams, console,
    window: { location: { search }, setTimeout, clearTimeout },
    sessionStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    fetch: async (url, options) => { calls.push({ url, ...options }); return fetch(url, options); },
  })(name => { if (!(name in imports)) throw Error(name); return imports[name]; }, module, module.exports);
  const view = {
    calls, stored,
    render() { for (let n = 0; n < 15; n++) { cursor = 0; dirty = false; effects = []; const tree = module.exports.default(); effects.forEach(fn => fn()); if (!dirty) return tree; } throw Error('render loop'); },
    async settle(predicate = () => true) { let tree; for (let n = 0; n < 30; n++) { await tick(); tree = this.render(); if (predicate(tree)) return tree; } throw Error('expected UI not reached'); },
    async retry() { const tree = this.render(), retry = nodes(tree).find(node => node.type === 'button' && text(node).includes('Aynı seçimlerle tekrar dene')); assert.ok(retry); retry.props.onClick(); return this.settle(); },
    account(next, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') { session = next; authChanged(event, next); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
  view.render(); return view;
}

test('Web guests retain their choices and see sign-in without an AI request or invented result', async () => {
  const view = fixture({ session: null });
  try {
    const tree = await view.settle(tree => text(tree).includes('hesabına giriş yap'));
    assert.match(text(tree), /Günde 3 ücretsiz AI rotası/);
    assert.equal(view.calls.length, 0);
    assert.ok(nodes(tree).some(node => node.type === 'link' && node.props.href.startsWith('/auth/login')));
    assert.equal(nodes(tree).filter(node => node.type === 'route-card').length, 0);
  } finally { view.dispose(); }
});

test('Web failures and confirmed successes retain the same receipt identity for safe retry and reload', async () => {
  let fail = true;
  const view = fixture({ fetch: async () => fail ? response(503, { code: 'plan_busy' }) : response(200, result) });
  try {
    await view.settle(tree => text(tree).includes('Rota şu an oluşturulamadı'));
    const first = view.calls[0]; assert.equal(first.url,'/api/ai-plan?quotaVersion=2'); assert.equal(first.headers.Authorization, 'Bearer token-a'); assert.ok(first.headers['Idempotency-Key']);
    assert.equal(nodes(view.render()).filter(node => node.type === 'route-card').length, 0);
    fail = false; await view.retry(); await view.settle(tree => nodes(tree).some(node => node.type === 'route-card'));
    assert.equal(view.calls[1].headers['Idempotency-Key'], first.headers['Idempotency-Key']);
    assert.equal(view.calls[1].body, first.body); assert.equal(view.stored.size, 2);
    const receipt = JSON.parse([...view.stored.values()][0]); assert.equal(receipt.id, first.headers['Idempotency-Key']);
    assert.equal('result' in receipt, false); assert.equal('prompt' in receipt, false);
    const reload = fixture({ stored: view.stored });
    try {
      await reload.settle(tree => nodes(tree).some(node => node.type === 'route-card'));
      assert.equal(reload.calls[0].headers['Idempotency-Key'], first.headers['Idempotency-Key']);
      assert.equal(reload.calls[0].body, first.body);
    } finally { reload.dispose(); }
  } finally { view.dispose(); }
});

test('Web daily limit is visible with reset time and does not masquerade as a successful fallback', async () => {
  const view = fixture({ fetch: async () => response(429, { code: 'plan_limit', quota: { resetAt: '2026-10-19T00:00:00Z' } }) });
  try {
    const tree = await view.settle(tree => text(tree).includes('Bugünkü rota haklarını kullandın'));
    assert.equal(nodes(tree).filter(node => node.type === 'route-card').length, 0);
    assert.match(text(tree), /Yeni hakların:/);
  } finally { view.dispose(); }
});

test('Web UI renders verified server remaining rights from 3 to 2 to 1 to 0 without assuming the old daily limit',async()=>{
  for(const remaining of [3,2,1,0]){
    const quota=quotaValue({used:3-remaining,remaining});
    const view=fixture({fetch:async()=>remaining===3?response(503,{code:'plan_busy',quota}):response(200,{...result,quota})});
    try{
      const tree=await view.settle(tree=>text(tree).includes(`Bugün ${remaining}/3 yeni AI rota hakkın kaldı.`));
      assert.equal(view.calls.length,1);assert.equal(view.calls[0].url,'/api/ai-plan?quotaVersion=2');
      const status=nodes(tree).find(node=>node.props?.role==='status');assert.ok(status);
      assert.equal(nodes(status).find(node=>node.type==='time').props.dateTime,quota.resetAt);
    }finally{view.dispose();}
  }
  const legacy=fixture({fetch:async()=>response(200,{...result,quota:quotaValue({limit:1,used:0,remaining:1})})});
  try{await legacy.settle(tree=>text(tree).includes('Bugün 1/1 yeni AI rota hakkın kaldı.'));}finally{legacy.dispose();}
});

test('Web failure keeps all three rights and a pending receipt never appears as used daily allowance',async()=>{
  let attempt=0;const quota=quotaValue();
  const view=fixture({fetch:async()=>++attempt===1?response(503,{code:'plan_busy',quota}):response(200,{...result,quota:quotaValue({used:1,remaining:2})})});
  try{
    await view.settle(tree=>text(tree).includes('Bugün 3/3 yeni AI rota hakkın kaldı.'));
    const original=view.calls[0];await view.retry();
    await view.settle(tree=>text(tree).includes('Bugün 2/3 yeni AI rota hakkın kaldı.'));
    assert.equal(view.calls[1].headers['Idempotency-Key'],original.headers['Idempotency-Key']);assert.equal(view.calls[1].body,original.body);
  }finally{view.dispose();}
  const pending=fixture({fetch:async()=>response(409,{code:'plan_pending',quota:quotaValue({used:1,remaining:0,pending:true})})});
  try{
    const tree=await pending.settle(tree=>text(tree).includes('Önceki rota isteğin hâlâ işleniyor; ek hak kullanılmaz.'));
    assert.doesNotMatch(text(tree),/Bugün 0\/3|Bugünkü rota haklarını kullandın/);assert.equal(nodes(tree).filter(node=>node.type==='route-card').length,0);
  }finally{pending.dispose();}
});

test('Web quota snapshots are discarded on account changes and malformed snapshots never produce invented counters',async()=>{
  const view=fixture({fetch:async()=>response(200,{...result,quota:quotaValue({used:1,remaining:2})})});
  try{
    await view.settle(tree=>text(tree).includes('Bugün 2/3'));
    view.account({user:{id:'owner-b'},access_token:'token-b'});
    assert.doesNotMatch(text(view.render()),/Bugün 2\/3/);
  }finally{view.dispose();}
  for(const quota of [quotaValue({limit:2}),quotaValue({remaining:1}),quotaValue({used:4,remaining:0}),quotaValue({resetAt:'2026-10-21T03:00:00Z'}),quotaValue({pending:true,remaining:3})]){
    const invalid=fixture({fetch:async()=>response(200,{...result,quota})});
    try{const tree=await invalid.settle(tree=>nodes(tree).some(node=>node.type==='route-card'));assert.doesNotMatch(text(tree),/yeni AI rota hakkın kaldı/);}finally{invalid.dispose();}
  }
});

test('A web plan response from the previous account cannot enter the newly signed-in account', async () => {
  let resolve;
  const view = fixture({ fetch: () => new Promise(done => { resolve = done; }) });
  try {
    await view.settle(() => view.calls.length === 1);
    view.account({ user: { id: 'owner-b' }, access_token: 'token-b' }); view.render();
    resolve(response(200, {...result,quota:quotaValue({used:1,remaining:2})})); const tree = await view.settle();
    assert.equal(nodes(tree).filter(node => node.type === 'route-card').length, 0);
    assert.doesNotMatch(text(tree),/Bugün 2\/3/);
  } finally { view.dispose(); }
});

test('An account change or logout while getSession is pending fences the stale token, errors and operation storage', async () => {
  for (const next of [null, { user: { id: 'owner-b' }, access_token: 'token-b' }]) for (const rejected of [false, true]) {
    let complete, fail;
    const view = fixture({ getSession: () => new Promise((resolve, reject) => { complete = resolve; fail = reject; }) });
    try {
      await view.settle(() => Boolean(complete)); view.account(next); view.render();
      if (rejected) fail(Error('Old owner session failure'));
      else complete({ data: { session: { user: { id: 'owner-a' }, access_token: 'stale-token-a' } } });
      const tree = await view.settle();
      assert.equal(view.calls.length, 0); assert.equal(view.stored.size, 0);
      assert.doesNotMatch(text(tree), /Old owner session failure/);
      assert.equal(nodes(tree).filter(node => node.type === 'route-card').length, 0);
    } finally { view.dispose(); }
  }
});

test('Account changes during fingerprinting or response decoding cannot publish or store obsolete work', async () => {
  let digestDone;
  const fingerprint = fixture({ digest: () => new Promise(resolve => { digestDone = resolve; }) });
  try {
    await fingerprint.settle(() => Boolean(digestDone)); fingerprint.account({ user: { id: 'owner-b' }, access_token: 'token-b' });
    digestDone(new Uint8Array(32).buffer); await fingerprint.settle();
    assert.equal(fingerprint.calls.length, 0); assert.equal(fingerprint.stored.size, 0);
  } finally { fingerprint.dispose(); }
  let decode;
  const decoding = fixture({ fetch: async () => ({ ok: true, status: 200, json: () => new Promise(resolve => { decode = resolve; }) }) });
  try {
    await decoding.settle(() => Boolean(decode)); decoding.account(null); decode(result);
    const tree = await decoding.settle(); assert.equal(nodes(tree).filter(node => node.type === 'route-card').length, 0);
  } finally { decoding.dispose(); }
});

test('A confirmed receipt older than 24 hours cannot force stale recovery for a fresh request', async () => {
  const stored = new Map(); const first = fixture({ stored });
  try { await first.settle(tree => nodes(tree).some(node => node.type === 'route-card')); } finally { first.dispose(); }
  const key = [...stored.keys()][0], saved = JSON.parse(stored.get(key)), oldId = saved.id;
  stored.set(key, JSON.stringify({ ...saved, createdAt: Date.now() - 86400001 }));
  const fresh = fixture({ stored });
  try {
    await fresh.settle(tree => nodes(tree).some(node => node.type === 'route-card'));
    assert.notEqual(fresh.calls[0].headers['Idempotency-Key'], oldId);
  } finally { fresh.dispose(); }
});

test('Initial auth delivery preserves a matching preset request but rejects a mismatching session snapshot', async () => {
  for (const matches of [true, false]) {
    let sessionDone;
    const view = fixture({ getSession: () => new Promise(resolve => { sessionDone = resolve; }) });
    try {
      await view.settle(() => Boolean(sessionDone));
      view.account({ user: { id: matches ? 'owner-a' : 'owner-b' }, access_token: 'current-token' }, 'INITIAL_SESSION');
      sessionDone({ data: { session: { user: { id: 'owner-a' }, access_token: 'token-a' } } });
      await view.settle(tree => !matches || nodes(tree).some(node => node.type === 'route-card'));
      assert.equal(view.calls.length, matches ? 1 : 0);
    } finally { view.dispose(); }
  }
});

test('A completed web route retains its original submitted choices after another draft fails and after reload', async () => {
  const stored = new Map(), completed = fixture({ stored }); let original;
  try {
    await completed.settle(tree => nodes(tree).some(node => node.type === 'route-card'));
    original = completed.calls[0];
  } finally { completed.dispose(); }
  const edited = fixture({ stored, search: '?preset=kimlikle-haftasonu', fetch: async () => response(429, { code: 'plan_limit' }) });
  try { await edited.settle(tree => text(tree).includes('Bugünkü rota haklarını kullandın')); assert.notEqual(edited.calls[0].body, original.body); }
  finally { edited.dispose(); }
  const reload = fixture({ stored, search: '', fetch: async (_url, options) => {
    assert.equal(options.headers['Idempotency-Key'], original.headers['Idempotency-Key']); assert.equal(options.body, original.body);
    return response(200, result);
  } });
  try {
    reload.account({ user: { id: 'owner-a' }, access_token: 'rotated-token-a' }, 'INITIAL_SESSION');
    const restore = nodes(reload.render()).find(node => node.type === 'button' && text(node).includes('Önceki rotamı geri aç'));
    assert.ok(restore); restore.props.onClick();
    await reload.settle(tree => nodes(tree).some(node => node.type === 'route-card'));
    assert.equal(reload.calls.length, 1);
    assert.equal(reload.calls[0].headers.Authorization, 'Bearer rotated-token-a');
    reload.account({ user: { id: 'owner-b' }, access_token: 'token-b' });
    assert.ok(!nodes(reload.render()).some(node => node.type === 'button' && text(node).includes('Önceki rotamı geri aç')));
  } finally { reload.dispose(); }
  for (const value of stored.values()) assert.ok(!value.includes('token-a') && !value.includes('token-b'));
});

test('Malformed, oversized and expired submitted snapshots never enter the recovery control', () => {
  const base = { id: webcrypto.randomUUID(), fingerprint: 'a'.repeat(64), createdAt: Date.now(), answers: {
    origin: 'İstanbul', days: '3 gün', month: '', budget: '', accommodation: '', who: '', tempo: '', vibe: [], visa: '',
  } };
  for (const value of ['{invalid', JSON.stringify({ ...base, createdAt: Date.now() - 86400001 }),
    JSON.stringify({ ...base, answers: { ...base.answers, origin: 'x'.repeat(301) } }), ' '.repeat(12001),
    JSON.stringify({ ...base, answers: { ...base.answers, vibe: [123] } })]) {
    const view = fixture({ search: '', stored: new Map([['l2t.web.ai-route-operation.v1.owner-a.completed', value]]) });
    try {
      view.account({ user: { id: 'owner-a' }, access_token: 'token-a' }, 'INITIAL_SESSION');
      assert.ok(!nodes(view.render()).some(node => node.type === 'button' && text(node).includes('Önceki rotamı geri aç')));
      assert.equal(view.calls.length, 0);
    } finally { view.dispose(); }
  }
});
