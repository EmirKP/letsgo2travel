import { realLocaleModule } from './fixtures/real-locale-modules.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Reuse only declarations from the existing hook fixtures; importing those
// files would register unrelated suites. Production callbacks are not copied.
function declarations(file, names, globals = {}) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const selected = source.statements.filter(statement => ts.isFunctionDeclaration(statement)
    ? names.includes(statement.name?.text)
    : ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => names.includes(item.name.getText(source))));
  const code = selected.map(statement => statement.getText(source)).join('\n');
  return vm.runInNewContext(`${code}\n({${names.join(',')}})`, {
    assert, readFileSync, vm, ts, process, Date, Intl, URL, URLSearchParams, TextEncoder, Error,
    AbortController, AbortSignal, setImmediate, setTimeout, clearTimeout, console,
    realLocaleModule, crypto: globalThis.crypto, repo: process.cwd().replaceAll('\\', '/'), ...globals,
  });
}
const jsx = (type, props, key) => ({ type, props, key });
const nodes = value => !value || typeof value !== 'object' || value.props?.hidden || value.type === 'Sheet' && !value.props.open
  ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const button = (tree, label) => find(tree, 'button', props => text(props.children) === label);
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const { hooks } = declarations('tests/planning-ux.mjs', ['hooks']);
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const fixture = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    Error, Date, Intl, URL, URLSearchParams, AbortController, AbortSignal, crypto: { randomUUID }, ...globals,
  })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name.endsWith('.css')) return {};
    throw Error(`Unstubbed fixture import ${name} in ${file}`);
  }, fixture, fixture.exports);
  return fixture.exports;
}

