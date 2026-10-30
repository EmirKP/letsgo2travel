import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const key = 'l2t.budget-sign-in.v1';
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const jsx = (type, props) => ({ type, props });
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
function hookHost() {
  const slots = []; let cursor = 0, dirty = false, effects = [], renderFn;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((v, i) => !Object.is(v, a[i]));
  const memo = (fn, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; };
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { const next = typeof value === 'function' ? value(slots[i].value) : value; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (changed(old?.deps, deps)) { slots[i] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  return { react, render(fn) { renderFn = fn || renderFn; for (let n = 0; n < 20; n++) { cursor = 0; dirty = false; effects = []; const tree = renderFn(); effects.forEach(fn => fn()); if (!dirty) return tree; } throw Error('Unstable fixture'); } };
}
function fixture(storage = new Map()) {
  const clock = { now: Date.UTC(2026, 9, 26, 12) }, failures = { read: false, write: false, remove: false };
  class Clock extends Date { static now() { return clock.now; } }
  const localStorage = { getItem(k) { if (failures.read) throw Error('Storage blocked'); return storage.get(k) ?? null; }, setItem(k, v) { if (failures.write) throw Error('Storage blocked'); storage.set(k, v); }, removeItem(k) { if (failures.remove) throw Error('Storage blocked'); storage.delete(k); } };
  const cache = new Map();
  function load(file, overrides = {}) {
    let full = path.resolve(file); if (!existsSync(full)) full += '.ts';
    if (cache.has(full)) return cache.get(full);
    if (full.endsWith('.json')) return { default: JSON.parse(readFileSync(full, 'utf8')) };
    const fixtureModule = { exports: {} }; cache.set(full, fixtureModule.exports);
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Error, Date: Clock, URL, Intl, window: { localStorage } })(name => Object.hasOwn(overrides, name) ? overrides[name] : load(path.resolve(path.dirname(full), name)), fixtureModule, fixtureModule.exports);
    cache.set(full, fixtureModule.exports); return fixtureModule.exports;
  }
  const budgets = load('mobile/src/lib/budgetCockpitIntent.ts'), model = load('lib/country-intelligence/personal-budget.ts');
  const city = load('lib/country-intelligence/city-benchmarks.ts').CITY_BENCHMARKS.find(row => row.id === 'RS-belgrade');
  const intent = budgets.createPersonalBudgetCockpitIntent(city, { ...model.DEFAULT_PERSONAL_BUDGET }, 'GBP', null, null, 'Belgrad', clock.now);
  const resume = load('mobile/src/lib/budgetSignInResume.ts');
  return { storage, clock, failures, load, budgets, intent, resume };
}

test('Guest budget survives an OAuth reload as a private copy, binds once, and resumes only its review intent', () => {
  const x = fixture(), original = plain(x.intent);
  assert.equal(x.resume.prepareBudgetSignInResume(x.intent), true);
  x.intent.city = 'Changed elsewhere'; x.intent.personalPreferences.days = '7';
  const restored = fixture(x.storage);
  assert.equal(restored.resume.claimBudgetSignInResume('account-a'), true);
  const intent = restored.resume.takeBudgetSignInResume('account-a');
  assert.deepEqual(plain(intent), { ...original, ownerId: 'account-a' });
  assert.equal(restored.budgets.validateBudgetCockpitIntent(intent), true);
  assert.equal(x.storage.has(key), false);
  assert.equal(restored.resume.takeBudgetSignInResume('account-a'), null);
  assert.equal(x.resume.claimBudgetSignInResume('account-b'), false, 'Another window cannot replay its cached memory action');
});

test('An already-owned budget, invalid snapshot, expired action and future timestamp never become a guest resume', () => {
  for (const change of [{ ownerId: 'old-owner' }, { estimate: { total: 1 } }, { kind: 'saved-route' }]) {
    const x = fixture(); assert.equal(x.resume.prepareBudgetSignInResume({ ...x.intent, ...change }), false); assert.equal(x.storage.has(key), false);
  }
  for (const offset of [-1, 30 * 60_000, 24 * 3600_000]) {
    const x = fixture(); x.resume.prepareBudgetSignInResume(x.intent); x.clock.now += offset;
    assert.equal(x.resume.claimBudgetSignInResume('account-a'), false); assert.equal(x.storage.has(key), false);
  }
});

