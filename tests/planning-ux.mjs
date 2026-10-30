import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const runtime = { jsx, jsxs: jsx, Fragment: 'fragment' };
const tick = () => new Promise(resolve => setImmediate(resolve));
const english = { copy: (_tr, en) => en, locale: 'en', dateLocale: 'en-GB' };
let reducedMotion = false;
function load(path, imports = {}, environment = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, Intl, URL, Event, AbortController,setTimeout,clearTimeout, requestAnimationFrame: fn => fn(), window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: reducedMotion }) }, ...environment })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === '../components/RouteWeather') return { RouteWeather: 'RouteWeather' };
    if (name === '../components/Sheet') return { Sheet: 'Sheet' };
    if (name === '../components/LazyOverlay') return { LazyOverlay: 'LazyOverlay' };
    if (name === '../components/TravelReadinessCard') return { TravelReadinessCard: 'TravelReadinessCard' };
    if (name === '../lib/journeyTools') return { readSafetyTrips: () => [], saveSafetyTrips() {} };
    if (name === '../lib/offlineMaps') return { readOfflineMapStatus: () => ({ status: 'ready', count: 0 }) };
    if (name === '../lib/openMapOffline') return { listOpenMapPacks: async () => [], subscribeOpenMapPacks: () => () => {} };
    if (name === '../lib/personalMapPins') return { readPersonalMapPins: () => ({ items: [], error: null }), subscribePersonalMapPins: () => () => {} };
    if (name === '../../../lib/planner-passport') return load('lib/planner-passport.ts', { './country-intelligence/passports': load('lib/country-intelligence/passports.ts', { '../../mobile/src/data/passport-index.json': { default: JSON.parse(readFileSync('mobile/src/data/passport-index.json', 'utf8')) }, './passport-reviewed': load('lib/country-intelligence/passport-reviewed.ts') }) });
    if (name === '../lib/accountResume') return { onAccountResume: () => () => {} };
    if (name === './accountCollections') return load('mobile/src/lib/accountCollections.ts', {'./id': load('mobile/src/lib/id.ts')}, environment);
    if (name === '../lib/localeFormatting') return localeFormatting;
    if (name === '../lib/locale' || name === './locale' || name === '../mobile/src/lib/locale') return load('mobile/src/lib/locale.ts');
    if (name === './planner-copy') return load('lib/planner-copy.ts');
    if (name === './locale-copy') return load('lib/locale-copy.ts', {
      '../mobile/src/lib/locales/ro': load('mobile/src/lib/locales/ro.ts'),
      '../mobile/src/lib/locale': load('mobile/src/lib/locale.ts'),
    });
    if (name === '../lib/routeCockpitIntent') return load('mobile/src/lib/routeCockpitIntent.ts');
    if (name === './mapJourney') return load('mobile/src/lib/mapJourney.ts', { '../../../lib/travel-assistant/places': load('lib/travel-assistant/places.ts'), './id': load('mobile/src/lib/id.ts') });
    if (name === '../lib/savedRouteIdentity') return load('mobile/src/lib/savedRouteIdentity.ts', {'./id': load('mobile/src/lib/id.ts')});
    if (name === '../../../lib/planner-preferences' || name === './planner-preferences') return load('lib/planner-preferences.ts');
    if (name === '../components/RouteBudgetAnalysis') return { RouteBudgetAnalysis: 'RouteBudgetAnalysis' };
    if (name === '../components/RouteTranslation') return { RouteTranslation: 'RouteTranslation' };
    if (name === '../lib/savedRouteDisplay') return load('mobile/src/lib/savedRouteDisplay.ts');
    if (name.endsWith('.css')) return {};
    throw Error(`Missing fixture import: ${name}`);
  }, testModule, testModule.exports);
  return testModule.exports;
}
const localeFormatting = load('mobile/src/lib/localeFormatting.ts', {
  './locales/sq-regions': load('mobile/src/lib/locales/sq-regions.ts'),
});
function hooks(strict=false) {
  const slots = []; let cursor = 0, dirty = false, effects = [], component, props;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  const memoHook = (fn, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; };
  return {
    react: {
      useState(initial) { const i = cursor++; if (!slots[i]) {if(strict&&typeof initial==='function')initial();slots[i] = { value: typeof initial === 'function' ? initial() : initial };} return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
      useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
      useMemo: memoHook, useCallback: (fn, deps) => memoHook(() => fn, deps),
      useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || changed(old.deps, deps)) { slots[i] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn();if(strict&&!old){slots[i].cleanup?.();slots[i].cleanup=fn();} }); } },
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
const appSearch = load('mobile/src/lib/globalSearch.ts', {
  '../data/countries': { ISO_3166: JSON.parse(readFileSync('mobile/src/data/iso3166.json', 'utf8')) },
  '../data/discovery': load('mobile/src/data/discovery.ts'),
  '../data/homeDestinations': homeData, './localeFormatting': localeFormatting,
  './searchText': search, './appTools': load('mobile/src/lib/appTools.ts'),
});
const homeAssets = Object.fromEntries([
  '../assets/home-reference/coastal-banner.webp', '../assets/home-reference/bali-beach-v5.webp',
  '../assets/home-reference/community-travelers.webp', '../assets/destination-artwork/rome.webp',
  '../assets/home-reference/santorini-daylight-v3.webp', '../assets/home-reference/event-festival-v3.webp',
  '../assets/home-reference/paris-eiffel-v3.webp', '../assets/home-reference/tokyo-temple-v5.webp',
].map(path => [path, { default: path }]));
function loadHome(host, { locale = 'en', listCockpitTrips = () => { throw Error('Guest Home must not request account trips'); } } = {}) {
  return load('mobile/src/screens/HomeScreen.tsx', {
    ...common(host), ...homeAssets,
    '../lib/i18n': { useI18n: () => ({ locale, dateLocale: locale === 'tr' ? 'tr-TR' : 'en-GB', copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en }) },
    '../components/Icon': { Icon: 'Icon' }, '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
    '../components/HomeShortcutPicker': { HomeShortcutPicker: 'HomeShortcutPicker' },
    '../hooks/useHomeShortcuts': { useHomeShortcuts: () => ({ views: ['route', 'explore', 'passport', 'trips', 'companion'], save: () => true }) },
    '../lib/appTools': load('mobile/src/lib/appTools.ts'),
    '../lib/globalSearch': appSearch,
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
    assert.equal(personalBanner(host.render()),undefined, 'Signing out removes the personal trip without replacing it with a generic promotional card');
  } finally {host.dispose();}
});

test('Home omits the generic personal promotion and its five translated shortcuts open real destinations without account data', () => {
  for (const locale of ['en', 'tr']) {
    const host=hooks(), opened=[], communities=[];
    try {
      const HomeScreen=loadHome(host,{locale});
      const view=host.start(HomeScreen,{...guestHomeProps,onNavigate:value=>opened.push(value),onOpenCommunity:()=>communities.push('community')});
      assert.equal(personalBanner(view),undefined, 'A guest without a real trip does not get a fake personal recommendation');
      assert.equal(find(view,'input',props=>props.type==='search').props.placeholder,locale==='en'?'Search cities, countries or tools':'Şehir, ülke veya araç ara');
      const nav=find(view,'nav',props=>props['aria-label']===(locale==='en'?'Plan your journey':'Seyahatini planla'));
      const labels=locale==='en'?['Build a Route','Explore Countries','Passport & Visa','Plans','All Tools']:['Rota Oluştur','Ülke Keşfet','Pasaport & Vize','Planlar','Tüm Araçlar'];
      const compactLabels=locale==='en'?['Route','Explore','Visa','Plans','Tools']:['Rota','Ülkeler','Vize','Planlar','Araçlar'];
      assert.equal(nodes(nav).filter(node=>node.type==='button').length,5);
      for (const [index,label] of labels.entries()) {
        // The responsive title contains both labels; its accessible name stays complete.
        const shortcut=find(nav,'button',props=>props['aria-label']?.startsWith(`${label} — `));
        assert.ok(shortcut,`Missing translated shortcut: ${label}`);
        assert.equal(text(find(shortcut,'span',props=>props.className==='rh-shortcut-full')),label);
        assert.equal(text(find(shortcut,'span',props=>props.className==='rh-shortcut-compact')),compactLabels[index]);
        const caption=text(find(shortcut,'small'));
        assert.ok(caption,`Missing shortcut description: ${label}`);
        assert.equal(shortcut.props['aria-label'],`${label} — ${caption}`);
        shortcut.props.onClick();
      }
      assert.deepEqual(opened,['route','explore','passport','trips','companion']);
      button(view,locale==='en'?'Join the Community':'Topluluğa Katıl').props.onClick();
      assert.deepEqual(communities,['community']);
    } finally {host.dispose();}
  }
});