function bridgeHarness(view = 'events') {
  const source = ts.createSourceFile('App.tsx', readFileSync('mobile/src/App.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = new Map(); let ownerEffect;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['openProfileEditor', 'completeProfileForEvent', 'reportProfileEditing', 'saveProfileIdentity'].includes(node.name.getText(source))) callbacks.set(node.name.getText(source), node.initializer.getText(source));
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useLayoutEffect' && node.arguments[0]?.getText(source).includes('profileOwnerRef.current = ownerId')) ownerEffect = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source); assert.equal(callbacks.size, 4); assert.ok(ownerEffect);
  const state = { editingOwner: null, accountOpen: true, requests: [], focus: 'ticketmaster:fixture-event', reopened: null, navigation: [], identity: [], metadata: [] };
  const profileOwnerRef = { current: 'owner-a' }, profileOwnerRevision = { current: 0 }, eventProfileResume = { current: null }, activeViewRef = { current: view };
  const context = {
    Error, useCallback: fn => fn, profileOwnerRef, profileOwnerRevision, eventProfileResume, activeViewRef, profileEditCounter: { current: 0 },
    setAccountOpen: value => { state.accountOpen = value; }, setProfileEditingOwner: next => { state.editingOwner = typeof next === 'function' ? next(state.editingOwner) : next; },
    setProfileEditRequest: value => state.requests.push(value), setFocusEventId: value => { state.focus = value; },
    setEventProfileReturn: next => { state.reopened = typeof next === 'function' ? next(state.reopened) : next; },
    navigate: destination => { state.navigation.push(destination); activeViewRef.current = destination; },
    completeUserProfile: async (...args) => { state.identity.push(args); if (state.identityWait) await state.identityWait.promise; },
    copy: (_tr, en) => en, getSupabaseDataErrorMessage: (_error, fallback) => fallback,
  };
  const code = `function renderCallbacks(ownerId,auth,focusEventId) { ${[...callbacks].map(([name, initializer]) => `const ${name}=${initializer};`).join('\n')} return {${[...callbacks.keys()].join(',')}}; }\nfunction ownerChanged(ownerId) { (${ownerEffect})(); }\n({renderCallbacks,ownerChanged})`;
  const factory = vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const event = { id: 'ticketmaster:fixture-event', provider: 'ticketmaster', title: 'Unsaved fixture event', description: '', category: 'concert', countryCode: 'TR', city: 'Istanbul', venue: 'Public Hall', startsAt: '2026-11-01T17:00:00Z', endsAt: null, status: 'scheduled', imageUrl: null, ticketUrl: null, sourceUrl: 'https://tickets.example/event', featured: false, updatedAt: '2026-10-30' };
  const chat = { eventKey: event.id, event: { ...event, timeZone: 'Europe/Istanbul', timePrecision: 'exact' }, muted: false, joinedAt: '2026-10-30', memberCount: 2 };
  const h = { state, eventProfileResume, activeViewRef, profileOwnerRevision, owner: 'owner-a', context: view === 'community' ? { kind: 'chat', chat } : { kind: 'event', event },
    render() { return factory.renderCallbacks(h.owner, { accessToken: `token-${h.owner}`, updateProfile: async (...args) => { state.metadata.push(args); if (state.metadataWait) await state.metadataWait.promise; } }, state.focus); },
    changeOwner(owner) { h.owner = owner; factory.ownerChanged(owner); },
  };
  return h;
}

test('App event completion bridge ignores initial false, then returns only after actual identity and metadata acknowledgement', async () => {
  for (const view of ['events', 'community']) {
    const h = bridgeHarness(view), callback = h.render(); callback.completeProfileForEvent(h.context);
    assert.equal(h.state.accountOpen, false); assert.equal(h.state.requests[0].owner, 'owner-a'); assert.deepEqual(h.state.navigation, ['profile']);
    callback.reportProfileEditing(false); assert.ok(h.eventProfileResume.current); assert.equal(h.eventProfileResume.current.started, false);
    callback.reportProfileEditing(true); h.state.identityWait = deferred(); h.state.metadataWait = deferred();
    const saved = callback.saveProfileIdentity('  Fixture   Traveller  ', '  FIXTURE_NAME ');
    assert.equal(h.eventProfileResume.current.completed, false); assert.equal(h.state.metadata.length, 0);
    h.state.identityWait.resolve(); await tick(); assert.equal(h.eventProfileResume.current.completed, false);
    h.state.metadataWait.resolve(); await saved; assert.equal(h.eventProfileResume.current.completed, true);
    callback.reportProfileEditing(false); assert.deepEqual(h.state.navigation, ['profile', view]); assert.equal(h.state.focus, ''); assert.equal(h.eventProfileResume.current, null);
    assert.deepEqual(h.state.identity, [['owner-a', 'fixture_name', 'token-owner-a']]); assert.deepEqual(h.state.metadata, [['Fixture Traveller', 'fixture_name']]);
  }
});

test('App restores the exact unsaved event or selected chat even after its original focus ID was consumed', async () => {
  for (const view of ['events', 'community']) {
    const h = bridgeHarness(view); h.state.focus = ''; const callback = h.render();
    callback.completeProfileForEvent(h.context); callback.reportProfileEditing(false);
    assert.deepEqual(plain(h.eventProfileResume.current.context), h.context, 'The live selection must travel independently of the consumed saved-event focus ID');
    callback.reportProfileEditing(true); await callback.saveProfileIdentity('Fixture Traveller', 'fixture_name'); callback.reportProfileEditing(false);
    assert.deepEqual(plain(h.state.reopened), { owner: 'owner-a', context: h.context }); assert.equal(h.state.navigation.at(-1), view);
    assert.equal(h.state.identity.length, 1); assert.equal(h.state.metadata.length, 1);
    h.changeOwner('owner-b'); h.changeOwner('owner-a'); assert.equal(h.state.reopened, null, 'An account round trip clears a pending event snapshot');
  }
});

test('An earlier same-owner save cannot approve a later event completion intent', async () => {
  const h = bridgeHarness(), old = h.render(); old.completeProfileForEvent(h.context); old.reportProfileEditing(true); h.state.identityWait = deferred();
  const saved = old.saveProfileIdentity('Fixture Traveller', 'fixture_name'); h.activeViewRef.current = 'events';
  const later = { kind: 'event', event: { ...h.context.event, id: 'ticketmaster:later' } }; h.render().completeProfileForEvent(later);
  h.state.identityWait.resolve(); await saved; assert.equal(h.eventProfileResume.current.completed, false); assert.equal(h.eventProfileResume.current.context.event.id, later.event.id);
});

test('Events restores an unsaved snapshot, preserves it on token refresh, and forwards the complete event into profile completion', async () => {
  const { eventsHarness } = declarations('tests/ux14-community-events.mjs', ['tick', 'deferred', 'jsx', 'load', 'host', 'nodes', 'text', 'button', 'dates', 'places', 'searchText', 'eventContext', 'eventTime', 'today', 'eventsHarness']);
  const h = eventsHarness(undefined, { initialOwner: 'a' }), event = bridgeHarness().context.event, completed = []; let handled = 0;
  try {
    let view = h.render({ profileEvent: event, onProfileEventHandled: () => handled++, onCompleteProfile: value => completed.push(value) });
    let panel = find(view, 'EventCompanionsPanel'); assert.ok(panel); assert.equal(panel.props.event, event); assert.equal(handled, 1);
    panel.props.onCompleteProfile(); assert.equal(completed[0], event); assert.equal(completed[0].sourceUrl, event.sourceUrl);
    view = h.render({ profileEvent: null, accessToken: 'rotated-token' }); panel = find(view, 'EventCompanionsPanel'); assert.equal(panel.props.event.id, event.id);
    assert.equal(h.saved.get('a').length, 0, 'Restoring context does not save the event'); assert.equal(h.created.length, 0); assert.equal(h.attachments.length, 0); assert.equal(h.reminders.length, 0);
    view = h.render({ ownerId: 'b', profileEvent: null }); assert.equal(find(view, 'EventCompanionsPanel'), undefined);
  } finally { h.dispose(); }
});

test('Community joined-chat selection reopens the exact chat with fresh reads and no automatic write in tr, en and sq', async () => {
  for (const locale of ['tr', 'en', 'sq']) {
    const host = hooks(), chat = bridgeHarness('community').context.chat, reads = [], completions = []; let handled = 0, writes = 0;
    const visibility = load('mobile/src/lib/communityVisibility.ts');
    const panel = load('mobile/src/components/EventCompanionsPanel.tsx', {
      react: { ...host.react, useId: () => 'fixture-chat' }, 'react/jsx-runtime': { jsx, jsxs: jsx },
      './Sheet': { Sheet: 'Sheet' }, './CommunityAvatar': {}, './Icon': {}, './CommunitySafetySheet': {}, './EventParticipantDirectory': {},
      '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en }) }, '../lib/api': {}, '../lib/id': {}, '../hooks/useCurrentTime': {}, '../lib/localeFormatting': {}, '../lib/communityVisibility': visibility,
      '../lib/eventCommunity': { listJoinedEventChats: async token => { reads.push(token); return { data: [chat] }; }, actOnEventCommunity: () => { writes++; throw Error('No automatic event writes'); } },
    }, { window: { addEventListener() {}, removeEventListener() {} } });
    const wrapper = panel.JoinedEventChats({ ownerId: 'owner-a', accessToken: 'fixture-token', initialChat: chat, onInitialChatHandled: () => handled++, onCompleteProfile: value => completions.push(value), onOpenAccount() {}, onNotice() {} });
    try {
      host.start(wrapper.type, wrapper.props); let view = host.render();
      let selected = nodes(view).find(node => node.type === panel.EventCompanionsPanel); assert.ok(selected); assert.equal(selected.props.event.id, chat.eventKey); assert.equal(selected.props.initialChatOpen, true); assert.equal(handled, 1);
      selected.props.onCompleteProfile(); assert.equal(completions[0], chat);
      view = host.render({ initialChat: null, accessToken: 'rotated-token' }); await tick(); view = host.render(); selected = nodes(view).find(node => node.type === panel.EventCompanionsPanel);
      assert.equal(selected.props.event.id, chat.eventKey); assert.deepEqual(reads, ['fixture-token', 'rotated-token']); assert.equal(writes, 0);
      selected.props.onChatClose(); assert.equal(nodes(host.render()).some(node => node.type === panel.EventCompanionsPanel), false);
    } finally { host.dispose(); }
  }
});

test('App cancellation or leaving Profile never silently joins an event or forces an unrelated return', async () => {
  const cancelled = bridgeHarness(), callback = cancelled.render(); callback.completeProfileForEvent(cancelled.context); callback.reportProfileEditing(true); callback.reportProfileEditing(false);
  assert.equal(cancelled.eventProfileResume.current, null); assert.deepEqual(cancelled.state.navigation, ['profile']); assert.equal(cancelled.state.identity.length, 0);
  const left = bridgeHarness(), other = left.render(); other.completeProfileForEvent(left.context); other.reportProfileEditing(true); await other.saveProfileIdentity('Fixture Traveller', 'fixture_name');
  left.activeViewRef.current = 'home'; other.reportProfileEditing(false); assert.deepEqual(left.state.navigation, ['profile']); assert.equal(left.eventProfileResume.current, null);
});

test('App rejects a profile completion across an owner change, even when the original owner returns before the request completes', async () => {
  for (const phase of ['identity', 'metadata']) {
    const h = bridgeHarness(), old = h.render(); old.completeProfileForEvent(h.context); old.reportProfileEditing(true);
    h.state[`${phase}Wait`] = deferred(); const saved = old.saveProfileIdentity('Fixture Traveller', 'fixture_name');
    await tick(); h.changeOwner('owner-b'); h.changeOwner('owner-a'); h.state[`${phase}Wait`].resolve();
    await assert.rejects(saved, /session changed/); old.reportProfileEditing(false);
    assert.equal(h.eventProfileResume.current, null); assert.deepEqual(h.state.navigation, ['profile']);
    assert.equal(h.state.metadata.length, phase === 'identity' ? 0 : 1);
  }
  const h = bridgeHarness(), old = h.render(); old.completeProfileForEvent(h.context); old.reportProfileEditing(true); h.changeOwner('owner-b');
  h.activeViewRef.current = 'community'; const next = h.render(); next.completeProfileForEvent({ kind: 'chat', chat: bridgeHarness('community').context.chat }); old.reportProfileEditing(false);
  assert.equal(h.eventProfileResume.current.owner, 'owner-b'); assert.equal(h.eventProfileResume.current.view, 'community');
});

function plansHarness({ raw = '{}', saved = [], cloud = [], places = [], pins = [], favourites = [], legacy = { status: 'ready', count: 0 }, packs = [], section = 'all' } = {}) {
  const host = hooks(true), writes = [], navigation = [], openedCountries = [], openedDestinations = [], listeners = new Map();
  let stored = raw;
  const storage = { getItem: () => stored, setItem: (...args) => writes.push(['set', ...args]), removeItem: (...args) => writes.push(['remove', ...args]) };
  const outbox = load('mobile/src/lib/routeOutbox.ts', {}, { window: { localStorage: storage, dispatchEvent() { throw Error('Read-only fixture must not write an outbox'); } } });
  const component = name => ({ [name]: name });
  const imports = {
    react: { ...host.react, lazy: loader => `Lazy:${loader.toString()}` }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../lib/i18n': { useI18n: () => ({ locale: 'en', dateLocale: 'en-GB', copy: (_tr, en) => en }) },
    '../lib/locale': { translateCopy: (_locale, _tr, en) => en }, '../lib/localeFormatting': { formatAppDate: () => '30 Oct 2026' }, '../../../lib/event-time': {},
    ...Object.fromEntries(['Icon', 'TravelToolArtwork', 'TravelReadinessCard', 'CountryFlag', 'Sheet', 'LazyOverlay', 'TripCollaborationHub', 'PersonalTravelCards', 'RouteBudgetAnalysis', 'RouteTranslation'].map(name => [`../components/${name}`, component(name)])),
    '../data/countryIso': { alpha2FromAlpha3: alpha3 => ({ THA: 'TH', FRA: 'FR' })[alpha3] || '' }, '../data/artwork': { destinationArtwork: () => 'fixture.webp' }, '../data/discovery': { DISCOVERY_DESTINATIONS: [] },
    '../lib/personalMapPins': { readPersonalMapPins: () => ({ items: pins, error: null }), subscribePersonalMapPins: () => () => {} },
    '../lib/savedPlaces': { readSavedPlaces: () => ({ items: places, dayIds: [], error: null }), subscribeSavedPlaces: () => () => {} },
    '../lib/openMapOffline': { listOpenMapPacks: async () => { if (packs instanceof Error) throw packs; return packs; }, subscribeOpenMapPacks: () => () => {} }, '../lib/offlineMaps': { readOfflineMapStatus: () => legacy },
    '../lib/journeyTools': { readSafetyTrips: () => [], saveSafetyTrips() { throw Error('Unexpected write'); } }, '../lib/savedRouteDisplay': {}, '../../../lib/planner-passport': {},
    '../lib/supabaseData': { listUserTrips: async () => cloud, getSupabaseDataErrorMessage: (_error, fallback) => fallback }, '../lib/accountResume': { onAccountResume: () => () => {} },
    '../lib/storage': { getSavedRoutePlans: owner => outbox.routesWithOutbox(saved, owner), getFavoriteDestinations: () => favourites, getSavedTravelEvents: () => [] },
    '../lib/native': {}, '../lib/routeOutbox': outbox, '../lib/routeSync': {}, '../lib/eventReminders': {}, '../lib/routeCockpitIntent': {},
    '../lib/searchText': { normalizeSearchText: value => value.toLowerCase() },
  };
  const { TripsScreen } = load('mobile/src/screens/PlansScreen.tsx', imports, { window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) } });
  host.start(TripsScreen, { ownerId: 'owner-a', user: { id: 'owner-a' }, accessToken: 'fixture-token', initialSection: section, onNavigate: value => navigation.push(value), onNotice() {}, onOpenAccount() {}, onOpenDestination: value => openedDestinations.push(value), onOpenCountryMap: value => openedCountries.push(value) });
  return { host, writes, navigation, openedCountries, openedDestinations, get raw() { return stored; }, set raw(value) { stored = value; }, async settle() { await tick(); return host.render(); } };
}