test('Profile completion cannot move a claimed budget to another account or consume without a claim', () => {
  const x = fixture(); x.resume.prepareBudgetSignInResume(x.intent);
  assert.equal(x.resume.takeBudgetSignInResume('account-a'), null);
  assert.equal(x.resume.claimBudgetSignInResume('account-a'), true);
  assert.equal(x.resume.claimBudgetSignInResume('account-b'), false);
  assert.equal(x.resume.hasBudgetSignInResume(), false);
  assert.equal(fixture(x.storage).resume.claimBudgetSignInResume('account-a'), false);
});

test('Explicit cancellation deletes the pending action across reloads; malformed stored data is discarded', () => {
  const x = fixture(); x.resume.prepareBudgetSignInResume(x.intent); x.resume.clearBudgetSignInResume();
  assert.equal(fixture(x.storage).resume.hasBudgetSignInResume(), false);
  for (const raw of ['not JSON', JSON.stringify({ version: 1, createdAt: x.clock.now, claimedOwner: null, intent: { kind: 'city-budget' } }), 'x'.repeat(60_001)]) {
    const next = fixture(new Map([[key, raw]])); assert.equal(next.resume.hasBudgetSignInResume(), false); assert.equal(next.storage.has(key), false);
  }
});

test('Unavailable storage still supports same-app login; failed stored consumption cannot open a duplicate review', () => {
  const x = fixture(); x.failures.read = true; x.failures.write = true; x.failures.remove = true;
  assert.equal(x.resume.prepareBudgetSignInResume(x.intent), true); assert.equal(x.resume.claimBudgetSignInResume('account-a'), true); assert.equal(x.resume.takeBudgetSignInResume('account-a').city, 'Belgrad');
  const y = fixture(); y.resume.prepareBudgetSignInResume(y.intent); y.resume.claimBudgetSignInResume('account-a'); y.failures.remove = true;
  assert.equal(y.resume.takeBudgetSignInResume('account-a'), null); y.resume.clearBudgetSignInResume(); assert.equal(y.resume.hasBudgetSignInResume(), false);
});

function resumeHookFixture() {
  const x = fixture(), host = hookHost(), events = [];
  const { useBudgetSignInResume } = x.load('mobile/src/hooks/useBudgetSignInResume.ts', { react: host.react });
  let props = { ownerId: null, accessToken: '', loading: false, recoveryPending: false, profileComplete: false, onRequireProfile: () => events.push('profile'), onResume: intent => events.push(plain(intent)) };
  const render = next => { props = { ...props, ...next }; host.render(() => useBudgetSignInResume(props)); };
  render(); return { ...x, events, render };
}
test('Email/OAuth auth transition waits for a settled session and resumes once without writing a trip', () => {
  const x = resumeHookFixture(); x.resume.prepareBudgetSignInResume(x.intent);
  x.render({ ownerId: 'account-a', accessToken: 'token', loading: true, profileComplete: true }); assert.equal(x.events.length, 0);
  x.render({ loading: false }); assert.equal(x.events.length, 1); assert.equal(x.events[0].city, 'Belgrad'); assert.equal(x.events[0].ownerId, 'account-a');
  x.render({ accessToken: 'refreshed-token' }); assert.equal(x.events.length, 1); assert.equal(x.storage.has(key), false);
});
test('Recovery and incomplete profiles hold the exact budget until complete; signout/switch clear it', () => {
  const x = resumeHookFixture(); x.resume.prepareBudgetSignInResume(x.intent);
  x.render({ ownerId: 'account-a', accessToken: 'token', recoveryPending: true }); assert.deepEqual(x.events, ['profile']);
  x.render({ recoveryPending: false }); assert.deepEqual(x.events, ['profile', 'profile']);
  x.render({ profileComplete: true }); assert.equal(x.events[2].sourceBenchmarkId, 'RS-belgrade');
  for (const nextOwner of [null, 'account-b']) {
    const y = resumeHookFixture(); y.resume.prepareBudgetSignInResume(y.intent); y.render({ ownerId: 'account-a', accessToken: 'token' });
    y.render({ ownerId: nextOwner, accessToken: nextOwner ? 'b-token' : '', profileComplete: true });
    assert.deepEqual(y.events, ['profile']); assert.equal(y.resume.hasBudgetSignInResume(), false);
  }
});
test('Cancelling profile entry prevents later sign-in from resurrecting the selected budget', () => {
  const x = resumeHookFixture(); x.resume.prepareBudgetSignInResume(x.intent); x.render({ ownerId: 'account-a', accessToken: 'token' });
  x.resume.clearBudgetSignInResume(); x.render({ profileComplete: true }); assert.deepEqual(x.events, ['profile']);
});
test('A cold app with a restored authenticated session continues the pending OAuth budget once', () => {
  const before = fixture(); before.resume.prepareBudgetSignInResume(before.intent);
  const after = fixture(before.storage), host = hookHost(), events = [];
  const { useBudgetSignInResume } = after.load('mobile/src/hooks/useBudgetSignInResume.ts', { react: host.react });
  const props = { ownerId: 'account-a', accessToken: 'restored-token', loading: true, recoveryPending: false, profileComplete: true, onRequireProfile: () => events.push('profile'), onResume: intent => events.push(plain(intent)) };
  host.render(() => useBudgetSignInResume(props)); assert.equal(events.length, 0);
  props.loading = false; host.render(); assert.equal(events.length, 1); assert.equal(events[0].city, 'Belgrad'); assert.equal(events[0].ownerId, 'account-a');
  assert.equal(after.resume.takeBudgetSignInResume('account-a'), null);
});

