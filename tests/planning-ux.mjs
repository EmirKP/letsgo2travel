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
    if (name === '../lib/accountResume') return { onAccountResume: () => () => {} };
    if (name === './accountCollections') return load('mobile/src/lib/accountCollections.ts', {'./id': load('mobile/src/lib/id.ts')}, environment);
    if (name === '../lib/localeFormatting') return localeFormatting;
    if (name === '../lib/routeCockpitIntent') return load('mobile/src/lib/routeCockpitIntent.ts');
    if (name === '../lib/savedRouteIdentity') return load('mobile/src/lib/savedRouteIdentity.ts', {'./id': load('mobile/src/lib/id.ts')});
    if (name === '../../../lib/planner-preferences' || name === './planner-preferences') return load('lib/planner-preferences.ts');
    if (name === '../components/RouteBudgetAnalysis') return { RouteBudgetAnalysis: 'RouteBudgetAnalysis' };
    if (name.endsWith('.css')) return {};
    throw Error(`Missing fixture import: ${name}`);
  }, testModule, testModule.exports);
  return testModule.exports;
}
const localeFormatting = load('mobile/src/lib/localeFormatting.ts', {
  './locales/sq-regions': load('mobile/src/lib/locales/sq-regions.ts'),
});
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
const homeJourney = load('mobile/src/lib/homeJourney.ts');
const routeCatalog = load('mobile/src/data/routes.ts');
const homeData = load('mobile/src/data/homeDestinations.ts', { './routes': routeCatalog });
const homeAssets = Object.fromEntries([
  '../assets/home-reference/santorini-hero.webp', '../assets/home-reference/coastal-banner.webp',
  '../assets/home-reference/cappadocia.webp', '../assets/home-reference/bali.webp',
  '../assets/home-reference/community-travelers.webp', '../assets/destination-artwork/rome.webp',
].map(path => [path, { default: path }]));
function loadHome(host, { locale = 'en', listCockpitTrips = () => { throw Error('Guest Home must not request account trips'); } } = {}) {
  return load('mobile/src/screens/HomeScreen.tsx', {
    ...common(host), ...homeAssets,
    '../lib/i18n': { useI18n: () => ({ locale, dateLocale: locale === 'tr' ? 'tr-TR' : 'en-GB', copy: (tr, en) => locale === 'tr' ? tr : en }) },
    '../components/Icon': { Icon: 'Icon' }, '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
    '../components/HomeShortcutPicker': { HomeShortcutPicker: 'HomeShortcutPicker' },
    '../hooks/useHomeShortcuts': { useHomeShortcuts: () => ({ views: ['route', 'explore', 'passport', 'trips', 'companion'], save: () => true }) },
    '../lib/appTools': load('mobile/src/lib/appTools.ts'),
    '../components/BrandMark': { BrandMark: 'BrandMark' },
    '../data/homeDestinations': homeData, '../lib/supabaseData': { listCockpitTrips },
    '../lib/dates': { localIsoDate: () => '2026-09-28' }, '../lib/homeJourney': homeJourney,
  }).HomeScreen;
}
const guestHomeProps = { user: null, ownerId: null, accessToken: '', onNavigate() {}, onOpenCommunity() {}, onSurprise() {}, onBuildRoute() {}, onNotice() {} };
const personalBanner = view => find(view, 'section', props => props['aria-labelledby'] === 'rh-personal-title');

test('Home prioritises an active trip, ignores past upcoming/cancelled trips and leaves the list untouched', () => {
  const trips = [
    {id:'later',status:'upcoming',startDate:'2026-11-01',endDate:'2026-11-03'},
    {id:'past',status:'upcoming',startDate:'2026-08-01',endDate:'2026-08-03'},
    {id:'cancelled',status:'cancelled',startDate:'2026-09-28',endDate:'2026-10-03'},
    {id:'soon',status:'upcoming',startDate:'2026-10-01',endDate:'2026-10-03'},
    {id:'active',status:'active',startDate:'2026-09-27',endDate:'2026-09-29'},
  ];
  const before = JSON.stringify(trips);
  assert.equal(homeJourney.nextHomeJourney(trips,'2026-09-28').id,'active');
  assert.equal(homeJourney.nextHomeJourney(trips.filter(trip=>trip.id!=='active'),'2026-09-28').id,'soon');
  assert.equal(JSON.stringify(trips),before);
});
test('Home next step uses personal checklist and travel dates without reading provider flight data', () => {
  const trip={status:'upcoming',startDate:'2026-10-01',endDate:'2026-10-05',checklistItems:[{id:'event',kind:'event',label:'Concert',completed:false},{id:'passport',label:'Passport',completed:true},{id:'packing',label:'Pack',completed:false}],get providerFlight(){throw Error('Provider data must not be read');}};
  const preparing=homeJourney.homeJourneyStep(trip,'2026-09-28');
  assert.equal(preparing.stage,'preparing');assert.equal(preparing.total,2);assert.equal(preparing.completed,1);assert.equal(preparing.nextItem.id,'packing');
  assert.equal(homeJourney.homeJourneyStep(trip,'2026-10-01').stage,'travelling');
  assert.equal(homeJourney.homeJourneyStep(trip,'2026-10-06').stage,'wrap-up');
});