test('Plans handles corrupt strict outbox locally without deleting or queueing data, and Read again safely recovers', async () => {
  for (const corrupt of ['{broken', '[]', '{"bad":{"kind":"delete","pending":true}}']) {
    const h = plansHarness({ raw: corrupt, section: 'routes', cloud: [{ id: 1, clientKey: 'cloud-route', mobileKind: 'route_plan', title: 'Cloud route', destination: 'Paris', createdAt: '2026-10-30' }] });
    try {
      let view = await h.settle(); assert.match(text(view), /On-device records could not be checked/); assert.ok(button(view, 'Read again'));
      assert.doesNotMatch(text(view), /Cloud route|No saved routes yet/); assert.deepEqual(h.writes, []); assert.equal(h.raw, corrupt);
      h.raw = '{}'; button(view, 'Read again').props.onClick(); view = h.host.render(); assert.match(text(view), /Cloud route/); assert.doesNotMatch(text(view), /On-device records could not be checked/); assert.deepEqual(h.writes, []);
    } finally { h.host.dispose(); }
  }
});

test('Plans omits tombstoned cloud routes while keeping another route accessible', async () => {
  const tombstone = JSON.stringify({ removed: { kind: 'delete', remoteId: 1, revision: 'fixture-revision', pending: true } });
  const h = plansHarness({ raw: tombstone, section: 'routes', cloud: [
    { id: 1, clientKey: 'removed', mobileKind: 'route_plan', title: 'Removed route', destination: 'Paris', createdAt: '2026-10-30' },
    { id: 2, clientKey: 'keep', mobileKind: 'route_plan', title: 'Kept route', destination: 'Rome', createdAt: '2026-10-30' },
  ] });
  try { const view = await h.settle(); assert.doesNotMatch(text(view), /Removed route/); assert.match(text(view), /Kept route/); assert.equal(h.raw, tombstone); assert.deepEqual(h.writes, []); } finally { h.host.dispose(); }
});

