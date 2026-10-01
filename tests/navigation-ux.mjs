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
function sharedHeader(view) {
  const headers = nodes(view).filter(node => node.type === 'header' && node.props.className?.split(' ').includes('shared-topbar'));
  assert.equal(headers.length, 1, 'Every screen uses exactly one shared application header');
  return headers[0];
}
function headerButton(view, icon) {
  const button = nodes(sharedHeader(view)).find(node => node.type === 'button' && nodes(node).some(child => child.type === 'Icon' && child.props.name === icon));
  assert.ok(button, `The shared header exposes the ${icon} action`);
  return button;
}
function notificationBadge(view) {
  return nodes(headerButton(view, 'bell')).find(node => node.props?.className === 'notification-badge');
}

function appHarness({ releaseSeen = true, initialView = 'route', locale = 'tr', nativeStatus = false, inAppNotifications = true } = {}) {
  // Run the real App event handlers. Native services and effects are excluded;
  // React state/ref slots and JSX keys let this catch an accidental remount.
  const slots = []; let cursor = 0;
  const calls = { history: [], scroll: [], focus: 0, releaseSeen: [], statusStyle: [], statusBackground: [], statusOverlay: [] };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useMemo: factory => factory(), useCallback: callback => callback,
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      const changed = !previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]));
      slots[index] = { deps };
      // Execute only the native status-bar effects with their real dependencies.
      // The rest of App's lifecycle would require unrelated native services.
      if (changed && nativeStatus && effect.toString().includes('"StatusBar"')) effect();
    },
    lazy: loader => `Lazy:${loader.toString()}`, Suspense: 'Suspense', Activity: 'Activity',
  };
  const auth = { user: null, accessToken: '' };
  const savedByOwner = new Map();
  const storage = {
    getMobilePreferences: () => ({ inAppNotifications }), getGuestDataSummary: () => ({ total: 0 }), hasCompletedOnboarding: () => true, hasSeenRelease: () => releaseSeen, markReleaseSeen: id => calls.releaseSeen.push(id),
    getSavedRoutePlans: owner => savedByOwner.get(owner || 'guest') || [],
    saveRoutePlan: (item, owner) => savedByOwner.set(owner || 'guest', [item, ...storage.getSavedRoutePlans(owner).filter(saved => saved.id !== item.id)]),
    deleteRoutePlan: (id, owner) => savedByOwner.set(owner || 'guest', storage.getSavedRoutePlans(owner).filter(saved => saved.id !== id)),
  };
  const inspirationModule = { exports: {} };
  const inspirationCode = ts.transpileModule(readFileSync(new URL('../mobile/src/lib/inspirationRoutes.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${inspirationCode}\n})`, { Date })(name => name === './storage' ? storage : { createId: () => 'fixture-generation' }, inspirationModule, inspirationModule.exports);
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-dom': { createPortal: value => value },
    './hooks/useAuth': { useAuth: () => auth },
    './lib/i18n': { useI18n: () => ({ locale, copy: (tr, en) => locale === 'tr' ? tr : en, setLocale: () => {} }) },
    './lib/native': { impact: async () => {} },
    './lib/capacitor': {
      isNativePlatform: () => nativeStatus,
      plugin: name => name === 'StatusBar' ? {
        setStyle: async value => calls.statusStyle.push(value),
        setBackgroundColor: async value => calls.statusBackground.push(value),
        setOverlaysWebView: async value => calls.statusOverlay.push(value),
      } : null,
    },
    './lib/tripCollaboration': { pendingTripInvite: () => '' },
    './lib/storage': storage,
    './lib/inspirationRoutes': inspirationModule.exports,
  };
  const code = ts.transpileModule(readFileSync(new URL('../mobile/src/App.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const output = { exports: {} };
  const window = {
      location: { href: `https://test.invalid/#${initialView}`, origin: 'https://test.invalid' },
      history: { pushState: (...args) => calls.history.push(args), replaceState: (...args) => calls.history.push(args) },
      scrollY: 0, matchMedia: () => ({ matches: true }), scrollTo: value => { calls.scroll.push(value); window.scrollY = value.top; }, requestAnimationFrame: fn => fn(),
      setTimeout: () => 1, clearTimeout: () => {},
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    URL, navigator: { onLine: true }, document: { body: {} }, window,
  })(name => imports[name] || new Proxy({}, { get: (_, key) => String(key) }), output, output.exports);
  const render = () => { cursor = 0; return output.exports.default(); };
  const planner = view => nodes(view).find(node => typeof node.type === 'string' && node.type.startsWith('Lazy:') && node.type.includes('RouteAssistantScreen'));
  const bottomButton = (view, label) => nodes(nodes(view).find(node => node.type === 'nav' && node.props.className === 'bottom-nav')).find(node => node.type === 'button' && text(node.props.children) === label);
  const screen = (view, name) => nodes(view).find(node => typeof node.type === 'string' && (node.type === name || (node.type.startsWith('Lazy:') && node.type.includes(name))));
  const plannerPane = view => nodes(view).find(node => node.type === 'NavigationPane' && planner(node));
  return { render, planner, bottomButton, screen, plannerPane, calls, window, auth, storage, savedByOwner };
}

test('Planner preserves its draft across menu reselect and home shortcut round trips without duplicate history', () => {
  const { render, planner, bottomButton, screen, calls } = appHarness();
  let view = render();
  nodes(view).find(node => node.type === 'main').props.ref.current = { focus: () => calls.focus++ };
  const originalKey = planner(view).key;
  assert.ok(originalKey); assert.equal(typeof planner(view).props.onNavigate, 'function');
  nodes(view).find(node => node.type === 'MenuSheet').props.onNavigate('route'); view = render();
  assert.equal(planner(view).key, originalKey, 'Reselecting the current planner must not remount the draft');
  nodes(view).find(node => node.type === 'MenuSheet').props.onNavigate('route'); view = render();
  assert.equal(planner(view).key, originalKey, 'The menu must preserve the same active draft');
  assert.equal(calls.history.length, 0); assert.equal(calls.focus, 2); assert.equal(calls.scroll.length, 2);
  assert.ok(calls.scroll.every(value => value.top === 0 && value.behavior === 'auto'));
  bottomButton(view, 'Keşfet').props.onClick(); view = render();
  screen(view, 'HomeScreen').props.onNavigate('route'); view = render();
  assert.equal(calls.history.length, 2); assert.equal(planner(view).key, originalKey, 'Returning to Plan keeps the existing draft');
  assert.equal(nodes(view).filter(node => node.type === 'Activity' && node.props.mode === 'visible').length, 1);
  bottomButton(view, 'Keşfet').props.onClick(); view = render();
  assert.equal(nodes(view).filter(node => node.type === 'Activity' && node.props.mode === 'visible').length, 0, 'Hidden drafts have no active effects');
  assert.ok(planner(view), 'The hidden planner keeps its state tree');
});

test('New route seeds reset Plan scroll; ordinary tab returns preserve the existing position and draft', () => {
  for (const [source, screenName, kind] of [['home', 'HomeScreen', 'explore'], ['explore', 'ExploreScreen', 'explore'], ['surprise', 'SurpriseScreen', 'surprise']]) {
    const { render, planner, plannerPane, bottomButton, screen, window } = appHarness();
    let view = render();
    const draftKey = planner(view).key;
    window.scrollY = 940;
    bottomButton(view, 'Keşfet').props.onClick(); view = render();
    screen(view, 'HomeScreen').props.onNavigate('route'); view = render();
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
  bottomButton(view, 'Keşfet').props.onClick(); view = render();
  bottomButton(view, 'Planlar').props.onClick(); view = render();
  assert.equal(screen(view, 'PlansScreen').props.initialSection, 'all');
});

test('Reference navigation has five translated roots and one shared header across root and detail screens', () => {
  for (const [locale, labels] of [['tr', ['Keşfet', 'Planlar', 'Topluluk', 'Araçlar', 'Profil']], ['en', ['Explore', 'Plans', 'Community', 'Tools', 'Profile']]]) {
    const { render, bottomButton } = appHarness({ initialView: 'home', locale });
    let view = render();
    const nav = nodes(view).find(node => node.type === 'nav' && node.props.className === 'bottom-nav');
    const buttons = nodes(nav).filter(node => node.type === 'button');
    assert.deepEqual(buttons.map(button => text(button)), labels);
    assert.deepEqual(buttons.map(button => nodes(button).find(node => node.type === 'Icon').props.name), ['home', 'calendar', 'users', 'suitcase', 'user']);
    assert.equal(headerButton(view, 'bell').props['aria-label'], locale === 'tr' ? 'Bildirimler' : 'Notifications');
    assert.equal(headerButton(view, 'menu').props['aria-label'], locale === 'tr' ? 'Daha fazla' : 'More');
    assert.equal(nodes(sharedHeader(view)).some(node => node.props?.className === 'topbar-back'), false, 'Home is a root screen');
    for (const label of labels.slice(1)) {
      bottomButton(view, label).props.onClick(); view = render();
      assert.equal(bottomButton(view, label).props['aria-current'], 'page');
      assert.ok(headerButton(view, 'bell'));
      assert.ok(headerButton(view, 'menu'));
      assert.equal(nodes(sharedHeader(view)).some(node => node.props?.className === 'topbar-back'), false, 'Root sections are not nested screens');
    }
    for (const detail of ['explore', 'route', 'passport', 'surprise', 'cockpit', 'alerts', 'events', 'phrases', 'admin', 'costs', 'airports', 'country-news']) {
      nodes(view).find(node => node.type === 'MenuSheet').props.onNavigate(detail); view = render();
      assert.ok(headerButton(view, 'back'), `${detail} retains its back action in the shared header`);
      assert.ok(headerButton(view, 'bell'));
      assert.ok(headerButton(view, 'menu'));
      const home = nodes(sharedHeader(view)).find(node => node.props?.className === 'brand-button');
      assert.equal(home.props['aria-label'], locale === 'tr' ? 'LetsGo2Travel ana sayfa' : 'LetsGo2Travel home');
      home.props.onClick(); view = render();
      assert.equal(bottomButton(view, labels[0]).props['aria-current'], 'page', 'The shared brand always returns home');
    }
  }
});

test('Native status-bar text and blue background remain stable across navigation without repeating setup', () => {
  const { render, bottomButton, calls } = appHarness({ initialView: 'home', nativeStatus: true });
  let view = render();
  assert.equal(calls.statusStyle.at(-1).style, 'DARK');
  assert.equal(calls.statusBackground.at(-1).color, '#0877b8');
  for (const label of ['Planlar', 'Topluluk', 'Araçlar', 'Profil']) {
    bottomButton(view, label).props.onClick(); view = render();
    assert.equal(calls.statusStyle.at(-1).style, 'DARK', `${label} retains readable white native status-bar text`);
    assert.equal(calls.statusBackground.at(-1).color, '#0877b8');
  }
  nodes(view).find(node => node.type === 'MenuSheet').props.onNavigate('events'); view = render();
  assert.equal(calls.statusStyle.at(-1).style, 'DARK', 'Detail screens use the same native status text');
  assert.equal(calls.statusBackground.at(-1).color, '#0877b8');
  bottomButton(view, 'Keşfet').props.onClick(); view = render();
  assert.equal(calls.statusStyle.at(-1).style, 'DARK');
  render();
  assert.equal(calls.statusStyle.length, 1, 'Navigation and unchanged renders do not reapply native style');
  assert.equal(calls.statusBackground.length, 1, 'Navigation does not reapply the stable native background');
  assert.equal(calls.statusOverlay.length, 1);
  assert.equal(calls.statusOverlay[0].overlay, true);
});

test('Community cold start connects the shared header to real notifications and menu while preserving account, events and search actions', () => {
  const { render, screen, bottomButton, calls } = appHarness({ initialView: 'community', nativeStatus: true });
  let view = render();
  const component = name => nodes(view).find(node => node.type === name);
  assert.ok(sharedHeader(view));
  assert.equal(calls.statusStyle.at(-1).style, 'DARK');
  assert.equal(calls.statusBackground.at(-1).color, '#0877b8');
  assert.equal(headerButton(view, 'bell').props['aria-label'], 'Bildirimler');
  assert.equal(notificationBadge(view), undefined, 'No unread badge appears without unread content');

  component('NotificationCenter').props.onUnreadChange(4); view = render();
  assert.equal(headerButton(view, 'bell').props['aria-label'], 'Bildirimler, 4 okunmamış', 'The header uses the actual unread count');
  assert.equal(notificationBadge(view).props.children, 4);
  headerButton(view, 'bell').props.onClick(); view = render();
  assert.equal(component('NotificationCenter').props.open, true);
  component('NotificationCenter').props.onClose(); view = render();
  assert.equal(component('NotificationCenter').props.open, false);

  headerButton(view, 'menu').props.onClick(); view = render();
  assert.equal(component('MenuSheet').props.open, true, 'The shared header opens the existing menu');
  component('MenuSheet').props.onClose(); view = render();
  assert.equal(component('MenuSheet').props.open, false);

  screen(view, 'CommunityScreen').props.onNavigate('events'); view = render();
  assert.ok(screen(view, 'EventsScreen'), 'Events opens the existing real events screen');
  assert.equal(calls.history.at(-1)[2], '#events');
  assert.ok(sharedHeader(view));
  assert.equal(notificationBadge(view).props.children, 4, 'Unread state follows navigation into a detail screen');
  assert.equal(calls.statusStyle.at(-1).style, 'DARK');
  component('NotificationCenter').props.onUnreadChange(0); view = render();
  assert.equal(notificationBadge(view), undefined, 'Reading all notifications removes the badge');
  assert.equal(headerButton(view, 'bell').props['aria-label'], 'Bildirimler');
  bottomButton(view, 'Topluluk').props.onClick(); view = render();
  screen(view, 'CommunityScreen').props.onSearchDestination('  Bali  '); view = render();
  const firstSearch = screen(view, 'ExploreScreen').props;
  assert.equal(firstSearch.initialSearchQuery, 'Bali', 'Editorial inspiration uses the real destination search');
  bottomButton(view, 'Topluluk').props.onClick(); view = render();
  screen(view, 'CommunityScreen').props.onSearchDestination('Bali'); view = render();
  assert.ok(screen(view, 'ExploreScreen').props.searchRequestId > firstSearch.searchRequestId, 'A repeated inspiration selection still opens a fresh search');
  bottomButton(view, 'Topluluk').props.onClick(); view = render();
  screen(view, 'CommunityScreen').props.onOpenAccount(); view = render();
  assert.equal(screen(view, 'AccountSheet').props.open, true, 'Guest actions keep the existing sign-in flow');
});

test('Legacy planner and discovery deep links retain root highlighting and cold-start back destinations', () => {
  for (const [initialView, label, expected] of [['route', 'Planlar', '#trips'], ['explore', 'Keşfet', '#home'], ['phrases', 'Araçlar', '#companion']]) {
    const { render, bottomButton, calls } = appHarness({ initialView });
    const view = render();
    assert.equal(bottomButton(view, label).props['aria-current'], 'page');
    nodes(view).find(node => node.props?.className === 'topbar-back').props.onClick();
    assert.equal(calls.history.at(-1)[2], expected);
  }
});

test('Home search forwards its query and repeated searches, while notifications use the real unread count', () => {
  const { render, screen, bottomButton } = appHarness({ initialView: 'home' });
  let view = render();
  assert.equal(headerButton(view, 'bell').props['aria-label'], 'Bildirimler');
  assert.equal(notificationBadge(view), undefined);
  nodes(view).find(node => node.type === 'NotificationCenter').props.onUnreadChange(3); view = render();
  assert.equal(headerButton(view, 'bell').props['aria-label'], 'Bildirimler, 3 okunmamış');
  assert.equal(notificationBadge(view).props.children, 3);
  headerButton(view, 'bell').props.onClick(); view = render();
  assert.equal(nodes(view).find(node => node.type === 'NotificationCenter').props.open, true);
  screen(view, 'HomeScreen').props.onSearchDestination('  Roma  '); view = render();
  const first = screen(view, 'ExploreScreen').props;
  assert.equal(first.initialSearchQuery, 'Roma');
  bottomButton(view, 'Keşfet').props.onClick(); view = render();
  assert.equal(screen(view, 'HomeScreen').props.initialSearchQuery, 'Roma', 'The remounted Home restores the submitted query');
  screen(view, 'HomeScreen').props.onSearchDestination('Roma'); view = render();
  assert.ok(screen(view, 'ExploreScreen').props.searchRequestId > first.searchRequestId);
});

test('Disabled in-app notifications hide and omit unread counts while the shared bell still opens the notification center', () => {
  for (const [locale, label, nextTab] of [['tr', 'Bildirimler', 'Topluluk'], ['en', 'Notifications', 'Community']]) {
    const { render, bottomButton } = appHarness({ initialView: 'home', locale, inAppNotifications: false });
    let view = render();
    nodes(view).find(node => node.type === 'NotificationCenter').props.onUnreadChange(23); view = render();
    assert.equal(notificationBadge(view), undefined, 'A background unread update cannot override the saved notification preference');
    assert.equal(headerButton(view, 'bell').props['aria-label'], label, 'Assistive technology also receives no disabled unread count');
    bottomButton(view, nextTab).props.onClick(); view = render();
    assert.equal(notificationBadge(view), undefined, 'The preference survives navigation');
    assert.equal(headerButton(view, 'bell').props['aria-label'], label);
    headerButton(view, 'bell').props.onClick(); view = render();
    assert.equal(nodes(view).find(node => node.type === 'NotificationCenter').props.open, true, 'The notification center remains available on demand');
  }
});

test('Large unread counts have a compact decorative badge and an exact translated accessible label', () => {
  for (const [locale, label] of [['tr', 'Bildirimler, 23 okunmamış'], ['en', 'Notifications, 23 unread']]) {
    const { render } = appHarness({ initialView: 'home', locale });
    let view = render();
    nodes(view).find(node => node.type === 'NotificationCenter').props.onUnreadChange(23); view = render();
    assert.equal(notificationBadge(view).props.children, '9+');
    assert.equal(notificationBadge(view).props['aria-hidden'], 'true', 'The visual badge must not duplicate the accessible announcement');
    assert.equal(headerButton(view, 'bell').props['aria-label'], label, 'The compact badge does not truncate the actual accessible count');
  }
});

test('Home saved-card actions are owner scoped, preserve custom plans, and report storage failure without a false saved state', () => {
  const { render, screen, auth, storage, savedByOwner } = appHarness({ initialView: 'home' });
  const route = { destinationCode: 'FCO', name: 'Roma', why: 'Walking itinerary', idealDuration: '4 days', estimatedBudget: 'Moderate', visaStatus: 'Check current entry rules' };
  savedByOwner.set('guest', [{ id: 'custom-plan', plan: { routes: [route] } }]);
  let view = render();
  screen(view, 'HomeScreen').props.onToggleSaved(route); view = render();
  assert.deepEqual(Array.from(screen(view, 'HomeScreen').props.savedRouteIds), ['FCO']);
  assert.equal(storage.getSavedRoutePlans(null).length, 2);
  auth.user = { id: 'user-b' }; auth.accessToken = 'fixture'; view = render();
  assert.equal(screen(view, 'HomeScreen').props.savedRouteIds.length, 0, 'Guest saved state cannot flash in another account');
  screen(view, 'HomeScreen').props.onToggleSaved(route); view = render();
  assert.equal(storage.getSavedRoutePlans('user-b').length, 1);
  auth.user = null; auth.accessToken = ''; view = render();
  screen(view, 'HomeScreen').props.onToggleSaved(route); view = render();
  assert.deepEqual(storage.getSavedRoutePlans(null).map(item => item.id), ['custom-plan'], 'Removing the card never deletes an independently built itinerary');
  assert.equal(storage.getSavedRoutePlans('user-b').length, 1);
  storage.saveRoutePlan = () => { throw new Error('quota'); };
  screen(view, 'HomeScreen').props.onToggleSaved(route); view = render();
  assert.equal(screen(view, 'HomeScreen').props.savedRouteIds.length, 0);
  assert.match(text(view), /Kayıt güncellenemedi/);
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

function exploreHarness(initialQuery, locale = 'tr', profileFixture = {}) {
  const load = (path, imports = {}, environment = {}) => {
    const code = ts.transpileModule(readFileSync(new URL(`../mobile/src/${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const output = { exports: {} };
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Intl, ...environment })(name => {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name.endsWith('.css')) return {};
      throw Error(`Missing Explore fixture: ${name}`);
    }, output, output.exports);
    return output.exports;
  };
  const countries = load('data/countries.ts', { './iso3166.json': { default: JSON.parse(readFileSync(new URL('../mobile/src/data/iso3166.json', import.meta.url), 'utf8')) } });
  const countryCodes = load('data/countryCodes.ts', { './countries': countries });
  const profileCountries = load('lib/profileCountries.ts', { '../data/countries': countries, '../data/countryCodes': countryCodes });
  const routes = load('data/routes.ts');
  const home = load('data/homeDestinations.ts', { './routes': routes });
  const artworkSource = readFileSync(new URL('../mobile/src/data/artwork.ts', import.meta.url), 'utf8');
  const artwork = load('data/artwork.ts', Object.fromEntries(
    [...artworkSource.matchAll(/from "([^"]+\.webp)"/g)].map(([, path]) => [path, { default: path }]),
  ));
  const discovery = load('data/discovery.ts');
  const search = load('lib/searchText.ts');
  const slots = []; let cursor = 0, effects = [], dirty = false;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(slots[i].value, value)) { slots[i].value = value; dirty = true; } }];
    },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
    useMemo: factory => factory(),
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) effects.push(fn); slots[i] = { deps, effect: fn }; },
  };
  const i18n = { locale, copy: (tr, en) => locale === 'tr' ? tr : en };
  let favorites = profileFixture.local || [];
  const profileWrites = [];
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../components/Icon': { Icon: 'Icon' }, '../components/PageHero': { PageHero: 'PageHero' },
    '../components/CountryFlag': { CountryFlag: 'CountryFlag' }, '../components/Sheet': { Sheet: 'Sheet' },
    '../data/countryIso': { alpha2FromAlpha3: () => 'TR' }, '../data/discovery': discovery,
    '../data/countries': countries, '../data/countryCodes': countryCodes, '../lib/profileCountries': profileCountries,
    '../lib/accountResume': { onAccountResume: () => () => {} },
    '../data/artwork': artwork, '../data/routes': routes,
    '../data/homeDestinations': home, '../lib/searchText': search,
    '../lib/storage': { getFavoriteDestinations: () => favorites, setFavoriteDestinations: next => { favorites = next; }, getPendingGuestDataSync: () => profileFixture.pending ? { profile: true } : null, addRecentDestination() {} }, '../lib/supabaseData': { getUserProfile: async () => profileFixture.remote, updateUserProfile: (...args) => profileWrites.push(args), getSupabaseDataErrorMessage: (_, fallback) => fallback },
    '../lib/i18n': { useI18n: () => i18n }, '../hooks/usePassportPreference': { usePassportPreference: () => ({ country: 'TR', type: 'ordinary' }) },
    '../lib/passportPreference': { preferredEntry: () => ({ label: 'Verify current entry rules', visaFree: true }) }, '../data/passport-index.json': {},
  };
  const listeners = { addEventListener() {}, removeEventListener() {} };
  const { ExploreScreen } = load('screens/ExploreScreen.tsx', imports, { window: listeners, document: listeners });
  const calls = { planned: [], navigated: [] };
  let props = { initialSearchQuery: initialQuery, searchRequestId: 1, ownerId: profileFixture.ownerId || null, accessToken: profileFixture.ownerId ? 'token-a' : '', onNotice() {}, onNavigate: view => calls.navigated.push(view), onBuildRoute: route => calls.planned.push(route) };
  const render = next => {
    props = { ...props, ...next };
    for (let attempt = 0; attempt < 10; attempt++) {
      cursor = 0; effects = []; dirty = false;
      const tree = ExploreScreen(props);
      effects.forEach(fn => fn());
      if (!dirty) return tree;
    }
    throw Error('Unstable Explore fixture');
  };
  return { render, calls, profileWrites, get favorites() { return favorites; }, reactivate: () => { slots.forEach(slot => slot?.effect?.()); return render(); } };
}

test('Home destination searches use real catalog data, translated aliases and deduplicated route drafts', () => {
  for (const [query, expected, code, locale = 'tr'] of [['Roma', 'Roma', 'FCO'], ['Tokyo', 'Tokyo'], ['Bali', 'Bali', 'DPS'], ['CAPPADOCIA', 'Kapadokya', 'NAV'], ['SANTORINI', 'Santorini', 'JTR'], ['Paris', 'Paris', 'CDG'], ['New York', 'New York', 'JFK'], ['FRANCE', 'Paris', 'CDG'], ['UNITED STATES', 'New York', 'JFK'], ['Paris', 'Paris', 'CDG', 'en'], ['New York', 'New York', 'JFK', 'en']]) {
    const { render, calls } = exploreHarness(query, locale);
    const view = render();
    const cards = nodes(view).filter(node => node.type === 'article' && node.props.className === 'discovery-card');
    assert.equal(cards.length, 1, `${query} must use a single matching real route`);
    assert.match(text(cards[0]), new RegExp(expected));
    assert.equal(nodes(view).find(node => node.type === 'input' && node.props.type === 'search').props.value, query);
    if (code) {
      nodes(cards[0]).find(node => node.type === 'button').props.onClick();
      assert.equal(calls.planned[0].destinationCode, code);
      assert.ok(calls.planned[0].dailyPlan.length > 0);
      assert.equal(calls.planned[0].verifiedEntryStatus, 'unknown', 'Editorial drafts must not invent passport eligibility');
      if (code === 'CDG' || code === 'JFK') {
        assert.equal(calls.planned[0].dailyPlan.length, 3);
        assert.equal(calls.planned[0].idealDuration, locale === 'en' ? '3 days' : '3 gün');
        assert.equal(calls.planned[0].scores.overall, 0);
        assert.equal(calls.planned[0].visaVerifiedAt, null);
        assert.match(nodes(cards[0]).find(node => node.props?.style?.backgroundImage).props.style.backgroundImage, /launch-travel-poster\.webp/, 'A city without specific artwork must use the generic image, not a different city');
      }
    }
  }
});

test('Unsupported searches stay visible with an honest empty state; a repeated Home query replaces local edits', () => {
  const { render, calls, reactivate } = exploreHarness('Roma', 'en');
  let view = render();
  nodes(view).find(node => node.type === 'input').props.onChange({ target: { value: 'Unlisted destination' } }); view = render();
  assert.match(text(view), /0 ready-made routes found for “Unlisted destination”/);
  assert.match(text(view), /don't have a ready-made route/);
  nodes(view).find(node => node.type === 'button' && text(node) === 'Create a route for me').props.onClick();
  assert.deepEqual(calls.navigated, ['route']);
  assert.equal(nodes(view).find(node => node.type === 'input').props.value, 'Unlisted destination', 'Choosing the planner does not silently overwrite the search');
  view = reactivate();
  assert.equal(nodes(view).find(node => node.type === 'input').props.value, 'Unlisted destination', 'Returning through Activity preserves the edited query');
  view = render({ initialSearchQuery: 'Roma', searchRequestId: 2 });
  assert.match(text(view), /1 ready-made routes found for “Roma”/);
  assert.equal(nodes(view).find(node => node.type === 'input').props.value, 'Roma');
});

test('Clearing destination search returns keyboard focus to the labelled input', () => {
  const { render } = exploreHarness('Roma', 'en');
  let view = render();
  const input = nodes(view).find(node => node.type === 'input');
  assert.equal(input.props['aria-controls'], 'explore-search-results');
  let focused = 0;
  input.props.ref.current = { focus: () => focused++ };
  const clear = nodes(view).find(node => node.type === 'button' && node.props['aria-label'] === 'Clear search');
  assert.equal(clear.props.style.minWidth, 44);
  clear.props.onClick(); view = render();
  assert.equal(focused, 1);
  assert.equal(nodes(view).find(node => node.type === 'input').props.value, '');
});

test('Explore respects remote favourite deletion while retaining explicitly pending guest imports', async()=>{
 for(const pending of [false,true]){
  const h=exploreHarness('','en',{ownerId:'a',remote:{wishlistCountries:[]},local:[{alpha3:'TUR',name:'Turkey',createdAt:'2026-09-01'}],pending});
  h.render();await new Promise(resolve=>setImmediate(resolve));h.render();
  assert.equal(h.profileWrites.length,0,'A read does not silently PATCH cached favourites');
  assert.equal(h.favorites.length,pending?1:0);
 }
});