function accountFixture({ reject = false, authenticated = true } = {}) {
  const x = fixture(), host = hookHost(), calls = [], notices = [];
  const auth = { configured: true, loading: false, recoveryPending: false, authError: '', user: null, accessToken: '', clearAuthError() {}, async signInWithEmail(email, password) { calls.push({ email, password }); if (reject) throw Error('Login failed'); } };
  const { AccountSheet } = x.load('mobile/src/components/AccountSheet.tsx', {
    react: host.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../lib/localeFormatting': { formatAppDate: () => '' }, '../lib/capacitor': { isIOSNative: () => false }, '../lib/config': { config: {} },
    './LegalSheet': { LegalSheet: 'Legal' }, './Icon': { Icon: 'Icon' }, './Sheet': { Sheet: 'Sheet' }, './AccountDeletionPanel': { AccountDeletionPanel: 'Deletion' }, '../lib/i18n': { useI18n: () => ({ copy: (_tr, en) => en }) }, '../lib/supabaseData': {},
  });
  const render = () => host.render(() => AccountSheet({ open: true, auth, onClose: () => { calls.push('cancel'); x.resume.clearBudgetSignInResume(); }, ...(authenticated ? { onAuthenticated: () => calls.push('authenticated') } : {}), onNotice: value => notices.push(value) }));
  render(); x.resume.prepareBudgetSignInResume(x.intent);
  const change = (type, value) => { nodes(render()).find(node => node.type === 'input' && node.props.type === type).props.onChange({ target: { value } }); render(); };
  change('email', 'guest@example.invalid'); change('password', 'test-password');
  return { ...x, calls, notices, render };
}
test('Successful email login uses the completion callback instead of a stale guest cancellation callback', async () => {
  const x = accountFixture(); const submit = nodes(x.render()).find(node => node.type === 'button' && node.props.className === 'primary-wide');
  assert.ok(submit); submit.props.onClick(); await tick();
  assert.deepEqual(x.calls, [{ email: 'guest@example.invalid', password: 'test-password' }, 'authenticated']);
  assert.equal(x.resume.hasBudgetSignInResume(), true, 'The authenticated owner effect still has the selected snapshot to claim');
  assert.equal(nodes(x.render()).find(node => node.type === 'input' && node.props.type === 'password').props.value, '');
});
test('Failed email login retains the selection for retry; an explicit close cancels it', async () => {
  const x = accountFixture({ reject: true }); nodes(x.render()).find(node => node.type === 'button' && node.props.className === 'primary-wide').props.onClick(); await tick();
  assert.equal(x.calls.length, 1); assert.equal(x.resume.hasBudgetSignInResume(), true); assert.equal(x.notices.at(-1), 'Login failed');
  x.render().props.onClose({ type: 'click' }); assert.equal(x.calls.at(-1), 'cancel'); assert.equal(x.resume.hasBudgetSignInResume(), false);
});
test('AccountSheet callers without a completion callback keep their existing close behavior', async () => {
  const x = accountFixture({ authenticated: false }); nodes(x.render()).find(node => node.type === 'button' && node.props.className === 'primary-wide').props.onClick(); await tick(); assert.equal(x.calls.at(-1), 'cancel');
});
