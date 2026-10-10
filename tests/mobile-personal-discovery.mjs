import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const plain = value => JSON.parse(JSON.stringify(value));
const jsx = (type, props) => ({ type, props });
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));

function device() {
 const values = new Map(), listeners = new Map(); let denied = false;
 const window = {
  localStorage: { getItem: key => { if (denied) throw Error('blocked'); return values.get(key) ?? null; }, setItem: (key, value) => { if (denied) throw Error('blocked'); values.set(key, value); } },
  addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
  removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
  dispatchEvent: event => { listeners.get(event.type)?.forEach(fn => fn(event)); return true; },
 };
 return { window, values, listeners, deny: value => { denied = value; }, globals: { window, CustomEvent: class { constructor(type) { this.type = type; } } } };
}
function loader(globals = {}, imports = {}) {
 const cache = new Map();
 const load = file => {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  if (absolute.endsWith('.json')) return JSON.parse(readFileSync(absolute, 'utf8'));
  const output = { exports: {} }; cache.set(absolute, output);
  const compiled = ts.transpileModule(readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Intl, Date, ...globals }, { filename: absolute })(name => {
   if (Object.hasOwn(imports, name)) return imports[name];
   if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
   if (name.endsWith('.css')) return {};
   if (/\.(webp|png|svg)$/.test(name)) return name;
   if (!name.startsWith('.')) throw Error(`Unexpected import ${name}`);
   const base = path.resolve(path.dirname(absolute), name);
   const target = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate));
   if (!target) throw Error(`Missing module ${name}`);
   return load(target);
  }, output, output.exports);
  return output.exports;
 };
 return load;
}
function hooks() {
 const slots = []; let cursor = 0, dirty = false, pending = [], component, props;
 const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
 const memo = (fn, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; };
 return {
  react: {
   useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true; }]; },
   useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
   useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useId: () => ':personal-test:',
   useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || changed(old.deps, deps)) { slots[i] = { ...old, deps }; pending.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  },
  start(fn, initial) { component = fn; props = initial; return this.render(); },
  render(next, flush = true) { if (next) props = { ...props, ...next }; for (let i = 0; i < 15; i++) { cursor = 0; dirty = false; const tree = component(props); if (!flush) return tree; const tasks = pending; pending = []; tasks.forEach(fn => fn()); if (!dirty) return tree; } throw Error('Unstable render'); },
  dispose() { slots.forEach(slot => slot?.cleanup?.()); },
 };
}
const shared = locale => ({ '../lib/i18n': { useI18n: () => ({ locale, dateLocale: locale === 'tr' ? 'tr-TR' : locale === 'sq' ? 'sq-AL' : 'en-GB', copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq : en }) }, './Sheet': { Sheet: 'Sheet' }, './Icon': { Icon: 'Icon' }, './TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' } });

test('Shortcut selections persist in order while guest and exact account identities remain separate', () => {
 const d = device(), load = loader(d.globals), store = load('mobile/src/lib/homeShortcuts.ts');
 assert.deepEqual(plain(store.readHomeShortcuts()), ['route', 'explore', 'passport', 'trips', 'companion']);
 assert.equal(store.saveHomeShortcuts(null, ['tool:translate', 'tool:money', 'route']), true);
 assert.equal(store.saveHomeShortcuts('owner/a', ['cockpit', 'tool:offline']), true);
 assert.equal(store.saveHomeShortcuts('ownera', ['events']), true);
 const fresh = loader(d.globals)('mobile/src/lib/homeShortcuts.ts');
 assert.deepEqual(plain(fresh.readHomeShortcuts()), ['tool:translate', 'tool:money', 'route']);
 assert.deepEqual(plain(fresh.readHomeShortcuts('owner/a')), ['cockpit', 'tool:offline']);
 assert.deepEqual(plain(fresh.readHomeShortcuts('ownera')), ['events']);
 assert.deepEqual(plain(fresh.readHomeShortcuts('another')), ['route', 'explore', 'passport', 'trips', 'companion']);
});