test('Home rejects an old account response and opens the precise current trip from its next step', async () => {
  const host=hooks(), requests=new Map(), opened=[], reads=[];
  const HomeScreen=loadHome(host,{listCockpitTrips:(...args)=>{reads.push(args);return new Promise(resolve=>requests.set(args[0],resolve));}});
  try {
    host.start(HomeScreen,{user:{id:'a'},ownerId:'a',accessToken:'FIXTURE',onOpenTrip:id=>opened.push(id),onNavigate(){},onOpenCommunity(){},onSurprise(){},onBuildRoute(){},onNotice(){}});
    assert.match(text(host.render()),/Getting your trip ready/);
    host.render({ownerId:'b',user:{id:'b'}});
    const makeTrip=(id,country)=>({id,status:'upcoming',destinationCountry:country,destinationCity:null,startDate:'2026-10-01',endDate:'2026-10-04',checklistItems:[{id:'packing',label:'Pack suitcase',completed:false}],get providerFlight(){throw Error('Home must not read retained provider details');}});
    requests.get('a')([makeTrip('trip-a','Private account A')]);await tick();assert.doesNotMatch(text(host.render()),/Private account A/);
    requests.get('b')([makeTrip('trip-b','Italy')]);await tick();const view=host.render();
    assert.match(text(personalBanner(view)),/Italy/);assert.match(text(personalBanner(view)),/0\/1 tasks ready/);
    button(personalBanner(view),'Open My Trip').props.onClick();assert.deepEqual(opened,['trip-b']);
    assert.deepEqual(reads,[['a','FIXTURE'],['b','FIXTURE']], 'Home must use personal trip reads without opting into provider detail enrichment');
    host.render({ownerId:null,user:null,accessToken:''});
    assert.doesNotMatch(text(personalBanner(host.render())),/Italy|Pack suitcase|tasks ready/);
    assert.ok(button(personalBanner(host.render()),'Get Started'));
  } finally {host.dispose();}
});

test('Home guest CTA and five translated shortcuts open their real destinations without account data', () => {
  for (const locale of ['en', 'tr']) {
    const host=hooks(), opened=[], communities=[];
    try {
      const HomeScreen=loadHome(host,{locale});
      const view=host.start(HomeScreen,{...guestHomeProps,onNavigate:value=>opened.push(value),onOpenCommunity:()=>communities.push('community')});
      button(personalBanner(view),locale==='en'?'Get Started':'Hemen Başla').props.onClick();
      const nav=find(view,'nav',props=>props['aria-label']===(locale==='en'?'Plan your journey':'Seyahatini planla'));
      const labels=locale==='en'?['Build a Route','Explore Countries','Passport & Visa','My Trips','All Tools']:['Rota Oluştur','Ülke Keşfet','Pasaport & Vize','Seyahatlerim','Tüm Araçlar'];
      for (const label of labels) {
        const shortcut=find(nav,'button',props=>text(find({props},'strong'))===label);
        assert.ok(shortcut,`Missing translated shortcut: ${label}`);shortcut.props.onClick();
      }
      assert.deepEqual(opened,['route','route','explore','passport','trips','companion']);
      button(view,locale==='en'?'Join the Community':'Topluluğa Katıl').props.onClick();
      assert.deepEqual(communities,['community']);
    } finally {host.dispose();}
  }
});

test('Home restores the submitted search and forwards trimmed typed queries and visible city shortcuts', () => {
  const host=hooks(), queries=[];
  try {
    host.start(loadHome(host),{...guestHomeProps,initialSearchQuery:'Bali',onSearchDestination:value=>queries.push(value)});
    let view=host.render();const field=find(view,'input',props=>props.type==='search');
    assert.equal(field.props.value,'Bali');
    assert.ok(find(view,'label',props=>props.htmlFor===field.props.id),'Search input has a visible or screen-reader label');
    field.props.onChange({target:{value:'  Roma  '}});view=host.render();
    let prevented=0;find(view,'form',props=>props.role==='search').props.onSubmit({preventDefault(){prevented++;}});
    button(view,'Rome').props.onClick();button(view,'Bali').props.onClick();
    assert.equal(prevented,1);assert.deepEqual(queries,['Roma','Roma','Bali']);
  } finally {host.dispose();}
});

