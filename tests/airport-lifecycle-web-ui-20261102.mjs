import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' ? tree : tree?.props ? text(tree.props.children) : '';
const tick = () => new Promise(resolve => setImmediate(resolve));
const closed = 'Artık kapalı · tarihî havalimanı';
const txl = { iata: 'TXL', name: 'Berlin-Tegel International Airport', city: 'Berlin', country: 'Germany', countryCode: 'DE' };
const ber = { iata: 'BER', name: 'Berlin Brandenburg Airport', city: 'Berlin', country: 'Germany', countryCode: 'DE' };
function pureModule(file) {
  const full = resolve(file);
  if (full.endsWith('.json')) return JSON.parse(readFileSync(full, 'utf8'));
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {})(id => {
    assert.ok(id.startsWith('.'));
    return pureModule(resolve(dirname(full), id.endsWith('.json') ? id : `${id}.ts`));
  }, loaded, loaded.exports);
  return loaded.exports;
}

// Real web components, controlled React scheduling and fake HTTP only.
function fixture(kind, initial = {}) {
  const file = kind === 'autocomplete' ? 'app/components/AirportAutocomplete.tsx' : 'app/components/cockpit/CockpitAirportField.tsx';
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const slots = [], jobs = new Map(), requests = [], changes = [];
  let cursor, effects, dirty, tree, jobId = 0;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((v, i) => !Object.is(v, a[i]));
  const react = {
    useState(initial) { const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useId() { const i = cursor++; return `web-airport-${i}`; },
    useMemo(calculate, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: calculate(), deps }; return slots[i].value; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || changed(old.deps, deps)) { slots[i] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const timer = (fn, ms) => { jobs.set(++jobId, { fn, ms }); return jobId; };
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    window: { setTimeout: timer, clearTimeout: id => jobs.delete(id) },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: timer, clearTimeout: id => jobs.delete(id), AbortController,
    fetch(url, options) { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); requests.push({ url, options, resolve, reject }); return promise; },
  })(id => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (id.endsWith('/airport-lifecycle')) return pureModule('lib/airport-lifecycle.ts');
    throw Error(`Unexpected web fixture dependency ${id}`);
  }, loaded, loaded.exports);
  let props = { label: 'Arrival airport', value: null, disabled: false, onChange: value => changes.push(value), ...initial };
  const h = {
    requests, changes,
    render(next = {}) { props = { ...props, ...next }; for (let pass = 0; pass < 15; pass++) { cursor = 0; effects = []; dirty = false; tree = loaded.exports.default(props); if (tree.props?.ref) tree.props.ref.current = { contains() { return false; } }; effects.forEach(run => run()); if (!dirty) return tree; } throw Error('Unstable web fixture'); },
    get tree() { return tree; },
    input() { return nodes(tree).find(node => node.type === 'input'); },
    results() { const list = nodes(tree).find(node => node.type === 'ul'); return list ? nodes(list).filter(node => node.type === 'button') : []; },
    type(value) { h.input().props.onChange({ target: { value } }); return h.render(); },
    startRequest() { const next = [...jobs.entries()].find(([, job]) => job.ms === 200 || job.ms === 250); assert.ok(next); jobs.delete(next[0]); next[1].fn(); h.render(); },
    async respond(index, rows) { requests[index].resolve({ ok: true, json: async () => rows }); await tick(); h.render(); },
    press(key) { let prevented = false; h.input().props.onKeyDown({ key, preventDefault() { prevented = true; } }); h.render(); return prevented; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); jobs.clear(); },
  };
  h.render(); return h;
}

for (const kind of ['autocomplete', 'cockpit']) {
  test(`${kind} web airport rows and preloaded selection qualify only the reviewed closed identity`, async () => {
    const h = fixture(kind);
    try {
      h.type('Berlin'); h.startRequest(); await h.respond(0, [ber, txl]);
      assert.equal(h.results().length, 2);
      assert.equal(text(h.results()[0]).includes(closed), false);
      assert.ok(text(h.results()[1]).includes(closed));
      assert.equal(h.results()[1].props.disabled, kind === 'cockpit' ? false : undefined);
      h.results()[1].props.onClick(); h.render();
      assert.equal(h.changes.at(-1), txl);
      const selectedTree = h.render({ value: txl });
      assert.ok(text(selectedTree).includes(closed));
      assert.equal(h.requests.length, 1, 'Presentation of saved identity must not request enrichment');
      assert.equal(text(h.render({ value: ber })).includes(closed), false);
      const savedOrigin = { iata: 'TXL', name: 'TXL', city: '', country: '', countryCode: '' };
      assert.ok(text(h.render({ value: savedOrigin })).includes(closed));
      assert.equal(h.requests.length, 1);
    } finally { h.dispose(); }
  });

  test(`${kind} web airport display ignores arbitrary response lifecycle data and keeps all results selectable`, async () => {
    const h = fixture(kind);
    try {
      const poison = { status: 'closed', checkedAt: 'not-a-date', sourceUrl: 'javascript:alert(1)' };
      const rows = [{ ...ber, lifecycle: poison }, { ...txl, countryCode: 'FR', lifecycle: poison }, { iata: 'ZZZ', city: 'Unknown', name: 'Unknown airport', country: 'Unknown', countryCode: 'ZZ', lifecycle: [] }];
      h.type('Airport'); h.startRequest(); await h.respond(0, rows);
      assert.equal(h.results().length, rows.length);
      assert.doesNotMatch(text(h.tree), /Kapalı|tarihî|not-a-date|javascript:|Invalid Date/);
      assert.equal(nodes(h.tree).filter(node => node.type === 'a').length, 0);
      for (const row of rows) assert.doesNotMatch(text(h.render({ value: row })), /Kapalı|tarihî|not-a-date|javascript:|Invalid Date/);
      const reviewed = h.render({ value: { ...txl, lifecycle: poison } });
      assert.ok(text(reviewed).includes(closed), 'Reviewed fallback does not trust or require the response metadata');
      assert.doesNotMatch(text(reviewed), /not-a-date|javascript:|Invalid Date/);
    } finally { h.dispose(); }
  });
}

test('web autocomplete keyboard selection preserves the exact archived airport code', async () => {
  const h = fixture('autocomplete');
  try {
    h.type('Berlin'); h.startRequest(); await h.respond(0, [ber, txl]);
    assert.ok(text(h.results()[1]).includes(closed));
    h.press('ArrowDown'); h.press('Enter');
    assert.equal(h.changes.at(-1), txl);
    assert.equal(h.changes.at(-1).iata, 'TXL');
  } finally { h.dispose(); }
});