test('Invalid shortcut data is bounded and repaired; denied storage never reports a saved choice', () => {
 const d = device(), store = loader(d.globals)('mobile/src/lib/homeShortcuts.ts');
 d.values.set(store.homeShortcutKey('a'), JSON.stringify(['admin', 'tool:unknown', 'route', 'route', 'tool:translate', 'cockpit', 'events', 'costs', 'passport']));
 assert.deepEqual(plain(store.readHomeShortcuts('a')), ['route', 'tool:translate', 'cockpit', 'events', 'costs']);
 d.values.set(store.homeShortcutKey('a'), '{broken'); assert.equal(store.readHomeShortcuts('a').length, 5);
 let notices = 0; d.window.addEventListener(store.HOME_SHORTCUT_EVENT, () => notices++);
 d.deny(true); assert.equal(store.saveHomeShortcuts('a', ['tool:money']), false); assert.equal(notices, 0);
 assert.deepEqual(plain(store.readHomeShortcuts('a')), plain(store.DEFAULT_HOME_SHORTCUTS));
});

test('Shortcut hook never renders the prior account and follows saved or cross-tab changes only for its owner', () => {
 const d = device(), h = hooks(), load = loader(d.globals, { react: h.react });
 const store = load('mobile/src/lib/homeShortcuts.ts'), { useHomeShortcuts } = load('mobile/src/hooks/useHomeShortcuts.ts');
 store.saveHomeShortcuts('a', ['tool:translate']); store.saveHomeShortcuts('b', ['tool:money']);
 assert.deepEqual(plain(h.start(({ owner }) => useHomeShortcuts(owner), { owner: 'a' }).views), ['tool:translate']);
 assert.deepEqual(plain(h.render({ owner: 'b' }, false).views), ['tool:money'], 'The first render after switching has no prior-owner data');
 let current = h.render(); current.save(['cockpit']); assert.deepEqual(plain(h.render().views), ['cockpit']);
 store.saveHomeShortcuts('a', ['events']); assert.deepEqual(plain(h.render().views), ['cockpit']);
 d.values.set(store.homeShortcutKey('b'), JSON.stringify(['tool:offline']));
 d.window.dispatchEvent({ type: 'storage', key: store.homeShortcutKey('b'), storageArea: d.window.localStorage });
 assert.deepEqual(plain(h.render().views), ['tool:offline']);
 h.dispose(); assert.ok([...d.listeners.values()].every(listeners => listeners.size === 0));
});

const search = loader()('mobile/src/lib/globalSearch.ts').searchApp;
test('Real country and city catalogs match Turkish, English and Albanian names without duplicate destinations', () => {
 for (const query of ['Almanya', 'GERMANY', 'Gjermani', 'DEU']) assert.ok(search(query, 'tr').some(item => item.kind === 'country' && item.countryCode === 'DEU'), query);
 assert.ok(search('Shqiperi', 'sq').some(item => item.kind === 'country' && item.countryCode === 'ALB'));
 for (const [query, code] of [['KAPADOKYA', 'NAV'], ['Cappadocia', 'NAV'], ['Kapadokia', 'NAV'], ['New York', 'JFK'], ['Nju-Jorku', 'JFK'], ['TİFLİS', 'TBS']]) {
  const results = search(query, 'en'); assert.ok(results.some(item => item.id === `city:${code}`), query);
  assert.equal(new Set(results.map(item => item.id)).size, results.length);
 }
 assert.equal(search('an unsupported imaginary place', 'en').length, 0); assert.equal(search('  ', 'en').length, 0);
});

test('Tool search exposes precise existing assistant targets and localized result labels', () => {
 for (const [query, locale, tool] of [['ceviri', 'tr', 'translate'], ['translation', 'en', 'translate'], ['perkthim', 'sq', 'translate'], ['doviz', 'tr', 'money'], ['offline', 'en', 'offline'], ['eczane', 'tr', 'needs']]) {
  const results = search(query, locale, [], 'tool');
  assert.ok(results.some(item => item.view === 'companion' && item.tool === tool), `${locale}/${query}`);
  assert.ok(results.every(item => item.kind === 'tool'));
 }
 assert.equal(search('ceviri', 'sq', [], 'tool').find(item => item.tool === 'translate').title, 'Përkthimi');
});

const route = (id, city, country = 'France') => ({ id, createdAt: '2026-10-10', plan: { summary: 'Weekend holiday', routes: [{ cityOrRegion: city, name: city, country, destinationCode: 'CDG' }] } });
const trip = (id, owner = 'a', city = 'Paris') => ({ id, userId: owner, destinationCountry: 'France', destinationCode: 'FR', destinationCity: city, startDate: '2027-04-12', endDate: '2027-04-19' });
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function tripSearchSheet(initial = {}) {
 const h = hooks(), d = device(), requests = [], calls = [];
 const load = loader(d.globals, {
  ...shared('en'), react: h.react,
  '../lib/storage': { getSavedRoutePlans: () => [] },
  '../lib/supabaseData': { listCockpitTrips: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })) },
 });
 const { GlobalSearchSheet } = load('mobile/src/components/GlobalSearchSheet.tsx');
 const tree = h.start(GlobalSearchSheet, {
  open: true, ownerId: 'a', accessToken: 'token-a', initialQuery: 'Paris',
  onClose: () => calls.push('close'), onOpenTrip: id => calls.push(id),
  onOpenSavedRoute: id => calls.push(id), onOpenCountry: id => calls.push(id),
  onSearchDestination: query => calls.push(query), onOpenTool: tool => calls.push(tool), onNavigate: view => calls.push(view),
  ...initial,
 });
 return { h, d, requests, calls, tree };
}

