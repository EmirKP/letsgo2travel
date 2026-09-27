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

function appHarness({ releaseSeen = true } = {}) {
  // Run the real App event handlers. Native services and effects are excluded;
  // React state/ref slots and JSX keys let this catch an accidental remount.
  const slots = []; let cursor = 0;
  const calls = { history: [], scroll: [], focus: 0, releaseSeen: [] };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useMemo: factory => factory(), useCallback: callback => callback, useEffect: () => {},
    lazy: loader => `Lazy:${loader.toString()}`, Suspense: 'Suspense', Activity: 'Activity',
  };
  const storage = { getMobilePreferences: () => ({ inAppNotifications: true }), getGuestDataSummary: () => ({ total: 0 }), hasCompletedOnboarding: () => true, hasSeenRelease: () => releaseSeen, markReleaseSeen: id => calls.releaseSeen.push(id) };
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
  const window = {
      location: { href: 'https://test.invalid/#route', origin: 'https://test.invalid' },
      history: { pushState: (...args) => calls.history.push(args), replaceState: (...args) => calls.history.push(args) },
      scrollY: 0, matchMedia: () => ({ matches: true }), scrollTo: value => { calls.scroll.push(value); window.scrollY = value.top; }, requestAnimationFrame: fn => fn(),
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    URL, navigator: { onLine: true }, window,
  })(name => imports[name] || new Proxy({}, { get: (_, key) => String(key) }), output, output.exports);
  const render = () => { cursor = 0; return output.exports.default(); };
  const planner = view => nodes(view).find(node => typeof node.type === 'string' && node.type.startsWith('Lazy:') && node.type.includes('RouteAssistantScreen'));
  const bottomButton = (view, label) => nodes(nodes(view).find(node => node.type === 'nav' && node.props.className === 'bottom-nav')).find(node => node.type === 'button' && text(node.props.children) === label);
  const screen = (view, name) => nodes(view).find(node => typeof node.type === 'string' && (node.type === name || (node.type.startsWith('Lazy:') && node.type.includes(name))));
  const plannerPane = view => nodes(view).find(node => node.type === 'NavigationPane' && planner(node));
  return { render, planner, bottomButton, screen, plannerPane, calls, window };
}

test('Plan preserves its draft identity across reselect, menu and tab round trips without duplicate history', () => {
  const { render, planner, bottomButton, calls } = appHarness();
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
  assert.equal(calls.history.length, 2); assert.equal(planner(view).key, originalKey, 'Returning to Plan keeps the existing draft');
  assert.equal(nodes(view).filter(node => node.type === 'Activity' && node.props.mode === 'visible').length, 1);
  bottomButton(view, 'Ana Sayfa').props.onClick(); view = render();
  assert.equal(nodes(view).filter(node => node.type === 'Activity' && node.props.mode === 'visible').length, 0, 'Hidden drafts have no active effects');
  assert.ok(planner(view), 'The hidden planner keeps its state tree');
});

test('New route seeds reset Plan scroll; ordinary tab returns preserve the existing position and draft', () => {
  for (const [source, screenName, kind] of [['home', 'HomeScreen', 'explore'], ['explore', 'ExploreScreen', 'explore'], ['surprise', 'SurpriseScreen', 'surprise']]) {
    const { render, planner, plannerPane, bottomButton, screen, window } = appHarness();
    let view = render();
    const draftKey = planner(view).key;
    window.scrollY = 940;
    bottomButton(view, 'Ana Sayfa').props.onClick(); view = render();
    bottomButton(view, 'Planla').props.onClick(); view = render();
    assert.equal(plannerPane(view).props.restoreTop, 940, 'An ordinary return restores the prior form position');
    assert.equal(planner(view).key, draftKey);
    window.scrollY = 670;
    nodes(view).find(node => node.type === 'MenuSheet').props.onNavigate(source); view = render();
    const seed = { id: `${source}-new-destination`, destinationCode: 'FCO' };
    screen(view, screenName).props.onBuildRoute(seed); view = render();
    assert.equal(plannerPane(view).props.restoreTop, 0, `${source}: new destination opens at the form heading`);
    assert.equal(planner(view).props.surpriseRoute, seed);
    assert.equal(planner(view).props.routeSeedKind, kind);
    assert.equal(planner(view).key, draftKey, 'A new seed does not unnecessarily remount the planner');
  }
});