test('Home keeps account trip loading and retry states without inventing a personal recommendation for an empty result', async () => {
  const host=hooks(); let pending, reads=0;
  const HomeScreen=loadHome(host,{listCockpitTrips:()=>{reads++;return new Promise((resolve,reject)=>{pending={resolve,reject};});}});
  try {
    let view=host.start(HomeScreen,{...guestHomeProps,user:{id:'a'},ownerId:'a',accessToken:'fixture'});
    assert.match(text(view),/Getting your trip ready/);assert.equal(personalBanner(view),undefined);
    pending.reject(Error('Temporarily unavailable'));await tick();view=host.render();
    assert.match(text(view),/Your trip details couldn't be refreshed/);assert.equal(personalBanner(view),undefined);
    button(view,'Try again').props.onClick();view=host.render();assert.equal(reads,2);assert.match(text(view),/Getting your trip ready/);
    pending.resolve([]);await tick();view=host.render();
    assert.equal(personalBanner(view),undefined);assert.doesNotMatch(text(view),/Getting your trip ready|couldn't be refreshed|Personal ideas|Get Started/);
  } finally {host.dispose();}
});

test('Home restores the submitted search and forwards trimmed typed queries and visible destination shortcuts', () => {
  const host=hooks(), queries=[];
  try {
    host.start(loadHome(host),{...guestHomeProps,initialSearchQuery:'Bali',onSearchDestination:value=>queries.push(value)});
    let view=host.render();const field=find(view,'input',props=>props.type==='search');
    assert.equal(field.props.value,'Bali');
    assert.ok(find(view,'label',props=>props.htmlFor===field.props.id),'Search input has a visible or screen-reader label');
    field.props.onChange({target:{value:'  Roma  '}});view=host.render();
    let prevented=0;find(view,'form',props=>props.role==='search').props.onSubmit({preventDefault(){prevented++;}});
    find(view,'button',props=>props['aria-label']==='Rome').props.onClick();find(view,'button',props=>props['aria-label']==='Bali').props.onClick();
    assert.equal(prevented,1);assert.deepEqual(queries,['Roma','Roma','Bali']);
  } finally {host.dispose();}
});

test('Four photographed destination shortcuts retain clear localized names and exact search targets beside Event Radar', () => {
  for (const [locale, discoveries, romeLabel, eventLabel] of [
    ['tr', 'Hızlı keşfet', 'Roma', 'Etkinlik Radarı'],
    ['en', 'Quick discoveries', 'Rome', 'Event Radar'],
    ['sq', 'Zbulime të shpejta', 'Roma', 'Radar aktivitetesh'],
  ]) {
    const host = hooks(), searches = [], views = [];
    try {
      const view = host.start(loadHome(host, { locale }), { ...guestHomeProps, onSearchDestination: query => searches.push(query), onNavigate: target => views.push(target) });
      const choices = find(view, 'nav', props => props['aria-label'] === discoveries);
      assert.ok(choices, 'Photo destinations have their own labelled discovery group');
      const cards = nodes(choices).filter(node => node.type === 'button');
      assert.deepEqual(cards.map(card => card.props['aria-label']), ['Paris', 'Bali', 'Tokyo', romeLabel]);
      for (const [index, filename] of ['paris-eiffel-v3.webp', 'bali-beach-v5.webp', 'tokyo-temple-v5.webp', 'rome.webp'].entries()) {
        const image = find(cards[index], 'img');
        assert.ok(image.props.src.endsWith(filename), 'Each discovery photo matches its destination');
        assert.equal(image.props.alt, '', 'The visible destination text names the action without duplicate decorative photo text');
        assert.equal(text(cards[index]), cards[index].props['aria-label'], 'Compact photo cards retain a single visible city name without a separate country caption');
        cards[index].props.onClick();
      }
      assert.deepEqual(searches, ['Paris', 'Bali', 'Tokyo', 'Roma']);
      assert.deepEqual(views, [], 'Discovery shortcuts preserve destination-search navigation');
      const radar = find(view, 'button', props => props['data-guide'] === 'home-events');
      assert.ok(text(radar).includes(eventLabel));
      assert.ok(find(radar, 'img').props.src.endsWith('event-festival-v3.webp'));
      assert.equal(find(radar, 'img').props.alt, '');
      radar.props.onClick();
      assert.deepEqual(views, ['events']);
      assert.deepEqual(searches, ['Paris', 'Bali', 'Tokyo', 'Roma'], 'Event Radar must not turn into a destination search');
    } finally { host.dispose(); }
  }
});

test('Home suggests real Event Radar, Istanbul and currency destinations while typing, with keyboard and touch selection', () => {
  for (const locale of ['tr', 'en', 'sq']) {
    const host=hooks(), destinations=[], views=[], tools=[], countries=[], all=[];
    try {
      let view=host.start(loadHome(host,{locale}),{...guestHomeProps,onNavigate:value=>views.push(value),onOpenTool:value=>tools.push(value),onSearchDestination:value=>destinations.push(value),onOpenCountry:value=>countries.push(value),onOpenGlobalSearch:value=>all.push(value)});
      const type=value=>{find(view,'input',props=>props.type==='search').props.onChange({target:{value}});view=host.render();};
      const options=()=>nodes(view).filter(node=>node.props?.role==='option');
      type('Etki');const event=options().find(node=>text(node).includes(locale==='tr'?'Etkinlik Radarı':locale==='sq'?'Radar aktivitetesh':'Event Radar'));assert.ok(event);event.props.onClick();view=host.render();assert.deepEqual(views,['events']);assert.equal(find(view,'input').props['aria-expanded'],false);
      type('İst');const city=options().find(node=>/İstanbul|Istanbul|Stamboll/.test(text(node)));assert.ok(city,'Plain-prefix and Turkish I must find Istanbul');city.props.onClick();view=host.render();assert.equal(destinations.length,1);assert.match(destinations[0],/İstanbul|Istanbul|Stamboll/);
      type('Döviz');let prevented=0;find(view,'input').props.onKeyDown({key:'ArrowDown',preventDefault(){prevented++;}});view=host.render();assert.equal(find(view,'input').props['aria-activedescendant'],'home-search-option-0');find(view,'form').props.onSubmit({preventDefault(){prevented++;}});view=host.render();assert.deepEqual(tools,['money']);assert.equal(prevented,2);
      type('Albania');const country=options().find(node=>/AL$/.test(text(node)));assert.ok(country);country.props.onClick();view=host.render();assert.deepEqual(countries,['ALB']);
      type('no-match-9987');assert.equal(options().length,0);assert.ok(find(view,'p',props=>props.role==='status'));find(view,'form').props.onSubmit({preventDefault(){}});assert.deepEqual(all,['no-match-9987']);
      type('Etki');find(view,'input').props.onKeyDown({key:'Escape',preventDefault(){}});view=host.render();assert.equal(find(view,'input').props['aria-expanded'],false);assert.equal(options().length,0);
    }finally{host.dispose();}
  }
});

test('Home Event Radar is directly discoverable and the current itinerary CTA carries its exact trip instead of generic saved places', async () => {
  const host=hooks(), opened=[], views=[];
  try {
    const trip={id:'active-map-trip',status:'active',startDate:'2026-09-27',endDate:'2026-09-30',destinationCity:'Istanbul',checklistItems:[]};
    host.start(loadHome(host,{listCockpitTrips:async()=>[trip]}),{...guestHomeProps,user:{id:'a'},ownerId:'a',accessToken:'fixture',onNavigate:value=>views.push(value),onOpenTrip:(...args)=>opened.push(args),onOpenSaved(){throw Error('Today cannot open generic bookmarks');}});
    await tick();const view=host.render();
    find(view,'button',props=>props['data-guide']==='home-events').props.onClick();assert.deepEqual(views,['events']);
    button(personalBanner(view),"Today's Itinerary").props.onClick();assert.deepEqual(opened,[['active-map-trip','today']]);
  }finally{host.dispose();}
});

test('Home omits the removed Popular Routes block while four discoveries still search without saving or seeding a plan', () => {
  for (const locale of ['tr', 'en', 'sq']) {
    const host = hooks(), searches = [], writes = [];
    try {
      const view = host.start(loadHome(host, { locale }), { ...guestHomeProps, savedRouteIds: ['NAV'], onSearchDestination: query => searches.push(query), onBuildRoute: route => writes.push(['seed', route]), onToggleSaved: route => writes.push(['save', route]) });
      assert.equal(find(view, 'section', props => props.className?.split(' ').includes('rh-popular')), undefined);
      assert.equal(find(view, 'div', props => props.className === 'rh-destination-grid'), undefined);
      assert.equal(nodes(view).some(node => node.type === 'h2' && /Popular Routes|Popüler Rotalar|Itinerare të njohura/.test(text(node))), false);
      const discoveries = find(view, 'nav', props => props.className === 'rh-city-chips');
      const choices = nodes(discoveries).filter(node => node.type === 'button');
      assert.equal(choices.length, 4, 'The remaining four discoveries are not duplicated by another destination section');
      choices.forEach(choice => choice.props.onClick());
      assert.deepEqual(searches, ['Paris', 'Bali', 'Tokyo', 'Roma']);
      assert.deepEqual(writes, [], 'Discovery navigation never implicitly saves or seeds a route');
      assert.equal(personalBanner(view), undefined, 'Only an actual account trip gets the personal trip card');
      assert.ok(find(view, 'button', props => props['data-guide'] === 'home-events'), 'The direct Event Radar entry remains available');
    } finally { host.dispose(); }
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
function plannerHarness({ seeded = true, account = true, syncFails = false, storageFails = false, locale = 'en', welcomeInterests = [], passport = { country: 'TR', type: 'ordinary' }, placeName = '',keepMapOpen=false,quota:quotaOption,recovery=false,strict=false,handoff=null } = {}) {
  const host = hooks(strict), saves = [], navigations = [], notices = [], generated = [], signIns=[];
  let previousDraft=null,pendingHandoff=handoff;
  let generationFailure = null, generationResponse;
  const fixtureWindow = new EventTarget(); Object.assign(fixtureWindow, {matchMedia: () => ({matches: reducedMotion})});
  const { RouteAssistantScreen } = load('mobile/src/screens/RouteAssistantScreen.tsx', {
    '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
    '../hooks/usePassportPreference': { usePassportPreference: () => passport },
    '../components/RequestFailure': { RequestFailure: 'RequestFailure' },
    ...common(host), '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en }) }, '../../../lib/route-planner': destinationPlans, '../components/AirportField': { AirportField: 'AirportField' }, '../components/Icon': { Icon: 'Icon' }, '../components/PageHero': { PageHero: 'PageHero' },
    '../data/artwork': { destinationArtwork: code => code }, '../data/routes': { routeByDestinationCode: code => ({ ...route, destinationCode: code }), createFallbackPlan: () => ({ summary: 'Offline ideas', routes: [route] }) },
    '../lib/api': {hasPendingRoutePlan:()=>!!recovery,hasRoutePlanRecovery:async(...args)=>typeof recovery==='function'?recovery(...args):recovery, generateRoutePlan: async input => { generated.push(input); if (generationFailure) throw generationFailure; if (generationResponse !== undefined) return generationResponse; return { data: { summary: 'Your suggestions', routes: [route, { ...route, name: 'Paris', destinationCode: 'CDG' }] } }; } },
    '../lib/journeyPlanClient':{loadJourneyPlanQuota:()=>{if(quotaOption)return quotaOption();const reset=new Date();reset.setUTCHours(24,0,0,0);return {then(fn){fn({limit:3,used:0,remaining:3,pending:false,resetAt:reset.toISOString(),timeZone:'UTC'});return {catch(){}};}};}},
    '../lib/plannerSignInDraft':{preparePlannerSignInDraft:value=>{pendingHandoff=value;return true;},takePlannerSignInDraft:()=>{const value=pendingHandoff;pendingHandoff=null;return value;},readPlannerRecoveryDraft:()=>previousDraft,savePlannerRecoveryDraft:(_owner,value)=>{previousDraft=JSON.parse(JSON.stringify(value));}},
    '../lib/native': { hapticSuccess: async () => {}, openExternal: async () => {} }, '../lib/plannerState': snapshots,
    '../lib/onboardingPreferences': load('mobile/src/lib/onboardingPreferences.ts', {}, {window:{localStorage:{getItem:()=>JSON.stringify({interests:welcomeInterests})}}}),
    '../lib/routeSync': { syncRoutePlan: async () => { if (syncFails) throw Error('offline'); } },
    '../lib/routeOutbox': { readRouteOutbox: () => syncFails && saves.length ? { [saves[0].id]: { kind: 'save', pending: true } } : {} },
    '../lib/storage': { getSavedRoutePlans: () => [...saves], saveRoutePlan: value => { if (storageFails) throw Error('quota'); saves.push(value); return [...saves].reverse(); } },
    '../lib/supabaseData': { getSupabaseDataErrorMessage: (_error, fallback) => fallback },
  }, {window: fixtureWindow});
  host.start(RouteAssistantScreen, { onOpenAccount:()=>signIns.push(true), onNotice: message => notices.push(message), onNavigate: view => navigations.push(view), surpriseRoute: seeded ? route : null, routeSeedKind: 'explore', ownerId: account ? 'fixture-owner' : null, accessToken: account ? 'UNIT_TEST_ONLY' : '', placeName });
  if(!seeded&&!keepMapOpen){find(host.render(),'Sheet')?.props.onClose();host.render();}
  return { host, saves, navigations, notices, generated, fixtureWindow, signIns, getHandoff:()=>pendingHandoff, setLocale: value => { locale = value; }, failGeneration: error => { generationFailure = error; }, respondGeneration: response => { generationFailure = null; generationResponse = response; } };
}
const selected = tree => find(tree, 'section', props => props['aria-label'] === 'Selected route');

test('Legacy guest AI creation opens sign-in with its form, and StrictMode handoff preserves the chosen departure',async()=>{
  const guest=plannerHarness({seeded:false,account:false});let handoff;
  try{
    find(guest.host.render(),'AirportField').props.onChange({iata:'IST',city:'Istanbul',name:'Istanbul Airport',country:'Türkiye',countryCode:'TR'});
    button(guest.host.render(),'Sign in to continue').props.onClick();await tick();
    assert.equal(guest.generated.length,0);assert.equal(guest.signIns.length,1);handoff=guest.getHandoff();assert.equal(handoff.form.origin,'Istanbul');
  }finally{guest.host.dispose();}
  const signed=plannerHarness({seeded:false,handoff,strict:true,keepMapOpen:true});
  try{assert.equal(find(signed.host.render(),'AirportField').props.value.city,'Istanbul');assert.equal(signed.generated.length,0);assert.equal(find(signed.host.render(),'Sheet'),undefined);}finally{signed.host.dispose();}
});

test('Legacy quota and capacity failures never create a false starter success or replace the previous plan',async()=>{
  for(const code of ['plan_limit','plan_quota_unavailable','plan_sign_in','plan_request_too_large']){
    const h=plannerHarness({seeded:false});
    try{
      find(h.host.render(),'AirportField').props.onChange({city:'Istanbul',name:'Istanbul Airport'});
      h.failGeneration(Object.assign(Error('service'),{code}));button(h.host.render(),'Create Route').props.onClick();await tick();
      assert.equal(h.generated.length,1);assert.equal(find(h.host.render(),'RouteBudgetAnalysis'),undefined);assert.doesNotMatch(text(h.host.render()),/starter outline/);
    }finally{h.host.dispose();}
  }
});

test('Alternative planner shows server remaining rights from 3 to 0 in every locale and keeps pending separate from exhaustion',async()=>{
  for(const locale of ['tr','en','sq']){
    const reset=new Date();reset.setUTCHours(24,0,0,0);
    let quota={limit:3,used:0,remaining:3,pending:false,resetAt:reset.toISOString(),timeZone:'UTC'};
    const h=plannerHarness({seeded:false,locale,quota:async()=>quota});
    const settle=async()=>{h.host.render();await tick();return h.host.render();};
    const header=()=>text(find(find(h.host.render(),'aside',p=>p.className==='planner-allowance'),'strong'));
    const refresh={tr:'Hakkımı kontrol et',en:'Refresh allowance',sq:'Rifresko të drejtën'}[locale];
    const label=n=>locale==='tr'?`Bugün ${n} yeni AI rota hakkın var`:locale==='en'?`${n} new AI ${n===1?'itinerary':'itineraries'} available today`:n===1?'Sot ke 1 itinerar të ri me AI':`Sot ke ${n} itinerare të reja me AI`;
    try{
      await tick();assert.equal(header(),label(3));
      for(const remaining of [2,1,0]){
        quota={...quota,used:3-remaining,remaining};button(h.host.render(),refresh).props.onClick();await settle();
        if(remaining)assert.equal(header(),label(remaining));else assert.match(header(),/0/);
        assert.equal(find(h.host.render(),'time').props.dateTime,reset.toISOString());
      }
      assert.equal(button(h.host.render(),locale==='tr'?'Rota Oluştur':'Create Route').props.disabled,true);
      quota={...quota,used:1,remaining:0,pending:true};button(h.host.render(),refresh).props.onClick();await settle();
      assert.equal(header(),{tr:'Önceki isteğin hâlâ işleniyor',en:'Your previous request is still processing',sq:'Kërkesa e mëparshme po përpunohet'}[locale]);
      quota={...quota,limit:1,used:0,remaining:1,pending:false};button(h.host.render(),refresh).props.onClick();await settle();assert.equal(header(),label(1));
    }finally{h.host.dispose();}
    const guest=plannerHarness({seeded:false,locale,account:false});
    try{assert.match(text(guest.host.render()),locale==='tr'?/günde 3 yeni AI rota/:locale==='en'?/3 new AI itineraries per account each day/:/3 itinerare të reja me AI në ditë/);}finally{guest.host.dispose();}
  }
});

test('A failed alternative AI attempt preserves all three rights and the departure draft until the server confirms a successful result',async()=>{
  const reset=new Date();reset.setUTCHours(24,0,0,0);let used=0;
  const h=plannerHarness({seeded:false,quota:async()=>({limit:3,used,remaining:3-used,pending:false,resetAt:reset.toISOString(),timeZone:'UTC'})});
  try{
    await tick();find(h.host.render(),'AirportField').props.onChange({city:'Istanbul',name:'Istanbul Airport'});
    h.failGeneration(Object.assign(Error('capacity'),{code:'plan_request_too_large'}));button(h.host.render(),'Create Route').props.onClick();await tick();h.host.render();await tick();
    let view=h.host.render();assert.match(text(view),/3 new AI itineraries available today/);assert.equal(find(view,'AirportField').props.value.city,'Istanbul');assert.equal(find(view,'RouteBudgetAnalysis'),undefined);
    used=1;h.respondGeneration({data:{summary:'Confirmed real result',routes:[route]}});button(view,'Create Route').props.onClick();await tick();h.host.render();await tick();view=h.host.render();
    assert.match(text(view),/2 new AI itineraries available today/);assert.equal(h.generated.length,2);assert.ok(find(view,'RouteBudgetAnalysis'));
  }finally{h.host.dispose();}
});

test('New route entry opens the map survey directly and explicit reopen preserves the alternative planner draft', () => {
  const h = plannerHarness({ seeded: false,keepMapOpen:true });
  try {
    let view = h.host.render();
    assert.ok(find(view, 'Sheet', props => props.title === 'Plan on the map'));
    assert.equal(find(view, 'div', props => props.id === 'planner-alternative-options').props.hidden, true);
    find(view, 'Sheet').props.onClose();
    view = h.host.render();
    assert.equal(find(view, 'Sheet'), undefined);
    button(view, 'Help me choose a destination').props.onClick();
    view = h.host.render();
    assert.equal(find(view, 'div', props => props.id === 'planner-alternative-options').props.hidden, false);
    find(view, 'AirportField').props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul Airport' });
    view = h.host.render({ mapRequestId: 1 });
    assert.ok(find(view, 'Sheet', props => props.title === 'Plan on the map'));
    find(view, 'Sheet').props.onClose();
    view = h.host.render({ mapRequestId: 1 });
    assert.equal(find(view, 'Sheet'), undefined, 'Ordinary rerenders cannot reopen a dismissed survey');
    assert.equal(find(view, 'AirportField').props.value.city, 'Istanbul');
  } finally { h.host.dispose(); }
});

test('Selecting a ready destination closes the new-route overlay and keeps that destination actionable', () => {
  const h = plannerHarness({ seeded: false,keepMapOpen:true });
  try {
    const view = h.host.render({ surpriseRoute: route, routeSeedKind: 'explore' });
    assert.equal(find(view, 'Sheet'), undefined);
    assert.ok(selected(view));
    assert.ok(button(view, 'Save this plan'));
  } finally { h.host.dispose(); }
});

function deferredGeneration() {
  let resolve, reject;
  const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

for (const choice of ['discovery', 'ready route']) for (const outcome of ['success', 'failure', 'fallback']) test(`A newer ${choice} and its open editor survive an obsolete generation ${outcome}`, async () => {
  const h = plannerHarness({ seeded: false }), oldRequest = deferredGeneration();
  try {
    h.respondGeneration(oldRequest.promise);
    find(h.host.render(), 'AirportField').props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul Airport' });
    button(h.host.render(), 'Create Route').props.onClick(); await tick();
    assert.equal(h.generated.length, 1);
    let view;
    if (choice === 'discovery') view = h.host.render({ surpriseRoute: { ...route, name: 'Paris', country: 'France', destinationCode: 'CDG', dailyPlan: ['Paris walk'] }, routeSeedKind: 'explore' });
    else {
      const grid = find(h.host.render(), 'div', props => props.className === 'planner-photo-grid');
      find(grid, 'button').props.onClick();
      view = h.host.render();
    }
    const chosen = JSON.parse(JSON.stringify(find(view, 'RouteBudgetAnalysis').props));
    assert.equal(chosen.route.destinationCode, choice === 'discovery' ? 'CDG' : 'SJJ');
    assert.equal(button(view, 'Create Route').props.disabled, false, 'Selecting a new route releases the old loading state');
    button(view, 'Edit').props.onClick();
    find(find(h.host.render(), 'label', props => text(props.children).startsWith('New stop')), 'textarea').props.onChange({ target: { value: 'Unapplied edit for the new route' } });
    if (outcome === 'failure') oldRequest.reject(new TypeError('Old request failed'));
    else oldRequest.resolve(outcome === 'fallback' ? { success: false, isFallback: true, data: { summary: 'Old fallback', routes: [route] } } : { data: { summary: 'Old response', routes: [route] } });
    await tick(); view = h.host.render();
    assert.deepEqual(JSON.parse(JSON.stringify(find(view, 'RouteBudgetAnalysis').props)), chosen);
    assert.equal(find(find(view, 'label', props => text(props.children).startsWith('New stop')), 'textarea').props.value, 'Unapplied edit for the new route');
    assert.equal(find(view, 'RequestFailure'), undefined, 'An obsolete error must not attach a retry banner to the new selection');
    assert.equal(button(view, 'Create Route').props.disabled, false);
  } finally { h.host.dispose(); }
});

for (const outcome of ['success', 'failure', 'fallback']) test(`Applied stop edits survive a pending generation ${outcome} and allow a fresh request`, async () => {
  const h = plannerHarness(), oldRequest = deferredGeneration();
  try {
    const originalInput = JSON.parse(JSON.stringify(find(h.host.render(), 'RouteBudgetAnalysis').props.input));
    button(h.host.render(), 'Find other route ideas').props.onClick();
    find(h.host.render(), 'AirportField').props.onChange({ city: 'Istanbul', name: 'Istanbul Airport' });
    h.respondGeneration(oldRequest.promise);
    button(h.host.render(), 'Create Route').props.onClick(); await tick();
    button(h.host.render(), 'Edit').props.onClick();
    find(find(h.host.render(), 'label', props => text(props.children).startsWith('Stop 1')), 'textarea').props.onChange({ target: { value: 'Keep my manually selected museum stop' } });
    button(h.host.render(), 'Apply changes').props.onClick();
    const edited = JSON.parse(JSON.stringify(find(h.host.render(), 'RouteBudgetAnalysis').props));
    assert.equal(edited.route.dailyPlan[0], 'Keep my manually selected museum stop');
    assert.deepEqual(edited.input, originalInput);
    if (outcome === 'failure') oldRequest.reject(new TypeError('Obsolete request failed'));
    else oldRequest.resolve(outcome === 'fallback' ? { success: false, isFallback: true, data: { summary: 'Old fallback', routes: [route] } } : { data: { summary: 'Old response', routes: [route] } });
    await tick();
    let view = h.host.render();
    assert.deepEqual(JSON.parse(JSON.stringify(find(view, 'RouteBudgetAnalysis').props)), edited);
    assert.equal(find(view, 'RequestFailure'), undefined);
    assert.equal(button(view, 'Create Route').props.disabled, false);
    h.respondGeneration({ data: { summary: 'Requested after editing', routes: [{ ...route, dailyPlan: ['New explicitly requested itinerary'] }] } });
    button(view, 'Create Route').props.onClick(); await tick();
    view = h.host.render();
    assert.equal(h.generated.length, 2);
    assert.equal(find(view, 'RouteBudgetAnalysis').props.route.dailyPlan[0], 'New explicitly requested itinerary');
    assert.equal(button(view, 'Create Route').props.disabled, false);
  } finally { h.host.dispose(); }
});

test('Opening and cancelling stop edits leaves the pending generation active', async () => {
  const h = plannerHarness(), request = deferredGeneration();
  try {
    button(h.host.render(), 'Find other route ideas').props.onClick();
    find(h.host.render(), 'AirportField').props.onChange({ city: 'Istanbul', name: 'Istanbul Airport' });
    h.respondGeneration(request.promise);
    button(h.host.render(), 'Create Route').props.onClick(); await tick();
    button(h.host.render(), 'Edit').props.onClick();
    find(find(h.host.render(), 'label', props => text(props.children).startsWith('Stop 1')), 'textarea').props.onChange({ target: { value: 'Discarded edit' } });
    button(h.host.render(), 'Cancel').props.onClick();
    assert.equal(button(h.host.render(), 'Building').props.disabled, true);
    request.resolve({ data: { summary: 'Still wanted', routes: [{ ...route, dailyPlan: ['Requested itinerary'] }] } }); await tick();
    assert.equal(find(h.host.render(), 'RouteBudgetAnalysis').props.route.dailyPlan[0], 'Requested itinerary');
  } finally { h.host.dispose(); }
});

test('An obsolete response cannot unlock or replace a newer in-flight generation', async () => {
  const h = plannerHarness({ seeded: false }), oldRequest = deferredGeneration(), currentRequest = deferredGeneration();
  try {
    h.respondGeneration(oldRequest.promise);
    find(h.host.render(), 'AirportField').props.onChange({ city: 'Istanbul', name: 'Istanbul Airport' });
    button(h.host.render(), 'Create Route').props.onClick(); await tick();
    h.host.render({ surpriseRoute: { ...route, name: 'Paris', destinationCode: 'CDG' }, routeSeedKind: 'explore' });
    button(h.host.render(), 'Find other route ideas').props.onClick();
    h.respondGeneration(currentRequest.promise);
    button(h.host.render(), 'Create Route').props.onClick(); await tick();
    oldRequest.resolve({ data: { summary: 'Obsolete', routes: [route] } }); await tick();
    let view = h.host.render();
    assert.equal(text(find(selected(view), 'h2')), 'Paris');
    assert.equal(button(view, 'Building').props.disabled, true);
    button(view, 'Building').props.onClick(); await tick();
    assert.equal(h.generated.length, 2, 'Old finally must not release the new request lock');
    currentRequest.resolve({ data: { summary: 'Latest generation', routes: [{ ...route, name: 'Bodrum' }] } }); await tick();
    view = h.host.render();
    assert.equal(find(view, 'RouteBudgetAnalysis').props.route.name, 'Bodrum');
    assert.match(text(view), /Latest generation/);
    assert.equal(button(view, 'Create Route').props.disabled, false);
  } finally { h.host.dispose(); }
});

test('Changing language preserves saved identity while itinerary edits still create an independent saved plan', async () => {
  const h = plannerHarness();
  try {
    button(selected(h.host.render()), 'Save this plan').props.onClick(); await tick();
    const originalId = h.saves[0].id;
    for (const [locale, label] of [['tr', 'Kaydedildi'], ['sq', 'Saved'], ['en', 'Saved']]) {
      h.setLocale(locale);
      const save = button(h.host.render(), label);
      assert.ok(save, `${locale} retains the saved state`);
      save.props.onClick(); await tick();
      assert.equal(h.saves.length, 1, 'Translated entry labels cannot create a duplicate');
      assert.equal(h.saves[0].id, originalId);
    }
    button(h.host.render(), 'Edit').props.onClick();
    find(find(h.host.render(), 'label', props => text(props.children).startsWith('Stop 1')), 'textarea').props.onChange({ target: { value: 'A genuinely different first stop' } });
    button(h.host.render(), 'Apply changes').props.onClick();
    button(selected(h.host.render()), 'Save this plan').props.onClick(); await tick();
    assert.equal(h.saves.length, 2);
    assert.notEqual(h.saves[1].id, originalId);
    assert.equal(h.saves[1].plan.routes[0].dailyPlan[0], 'A genuinely different first stop');
  } finally { h.host.dispose(); }
});

test('Saved matching retains stop ordering, traveller inputs and verified entry facts independently of translated labels', () => {
  const identity = load('mobile/src/lib/savedRouteIdentity.ts', { './id': { createId: () => 'comparison-fixture' } });
  const input = { origin: 'Istanbul', vibe: ['Kültür'], passportCountry: 'TR', passportType: 'ordinary', currency: 'EUR', party: { adults: 1, children: 0, childAges: [] } };
  const plan = { summary: 'My itinerary', routes: [{ ...route, dailyPlan: ['First', 'Second'], verifiedEntryStatus: 'visa_required', visaSourceUrl: 'https://example.invalid/official', visaVerifiedAt: '2026-10-01' }] };
  const saved = identity.newSavedRoute(plan, input);
  const changed = () => JSON.parse(JSON.stringify({ input, plan }));
  const translated = changed(); translated.plan.routes[0].visaStatus = 'Vize gerekli'; translated.plan.routes[0].visaNote = 'Türkçe açıklama';
  assert.equal(identity.matchingSavedRoute([saved], translated.plan, translated.input)?.id, saved.id);
  for (const edit of [
    item => item.plan.routes[0].dailyPlan.reverse(),
    item => item.plan.routes[0].dailyPlan.push('Third'),
    item => { item.plan.routes[0].country = 'France'; },
    item => { item.plan.routes[0].verifiedEntryStatus = 'visa_free'; },
    item => { item.plan.routes[0].visaSourceUrl = 'https://example.invalid/new-source'; },
    item => { item.plan.routes[0].visaVerifiedAt = '2026-10-02'; },
    item => { item.input.party.adults = 2; },
    item => { item.input.currency = 'TRY'; },
    item => { item.input.passportType = 'special'; },
    item => { item.input.passportCountry = 'DE'; },
  ]) {
    const next = changed(); edit(next);
    assert.equal(identity.matchingSavedRoute([saved], next.plan, next.input), undefined);
  }
});

test('Welcome interests prefill a fresh planner and never overwrite its later edits',()=>{
  const h=plannerHarness({seeded:false,welcomeInterests:['Doğa','Kültür']});
  try{
    let view=h.host.render();
    button(view,'Preferences').props.onClick();view=h.host.render();
    assert.equal(button(view,'Nature').props['aria-pressed'],true);
    assert.equal(button(view,'Culture').props['aria-pressed'],true);
    assert.equal(button(view,'City').props['aria-pressed'],false);
    button(view,'Nature').props.onClick();view=h.host.render();
    assert.equal(button(view,'Nature').props['aria-pressed'],false);
    assert.equal(button(h.host.render(),'Nature').props['aria-pressed'],false);
  }finally{h.host.dispose();}
});

test('A discovered route is actionable first and saving it needs no origin or destination regeneration', async () => {
  const h = plannerHarness({account:false});
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
    button(selected(view), 'Go to My routes').props.onClick(); assert.deepEqual(h.navigations, ['trips']);
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
      if (settings.storageFails) { assert.equal(h.saves.length, 0); assert.equal(button(view, 'Go to My routes'), undefined); assert.match(h.notices[0], /could not be saved/); }
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
    assert.ok(button(h.host.render(), 'Go to My routes'));
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
    const h = plannerHarness({ seeded: false, placeName: failure.fixed ? 'Rome' : '' });
    try {
      const view = () => h.host.render();
      find(view(), 'AirportField', props => props.label === 'From?').props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Türkiye', countryCode: 'TR' });
      if (failure.fixed) {
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
  const h = plannerHarness({ seeded: false, placeName: 'Bodrum' });
  try {
    const view = () => h.host.render();
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

test('Saved library Places opens the unified saved map and its real library retains the same device store and owner scope', () => {
  const store = new Map(), events = new EventTarget(), host = hooks(), placesHost = hooks(), libraryHost = hooks(), navigations = [];
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
    const { TravelMapLibrary } = load('mobile/src/components/TravelMapLibrary.tsx', {
      ...common(libraryHost), './TravelSavedPlaces': { TravelSavedPlaces }, './Icon': { Icon: 'Icon' },
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
    const entry = find(view, 'button', props => props['data-section'] === 'places');
    assert.match(text(entry), /1 place · On this device/);
    assert.equal(find(view, TravelSavedPlaces), undefined, 'All shows a short entry rather than the whole place list');
    entry.props.onClick();
    const map = find(host.render(), 'LazyComponent', props => props.initialSection === 'saved'); assert.ok(map);
    assert.equal(map.props.ownerId, undefined);
    const library = TravelMapLibrary({ ownerId: map.props.ownerId, onSelectPlace() {}, onDirections() {}, onExplore: () => navigations.push('map') });
    libraryHost.start(library.type, library.props);
    const panel = find(libraryHost.render(), TravelSavedPlaces); assert.ok(panel); assert.equal(panel.props.hideMap, true);
    placesHost.start(TravelSavedPlaces, panel.props);
    const card = nodes(placesHost.render()).find(node => typeof node.type === 'function' && node.props?.item?.place.id === museum.id);
    assert.ok(card); assert.equal(card.props.item.note, 'Go after lunch'); assert.equal(card.props.name, museum.name);
    assert.match(text(placesHost.render()), /not uploaded to your account/);
    host.render({ ownerId: 'a-different-account' });
    assert.equal(find(host.render(), 'LazyComponent', props => props.initialSection === 'saved').props.ownerId, 'a-different-account');
    assert.equal(savedApi.readSavedPlaces().items[0].place.id, museum.id, 'Changing account scope does not migrate or remove device-only places');
    savedApi.deleteTravelPlace(museum.id);
    const empty = placesHost.render();
    const explore = button(empty, 'Find places on the map'); assert.ok(explore);
    assert.equal(button(empty, 'Open sightseeing map'), undefined);
    explore.props.onClick(); assert.deepEqual(navigations, ['map']);
    button(host.render(), 'All saved').props.onClick();
    assert.match(text(find(host.render(), 'button', props => props['data-section'] === 'places')), /Places in your account/);
    assert.equal(savedApi.readSavedPlaces('a-different-account').items.length, 0);
    assert.equal(store.size, 1); assert.ok(store.has(savedApi.SAVED_PLACES_KEY), 'The library never creates a duplicate place store');
  } finally { host.dispose(); placesHost.dispose(); libraryHost.dispose(); }
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
      button(articles[1],'Add this route to My trips').props.onClick();
      if (account) { assert.equal(intents.length,1);assert.equal(intents[0].route.name,'Bodrum');assert.equal(intents[0].routeIndex,1);assert.equal(intents[0].ownerId,'owner-a');assert.equal(intents[0].sourceRouteId,saved[0].id);assert.equal(login.length,0); }
      else {assert.equal(intents.length,0);assert.equal(login.length,1);}
    } finally {host.dispose();}
  }
});

function costNodes(tree) {
  if(!tree||typeof tree!=='object'||tree.props?.hidden||tree.type==='Sheet'&&!tree.props.open)return [];
  return [tree,...[tree.props?.children].flat(Infinity).flatMap(costNodes)];
}
const bundledImages=load('mobile/src/lib/bundledImageSource.ts');
let budgetCityPhotoModule;
function loadBudgetCityPhotos() {
  if (budgetCityPhotoModule) return budgetCityPhotoModule;
  const path = 'mobile/src/data/budgetCityPhotos.ts';
  const imports = Object.fromEntries(ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles.map(({ fileName }) => {
    if(fileName==='../lib/bundledImageSource')return[fileName,bundledImages];
    const asset = relative(process.cwd(), resolve(dirname(path), fileName)).replaceAll('\\', '/');
    assert.match(fileName, /\.(?:webp|jpg|png|json)$/, 'Budget city photos only import bundled assets and credits');
    return [fileName, { default: fileName.endsWith('.json') ? JSON.parse(readFileSync(asset, 'utf8')) : asset }];
  }));
  budgetCityPhotoModule = load(path, imports);
  return budgetCityPhotoModule;
}
const costLabels={
  en:{days:'Days',adults:'Adults',children:'Children',rooms:'Rooms / units',departure:'Departure',return:'Return',currency:'Currency',party:'Edit travellers and rooms',dates:'Edit duration and dates',clearDates:'Clear dates',done:'Done',show:'Show my budget',compare:'Show budgets',details:'View details',useTrip:'Use trip details',addTrip:'Add this estimate to My trips',accommodation:'Accommodation type',stars:'Hotel category',style:'Travel style',season:'Season',hotel:'Hotel',apartment:'Apartment',hostel:'Hostel',economical:'Economical',standard:'Standard',comfort:'Comfort',auto:'By date',low:'Quiet period',normal:'Normal period',high:'Busy period',extra:'Food and transport',roomType:'Room type',food:'Food',transport:'Local transport',activities:'Activities',allowance:'Activity allowance',buffer:'Contingency',holiday:'Holiday / major event',partial:'Activity budget missing'},
  tr:{days:'Gün',adults:'Yetişkin',children:'Çocuk',rooms:'Oda / daire',departure:'Gidiş',return:'Dönüş',currency:'Para birimi',party:'Kişi ve odaları düzenle',dates:'Süreyi ve tarihleri düzenle',clearDates:'Tarihleri kaldır',done:'Tamam',show:'Bütçemi göster',compare:'Bütçeleri göster',details:'Detayı gör',useTrip:'Bilgilerimi kullan',addTrip:'Bu tahmini seyahatlerime ekle',accommodation:'Konaklama türü',stars:'Otel sınıfı',style:'Seyahat tarzı',season:'Sezon',hotel:'Otel',apartment:'Daire',hostel:'Hostel',economical:'Ekonomik',standard:'Standart',comfort:'Konfor',auto:'Tarihe göre',low:'Sakin dönem',normal:'Normal dönem',high:'Yoğun dönem',extra:'Yemek ve ulaşım',roomType:'Oda türü',food:'Yeme içme',transport:'Şehir içi ulaşım',activities:'Etkinlikler',allowance:'Etkinlik payı',buffer:'Yedek bütçe',holiday:'Tatil / büyük etkinlik dönemi',partial:'Etkinlik bütçesi eksik'},
  sq:{days:'Ditë',adults:'Të rritur',children:'Fëmijë',rooms:'Dhoma / njësi',departure:'Nisja',return:'Kthimi',currency:'Monedha',party:'Ndrysho udhëtarët dhe dhomat',dates:'Ndrysho kohëzgjatjen dhe datat',clearDates:'Hiq datat',done:'U krye',show:'Shiko buxhetin',compare:'Shiko buxhetet',details:'Shiko hollësitë',useTrip:'Përdor të dhënat',addTrip:'Shto këtë vlerësim te Udhëtimet e mia',accommodation:'Lloji i akomodimit',stars:'Kategoria e hotelit',style:'Stili i udhëtimit',season:'Sezoni',hotel:'Hotel',apartment:'Apartament',hostel:'Hostel',economical:'Ekonomik',standard:'Standard',comfort:'Rehati',auto:'Sipas datës',low:'Periudhë e qetë',normal:'Periudhë normale',high:'Periudhë e ngarkuar',extra:'Ushqimi dhe transporti',roomType:'Lloji i dhomës',food:'Ushqimi',transport:'Transporti lokal',activities:'Aktivitetet',allowance:'Aktivitete ·',buffer:'Buxhet rezervë',holiday:'Festë / event i madh',partial:'Mungon buxheti i aktiviteteve'},
};
function costHarness({preferences={},locale:initialLocale='en',activeTrip=null,dailyFactory,quote=null,ownerId='owner-a'}={}){
  const host=hooks(),intents=[],saved=[],openedNews=[],openedExternal=[];let locale=initialLocale,active=activeTrip;
  const benchmarks=load('lib/country-intelligence/city-benchmarks.ts'),personal=load('lib/country-intelligence/personal-budget.ts'),budget=load('lib/country-intelligence/trip-budget.ts');
  const photos=loadBudgetCityPhotos();
  const destinationSearch=load('mobile/src/lib/budgetDestinationSearch.ts',{'../../../lib/country-intelligence/city-benchmarks':benchmarks,'./localeFormatting':localeFormatting,'./searchText':search});
  const activityInput=load('mobile/src/lib/budgetActivityInput.ts');
  const intentModule=load('mobile/src/lib/budgetCockpitIntent.ts',{'../../../lib/country-intelligence/city-benchmarks':benchmarks,'../../../lib/country-intelligence/trip-budget':budget,'../../../lib/country-intelligence/personal-budget':personal});
  const fakeDaily={useDailyBudgetRate:currency=>({quote,rate:budget.usableBudgetRate(quote,currency),loading:false,failed:currency!=='GBP'&&budget.usableBudgetRate(quote,currency)===null})};
  const {CityPriceCatalog}=load('mobile/src/components/CityPriceCatalog.tsx',{
    ...common(host),'../lib/i18n':{useI18n:()=>({locale,copy:(tr,en,sq)=>locale==='tr'?tr:locale==='sq'?sq||en:en})},
    '../data/budgetCityPhotos':photos,
    '../lib/budgetDestinationSearch':destinationSearch,
    '../lib/budgetActivityInput':activityInput,
    '../lib/bundledImageSource':bundledImages,
    '../../../lib/country-intelligence/city-benchmarks':benchmarks,'../../../lib/country-intelligence/personal-budget':personal,'../../../lib/country-intelligence/trip-budget':budget,
    '../../../lib/country-intelligence/route-budget':{routeCityBenchmark:route=>benchmarks.CITY_BENCHMARKS.find(row=>[row.city.en,row.city.tr].includes(route.name)&&row.code===route.country)||null},
    '../lib/activeTripContext':{useActiveTripContext:()=>active},'../lib/useDailyBudgetRate':dailyFactory?dailyFactory(host,budget):fakeDaily,
    '../lib/personalBudgetPreferences':{readPersonalBudgetPreferences:()=>({...personal.DEFAULT_PERSONAL_BUDGET,currency:'GBP',...preferences}),savePersonalBudgetPreferences:(value,owner)=>saved.push({value:{...value},owner})},
    '../lib/budgetCockpitIntent':intentModule,'../lib/native':{openExternal:url=>openedExternal.push(url)},'./Sheet':{Sheet:'Sheet'},'./CountryFlag':{CountryFlag:'Flag'},'./CountryAdvisory':{CountryAdvisory:'Advisory'},'./Icon':{Icon:'Icon'},'./DestinationPhoto':{DestinationPhoto:'DestinationPhoto'},
    '../assets/budget/hotel-v2.webp':{default:'mock://budget/hotel-v2.webp'},'../assets/budget/apartment-v2.webp':{default:'mock://budget/apartment-v2.webp'},'../assets/budget/hostel-v2.webp':{default:'mock://budget/hostel-v2.webp'},
    '../assets/budget/comfort-economical-v2.webp':{default:'mock://budget/comfort-economical-v2.webp'},
    '../assets/budget/comfort-standard-v2.webp':{default:'mock://budget/comfort-standard-v2.webp'},
    '../assets/budget/comfort-comfort-v2.webp':{default:'mock://budget/comfort-comfort-v2.webp'},
  });
  const h={host,intents,saved,personal,benchmarks,budget,photos:photos.BUDGET_CITY_PHOTOS,destinationSearch,intentModule,openedNews,openedExternal,
    get labels(){return costLabels[locale];},get locale(){return locale;},
    render:()=>host.render(),nodes:()=>costNodes(host.render()),text:()=>text(host.render()),
    findButton(name){return costNodes(host.render()).find(node=>node.type==='button'&&(node.props['aria-label']===name||text(node).trim()===name||text(node).startsWith(name)));},
    tap(name){const target=h.findButton(name);assert.ok(target,`Visible cost action: ${name}`);assert.notEqual(target.props.disabled,true,`${name} is enabled`);target.props.onClick();return host.render();},
    field(name,required=true){const label=costNodes(host.render()).find(node=>node.type==='label'&&text(node).trim().startsWith(name));const control=label&&costNodes(label).find(node=>node.type==='input'||node.type==='select');if(required)assert.ok(control,`Visible cost field: ${name}`);return control;},
    change(name,value){h.field(name).props.onChange({target:{value}});return host.render();},
    check(name,value){h.field(name).props.onChange({target:{checked:value}});return host.render();},
    group(name,required=true){const group=costNodes(host.render()).find(node=>node.props.role==='group'&&node.props['aria-label']===name);if(required)assert.ok(group,`Visible choice group: ${name}`);return group;},
    choices(name){return costNodes(h.group(name)).filter(node=>node.type==='button');},
    selected(name){const selected=h.choices(name).filter(node=>node.props['aria-pressed']===true);assert.equal(selected.length,1,`Exactly one selected choice in ${name}`);return selected[0].props['aria-label'];},
    choose(name,label){const choice=h.choices(name).find(node=>node.props['aria-label']===label);assert.ok(choice,`Visible ${name} option: ${label}`);assert.notEqual(choice.props.disabled,true);choice.props.onClick();return host.render();},
    starLabel(value){return locale==='tr'?`${value} yıldızlı otel`:locale==='sq'?`Hotel me ${value} yje`:`${value}-star hotel`;},
    extra(){const disclosure=costNodes(host.render()).find(node=>node.type==='details'&&costNodes(node).some(child=>child.type==='summary'&&text(child).includes(h.labels.extra)));assert.ok(disclosure,`Native disclosure: ${h.labels.extra}`);return disclosure;},
    additional(){const disclosure=costNodes(host.render()).find(node=>node.type==='details'&&node.props.className?.split(' ').includes('budget-additional-options'));assert.ok(disclosure,'Activities and contingency use their own disclosure');return disclosure;},
    extraField(name,required=true){const section=[h.labels.activities,h.labels.allowance,h.labels.buffer].includes(name)?h.additional():h.extra();const label=costNodes(section).find(node=>node.type==='label'&&text(node).trim().startsWith(name));const control=label&&costNodes(label).find(node=>node.type==='input'||node.type==='select');if(required)assert.ok(control,`Secondary cost field: ${name}`);return control;},
    changeExtra(name,value){h.extraField(name).props.onChange({target:{value}});return host.render();},
    summary(name){const action=h.findButton(name),id=action?.props['aria-describedby'];assert.ok(id,`Accessible summary for ${name}`);return text(costNodes(host.render()).find(node=>node.props.id===id));},
    rows(){return costNodes(host.render()).filter(node=>node.type==='button'&&text(node).includes(h.labels.details));},
    rowName(row){return text(costNodes(row).find(node=>node.type==='strong'&&benchmarks.CITY_BENCHMARKS.some(item=>[item.city.tr,item.city.en].includes(text(node)))));},
    range(row){return text(costNodes(row).find(node=>node.type==='strong'&&!benchmarks.CITY_BENCHMARKS.some(item=>[item.city.tr,item.city.en].includes(text(node)))));},
    rowSource(row){const name=h.rowName(row);return benchmarks.CITY_BENCHMARKS.find(item=>[item.city.tr,item.city.en].includes(name));},
    query(value){costNodes(host.render()).find(node=>node.type==='input'&&node.props.type==='search').props.onChange({target:{value}});return host.render();},
    queryValue(){return costNodes(host.render()).find(node=>node.type==='input'&&node.props.type==='search').props.value;},
    searchInput(){return costNodes(host.render()).find(node=>node.type==='input'&&node.props.type==='search');},
    focusSearch(){h.searchInput().props.onFocus();return host.render();},
    searchOptions(){return costNodes(host.render()).filter(node=>node.props.role==='option');},
    searchOption(name){return h.searchOptions().find(node=>text(costNodes(node).find(child=>child.type==='strong'))===name);},
    chooseSearchOption(name){const option=h.searchOption(name);assert.ok(option,`Visible destination suggestion: ${name}`);option.props.onClick();return host.render();},
    keySearch(key,extra={}){let prevented=false;h.searchInput().props.onKeyDown({key,preventDefault(){prevented=true;},stopPropagation(){},nativeEvent:{isComposing:false},...extra});host.render();return prevented;},
    blurSearch(inside=false){const wrapper=costNodes(host.render()).find(node=>node.props.className==='budget-destination-search');wrapper.props.onBlur({currentTarget:{contains:()=>inside},relatedTarget:{}});return host.render();},
    openSheet(){return costNodes(host.render()).findLast(node=>node.type==='Sheet');},
    close(){const sheet=h.openSheet();assert.ok(sheet,'A cost editor or detail is open');sheet.props.onClose();return host.render();},
    openDetail(row=h.rows()[0]){assert.ok(row,'A real city estimate is visible');row.props.onClick();return host.render();},
    detailTotal(){const total=costNodes(h.openSheet()).find(node=>node.props.className==='budget-detail-total');return text(costNodes(total).find(node=>node.type==='strong'));},
    setActive(value){active=value;return host.render();},language(value){locale=value;return host.render();},dispose:()=>host.dispose(),
  };
  host.start(CityPriceCatalog,{ownerId,onOpenCountryNews:code=>openedNews.push(code),onPrepareCockpitBudget:intent=>intents.push(intent)});return h;
}

test('Costs destination suggestions find Serbia from plain or Turkish keyboards and choose its real Belgrade estimate without saving preferences',()=>{
  const h=costHarness({locale:'tr',preferences:{days:'5',adults:'3',rooms:'2',style:'comfort',season:'low'}});
  try{
    const duration=h.summary(h.labels.dates),party=h.summary(h.labels.party);
    for(const query of ['sır','sir','sirbistan','SIRBISTAN','  Sırbistan  ']){
      h.focusSearch();h.query(query);
      assert.equal(h.searchInput().props.role,'combobox');assert.equal(h.searchInput().props['aria-expanded'],true);
      const option=h.searchOption('Sırbistan');assert.ok(option,`Serbia is offered for ${query}`);assert.equal(text(costNodes(option).find(node=>node.type==='small')),'Belgrad');
      assert.ok(h.rows().some(row=>h.rowSource(row).id==='RS-belgrade'),'Typing and suggestions use the same country aliases');
      h.chooseSearchOption('Sırbistan');assert.equal(h.queryValue(),'Sırbistan');assert.equal(h.searchInput().props['aria-expanded'],false);assert.equal(h.searchOptions().length,0);
      assert.equal(h.rows().length,1);const row=h.rows()[0];assert.equal(h.rowSource(row).id,'RS-belgrade');const photo=costNodes(row).find(node=>node.type==='DestinationPhoto');assert.equal(photo.props.src,h.photos['RS-belgrade'].src);assert.equal(photo.props.countryCode,'RS');
      assert.equal(h.summary(h.labels.dates),duration);assert.equal(h.summary(h.labels.party),party);assert.equal(h.selected(h.labels.style),h.labels.comfort);assert.equal(h.selected(h.labels.season),h.labels.low);
    }
    assert.equal(h.saved.length,0);assert.equal(h.intents.length,0);
  }finally{h.dispose();}
});

test('Costs country suggestions filter all researched cities and city suggestions resolve one exact place in every language',()=>{
  for(const locale of ['tr','en','sq']){
    const h=costHarness({locale});
    try{
      const france=localeFormatting.appRegionName('FR',locale);h.focusSearch();h.query('France');assert.ok(h.searchOption(france),'Country aliases work independently of UI language');h.chooseSearchOption(france);
      assert.equal(h.queryValue(),france);const expected=h.benchmarks.CITY_BENCHMARKS.filter(row=>row.code==='FR').map(row=>row.id).sort();assert.deepEqual(h.rows().map(row=>h.rowSource(row).id).sort(),Array.from(expected));
      h.focusSearch();h.query('Roma');const rome=locale==='tr'?'Roma':'Rome';assert.ok(h.searchOption(rome));h.chooseSearchOption(rome);assert.equal(h.rows().length,1);assert.equal(h.rowSource(h.rows()[0]).id,'IT-rome');assert.equal(h.searchInput().props['aria-expanded'],false);
      h.query('sir');const serbia=localeFormatting.appRegionName('RS',locale);assert.ok(h.searchOption(serbia));h.chooseSearchOption(serbia);assert.equal(h.rowSource(h.rows()[0]).id,'RS-belgrade','Changing a selected city clears its exact-place filter');
      h.focusSearch();h.query('Definitely-no-city-84721');assert.equal(h.searchOptions().length,0);assert.equal(h.rows().length,0);assert.equal(h.nodes().some(node=>node.type==='DestinationPhoto'),false);assert.ok(h.nodes().some(node=>node.props.role==='status'),'Unavailable destination feedback is announced next to search');
      h.query('');assert.equal(h.searchInput().props['aria-expanded'],false);assert.equal(h.searchOptions().length,0);assert.ok(h.rows().length>1);assert.equal(h.saved.length,0);assert.equal(h.intents.length,0);
    }finally{h.dispose();}
  }
});

test('Costs combobox supports keyboard selection, Escape, Tab, composition and focus leaving the suggestion group',()=>{
  const h=costHarness({locale:'tr'});
  try{
    h.focusSearch();h.query('Roma');const options=h.searchOptions();assert.ok(options.length>1);assert.equal(text(costNodes(options[0]).find(node=>node.type==='strong')),'Roma','An exact city match precedes a partial country match');
    assert.equal(h.searchInput().props['aria-autocomplete'],'list');const popup=h.nodes().find(node=>node.props.role==='listbox');assert.equal(h.searchInput().props['aria-controls'],popup.props.id);
    assert.equal(h.keySearch('ArrowDown'),true);const active=h.searchOptions().filter(node=>node.props['aria-selected']);assert.equal(active.length,1);assert.equal(h.searchInput().props['aria-activedescendant'],active[0].props.id);
    h.keySearch('ArrowUp');assert.equal(h.searchOptions().at(-1).props['aria-selected'],true,'Up wraps to the final visible suggestion');h.keySearch('ArrowDown');assert.equal(h.searchOptions()[0].props['aria-selected'],true);
    h.keySearch('Enter',{nativeEvent:{isComposing:true}});assert.equal(h.queryValue(),'Roma');assert.equal(h.searchInput().props['aria-expanded'],true,'IME confirmation cannot accidentally select a destination');
    assert.equal(h.keySearch('Enter'),true);assert.equal(h.rows().length,1);assert.equal(h.rowSource(h.rows()[0]).id,'IT-rome');assert.equal(h.searchInput().props['aria-expanded'],false);
    h.focusSearch();h.query('sir');assert.equal(h.keySearch('Escape'),true);assert.equal(h.searchInput().props['aria-expanded'],false);assert.equal(h.queryValue(),'sir');assert.equal(h.rows().length,1);
    h.focusSearch();h.keySearch('Tab');assert.equal(h.searchInput().props['aria-expanded'],false);assert.equal(h.queryValue(),'sir');
    h.focusSearch();h.blurSearch(true);assert.equal(h.searchInput().props['aria-expanded'],true,'Moving within the suggestion group keeps options available');h.blurSearch(false);assert.equal(h.searchInput().props['aria-expanded'],false,'Moving outside closes suggestions without clearing text');assert.equal(h.queryValue(),'sir');
    h.focusSearch();assert.equal(h.searchOptions().length,1);assert.equal(h.keySearch('Enter'),true,'A single suggestion can be accepted directly');assert.equal(h.queryValue(),'Sırbistan');assert.equal(h.rowSource(h.rows()[0]).id,'RS-belgrade');
    assert.equal(h.saved.length,0);assert.equal(h.intents.length,0);
  }finally{h.dispose();}
});

test('Choosing a suggested country or city keeps first-time users in the configuration until they deliberately show the budget',()=>{
  const h=costHarness({locale:'tr'}),focus=[],scroll=[];
  try{
    const heading=h.nodes().find(node=>node.type==='h2'&&node.props.ref);heading.props.ref.current={focus:options=>focus.push(options),scrollIntoView:options=>scroll.push(options)};
    h.focusSearch();h.query('sir');h.chooseSearchOption('Sırbistan');assert.equal(h.rowSource(h.rows()[0]).id,'RS-belgrade');assert.equal(h.searchInput().props['aria-expanded'],false);
    h.focusSearch();h.query('Paris');h.keySearch('ArrowDown');h.keySearch('Enter');assert.equal(h.rowSource(h.rows()[0]).id,'FR-paris');
    assert.equal(focus.length,0,'Picking a place does not skip over dates, party or preferences');assert.equal(scroll.length,0);
    assert.equal(h.summary(h.labels.dates),'3 gün · 2 gece');assert.equal(h.summary(h.labels.party),'2 yetişkin · 1 oda');
    h.tap(h.labels.show);assert.equal(focus.length,1);assert.equal(scroll.length,1);assert.equal(scroll[0].block,'start');assert.equal(h.saved.length,0);assert.equal(h.intents.length,0);
  }finally{h.dispose();}
});

test('Accommodation exposes the room type directly and optional food and extra budgets stay in correctly named separate sections',()=>{
  for(const locale of ['tr','en','sq']){
    const h=costHarness({locale});
    try{
      assert.deepEqual(h.choices(h.labels.accommodation).map(node=>node.props['aria-label']),[h.labels.hostel,h.labels.apartment,h.labels.hotel]);
      const stay=h.nodes().find(node=>node.type==='fieldset'&&node.props.className?.includes('budget-accommodation-options'));
      assert.ok(costNodes(stay).some(node=>node.type==='label'&&text(node).trim().startsWith(h.labels.roomType)),'Room type is visible with accommodation');
      assert.equal(costNodes(h.extra()).some(node=>node.type==='label'&&[h.labels.roomType,h.labels.activities,h.labels.buffer].some(label=>text(node).trim().startsWith(label))),false,'Food and transport does not hide unrelated settings');
      const additional=h.additional();assert.notEqual(additional.props.open,true);for(const label of [h.labels.activities,h.labels.buffer])assert.ok(costNodes(additional).some(node=>node.type==='label'&&text(node).trim().startsWith(label)));
      h.choose(h.labels.accommodation,h.labels.hostel);assert.equal(h.field(h.labels.roomType,false),undefined);assert.equal(h.group(h.labels.stars,false),undefined);
      h.choose(h.labels.accommodation,h.labels.apartment);assert.equal(h.field(h.labels.roomType).props.value,'double');assert.equal(h.group(h.labels.stars,false),undefined);
      h.choose(h.labels.accommodation,h.labels.hotel);h.change(h.labels.roomType,'family');assert.equal(h.field(h.labels.roomType).props.value,'family');h.tap(h.labels.party);assert.equal(h.field(h.labels.rooms).props.value,'1');h.close();
    }finally{h.dispose();}
  }
});

test('Missing budget labels name the unpriced item instead of presenting an unexplained partial estimate',()=>{
  for(const locale of ['tr','en','sq']){
    const h=costHarness({locale});
    try{
      h.query('Paris');h.changeExtra(h.labels.activities,'paid');
      const tag=()=>text(costNodes(h.rows()[0]).find(node=>node.props.className==='budget-estimate-tag'));
      assert.equal(tag(),h.labels.partial);h.changeExtra(h.labels.allowance,'0');assert.notEqual(tag(),h.labels.partial,'An explicitly free activity allowance completes this item');
      h.changeExtra(h.labels.activities,'free');h.query('Serbia');h.changeExtra(h.labels.transport,'taxi');
      assert.equal(tag(),{tr:'Taksi bütçesi eksik',en:'Taxi budget missing',sq:'Mungon buxheti i taksisë'}[locale]);assert.equal(h.rowSource(h.rows()[0]).id,'RS-belgrade');
      assert.equal(h.intents.length,0);
    }finally{h.dispose();}
  }
});

test('Activity allowance follows the usable display currency while retaining canonical GBP values and the exact amount being typed',()=>{
  let quote=null;
  const h=costHarness({preferences:{currency:'TRY',activities:'paid',activityAllowance:'10.50'},dailyFactory:(_host,budget)=>({useDailyBudgetRate:currency=>({quote,rate:budget.usableBudgetRate(quote,currency),loading:false,failed:currency!=='GBP'&&budget.usableBudgetRate(quote,currency)===null})})});
  try{
    h.query('Paris');assert.match(h.extraField(h.labels.allowance).props['aria-label'],/GBP/);assert.equal(Number(h.extraField(h.labels.allowance).props.value),10.5);assert.equal(h.saved.length,0);
    quote={base:'GBP',quote:'TRY',rate:66,date:new Date().toISOString().slice(0,10)};h.render();assert.match(h.extraField(h.labels.allowance).props['aria-label'],/TRY/);assert.equal(Number(h.extraField(h.labels.allowance).props.value),693);assert.equal(h.saved.length,0,'A quote appearing cannot rewrite a saved allowance');
    h.changeExtra(h.labels.allowance,'660');assert.equal(h.extraField(h.labels.allowance).props.value,'660');assert.equal(Number(h.saved.at(-1).value.activityAllowance),10);
    h.changeExtra(h.labels.allowance,'0.01');assert.equal(h.extraField(h.labels.allowance).props.value,'0.01','Sub-pound local amounts do not jump while being typed');const canonical=Number(h.saved.at(-1).value.activityAllowance);assert.ok(canonical>0&&Math.abs(canonical-0.01/66)<0.000001);
    h.openDetail();h.tap(h.labels.addTrip);const intent=h.intents.at(-1);assert.equal(Number(intent.personalPreferences.activityAllowance),canonical);assert.equal(intent.estimate.activities,canonical*6);assert.equal(h.intentModule.validateBudgetCockpitIntent(intent),true);
    h.change(h.labels.currency,'GBP');assert.match(h.extraField(h.labels.allowance).props['aria-label'],/GBP/);h.changeExtra(h.labels.allowance,'5.50');assert.equal(h.extraField(h.labels.allowance).props.value,'5.50');assert.equal(h.saved.at(-1).value.activityAllowance,'5.50','Existing GBP input and snapshots preserve their original precision');
    quote={base:'GBP',quote:'EUR',rate:2,date:new Date().toISOString().slice(0,10)};h.change(h.labels.currency,'EUR');assert.match(h.extraField(h.labels.allowance).props['aria-label'],/EUR/);assert.equal(Number(h.extraField(h.labels.allowance).props.value),11);assert.equal(h.saved.at(-1).value.activityAllowance,'5.50','Changing display currency never reinterprets the stored GBP amount');
  }finally{h.dispose();}
});

test('Spending style explains its scope and automatic season names the period while retaining a deliberate manual choice',()=>{
  const words={tr:{style:'Harcama tarzı',scope:'Konaklama, yemek ve ulaşım',normal:'Tarihe göre: Normal',low:'Tarihe göre: Sakin',high:'Tarihe göre: Yoğun'},en:{style:'Spending style',scope:'accommodation, food and transport',normal:'By date: Normal',low:'By date: Quiet',high:'By date: Busy'},sq:{style:'Stili i shpenzimeve',scope:'akomodim, ushqim dhe transport',normal:'Sipas datës: Normal',low:'Sipas datës: E qetë',high:'Sipas datës: E ngarkuar'}};
  for(const locale of ['tr','en','sq']){
    const h=costHarness({locale});
    try{
      const style=h.nodes().find(node=>node.type==='fieldset'&&node.props.className?.includes('budget-comfort-options'));assert.equal(text(costNodes(style).find(node=>node.type==='legend')),words[locale].style);assert.ok(text(style).includes(words[locale].scope));
      const autoName=()=>text(costNodes(h.choices(h.labels.season).find(node=>node.props['aria-label']===h.labels.auto)).find(node=>node.type==='strong'));
      assert.equal(autoName(),words[locale].normal);
      h.tap(h.labels.dates);h.change(h.labels.departure,'2027-01-02');h.change(h.labels.return,'2027-01-05');h.close();assert.equal(autoName(),words[locale].low);
      h.choose(h.labels.season,h.labels.low);h.tap(h.labels.dates);h.change(h.labels.departure,'2027-07-02');h.change(h.labels.return,'2027-07-05');h.close();assert.equal(autoName(),words[locale].high);assert.equal(h.selected(h.labels.season),h.labels.low,'Date changes do not silently override a deliberate manual period');
      h.choose(h.labels.season,h.labels.auto);assert.equal(h.selected(h.labels.season),h.labels.auto);assert.equal(autoName(),words[locale].high);
    }finally{h.dispose();}
  }
});

test('Result totals identify the whole party and their edit action returns to the existing preferences without saving or resetting them',()=>{
  for(const locale of ['tr','en','sq']){
    const h=costHarness({locale,preferences:{days:'5',adults:'3',rooms:'2',style:'comfort',season:'low'}}),focus=[],scroll=[];
    try{
      h.query('Paris');const row=h.rows()[0],total=costNodes(row).find(node=>node.props.className==='budget-row-total');
      assert.equal(text(costNodes(total).find(node=>node.type==='small')),{tr:'3 kişi için toplam · uçuş hariç',en:'Total for 3 people · flights excluded',sq:'Totali për 3 persona · pa fluturime'}[locale]);
      const action=h.findButton(h.labels.dates);assert.ok(action.props.ref);action.props.ref.current={focus:options=>focus.push(options),scrollIntoView:options=>scroll.push(options)};
      const edit={tr:'Bütçe tercihlerini düzenle',en:'Edit budget preferences',sq:'Ndrysho preferencat e buxhetit'}[locale];const range=h.range(row);h.tap(edit);assert.equal(focus.length,1);assert.equal(focus[0].preventScroll,true);assert.equal(scroll.length,1);assert.equal(scroll[0].block,'center');
      assert.equal(h.queryValue(),'Paris');assert.equal(h.range(h.rows()[0]),range);assert.equal(h.selected(h.labels.style),h.labels.comfort);assert.equal(h.selected(h.labels.season),h.labels.low);assert.equal(h.saved.length,0);assert.equal(h.intents.length,0);
      h.tap(h.labels.dates);assert.equal(h.field(h.labels.days).props.value,'5');h.close();h.tap(h.labels.party);assert.equal(h.field(h.labels.adults).props.value,'3');assert.equal(h.field(h.labels.rooms).props.value,'2');h.close();
    }finally{h.dispose();}
  }
});

test('City budget detail sends its selected city, travellers and duration as a dated estimate, retaining GBP without a usable foreign rate',()=>{
  const h=costHarness({preferences:{adults:'3',rooms:'2'}});
  try{
    const city=h.rows()[0],name=h.rowName(city);h.openDetail(city);
    assert.match(h.text(),/Estimate for 3 days · 3 travellers/);
    h.tap(h.labels.addTrip);
    assert.equal(h.intents.length,1);const intent=h.intents[0];assert.equal(intent.city,name);assert.equal(intent.ownerId,'owner-a');assert.equal(intent.estimate.days,3);assert.equal(intent.estimate.people,3);assert.equal(intent.displayCurrency,'GBP');assert.equal(intent.displayTotal,intent.estimate.total);assert.equal(intent.sourceMonth,'2026-05');
    assert.equal(intent.model,'personal-budget-v1');assert.equal(intent.estimate.rooms,2);assert.ok(intent.estimate.totalRange.high>intent.displayTotal);assert.equal(h.intentModule.validateBudgetCockpitIntent(intent),true);
  }finally{h.dispose();}
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


test('Personal costs recover FX automatically, recalculate party and rooms, sort consistently and retain detail ranges',async()=>{
  const waiting=[],events=new Map();
  const h=costHarness({preferences:{currency:'EUR',days:'7',adults:'3',rooms:'2'},dailyFactory:(host,budget)=>load('mobile/src/lib/useDailyBudgetRate.ts',{
    react:host.react,'../../../lib/country-intelligence/trip-budget':budget,'./travelAssistant':{storedQuote:()=>null,loadQuote:(base,quote)=>new Promise((resolve,reject)=>waiting.push({base,quote,resolve,reject}))},
  },{window:{setInterval:()=>1,clearInterval(){},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}})});
  try{
    assert.equal(h.openSheet(),undefined,'Optional form controls start closed');
    const nodes=h.nodes(),search=nodes.find(node=>node.type==='input'&&node.props.type==='search'),heading=nodes.find(node=>node.type==='h2'&&text(node)==='City budgets'),firstScene=nodes.find(node=>node.type==='button'&&text(node).includes(h.labels.details));
    assert.ok(heading,'The initial comparison has an accessible results heading');
    assert.ok(nodes.indexOf(search)<nodes.indexOf(heading),'Destination search precedes the comparison results in reading order');
    assert.ok(nodes.indexOf(heading)<nodes.indexOf(firstScene),'The results heading precedes its priced city scenes');
    assert.equal(h.field(h.labels.adults,false),undefined);assert.equal(h.field(h.labels.departure,false),undefined);assert.equal(h.field(h.labels.accommodation,false),undefined);
    assert.ok(h.rows().length,'Real budget ranges are available before opening an editor');
    waiting[0].reject(Error('offline'));await tick();
    assert.match(h.text(),/Estimates are shown in GBP/);assert.match(h.range(h.rows()[0]),/£/);assert.doesNotMatch(h.range(h.rows()[0]),/€/);
    assert.equal(h.findButton('Refresh rate'),undefined);assert.doesNotMatch(h.text(),/Source basket|Reference rate|CPI/);
    events.get('online')();h.render();waiting[1].resolve({base:'GBP',quote:'EUR',rate:2,date:new Date().toISOString().slice(0,10)});await tick();
    assert.match(h.range(h.rows()[0]),/€/);assert.doesNotMatch(h.text(),/Estimates are shown in GBP/);
    const before=h.range(h.rows()[0]);h.tap(h.labels.dates);h.change(h.labels.days,'2');h.tap(h.labels.done);assert.notEqual(h.range(h.rows()[0]),before);
    h.tap(h.labels.party);h.change(h.labels.adults,'1');assert.equal(h.field(h.labels.rooms).props.value,'1');h.tap(h.labels.done);
    const firstCity=h.rowName(h.rows()[0]),source=h.rowSource(h.rows()[0]),expected=h.personal.personalTripBudget(source,{...h.personal.DEFAULT_PERSONAL_BUDGET,days:'2',adults:'1'});
    const format=n=>new Intl.NumberFormat('en',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n*2),expectedRange=`${format(expected.totalRange.low)} – ${format(expected.totalRange.high)}`;
    assert.equal(h.range(h.rows()[0]),expectedRange);h.openDetail();assert.equal(h.detailTotal(),expectedRange);assert.match(h.text(),/Food · all meals/);h.close();
    const sort=()=>costNodes(h.render()).find(node=>node.type==='select'&&node.props['aria-label']==='City order');
    sort().props.onChange({target:{value:'high'}});h.render();assert.notEqual(h.rowName(h.rows()[0]),firstCity);
    sort().props.onChange({target:{value:'price'}});h.render();assert.equal(h.rowName(h.rows()[0]),firstCity);
    h.change(h.labels.currency,'USD');assert.equal(waiting[2].quote,'USD');assert.match(h.range(h.rows()[0]),/£/);assert.doesNotMatch(h.range(h.rows()[0]),/€|\$/,'A previous EUR rate never prices the new USD selection');
    waiting[2].resolve({base:'GBP',quote:'USD',rate:3,date:new Date().toISOString().slice(0,10)});await tick();assert.match(h.range(h.rows()[0]),/\$/);
    h.tap(h.labels.dates);h.change(h.labels.days,'');assert.match(h.text(),/Choose 1–30 whole days/);assert.equal(h.range(h.rows()[0]),'—');assert.equal(h.findButton(h.labels.compare).props.disabled,true);
  }finally{h.dispose();}
});

test('Costs use selected trip dates and party only on request and preserve edits when the active trip changes',()=>{
  const h=costHarness();
  try{
    h.tap(h.labels.party);h.change(h.labels.adults,'4');h.tap(h.labels.done);
    h.setActive({tripId:'rome',title:'Rome holiday',city:'Rome',countryCode:'IT',startDate:'2027-07-01',endDate:'2027-07-04',adults:2,children:1});
    h.tap(h.labels.party);assert.equal(h.field(h.labels.adults).props.value,'4');h.close();
    h.tap(h.labels.dates);assert.equal(h.field(h.labels.departure).props.value,'');h.close();
    h.tap(h.labels.useTrip);assert.equal(h.queryValue(),'Rome');h.tap(h.labels.dates);assert.equal(h.field(h.labels.days).props.value,4);assert.equal(h.field(h.labels.days).props.disabled,true);h.close();
    h.tap(h.labels.party);assert.equal(h.field(h.labels.adults).props.value,'2');assert.equal(h.field(h.labels.children).props.value,'1');assert.equal(h.field(h.labels.rooms).props.value,'2');
    h.change(h.labels.adults,'3');h.close();h.setActive({tripId:'paris',title:'Paris',city:'Paris',countryCode:'FR',startDate:'2027-08-01',endDate:'2027-08-03',adults:1});
    h.tap(h.labels.party);assert.equal(h.field(h.labels.adults).props.value,'3');h.close();assert.equal(h.queryValue(),'Rome');assert.doesNotMatch(h.text(),/Trip details applied/);
  }finally{h.dispose();}
});

test('Progressive Costs labelled rows and direct choices expose their values and scope, and estimate actions only move focus',()=>{
  const expected={
    en:{rows:['Duration','Guests / rooms'],duration:'3 days · 2 nights',party:'2 adults · 1 room',scope:'Accommodation, food and local transport estimate.',excluded:'Flights excluded.'},
    tr:{rows:['Süre','Kişi / oda'],duration:'3 gün · 2 gece',party:'2 yetişkin · 1 oda',scope:'Konaklama, yemek ve şehir içi ulaşım tahmini.',excluded:'Uçuş hariç.'},
    sq:{rows:['Kohëzgjatja','Persona / dhoma'],duration:'3 ditë · 2 net',party:'2 të rritur · 1 dhomë',scope:'Vlerësim për akomodimin, ushqimin dhe transportin lokal.',excluded:'Pa fluturime.'},
  };
  for(const locale of ['tr','en','sq']){
    const h=costHarness({locale}),focus=[],scroll=[];
    try{
      assert.equal(h.openSheet(),undefined);for(const name of [h.labels.days,h.labels.adults,h.labels.children,h.labels.rooms])assert.equal(h.field(name,false),undefined,'Dates and party fields render only in their chosen sheet');
      for(const [index,action]of [h.labels.dates,h.labels.party].entries())assert.ok(text(h.findButton(action)).includes(expected[locale].rows[index]),`Visible row label: ${action}`);
      assert.equal(h.summary(h.labels.dates),expected[locale].duration);assert.equal(h.summary(h.labels.party),expected[locale].party);
      for(const [group,count,selected]of [[h.labels.accommodation,3,h.labels.hotel],[h.labels.stars,4,h.starLabel('3')],[h.labels.style,3,h.labels.standard],[h.labels.season,4,h.labels.auto]]){assert.equal(h.choices(group).length,count);assert.equal(h.selected(group),selected);}
      const photos=costNodes(h.group(h.labels.accommodation)).filter(node=>node.type==='img');assert.equal(photos.length,3);assert.equal(new Set(photos.map(photo=>photo.props.src)).size,3,'Accommodation choices cannot silently reuse the same room image');
      for(const [label,asset]of [[h.labels.hotel,'hotel'],[h.labels.apartment,'apartment'],[h.labels.hostel,'hostel']]){const choice=h.choices(h.labels.accommodation).find(node=>node.props['aria-label']===label),photo=costNodes(choice).find(node=>node.type==='img');assert.equal(photo.props.src,`mock://budget/${asset}-v2.webp`);assert.equal(photo.props.alt,'','The visible choice name labels the decorative photo without repeated screen-reader text');assert.ok(Number(photo.props.width)>0&&Number(photo.props.height)>0,'Photo dimensions reserve space before loading');}
      assert.notEqual(h.extra().props.open,true,'Food and transport starts in its own closed native disclosure');assert.ok(h.field(h.labels.roomType));for(const name of [h.labels.food,h.labels.transport,h.labels.activities,h.labels.buffer])assert.ok(h.extraField(name));assert.equal(h.field(h.labels.holiday).props.checked,false);
      assert.ok(h.text().includes(expected[locale].scope));assert.ok(h.text().includes(expected[locale].excluded));assert.equal(h.field(h.labels.currency).props.value,'GBP');
      const heading=h.nodes().find(node=>node.type==='h2'&&node.props.ref);assert.ok(heading);assert.equal(heading.props.tabIndex,-1);heading.props.ref.current={focus:options=>focus.push(options),scrollIntoView:options=>scroll.push(options)};
      for(const query of ['', 'Paris']){
        h.query(query);const range=h.range(h.rows()[0]),saved=h.saved.length,action=query?h.labels.show:h.labels.compare;
        for(const reduce of [false,true]){reducedMotion=reduce;h.tap(action);assert.equal(focus.at(-1).preventScroll,true);assert.equal(scroll.at(-1).block,'start');assert.equal(scroll.at(-1).behavior,reduce?'instant':'smooth');}
        assert.equal(h.range(h.rows()[0]),range);assert.equal(h.saved.length,saved,'Viewing the current estimate never rewrites preferences');assert.equal(h.intents.length,0,'Viewing results never attaches a trip budget');
      }
    }finally{reducedMotion=false;h.dispose();}
  }
});

test('Progressive Costs food and transport subtitle follows current choices and language without replacing stored values',()=>{
  const h=costHarness();
  const subtitle=()=>text(costNodes(costNodes(h.extra()).find(node=>node.type==='summary')).find(node=>node.type==='small'));
  try{
    assert.equal(subtitle(),'Local food · Public transport');
    h.changeExtra(h.labels.food,'self-catering');assert.equal(subtitle(),'Groceries · Public transport');h.changeExtra(h.labels.transport,'walk');assert.equal(subtitle(),'Groceries · Walking');
    h.language('tr');assert.equal(subtitle(),'Market · Yürüyüş');h.changeExtra(h.labels.food,'restaurants');assert.equal(subtitle(),'Restoran · Yürüyüş');h.changeExtra(h.labels.transport,'taxi');assert.equal(subtitle(),'Restoran · Taksi');
    h.language('sq');assert.equal(subtitle(),'Restorante · Taksi');assert.equal(h.extraField(h.labels.food).props.value,'restaurants');assert.equal(h.extraField(h.labels.transport).props.value,'taxi');
    h.tap(h.labels.dates);h.close();assert.equal(subtitle(),'Restorante · Taksi');assert.equal(h.saved.at(-1).value.food,'restaurants');assert.equal(h.saved.at(-1).value.transport,'taxi');assert.equal(h.saved.at(-1).owner,'owner-a');
  }finally{h.dispose();}
});

test('Progressive Costs distinct comfort photos and named period choices retain independent selections and price effects in every locale',()=>{
  for(const locale of ['tr','en','sq']){
    const h=costHarness({locale});
    try{
      h.query('Paris');
      const duration=h.summary(h.labels.dates),party=h.summary(h.labels.party);
      const comfortOptions=[['economical',h.labels.economical],['standard',h.labels.standard],['comfort',h.labels.comfort]],photoSources=[],comfortHints=[];
      for(const [value,label]of comfortOptions){
        const choice=h.choices(h.labels.style).find(node=>node.props['aria-label']===label);
        assert.ok(choice,`Readable ${h.labels.style} choice: ${label}`);
        const images=costNodes(choice).filter(node=>node.type==='img');
        assert.equal(images.length,1,'Each named comfort option has one photo');
        assert.equal(images[0].props.src,`mock://budget/comfort-${value}-v2.webp`);assert.equal(images[0].props.alt,'');
        assert.ok(costNodes(choice).some(node=>String(node.props['aria-hidden'])==='true'&&costNodes(node).includes(images[0])),'Decorative photos cannot duplicate the visible option name');
        assert.equal(images[0].props.loading,'lazy');assert.equal(images[0].props.decoding,'async');
        const name=costNodes(choice).find(node=>node.type==='strong'),hint=costNodes(choice).find(node=>node.type==='small');
        assert.equal(text(name),label);assert.ok(text(hint).trim(),'The spending style is explained directly on the option');
        photoSources.push(images[0].props.src);comfortHints.push(text(hint));
      }
      assert.equal(new Set(photoSources).size,comfortOptions.length,'Comfort options use distinct photo files instead of the same cropped sprite');
      assert.equal(new Set(comfortHints).size,comfortOptions.length,'Comfort choices explain different spending styles');
      const seasonChoices=h.choices(h.labels.season),seasonNames=[h.labels.auto,h.labels.low,h.labels.normal,h.labels.high];
      const visibleNames={tr:['Tarihe göre: Normal','Sakin','Normal','Yoğun'],en:['By date: Normal','Quiet','Normal','Busy'],sq:['Sipas datës: Normal','E qetë','Normal','E ngarkuar']}[locale];
      assert.equal(seasonChoices.length,4,'Automatic and manual periods remain in one accessible group');
      for(const [index,label]of seasonNames.entries()){
        const choice=seasonChoices.find(node=>node.props['aria-label']===label);assert.ok(choice,`Readable period choice: ${label}`);
        assert.equal(text(costNodes(choice).find(node=>node.type==='strong')),visibleNames[index],'Every period is named directly on its button');
        if(index>0)assert.ok(text(costNodes(choice).find(node=>node.type==='small')).trim(),'Manual periods explain the demand level on the option');
        assert.equal(costNodes(choice).some(node=>node.type==='img'),false,'Period choices do not rely on destination illustrations');
      }
      assert.equal(h.saved.length,0,'Rendering visual choices cannot rewrite preferences');assert.equal(h.intents.length,0);
      h.choose(h.labels.style,h.labels.economical);assert.equal(h.selected(h.labels.style),h.labels.economical);const economical=h.range(h.rows()[0]);
      h.choose(h.labels.style,h.labels.comfort);assert.equal(h.selected(h.labels.style),h.labels.comfort);assert.notEqual(h.range(h.rows()[0]),economical);
      h.choose(h.labels.season,h.labels.low);assert.equal(h.selected(h.labels.season),h.labels.low);const low=h.range(h.rows()[0]);
      h.choose(h.labels.season,h.labels.high);assert.equal(h.selected(h.labels.season),h.labels.high);assert.notEqual(h.range(h.rows()[0]),low);
      assert.equal(h.selected(h.labels.style),h.labels.comfort,'Changing the period does not reset the comfort choice');
      assert.equal(h.summary(h.labels.dates),duration);assert.equal(h.summary(h.labels.party),party);assert.equal(h.openSheet(),undefined);assert.equal(h.intents.length,0);
    }finally{h.dispose();}
  }
});

test('Progressive Costs dates preserve edits on close, derive nights, clear back to duration and enforce duration boundaries',()=>{
  const h=costHarness();
  try{
    assert.equal(h.field(h.labels.days,false),undefined,'Duration is edited through its labelled row');h.tap(h.labels.dates);assert.equal(h.field(h.labels.days).props.value,'3');h.change(h.labels.days,'5');h.close();assert.equal(h.summary(h.labels.dates),'5 days · 4 nights');
    h.tap(h.labels.dates);assert.equal(h.field(h.labels.days).props.value,'5');h.change(h.labels.departure,'2027-07-01');assert.match(h.text(),/Choose 1–30 whole days/);assert.equal(h.summary(h.labels.dates),'Complete duration or dates');assert.equal(h.findButton(h.labels.compare).props.disabled,true);
    h.change(h.labels.return,'2027-07-04');assert.equal(h.field(h.labels.days).props.value,4);assert.equal(h.field(h.labels.days).props.disabled,true);
    assert.match(h.text(),/4 days · 3 nights/);assert.equal(h.findButton(h.labels.compare).props.disabled,false);
    h.close();assert.equal(h.field(h.labels.departure,false),undefined);h.tap(h.labels.dates);assert.equal(h.field(h.labels.departure).props.value,'2027-07-01');assert.equal(h.field(h.labels.return).props.value,'2027-07-04');
    h.tap(h.labels.clearDates);assert.equal(h.field(h.labels.departure).props.value,'');assert.equal(h.field(h.labels.return).props.value,'');assert.equal(h.field(h.labels.days).props.value,'4');assert.equal(h.field(h.labels.days).props.disabled,false);h.tap(h.labels.done);assert.equal(h.summary(h.labels.dates),'4 days · 3 nights');
    h.tap(h.labels.dates);assert.equal(h.field(h.labels.days).props.min,'1');assert.equal(h.field(h.labels.days).props.max,'30');
    for(const invalid of ['0','31','1.5','']){h.change(h.labels.days,invalid);assert.match(h.text(),/Choose 1–30 whole days/);assert.equal(h.range(h.rows()[0]),'—');assert.equal(h.findButton(h.labels.compare).props.disabled,true);}
    h.change(h.labels.days,'1');assert.equal(h.findButton(h.labels.compare).props.disabled,false);assert.match(h.summary(h.labels.dates),/^1 days? · 0 nights?$/);
    h.change(h.labels.days,'30');assert.equal(h.findButton(h.labels.compare).props.disabled,false);h.close();assert.equal(h.summary(h.labels.dates),'30 days · 29 nights');h.tap(h.labels.dates);assert.equal(h.field(h.labels.days).props.value,'30');h.change(h.labels.days,'29');h.tap(h.labels.done);assert.equal(h.summary(h.labels.dates),'29 days · 28 nights');
  }finally{h.dispose();}
});

test('Progressive Costs party capacity remains actionable and room/hostel choices survive editor transitions',()=>{
  const h=costHarness();
  try{
    h.query('Rome');
    h.tap(h.labels.party);h.change(h.labels.children,'1');assert.equal(h.field(h.labels.rooms).props.value,'2');assert.equal(h.summary(h.labels.party),'2 adults · 1 child · 2 rooms');
    h.change(h.labels.rooms,'1');assert.match(h.text(),/needs at least 2 rooms/);assert.equal(h.range(h.rows()[0]),'—');h.close();
    h.tap(h.labels.party);assert.equal(h.field(h.labels.rooms).props.value,'1');assert.equal(h.field(h.labels.children).props.value,'0','Closing an invalid party editor restores its previous valid settings');h.change(h.labels.children,'1');h.tap(h.labels.done);
    const shared=h.range(h.rows()[0]);h.tap(h.labels.party);h.change(h.labels.rooms,'3');h.close();assert.notEqual(h.range(h.rows()[0]),shared,'Explicit additional rooms affect the total');
    h.change(h.labels.roomType,'family');h.tap(h.labels.party);assert.equal(h.field(h.labels.rooms).props.value,'1');assert.equal(h.summary(h.labels.party),'2 adults · 1 child · 1 room');h.close();
    h.choose(h.labels.accommodation,h.labels.hostel);assert.equal(h.summary(h.labels.party),'2 adults · 1 child · Hostel stay');assert.equal(h.selected(h.labels.accommodation),h.labels.hostel);assert.equal(h.group(h.labels.stars,false),undefined);assert.equal(h.field(h.labels.roomType,false),undefined);h.tap(h.labels.party);assert.equal(h.field(h.labels.rooms,false),undefined);assert.equal(h.field(h.labels.children).props.value,'1');h.close();
    h.choose(h.labels.accommodation,h.labels.hotel);assert.equal(h.field(h.labels.roomType).props.value,'family');h.tap(h.labels.party);assert.equal(h.field(h.labels.rooms).props.value,'1');
  }finally{h.dispose();}
});

test('Progressive Costs direct accommodation, class and comfort choices retain settings and charge hostel stays per bed',()=>{
  const initial={adults:'3',children:'1',rooms:'3',stars:'4',food:'restaurants',buffer:'15'},h=costHarness({preferences:initial});
  try{
    h.query('Rome');const source=h.rowSource(h.rows()[0]);let preferences={...h.personal.DEFAULT_PERSONAL_BUDGET,...initial};
    const format=n=>new Intl.NumberFormat('en',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(n);
    const estimate=()=>{const expected=h.personal.personalTripBudget(source,preferences);assert.ok(expected);assert.equal(h.range(h.rows()[0]),`${format(expected.totalRange.low)} – ${format(expected.totalRange.high)}`);return expected;};
    const classTotals=[];
    for(const stars of ['2','3','4','5']){h.choose(h.labels.stars,h.starLabel(stars));preferences={...preferences,stars};assert.equal(h.selected(h.labels.stars),h.starLabel(stars));assert.equal(h.summary(h.labels.party),'3 adults · 1 child · 3 rooms','Changing hotel class does not replace an explicit extra room');classTotals.push(estimate().hotel);}
    assert.ok(classTotals.every((value,index)=>index===0||value>classTotals[index-1]));
    const comfortTotals=[];
    for(const [style,label]of [['economical',h.labels.economical],['standard',h.labels.standard],['comfort',h.labels.comfort]]){h.choose(h.labels.style,label);preferences={...preferences,style};assert.equal(h.selected(h.labels.style),label);assert.equal(h.summary(h.labels.party),'3 adults · 1 child · 3 rooms');comfortTotals.push(estimate().total);}
    assert.ok(comfortTotals[0]<comfortTotals[1]&&comfortTotals[1]<comfortTotals[2]);
    h.choose(h.labels.season,h.labels.high);preferences={...preferences,season:'high'};assert.equal(h.summary(h.labels.party),'3 adults · 1 child · 3 rooms','Changing the season also retains explicit room counts');estimate();
    for(const [accommodation,label]of [['hostel',h.labels.hostel],['apartment',h.labels.apartment],['hotel',h.labels.hotel]]){
      h.choose(h.labels.accommodation,label);preferences={...preferences,accommodation,rooms:'2'};assert.equal(h.selected(h.labels.accommodation),label);assert.equal(h.openSheet(),undefined);
      assert.equal(h.extraField(h.labels.food).props.value,'restaurants');assert.equal(h.extraField(h.labels.buffer).props.value,'15');assert.equal(h.selected(h.labels.style),h.labels.comfort);assert.equal(h.selected(h.labels.season),h.labels.high);
      const expected=estimate();
      if(accommodation==='hostel'){
        assert.equal(h.group(h.labels.stars,false),undefined);assert.equal(h.field(h.labels.roomType,false),undefined);assert.equal(expected.rooms,0);assert.equal(expected.hotel,source.hotel/2*expected.nights*expected.people*.3*1.25*1.25);
        h.tap(h.labels.party);assert.equal(h.field(h.labels.rooms,false),undefined);h.close();
      }else{
        assert.equal(h.field(h.labels.roomType).props.value,'double');assert.equal(expected.rooms,2);h.tap(h.labels.party);assert.equal(h.field(h.labels.rooms).props.value,'2');h.close();
        if(accommodation==='hotel')assert.equal(h.selected(h.labels.stars),h.starLabel('5'),'The prior hotel class survives other accommodation types');else assert.equal(h.group(h.labels.stars,false),undefined);
      }
    }
    const expected=estimate();h.openDetail();assert.equal(h.detailTotal(),h.range(h.rows()[0]));h.tap(h.labels.addTrip);assert.equal(h.intents.length,1);const intent=h.intents[0];
    assert.equal(intent.estimate.hotel,expected.hotel);assert.equal(intent.estimate.rooms,2);assert.equal(intent.personalPreferences.stars,'5');assert.equal(intent.personalPreferences.style,'comfort');assert.equal(intent.personalPreferences.season,'high');assert.equal(h.intentModule.validateBudgetCockpitIntent(intent),true);
  }finally{h.dispose();}
});

test('Progressive Costs direct seasons expose planning assumptions and preserve manual overrides when dates change',()=>{
  const h=costHarness();
  try{
    h.query('Rome');const source=h.rowSource(h.rows()[0]);let preferences={...h.personal.DEFAULT_PERSONAL_BUDGET};
    const format=n=>new Intl.NumberFormat('en',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(n);
    const estimate=()=>{const expected=h.personal.personalTripBudget(source,preferences);assert.ok(expected);assert.equal(h.range(h.rows()[0]),`${format(expected.totalRange.low)} – ${format(expected.totalRange.high)}`);return expected;};
    assert.equal(h.selected(h.labels.season),h.labels.auto);assert.match(h.text(),/Without dates, normal season is used/);const initial=estimate();assert.equal(initial.season,'normal');
    const seasonalHotels=[];
    for(const [season,label]of [['low',h.labels.low],['normal',h.labels.normal],['high',h.labels.high]]){h.choose(h.labels.season,label);preferences={...preferences,season};assert.equal(h.selected(h.labels.season),label);const selected=estimate();assert.equal(selected.season,season);seasonalHotels.push(selected.hotel);}
    assert.ok(seasonalHotels[0]<seasonalHotels[1]&&seasonalHotels[1]<seasonalHotels[2]);
    h.choose(h.labels.season,h.labels.auto);preferences={...preferences,season:'auto'};assert.equal(estimate().total,initial.total);
    h.tap(h.labels.dates);h.change(h.labels.departure,'2027-07-01');h.change(h.labels.return,'2027-07-04');h.close();preferences={...preferences,startDate:'2027-07-01',endDate:'2027-07-04'};
    assert.equal(estimate().season,'high');assert.equal(h.selected(h.labels.season),h.labels.auto);assert.match(h.text(),/General calendar estimate; local seasons may differ/);
    h.choose(h.labels.season,h.labels.low);preferences={...preferences,season:'low'};const manualLow=estimate();assert.equal(manualLow.season,'low');
    h.tap(h.labels.dates);h.change(h.labels.departure,'2027-08-01');h.change(h.labels.return,'2027-08-04');h.close();preferences={...preferences,startDate:'2027-08-01',endDate:'2027-08-04'};assert.equal(h.selected(h.labels.season),h.labels.low);assert.equal(estimate().hotel,manualLow.hotel,'Changing dates cannot erase a manual season scenario');
    h.choose(h.labels.season,h.labels.auto);preferences={...preferences,season:'auto'};assert.equal(estimate().season,'high');h.tap(h.labels.dates);h.tap(h.labels.clearDates);h.tap(h.labels.done);preferences={...preferences,startDate:'',endDate:'',days:'4'};assert.equal(estimate().season,'normal');assert.match(h.text(),/Without dates, normal season is used/);
    h.choose(h.labels.season,h.labels.high);preferences={...preferences,season:'high'};const noHoliday=estimate();h.check(h.labels.holiday,true);preferences={...preferences,holiday:true};const holiday=estimate();assert.ok(holiday.hotel>noHoliday.hotel);
    h.openDetail();h.tap(h.labels.addTrip);assert.equal(h.intents[0].personalPreferences.season,'high');assert.equal(h.intents[0].personalPreferences.holiday,true);assert.equal(h.intents[0].estimate.hotel,holiday.hotel);assert.equal(h.intentModule.validateBudgetCockpitIntent(h.intents[0]),true);
  }finally{h.dispose();}
});

test('Every researched budget city has its own packaged city photo, including destinations outside the old quick-pick list',()=>{
  const {BUDGET_CITY_PHOTOS:photos}=loadBudgetCityPhotos();
  const {CITY_BENCHMARKS:benchmarks}=load('lib/country-intelligence/city-benchmarks.ts');
  assert.equal(benchmarks.length,50);
  assert.deepEqual(Object.keys(photos).sort(),Array.from(benchmarks,row=>row.id).sort(),'Photo coverage exactly matches the researched cities');
  assert.equal(new Set(Object.values(photos).map(photo=>photo.src)).size,benchmarks.length,'Different cities cannot silently share one destination photo');
  for(const row of benchmarks){
    const photo=photos[row.id];
    assert.match(photo.src,/^mobile\/src\/assets\/.+\.(?:webp|jpg|png)$/,'Each city photo is bundled for offline use');
    assert.ok(readFileSync(photo.src).byteLength>1024,`${row.id} has an actual image asset`);
    if(photo.src.includes('/budget/cities/'))assert.ok(photo.credit,`${row.id} retains its downloaded photo attribution`);
    if(photo.credit){
      for(const key of ['author','title','license'])assert.ok(photo.credit[key]?.trim(),`${row.id} retains ${key}`);
      for(const key of ['source','licenseUrl'])assert.match(photo.credit[key],/^https?:\/\//,`${row.id} retains its ${key}`);
    }
  }
});

for(const locale of ['tr','en','sq'])test(`Every Costs result uses its own city photo and retains its matching detail in ${locale}`,()=>{
  const h=costHarness({locale});
  try{
    for(const source of h.benchmarks.CITY_BENCHMARKS){
      const label=source.city[locale==='tr'?'tr':'en'];
      h.query(label);
      const row=h.rows().find(candidate=>h.rowSource(candidate).id===source.id);
      assert.ok(row,`${source.id} can be found by its city name`);
      assert.ok(row.props.className.split(' ').includes('has-photo'),`${source.id} shows the photo layout`);
      const photos=costNodes(row).filter(node=>node.type==='DestinationPhoto');
      assert.equal(photos.length,1,`${source.id} shows one destination photo`);
      assert.equal(photos[0].props.src,h.photos[source.id].src,`${source.id} uses its own bundled photo`);
      assert.equal(photos[0].props.label,label);
      assert.equal(photos[0].props.countryCode,source.code);
      const range=h.range(row);
      h.openDetail(row);assert.equal(h.openSheet().props.title,label);assert.equal(h.detailTotal(),range);
      const credit=h.photos[source.id].credit;
      if(credit){
        const disclosure=costNodes(h.openSheet()).find(node=>node.type==='details'&&node.props.className==='budget-photo-credit');
        assert.ok(disclosure,`${source.id} keeps photo attribution in its detail`);assert.ok(text(disclosure).includes(credit.author));
        const actions=costNodes(disclosure).filter(node=>node.type==='button');
        assert.equal(actions.length,2);actions[0].props.onClick();actions[1].props.onClick();
        assert.deepEqual(h.openedExternal.slice(-2),[credit.source,credit.licenseUrl],`${source.id} opens its actual source and license`);
      }
      h.close();
    }
    h.query('Definitely-unsupported-city-998');
    assert.equal(h.rows().length,0);assert.equal(h.nodes().some(node=>node.type==='DestinationPhoto'),false,'An unknown city cannot retain the last photo');
    assert.equal(h.saved.length,0,'Photo browsing and opening details cannot change saved preferences');
    assert.equal(h.intents.length,0,'Photo browsing never attaches an estimate to a trip');
  }finally{h.dispose();}
});

test('Progressive Costs city scene, detail and saved snapshot agree without retaining a stale city after an unknown search',()=>{
  const h=costHarness({preferences:{days:'4',adults:'3',rooms:'2'}});
  try{
    h.query('Paris');h.tap('Edit duration and dates');assert.equal(h.openSheet().props.title,'Duration and dates');
    const durationLabel=costNodes(h.openSheet()).find(node=>node.type==='label'&&text(node).trim().startsWith(h.labels.days)),durationInput=costNodes(durationLabel).find(node=>node.type==='input');
    assert.ok(durationInput,'The duration row exposes an editable duration inside its sheet');assert.equal(durationInput.props.value,'4');durationInput.props.onChange({target:{value:'5'}});h.render();h.close();assert.equal(h.summary(h.labels.dates),'5 days · 4 nights');
    h.tap(h.labels.party);h.change(h.labels.children,'1');assert.equal(h.field(h.labels.rooms).props.value,'2');h.tap(h.labels.done);
    h.changeExtra(h.labels.food,'restaurants');assert.equal(h.selected(h.labels.style),h.labels.standard);
    const beforeStyle=h.range(h.rows()[0]);h.choose(h.labels.style,h.labels.comfort);assert.equal(h.selected(h.labels.style),h.labels.comfort);assert.notEqual(h.range(h.rows()[0]),beforeStyle);
    assert.equal(h.openSheet(),undefined,'Main comfort choices do not open another menu');h.tap(h.labels.dates);h.close();assert.equal(h.selected(h.labels.style),h.labels.comfort,'Other editors retain the directly selected style');
    const preferences={...h.personal.DEFAULT_PERSONAL_BUDGET,days:'5',adults:'3',children:'1',rooms:'2',food:'restaurants',style:'comfort'};
    const format=n=>new Intl.NumberFormat('en',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(n);
    for(const [index,city,country,photoCode]of [[0,'Paris','FR','PAR'],[1,'Rome','IT','FCO']]){
      h.query(city);assert.equal(h.rows().length,1);assert.equal(h.rowName(h.rows()[0]),city);
      assert.ok(h.nodes().some(node=>node.type==='h2'&&text(node)==='Your estimated trip budget'));
      const row=h.rows()[0],source=h.rowSource(row),expected=h.personal.personalTripBudget(source,preferences),range=`${format(expected.totalRange.low)} – ${format(expected.totalRange.high)}`;
      const photo=costNodes(row).find(node=>node.type==='DestinationPhoto');assert.equal(photo.props.label,city);assert.equal(photo.props.countryCode,country);assert.equal(photo.props.code,photoCode);
      assert.equal(h.range(row),range);assert.match(text(row),/5 days · 4 nights · 4 people/);
      h.openDetail(row);assert.equal(h.openSheet().props.title,city);assert.equal(h.detailTotal(),range);h.tap(h.labels.addTrip);
      const intent=h.intents[index];assert.equal(intent.city,city);assert.equal(intent.countryCode,country);assert.equal(intent.sourceBenchmarkId,source.id);assert.equal(intent.model,'personal-budget-v1');
      assert.deepEqual(JSON.parse(JSON.stringify(intent.estimate)),JSON.parse(JSON.stringify(expected)));assert.equal(h.intentModule.validateBudgetCockpitIntent(intent),true);
      h.query('Definitely-unsupported-city-998');assert.equal(h.rows().length,0);assert.equal(h.openSheet(),undefined);
      assert.equal(h.nodes().some(node=>node.type==='DestinationPhoto'),false,'An unsupported destination cannot retain the previous photo');
      assert.equal(h.text().includes(range),false,'An unsupported destination cannot retain the previous budget range');
      assert.equal(h.intents.length,index+1,'Searching never attaches a different city in the background');
    }
  }finally{h.dispose();}
});

test('Progressive Costs search distinguishes unsupported cities and quick picks retain the exact researched city and photo',()=>{
  const h=costHarness();
  try{
    h.query('Definitely-unsupported-city-998');assert.equal(h.rows().length,0);assert.match(h.text(),/never substitute another city's prices/);assert.equal(h.openSheet(),undefined);assert.equal(h.findButton(h.labels.compare).props.disabled,true);assert.match(h.text(),/We have no price data for this search/);
    h.tap('Show all cities');assert.equal(h.queryValue(),'');assert.ok(h.rows().length>1);h.tap('Paris');assert.equal(h.queryValue(),'Paris');assert.equal(h.rows().length,1);assert.equal(h.rowName(h.rows()[0]),'Paris');
    const photo=costNodes(h.rows()[0]).find(node=>node.type==='DestinationPhoto');assert.ok(photo);assert.equal(photo.props.code,'PAR');assert.equal(photo.props.countryCode,'FR');
    const range=h.range(h.rows()[0]);h.openDetail();assert.equal(h.openSheet().props.title,'Paris');assert.equal(h.detailTotal(),range);
  }finally{h.dispose();}
});

for(const locale of ['tr','en','sq'])test(`Progressive Costs trip entry shortcuts and typed country searches retain the current trip choices in ${locale}`,()=>{
  const h=costHarness({locale,preferences:{days:'4',adults:'3',rooms:'2',style:'comfort',season:'low'}});
  const picks=locale==='tr'?[['Paris','FR-paris','PAR'],['Roma','IT-rome','FCO'],['Tiran','AL-tirana','TIA']]:locale==='sq'?[['Paris','FR-paris','PAR'],['Roma','IT-rome','FCO'],['Tirana','AL-tirana','TIA']]:[['Paris','FR-paris','PAR'],['Rome','IT-rome','FCO'],['Tirana','AL-tirana','TIA']];
  try{
    const duration=h.summary(h.labels.dates),party=h.summary(h.labels.party);
    for(const [label,id,photoCode]of picks){
      h.query('');const writes=h.saved.length;h.tap(label);assert.equal(h.queryValue(),label);assert.equal(h.rows().length,1,'A destination shortcut identifies one city instead of matching unrelated country names');const row=h.rows()[0];assert.equal(h.rowSource(row).id,id);assert.equal(costNodes(row).find(node=>node.type==='DestinationPhoto').props.code,photoCode);
      const range=h.range(row),resultIds=h.rows().map(candidate=>h.rowSource(candidate).id);
      for(const action of [h.labels.dates,h.labels.party]){h.tap(action);assert.ok(h.openSheet());h.close();assert.equal(h.queryValue(),label);assert.deepEqual(h.rows().map(candidate=>h.rowSource(candidate).id),resultIds);assert.equal(h.range(h.rows().find(candidate=>h.rowSource(candidate).id===id)),range);}
      h.query(`  ${label.slice(0,3)}  `);assert.ok(h.rows().some(candidate=>h.rowSource(candidate).id===id),'A typed prefix and its shortcut find the same researched city');
      assert.equal(h.summary(h.labels.dates),duration);assert.equal(h.summary(h.labels.party),party);assert.equal(h.selected(h.labels.style),h.labels.comfort);assert.equal(h.selected(h.labels.season),h.labels.low);assert.equal(h.saved.length,writes,'Searches and editor roundtrips cannot rewrite preferences');assert.equal(h.intents.length,0,'Exploring a destination cannot attach a budget to a trip');
    }
    h.query('');h.tap(picks[1][0]);assert.equal(h.rows().length,1);assert.equal(h.rowSource(h.rows()[0]).id,'IT-rome');
    if(locale==='tr'){h.query('Roma ');assert.ok(h.rows().some(row=>h.rowSource(row).id==='IT-rome'));assert.ok(h.rows().some(row=>h.rowSource(row).code==='RO'),'Editing Roma uses the ordinary broad search, including Romanian country-name matches');}
    const country=localeFormatting.appRegionName('FR',locale);h.query(country);assert.ok(h.rows().length>1,'Typing a country after a shortcut clears the exact city intent');assert.ok(h.rows().every(row=>h.rowSource(row).code==='FR'),'A typed country filters researched cities within that country');
    const ids=h.rows().map(row=>h.rowSource(row).id);for(const action of [h.labels.dates,h.labels.party]){h.tap(action);h.close();assert.equal(h.queryValue(),country);assert.deepEqual(h.rows().map(row=>h.rowSource(row).id),ids);}
    assert.equal(h.saved.length,0);assert.equal(h.intents.length,0);
    h.query('');h.tap('Paris');assert.equal(h.rowSource(h.rows()[0]).id,'FR-paris');
    h.setActive({tripId:'entry-rome',title:'Rome holiday',city:'Rome',countryCode:'IT',startDate:'2027-07-01',endDate:'2027-07-04',adults:2,children:1});assert.equal(h.rowSource(h.rows()[0]).id,'FR-paris','An available trip cannot replace a deliberately selected shortcut before import');assert.equal(h.saved.length,0);
    h.tap(h.labels.useTrip);assert.equal(h.queryValue(),locale==='tr'?'Roma':'Rome');assert.ok(h.rows().some(row=>h.rowSource(row).id==='IT-rome'),'Explicit trip import clears the previous exact shortcut');assert.ok(h.rows().every(row=>h.rowSource(row).code!=='FR'));
    h.tap(h.labels.dates);assert.equal(h.field(h.labels.departure).props.value,'2027-07-01');assert.equal(h.field(h.labels.return).props.value,'2027-07-04');h.close();h.tap(h.labels.party);assert.equal(h.field(h.labels.adults).props.value,'2');assert.equal(h.field(h.labels.children).props.value,'1');assert.equal(h.field(h.labels.rooms).props.value,'2');h.close();
    assert.equal(h.saved.length,1);assert.equal(h.saved[0].owner,'owner-a');assert.equal(h.saved[0].value.style,'comfort');assert.equal(h.saved[0].value.season,'low');assert.equal(h.intents.length,0);
  }finally{h.dispose();}
});

for(const locale of ['tr','en','sq'])test(`Progressive Costs preferences retain every choice and produce the same complete snapshot in ${locale}`,()=>{
  const h=costHarness({locale});
  try{
    h.query('Rome');assert.equal(h.rows().length,1);h.choose(h.labels.style,h.labels.comfort);assert.equal(h.selected(h.labels.style),h.labels.comfort);
    h.choose(h.labels.stars,h.starLabel('4'));h.change(h.labels.roomType,'family');h.changeExtra(h.labels.food,'restaurants');h.changeExtra(h.labels.transport,'taxi');h.changeExtra(h.labels.activities,'paid');assert.equal(h.openSheet(),undefined);
    assert.ok(text(h.rows()[0]).includes(h.labels.partial),'Unpriced paid activities are still partial');
    assert.equal(h.selected(h.labels.stars),h.starLabel('4'));assert.equal(h.extraField(h.labels.allowance).props.value,'');h.changeExtra(h.labels.allowance,'5.50');h.choose(h.labels.season,h.labels.high);h.changeExtra(h.labels.buffer,'15');h.check(h.labels.holiday,true);
    const preferences={...h.personal.DEFAULT_PERSONAL_BUDGET,style:'comfort',stars:'4',roomType:'family',food:'restaurants',transport:'taxi',activities:'paid',activityAllowance:'5.50',season:'high',buffer:'15',holiday:true};
    const expected=h.personal.personalTripBudget(h.rowSource(h.rows()[0]),preferences),format=n=>new Intl.NumberFormat(locale,{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(n),expectedRange=`${format(expected.totalRange.low)} – ${format(expected.totalRange.high)}`;
    assert.equal(h.range(h.rows()[0]),expectedRange);
    for(const [label,value]of [[h.labels.roomType,'family'],[h.labels.food,'restaurants'],[h.labels.transport,'taxi'],[h.labels.activities,'paid'],[h.labels.allowance,'5.50'],[h.labels.buffer,'15']])assert.equal((label===h.labels.roomType?h.field(label):h.extraField(label)).props.value,value,label);assert.equal(h.field(h.labels.holiday).props.checked,true);assert.equal(h.selected(h.labels.season),h.labels.high);assert.equal(h.selected(h.labels.stars),h.starLabel('4'));assert.equal(h.selected(h.labels.style),h.labels.comfort);
    h.openDetail();assert.equal(h.detailTotal(),expectedRange);h.tap(h.labels.addTrip);assert.equal(h.intents.length,1);const intent=h.intents[0];assert.equal(intent.estimate.partial,false);assert.equal(intent.estimate.activities,33);assert.equal(intent.personalPreferences.activityAllowance,'5.50');assert.equal(h.intentModule.validateBudgetCockpitIntent(intent),true);
    for(const key of Object.keys(preferences))assert.equal(intent.personalPreferences[key],preferences[key],key);
    h.changeExtra(h.labels.allowance,'0');assert.equal(text(h.rows()[0]).includes(h.labels.partial),false,'An explicitly zero paid-activity allowance is complete');h.openDetail();h.tap(h.labels.addTrip);assert.equal(h.intents[1].estimate.activities,0);assert.equal(h.intents[1].estimate.partial,false);assert.equal(h.intents[1].personalPreferences.activities,'paid');
  }finally{h.dispose();}
});


test('Planner sends the current passport choice, snapshots it for a saved plan, and classifies local results with the same rules', async () => {
  const passport = { country: 'DE', type: 'special' };
  const h = plannerHarness({ seeded: false, passport });
  try {
    let view = h.host.render();
    const field = find(view, 'AirportField', props => !props.initialQuery);
    field.props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul', country: 'Türkiye', countryCode: 'TR' });
    view = h.host.render();
    await button(view, 'Create Route').props.onClick(); await tick(); view = h.host.render();
    assert.equal(h.generated[0].passportCountry, 'DE'); assert.equal(h.generated[0].passportType, 'special');
    assert.match(text(view), /Germany · Special/); assert.match(text(view), /Entry conditions need verification/);
    passport.country = 'TR'; passport.type = 'special';
    view = h.host.render();
    await button(view, 'Create Route').props.onClick(); await tick(); view = h.host.render();
    assert.equal(h.generated[1].passportCountry, 'TR'); assert.equal(h.generated[1].passportType, 'special');
    assert.match(text(view), /Visa-free/); assert.doesNotMatch(text(view), /Germany · Special/);
    const save = find(view, 'button', props => /Save 2 suggestions/.test(text(props.children)));
    await save.props.onClick(); await tick();
    assert.equal(h.saves[0].input.passportType, 'special'); assert.equal(h.saves[0].input.passportCountry, 'TR');
    assert.equal(h.saves[0].plan.routes[0].verifiedEntryStatus, 'visa_free');
  } finally { h.host.dispose(); }
});

test('Skipping passport setup still allows planning and saves unknown entry conditions without a Turkish default', async () => {
  const h = plannerHarness({ seeded: false, passport: { country: '', type: '' } });
  try {
    let view = h.host.render();
    find(view, 'AirportField', props => !props.initialQuery).props.onChange({ iata: 'IST', city: 'Istanbul', name: 'Istanbul', country: 'Türkiye', countryCode: 'TR' });
    view = h.host.render();
    await button(view, 'Create Route').props.onClick(); await tick(); view = h.host.render();
    assert.equal(h.generated[0].passportCountry, ''); assert.equal(h.generated[0].passportType, '');
    assert.match(text(view), /Passport not selected/); assert.match(text(view), /Entry conditions need verification/);
    assert.doesNotMatch(text(view), /Türkiye · Ordinary/);
    await find(view, 'button', props => /Save 2 suggestions/.test(text(props.children))).props.onClick(); await tick();
    assert.equal(h.saves[0].input.passportCountry, '');
    assert.ok(h.saves[0].plan.routes.every(route => route.verifiedEntryStatus === 'unknown'));
  } finally { h.host.dispose(); }
});


function plansUXHarness({ saved = [], events = [], maps = { status: 'ready', count: 0 }, routesFail = false, eventsFail = false, list = async () => [], cockpitList = async () => [], cachedTrips = new Map(), initial = {}, locale = 'en' } = {}) {
  const host = hooks(), signIns = [], requests = [], cockpitRequests = [], scopes = [], navigations = [];
  const i18n = { locale, dateLocale: locale === 'tr' ? 'tr-TR' : locale === 'sq' ? 'sq-AL' : 'en-GB', copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en };
  const { TripsScreen } = load('mobile/src/screens/PlansScreen.tsx', {
    ...common(host), '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
    '../lib/i18n': { useI18n: () => i18n },
    '../../../lib/event-time': { eventDateLabel: () => '21', eventTimeLabel: () => '12:00' }, '../components/Icon': { Icon: 'Icon' }, '../components/CountryFlag': {}, '../components/Sheet': { Sheet: 'Sheet' },
    '../components/TripCollaborationHub': { TripCollaborationHub: 'TripCollaborationHub' }, '../components/TravelSavedPlaces': {}, '../components/PersonalTravelCards': { PersonalTravelCards: 'PersonalTravelCards' },
    '../lib/savedPlaces': { readSavedPlaces: () => ({ items: [], dayIds: [], error: null }), subscribeSavedPlaces: () => () => {} },
    '../data/countryIso': {}, '../data/artwork': { destinationArtwork: () => '' }, '../data/discovery': { DISCOVERY_DESTINATIONS: [] },
    '../lib/storage': { getSavedRoutePlans: owner => { scopes.push(['routes', owner]); if (routesFail) throw Error('corrupt'); return saved; }, getFavoriteDestinations: () => [], getSavedTravelEvents: owner => { scopes.push(['events', owner]); if (eventsFail) throw Error('corrupt'); return events; } },
    '../lib/offlineMaps': { readOfflineMapStatus: () => maps },
    '../lib/journeyTools': { readSafetyTrips: owner => cachedTrips.get(owner || 'guest') || [], saveSafetyTrips: (owner, items) => cachedTrips.set(owner || 'guest', items) },
    '../lib/supabaseData': { listCockpitTrips: (...args) => { cockpitRequests.push(args); return cockpitList(...args); }, listUserTrips: (...args) => { requests.push(args); return list(...args); }, getSupabaseDataErrorMessage: (_error, fallback) => fallback },
    '../lib/native': {}, '../lib/routeOutbox': { readRouteOutbox: () => ({}) }, '../lib/routeSync': {}, '../lib/eventReminders': {}, '../lib/searchText': search,
  });
  host.start(TripsScreen, { user: null, accessToken: '', onNavigate: view => navigations.push(view), onNotice() {}, onOpenAccount: () => signIns.push(true), onOpenDestination() {}, ...initial });
  return { host, requests, cockpitRequests, cachedTrips, signIns, scopes, navigations };
}

test('Saved map detail shows an identical summary once while keeping map actions, duration and every scheduled day', () => {
  const map = load('mobile/src/lib/mapJourney.ts', { '../../../lib/travel-assistant/places': load('lib/travel-assistant/places.ts'), './id': { createId: () => 'fixture-map-id' } });
  for (const locale of ['tr', 'en', 'sq']) {
    const journey = map.createMapJourney({ city: 'Kişinev', center: { latitude: 47.01, longitude: 28.86 }, dayCount: 2, startDate: null });
    const saved = map.mapJourneyToSavedRoute(journey, locale);
    saved.plan.summary = ` \n ${saved.plan.routes[0].why.replaceAll(' ', '  ')} \t `;
    const original = JSON.stringify(saved), h = plansUXHarness({ saved: [saved], locale, initial: { initialSection: 'routes' } });
    try {
      find(h.host.render(), 'button', props => props['data-guide'] === 'saved-route-open').props.onClick();
      const detail = nodes(h.host.render()).find(node => typeof node.type === 'function' && node.type.name === 'PlanDetail');
      const view = detail.type(detail.props), translated = nodes(view).filter(node => node.type === 'RouteTranslation');
      assert.equal(translated.filter(node => node.props.text.normalize('NFC').replace(/\s+/g, ' ').trim() === saved.plan.routes[0].why).length, 1);
      const edit = { tr: 'Haritada aç ve düzenle', en: 'Open and edit on map', sq: 'Hap dhe ndrysho në hartë' }[locale];
      assert.ok(button(view, edit));
      assert.equal(nodes(view).filter(node => node.props.className === 'saved-plan-days')[0].props.children[1].length, 2);
      assert.match(text(view), /2/);
      button(view, edit).props.onClick();
      assert.ok(find(h.host.render(), 'Sheet', props => props.className === 'mj-sheet'));
      assert.equal(JSON.stringify(saved), original, 'Display deduplication never rewrites the saved map record');
    } finally { h.host.dispose(); }
  }
});

test('Saved detail preserves distinct legacy route descriptions even when they share words or punctuation differs', () => {
  for (const why of ['Main summary with a museum stop', 'Main summary?', 'Main Summary', undefined]) {
    const saved = { id: 'legacy-detail', createdAt: '2026-10-01T08:00:00Z', input: { days: '3 days' }, plan: { summary: 'Main summary.', routes: [{ ...route, why }] } };
    const original = JSON.stringify(saved), h = plansUXHarness({ saved: [saved], initial: { initialSection: 'routes' } });
    try {
      button(h.host.render(), 'Open plan').props.onClick();
      const detail = nodes(h.host.render()).find(node => typeof node.type === 'function' && node.type.name === 'PlanDetail');
      const view = detail.type(detail.props);
      assert.ok(find(view, 'RouteTranslation', props => props.text === why));
      assert.ok(find(view, 'RouteTranslation', props => props.text === saved.plan.summary));
      assert.ok(find(view, 'div', props => props.className === 'saved-plan-days'));
      assert.equal(JSON.stringify(saved), original);
    } finally { h.host.dispose(); }
  }
});

test('Plans lists routes and events once while offline maps retain their actual status and destination', async () => {
  const offline = [], saved = [{ id: 'ready-route', createdAt: '2026-10-01T10:00:00Z', input: { days: '2 days' }, plan: { summary: 'Saved trip', routes: [{ ...route, name: 'Rome' }] } }];
  const h = plansUXHarness({ saved, events: [{ id: 'saved-event', title: 'Concert', city: 'Rome', startsAt: '2026-10-21T12:00:00Z' }], maps: { status: 'ready', count: 2 }, initial: { ownerId: 'selected-owner', onOpenOfflineMap: () => offline.push('offline') } });
  try {
    await tick(); const view = h.host.render(), card = find(view, 'TravelReadinessCard');
    assert.deepEqual(JSON.parse(JSON.stringify(card.props.maps)), { count: 2, loading: false, unavailable: false });
    assert.equal(card.props.routes, undefined); assert.equal(card.props.events, undefined);
    assert.deepEqual(h.scopes, [['routes', 'selected-owner'], ['events', 'selected-owner']]);
    const categories = nodes(view).filter(node => node.type === 'button' && node.props['data-section']);
    assert.equal(categories.filter(node => node.props['data-section'] === 'routes').length, 1);
    assert.equal(categories.filter(node => node.props['data-section'] === 'events').length, 1);
    card.props.onMaps(); assert.deepEqual(offline, ['offline']);
    categories.find(node => node.props['data-section'] === 'routes').props.onClick(); assert.equal(text(find(h.host.render(), 'h1')), 'My routes');
    button(h.host.render(), 'All saved').props.onClick();
    nodes(h.host.render()).find(node => node.props?.['data-section'] === 'events').props.onClick(); assert.equal(text(find(h.host.render(), 'h1')), 'My events');
  } finally { h.host.dispose(); }
});

test('Plans preserves unreadable events and invalid map storage as unavailable, not empty', async () => {
  const h = plansUXHarness({ eventsFail: true, maps: { status: 'unavailable', count: null }, list: async () => { throw Error('Unavailable'); }, initial: { user: { id: 'a' }, ownerId: 'a', accessToken: 'TEST' } });
  try {
    await tick(); let view = h.host.render();
    assert.deepEqual(JSON.parse(JSON.stringify(find(view, 'TravelReadinessCard').props.maps)), { count: null, loading: false, unavailable: true });
    await tick(); view = h.host.render();
    nodes(view).find(node => node.props?.['data-section'] === 'events').props.onClick(); view = h.host.render();
    assert.match(text(view), /On-device records could not be checked/);
    assert.doesNotMatch(text(view), /No saved events yet/);
  } finally { h.host.dispose(); }
});

test('Offline map card distinguishes loading, unavailable and empty counts in three languages without claiming trip coverage', () => {
  for (const locale of ['tr', 'en', 'sq']) {
    const copy = (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq : en;
    const { TravelReadinessCard } = load('mobile/src/components/TravelReadinessCard.tsx', { 'react/jsx-runtime': runtime, '../lib/i18n': { useI18n: () => ({ copy }) }, './Icon': { Icon: 'Icon' } });
    const states = [ [{ count: null, loading: true }, copy('Yükleniyor', 'Loading', 'Po ngarkohet')], [{count:null,unavailable:true},copy('Kontrol edilemedi','Could not check','Nuk u kontrollua')], [{count:0},copy('Henüz kayıt yok','Nothing saved yet','Asgjë e ruajtur ende')] ];
    for(const [maps, label] of states) {
      const opens = [], view = TravelReadinessCard({ maps, onMaps: () => opens.push('maps') });
      const buttons = nodes(view).filter(node => node.type === 'button');
      assert.equal(buttons.length, 1); assert.match(text(buttons[0]), new RegExp(label));
      assert.match(text(view), new RegExp(copy('Gideceğin bölgeyi ayrıca kontrol et','Check that they cover your destination','Kontrollo veçmas zonën ku do të shkosh')));
      buttons[0].props.onClick(); assert.deepEqual(opens, ['maps']);
    }
  }
});

test('A failed cloud library is not an empty library; retry distinguishes loading from a confirmed empty response', async () => {
  const pending = [], user = { id: 'owner-a' };
  const h = plansUXHarness({ list: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), initial: { user, ownerId: user.id, accessToken: 'TEST', initialSection: 'routes' } });
  const empty = tree => nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'Empty');
  try {
    assert.equal(empty(h.host.render()), undefined);
    pending[0].reject(Error('Network unavailable')); await tick();
    let view = h.host.render();
    assert.match(text(view), /Account items could not load/);
    assert.equal(empty(view), undefined, 'A failed read cannot claim that the account has no routes');
    button(view, 'Retry').props.onClick(); view = h.host.render();
    assert.doesNotMatch(text(view), /Account items could not load/); assert.equal(empty(view), undefined);
    pending[1].resolve([]); await tick(); view = h.host.render();
    assert.equal(empty(view).props.title, 'No saved routes yet', 'Only a successful empty read shows the empty state');
    assert.equal(empty(view).props.guide, 'saved-routes-empty', 'Only the confirmed empty read offers the lesson recovery anchor');
    assert.equal(empty(view).type(empty(view).props).props['data-guide'], 'saved-routes-empty');
    assert.deepEqual(h.requests, [['owner-a', 'TEST', 'route_plan'], ['owner-a', 'TEST', 'route_plan']]);
  } finally { h.host.dispose(); }
});

test('Unreadable device routes do not expose the saved-lesson empty recovery anchor', () => {
  const h = plansUXHarness({ routesFail: true, initial: { initialSection: 'routes' } });
  try {
    const view = h.host.render();
    assert.match(text(view), /On-device records could not be checked/);
    assert.equal(nodes(view).find(node => typeof node.type === 'function' && node.type.name === 'Empty'), undefined);
    assert.equal(nodes(view).find(node => node.props?.['data-guide'] === 'saved-routes-empty'), undefined);
  } finally { h.host.dispose(); }
});

test('A cloud failure preserves the usable device route while the overview marks account counts unavailable', async () => {
  const saved = [{ id: 'local-rome', createdAt: '2026-10-01T10:00:00Z', input: { days: '2 days' }, plan: { summary: 'Rome on this device', routes: [{ ...route, name: 'Rome' }] } }];
  const h = plansUXHarness({ saved, list: async () => { throw Error('Offline'); }, initial: { user: { id: 'owner-a' }, ownerId: 'owner-a', accessToken: 'TEST' } });
  try {
    await tick(); let view = h.host.render();
    const routeCategory = find(view, 'button', p => p['data-section'] === 'routes');
    assert.ok(find(routeCategory, 'span', p => p['aria-label'] === "The list couldn't be read"));
    routeCategory.props.onClick(); view = h.host.render();
    assert.match(text(view), /Account items could not load/);
    assert.ok(button(view, 'Open plan')); assert.equal(saved.length, 1);
  } finally { h.host.dispose(); }
});

test('Shared plans stays in the primary choices beside personal trips and saved collections and opens directly', () => {
  const h = plansUXHarness();
  try {
    const overview=h.host.render(), sharedEntry=find(overview,'nav',p=>p.className==='plans-primary-actions');
    assert.ok(button(sharedEntry,'My trips'));assert.ok(button(sharedEntry,'Saved items'));assert.ok(button(sharedEntry,'Shared plans'));
    assert.ok(nodes(overview).indexOf(sharedEntry)<nodes(overview).findIndex(node=>node.props?.className==='plans-collections'),'The three destinations precede the saved collections');
    button(sharedEntry, 'Shared plans').props.onClick();
    const view = h.host.render();
    assert.equal(text(find(view, 'h1')), 'Shared plans');
    assert.equal(find(view, 'PersonalTravelCards'), undefined);
    assert.match(text(view), /Join the same trip with friends/);
    find(view, 'button', p => p.className?.includes('trips-collaboration-entry')).props.onClick();
    assert.deepEqual(h.signIns, [true]);
    assert.equal(nodes(view).filter(node => node.type === 'details').length, 0, 'Shared plans opens directly without nested cards or disclosures');
  } finally { h.host.dispose(); }
});

test('An explicit tool request opens and reopens the requested journey tool without resetting its request identity', () => {
  const h = plansUXHarness({ initial: { initialTool: 'journal', toolRequestId: 1 } });
  try {
    let view = h.host.render();
    let hub = find(view, 'LazyComponent', p => p.initialTool === 'journal');
    assert.equal(hub.props.toolRequestId, 1);
    const tools = nodes(view).find(node => node.type === 'details' && text(node).includes('Other travel tools'));
    tools.props.onToggle({ currentTarget: { open: false } }); view = h.host.render();
    assert.equal(find(view, 'LazyComponent', p => p.initialTool === 'journal'), undefined);
    view = h.host.render({ toolRequestId: 2 }); hub = find(view, 'LazyComponent', p => p.initialTool === 'journal');
    assert.equal(hub.props.toolRequestId, 2);
  } finally { h.host.dispose(); }
});

test('Country discovery exposes country updates and costs with precise navigation in all three languages', () => {
  const labels = {
    tr: ['Ülke Gündemi', 'Ülke Maliyetleri'],
    en: ['Country Updates', 'Country Costs'],
    sq: ['Lajme nga shtetet', 'Kostot sipas shtetit'],
  };
  for (const locale of ['tr', 'en', 'sq']) {
    const host = hooks(), navigations = [];
    const i18n = { locale, dateLocale: 'en-GB', copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en };
    const { ExploreScreen } = load('mobile/src/screens/ExploreScreen.tsx', {
      ...common(host), '../lib/i18n': { useI18n: () => i18n },
      '../components/Icon': { Icon: 'Icon' }, '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
      '../components/PageHero': { PageHero: 'PageHero' }, '../components/CountryFlag': { CountryFlag: 'CountryFlag' },
      '../components/CountryPicker': { CountryPicker: 'CountryPicker' },
      '../components/DestinationPhoto': { DestinationPhoto: 'DestinationPhoto' }, '../components/DestinationSearchFallback': { DestinationSearchFallback: 'DestinationSearchFallback' },
      '../lib/activeTripContext': { useActiveTripContext: () => null },
      '../data/countryIso': { alpha2FromAlpha3: () => 'TR' }, '../data/artwork': { destinationArtwork: () => '' },
      '../data/discovery': load('mobile/src/data/discovery.ts'), '../data/routes': { routeByDestinationCode: () => null }, '../data/homeDestinations': { homeSearchDestinations: () => [] },
      '../data/countryCodes': {}, '../lib/profileCountries': {}, '../lib/profileSync': {}, '../lib/searchText': search,
      '../lib/storage': { getFavoriteDestinations: () => [] }, '../lib/supabaseData': {},
      '../hooks/usePassportPreference': { usePassportPreference: () => ({ country: '', type: '' }) },
      '../lib/passportPreference': { hasPassportPreference: value => Boolean(value.country && value.type), preferredEntry: () => ({ label: 'Verify entry conditions', visaFree: false }) },
      '../../../lib/country-intelligence/passports': { PASSPORTS: [] },
      '../data/passport-index.json': { default: { asOf: '2026-10-01' } },
      '../../../lib/planner-passport': { plannerPassportLabel: () => 'Passport not selected' },
    }, { document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } });
    try {
      host.start(ExploreScreen, { accessToken: '', onNavigate: view => navigations.push(view), onSurprise() {}, onBuildRoute() {}, onNotice() {} });
      const actions = find(host.render(), 'section', props => props.className === 'explore-actions');
      assert.ok(actions);
      for (const label of labels[locale]) {
        const entries = nodes(actions).filter(node => node.type === 'button' && text(find(node, 'strong')) === label);
        assert.equal(entries.length, 1, `${locale}: one visible ${label} entry`);
        entries[0].props.onClick();
      }
      assert.deepEqual(navigations, ['country-news', 'costs']);
      assert.equal(nodes(actions).filter(node => node.type === 'button').length, 6, 'Existing discovery actions remain alongside the two relocated entries');
      find(host.render(), 'input', props => props.type === 'search').props.onChange({ target: { value: 'Paris' } });
      const searched = host.render();
      const persistentActions = find(searched, 'section', props => props.className === 'explore-actions');
      assert.equal(nodes(persistentActions).filter(node => node.type === 'button').length, 2, 'Country updates and costs stay visible with a retained destination query');
      for (const label of labels[locale]) {
        find(persistentActions, 'button', props => text(props.children).startsWith(label)).props.onClick();
      }
      assert.deepEqual(navigations, ['country-news', 'costs', 'country-news', 'costs']);
      assert.equal(find(searched, 'input', props => props.type === 'search').props.value, 'Paris', 'Opening an auxiliary screen never clears the country search draft');
    } finally { host.dispose(); }
  }
});

function exploreUXHarness(locale='en',initialQuery='') {
  const host=hooks(),navigation=[],built=[],notices=[];let favorites=[];
  const i18n={locale,copy:(tr,en,sq)=>locale==='tr'?tr:locale==='sq'?sq||en:en};
  const {ExploreScreen}=load('mobile/src/screens/ExploreScreen.tsx',{
    ...common(host),'../lib/i18n':{useI18n:()=>i18n},
    '../components/Icon':{Icon:'Icon'},'../components/TravelToolArtwork':{TravelToolArtwork:'TravelToolArtwork'},'../components/PageHero':{PageHero:'PageHero'},'../components/CountryFlag':{CountryFlag:'CountryFlag'},
    '../components/CountryPicker':{CountryPicker:'CountryPicker'},'../../../lib/country-intelligence/passports':{PASSPORTS:[]},
    '../components/DestinationPhoto':{DestinationPhoto:'DestinationPhoto'},'../components/DestinationSearchFallback':{DestinationSearchFallback:'DestinationSearchFallback'},'../lib/activeTripContext':{useActiveTripContext:()=>null},
    '../data/countryIso':{alpha2FromAlpha3:code=>({ALB:'AL',JPN:'JP',GEO:'GE',AZE:'AZ',BIH:'BA',SRB:'RS'})[code]||'TR'},'../data/artwork':{destinationArtwork:()=>''},
    '../data/discovery':load('mobile/src/data/discovery.ts'),'../data/routes':routeCatalog,'../data/homeDestinations':homeData,
    '../data/countryCodes':{},'../lib/profileCountries':{},'../lib/profileSync':{},'../lib/searchText':search,
    '../lib/storage':{getFavoriteDestinations:()=>favorites,addRecentDestination(){},toggleFavoriteDestination:country=>{favorites=favorites.some(item=>item.alpha3===country.alpha3)?favorites.filter(item=>item.alpha3!==country.alpha3):[...favorites,country];return favorites;}},
    '../lib/supabaseData':{getUserProfile:()=>{throw Error('Guest discovery must not request account data');}},
    '../hooks/usePassportPreference':{usePassportPreference:()=>({country:'DE',type:'ordinary'})},'../lib/passportPreference':{hasPassportPreference:value=>Boolean(value.country&&value.type),preferredEntry:()=>({label:'Verify entry conditions',visaFree:false})},
    '../data/passport-index.json':{default:{asOf:'2026-10-01'}},'../../../lib/planner-passport':{plannerPassportLabel:(_passport,_locale,country)=>`${country} · Ordinary`},
  },{document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}}});
  host.start(ExploreScreen,{initialSearchQuery:initialQuery,accessToken:'',onNavigate:view=>navigation.push(view),onSurprise(){},onBuildRoute:route=>built.push(route),onNotice:message=>notices.push(message)});
  return {host,navigation,built,notices,get favorites(){return favorites;},query:value=>{find(host.render(),'input',props=>props.type==='search').props.onChange({target:{value}});return host.render();}};
}

test('Explore finds visible Albanian country names and Tiranë aliases, and only real inspectable results complete its search lesson',()=>{
  const h=exploreUXHarness('sq');try{
    for(const query of ['Shqipëria','Shqiperi','Tiranë','Tirane','Tirana','Albania','Arnavutluk']){
      const view=h.query(query),field=find(view,'input',props=>props.type==='search');
      assert.equal(field.props['data-guide-discovery'],'ready',query);assert.equal(field.props['data-guide-complete'],'true',query);
      const open=find(view,'button',props=>props['data-guide']==='explore-place');assert.ok(open,query);assert.match(open.props['aria-label'],/Tirana/);
    }
    const view=h.host.render();assert.match(text(view),/Pasaporta jote:Gjermani\b/);assert.match(text(view),/Shtetet e preferuara: 0/);
    find(view,'button',props=>props['data-guide']==='explore-place').props.onClick();
    let opened=h.host.render();const save=find(opened,'button',props=>props['data-guide']==='explore-save');assert.equal(save.props['aria-pressed'],false);
    save.props.onClick();opened=h.host.render();assert.equal(find(opened,'button',props=>props['data-guide']==='explore-save').props['aria-pressed'],true);
    assert.equal(h.favorites[0].alpha3,'ALB');assert.deepEqual(h.built,[]);assert.deepEqual(h.navigation,[]);
    assert.equal(find(opened,'input',props=>props.type==='search').props['data-guide-return-complete'],'false','The saved details must actually close before the return lesson can complete');
    find(opened,'Sheet',props=>props.open).props.onClose();opened=h.host.render();
    assert.equal(find(opened,'input',props=>props.type==='search').props['data-guide-return-complete'],'true','Sheet X, Escape and native dismissal share the real onClose state');
  }finally{h.host.dispose();}
});

test('Paris and zero-result searches put genuine results ahead of auxiliary tools, preserve the route action and offer a local recovery',()=>{
  const h=exploreUXHarness('en','Paris');try{
    let view=h.host.render(),field=find(view,'input',props=>props.type==='search');
    assert.equal(field.props['data-guide-discovery'],'route-only');assert.equal(field.props['data-guide-complete'],'false');assert.equal(find(view,'PageHero'),undefined);
    assert.equal(find(view,'section',props=>props.className==='daily-discovery'),undefined);
    const flattened=nodes(view),resultIndex=flattened.findIndex(node=>node.props?.id==='explore-search-results'),toolIndex=flattened.findIndex(node=>node.props?.className==='explore-actions');
    assert.ok(resultIndex>=0&&toolIndex>resultIndex,'Search results precede the compact country tools');assert.match(text(view),/Your passport:Germany/);assert.match(text(view),/Favourite countries: 0/);
    const plan=find(view,'button',props=>props['aria-label']?.startsWith('Plan Paris'));assert.ok(plan);plan.props.onClick();assert.equal(h.built.length,1);assert.equal(h.built[0].destinationCode,'CDG');
    view=h.query('No such destination');field=find(view,'input',props=>props.type==='search');assert.equal(field.props['data-guide-discovery'],'empty');assert.equal(field.props['data-guide-complete'],'false');
    button(view,'Try Tirana').props.onClick();view=h.host.render();assert.equal(find(view,'input',props=>props.type==='search').props.value,'Tirana');assert.equal(find(view,'input',props=>props.type==='search').props['data-guide-complete'],'true');
    find(view,'button',props=>props['data-guide']==='explore-place').props.onClick();view=h.host.render();find(view,'Sheet',props=>props.open).props.onClose();view=h.host.render();
    assert.equal(find(view,'input',props=>props.type==='search').props['data-guide-return-complete'],'false','Closing an unsaved country cannot pretend the saving task succeeded');
    assert.equal(h.built.length,1,'The example search cannot generate or replace a route');assert.deepEqual(h.favorites,[]);
    view=h.query('');assert.ok(find(view,'PageHero'),'Clearing the search restores normal discovery');assert.equal(nodes(find(view,'section',props=>props.className==='explore-actions')).filter(node=>node.type==='button').length,6);
  }finally{h.host.dispose();}
});

test('Plans removes the standalone airport entry and keeps the trip details destination accessible for guests', () => {
  const labels = { tr: 'Havalimanı Rehberi', en: 'Airport Guide', sq: 'Udhëzues aeroportesh' };
  for (const locale of ['tr', 'en', 'sq']) {
    const h = plansUXHarness({ locale });
    try {
      const view=h.host.render(),list = find(view, 'div', props => props.className === 'plans-tool-list');
      const airport = find(list, 'button', props => text(props.children).startsWith(labels[locale]));
      assert.equal(airport, undefined, `${locale}: the standalone guide is removed from preparation`);
      const primary=find(view,'nav',props=>props.className==='plans-primary-actions');
      const tripLabels={tr:'Seyahatler',en:'My trips',sq:'Udhëtimet'};
      button(primary,tripLabels[locale]).props.onClick();
      assert.deepEqual(h.navigations, ['cockpit']);
      assert.deepEqual(h.signIns, [], 'Opening the trip destination does not require a separate sign-in step');
    } finally { h.host.dispose(); }
  }
});

test('The visible journal entry opens the exact expanded journey tool and every deliberate reopen has a new request', () => {
  const labels = { tr: ['Seyahat günlüğüm', 'Tüm kayıtlar', 'Diğer seyahat araçları'], en: ['Travel journal', 'All saved', 'Other travel tools'], sq: ['Ditari im i udhëtimit', 'All saved', 'Other travel tools'] };
  for (const locale of ['tr', 'en', 'sq']) {
    const h = plansUXHarness({ locale });
    try {
      const open = () => {
        const list = find(h.host.render(), 'div', props => props.className === 'plans-tool-list');
        const entry = find(list, 'button', props => text(props.children).startsWith(labels[locale][0]));
        assert.ok(entry, `${locale}: journal is directly visible`); entry.props.onClick();
        return h.host.render();
      };
      let view = open();
      const first = find(view, 'LazyComponent', props => props.initialTool === 'journal');
      assert.ok(first, 'Journal opens instead of a generic tool overview');
      assert.equal(find(view, 'header', props => props.className === 'plans-category-heading') !== undefined, true);
      const expanded = find(view, 'details', props => text(props.children).includes(labels[locale][2]));
      assert.equal(expanded.props.open, true);
      assert.equal(find(view, 'LazyComponent', props => props.initialTool === 'journal').props.toolRequestId, first.props.toolRequestId, 'Ordinary renders retain the journal request identity');
      assert.deepEqual(h.navigations, [], 'Local journal opening remains in Plans');
      button(view, labels[locale][1]).props.onClick(); view = open();
      const second = find(view, 'LazyComponent', props => props.initialTool === 'journal');
      assert.notEqual(second.props.toolRequestId, first.props.toolRequestId);
      assert.deepEqual(h.signIns, []);
    } finally { h.host.dispose(); }
  }
});

test('A changed external tool or request overrides a local journal without stale reactivation', () => {
  const h = plansUXHarness({ initial: { initialTool: 'airport', toolRequestId: 10 } });
  const openLocal = () => {
    button(h.host.render(), 'All saved').props.onClick();
    const list = find(h.host.render(), 'div', props => props.className === 'plans-tool-list');
    find(list, 'button', props => text(props.children).startsWith('Travel journal')).props.onClick();
    return find(h.host.render(), 'LazyComponent', props => props.initialTool === 'journal');
  };
  try {
    let local = openLocal(); assert.ok(local); assert.notEqual(local.props.toolRequestId, 10);
    let view = h.host.render({ initialTool: 'map' });
    let external = find(view, 'LazyComponent', props => props.initialTool === 'map');
    assert.equal(external.props.toolRequestId, 10, 'A changed tool overrides local state even with the same external request ID');
    assert.equal(find(view, 'LazyComponent', props => props.initialTool === 'journal'), undefined);
    local = openLocal(); assert.ok(local);
    view = h.host.render({ toolRequestId: 11 });
    external = find(view, 'LazyComponent', props => props.initialTool === 'map');
    assert.equal(external.props.toolRequestId, 11, 'A newer request for the same external tool also wins');
    assert.equal(find(h.host.render(), 'LazyComponent', props => props.initialTool === 'map').props.toolRequestId, 11, 'The local journal does not reactivate on an ordinary render');
    view = h.host.render({ initialTool: 'journal', toolRequestId: 12 });
    assert.equal(find(view, 'LazyComponent', props => props.initialTool === 'journal').props.toolRequestId, 12, 'External journal requests retain their own identity too');
  } finally { h.host.dispose(); }
});

test('Leaving a local journal for ordinary Plans sections never reopens it through the offline card', () => {
  const h = plansUXHarness();
  try {
    const journalEntry = find(h.host.render(), 'button', props => text(props.children).startsWith('Travel journal'));
    journalEntry.props.onClick();
    assert.ok(find(h.host.render(), 'LazyComponent', props => props.initialTool === 'journal'));
    button(h.host.render(), 'All saved').props.onClick();
    const overview = h.host.render();
    find(overview, 'button', props => text(props.children).startsWith('Personal cards & travel tools')).props.onClick();
    const tools = find(h.host.render(), 'LazyComponent');
    assert.ok(tools, 'The user still reaches their ordinary travel tools');
    assert.equal(tools.props.initialTool, undefined, 'A general section is not another request to open the old journal');
    assert.equal(tools.props.toolRequestId, 0);
    const disclosure = find(h.host.render(), 'details', props => text(props.children).includes('Other travel tools'));
    assert.equal(disclosure.props.open, true, 'Clearing the one-shot journal request does not reset deliberate disclosure state');
  } finally { h.host.dispose(); }
});

test('New external Plans sections and guide requests invalidate a local journal before ordinary tool access', () => {
  const cases = [
    { name: 'new section', initial: {}, next: { initialSection: 'all', sectionRequestId: 1 } },
    { name: 'same section with a fresh request', initial: { initialSection: 'all', sectionRequestId: 4 }, next: { sectionRequestId: 5 } },
    { name: 'new guide entry', initial: { guideRequest: 2 }, next: { guideRequest: 3 } },
  ];
  for (const entry of cases) {
    const h = plansUXHarness({ initial: entry.initial });
    try {
      find(h.host.render(), 'button', props => text(props.children).startsWith('Travel journal')).props.onClick();
      let hub = find(h.host.render(), 'LazyComponent', props => props.initialTool === 'journal');
      assert.ok(hub, entry.name);
      assert.equal(find(h.host.render({ ...entry.initial }), 'LazyComponent', props => props.initialTool === 'journal').props.toolRequestId, hub.props.toolRequestId, 'The unchanged external context preserves the current local request');
      const overview = h.host.render(entry.next);
      find(overview, 'button', props => text(props.children).startsWith('Personal cards & travel tools')).props.onClick();
      hub = find(h.host.render(), 'LazyComponent');
      assert.ok(hub, entry.name);
      assert.equal(hub.props.initialTool, undefined, `${entry.name}: a stale journal cannot reactivate`);
      assert.equal(hub.props.toolRequestId, 0);
    } finally { h.host.dispose(); }
  }
});

test('A fresh section request reopens the route list even when its initialSection prop is unchanged', () => {
  const h = plansUXHarness({ initial: { initialSection: 'routes', sectionRequestId: 1 } });
  try {
    button(h.host.render(), 'All saved').props.onClick();
    assert.equal(text(find(h.host.render(), 'h1')), 'Your Plans');
    assert.equal(text(find(h.host.render({ sectionRequestId: 1 }), 'h1')), 'Your Plans', 'A retained render preserves deliberate user navigation');
    assert.equal(text(find(h.host.render({ sectionRequestId: 2 }), 'h1')), 'My routes', 'The explicit repeat request reaches the exact list');
  } finally { h.host.dispose(); }
});

test('The route save exit uses the exact route-library callback and explains its actual screen names', async () => {
  const h = plannerHarness(), opened = [];
  try {
    h.host.render({ onOpenSavedRoutes: () => opened.push('routes') });
    button(selected(h.host.render()), 'Save this plan').props.onClick(); await tick();
    const view = h.host.render();
    assert.match(text(view), /Plans → My routes/);
    button(view, 'Go to My routes').props.onClick();
    assert.deepEqual(opened, ['routes']); assert.deepEqual(h.navigations, []);
    assert.equal(h.saves.length, 1);
  } finally { h.host.dispose(); }
});

test('Only a new explicit Plans guide request resets a retained category and query; saved data and later user navigation persist',()=>{
  const host=hooks();
  const saved=[{id:'guide-saved-route',createdAt:'2026-10-18T08:00:00Z',input:{days:'3 days'},plan:{summary:'My plan',routes:[{...route,visaStatus:'Visa-free guaranteed',visaNote:'Legacy passport assumption'}]}}];
  const before=JSON.stringify(saved);
  const {TripsScreen}=load('mobile/src/screens/PlansScreen.tsx',{
    ...common(host),'../components/TravelToolArtwork':{TravelToolArtwork:'TravelToolArtwork'},'../../../lib/event-time':{},'../components/Icon':{Icon:'Icon'},'../components/CountryFlag':{},'../components/Sheet':{Sheet:'Sheet'},'../components/TripCollaborationHub':{},'../components/TravelSavedPlaces':{},'../components/PersonalTravelCards':{},
    '../lib/savedPlaces':{readSavedPlaces:()=>({items:[],dayIds:[],error:null}),subscribeSavedPlaces:()=>()=>{}},'../data/countryIso':{},'../data/artwork':{destinationArtwork:()=>''},'../data/discovery':{DISCOVERY_DESTINATIONS:[]},
    '../lib/storage':{getSavedRoutePlans:()=>saved,getFavoriteDestinations:()=>[],getSavedTravelEvents:()=>[]},'../lib/supabaseData':{},'../lib/native':{},'../lib/routeOutbox':{readRouteOutbox:()=>({})},'../lib/routeSync':{},'../lib/eventReminders':{},'../lib/searchText':search,
  });
  try{
    host.start(TripsScreen,{initialSection:'routes',guideRequest:0,user:null,accessToken:'',onNavigate(){},onNotice(){},onOpenAccount(){},onOpenDestination(){}});
    find(host.render(),'input',p=>p.type==='search').props.onChange({target:{value:'saved query'}});
    assert.equal(find(host.render(),'input',p=>p.type==='search').props.value,'saved query');
    assert.equal(find(host.render({guideRequest:0}),'input',p=>p.type==='search').props.value,'saved query','Ordinary retained returns keep the filter');
    let view=host.render({guideRequest:1});
    const entry=find(view,'button',p=>p['data-guide']==='saved-library');assert.ok(entry,'Guide target exists on overview');
    assert.equal(find(view,'input',p=>p.type==='search'),undefined);
    entry.props.onClick();view=host.render();
    assert.equal(find(view,'input',p=>p.type==='search').props.value,'','Explicit guide entry clears only the old query');
    find(view,'input',p=>p.type==='search').props.onChange({target:{value:'Rome'}});
    assert.equal(find(host.render({guideRequest:1}),'input',p=>p.type==='search').props.value,'Rome','The same guide token cannot undo later user choices');
    view=host.render({guideRequest:2});assert.ok(find(view,'button',p=>p['data-guide']==='saved-library'));
    find(view,'button',p=>p['data-guide']==='saved-library').props.onClick();
    button(host.render(),'Open plan').props.onClick();
    const detail=nodes(host.render()).find(n=>typeof n.type==='function' && n.type.name==='PlanDetail');
    const detailView=detail.type(detail.props);
    assert.match(text(detailView),/Entry conditions need verification/);
    assert.doesNotMatch(text(detailView),/Visa-free guaranteed/);
    const note=find(detailView,'RouteTranslation',p=>p.text?.startsWith('Passport not selected'));
    assert.ok(note,'A legacy save with no document snapshot cannot keep its old inferred passport claim');
    const known=detail.type({...detail.props,selected:{...detail.props.selected,input:{passportCountry:'TR',passportType:'special'}}});
    assert.match(text(known),/Visa-free/,'An explicitly saved valid passport still controls its entry guidance');
    assert.equal(JSON.stringify(saved),before,'Guide navigation and passport display never rewrite saved records');
  }finally{host.dispose();}
});


test('Personal cards receive real trip choices, retain cached options on failure and ignore stale account responses', async () => {
  const trip=(id,city)=>({id,destinationCity:city,destinationCountry:'France',destinationCode:'FR',startDate:'2026-11-01',endDate:'2026-11-04',status:'planned'});
  const pending=[], cachedTrips=new Map([['a',[trip('a-cached','Paris')]],['b',[trip('b-cached','Lyon')]]]);
  const h=plansUXHarness({ cachedTrips, list:async()=>[{id:'saved-route-not-a-trip',mobileKind:'route_plan'}], cockpitList:(...args)=>new Promise((resolve,reject)=>pending.push({args,resolve,reject})), initial:{user:{id:'a'},ownerId:'a',accessToken:'a-token',initialSection:'travel'} });
  const cards=()=>find(h.host.render(),'PersonalTravelCards');
  try{
    assert.equal(cards().props.trips[0].id,'a-cached'); assert.equal(h.cockpitRequests[0][0],'a');
    h.host.render({user:{id:'b'},ownerId:'b',accessToken:'b-token'});
    assert.equal(cards().props.trips[0].id,'b-cached');
    pending[0].resolve([trip('a-private','Secret')]); await tick();
    assert.equal(cards().props.trips[0].id,'b-cached'); assert.equal(cachedTrips.get('a')[0].id,'a-cached');
    pending[1].reject(Error('offline')); await tick(); assert.equal(cards().props.trips[0].id,'b-cached');
    h.host.render({user:{id:'c'},ownerId:'c',accessToken:'c-token'});
    pending[2].resolve([trip('c-live','Nice')]); await tick();
    assert.deepEqual(JSON.parse(JSON.stringify(cards().props.trips)),[{id:'c-live',title:'Nice',startDate:'2026-11-01'}]);
    h.host.render({user:null,ownerId:null,accessToken:''});
    assert.deepEqual(Array.from(cards().props.trips),[]); assert.equal(pending.length,3);
  }finally{h.host.dispose();}
});


test('A handled external tool does not reopen when the user later chooses the general personal cards section', () => {
  const h=plansUXHarness({initial:{initialTool:'journal',toolRequestId:7}});
  try{
    let view=h.host.render();assert.equal(find(view,'LazyComponent',p=>p.initialTool==='journal').props.toolRequestId,7);
    button(view,'All saved').props.onClick();view=h.host.render();
    find(view,'button',p=>text(p.children).startsWith('Personal cards & travel tools')).props.onClick();view=h.host.render();
    assert.ok(find(view,'PersonalTravelCards'));
    assert.equal(find(view,'LazyComponent',p=>p.initialTool==='journal'),undefined);
    view=h.host.render({toolRequestId:8});assert.equal(find(view,'LazyComponent',p=>p.initialTool==='journal').props.toolRequestId,8,'A new deliberate deep link still opens the tool');
  }finally{h.host.dispose();}
});