test('Saved route search uses only supplied records, skips malformed records and reserves room per category', () => {
 const records = [null, {}, { id: 'broken', plan: { routes: null } }, { id: 'empty', plan: { routes: [] } }, route('a', 'Paris'), route('a', 'Paris')];
 assert.deepEqual(plain(search('weekend', 'en', records).map(item => item.routeId)), ['a']);
 assert.equal(search('weekend', 'en', [route('b', 'Rome')])[0].routeId, 'b');
 assert.equal(search('weekend', 'en', []).length, 0);
 const many = Array.from({ length: 30 }, (_, index) => route(`saved-${index}`, `Paris ${index}`));
 const results = search('Paris', 'en', many);
 assert.equal(results.filter(item => item.kind === 'saved-route').length, 6);
 assert.ok(results.some(item => item.kind === 'city')); assert.equal(search('Paris', 'en', many, 'saved-route').length, 20);
});

test('Saved trip search matches destination and dates without indexing private flight or checklist data', () => {
 const record = { ...trip('trip-a'), flightPnr: 'PRIVATEPNR', flightNumber: 'SECRETFLIGHT', airline: 'HIDDEN CARRIER', checklistItems: [{ title: 'CONFIDENTIAL NOTE' }] };
 for (const query of ['Paris', 'France', 'FR', '2027-04-12', '2027-04-19']) {
  const results = search(query, 'en', [], 'saved-trip', [record]);
  assert.deepEqual(plain(results.map(item => item.tripId)), ['trip-a'], query);
  assert.ok(results.every(item => item.kind === 'saved-trip'));
 }
 for (const query of ['PRIVATEPNR', 'SECRETFLIGHT', 'HIDDEN CARRIER', 'CONFIDENTIAL NOTE']) assert.equal(search(query, 'en', [], undefined, [record]).length, 0, query);
 const results = search('Paris', 'en', [], 'saved-trip', [record]);
 assert.doesNotMatch(JSON.stringify(results), /PRIVATEPNR|SECRETFLIGHT|HIDDEN CARRIER|CONFIDENTIAL NOTE/);
 assert.equal(search('2027-04-12', 'en', [], 'saved-trip').length, 0, 'Only the supplied account-scoped records can appear');
 const many = Array.from({ length: 30 }, (_, index) => trip(`trip-${index}`));
 assert.equal(search('Paris', 'en', [], undefined, many).filter(item => item.kind === 'saved-trip').length, 6);
 assert.equal(search('Paris', 'en', [], 'saved-trip', many).length, 20);
});

test('Search sheet opens exact results, blocks deleted routes and hides old-owner routes before effects run', () => {
 const h = hooks(), d = device(), saved = new Map([['a', [route('saved-a', 'Paris')]], ['b', [route('saved-b', 'Rome')]]]), calls = [];
 const load = loader(d.globals, { ...shared('en'), react: h.react, '../lib/storage': { getSavedRoutePlans: owner => saved.get(owner) || [] }, '../lib/supabaseData': { listCockpitTrips: () => { throw Error('No trip request without a token'); } } });
 const { GlobalSearchSheet } = load('mobile/src/components/GlobalSearchSheet.tsx');
 let tree = h.start(GlobalSearchSheet, { open: true, ownerId: 'a', initialQuery: 'weekend', onClose: () => calls.push('close'), onOpenTrip: id => calls.push(id), onOpenSavedRoute: id => calls.push(id), onOpenCountry: id => calls.push(id), onSearchDestination: query => calls.push(query), onOpenTool: tool => calls.push(tool), onNavigate: view => calls.push(view) });
 assert.match(text(tree), /Paris/); tree = h.render({ ownerId: 'b' }, false); assert.doesNotMatch(text(tree), /Paris/);
 tree = h.render(); assert.match(text(tree), /Rome/);
 let result = find(tree, 'button', props => text(props.children).includes('Rome'));
 saved.set('b', []); result.props.onClick(); tree = h.render(); assert.equal(calls.length, 0); assert.match(text(tree), /no longer saved/);
 saved.set('b', [route('saved-b', 'Rome')]); d.window.dispatchEvent({ type: 'l2t:storage-change' }); tree = h.render();
 find(tree, 'button', props => text(props.children).includes('Rome')).props.onClick(); assert.deepEqual(calls.splice(0), ['close', 'saved-b']);
 for (const [query, label, expected] of [['doviz', 'Money', 'money'], ['Germany', 'Germany', 'DEU'], ['Paris', 'Paris', 'Paris'], ['airport', 'Airport Guide', 'airports']]) {
  tree = h.render({ initialQuery: query }); find(tree, 'button', props => text(props.children).startsWith(label)).props.onClick(); assert.deepEqual(calls.splice(0), ['close', expected]);
 }
 h.dispose(); assert.ok([...d.listeners.values()].every(listeners => listeners.size === 0));
});