test('Saved events shortcut opens the events category and regular Saved tab returns to its overview', () => {
  const { render, screen, bottomButton } = appHarness();
  let view = render();
  nodes(view).find(node => node.type === 'MenuSheet').props.onNavigate('events'); view = render();
  screen(view, 'EventsScreen').props.onOpenSaved(); view = render();
  assert.equal(screen(view, 'PlansScreen').props.initialSection, 'events');
  bottomButton(view, 'Ana Sayfa').props.onClick(); view = render();
  bottomButton(view, 'Kaydedilenler').props.onClick(); view = render();
  assert.equal(screen(view, 'PlansScreen').props.initialSection, 'all');
});

test('Closing local account and release overlays preserves the planner tree and executes their own close actions', () => {
  const { render, planner, calls } = appHarness({ releaseSeen: false });
  let view = render();
  const draftKey = planner(view).key;
  const release = nodes(view).find(node => node.type === 'LazyOverlay');
  assert.match(release.props.children.type, /ReleaseNotesSheet/);
  assert.equal(nodes(release).some(node => node.type === 'NavigationPane'), false, 'The overlay boundary does not own the app screen');
  release.props.onClose(); view = render();
  assert.equal(calls.releaseSeen.length, 1, 'Closing release loading/error marks it seen via the normal close callback');
  assert.equal(nodes(view).some(node => node.type === 'LazyOverlay'), false);
  assert.equal(planner(view).key, draftKey);
  nodes(view).find(node => node.type === 'MenuSheet').props.onOpenAccount(); view = render();
  const account = nodes(view).find(node => node.type === 'LazyOverlay');
  assert.match(account.props.children.type, /AccountSheet/);
  account.props.onClose(); view = render();
  assert.equal(nodes(view).some(node => node.type === 'LazyOverlay'), false);
  assert.equal(planner(view).key, draftKey);
});

test('Lazy overlay failure and loading offer the same close action without exposing raw errors', () => {
  class Component { constructor(props) { this.props = props; } }
  const imports = {
    react: { Component, Suspense: 'Suspense' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../lib/i18n': { useI18n: () => ({ copy: tr => tr }) },
    './Sheet': { Sheet: 'Sheet' },
  };
  const code = ts.transpileModule(readFileSync(new URL('../mobile/src/components/LazyOverlay.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {})(name => imports[name], output, output.exports);
  let closed = 0;
  const child = jsx('FakeOverlay', {});
  const wrapper = output.exports.LazyOverlay({ children: child, title: 'Hesap', loadingMessage: 'Hazırlanıyor', onClose: () => closed++ });
  const boundary = new wrapper.type(wrapper.props);
  assert.equal(boundary.render().props.children, child);
  const loading = boundary.render().props.fallback;
  assert.equal(loading.type, 'Sheet');
  assert.equal(loading.props.open, true);
  loading.props.onClose();
  // React calls this transition for either a rejected lazy import or a child render error.
  boundary.state = wrapper.type.getDerivedStateFromError(new Error('private failure detail'));
  const failure = boundary.render();
  assert.equal(failure.type, 'Sheet');
  assert.equal(failure.props.onClose, loading.props.onClose);
  assert.equal(text(failure).includes('private failure detail'), false);
  const alert = nodes(failure).find(node => node.props?.role === 'alert');
  assert.ok(alert);
  nodes(failure).find(node => node.type === 'button').props.onClick();
  assert.equal(closed, 2);
  assert.equal(new wrapper.type(wrapper.props).state.failed, false, 'A newly opened overlay has a fresh local boundary');
});