test('Home opens and saves each real destination independently with matching artwork and accurate saved state', () => {
  for (const locale of ['en','tr']) {
    const host=hooks(), opened=[], saved=[];
    try {
      let view=host.start(loadHome(host,{locale}),{...guestHomeProps,savedRouteIds:['NAV'],onBuildRoute:value=>opened.push(value),onToggleSaved:value=>saved.push(value)});
      const expected=homeData.homeDestinations(locale);
      assert.deepEqual(Array.from(expected,item=>item.destinationCode),['JTR','NAV','DPS','FCO']);
      const images=['santorini-hero.webp','cappadocia.webp','bali.webp','rome.webp'];
      for (const [index,route] of expected.entries()) {
        const openLabel=locale==='en'?`Open ${route.cityOrRegion} route`:`${route.cityOrRegion} rotasını aç`;
        const saveLabel=locale==='en'?`Save ${route.cityOrRegion} route`:`${route.cityOrRegion} rotasını kaydet`;
        const card=find(view,'article',props=>Boolean(find({props},'button',item=>item['aria-label']===openLabel)));
        assert.ok(card,`Missing route card: ${route.destinationCode}`);
        assert.ok(find(card,'img').props.src.endsWith(images[index]),'The route photo must match its destination');
        const favorite=find(card,'button',props=>props['aria-label']===saveLabel);
        assert.equal(favorite.props['aria-pressed'],route.destinationCode==='NAV');
        favorite.props.onClick();assert.equal(opened.length,index,'Saving must not open the planner');
        find(card,'button',props=>props['aria-label']===openLabel).props.onClick();
        assert.equal(opened[index],saved[index],'Open and save must receive the same card data');
        assert.deepEqual(opened[index],route);assert.ok(route.dailyPlan.length>0);
        assert.equal(route.verifiedEntryStatus,'unknown');
      }
      assert.equal(saved.length,4);assert.equal(opened.length,4);
      view=host.render({savedRouteIds:['JTR']});
      const pressed=nodes(view).filter(node=>node.type==='button'&&node.props['aria-pressed']===true);
      assert.equal(pressed.length,1);assert.match(pressed[0].props['aria-label'],/Santorini/);
    } finally {host.dispose();}
  }
});

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
const destinationPlans = load('lib/route-planner.ts');
function plannerHarness({ seeded = true, account = false, syncFails = false, storageFails = false, locale = 'en' } = {}) {
  const host = hooks(), saves = [], navigations = [], notices = [], generated = [];
  let generationFailure = null, generationResponse;
  const fixtureWindow = new EventTarget(); Object.assign(fixtureWindow, {matchMedia: () => ({matches: reducedMotion})});
  const { RouteAssistantScreen } = load('mobile/src/screens/RouteAssistantScreen.tsx', {
    '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
    '../components/RequestFailure': { RequestFailure: 'RequestFailure' },
    ...common(host), '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en }) }, '../../../lib/route-planner': destinationPlans, '../components/AirportField': { AirportField: 'AirportField' }, '../components/Icon': { Icon: 'Icon' }, '../components/PageHero': { PageHero: 'PageHero' },
    '../data/artwork': { destinationArtwork: code => code }, '../data/routes': { routeByDestinationCode: code => ({ ...route, destinationCode: code }), createFallbackPlan: () => ({ summary: 'Offline ideas', routes: [route] }) },
    '../lib/api': { generateRoutePlan: async input => { generated.push(input); if (generationFailure) throw generationFailure; if (generationResponse !== undefined) return generationResponse; return { data: { summary: 'Your suggestions', routes: [route, { ...route, name: 'Paris', destinationCode: 'CDG' }] } }; } },
    '../lib/native': { hapticSuccess: async () => {}, openExternal: async () => {} }, '../lib/plannerState': snapshots,
    '../lib/routeSync': { syncRoutePlan: async () => { if (syncFails) throw Error('offline'); } },
    '../lib/routeOutbox': { readRouteOutbox: () => syncFails && saves.length ? { [saves[0].id]: { kind: 'save', pending: true } } : {} },
    '../lib/storage': { getSavedRoutePlans: () => [...saves], saveRoutePlan: value => { if (storageFails) throw Error('quota'); saves.push(value); return [...saves].reverse(); } },
    '../lib/supabaseData': { getSupabaseDataErrorMessage: (_error, fallback) => fallback },
  }, {window: fixtureWindow});
  host.start(RouteAssistantScreen, { onNotice: message => notices.push(message), onNavigate: view => navigations.push(view), surpriseRoute: seeded ? route : null, routeSeedKind: 'explore', ownerId: account ? 'fixture-owner' : null, accessToken: account ? 'UNIT_TEST_ONLY' : '' });
  return { host, saves, navigations, notices, generated, fixtureWindow, failGeneration: error => { generationFailure = error; }, respondGeneration: response => { generationFailure = null; generationResponse = response; } };
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

test('A network generation failure retains form choices and the edited previous plan, then retries the same request', async () => {
  const h = plannerHarness({ seeded: false });
  try {
    const view = () => h.host.render();
    const duration = () => find(find(view(), 'label', props => text(props.children).startsWith('How many days?')), 'select');
    find(view(), 'AirportField', props => props.label === 'From?').props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Türkiye', countryCode: 'TR' });
    duration().props.onChange({ target: { value: '7' } });
    button(view(), 'Create Route').props.onClick(); await tick();
    button(view(), 'Edit').props.onClick();
    find(find(view(), 'label', props => text(props.children).startsWith('New stop')), 'textarea').props.onChange({ target: { value: 'Evening museum visit with friends' } });
    button(view(), 'Add stop').props.onClick(); button(view(), 'Apply changes').props.onClick();
    const before = JSON.parse(JSON.stringify(find(view(), 'RouteBudgetAnalysis').props));
    assert.equal(before.route.dailyPlan.at(-1), 'Evening museum visit with friends');
    button(view(), 'Edit').props.onClick();
    find(find(view(), 'label', props => text(props.children).startsWith('New stop')), 'textarea').props.onChange({ target: { value: 'Still editing a late dinner stop' } });
    duration().props.onChange({ target: { value: '8' } });
    h.failGeneration(new TypeError('Failed to fetch'));
    button(view(), 'Create Route').props.onClick(); await tick();
    const failed = view(), retry = find(failed, 'RequestFailure');
    assert.ok(retry); assert.equal(retry.props.draftsKept, true); assert.equal(retry.props.busy, false);
    assert.match(retry.props.message, /current plan and choices are unchanged/); assert.doesNotMatch(retry.props.message, /Failed to fetch/);
    assert.deepEqual(JSON.parse(JSON.stringify(find(failed, 'RouteBudgetAnalysis').props)), before);
    assert.equal(find(find(failed, 'label', props => text(props.children).startsWith('New stop')), 'textarea').props.value, 'Still editing a late dinner stop');
    assert.equal(duration().props.value, 8); assert.equal(find(failed, 'AirportField', props => props.label === 'From?').props.value.iata, 'IST');
    h.failGeneration(null); retry.props.onRetry(); retry.props.onRetry(); await tick();
    assert.equal(h.generated.length, 3, 'The retry is deduplicated during the pending request');
    assert.deepEqual(h.generated[2], h.generated[1], 'Retry keeps the entered destination, duration and preferences');
    assert.equal(find(view(), 'RequestFailure'), undefined);
    assert.equal(find(view(), 'div', props => props.className === 'planner-stop-editor'), undefined, 'A valid deliberate replacement closes the old editor');
  } finally { h.host.dispose(); }
});

test('Fallback, invalid, empty and wrong-destination responses retain applied edits, open editor and original plan preferences', async () => {
  const failures = [
    { label: 'server fallback', response: { isFallback: true, data: { summary: 'Unrelated fallback', routes: [route] } } },
    { label: 'invalid response', response: { data: null } },
    { label: 'missing routes', response: { data: { summary: 'No routes' } } },
    { label: 'empty response', response: { data: { summary: 'Empty', routes: [] } } },
    { label: 'explicit failure', response: { success: false, data: { summary: 'Not successful', routes: [route] } } },
    { label: 'wrong fixed destination', fixed: true, response: { data: { summary: 'Wrong target', routes: [{ ...route, name: 'Bodrum', cityOrRegion: 'Bodrum', destinationCode: 'BJV' }] } } },
  ];
  for (const failure of failures) {
    const h = plannerHarness({ seeded: false });
    try {
      const view = () => h.host.render();
      find(view(), 'AirportField', props => props.label === 'From?').props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Türkiye', countryCode: 'TR' });
      if (failure.fixed) {
        find(view(), 'button', props => text(props.children).startsWith('I know where to go')).props.onClick();
        find(view(), 'AirportField', props => props.label === 'To?').props.onChange({ iata: 'FCO', city: 'Rome', name: 'Rome Airport', country: 'Italy', countryCode: 'IT' });
        h.respondGeneration({ data: { summary: 'Original fixed plan', routes: [route] } });
      }
      button(view(), 'Create Route').props.onClick(); await tick();
      button(view(), 'Edit').props.onClick();
      find(find(view(), 'label', props => text(props.children).startsWith('New stop')), 'textarea').props.onChange({ target: { value: 'My saved-in-plan personal stop' } });
      button(view(), 'Add stop').props.onClick(); button(view(), 'Apply changes').props.onClick();
      const originalBudget = JSON.parse(JSON.stringify(find(view(), 'RouteBudgetAnalysis').props));
      button(view(), 'Edit').props.onClick();
      const stop = find(find(view(), 'label', props => text(props.children).startsWith('Stop 1')), 'textarea');
      stop.props.onChange({ target: { value: 'Not-yet-applied first stop' } });
      find(find(view(), 'label', props => text(props.children).startsWith('New stop')), 'textarea').props.onChange({ target: { value: 'Not-yet-added new stop' } });
      find(find(view(), 'label', props => text(props.children).startsWith('How many days?')), 'select').props.onChange({ target: { value: '9' } });
      h.respondGeneration(failure.response); button(view(), 'Create Route').props.onClick(); await tick();
      const failed = view(), retry = find(failed, 'RequestFailure');
      assert.ok(retry, failure.label); assert.match(retry.props.message, /current plan and choices are unchanged/);
      assert.deepEqual(JSON.parse(JSON.stringify(find(failed, 'RouteBudgetAnalysis').props)), originalBudget, failure.label);
      assert.equal(find(find(failed, 'label', props => text(props.children).startsWith('Stop 1')), 'textarea').props.value, 'Not-yet-applied first stop', failure.label);
      assert.equal(find(find(failed, 'label', props => text(props.children).startsWith('New stop')), 'textarea').props.value, 'Not-yet-added new stop', failure.label);
      assert.equal(find(find(failed, 'label', props => text(props.children).startsWith('How many days?')), 'select').props.value, 9);
      h.respondGeneration({ success: true, data: { summary: 'A genuine new response', routes: [{ ...route, dailyPlan: ['New generated museum itinerary'] }] } });
      retry.props.onRetry(); await tick();
      const replaced = view(); assert.equal(find(replaced, 'RequestFailure'), undefined); assert.equal(find(replaced, 'div', props => props.className === 'planner-stop-editor'), undefined);
      assert.equal(find(replaced, 'RouteBudgetAnalysis').props.route.dailyPlan[0], 'New generated museum itinerary');
      assert.equal(find(replaced, 'RouteBudgetAnalysis').props.input.dayCount, 9);
    } finally { h.host.dispose(); }
  }
});

test('An initial failed or fallback request still provides a clearly labeled local starter and an actionable retry', async () => {
  for (const response of [{ isFallback: true, data: { summary: 'Server sample', routes: [route] } }, { data: null }, { data: { routes: [] } }]) {
    const h = plannerHarness({ seeded: false });
    try {
      find(h.host.render(), 'AirportField', props => props.label === 'From?').props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul Airport' });
      h.respondGeneration(response); button(h.host.render(), 'Create Route').props.onClick(); await tick();
      const view = h.host.render(); assert.match(text(view), /Starter outline/); assert.ok(find(view, 'RouteBudgetAnalysis'));
      const retry = find(view, 'RequestFailure'); assert.ok(retry); assert.match(retry.props.message, /prepared a starter outline/); assert.equal(retry.props.busy, false);
      assert.ok(!h.notices.includes('Your suggestions are ready.'), 'A failed generation must not claim new suggestions succeeded');
    } finally { h.host.dispose(); }
  }
});

test('Choosing a ready route records its displayed duration without rewriting alternative-search preferences', async () => {
  const h = plannerHarness({ seeded: false });
  try {
    const gallery = find(h.host.render(), 'div', props => props.className === 'planner-photo-grid');
    find(gallery, 'button').props.onClick();
    button(selected(h.host.render()), 'Save this plan').props.onClick(); await tick();
    assert.equal(h.saves[0].input.days, route.idealDuration);
    button(h.host.render(), 'Find other route ideas').props.onClick();
    const duration = nodes(h.host.render()).find(node => node.type === 'label' && text(node).startsWith('How many days?'));
    assert.equal(find(duration, 'select').props.value, 5, 'Choosing a sample must not overwrite the independent search form');
  } finally { h.host.dispose(); }
});

test('Fixed-target mode requires a destination, preserves it on a mismatched response, and saves itinerary edits', async () => {
  const h = plannerHarness({ seeded: false });
  try {
    const view = () => h.host.render();
    find(view(), 'button', props => text(props.children).startsWith('I know where to go')).props.onClick();
    find(view(), 'AirportField', props => props.label === 'From?').props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Türkiye', countryCode: 'TR' });
    assert.equal(button(view(), 'Create Route').props.disabled, false);
    button(view(), 'Create Route').props.onClick();
    assert.equal(h.generated.length, 0);
    assert.equal(find(view(), 'AirportField', p => p.label === 'To?').props.error, 'Choose your destination city.');
    find(view(), 'AirportField', props => props.label === 'To?').props.onChange({ iata: 'BJV', city: 'Bodrum', name: 'Milas Bodrum Airport', country: 'Türkiye', countryCode: 'TR' });
    assert.equal(button(view(), 'Create Route').props.disabled, false);
    const create = button(view(), 'Create Route'); create.props.onClick(); create.props.onClick(); await tick();
    assert.equal(h.generated.length, 1, 'Rapid double taps must not spend a second AI request');
    assert.equal(h.generated[0].destination.name, 'Bodrum'); assert.equal(h.generated[0].dayCount, 5);
    assert.match(text(view()), /Starter outline/); assert.doesNotMatch(text(find(view(), 'section', p => p.className === 'plan-results')), /Rome|Paris/);
    button(view(), 'Save this plan').props.onClick(); await tick(); const first = h.saves[0];
    button(view(), 'Edit').props.onClick();
    const newStop = find(view(), 'label', p => text(p.children).startsWith('New stop'));
    find(newStop, 'textarea').props.onChange({ target: { value: 'Evening marina walk' } });
    button(view(), 'Add stop').props.onClick(); button(view(), 'Apply changes').props.onClick();
    button(view(), 'Save this plan').props.onClick(); await tick();
    assert.equal(h.saves.length, 2); assert.notEqual(h.saves[1].id, first.id, 'Edited content must not be suppressed as already saved');
    assert.equal(first.plan.routes[0].dailyPlan.length, 5); assert.equal(h.saves[1].plan.routes[0].dailyPlan.at(-1), 'Evening marina walk');
    assert.equal(h.saves[1].input.destination.name, 'Bodrum');
  } finally { h.host.dispose(); }
});

test('A favourite outside ready-route coverage opens an explanation, never an unrelated profile', () => {
  const host = hooks(), navigations = [];
  try {
    const { TripsScreen } = load('mobile/src/screens/PlansScreen.tsx', {
      '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
      ...common(host), '../../../lib/event-time': {}, '../components/Icon': { Icon: 'Icon' }, '../components/PageHero': { PageHero: 'PageHero' }, '../components/CountryFlag': { CountryFlag: 'CountryFlag' }, '../components/Sheet': { Sheet: 'Sheet' }, '../components/TripCollaborationHub': { TripCollaborationHub: 'TripCollaborationHub' },
      '../data/countryIso': { alpha2FromAlpha3: () => 'CA' }, '../data/artwork': { destinationArtwork: () => '' }, '../data/discovery': { DISCOVERY_DESTINATIONS: [] },
      '../lib/storage': { getSavedRoutePlans: () => [], getFavoriteDestinations: () => [{ alpha3: 'CAN', name: 'Canada' }], getSavedTravelEvents: () => [] },
      '../lib/supabaseData': {}, '../lib/native': {}, '../lib/routeOutbox': { readRouteOutbox: () => ({}) }, '../lib/routeSync': {}, '../lib/eventReminders': {},
      '../components/TravelSavedPlaces': { TravelSavedPlaces: 'TravelSavedPlaces' }, '../lib/savedPlaces': { readSavedPlaces: () => ({ items: [], dayIds: [], error: null }), subscribeSavedPlaces: () => () => {} },
      '../lib/searchText': search,
      '../components/PersonalTravelCards': { PersonalTravelCards: 'PersonalTravelCards' },
    });
    host.start(TripsScreen, { user: null, initialSection: 'countries', accessToken: '', onNavigate: view => navigations.push(view), onNotice() {}, onOpenAccount() {}, onOpenDestination() {} });
    find(host.render(), 'button', props => props.className === 'saved-country-row').props.onClick();
    const view = host.render(); const dialog = find(view, 'Sheet', props => props.open && props.title === 'Canada');
    assert.ok(dialog); assert.match(text(dialog), /No ready-made route/); assert.equal(navigations.length, 0);
    button(dialog, 'Back to favourites').props.onClick();
    assert.equal(find(host.render(), 'Sheet', props => props.open && props.title === 'Canada'), undefined);
  } finally { host.dispose(); }
});

test('Saved library Places filter reads the same device store as the map and offers accurate assistant navigation', () => {
  const store = new Map(), events = new EventTarget(), host = hooks(), placesHost = hooks(), navigations = [];
  const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  events.localStorage = localStorage;
  const placeData = load('lib/travel-assistant/places.ts');
  const savedApi = load('mobile/src/lib/savedPlaces.ts', { '../../../lib/travel-assistant/places': placeData }, {
    window: events, localStorage,
  });
  const museum = { id: 'node/42', name: 'Saved Museum', category: 'museum', latitude: 52.52, longitude: 13.4, description: null, hours: null, free: null, accessible: null, website: null, representedCountry: null, sourceUrl: 'https://www.openstreetmap.org/node/42', fetchedAt: '2026-09-27T09:00:00.000Z' };
  savedApi.saveTravelPlace(museum);
  savedApi.updateTravelPlaceNote(museum.id, 'Go after lunch');
  try {
    const { TravelSavedPlaces } = load('mobile/src/components/TravelSavedPlaces.tsx', {
      ...common(placesHost), '../../../lib/travel-assistant/places': placeData, '../lib/native': {}, '../lib/travelAssistant': {}, '../lib/savedPlaces': savedApi, './Icon': { Icon: 'Icon' },
    });
    const { TripsScreen } = load('mobile/src/screens/PlansScreen.tsx', {
      '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
      ...common(host), '../../../lib/event-time': {}, '../components/Icon': { Icon: 'Icon' }, '../components/PageHero': { PageHero: 'PageHero' }, '../components/CountryFlag': { CountryFlag: 'CountryFlag' }, '../components/Sheet': { Sheet: 'Sheet' }, '../components/TripCollaborationHub': { TripCollaborationHub: 'TripCollaborationHub' },
      '../components/TravelSavedPlaces': { TravelSavedPlaces }, '../lib/savedPlaces': savedApi,
      '../lib/searchText': search,
      '../components/PersonalTravelCards': { PersonalTravelCards: 'PersonalTravelCards' },
      '../data/countryIso': { alpha2FromAlpha3: () => 'GB' }, '../data/artwork': {}, '../data/discovery': { DISCOVERY_DESTINATIONS: [] },
      '../lib/storage': { getSavedRoutePlans: () => [], getFavoriteDestinations: () => [], getSavedTravelEvents: () => [] },
      '../lib/supabaseData': {}, '../lib/native': {}, '../lib/routeOutbox': { readRouteOutbox: () => ({}) }, '../lib/routeSync': {}, '../lib/eventReminders': {},
    }, { window: events });
    host.start(TripsScreen, { user: null, accessToken: '', onNavigate: view => navigations.push(view), onNotice() {}, onOpenAccount() {}, onOpenDestination() {} });
    let view = host.render();
    const entry = find(view, 'button', props => text(props.children).includes('Places saved from the map'));
    assert.match(text(entry), /1 place · On this device/);
    assert.equal(find(view, TravelSavedPlaces), undefined, 'All shows a short entry rather than the whole place list');
    entry.props.onClick();
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
    button(host.render(), 'All saved').props.onClick();
    assert.match(text(find(host.render(), 'button', props => text(props.children).includes('Places saved from the map'))), /Places in your account/);
    assert.equal(savedApi.readSavedPlaces('a-different-account').items.length, 0);
    assert.equal(store.size, 1); assert.ok(store.has(savedApi.SAVED_PLACES_KEY), 'The library never creates a duplicate place store');
  } finally { host.dispose(); placesHost.dispose(); }
});

test('Saved routes search finds accents, and a guest route deletion can be undone with its original identity', () => {
  const host=hooks();let saved=[{id:'original-route',createdAt:'2026-09-28T08:00:00Z',input:{days:'3 days'},plan:{summary:'Explore Istanbul',routes:[{...route,name:'İstanbul'}]}}];
  const original=saved[0];
  const {TripsScreen}=load('mobile/src/screens/PlansScreen.tsx',{
      '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
    ...common(host),'../../../lib/event-time':{},'../components/Icon':{Icon:'Icon'},'../components/CountryFlag':{},'../components/Sheet':{Sheet:'Sheet'},'../components/TripCollaborationHub':{},'../components/TravelSavedPlaces':{},'../components/PersonalTravelCards':{},
    '../lib/savedPlaces':{readSavedPlaces:()=>({items:[],dayIds:[],error:null}),subscribeSavedPlaces:()=>()=>{}},'../data/countryIso':{},'../data/artwork':{destinationArtwork:()=>''},'../data/discovery':{DISCOVERY_DESTINATIONS:[]},
    '../lib/storage':{getSavedRoutePlans:()=>saved,getFavoriteDestinations:()=>[],getSavedTravelEvents:()=>[],deleteRoutePlan:id=>(saved=saved.filter(item=>item.id!==id)),saveRoutePlan:item=>(saved=[item,...saved])},
    '../lib/supabaseData':{},'../lib/native':{},'../lib/routeOutbox':{readRouteOutbox:()=>({})},'../lib/routeSync':{},'../lib/eventReminders':{},'../lib/searchText':search,
  });
  try {
    host.start(TripsScreen,{initialSection:'routes',user:null,accessToken:'',onNavigate(){},onNotice(){},onOpenAccount(){},onOpenDestination(){}});
    find(host.render(),'input',props=>props.type==='search').props.onChange({target:{value:'istanbul'}});
    assert.match(text(host.render()),/İstanbul/);
    find(host.render(),'button',props=>props['aria-label']==='Delete route').props.onClick();
    nodes(host.render()).find(node=>typeof node.type==='function'&&node.type.name==='DeleteConfirmation').props.onConfirm();
    assert.equal(saved.length,0);button(host.render(),'Undo').props.onClick();
    assert.equal(saved.length,1);assert.equal(saved[0],original);assert.match(text(host.render()),/İstanbul/);
  } finally {host.dispose();}
});


test('Deleting a saved route on another screen clears retained planner state and permits an independent resave', async () => {
  const h = plannerHarness();
  try {
    button(selected(h.host.render()), 'Save this plan').props.onClick(); await tick();
    const firstId = h.saves[0].id;
    assert.ok(button(selected(h.host.render()), 'Saved'));
    h.saves.splice(0); h.fixtureWindow.dispatchEvent(new Event('l2t:storage-change'));
    assert.ok(button(selected(h.host.render()), 'Save this plan'));
    button(selected(h.host.render()), 'Save this plan').props.onClick(); await tick();
    assert.equal(h.saves.length, 1); assert.notEqual(h.saves[0].id, firstId);
    assert.equal(h.saves[0].plan.routes[0].name, 'Rome');
  } finally { h.host.dispose(); }
});

test('Saved plan detail transfers the chosen route to Cockpit for its signed-in owner and asks a guest to sign in', async () => {
  for (const account of [false, true]) {
    const host=hooks(), intents=[], login=[];
    const saved=[{id:'route-source-123',createdAt:'2026-10-01T08:00:00Z',input:{days:'3 days',vibe:['Culture'],tier:'plus',budget:'Plus',currency:'EUR',activityBudgetPerPersonDay:5,party:{adults:2,children:1,childAges:[4]}},plan:{summary:'Two options',routes:[route,{...route,name:'Bodrum'}]}}];
    const {TripsScreen}=load('mobile/src/screens/PlansScreen.tsx',{
      '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
      ...common(host),'../../../lib/event-time':{},'../components/Icon':{Icon:'Icon'},'../components/CountryFlag':{},'../components/Sheet':{Sheet:'Sheet'},'../components/TripCollaborationHub':{},'../components/TravelSavedPlaces':{},'../components/PersonalTravelCards':{},
      '../lib/savedPlaces':{readSavedPlaces:()=>({items:[],dayIds:[],error:null}),subscribeSavedPlaces:()=>()=>{}},'../data/countryIso':{},'../data/artwork':{destinationArtwork:()=>''},'../data/discovery':{DISCOVERY_DESTINATIONS:[]},
      '../lib/storage':{getSavedRoutePlans:()=>saved,getFavoriteDestinations:()=>[],getSavedTravelEvents:()=>[]},
      '../lib/supabaseData':{listUserTrips:async()=>[]},'../lib/native':{},'../lib/routeOutbox':{readRouteOutbox:()=>({})},'../lib/routeSync':{},'../lib/eventReminders':{},'../lib/searchText':search,
    });
    try {
      host.start(TripsScreen,{initialSection:'routes',user:account?{id:'owner-a'}:null,ownerId:account?'owner-a':null,accessToken:account?'UNIT_ONLY':'',onNavigate(){},onNotice(){},onOpenAccount:()=>login.push(true),onOpenDestination(){},onPrepareCockpit:intent=>intents.push(intent)});
      await tick();button(host.render(),'Open plan').props.onClick();
      const detail=nodes(host.render()).find(node=>typeof node.type==='function'&&node.type.name==='PlanDetail');
      const detailView = detail.type(detail.props);
      assert.match(text(detailView), /2 adults, 1 children.*Child ages: 4.*Plus/);
      const budgetDetails = nodes(detailView).filter(node => typeof node.type === 'function' && node.type.name === 'SavedBudgetDetails');
      assert.equal(budgetDetails.length, 2);
      assert.equal(budgetDetails[0].props.input, saved[0].input, 'Reopened cost analysis uses the saved preferences, not planner defaults');
      assert.equal(budgetDetails[0].props.input.currency, 'EUR'); assert.equal(budgetDetails[0].props.input.activityBudgetPerPersonDay, 5);
      const articles=nodes(detailView).filter(node=>node.type==='article');
      button(articles[1],'Add this route to Cockpit').props.onClick();
      if (account) { assert.equal(intents.length,1);assert.equal(intents[0].route.name,'Bodrum');assert.equal(intents[0].routeIndex,1);assert.equal(intents[0].ownerId,'owner-a');assert.equal(intents[0].sourceRouteId,saved[0].id);assert.equal(login.length,0); }
      else {assert.equal(intents.length,0);assert.equal(login.length,1);}
    } finally {host.dispose();}
  }
});

test('City budget detail sends its selected city, travellers and duration as a dated estimate, retaining GBP without a usable foreign rate',()=>{
  const host=hooks(),intents=[];
  const benchmarks=load('lib/country-intelligence/city-benchmarks.ts');
  const budget=load('lib/country-intelligence/trip-budget.ts');
  const intentModule=load('mobile/src/lib/budgetCockpitIntent.ts',{'../../../lib/country-intelligence/city-benchmarks':benchmarks,'../../../lib/country-intelligence/trip-budget':budget});
  const {CityPriceCatalog}=load('mobile/src/components/CityPriceCatalog.tsx',{
    ...common(host),'../../../lib/country-intelligence/city-benchmarks':benchmarks,'../../../lib/country-intelligence/currencies':{COST_CURRENCIES:{}},'../../../lib/country-intelligence/cost-model':{},
    '../lib/countryIntelligence':{useAdvisories:()=>[],useCountryData:()=>({data:null,loading:false,error:null})},'../lib/native':{},'./Sheet':{Sheet:'Sheet'},'./CountryFlag':{CountryFlag:'Flag'},'./CountryAdvisory':{CountryRiskBadge:'Risk',CountryAdvisory:'Advisory'},'./CostCalculators':{LocationCalculator:'Location'},'./Icon':{Icon:'Icon'},
    '../../../lib/country-intelligence/trip-budget':budget,'../lib/budgetPreferences':{readBudgetPreferences:()=>({currency:'GBP',days:'3',people:'3'}),saveBudgetPreferences(){}},'../lib/travelAssistant':{},'../lib/budgetCockpitIntent':intentModule,
  },{window:{setInterval:()=>1,clearInterval(){}}});
  try {
    host.start(CityPriceCatalog,{ownerId:'owner-a',onOpenCountryNews(){},onPrepareCockpitBudget:intent=>intents.push(intent)});
    const city=nodes(host.render()).find(node=>node.type==='button'&&node.props.className==='budget-city-row');
    const name=text(find(city,'strong'));city.props.onClick();
    const view=host.render();assert.match(text(view),/Estimate for 3 days · 3 travellers/);
    button(view,'Add this estimate to Cockpit').props.onClick();
    assert.equal(intents.length,1);const intent=intents[0];assert.equal(intent.city,name);assert.equal(intent.ownerId,'owner-a');assert.equal(intent.estimate.days,3);assert.equal(intent.estimate.people,3);assert.equal(intent.displayCurrency,'GBP');assert.equal(intent.displayTotal,intent.estimate.total);assert.equal(intent.sourceMonth,'2026-05');
  }finally{host.dispose();}
});


test('Missing fields are actionable, switch back from preferences, scroll/focus the first error and retain choices in every locale', () => {
  for (const locale of ['tr', 'en', 'sq']) {
    const h = plannerHarness({ seeded: false, locale });
    try {
      const view = () => h.host.render();
      const preferences = locale === 'tr' ? 'Tercihlerim' : 'Preferences';
      button(view(), preferences).props.onClick();
      const fields = find(view(), 'section', p => p.className === 'form-card planner-form reference-planner');
      const scrolls = [], focuses = [], selectors = [];
      fields.props.ref.current = { querySelector: selector => { selectors.push(selector); return { scrollIntoView: value => scrolls.push(value), querySelector: () => ({ focus: value => focuses.push(value) }) }; } };
      const createLabel = locale === 'tr' ? 'Rota Oluştur' : 'Create Route';
      assert.equal(button(view(), createLabel).props.disabled, false);
      button(view(), createLabel).props.onClick();
      const current = view();
      assert.equal(h.generated.length, 0);
      assert.equal(selectors.at(-1), '[data-planner-field="origin"]');
      assert.equal(scrolls.at(-1).block, 'center');
      assert.equal(focuses.at(-1).preventScroll, true);
      const origin = find(current, 'AirportField');
      assert.equal(origin.props.error, locale === 'tr' ? 'Çıkış şehrini seçmelisin.' : locale === 'sq' ? 'Zgjidh qytetin e nisjes.' : 'Choose your departure city.');
      assert.equal(find(current, 'label', p => p['data-planner-field'] === 'duration').props.children[1].props.value, 5);
    } finally { h.host.dispose(); }
  }
});

test('Family ages block generation until completed, and Plus, party, currency and duration persist with the generated route', async () => {
  const h = plannerHarness({ seeded: false });
  try {
    const view = () => h.host.render();
    find(view(), 'AirportField').props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul Airport' });
    find(view(), 'button', p => text(p.children).startsWith('Plus')).props.onClick();
    find(find(view(), 'label', p => text(p.children).startsWith('With whom?')), 'select').props.onChange({ target: { value: 'Ailemle' } });
    find(find(view(), 'label', p => text(p.children).startsWith('Cost currency')), 'select').props.onChange({ target: { value: 'EUR' } });
    const focusTargets = [];
    find(view(), 'section', p => p.className === 'form-card planner-form reference-planner').props.ref.current = { querySelector: () => ({ scrollIntoView() {}, querySelector: selector => ({ focus: () => focusTargets.push(selector) }) }) };
    button(view(), 'Create Route').props.onClick();
    assert.equal(h.generated.length, 0);
    assert.deepEqual(focusTargets, ['[aria-invalid="true"]'], 'Invalid child age must take priority over the earlier companion-type select');
    assert.match(text(view()), /enter every child's age/);
    const age = find(find(view(), 'label', p => text(p.children).startsWith('Child 1 age')), 'select');
    assert.equal(age.props['aria-invalid'], true);
    age.props.onChange({ target: { value: '4' } });
    button(view(), 'Create Route').props.onClick(); await tick();
    assert.equal(h.generated.length, 1);
    assert.equal(h.generated[0].tier, 'plus'); assert.equal(h.generated[0].budget, 'Plus'); assert.equal(h.generated[0].currency, 'EUR');
    assert.deepEqual(JSON.parse(JSON.stringify(h.generated[0].party)), { adults: 2, children: 1, childAges: [4] });
    find(find(view(), 'label', p => text(p.children).startsWith('Child 1 age')), 'select').props.onChange({ target: { value: '8' } });
    button(view(), 'Save 2 suggestions').props.onClick(); await tick();
    assert.equal(h.saves[0].input.party.childAges[0], 4, 'Later form edits cannot silently change the saved generated preferences');
    assert.equal(h.saves[0].input.dayCount, 5);
    assert.ok(find(view(), 'RouteBudgetAnalysis', p => p.input.party.childAges[0] === 4));
  } finally { h.host.dispose(); }
});


test('Route cost result changes currency safely, ignores an obsolete rate reply, distinguishes missing activity prices and collapses methodology', async () => {
  const host = hooks(), waiting = [];
  const benchmarks = load('lib/country-intelligence/city-benchmarks.ts');
  const math = load('lib/country-intelligence/trip-budget.ts');
  const preferences = load('lib/planner-preferences.ts');
  const routeBudget = load('lib/country-intelligence/route-budget.ts', { './city-benchmarks': benchmarks, './cost-model': load('lib/country-intelligence/cost-model.ts'), './trip-budget': math, '../planner-preferences': preferences });
  let input = { origin: 'Istanbul', days: '3 days', dayCount: 3, month: 'Ekim', budget: 'Orta', who: 'Ailemle', vibe: ['City'], tier: 'balanced', party: { adults: 2, children: 1, childAges: [4] }, currency: 'EUR' };
  const { RouteBudgetAnalysis } = load('mobile/src/components/RouteBudgetAnalysis.tsx', {
    ...common(host), '../../../lib/country-intelligence/city-benchmarks': benchmarks, '../../../lib/country-intelligence/route-budget': routeBudget,
    '../../../lib/planner-preferences': preferences, '../lib/countryIntelligence': { useCountryData: () => ({ data: null, loading: false, error: false, retry() {} }) },
    '../lib/travelAssistant': { storedQuote: () => null, loadQuote: (base, quote) => new Promise(resolve => waiting.push({ base, quote, resolve })) },
    '../lib/native': { openExternal() {} }, './Icon': { Icon: 'Icon' },
  }, { window: { setInterval: () => 1, clearInterval() {} } });
  const change = patch => { input = { ...input, ...patch }; host.render({ input }); };
  try {
    host.start(RouteBudgetAnalysis, { route, input, onCurrency: currency => change({ currency, activityBudgetPerPersonDay: undefined }), onActivityBudget: value => change({ activityBudgetPerPersonDay: value }) });
    assert.equal(waiting[0].quote, 'EUR');
    find(host.render(), 'select').props.onChange({ target: { value: 'USD' } });
    assert.equal(waiting[1].quote, 'USD');
    waiting[0].resolve({ base: 'GBP', quote: 'EUR', rate: 100, date: new Date().toISOString().slice(0, 10) }); await tick();
    assert.equal(text(find(host.render(), 'div', p => p.className === 'planner-cost-total')).includes('—'), true, 'A late EUR quote cannot be reused for the current USD selection');
    waiting[1].resolve({ base: 'GBP', quote: 'USD', rate: 2, date: new Date().toISOString().slice(0, 10) }); await tick();
    assert.match(text(host.render()), /Estimated subtotal/);
    assert.match(text(host.render()), /Activity prices are unknown/);
    assert.match(text(find(host.render(), 'div', p => p.className === 'planner-cost-total')), /\$/);
    assert.equal(find(host.render(), 'details').props.open, undefined);
    find(host.render(), 'input').props.onChange({ target: { value: '0' } });
    assert.match(text(host.render()), /Estimated total for this scope/);
    assert.doesNotMatch(text(host.render()), /Activity prices are unknown/);
    host.render({ route: { ...route, name: 'Bodrum', cityOrRegion: 'Bodrum', destinationCode: 'BJV' } });
    assert.match(text(host.render()), /No sourced price baseline/);
    assert.equal(find(host.render(), 'div', p => p.className === 'planner-cost-total'), undefined);
    assert.equal(waiting.length, 2, 'An unsupported city must not fetch or borrow unrelated city prices');
    host.render({ route, onCurrency: undefined, onActivityBudget: undefined });
    assert.equal(find(host.render(), 'input'), undefined, 'Saved read-only analysis cannot silently change the stored allowance');
    assert.equal(find(host.render(), 'select'), undefined);
  } finally { host.dispose(); }
});