test('Search sheet keeps catalog results available while trips load and opens the exact saved trip', async () => {
 const { h, requests, calls, tree: initial } = tripSearchSheet();
 assert.match(text(initial), /Loading your saved trips/);
 assert.ok(find(initial, 'strong', props => text(props.children) === 'Paris'), 'The city catalog is available before the account request finishes');
 assert.deepEqual(requests.map(request => request.args), [['a', 'token-a', true]]);
 let tree = h.render({ initialQuery: 'France' });
 find(tree, 'button', props => text(props.children) === 'Saved trips').props.onClick(); tree = h.render();
 assert.equal(requests.length, 1, 'Typing or changing the category must not repeat the account request');
 requests[0].resolve([trip('exact-cockpit-trip')]); await settle(); tree = h.render();
 assert.doesNotMatch(text(tree), /Loading your saved trips/);
 find(tree, 'button', props => text(props.children).startsWith('Paris')).props.onClick();
 assert.deepEqual(calls, ['close', 'exact-cockpit-trip']);
 h.render({ open: false }); h.render({ open: true });
 assert.equal(requests.length, 2, 'Reopening refreshes trips changed elsewhere');
 h.dispose();
});

test('Search sheet hides a previous owner immediately and discards late account responses', async () => {
 const { h, requests } = tripSearchSheet({ initialQuery: 'Private' });
 requests[0].resolve([trip('trip-a', 'a', 'Private Alpha Harbor')]); await settle();
 assert.match(text(h.render()), /Private Alpha Harbor/);
 let tree = h.render({ ownerId: 'b', accessToken: 'token-b' }, false);
 assert.doesNotMatch(text(tree), /Private Alpha Harbor/, 'No prior-account result appears even before the new effect runs');
 h.render(); assert.deepEqual(requests[1].args, ['b', 'token-b', true]);
 h.render({ ownerId: 'c', accessToken: 'token-c' });
 requests[1].resolve([trip('trip-b', 'b', 'Private Beta Harbor')]); await settle();
 tree = h.render(); assert.doesNotMatch(text(tree), /Private Alpha Harbor|Private Beta Harbor/);
 requests[2].resolve([trip('trip-c', 'c', 'Private Gamma Harbor'), trip('foreign-trip', 'b', 'Private Foreign Harbor')]); await settle();
 tree = h.render(); assert.match(text(tree), /Private Gamma Harbor/); assert.doesNotMatch(text(tree), /Private Alpha Harbor|Private Beta Harbor|Private Foreign Harbor/, 'Unexpected records for another owner are excluded');
 h.dispose();
});

test('Search sheet treats a changed token as a new request and ignores results after closing', async () => {
 const { h, requests } = tripSearchSheet({ initialQuery: 'Private' });
 h.render({ accessToken: 'token-a-refreshed' });
 assert.deepEqual(requests[1].args, ['a', 'token-a-refreshed', true]);
 requests[0].resolve([trip('old-token-trip', 'a', 'Private Old Token Harbor')]); await settle();
 assert.doesNotMatch(text(h.render()), /Private Old Token Harbor/);
 requests[1].resolve([trip('new-token-trip', 'a', 'Private New Token Harbor')]); await settle();
 assert.match(text(h.render()), /Private New Token Harbor/);
 let tree = h.render({ accessToken: 'token-a-again' }, false);
 assert.doesNotMatch(text(tree), /Private New Token Harbor/, 'Token-bound results are hidden before the new effect runs');
 h.render(); h.render({ open: false });
 requests[2].resolve([trip('closed-trip', 'a', 'Private Closed Harbor')]); await settle();
 tree = h.render({ open: true }); assert.doesNotMatch(text(tree), /Private Closed Harbor/);
 assert.equal(requests.length, 4); h.dispose();
});