test('Plans counts both map formats and routes personal pins to the unified Saved map', async () => {
  const h = plansHarness({ legacy: { status: 'ready', count: 2 }, packs: [{ id: 'modern-a' }, { id: 'modern-b' }, { id: 'modern-c' }], places: [{ id: 'place' }], pins: [{ id: 'pin-a' }, { id: 'pin-b' }] });
  try {
    let view = await h.settle(); assert.deepEqual(plain(find(view, 'TravelReadinessCard').props.maps), { count: 5, loading: false, unavailable: false });
    const places = find(view, 'button', props => props['data-section'] === 'places'); assert.match(text(places), /3/); places.props.onClick(); view = h.host.render();
    const map = nodes(view).find(node => typeof node.type === 'string' && node.type.startsWith('Lazy:') && node.type.includes('TravelMap'));
    assert.ok(map); assert.equal(map.props.initialSection, 'saved'); assert.equal(map.props.ownerId, 'owner-a'); assert.deepEqual(h.writes, []);
  } finally { h.host.dispose(); }
  for (const input of [{ legacy: { status: 'unavailable', count: null }, packs: [{ id: 'modern' }] }, { legacy: { status: 'ready', count: 1 }, packs: Error('Unreadable modern packs') }]) {
    const h = plansHarness(input); try { const view = await h.settle(); assert.deepEqual(plain(find(view, 'TravelReadinessCard').props.maps), { count: null, loading: false, unavailable: true }); } finally { h.host.dispose(); }
  }
});

