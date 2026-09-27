import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx, Fragment: 'fragment' };
const tick = () => new Promise(resolve => setImmediate(resolve));
const english = { copy: (_tr, en) => en, locale: 'en', dateLocale: 'en-GB' };
let reducedMotion = false;
function load(path, imports = {}, environment = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, Intl, URL, Event, requestAnimationFrame: fn => fn(), window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: reducedMotion }) }, ...environment })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name.endsWith('.css')) return {};
    throw Error(`Missing fixture import: ${name}`);
  }, testModule, testModule.exports);
  return testModule.exports;
}
function hooks() {
  const slots = []; let cursor = 0, dirty = false, effects = [], component, props;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  const memoHook = (fn, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; };
  return {
    react: {
      useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
      useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
      useMemo: memoHook, useCallback: (fn, deps) => memoHook(() => fn, deps),
      useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || changed(old.deps, deps)) { slots[i] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
      lazy: () => 'LazyComponent', Suspense: 'Suspense',
    },
    start(fn, initial) { component = fn; props = initial; return this.render(); },
    render(next) { if (next) props = { ...props, ...next }; for (let i = 0; i < 15; i++) { cursor = 0; dirty = false; effects = []; const tree = component(props); effects.forEach(fn => fn()); if (!dirty) return tree; } throw Error('Unstable fixture render'); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function nodes(tree) { return tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : []; }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : ''; }
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const button = (tree, label) => find(tree, 'button', props => text(props.children).trim() === label);
const common = host => ({ react: host.react, 'react/jsx-runtime': runtime, '../lib/i18n': { useI18n: () => english } });
const search = load('mobile/src/lib/searchText.ts');

test('Country search treats accents and Turkish I variants consistently without dropping non-Latin text', () => {
  for (const [left, right] of [['Türkiye', 'turkiye'], ['Italy', 'italy'], ['İTALYA', 'italya'], ['IĞDIR', 'igdir'], ['Côte d’Ivoire', 'cote d’ivoire'], ['  São   Tomé ', 'sao tome']]) assert.equal(search.normalizeSearchText(left), search.normalizeSearchText(right));
  assert.equal(search.normalizeSearchText('日本'), '日本');
});

test('Country picker finds plain-keyboard names and metadata, preserves selection, and clears a failed search', () => {
  const host = hooks(), changes = [];
  try {
    const { CountryPicker } = load('mobile/src/components/CountryPicker.tsx', { ...common(host), './Icon': { Icon: 'Icon' }, './Sheet': { Sheet: 'Sheet' }, './CountryFlag': { CountryFlag: 'CountryFlag' }, '../lib/searchText': search });
    host.start(CountryPicker, { value: 'IT', options: [{ code: 'TR', name: 'Türkiye', meta: 'Türkçe' }, { code: 'IT', name: 'Italy', meta: 'Italiano' }], onChange: value => changes.push(value), label: 'Destination', placeholder: 'Choose country' });
    find(host.render(), 'button', props => props['aria-haspopup'] === 'dialog').props.onClick();
    const field = () => find(host.render(), 'input', props => props.type === 'search');
    assert.equal(field().props['aria-label'], 'Search countries');
    for (const [query, code] of [['turkiye', 'TR'], ['italy', 'IT'], ['turkce', 'TR'], ['it', 'IT']]) {
      field().props.onChange({ target: { value: query } });
      const matches = nodes(host.render()).filter(node => node.props?.role === 'option');
      assert.equal(matches.length, 1); assert.equal(matches[0].props['aria-selected'], code === 'IT');
    }
    field().props.onChange({ target: { value: 'not-a-country' } });
    assert.match(text(host.render()), /No matching country/);
    button(host.render(), 'Clear search').props.onClick();
    assert.equal(nodes(host.render()).filter(node => node.props?.role === 'option').length, 2);
    assert.equal(changes.length, 0);
  } finally { host.dispose(); }
});

const route = { name: 'Rome', country: 'Italy', destinationCode: 'FCO', cityOrRegion: 'Rome', why: 'A sample visit', visaStatus: 'Check entry rules', estimatedBudget: 'Balanced', idealDuration: '4 days', bestFor: 'Culture', transportEase: 'Public transport', scores: { overall: 82 }, dailyPlan: ['Day 1: City walk'], warnings: [] };
const snapshots = load('mobile/src/lib/plannerState.ts');
function plannerHarness({ seeded = true, account = false, syncFails = false, storageFails = false } = {}) {
  const host = hooks(), saves = [], navigations = [], notices = [], generated = [];
  const { RouteAssistantScreen } = load('mobile/src/screens/RouteAssistantScreen.tsx', {
    ...common(host), '../components/AirportField': { AirportField: 'AirportField' }, '../components/Icon': { Icon: 'Icon' }, '../components/PageHero': { PageHero: 'PageHero' },
    '../data/artwork': { destinationArtwork: code => code }, '../data/routes': { routeByDestinationCode: code => ({ ...route, destinationCode: code }), createFallbackPlan: () => ({ summary: 'Offline ideas', routes: [route] }) },
    '../lib/api': { generateRoutePlan: async input => { generated.push(input); return { data: { summary: 'Your suggestions', routes: [route, { ...route, name: 'Paris', destinationCode: 'CDG' }] } }; } },
    '../lib/native': { hapticSuccess: async () => {}, openExternal: async () => {} }, '../lib/plannerState': snapshots,
    '../lib/routeSync': { syncRoutePlan: async () => { if (syncFails) throw Error('offline'); } },
    '../lib/routeOutbox': { readRouteOutbox: () => syncFails && saves.length ? { [saves[0].id]: { kind: 'save', pending: true } } : {} },
    '../lib/storage': { saveRoutePlan: value => { if (storageFails) throw Error('quota'); saves.push(value); } },
    '../lib/supabaseData': { getSupabaseDataErrorMessage: (_error, fallback) => fallback },
  });
  host.start(RouteAssistantScreen, { onNotice: message => notices.push(message), onNavigate: view => navigations.push(view), surpriseRoute: seeded ? route : null, routeSeedKind: 'explore', ownerId: account ? 'fixture-owner' : null, accessToken: account ? 'UNIT_TEST_ONLY' : '' });
  return { host, saves, navigations, notices, generated };
}
const selected = tree => find(tree, 'section', props => props['aria-label'] === 'Selected route');

test('A discovered route is actionable first and saving it needs no origin or destination regeneration', async () => {
  const h = plannerHarness();
  try {
    let view = h.host.render();
    assert.equal(text(find(selected(view), 'h2')), 'Rome');
    assert.equal(find(view, 'div', props => props.id === 'planner-alternative-options').props.hidden, true);
    assert.equal(nodes(view).filter(node => node.type === 'button' && text(node.props.children).trim() === 'Save this plan').length, 1);
    const save = button(selected(view), 'Save this plan'); assert.equal(save.props.disabled, false);
    save.props.onClick(); save.props.onClick(); await tick();
    assert.equal(h.saves.length, 1); assert.equal(h.saves[0].plan.routes[0].name, 'Rome'); assert.equal(h.saves[0].input.origin, ''); assert.equal(h.generated.length, 0);
    assert.equal(h.saves[0].input.days, route.idealDuration, 'A seeded sample stores its own duration rather than the untouched form default');
    view = h.host.render(); assert.match(text(selected(view)), /Saved on this device/);
    button(selected(view), 'Go to Saved').props.onClick(); assert.deepEqual(h.navigations, ['trips']);
    button(view, 'Find other route ideas').props.onClick();
    view = h.host.render(); assert.equal(find(view, 'div', props => props.id === 'planner-alternative-options').props.hidden, false);
    assert.match(text(selected(view)), /do not edit your selected city/);
  } finally { h.host.dispose(); }
});

test('Plan-detail navigation respects reduced motion and moves keyboard focus without a second scroll', () => {
  const h = plannerHarness();
  try {
    const scrolls = [], focuses = [];
    const resultSection = find(h.host.render(), 'section', props => props.className === 'plan-results');
    find(resultSection, 'h2').props.ref.current = { scrollIntoView: options => scrolls.push(options), focus: options => focuses.push(options) };
    for (const reduce of [false, true]) {
      reducedMotion = reduce;
      button(selected(h.host.render()), 'View plan details').props.onClick();
      assert.equal(scrolls.at(-1).behavior, reduce ? 'auto' : 'smooth');
      assert.equal(scrolls.at(-1).block, 'start');
      assert.equal(focuses.at(-1).preventScroll, true);
    }
  } finally { reducedMotion = false; h.host.dispose(); }
});

test('Save confirmation distinguishes successful account sync, offline queue, and a failed local write', async () => {
  for (const settings of [{ account: true }, { account: true, syncFails: true }, { storageFails: true }]) {
    const h = plannerHarness(settings);
    try {
      button(selected(h.host.render()), 'Save this plan').props.onClick(); await tick();
      const view = h.host.render();
      if (settings.storageFails) { assert.equal(h.saves.length, 0); assert.equal(button(view, 'Go to Saved'), undefined); assert.match(h.notices[0], /could not be saved/); }
      else if (settings.syncFails) { assert.match(text(selected(view)), /waiting to sync/); assert.doesNotMatch(text(selected(view)), /Saved to your account/); }
      else assert.match(text(selected(view)), /Saved to your account/);
    } finally { h.host.dispose(); }
  }
});

test('Interest controls explain minimum selection, display the four-item limit, and keep selected items changeable', () => {
  const h = plannerHarness({ seeded: false });
  try {
    button(h.host.render(), 'Preferences').props.onClick();
    button(h.host.render(), 'Food').props.onClick();
    button(h.host.render(), 'City').props.onClick();
    assert.match(text(h.host.render()), /Keep at least one interest selected/);
    assert.equal(button(h.host.render(), 'City').props['aria-pressed'], true);
    for (const label of ['Culture', 'Coast', 'Nature']) button(h.host.render(), label).props.onClick();
    let view = h.host.render(); assert.match(text(view), /4\/4 selected/);
    assert.equal(button(view, 'Adventure').props.disabled, true);
    assert.equal(button(view, 'City').props.disabled, false);
    button(view, 'Coast').props.onClick(); view = h.host.render();
    assert.equal(button(view, 'Adventure').props.disabled, false);
  } finally { h.host.dispose(); }
});

test('Generated plans state the scope when one save stores multiple suggestions', async () => {
  const h = plannerHarness({ seeded: false });
  try {
    find(h.host.render(), 'AirportField').props.onChange({ city: 'Istanbul', name: 'Istanbul Airport' });
    button(h.host.render(), 'Create Route').props.onClick(); await tick();
    const save = button(h.host.render(), 'Save 2 suggestions'); assert.ok(save);
    save.props.onClick(); await tick();
    assert.equal(h.saves[0].plan.routes.length, 2);
    assert.equal(h.saves[0].input.days, h.generated[0].days, 'Generated plans retain the user preferences that produced them');
    assert.ok(button(h.host.render(), 'Go to Saved'));
  } finally { h.host.dispose(); }
});

test('Choosing a ready route records its displayed duration without rewriting alternative-search preferences', async () => {
  const h = plannerHarness({ seeded: false });
  try {
    const gallery = find(h.host.render(), 'div', props => props.className === 'planner-photo-grid');
    find(gallery, 'button').props.onClick();
    button(selected(h.host.render()), 'Save this plan').props.onClick(); await tick();
    assert.equal(h.saves[0].input.days, route.idealDuration);
    button(h.host.render(), 'Find other route ideas').props.onClick();
    const duration = nodes(h.host.render()).find(node => node.type === 'label' && text(node).startsWith('Duration'));
    assert.equal(find(duration, 'select').props.value, '4–6 gün', 'Choosing a sample must not overwrite the independent search form');
  } finally { h.host.dispose(); }
});

test('A favourite outside ready-route coverage opens an explanation, never an unrelated profile', () => {
  const host = hooks(), navigations = [];
  try {
    const { TripsScreen } = load('mobile/src/screens/PlansScreen.tsx', {
      ...common(host), '../../../lib/event-time': {}, '../components/Icon': { Icon: 'Icon' }, '../components/PageHero': { PageHero: 'PageHero' }, '../components/CountryFlag': { CountryFlag: 'CountryFlag' }, '../components/Sheet': { Sheet: 'Sheet' }, '../components/TripCollaborationHub': { TripCollaborationHub: 'TripCollaborationHub' },
      '../data/countryIso': { alpha2FromAlpha3: () => 'CA' }, '../data/artwork': { destinationArtwork: () => '' }, '../data/discovery': { DISCOVERY_DESTINATIONS: [] },
      '../lib/storage': { getSavedRoutePlans: () => [], getFavoriteDestinations: () => [{ alpha3: 'CAN', name: 'Canada' }], getSavedTravelEvents: () => [] },
      '../lib/supabaseData': {}, '../lib/native': {}, '../lib/routeOutbox': { readRouteOutbox: () => ({}) }, '../lib/routeSync': {}, '../lib/eventReminders': {},
      '../components/TravelSavedPlaces': { TravelSavedPlaces: 'TravelSavedPlaces' }, '../lib/savedPlaces': { readSavedPlaces: () => ({ items: [], dayIds: [], error: null }), subscribeSavedPlaces: () => () => {} },
    });
    host.start(TripsScreen, { user: null, accessToken: '', onNavigate: view => navigations.push(view), onNotice() {}, onOpenAccount() {}, onOpenDestination() {} });
    find(host.render(), 'button', props => props.className === 'saved-country-row').props.onClick();
    const view = host.render(); const dialog = find(view, 'Sheet', props => props.open && props.title === 'Canada');
    assert.ok(dialog); assert.match(text(dialog), /No ready-made route/); assert.equal(navigations.length, 0);
    button(dialog, 'Back to favourites').props.onClick();
    assert.equal(find(host.render(), 'Sheet', props => props.open && props.title === 'Canada'), undefined);
  } finally { host.dispose(); }
});

test('Saved library Places filter reads the same device store as the map and offers accurate assistant navigation', () => {
  const store = new Map(), events = new EventTarget(), host = hooks(), placesHost = hooks(), navigations = [];
  const placeData = load('lib/travel-assistant/places.ts');
  const savedApi = load('mobile/src/lib/savedPlaces.ts', { '../../../lib/travel-assistant/places': placeData }, {
    window: events, localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
  });
  const museum = { id: 'node/42', name: 'Saved Museum', category: 'museum', latitude: 52.52, longitude: 13.4, description: null, hours: null, free: null, accessible: null, website: null, representedCountry: null, sourceUrl: 'https://www.openstreetmap.org/node/42', fetchedAt: '2026-09-27T09:00:00.000Z' };
  savedApi.saveTravelPlace(museum);
  savedApi.updateTravelPlaceNote(museum.id, 'Go after lunch');
  try {
    const { TravelSavedPlaces } = load('mobile/src/components/TravelSavedPlaces.tsx', {
      ...common(placesHost), '../../../lib/travel-assistant/places': placeData, '../lib/native': {}, '../lib/travelAssistant': {}, '../lib/savedPlaces': savedApi, './Icon': { Icon: 'Icon' },
    });
    const { TripsScreen } = load('mobile/src/screens/PlansScreen.tsx', {
      ...common(host), '../../../lib/event-time': {}, '../components/Icon': { Icon: 'Icon' }, '../components/PageHero': { PageHero: 'PageHero' }, '../components/CountryFlag': { CountryFlag: 'CountryFlag' }, '../components/Sheet': { Sheet: 'Sheet' }, '../components/TripCollaborationHub': { TripCollaborationHub: 'TripCollaborationHub' },
      '../components/TravelSavedPlaces': { TravelSavedPlaces }, '../lib/savedPlaces': savedApi,
      '../data/countryIso': { alpha2FromAlpha3: () => 'GB' }, '../data/artwork': {}, '../data/discovery': { DISCOVERY_DESTINATIONS: [] },
      '../lib/storage': { getSavedRoutePlans: () => [], getFavoriteDestinations: () => [], getSavedTravelEvents: () => [] },
      '../lib/supabaseData': {}, '../lib/native': {}, '../lib/routeOutbox': { readRouteOutbox: () => ({}) }, '../lib/routeSync': {}, '../lib/eventReminders': {},
    }, { window: events });
    host.start(TripsScreen, { user: null, accessToken: '', onNavigate: view => navigations.push(view), onNotice() {}, onOpenAccount() {}, onOpenDestination() {} });
    let view = host.render();
    const entry = find(view, 'button', props => text(props.children).includes('Places saved from the map'));
    assert.match(text(entry), /1 place · On this device/);
    assert.equal(find(view, TravelSavedPlaces), undefined, 'All shows a short entry rather than the whole place list');
    button(view, 'Places').props.onClick();
    const panel = find(host.render(), TravelSavedPlaces); assert.ok(panel);
    placesHost.start(TravelSavedPlaces, panel.props);
    const card = nodes(placesHost.render()).find(node => typeof node.type === 'function' && node.props?.item?.place.id === museum.id);
    assert.ok(card); assert.equal(card.props.item.note, 'Go after lunch'); assert.equal(card.props.name, museum.name);
    assert.match(text(placesHost.render()), /not uploaded to your account/);
    host.render({ ownerId: 'a-different-account' });
    assert.equal(savedApi.readSavedPlaces().items[0].place.id, museum.id, 'Changing account scope does not migrate or remove device-only places');
    savedApi.deleteTravelPlace(museum.id);
    const empty = placesHost.render();
    const explore = button(empty, 'Open Travel Assistant'); assert.ok(explore);
    assert.equal(button(empty, 'Open sightseeing map'), undefined);
    explore.props.onClick(); assert.deepEqual(navigations, ['companion']);
    button(host.render(), 'All').props.onClick();
    assert.match(text(find(host.render(), 'button', props => text(props.children).includes('Places saved from the map'))), /0 places/);
    assert.equal(store.size, 1); assert.ok(store.has(savedApi.SAVED_PLACES_KEY), 'The library never creates a duplicate place store');
  } finally { host.dispose(); placesHost.dispose(); }
});
