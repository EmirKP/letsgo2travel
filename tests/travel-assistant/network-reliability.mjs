import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports, globals = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { URL, URLSearchParams, AbortController, AbortSignal, DOMException, Date, Response, Request, ...globals })(name => imports[name] || {}, output, output.exports);
  return output.exports;
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function network() {
  const wait = deferred(), calls = [], timers = new Map(); let id = 0;
  const api = load('mobile/src/lib/api.ts', {
    './capacitor': { isNativePlatform: () => true, plugin: () => ({ request: options => { calls.push(options); return wait.promise; } }) },
    './config': { config: { apiBaseUrl: 'https://example.test' } }, './i18n': { localeFromStorage: () => 'en' },
  }, { window: { setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key) } });
  return { ...wait, calls, timers, api, deadline() { [...timers.values()].forEach(fn => fn()); } };
}

test('Native cancellation settles before the bridge resolves and ignores its later result', async () => {
  const h = network(), controller = new AbortController();
  const pending = h.api.requestJson('/places', { signal: controller.signal });
  assert.equal(h.calls.length, 1);
  const rejection = assert.rejects(pending, error => error.code === 'aborted');
  controller.abort(); await rejection;
  assert.equal(h.timers.size, 0);
  h.resolve({ status: 200, data: { mustNotAppear: true } });
  await Promise.resolve();
  await assert.rejects(h.api.requestJson('/places', { signal: controller.signal }), error => error.code === 'aborted');
  assert.equal(h.calls.length, 1);
});

test('Native wall-clock deadline settles a hanging bridge and consumes a late rejection safely', async () => {
  const h = network();
  const pending = h.api.requestJson('/places', { timeoutMs: 25 });
  assert.equal(h.calls[0].connectTimeout, 25); assert.equal(h.calls[0].readTimeout, 25);
  const rejection = assert.rejects(pending, error => error.code === 'timeout');
  h.deadline(); await rejection;
  assert.equal(h.timers.size, 0);
  h.reject(new Error('Late native socket failure'));
  await new Promise(setImmediate);
});

test('Native success and HTTP failures clear their timers without changing payload semantics', async () => {
  const good = network(); const result = good.api.requestJson('/rates');
  good.resolve({ status: 200, data: '{"rate":1.25}' });
  assert.equal((await result).rate, 1.25); assert.equal(good.timers.size, 0);
  const bad = network(); const error = bad.api.requestJson('/photo');
  bad.resolve({ status: 429, data: { code: 'daily-limit' } });
  await assert.rejects(error, failure => failure.status === 429 && failure.code === 'daily-limit');
  assert.equal(bad.timers.size, 0);
});

test('A successful noopener handoff never also navigates the application tab', async () => {
  const opened = [], assigned = [];
  const api = load('mobile/src/lib/native.ts', {
    './capacitor': { isNativePlatform: () => false, plugin: () => null },
    './config': { config: { apiBaseUrl: 'https://example.test' } },
  }, { window: { open: (...args) => { opened.push(args); return null; }, location: { assign: url => assigned.push(url) } } });
  assert.equal(await api.openExternal('https://www.google.com/maps/'), true);
  assert.equal(opened.length, 1); assert.equal(opened[0][2], 'noopener,noreferrer');
  assert.deepEqual(assigned, []);
  assert.equal(await api.openExternal('javascript:alert(1)'), false);
  assert.equal(opened.length, 1);
});

test('A failed external handoff reports failure without navigating the app', async () => {
  const api = load('mobile/src/lib/native.ts', { './capacitor': { isNativePlatform: () => false, plugin: () => null }, './config': { config: { apiBaseUrl: 'https://example.test' } } }, { window: { open: () => { throw Error('unavailable'); }, location: { assign() { throw Error('Unexpected app navigation'); } } } });
  assert.equal(await api.openExternal('/advice'), false);
});

test('A valid slow interchange lookup fits within the station picker request budget', async () => {
  let elapsed = 0;
  const transit = load('lib/travel-assistant/transit.ts', {});
  const route = load('app/api/travel-assistant/transit/route.ts', {
    '@/lib/travel-assistant/transit': transit,
    '@/lib/country-intelligence/fetch': { publicJson: async url => {
      if (url.includes('/Search?')) { elapsed += 9000; return { matches: [{ id: 'HUBWAT', name: 'Waterloo' }] }; }
      elapsed += 7000; return { children: [{ id: '940GZZLUWLO', commonName: 'Waterloo Underground', modes: ['tube'] }] };
    } },
  });
  const hooks = []; let index = 0, search;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = value; }]; },
    useRef(initial) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; }, useEffect() {},
  };
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync('mobile/src/components/TravelTransit.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const imports = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../lib/config': { config: { travelAssistantApiBaseUrl: 'https://example.test' } }, '../lib/i18n': { useI18n: () => ({ copy: (tr, en) => en }) }, '../../../lib/travel-assistant/transit': transit,
    '../lib/api': { requestJson: (url, options) => { search = (async () => { const result = await route.GET(new Request(url)); if (elapsed >= options.timeoutMs) throw Error('Client deadline'); return result.json(); })(); return search; } },
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\nexports.StopPickerForTest = StopPicker;})`, { URLSearchParams })(name => imports[name] || {}, output, output.exports);
  const render = () => { index = 0; return output.exports.StopPickerForTest({ label: 'From', value: null, onChange() {} }); };
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  nodes(render()).find(node => node.type === 'input').props.onChange({ target: { value: 'Waterloo' } });
  nodes(render()).find(node => node.type === 'button').props.onClick();
  await search; await new Promise(setImmediate);
  assert.equal(elapsed, 16000);
  assert.ok(nodes(render()).some(node => node.type === 'button' && node.props.children === 'Waterloo Underground'));
});