test('A favourite country without a ready-made route keeps its country context in the map handoff, and Plans retains My trips', async () => {
  const h = plansHarness({ favourites: [{ alpha3: 'THA', name: 'Thailand' }] });
  try {
    let view = await h.settle(); button(view, 'My trips').props.onClick(); assert.deepEqual(h.navigation, ['cockpit']);
    find(view, 'button', props => props['data-section'] === 'countries').props.onClick(); view = h.host.render();
    find(view, 'button', props => props['data-guide'] === 'saved-country-open').props.onClick(); view = h.host.render();
    assert.match(text(view), /No ready-made route for this country yet/); button(view, 'Explore this country on the map').props.onClick(); view = h.host.render();
    assert.deepEqual(h.openedCountries, ['TH']); assert.deepEqual(h.openedDestinations, []); assert.doesNotMatch(text(view), /No ready-made route for this country yet/); assert.deepEqual(h.writes, []);
  } finally { h.host.dispose(); }
});

test('Profile keeps four independent Explorer shortcuts, including Saved and Price Alerts', () => {
  const { profileHarness } = declarations('tests/auth-profile-regressions.mjs', ['jsx', 'tick', 'deferred', 'load', 'host', 'nodes', 'text', 'countries', 'codes', 'iso', 'profileCountries', 'i18n', 'profileHarness']);
  const h = profileHarness(), navigation = [];
  try {
    const view = h.render({ onNavigate: value => navigation.push(value) });
    const shortcuts = nodes(view).find(node => node.props?.className?.split(' ').includes('profile-travel-shortcuts'));
    const actions = nodes(shortcuts).filter(node => node.type === 'button'); assert.equal(actions.length, 4);
    assert.deepEqual(actions.map(node => text(find(node, 'strong'))), ['My passport preference', "Countries I've visited", 'Saved', 'Price Alerts']);
    button(shortcuts, 'SavedYour trips, flights, routes and saved items').props.onClick(); button(shortcuts, 'Price AlertsTracked routes and target prices').props.onClick();
    assert.deepEqual(navigation, ['trips', 'alerts']); assert.equal(h.writes.length, 0);
  } finally { h.h.dispose(); }
});

