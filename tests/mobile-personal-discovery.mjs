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
   if (name === '../components/CityPhotoCredits' || name === './CityPhotoCredits') return { CityPhotoCredits: 'CityPhotoCredits' };
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
const shared = locale => ({ '../lib/i18n': { useI18n: () => ({ locale, dateLocale: locale === 'tr' ? 'tr-TR' : locale === 'sq' ? 'sq-AL' : 'en-GB', copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq : en }) }, './Sheet': { Sheet: 'Sheet' }, './Icon': { Icon: 'Icon' }, './TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' }, './DestinationSearchFallback': { DestinationSearchFallback: 'DestinationSearchFallback' } });

test('Shortcut selections persist in order while guest and exact account identities remain separate', () => {
 const d = device(), load = loader(d.globals), store = load('mobile/src/lib/homeShortcuts.ts');
 assert.deepEqual(plain(store.readHomeShortcuts()), ['route', 'explore', 'passport', 'trips', 'companion']);
 assert.equal(store.saveHomeShortcuts(null, ['tool:translate', 'tool:money', 'route']), true);
 assert.equal(store.saveHomeShortcuts('owner/a', ['cockpit', 'tool:offline']), true);
 assert.equal(store.saveHomeShortcuts('ownera', ['events']), true);
 const fresh = loader(d.globals)('mobile/src/lib/homeShortcuts.ts');
 assert.deepEqual(plain(fresh.readHomeShortcuts()), ['tool:translate', 'tool:money', 'route']);
 assert.deepEqual(plain(fresh.readHomeShortcuts('owner/a')), ['cockpit', 'tool:map']);
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

test('Old map shortcuts migrate to one visible map without losing order or touching another account',()=>{
 const d=device(),load=loader(d.globals),store=load('mobile/src/lib/homeShortcuts.ts'),catalog=load('mobile/src/lib/appTools.ts');
 d.values.set(store.homeShortcutKey('a'),JSON.stringify(['tool:offline','tool:needs','route','tool:saved','tool:explore','tool:translate']));
 const original=d.values.get(store.homeShortcutKey('a'));
 assert.deepEqual(plain(store.readHomeShortcuts('a')),['tool:map','route','tool:translate']);
 assert.equal(d.values.get(store.homeShortcutKey('a')),original,'A compatibility read does not mutate stored data');
 assert.equal(catalog.appTools('tr').filter(item=>['map','explore','needs','saved','offline'].includes(item.tool)).length,1);
 assert.equal(catalog.appTools('tr').find(item=>item.tool==='map').label,'Harita');
 for(const query of ['eczane','gezi haritası','kayıtlı yerler','nearby','offline map','Starbucks marka','restoran','yol tarifi']){
  const words=query==='Starbucks marka'?'marka':query,results=search(words,'tr',[],'tool');
  assert.equal(results.filter(item=>item.tool==='map').length,1,query);
  assert.equal(results.some(item=>['explore','needs','offline','saved'].includes(item.tool)),false,query);
 }
});

test('Stored consulate shortcuts merge into Map while retired transport shortcuts are removed safely per account',()=>{
 const d=device(),load=loader(d.globals),store=load('mobile/src/lib/homeShortcuts.ts'),catalog=load('mobile/src/lib/appTools.ts');
 const original=['tool:embassies','tool:transit','tool:photo','tool:map','route'];
 d.values.set(store.homeShortcutKey('a'),JSON.stringify(original));
 d.values.set(store.homeShortcutKey('b'),JSON.stringify(['events','tool:money']));
 assert.deepEqual(plain(store.readHomeShortcuts('a')),['tool:map','tool:photo','route']);
 assert.deepEqual(plain(store.readHomeShortcuts('b')),['events','tool:money']);
 assert.deepEqual(JSON.parse(d.values.get(store.homeShortcutKey('a'))),original,'Compatibility reads preserve the stored source');
 assert.equal(catalog.canonicalAppShortcutId('tool:transit'),null);
 assert.equal(catalog.canonicalAppShortcutId('tool:embassies'),'tool:map');
 assert.equal(catalog.travelMapSectionForTool('embassies'),'embassies');
 assert.ok(catalog.appTools('en').some(item=>item.tool==='photo'));
 assert.equal(catalog.appTools('en').some(item=>item.tool==='transit'||item.tool==='embassies'),false,'The shortcut picker has no retired standalone entry');
 d.values.set(store.homeShortcutKey('retired-only'),JSON.stringify(['tool:transit']));
 assert.deepEqual(plain(store.readHomeShortcuts('retired-only')),plain(store.DEFAULT_HOME_SHORTCUTS),'An entirely retired selection recovers to usable defaults');
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
 assert.deepEqual(plain(h.render().views), ['tool:map']);
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
 for (const [query, locale, tool] of [['ceviri', 'tr', 'translate'], ['translation', 'en', 'translate'], ['perkthim', 'sq', 'translate'], ['doviz', 'tr', 'money'], ['offline', 'en', 'map'], ['eczane', 'tr', 'map']]) {
  const results = search(query, locale, [], 'tool');
  assert.ok(results.some(item => item.view === 'companion' && item.tool === tool), `${locale}/${query}`);
  assert.ok(results.every(item => item.kind === 'tool'));
 }
 assert.equal(search('ceviri', 'sq', [], 'tool').find(item => item.tool === 'translate').title, 'Përkthimi');
});

test('Consulate searches in all supported languages expose one Map result and no retired transport tool',()=>{
 for(const [query,locale] of [['konsolosluk','tr'],['büyükelçilik','tr'],['consulate','en'],['embassy','en'],['konsullatë','sq'],['ambasadë','sq']]){
  const results=search(query,locale,[],'tool');
  assert.equal(results.filter(item=>item.tool==='map').length,1,`${locale}/${query}`);
  assert.equal(results.some(item=>item.tool==='embassies'||item.tool==='transit'),false);
 }
 for(const [query,locale] of [['ulaşım','tr'],['transport','en'],['metro','tr'],['transporti','sq']]){
  assert.equal(search(query,locale,[],'tool').some(item=>item.tool==='transit'),false,`${locale}/${query}`);
 }
});

test('Existing journal, world map, recap and help are searchable by novice phrases in all supported languages', () => {
 for (const [query, locale, target] of [
  ['günlük', 'tr', 'journal'], ['gezi notlarım', 'tr', 'journal'], ['diary', 'en', 'journal'], ['ditar', 'sq', 'journal'],
  ['dünya haritam', 'tr', 'map'], ['gittiğim ülkeler', 'tr', 'map'], ['visited countries', 'en', 'map'], ['harta ime', 'sq', 'map'],
  ['yıllık özet', 'tr', 'summary'], ['year recap', 'en', 'summary'], ['përmbledhja vjetore', 'sq', 'summary'],
 ]) assert.ok(search(query, locale, [], 'tool').some(item => item.journeyTool === target), `${locale}/${query}`);
 for (const [query, locale] of [['nasıl kullanılır', 'tr'], ['yardım', 'tr'], ['how to use', 'en'], ['ndihmë', 'sq']]) {
  assert.ok(search(query, locale, [], 'tool').some(item => item.guide), `${locale}/${query}`);
 }
 for (const [locale, subtitle] of [['tr', 'Ülke gündemi'], ['en', 'Country updates'], ['sq', 'Lajme nga shteti']]) {
  const country = search('ITA', locale, [], 'country').find(item => item.countryCode === 'ITA');
  assert.ok(country.subtitle.startsWith(subtitle));
 }
 const catalog = loader()('mobile/src/lib/appTools.ts');
 assert.ok(catalog.appTools('tr').every(item => !item.journeyTool && !item.guide), 'Search expansion does not add unsupported Home shortcut targets');
});

test('Search opens each precise journey tool and help without passing through a generic Plans or Profile screen', () => {
 const h = hooks(), d = device(), calls = [];
 const { GlobalSearchSheet } = loader(d.globals, {
  ...shared('en'), react: h.react,
  '../lib/storage': { getSavedRoutePlans: () => [] }, '../lib/supabaseData': {},
 })('mobile/src/components/GlobalSearchSheet.tsx');
 h.start(GlobalSearchSheet, { open: true, ownerId: null, initialQuery: '', onClose: () => calls.push('close'),
  onOpenJourneyTool: tool => calls.push(`journey:${tool}`), onOpenGuide: () => calls.push('guide'),
  onNavigate: view => calls.push(`generic:${view}`), onOpenTool: () => calls.push('assistant'),
 });
 for (const [query, target] of [['journal', 'journey:journal'], ['world map', 'journey:map'], ['year recap', 'journey:summary'], ['how to use', 'guide']]) {
  const tree = h.render({ initialQuery: query });
  const label = search(query, 'en', [], 'tool').find(item => item.guide || item.journeyTool).title;
  find(tree, 'button', p => text(p.children).startsWith(label)).props.onClick();
  assert.deepEqual(calls.splice(0), ['close', target]);
 }
 h.dispose();
});

test('Reopening a journey tool preserves its unsaved journal draft and the same request does not reopen a dismissed sheet', () => {
 const h = hooks(), d = device();
 const i18n = shared('en')['../lib/i18n'].useI18n();
 const { JourneyToolsHub } = loader(d.globals, {
  ...shared('en'), react: { ...h.react, lazy: () => 'LazyComponent', Suspense: 'Suspense' },
  '../lib/i18n': { useI18n: () => i18n },
  './DateTimeField': { DateTimeField: 'DateTimeField' }, './CountryFlag': { CountryFlag: 'CountryFlag' },
  '../lib/travelJournal': { readJournal: () => ({ entries: [], deleted: [] }), validJournalDraft: () => false },
  '../lib/journeyTools': { readSafetyTrips: () => [], travelRecap: () => ({ trips: [], days: 0 }) },
  '../lib/storage': { getVisitedCountries: () => [] }, '../lib/supabaseData': {}, '../lib/native': {},
 })('mobile/src/components/JourneyToolsHub.tsx');
 const journal = tree => find(tree, 'Sheet', p => p.title === 'Travel journal');
 let tree = h.start(JourneyToolsHub, { initialTool: 'journal', toolRequestId: 1, user: null, accessToken: '', onNotice() {}, onNavigate() {}, onOpenAccount() {} });
 assert.equal(journal(tree).props.open, true);
 const title = find(tree, 'input', p => p.maxLength === 120); title.props.onChange({ target: { value: 'My unsaved memory' } }); tree = h.render();
 journal(tree).props.onClose(); tree = h.render(); assert.equal(journal(tree).props.open, false);
 assert.equal(journal(h.render({ toolRequestId: 1 })).props.open, false);
 tree = h.render({ initialTool: 'map', toolRequestId: 2 });
 assert.equal(find(tree, 'Sheet', p => p.title === 'My world map').props.open, true);
 tree = h.render({ initialTool: 'journal', toolRequestId: 3 });
 assert.equal(journal(tree).props.open, true);
 assert.equal(find(tree, 'input', p => p.maxLength === 120).props.value, 'My unsaved memory');
 h.dispose();
});

function journeyHub({ trips = [], ...initial } = {}) {
 const h = hooks(), d = device(), calls = [], tripReads = [], snapshotWrites = [], lazyNames = ['WorldMap', 'AirportField', 'TravelAssistant'];
 const i18n = { ...shared('en')['../lib/i18n'].useI18n(), countryName: (_, name) => name };
 const load = loader(d.globals, {
  ...shared('en'), react: { ...h.react, lazy: () => lazyNames.shift(), Suspense: 'Suspense' },
  '../lib/i18n': { useI18n: () => i18n },
  './DateTimeField': { DateTimeField: 'DateTimeField' }, './CountryFlag': { CountryFlag: 'CountryFlag' },
  '../lib/travelJournal': { readJournal: () => ({ entries: [], deleted: [] }), validJournalDraft: () => false },
  '../lib/journeyTools': { readSafetyTrips: () => trips, saveSafetyTrips: (...args) => snapshotWrites.push(args), travelRecap: () => ({ trips: [], days: 0 }) },
  '../lib/storage': { getVisitedCountries: () => [{ alpha3: 'TUR', name: 'Türkiye' }] }, '../lib/supabaseData': { listCockpitTrips: (...args) => { tripReads.push(args); return Promise.resolve([]); } }, '../lib/native': {},
 });
 const { JourneyToolsHub } = load('mobile/src/components/JourneyToolsHub.tsx');
 const tree = h.start(JourneyToolsHub, { user: null, accessToken: '', onNotice: message => calls.push(`notice:${message}`), onNavigate: view => calls.push(`navigate:${view}`), onOpenAccount: () => calls.push('account'), ...initial });
 return { h, d, calls, tripReads, snapshotWrites, tree, travelSelection: load('mobile/src/lib/travelSelection.ts') };
}

test('Journey safety opens emergency help directly for the selected trip and retains the phrase shortcut', () => {
 const cachedTrips = [
  { id: 'uk-trip', destinationCountry: 'United Kingdom', destinationCode: 'GB', destinationCity: 'London', status: 'active', startDate: '2026-10-01', endDate: '2026-10-31' },
  { id: 'fr-trip', destinationCountry: 'France', destinationCode: 'FR', destinationCity: 'Paris', status: 'upcoming', startDate: '2027-01-02', endDate: '2027-01-06' },
 ];
 const x = journeyHub({ trips: cachedTrips });
 try {
  let tree = x.tree;
  const safety = view => find(view, 'Sheet', props => props.title === 'Travel safety centre');
  assert.equal(safety(tree).props.open, false);
  const launch = find(tree, 'button', props => nodes({ props }).some(node => node.type === 'strong' && text(node) === 'Travel safety'));
  assert.ok(launch); launch.props.onClick(); tree = x.h.render();
  assert.equal(safety(tree).props.open, true);
  let assistant = find(safety(tree), 'TravelAssistant');
  assert.equal(assistant.props.initialTool, 'safety', 'The safety entry must not show the unrelated full tool directory');
  assert.equal(assistant.props.initialCountry, 'GB', 'Current trip country reaches emergency help');
  assert.equal(assistant.props.accessToken, '');
  find(safety(tree), 'select').props.onChange({ target: { value: 'fr-trip' } }); tree = x.h.render();
  assistant = find(safety(tree), 'TravelAssistant');
  assert.equal(assistant.props.initialCountry, 'FR'); assert.equal(assistant.props.initialTool, 'safety');
  assistant.props.onSignIn(); assert.deepEqual(x.calls, ['account']);
  assistant.props.onPhrases('FR'); tree = x.h.render();
  assert.equal(safety(tree).props.open, false); assert.deepEqual(x.calls, ['account', 'navigate:phrases']);
  assert.equal(x.travelSelection.readTravelCountry(), 'FR', 'The phrase screen keeps the explicit country selection');
 } finally { x.h.dispose(); }
});

test('Journey tools reuse supplied trip options, update safety and journal choices and do not issue a duplicate request', async () => {
 const first = { id: 'rome-trip', destinationCountry: 'Italy', destinationCode: 'IT', destinationCity: 'Rome', status: 'active', startDate: '2026-10-01', endDate: '2026-10-31' };
 const next = { ...first, id: 'paris-trip', destinationCountry: 'France', destinationCode: 'FR', destinationCity: 'Paris' };
 const x = journeyHub({ user: { id: 'a' }, ownerId: 'a', accessToken: 'token-a', initialTool: 'safety', tripOptions: [first], trips: [{ ...first, id: 'old-cache', destinationCity: 'Stale cache' }] });
 const safety = view => find(view, 'Sheet', props => props.title === 'Travel safety centre');
 const journal = view => find(view, 'Sheet', props => props.title === 'Travel journal');
 const journalTripSelect = view => find(find(journal(view), 'label', props => text(props.children).startsWith('Trip')), 'select');
 const optionValues = select => nodes(select).filter(node => node.type === 'option').map(node => node.props.value);
 try {
  let tree = x.tree;
  assert.deepEqual(x.tripReads, [], 'Plans already loaded the trips; the hub must not request them again');
  assert.deepEqual(optionValues(find(safety(tree), 'select')), ['rome-trip']);
  assert.deepEqual(optionValues(journalTripSelect(tree)), ['', 'rome-trip']);
  assert.equal(find(safety(tree), 'TravelAssistant').props.initialCountry, 'IT');
  assert.doesNotMatch(text(safety(tree)), /Stale cache/);
  tree = x.h.render({ tripOptions: [next] });
  assert.deepEqual(optionValues(find(safety(tree), 'select')), ['paris-trip']);
  assert.deepEqual(optionValues(journalTripSelect(tree)), ['', 'paris-trip']);
  assert.equal(find(safety(tree), 'TravelAssistant').props.initialCountry, 'FR');
  assert.deepEqual(x.tripReads, []);assert.deepEqual(x.snapshotWrites, [], 'Receiving a supplied list does not overwrite the offline snapshot');
  tree = x.h.render({ tripOptions: [] });
  assert.equal(find(safety(tree), 'select'), undefined);
  assert.equal(journalTripSelect(tree), undefined);
  assert.equal(find(safety(tree), 'TravelAssistant').props.initialCountry, '');
  assert.deepEqual(x.tripReads, [], 'An explicitly empty list is authoritative and must not reload stale cached trips');
  x.h.render({ tripOptions: undefined });
  assert.deepEqual(x.tripReads, [['a', 'token-a', true]], 'Standalone use retains its existing authenticated loading path');
  await Promise.resolve();x.h.render();
 } finally { x.h.dispose(); }
});

test('World-map edit uses the visited-editor intent, closes the map and retains a profile fallback', () => {
 const calls = [], x = journeyHub({ initialTool: 'map', toolRequestId: 10, onEditVisitedCountries: () => calls.push('visited-editor') });
 const map = view => find(view, 'Sheet', props => props.title === 'My world map');
 const edit = view => find(map(view), 'button', props => text(props.children).includes('Edit visited countries'));
 try {
  let tree = x.tree;
  assert.equal(map(tree).props.open, true);
  const worldMap = find(map(tree), 'WorldMap');
  assert.equal(worldMap.props.statusFor('TUR'), 'free'); assert.equal(worldMap.props.statusFor('FRA'), 'unknown');
  edit(tree).props.onClick(); tree = x.h.render();
  assert.deepEqual(calls, ['visited-editor']); assert.deepEqual(x.calls, [], 'Explicit edit intent replaces general Profile navigation');
  assert.equal(map(tree).props.open, false);
  assert.equal(map(x.h.render({ toolRequestId: 10 })).props.open, false, 'A consumed request does not immediately reopen the map');
  tree = x.h.render({ toolRequestId: 11, onEditVisitedCountries: undefined });
  assert.equal(map(tree).props.open, true); edit(tree).props.onClick(); tree = x.h.render();
  assert.equal(map(tree).props.open, false); assert.deepEqual(calls, ['visited-editor']); assert.deepEqual(x.calls, ['navigate:profile']);
 } finally { x.h.dispose(); }
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

test('Unreadable saved routes do not crash search, retry keeps the query and a failed click never navigates', () => {
 const h = hooks(), d = device(), calls = []; let unreadable = true;
 const load = loader(d.globals, { ...shared('en'), react: h.react,
  '../lib/storage': { getSavedRoutePlans: () => { if(unreadable)throw Error('Outbox unavailable'); return [route('kept-route','Paris')]; } },
  '../lib/supabaseData': { listCockpitTrips: () => { throw Error('No account request for guest'); } },
 });
 const { GlobalSearchSheet } = load('mobile/src/components/GlobalSearchSheet.tsx');
 let tree; assert.doesNotThrow(() => { tree = h.start(GlobalSearchSheet, { open:true, initialQuery:'Paris', onClose:()=>calls.push('close'), onOpenSavedRoute:id=>calls.push(id), onSearchDestination:()=>{}, onOpenCountry:()=>{}, onOpenTrip:()=>{}, onOpenTool:()=>{}, onNavigate:()=>{} }); });
 assert.ok(find(tree,'strong',props=>text(props.children)==='Paris'),'The public catalogue is still available');
 assert.match(text(tree),/saved routes could not be read/);
 find(tree,'button',props=>text(props.children)==='Saved routes').props.onClick(); tree=h.render();
 assert.doesNotMatch(text(tree),/No results\. Try another word or category/,'Read failure is not an empty collection');
 unreadable=false; find(tree,'button',props=>text(props.children)==='Read saved routes again').props.onClick(); tree=h.render();
 assert.equal(find(tree,'input').props.value,'Paris'); assert.equal(find(tree,'button',props=>text(props.children)==='Saved routes').props['aria-pressed'],true);
 assert.doesNotMatch(text(tree),/saved routes could not be read/);
 const result=find(tree,'button',props=>text(props.children).startsWith('Paris'));
 unreadable=true; assert.doesNotThrow(()=>result.props.onClick()); tree=h.render();
 assert.deepEqual(calls,[]); assert.match(text(tree),/saved routes could not be read/);
 unreadable=false; find(tree,'button',props=>text(props.children)==='Read saved routes again').props.onClick(); tree=h.render();
 find(tree,'button',props=>text(props.children).startsWith('Paris')).props.onClick();
 assert.deepEqual(calls,['close','kept-route']); h.dispose();
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
 find(tree, 'button', props => props['aria-label'] === 'Money: drag or use up/down arrow keys to reorder').props.onKeyDown({key:'ArrowUp',preventDefault(){}}); tree = h.render();
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
 const nav = find(tree, 'nav', props => props['aria-label'] === 'Plan your journey'), shortcuts = nodes(nav).filter(node => node.type === 'button');
 const labels = ['Translate', 'Money', 'My trips'];
 for (const className of ['rh-shortcut-full', 'rh-shortcut-compact']) {
  assert.deepEqual(shortcuts.map(node => text(find(node, 'span', props => props.className === className))), labels, 'Custom tools keep their own name at either screen width');
 }
 for (const [index, button] of shortcuts.entries()) {
  const caption = text(find(button, 'small'));
  assert.ok(caption);
  assert.equal(button.props['aria-label'], `${labels[index]} — ${caption}`);
  button.props.onClick();
 }
 assert.deepEqual(calls.splice(0), ['translate', 'money', 'cockpit']);
 find(tree, 'input', props => props.id === 'home-destination-search').props.onChange({ target: { value: '  currency  ' } }); tree = h.render();
 find(tree, 'form').props.onSubmit({ preventDefault() {} }); assert.deepEqual(calls.splice(0), ['global:currency']);
 find(tree, 'button', props => props['aria-label'] === 'Paris').props.onClick(); assert.deepEqual(calls, ['city:Paris']); h.dispose();
});

test('Home autocomplete opens the exact journal, world map and help target rather than their parent screen', () => {
 const h = hooks(), d = device(), calls = [];
 const { HomeScreen } = loader(d.globals, {
  ...shared('en'), react: h.react, '../components/Icon': { Icon: 'Icon' }, '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
  '../components/HomeShortcutPicker': { HomeShortcutPicker: 'HomeShortcutPicker' }, '../lib/supabaseData': { listCockpitTrips: () => { throw Error('No account API call for guest'); } },
 })('mobile/src/screens/HomeScreen.tsx');
 let tree = h.start(HomeScreen, { user: null, onNavigate: view => calls.push(`generic:${view}`),
  onOpenJourneyTool: tool => calls.push(`journey:${tool}`), onOpenGuide: () => calls.push('guide'),
  onOpenCommunity() {}, onBuildRoute() {}, onSurprise() {}, onNotice() {},
 });
 for (const [query, target] of [['journal', 'journey:journal'], ['world map', 'journey:map'], ['how to use', 'guide']]) {
  find(tree, 'input', props => props.id === 'home-destination-search').props.onChange({ target: { value: query } }); tree = h.render();
  const option = nodes(tree).find(node => node.props?.role === 'option' && text(node).startsWith(search(query, 'en', [], 'tool').find(item => item.guide || item.journeyTool).title));
  assert.ok(option); option.props.onClick(); tree = h.render();
  assert.deepEqual(calls.splice(0), [target]);
 }
 h.dispose();
});

function categorySheet(locale, initial = {}, trips = null) {
 const h = hooks(), d = device(), requests = [], calls = [];
 const load = loader(d.globals, { ...shared(locale), react: h.react, '../lib/storage': { getSavedRoutePlans: () => [] }, '../lib/supabaseData': { listCockpitTrips: (...args) => trips || new Promise((resolve, reject) => requests.push({ args, resolve, reject })) } });
 const { GlobalSearchSheet } = load('mobile/src/components/GlobalSearchSheet.tsx');
 const tree = h.start(GlobalSearchSheet, { open: true, initialQuery: 'etkinlik', onClose: () => calls.push('close'), onOpenTrip: id => calls.push(id), onOpenSavedRoute: id => calls.push(id), onOpenCountry: id => calls.push(id), onSearchDestination: query => calls.push(`city:${query}`), onOpenTool: tool => calls.push(tool), onNavigate: view => calls.push(view), ...initial });
 return { h, requests, calls, tree };
}
const pick = (tree, label) => find(tree, 'button', props => text(props.children) === label);
test('City search opens the exact catalogue destination and keeps generic cities on the discovery path', () => {
 for (const locale of ['tr', 'en', 'sq', 'ro']) {
  const opened = [];
  const { h, calls, tree } = categorySheet(locale, { initialQuery: 'Strasbourg', onOpenCity: code => opened.push(code) });
  const result = find(tree, 'button', props => /Strazburg|Strasbourg|Strasburgu|Strasburg/.test(text(props.children)) && !props.className?.includes('plan-place'));
  assert.ok(result, `${locale}: the existing catalogue city must have a result`);
  assert.ok(find(result, 'img'), 'Use the destination photo, not the app logo');
  result.props.onClick(); assert.deepEqual(opened, ['SXB']); assert.deepEqual(calls, ['close']); h.dispose();
 }
 const { h, calls, tree } = categorySheet('en', { initialQuery: 'Tbilisi' });
 const generic = find(tree, 'button', props => text(props.children).startsWith('Tbilisi'));
 assert.ok(generic); generic.props.onClick(); assert.deepEqual(calls, ['close', 'city:Tbilisi']); h.dispose();
});
const widenLabels = { tr: ['Şehirler', 'Tüm kategorilerde ara', 'Bu kategoride sonuç yok. Diğer kategorilerde sonuçlar var.'], en: ['Cities', 'Search all categories', 'No results in this category. There are results in other categories.'], sq: ['Qytetet', 'Kërko në të gjitha kategoritë', 'Nuk ka rezultate në këtë kategori. Ka rezultate në kategori të tjera.'] };

test('Empty category offers search in all categories, keeps the word and stays on the same screen', () => {
 const { h, calls } = categorySheet('tr');
 let tree = pick(h.render(), 'Şehirler'); assert.equal(find(h.render(), 'button', props => props.className === 'global-search-widen'), undefined, 'Not shown while the category has not been chosen');
 tree.props.onClick(); tree = h.render();
 assert.match(text(tree), /Bu kategoride sonuç yok\. Diğer kategorilerde sonuçlar var\./);
 const widen = find(tree, 'button', props => props.className === 'global-search-widen'); assert.equal(text(widen.props.children), 'Tüm kategorilerde ara');
 widen.props.onClick(); tree = h.render();
 assert.equal(find(tree, 'input').props.value, 'etkinlik', 'Only the category filter is removed');
 assert.equal(find(tree, 'button', props => props.className === 'global-search-widen'), undefined);
 assert.equal(find(tree, 'button', props => text(props.children) === 'Tümü').props['aria-pressed'], true);
 assert.deepEqual(calls, [], 'No automatic navigation or close');
 find(tree, 'button', props => text(props.children).startsWith('Etkinlik Radarı')).props.onClick();
 assert.deepEqual(calls, ['close', 'events']); h.dispose();
});

test('Category recovery text is localized in Turkish, English and Albanian', () => {
 for (const [locale, [category, button, note]] of Object.entries(widenLabels)) {
  const { h } = categorySheet(locale, { initialQuery: locale === 'sq' ? 'radar' : locale === 'en' ? 'event' : 'etkinlik' });
  pick(h.render(), category).props.onClick(); const tree = h.render();
  assert.ok(text(tree).includes(note), locale); assert.equal(text(find(tree, 'button', props => props.className === 'global-search-widen').props.children), button, locale); h.dispose();
 }
});

test('Recovery is hidden for empty input, no matches anywhere and when the category has results', () => {
 for (const [query, filter] of [['', 'city'], ['   ', 'city'], ['an unsupported imaginary place', 'city'], ['Paris', 'city']]) {
  const { h } = categorySheet('en', { initialQuery: query }); pick(h.render(), 'Cities').props.onClick();
  assert.equal(find(h.render(), 'button', props => props.className === 'global-search-widen'), undefined, `${filter}:${query}`); h.dispose();
 }
});

test('Saved-trip loading, failure and sign-in states are not treated as an empty category', async () => {
 const hidden = tree => assert.equal(find(tree, 'button', props => props.className === 'global-search-widen'), undefined);
 let { h, requests } = categorySheet('en', { ownerId: 'a', accessToken: 'token-a', initialQuery: 'Paris' });
 pick(h.render(), 'Saved trips').props.onClick(); let tree = h.render(); assert.match(text(tree), /Loading your saved trips/); hidden(tree);
 requests[0].reject(Error('offline')); await settle(); tree = h.render(); assert.match(text(tree), /could not be loaded/); hidden(tree);
 pick(tree, 'Try again').props.onClick(); h.render(); requests[1].resolve([]); await settle(); tree = h.render();
 assert.match(text(tree), /There are results in other categories/, 'A loaded account with no matching trip does offer all categories');
 h.dispose();
 ({ h } = categorySheet('en', { initialQuery: 'Paris' })); pick(h.render(), 'Saved trips').props.onClick(); tree = h.render();
 assert.match(text(tree), /Sign in to search your saved trips/); hidden(tree); h.dispose();
});

test('Another account trips never create a recovery option', async () => {
 const { h, requests } = categorySheet('en', { ownerId: 'b', accessToken: 'token-b', initialQuery: 'Private' });
 requests[0].resolve([trip('foreign', 'a', 'Private Alpha Harbor')]); await settle();
 pick(h.render(), 'Saved trips').props.onClick(); const tree = h.render();
 assert.equal(find(tree, 'button', props => props.className === 'global-search-widen'), undefined); assert.doesNotMatch(text(tree), /Private Alpha Harbor/); h.dispose();
});

test('Search sheet keeps one localized clear control that clears the query and restores input focus', () => {
 assert.match(readFileSync('mobile/src/components/global-search.css', 'utf8'), /input::-webkit-search-cancel-button[^{]*\{[^}]*display: none/);
 for (const [locale, label] of [['tr', 'Aramayı temizle'], ['en', 'Clear search'], ['sq', 'Pastro kërkimin']]) {
  const { h, calls } = categorySheet(locale, { initialQuery: 'Paris' });
  try {
   let tree = h.render(), focused = 0;
   const field = find(tree, 'div', props => props.className === 'global-search-field');
   const controls = nodes(field).filter(node => node.type === 'button');
   assert.equal(controls.length, 1);
   assert.equal(controls[0].props['aria-label'], label);
   find(field, 'input').props.ref.current = { focus: () => focused++ };
   controls[0].props.onClick(); tree = h.render();
   assert.equal(find(tree, 'input').props.value, '');
   assert.equal(nodes(find(tree, 'div', props => props.className === 'global-search-field')).filter(node => node.type === 'button').length, 0);
   assert.equal(focused, 1);
   assert.deepEqual(calls, [], 'Clearing stays in search without navigation');
  } finally { h.dispose(); }
 }
});

test('An unknown city keeps a planning exit and passes the searched name or chosen geographic area without generating a plan', () => {
 for(const locale of ['tr','en','sq']){
  const planned=[];const h=categorySheet(locale,{initialQuery:'  Novi Sad  ',onPlanPlace:(...args)=>planned.push(args)});
  try{
   let tree=h.h.render();const fallback=find(tree,'DestinationSearchFallback');assert.ok(fallback);assert.equal(fallback.props.query,'  Novi Sad  ');
   find(tree,'button',props=>props.className==='global-search-plan-place').props.onClick();assert.deepEqual(h.calls,['close']);assert.deepEqual(planned,[['Novi Sad',undefined]]);
   const area={name:'Novi Sad',latitude:45.267,longitude:19.834,countryCode:'RS'};
   fallback.props.onPlanPlace('Novi Sad',area);assert.equal(planned[1][1],area);assert.equal(planned[1][0],'Novi Sad');assert.deepEqual(h.calls,['close','close']);
  }finally{h.h.dispose();}
 }
});

test('Place planning fallback is not shown for private saved-item categories or an empty query', () => {
 const h=categorySheet('en',{initialQuery:'Novi Sad'});try{
  for(const label of ['Saved trips','Saved routes','Tools']){pick(h.h.render(),label).props.onClick();assert.equal(find(h.h.render(),'DestinationSearchFallback'),undefined,label);}
  h.h.render({initialQuery:''});assert.equal(find(h.h.render(),'DestinationSearchFallback'),undefined);
 }finally{h.h.dispose();}
});
