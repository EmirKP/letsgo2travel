import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
function nodes(value) {
  if (!value || typeof value !== 'object') return [];
  return [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join('');
  return value?.props ? text(value.props.children) : typeof value === 'string' ? value : '';
}

test('Reselecting Plan from the bottom bar or More preserves planner identity without adding history', () => {
  // Run the real App event handlers. Native services and effects are excluded;
  // React state/ref slots and JSX keys let this catch an accidental remount.
  const slots = []; let cursor = 0;
  const calls = { history: [], scroll: [], focus: 0 };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useMemo: factory => factory(), useCallback: callback => callback, useEffect: () => {},
    lazy: loader => `Lazy:${loader.toString()}`, Suspense: 'Suspense',
  };
  const storage = { getMobilePreferences: () => ({ inAppNotifications: true }), getGuestDataSummary: () => ({ total: 0 }), hasCompletedOnboarding: () => true, hasSeenRelease: () => true };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-dom': { createPortal: value => value },
    './hooks/useAuth': { useAuth: () => ({ user: null, accessToken: '' }) },
    './lib/i18n': { useI18n: () => ({ locale: 'tr', copy: tr => tr, setLocale: () => {} }) },
    './lib/native': { impact: async () => {} },
    './lib/capacitor': { isNativePlatform: () => false },
    './lib/tripCollaboration': { pendingTripInvite: () => '' },
    './lib/storage': storage,
  };
  const code = ts.transpileModule(readFileSync(new URL('../mobile/src/App.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    URL, navigator: { onLine: true }, window: {
      location: { href: 'https://test.invalid/#route', origin: 'https://test.invalid' },
      history: { pushState: (...args) => calls.history.push(args), replaceState: (...args) => calls.history.push(args) },
      matchMedia: () => ({ matches: true }), scrollTo: value => calls.scroll.push(value), requestAnimationFrame: fn => fn(),
    },
  })(name => imports[name] || new Proxy({}, { get: (_, key) => String(key) }), output, output.exports);
  const render = () => { cursor = 0; return output.exports.default(); };
  const planner = view => nodes(view).find(node => typeof node.type === 'string' && node.type.startsWith('Lazy:') && node.type.includes('RouteAssistantScreen'));
  const bottomButton = (view, label) => nodes(nodes(view).find(node => node.type === 'nav' && node.props.className === 'bottom-nav')).find(node => node.type === 'button' && text(node.props.children) === label);
  let view = render();
  nodes(view).find(node => node.type === 'main').props.ref.current = { focus: () => calls.focus++ };
  const originalKey = planner(view).key;
  assert.ok(originalKey); assert.equal(typeof planner(view).props.onNavigate, 'function');
  bottomButton(view, 'Planla').props.onClick(); view = render();
  assert.equal(planner(view).key, originalKey, 'Reselecting the current tab must not remount the draft');
  nodes(view).find(node => node.type === 'MenuSheet').props.onNavigate('route'); view = render();
  assert.equal(planner(view).key, originalKey, 'The menu must preserve the same active draft');
  assert.equal(calls.history.length, 0); assert.equal(calls.focus, 2); assert.equal(calls.scroll.length, 2);
  assert.ok(calls.scroll.every(value => value.top === 0 && value.behavior === 'auto'));
  bottomButton(view, 'Ana Sayfa').props.onClick(); view = render();
  bottomButton(view, 'Planla').props.onClick(); view = render();
  assert.equal(calls.history.length, 2); assert.notEqual(planner(view).key, originalKey, 'Opening a new planner still starts a fresh plan');
});