test('Support screen selection preserves text, selected image and account scope; retry preserves its exact request identity', async () => {
  const host = hooks(), persisted = new Map(), requests = [], image = 'data:image/jpeg;base64,Zml4dHVyZQ==';
  const sessionStorage = { getItem: key => persisted.get(key) || null, setItem: (key, value) => persisted.set(key, value), removeItem: key => persisted.delete(key) };
  class ApiError extends Error {}
  const drafts = load('mobile/src/lib/issueReport.ts', { './api': { requestJson: (_path, options) => { const waiting = deferred(); requests.push({ options, ...waiting }); return waiting.promise; } } }, { sessionStorage, window: { location: { hash: '#home' } } });
  const { SupportSheet, IssueReportForm } = load('mobile/src/components/SupportSheet.tsx', {
    react: { ...host.react, useId: () => 'fixture-support' }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../lib/config': { config: { appVersion: 'fixture', buildNumber: '0' } }, '../lib/i18n': { useI18n: () => ({ locale: 'en', copy: (_tr, en) => en }) },
    '../lib/native': {}, '../lib/support': {}, '../lib/api': { ApiError }, '../lib/issueReport': { ...drafts, prepareIssueScreenshot: async () => image }, './Sheet': { Sheet: 'Sheet' },
  });
  const sheet = screen => SupportSheet({ open: true, onClose() {}, ownerId: 'owner-a', accessToken: 'fixture-token', screen });
  const form = screen => nodes(sheet(screen)).find(node => node.type === IssueReportForm);
  const firstKey = form('home').key; assert.equal(form('events').key, firstKey, 'Changing the screen must not remount this owner’s draft');
  host.start(IssueReportForm, form('home').props);
  try {
    let view = host.render(); find(view, 'textarea').props.onChange({ target: { value: 'Fixture report description remains here.' } }); host.render();
    find(host.render(), 'input', props => props.type === 'file').props.onChange({ target: { files: [{}], value: 'fixture' } }); await tick(); view = host.render();
    const original = drafts.readIssueDraft('home', 'owner-a'); find(view, 'select').props.onChange({ target: { value: 'events' } }); view = host.render();
    assert.equal(find(view, 'textarea').props.value, original.description); assert.equal(find(view, 'img').props.src, image);
    const changed = drafts.readIssueDraft('events', 'owner-a'); assert.notEqual(changed.requestId, original.requestId); assert.equal(changed.screen, 'events'); assert.equal(changed.screenshot, image);
    view = host.render({ screen: 'profile' }); assert.equal(find(view, 'select').props.value, 'events');
    find(view, 'form').props.onSubmit({ preventDefault() {} }); host.render(); requests[0].reject(Error('Fixture offline')); await tick(); view = host.render();
    assert.equal(find(view, 'textarea').props.value, original.description); assert.equal(find(view, 'img').props.src, image);
    find(view, 'form').props.onSubmit({ preventDefault() {} }); host.render();
    assert.equal(requests[0].options.body.requestId, requests[1].options.body.requestId); assert.equal(requests[1].options.body.screen, 'events'); assert.equal(requests[1].options.headers.Authorization, 'Bearer fixture-token');
    const nextOwner = drafts.readIssueDraft('profile', 'owner-b'); assert.equal(nextOwner.description, ''); assert.equal(nextOwner.screenshot, null); assert.notEqual(nextOwner.requestId, changed.requestId);
    nextOwner.description = 'Owner B private draft'; drafts.saveIssueDraft(nextOwner, 'owner-b'); requests[1].resolve({ id: changed.requestId }); await tick();
    assert.equal(drafts.readIssueDraft('profile', 'owner-b').description, nextOwner.description, 'An old owner acknowledgement cannot clear the new owner’s draft');
  } finally { host.dispose(); }
});

test('Onboarding Choose passport later completes without opting the user into guest mode', () => {
  const { harness } = declarations('tests/onboarding-ui.mjs', ['jsx', 'nodes', 'text', 'button', 'byClass', 'load', 'storage', 'host', 'harness']);
  for (const signedIn of [false, true]) {
    const h = harness({ signedIn });
    try {
      for (let step = 0; step < 4; step++) h.click('Continue');
      assert.match(text(h.tree), /Which passport will you travel with/); assert.equal(button(h.tree, 'Explore as a guest'), undefined);
      h.click('Choose passport later'); assert.deepEqual(plain(h.completed), ['explore']); assert.equal(h.completionOptions.length, 1); assert.equal(h.completionOptions[0], undefined);
      assert.deepEqual(plain(h.passportPreference.readPassportPreference()), { country: '', type: '' });
    } finally { h.dispose(); }
  }
});