test('Search sheet skips guest and closed requests and retries a trip failure without blocking catalogs', async () => {
 const { h, requests } = tripSearchSheet({ open: false, ownerId: null, accessToken: undefined });
 h.render({ open: true }); assert.equal(requests.length, 0);
 h.render({ ownerId: 'a' }); assert.equal(requests.length, 0, 'An owner without a session does not trigger an authenticated read');
 h.render({ open: false, accessToken: 'token-a' }); assert.equal(requests.length, 0);
 h.render({ open: true }); assert.equal(requests.length, 1);
 requests[0].reject(Error('Network unavailable')); await settle(); let tree = h.render();
 assert.match(text(tree), /Your saved trips could not be loaded\. Other results are available\./);
 assert.ok(find(tree, 'strong', props => text(props.children) === 'Paris'));
 find(tree, 'button', props => text(props.children) === 'Try again').props.onClick(); tree = h.render();
 assert.equal(requests.length, 2); assert.match(text(tree), /Loading your saved trips/);
 requests[1].resolve([trip('retried-trip')]); await settle(); tree = h.render();
 assert.doesNotMatch(text(tree), /could not be loaded|Loading your saved trips/);
 find(tree, 'button', props => text(props.children) === 'Saved trips').props.onClick(); tree = h.render();
 assert.ok(find(tree, 'strong', props => text(props.children) === 'Paris'));
 h.dispose();
});

test('Shortcut editor saves deliberate order and keeps failed edits visible', () => {
 const h = hooks(), saved = []; let closed = 0, allowSave = false;
 const load = loader({}, { ...shared('en'), react: h.react });
 const { HomeShortcutPicker } = load('mobile/src/components/HomeShortcutPicker.tsx');
 let tree = h.start(HomeShortcutPicker, { views: ['tool:translate', 'tool:money'], onSave: views => { saved.push(plain(views)); return allowSave; }, onClose: () => closed++ });
 find(tree, 'button', props => props['aria-label'] === 'Move Money earlier').props.onClick(); tree = h.render();
 find(tree, 'button', props => text(props.children) === 'Save').props.onClick(); tree = h.render();
 assert.deepEqual(saved[0], ['tool:money', 'tool:translate']); assert.equal(closed, 0); assert.match(text(tree), /could not be saved/);
 allowSave = true; find(tree, 'button', props => text(props.children) === 'Save').props.onClick(); assert.equal(closed, 1);
});

test('Home personal shortcuts open exact tools and its unified search preserves city-chip navigation', () => {
 const d = device(), h = hooks(), calls = [];
 const load = loader(d.globals, { ...shared('en'), react: h.react, '../components/Icon': { Icon: 'Icon' }, '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' }, '../components/HomeShortcutPicker': { HomeShortcutPicker: 'HomeShortcutPicker' }, '../lib/supabaseData': { listCockpitTrips: () => { throw Error('No account API call for guest'); } } });
 load('mobile/src/lib/homeShortcuts.ts').saveHomeShortcuts(null, ['tool:translate', 'tool:money', 'cockpit']);
 const { HomeScreen } = load('mobile/src/screens/HomeScreen.tsx');
 let tree = h.start(HomeScreen, { user: null, onNavigate: view => calls.push(view), onOpenTool: tool => calls.push(tool), onOpenGlobalSearch: query => calls.push(`global:${query}`), onSearchDestination: query => calls.push(`city:${query}`), onOpenCommunity() {}, onBuildRoute() {} });
 const nav = find(tree, 'nav'); assert.deepEqual(nodes(nav).filter(node => node.type === 'button').map(node => text(find(node, 'strong'))), ['Translate', 'Money', 'Travel Cockpit']);
 for (const button of nodes(nav).filter(node => node.type === 'button')) button.props.onClick();
 assert.deepEqual(calls.splice(0), ['translate', 'money', 'cockpit']);
 find(tree, 'input', props => props.id === 'home-destination-search').props.onChange({ target: { value: '  currency  ' } }); tree = h.render();
 find(tree, 'form').props.onSubmit({ preventDefault() {} }); assert.deepEqual(calls.splice(0), ['global:currency']);
 find(tree, 'button', props => text(props.children) === 'Paris').props.onClick(); assert.deepEqual(calls, ['city:Paris']); h.dispose();
});
