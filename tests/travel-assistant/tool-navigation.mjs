import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
function load(path, imports = {}, globals = {}) {
  const file = resolve(path);
  if (file.endsWith('.json')) return { __esModule: true, default: JSON.parse(readFileSync(file, 'utf8')) };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Date, ...globals })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('.')) {
      const base = resolve(dirname(file), name);
      const target = [base, `${base}.ts`, `${base}.json`].find(existsSync);
      assert.ok(target, `Resolvable local import: ${name}`);
      return load(target);
    }
    throw Error(`Unstubbed import: ${name}`);
  }, output, output.exports);
  return output.exports;
}
function nodes(value) {
  if (!value || typeof value !== 'object' || value.props?.hidden) return [];
  return [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join('');
  return value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
const find = (view, type, predicate = () => true) => nodes(view).find(node => node.type === type && predicate(node.props));
const button = (view, label) => find(view, 'button', props => props['aria-label'] === label || text(props.children).trim() === label || text(find({ props }, 'strong')) === label);
const cardLabels = view => nodes(view).filter(node => node.type === 'button' && node.props.className === 'ta-tool-card').map(node => text(find(node, 'strong')));
const searchText = load('mobile/src/lib/searchText.ts', {});
const money = load('lib/travel-assistant/money.ts', {});
const practical = load('lib/travel-assistant/country-practical.ts', {
  '../country-intelligence/currencies': load('lib/country-intelligence/currencies.ts', {}),
  '../country-intelligence/time-zones': load('lib/country-intelligence/time-zones.ts', {}),
  './emergency': load('lib/travel-assistant/emergency.ts', {}),
});

// Run the real component and event closures. Only child tools and React's host
// are replaced. Refs attach during a simulated commit, before animation frames.
function harness({ initialCountry = '', savedCountry = '', locale: initialLocale = 'en', selection, guides = [], locate = async () => {throw Error('unavailable');} } = {}) {
  const slots = [], frames = [], selectedCountries = [], phrases = [], localTips = [], effects = [];
  let cursor = 0, locale = initialLocale, view, focused, focusOptions, scrolled, scrollOptions, oldRefs = [], signIns = 0, guideRequests = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect,deps) { const i=cursor++; const old=slots[i]; if(!old || deps.some((value,index)=>value!==old.deps[index])) { const next={deps,cleanup:null};slots[i]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=effect();}); } },
    lazy(loader) { const name = loader.toString().match(/require\(['"]\.\/([^'"]+)/)?.[1]; assert.ok(name, 'Lazy child remains identifiable'); return name; },
    Suspense: 'Suspense',
  };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../lib/deviceArea': {locateDeviceArea:locate},
    '../../../lib/travel-assistant/guides': { GUIDE_CARDS: guides },
    '../../../lib/country-intelligence/advisory-destinations.json': {default: JSON.parse(readFileSync('lib/country-intelligence/advisory-destinations.json', 'utf8'))},
    '../lib/native': { openExternal: async () => true },
    '../data/countries': { COUNTRY_LIST: [{ alpha3: 'TUR', name: 'Türkiye' }, { alpha3: 'GBR', name: 'United Kingdom' }] },
    '../data/countryIso': { alpha2FromAlpha3: code => ({ TUR: 'TR', GBR: 'GB' })[code] },
    '../hooks/usePassportPreference': { usePassportPreference: () => ({ country: 'TR' }) },
    '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en, countryName: (_, fallback) => fallback }) },
    './CountryPicker': { CountryPicker: 'CountryPicker' },
    './CountryQuickFacts': { CountryQuickFacts: 'CountryQuickFacts' },
    '../lib/travelSelection': selection || { readTravelCountry: () => savedCountry, selectTravelCountry: code => selectedCountries.push(code) },
    '../lib/searchText': searchText,
    '../../../lib/travel-assistant/country-practical': practical,
    '../../../lib/travel-assistant/money': money,
    './TravelSafety': { TravelSafety: 'TravelSafety', EmbassyCards: 'EmbassyCards', EvidenceLine: 'EvidenceLine' },
    '../../../lib/travel-assistant/evidence': { evidenceStatus: () => 'current' },
    '../hooks/useCurrentTime': { useCurrentTime: () => Date.parse('2026-09-27T08:00:00Z') },
    './Icon': { Icon: 'Icon' },
    './TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
  };
  const api = load('mobile/src/components/TravelAssistant.tsx', imports, { window: { requestAnimationFrame: fn => frames.push(fn) } });
  let props = { initialCountry, onPhrases: country => phrases.push(country), onLocalTips: country => localTips.push(country), onNotice: () => {}, accessToken: '', onSignIn: () => signIns++ };
  const h = {
    render(next = {}) {
      props = { ...props, ...next }; cursor = 0; view = api.TravelAssistant(props);
      oldRefs.forEach(ref => { ref.current = null; }); oldRefs = [];
      nodes(view).forEach(node => { if (node.props?.ref && typeof node.props.ref === 'object') { const ref = node.props.ref; oldRefs.push(ref); ref.current = { focus: options => { focused = node; focusOptions = options; }, scrollIntoView: options => { scrolled = node; scrollOptions = options; } }; } });
      frames.splice(0).forEach(fn => fn());
      effects.splice(0).forEach(fn=>fn());
      return view;
    },
    choose(label) { const control = button(view, label); assert.ok(control, `Visible control: ${label}`); control.props.onClick(); return h.render(); },
    search(query) { find(view, 'input', props => props.type === 'search').props.onChange({ target: { value: query } }); return h.render(); },
    openGuide() { h.render({initialTool:'guide',toolRequestId:++guideRequests});return h.render(); },
    expand() { const control = find(view, 'button', props => props['aria-controls'] === 'ta-other-tools'); if (control && !control.props['aria-expanded']) { control.props.onClick(); h.render(); } return view; },
    language(next) { locale = next; return h.render(); },
    focused: () => focused, focusOptions: () => focusOptions, scrolled: () => scrolled, scrollOptions: () => scrollOptions, selectedCountries, phrases, localTips, signIns: () => signIns,
  };
  h.render(); return h;
}

function companionHarness(initial = {}) {
  const slots=[],effects=[],selection=load('mobile/src/lib/travelSelection.ts',{});
  let cursor=0,dirty=false,view,props={initialCountry:'GB',accessToken:'',onSignIn(){},onNavigate(){},onNotice(){},...initial};
  const react={
    useState(initial){const at=cursor++;slots[at]||={value:typeof initial==='function'?initial():initial};return[slots[at].value,next=>{const value=typeof next==='function'?next(slots[at].value):next;if(!Object.is(value,slots[at].value)){slots[at].value=value;dirty=true;}}];},
    useRef(initial){const at=cursor++;return slots[at]||={current:initial};},
    useMemo:factory=>factory(),
    useEffect(callback,deps){const at=cursor++,old=slots[at];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){const next={deps};slots[at]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=callback();});}},
    lazy(loader){const name=loader.toString().match(/components\/([^'"]+)/)?.[1];assert.ok(name);return name;},Suspense:'Suspense',
  };
  const profile=code=>({code,languageTr:'Test',languageEn:'Test',phrases:[],etiquette:[]});
  const {TravelCompanionScreen}=load('mobile/src/screens/TravelCompanionScreen.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
    '../components/Icon':{Icon:'Icon'},'../components/TravelToolArtwork':{TravelToolArtwork:'TravelToolArtwork'},
    '../components/CompanionShortcutArtwork':{CompanionShortcutArtwork:'CompanionShortcutArtwork'},
    '../components/CountryPicker':{CountryPicker:'CountryPicker'},'../components/TravelSafety':{EvidenceLine:'EvidenceLine'},
    '../data/countries':{COUNTRY_LIST:[{alpha3:'TUR',name:'Türkiye'},{alpha3:'GBR',name:'United Kingdom'}]},
    '../data/countryIso':{alpha2FromAlpha3:code=>({TUR:'TR',GBR:'GB'})[code],flagEmoji:code=>code},
    '../data/travelEssentials':{TRAVEL_ESSENTIALS:[profile('TR'),profile('GB')],essentialProfile:profile,fallbackEssentialProfile:profile},
    '../lib/i18n':{useI18n:()=>({locale:'en',copy:(_tr,en)=>en,countryName:(_code,fallback)=>fallback})},
    '../lib/travelSelection':selection,
  },{window:{requestAnimationFrame:callback=>callback()},document:{querySelector:()=>null}});
  const h={
    render(next={}){props={...props,...next};for(let pass=0;pass<20;pass++){cursor=0;dirty=false;effects.length=0;view=TravelCompanionScreen(props);effects.splice(0).forEach(callback=>callback());if(!dirty)return view;}throw Error('Companion fixture did not settle');},
    click(label){const control=button(view,label);assert.ok(control,`Visible Companion control: ${label}`);control.props.onClick();return h.render();},
    assistant:()=>find(view,'TravelAssistant'),
    footer:()=>find(view,'section',props=>props.className==='companion-sections'),
    country(code){find(view,'CountryPicker').props.onChange(code);return h.render();},
    selection,view:()=>view,
  };h.render();return h;
}

test('Auto country never overrides a manual country or an abandoned tool; denied location leaves manual selection usable',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});const h=harness({locate:()=>pending});
 h.choose('Emergency help');find(h.render(),'CountryPicker').props.onChange('GB');
 finish({country:'TR',center:{latitude:41.01,longitude:28.98},city:'İstanbul'});await new Promise(setImmediate);
 assert.equal(find(h.render(),'CountryPicker').props.value,'GB');assert.equal(find(h.render(),'TravelSafety').props.country,'GB');
 const denied=harness();denied.choose('Emergency help');await new Promise(setImmediate);assert.ok(text(denied.render()).includes('Location unavailable'));
 find(denied.render(),'CountryPicker').props.onChange('TR');assert.equal(find(denied.render(),'TravelSafety').props.country,'TR');
 let late;const leave=harness({locate:()=>new Promise(resolve=>{late=resolve;})});leave.choose('Emergency help');leave.choose('All tools');late({country:'TR'});await new Promise(setImmediate);
 const directory=leave.render();
 assert.equal(find(directory,'CountryPicker',props=>props.label==='Travel country (optional)').props.value,'','An abandoned GPS result cannot populate the directory country');
 assert.equal(find(directory,'TravelSafety'),undefined,'Returning to the directory must not reopen a country-dependent tool');
});

test('Four primary tools are visible immediately without More or a separate transport/consulate entry', () => {
  const h = harness();
  assert.deepEqual(cardLabels(h.render()), ['Map', 'Photo guide', 'Translate', 'Money']);
  const optionalCountry=find(h.render(),'CountryPicker',props=>props.label==='Travel country (optional)');
  assert.ok(optionalCountry);assert.equal(optionalCountry.props.value,'');assert.notEqual(optionalCountry.props.required,true);
  assert.equal(button(h.render(), 'Country Guide'),undefined,'The guide no longer duplicates a top directory strip');
  assert.equal(find(h.render(),'button',props=>props['aria-controls']==='ta-other-tools'),undefined,'No hidden More menu is needed for the four visible tools');
  assert.equal(button(h.render(),'Transport'),undefined);assert.equal(button(h.render(),'Consulate'),undefined);
  for (const [label, component, mode] of [
    ['Map', 'TravelMap', 'map'],
    ['Translate', 'TravelTranslation'], ['Money', 'TravelMoney'],
    ['Photo guide', 'TravelPhotoGuide'],
  ]) {
    const view = h.choose(label);
    assert.ok(find(view, component), `${label} renders its real child boundary`);
    assert.equal(find(view, 'CountryPicker'), undefined, `${label} does not require country selection`);
    if (mode) assert.equal(find(view, component).props.initialSection, mode);
    h.choose('All tools');
    assert.deepEqual(cardLabels(h.render()), ['Map', 'Photo guide', 'Translate', 'Money'], 'Returning restores the same four direct entries');
  }
  assert.ok(button(h.render(), 'Emergency help'));
  assert.equal(find(h.render(),'TravelTransit'),undefined);assert.equal(find(h.render(),'EmbassyCards'),undefined);
  assert.equal(button(h.render(), 'Country Guide'),undefined);
  find(h.render(),'CountryPicker',props=>props.label==='Travel country (optional)').props.onChange('GB');h.render();
  assert.ok(button(h.search('country guide'),'Country Guide'),'Guide remains reachable by directory search');
  assert.equal(find(h.choose('Country Guide'),'CountryQuickFacts').props.country,'GB');
});

test('Bottom Guide, phrases and local tips have distinct artwork and explicit Guide requests reopen a dismissed real child',()=>{
 const parent=companionHarness();
 const footer=parent.footer(),cards=nodes(footer).filter(node=>node.type==='button');
 assert.equal(cards.length,3);assert.deepEqual(cards.map(card=>text(find(card,'strong'))),['Country Guide','Useful phrases','Local tips']);
 assert.deepEqual(cards.map(card=>find(card,'CompanionShortcutArtwork').props.kind),['guide','phrases','etiquette']);
 assert.equal(nodes(footer).filter(node=>node.type==='TravelToolArtwork').length,0,'These shortcuts use their new artwork instead of repeating old tool assets');
 assert.equal(parent.assistant().props.initialTool,undefined);
 parent.click('Country Guide');let request=parent.assistant().props;
 assert.equal(request.initialTool,'guide');assert.equal(request.initialCountry,'GB');assert.ok(request.toolRequestId>0);
 const child=harness({selection:parent.selection});
 child.render(request);let childView=child.render();parent.render();assert.equal(find(childView,'CountryQuickFacts').props.country,'GB');
 assert.equal(button(parent.footer(),'Country Guide'),undefined,'The currently open guide does not repeat its own footer shortcut');
 child.choose('All tools');childView=child.render(request);parent.render();assert.equal(find(childView,'CountryQuickFacts'),undefined,'The handled request cannot reopen a guide the user deliberately closed');
 const firstId=request.toolRequestId;parent.click('Country Guide');request=parent.assistant().props;
 assert.ok(request.toolRequestId>firstId);child.render(request);childView=child.render();parent.render();assert.equal(find(childView,'CountryQuickFacts').props.country,'GB');
 parent.click('Useful phrases');parent.country('TR');parent.click('Country Guide');request=parent.assistant().props;
 assert.equal(request.initialCountry,'TR');child.render(request);childView=child.render();parent.render();assert.equal(find(childView,'CountryQuickFacts').props.country,'TR');
 parent.click('Local tips');parent.country('GB');parent.click('Country Guide');request=parent.assistant().props;
 assert.equal(request.initialCountry,'GB');child.render(request);childView=child.render();assert.equal(find(childView,'CountryQuickFacts').props.country,'GB');
});

test('External guide links remain valid while Tools explicitly returns to the directory and fresh external props supersede local requests',()=>{
 const parent=companionHarness({initialTool:'guide'}),child=harness({selection:parent.selection});
 let request=parent.assistant().props;assert.equal(request.initialTool,'guide');child.render(request);assert.ok(find(child.render(),'CountryQuickFacts'));parent.render();
 parent.click('Useful phrases');parent.click('Tools');request=parent.assistant().props;
 assert.equal(request.initialTool,undefined,'Returning to Tools is explicit even when the incoming link requested the guide');
 child.render(request);assert.equal(find(child.render(),'CountryQuickFacts'),undefined);parent.render();
 parent.click('Country Guide');assert.equal(parent.assistant().props.initialTool,'guide');
 parent.render({initialTool:'money',initialCountry:'TR'});request=parent.assistant().props;
 assert.equal(request.initialTool,'money');assert.equal(request.initialCountry,'TR');child.render(request);assert.equal(find(child.render(),'TravelMoney').props.destinationCountry,'TR');
 parent.render({initialTab:'etiquette',initialTool:'guide',initialCountry:'GB'});assert.equal(parent.view().props['data-section'],'etiquette');assert.equal(find(parent.view(),'CountryPicker').props.value,'GB');
 parent.click('Country Guide');assert.equal(parent.assistant().props.initialTool,'guide');assert.equal(parent.assistant().props.initialCountry,'GB');
});

test('Legacy map entry IDs open the correct unified section and account changes remount private map state', () => {
  const h=harness({initialCountry:'GB'}), ideas={type:'NearbyIdeas',props:{}};
  for(const [tool,section] of [['map','map'],['explore','map'],['needs','needs'],['saved','saved'],['offline','offline'],['nearby','nearby'],['embassies','embassies']]){
    h.render({initialTool:tool,ownerId:'owner-a',nearbyIdeas:ideas});
    const child=find(h.render(),'TravelMap');assert.ok(child);assert.equal(child.props.initialSection,section);assert.equal(child.key,'owner-a');assert.equal(child.props.ownerId,'owner-a');assert.equal(child.props.destinationCountry,'GB');assert.equal(child.props.nearbyIdeas,ideas);
    assert.equal(find(h.render(),'TravelNearby'),undefined);assert.equal(find(h.render(),'TravelOfflineMap'),undefined);assert.equal(find(h.render(),'TravelSavedPlaces'),undefined);
  }
  assert.equal(find(h.render({ownerId:'owner-b'}),'TravelMap').key,'owner-b');
  assert.equal(find(h.render({ownerId:null}),'TravelMap').key,'guest');
});

test('Legacy transport requests return to the usable directory without mounting the removed tool or losing destination',()=>{
 const h=harness({initialCountry:'GB'});
 h.render({initialTool:'transit'});let view=h.render();
 assert.deepEqual(cardLabels(view),['Map','Photo guide','Translate','Money']);
 assert.equal(find(view,'TravelTransit'),undefined);assert.equal(find(view,'TravelMap'),undefined);
 assert.equal(find(view,'CountryPicker',props=>props.label==='Travel country (optional)').props.value,'GB');
 view=h.choose('Photo guide');assert.ok(find(view,'TravelPhotoGuide'));h.choose('All tools');
 assert.equal(find(h.choose('Map'),'TravelMap').props.destinationCountry,'GB');
});

test('Tools search opens canonical budget and visa screens and retains destination context for the guide', () => {
  const destinations = [];
  const h = harness({ initialCountry: 'JP', locale: 'tr' });
  h.render({ onNavigate: view => destinations.push(view) });
  for (const [query, target] of [['bütçe', 'costs'], ['vize', 'passport']]) {
    const result = find(h.search(query), 'button', props => props['data-app-view'] === target);
    assert.ok(result, `${query} offers the main app screen`);
    result.props.onClick();
  }
  assert.deepEqual(destinations, ['costs', 'passport']);
  h.search('');
  assert.equal(find(h.openGuide(), 'CountryQuickFacts').props.country, 'JP');
});

test('An optional directory country carries into country-dependent tools without gating independent tools or asking for GPS again',()=>{
  let locations=0;
  const h=harness({locate:async()=>{locations++;throw Error('Unexpected GPS request');}});
  find(h.render(),'CountryPicker',props=>props.label==='Travel country (optional)').props.onChange('GB');h.render();
  let view=h.choose('Money');assert.ok(find(view,'TravelMoney'));assert.equal(find(view,'CountryPicker'),undefined);
  assert.equal(find(view,'TravelMoney').props.initialBaseCurrency,'GBP');
  assert.equal(find(view,'TravelMoney').props.destinationCountry,'GB');
  h.choose('All tools');assert.equal(find(h.render(),'CountryPicker',props=>props.label==='Travel country (optional)').props.value,'GB');
  view=h.choose('Emergency help');assert.equal(find(view,'TravelSafety').props.country,'GB');
  assert.deepEqual(h.selectedCountries,['GB']);assert.equal(locations,0);
});

test('Search handles either language, Turkish keyboard variants, and the example pharmacy query', () => {
  const h = harness();
  for (const [query, expected] of [['  ÇEVİRİ  ', 'Translate'], ['IHTIYAC', 'Map'], ['kayitli', 'Map'], ['pharmacy', 'Map'], ['dolar', 'Money'], ['museum', 'Map'], ['consulate','Map'],['konsolosluk','Map'],['ambulans', 'Emergency']]) {
    assert.ok(cardLabels(h.search(query)).includes(expected), `${query} finds ${expected}`);
  }
  for(const query of ['metro','ulaşım','transport']){const view=h.search(query);assert.equal(cardLabels(view).includes('Transport'),false);assert.equal(find(view,'TravelTransit'),undefined);}
  h.language('tr');
  assert.ok(cardLabels(h.search('offline')).includes('Harita'));
  const empty = h.search('no matching tool');
  assert.equal(cardLabels(empty).length, 0);
  assert.match(text(find(empty, 'p', props => props.role === 'status')), /^0 /);
  assert.ok(button(empty, 'Acil yardım'), 'Emergency access survives empty search results');
  assert.equal(find(h.choose('Acil yardım'), 'CountryPicker').props.value, '');
});

test('Emergency-to-consulate navigation uses the common map with the selected country and keeps guide/phrase actions usable', () => {
  const h = harness();
  let view = h.choose('Emergency help');
  assert.equal(find(view, 'TravelSafety'), undefined, 'No country-specific emergency data without a country');
  find(view, 'CountryPicker').props.onChange('GB'); view = h.render();
  assert.equal(find(view, 'TravelSafety').props.country, 'GB');
  assert.deepEqual(h.selectedCountries, ['GB']);
  find(view, 'TravelSafety').props.onOpen('embassies'); view = h.render();
  assert.equal(find(view,'TravelMap').props.initialSection,'embassies');
  assert.equal(find(view,'TravelMap').props.destinationCountry,'GB');
  assert.equal(find(view,'EmbassyCards'),undefined,'Consulate content is owned by the map section');
  assert.equal(find(view,'CountryPicker',props=>props.label==='Your citizenship'),undefined,'The old standalone parent form is removed');
  assert.deepEqual(h.selectedCountries, ['GB'], 'Opening the map does not overwrite the explicit destination');
  h.choose('All tools'); h.expand(); view = h.openGuide();
  assert.equal(find(view, 'CountryPicker').props.value, 'GB');
  h.choose('Open useful phrases'); assert.deepEqual(h.phrases, ['GB']);
  h.choose('Local tips and rules'); assert.deepEqual(h.localTips, ['GB']);
  const initial = harness({ initialCountry: 'TR', savedCountry: 'GB' });
  assert.equal(find(initial.choose('Emergency help'), 'TravelSafety').props.country, 'TR', 'Explicit destination overrides the saved preference');
});

test('Country Guide and directory Money share the destination currency and preserve manual converter storage', () => {
  const h = harness({ initialCountry: 'JP' }); h.expand();
  let view = h.openGuide(); assert.equal(find(view, 'CountryQuickFacts').props.country, 'JP');
  find(view, 'CountryQuickFacts').props.onOpenMoney('JPY'); view = h.render();
  assert.equal(find(view, 'TravelMoney').props.initialBaseCurrency, 'JPY');
  assert.equal(find(h.render({ accessToken: 'ANOTHER_SESSION' }), 'TravelMoney').props.initialBaseCurrency, 'JPY', 'Unrelated parent updates preserve the handoff');
  h.choose('All tools'); view = h.choose('Money'); assert.equal(find(view, 'TravelMoney').props.initialBaseCurrency, 'JPY', 'The explicitly selected journey country also applies to directory entry');
  h.choose('All tools'); view = h.openGuide(); find(view, 'CountryPicker').props.onChange('GB'); view = h.render();
  find(view, 'CountryQuickFacts').props.onOpenMoney('GBP'); view = h.render(); assert.equal(find(view, 'TravelMoney').props.initialBaseCurrency, 'GBP');
  h.choose('All tools'); view = h.openGuide(); find(view, 'CountryPicker').props.onChange('BG'); view = h.render();
  find(view, 'CountryQuickFacts').props.onOpenMoney('EUR'); view = h.render(); assert.equal(find(view, 'TravelMoney').props.initialBaseCurrency, 'EUR', 'Bulgaria uses the practical guide’s reviewed EUR record rather than the older cost catalogue');
  h.choose('All tools'); view = h.openGuide(); find(view, 'CountryPicker').props.onChange('ZZ'); view = h.render();
  find(view, 'CountryQuickFacts').props.onOpenMoney(); view = h.render();
  assert.equal(find(view, 'TravelMoney'), undefined, 'An absent currency never navigates to an unrelated saved pair');
  assert.equal(find(view, 'CountryQuickFacts').props.country, 'ZZ');
});

test('Country-guide handoffs validate the actual currency argument, including a supported second currency', () => {
  const h = harness({ initialCountry: 'PA' }); h.expand();
  let view = h.openGuide();
  assert.equal(practical.countryPracticalInfo('PA').currency.code, 'PAB');
  assert.deepEqual(Array.from(practical.countryPracticalInfo('PA').currency.codes), ['PAB', 'USD']);
  for (const unsupported of ['PAB', 'IDR', 'ZZZ', '', undefined]) {
    find(view, 'CountryQuickFacts').props.onOpenMoney(unsupported); view = h.render();
    assert.equal(find(view, 'TravelMoney'), undefined, `${unsupported}: no substitute converter currency`);
    assert.equal(find(view, 'CountryQuickFacts').props.country, 'PA');
  }
  find(view, 'CountryQuickFacts').props.onOpenMoney('USD'); view = h.render();
  assert.equal(find(view, 'TravelMoney').props.initialBaseCurrency, 'USD', 'Use the supported currency chosen by the guide rather than deriving the unsupported primary PAB');
  h.choose('All tools'); view = h.choose('Money');
  assert.equal(find(view, 'TravelMoney').props.initialBaseCurrency, 'USD', 'Directory entry carries the same supported destination currency');
  assert.deepEqual(h.selectedCountries, [], 'Incoming context does not overwrite stored manual choices');
});

test('Opening and leaving a result focus its heading and preserve the previous search', () => {
  const h = harness();
  h.search('translate'); h.choose('Translate');
  assert.equal(h.focused().type, 'h2'); assert.equal(text(h.focused()), 'Translate');
  assert.equal(h.focused().props.tabIndex, -1);
  assert.ok(h.scrolled().props.className.split(' ').includes('ta-tool-header'));
  assert.ok(button(h.scrolled(), 'All tools'), 'Scroll the back control into view along with the title');
  assert.equal(h.scrollOptions().block, 'start');
  assert.equal(h.scrollOptions().behavior, 'auto');
  assert.equal(h.focusOptions().preventScroll, true, 'Heading focus must not scroll the back control behind the fixed header');
  const restored = h.choose('All tools');
  assert.equal(text(h.focused()), 'What do you need?');
  assert.equal(h.scrolled(), h.focused(), 'Returning to the directory restores its heading');
  assert.equal(find(restored, 'input').props.value, 'translate');
  assert.deepEqual(cardLabels(restored), ['Translate']);
  const cleared = h.choose('Clear search');
  assert.equal(find(cleared, 'input').props.value, '');
  assert.equal(cardLabels(cleared).length, 4);
  assert.equal(h.focused().type, 'input', 'Removing the clear button returns focus to the search field');
  assert.equal(h.focused().props.type, 'search');
});

test('Tool callbacks retain navigation, phrase context, and guest sign-in behavior', () => {
  const h = harness({ savedCountry: 'GB' });
  let view = h.choose('Map');
  assert.equal(find(view, 'TravelMap').props.initialSection, 'map');
  h.choose('All tools'); view = h.choose('Translate'); find(view, 'TravelTranslation').props.onPhrases();
  assert.deepEqual(h.phrases, ['GB']);
  h.choose('All tools'); view = h.choose('Emergency help'); find(view, 'TravelSafety').props.onOpen('phrases');
  assert.deepEqual(h.phrases, ['GB', 'GB']);
  find(view, 'TravelSafety').props.onOpen('needs'); view = h.render();
  assert.equal(find(view, 'TravelMap').props.initialSection, 'needs');
  h.choose('All tools'); h.expand(); view = h.choose('Photo guide');
  assert.equal(find(view, 'TravelPhotoGuide').props.accessToken, '');
  assert.equal(find(view, 'TravelPhotoGuide').key, 'guest');
  find(view, 'TravelPhotoGuide').props.onSignIn(); assert.equal(h.signIns(), 1);
  view = h.render({ accessToken: 'UNIT_TEST_SESSION' });
  assert.equal(find(view, 'TravelPhotoGuide').props.accessToken, 'UNIT_TEST_SESSION');
  assert.equal(find(view, 'TravelPhotoGuide').key, 'signed-in');
});

test('Explicit country selections follow the user between phrases, assistant and local tips', () => {
  const selection = load('mobile/src/lib/travelSelection.ts', {});
  const slots = []; let cursor = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo: factory => factory(), useEffect: () => {}, lazy: () => 'TravelAssistant', Suspense: 'Suspense',
  };
  const profile = code => ({ code, languageTr: 'Test', languageEn: 'Test', phrases: [], etiquette: [] });
  const api = load('mobile/src/screens/TravelCompanionScreen.tsx', {
    '../components/TravelAreaPicker':{TravelAreaPicker:'TravelAreaPicker'},'../lib/capacitor':{isNativePlatform:()=>false},
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../components/CompanionShortcutArtwork':{CompanionShortcutArtwork:'CompanionShortcutArtwork'},
    '../components/Icon': { Icon: 'Icon' }, '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' }, '../components/PageHero': { PageHero: 'PageHero' },
    '../components/CountryPicker': { CountryPicker: 'CountryPicker' },
    '../data/countries': { COUNTRY_LIST: [{ alpha3: 'TUR', name: 'Türkiye' }, { alpha3: 'GBR', name: 'United Kingdom' }] },
    '../data/countryIso': { alpha2FromAlpha3: code => ({ TUR: 'TR', GBR: 'GB' })[code], flagEmoji: code => code },
    '../data/travelEssentials': { TRAVEL_ESSENTIALS: [profile('TR'), profile('GB')], essentialProfile: profile, fallbackEssentialProfile: profile },
    '../lib/api': { getTravelNow: () => { throw Error('Country switching must not fetch live data'); } },
    '../lib/i18n': { useI18n: () => ({ locale: 'en', copy: (_, en) => en, countryName: (_, fallback) => fallback }) },
    '../lib/native': { openExternal: () => {} }, '../lib/travelSelection': selection,
    '../lib/eventSearchContext': { nearbyEventContext:()=>{throw Error('Country switching must not start a nearby-event lookup');} },
    '../components/TravelSafety': { EvidenceLine: 'EvidenceLine' },
  });
  const render = () => { cursor = 0; return api.TravelCompanionScreen({ accessToken: '', onSignIn: () => {}, onNotice: () => {}, onNavigate: () => {} }); };
  let view = render();
  button(view, 'Useful phrases').props.onClick(); view = render();
  assert.equal(find(view, 'CountryPicker').props.value, '', 'First entry never silently assigns Kosovo');
  assert.match(text(view), /Choose your destination/);
  find(view, 'CountryPicker').props.onChange('GB'); view = render();
  assert.equal(find(view, 'CountryPicker').props.value, 'GB');
  assert.equal(selection.readTravelCountry(), 'GB', 'Phrase selection is available to the assistant');
  button(view, 'Tools').props.onClick(); view = render();
  assert.ok(find(view, 'TravelAssistant'));
  find(view,'TravelAssistant').props.nearbyIdeas.props.onSearch('',{latitude:48.86,longitude:2.35},'museum');view=render();
  const firstSearch=find(view,'TravelAssistant').props.nearbySearch;
  assert.equal(firstSearch.category,'museum');
  find(view,'TravelAssistant').props.onNearbySearchHandled(firstSearch.id+1);view=render();
  assert.equal(find(view,'TravelAssistant').props.nearbySearch.id,firstSearch.id,'An unrelated acknowledgment cannot discard a newer intent');
  find(view,'TravelAssistant').props.onNearbySearchHandled(firstSearch.id);view=render();
  assert.equal(find(view,'TravelAssistant').props.nearbySearch,undefined,'Consumed map searches cannot replay when Map remounts');
  // The parent conditionally mounts the assistant when the Tools section opens.
  const assistant = harness({ selection }); let tool = assistant.choose('Emergency help');
  assert.equal(find(tool, 'TravelSafety').props.country, 'GB');
  find(tool, 'CountryPicker').props.onChange('TR'); tool = assistant.render();
  assert.equal(find(tool, 'TravelSafety').props.country, 'TR');
  button(view, 'Local tips').props.onClick(); view = render();
  assert.equal(find(view, 'CountryPicker').props.value, 'TR', 'Returning from the assistant refreshes the old parent country');
  find(view, 'CountryPicker').props.onChange('GB'); view = render();
  button(view, 'Tools').props.onClick(); view = render();
  const reopened = harness({ selection });
  assert.equal(find(reopened.choose('Emergency help'), 'TravelSafety').props.country, 'GB', 'Local tips also update the remounted assistant');
  find(view, 'TravelAssistant').props.onLocalTips('TR'); view = render();
  assert.equal(view.props['data-section'], 'etiquette', 'The culture link reaches local advice rather than the phrase list');
  assert.equal(find(view, 'CountryPicker').props.value, 'TR'); assert.equal(selection.readTravelCountry(), 'TR');
});


test('The guide delegates country notes to its real six-fact child and does not render a second translated article list', () => {
  const cards = [
    { country: 'TR', category: 'water', title: { tr: 'Başlık', en: 'English title', sq: 'Titull shqip' }, text: { tr: 'Metin', en: 'English body', sq: 'Tekst shqip' }, sourceUrl: 'https://example.test/source', verifiedAt: '2026-10-04' },
    { country: 'GB', category: 'hours', title: { tr: 'Saatler', en: 'English fallback' }, text: { tr: 'Metin', en: 'Untranslated body' }, sourceUrl: 'https://example.test/source', verifiedAt: '2026-10-04' },
  ];
  const h = harness({ initialCountry: 'TR', locale: 'sq', guides: cards });
  h.expand(); let view = h.openGuide();
  assert.equal(find(view,'CountryQuickFacts').props.country,'TR');
  assert.equal(find(view,'CountryQuickFacts').props.includeLocalAdvice,false);
  assert.equal(find(view,'CountryQuickFacts').props.onOpenAll,undefined);
  assert.equal(find(view,'article'),undefined,'The parent has no duplicate country facts below the child');
  assert.doesNotMatch(text(view), /Titull shqip|Tekst shqip|English title|English body|Disa karta ende/);
  assert.equal(text(find(view,'h3')),'Lidhje të dobishme');
  find(view, 'CountryPicker').props.onChange('GB'); view = h.render();
  assert.equal(find(view,'CountryQuickFacts').props.country,'GB');assert.equal(find(view,'article'),undefined);
  assert.doesNotMatch(text(view),/English fallback|Untranslated body/);
  view=h.language('tr');assert.equal(find(view,'CountryQuickFacts').props.country,'GB');assert.equal(find(view,'article'),undefined);
  assert.equal(text(find(view,'h3')),'İlgili bağlantılar');
});

test('A selected destination reaches the common map without fabricating a city point', () => {
  const h = harness({ initialCountry: 'FR' }); h.expand();
  for (const [label, component] of [['Map', 'TravelMap']]) {
    const child = find(h.choose(label), component);
    assert.equal(child.props.destinationCountry, 'FR');
    assert.equal(child.props.initialArea, undefined, 'A country is never treated as a precise search point');
    h.choose('All tools');
  }
  const h2 = harness({ initialCountry: 'GB' }); h2.expand();
  assert.equal(find(h2.choose('Map'), 'TravelMap').props.destinationCountry, 'GB');
  h2.choose('All tools');
  h2.render({ initialCountry: 'TR' });
  assert.equal(find(h2.choose('Map'), 'TravelMap').props.destinationCountry, 'TR', 'A new explicit destination reaches retained screens');
});

test('Country guide keeps the six-fact entry, has one phrase action and routes laws/culture to Local tips', () => {
  const h = harness({ initialCountry: 'TR', guides: [
    {country:'TR',category:'law',title:{tr:'Kanun',en:'Law'},text:{tr:'Kural',en:'Law advice'}},
    {country:'TR',category:'culture',title:{tr:'Kültür',en:'Culture'},text:{tr:'Gelenek',en:'Culture advice'}},
  ] }); h.expand();
  let view = h.openGuide();
  assert.equal(find(view, 'CountryQuickFacts').props.country, 'TR');
  assert.equal(find(view,'CountryQuickFacts').props.onOpenAll,undefined,'The guide cannot jump to another copy of the same notes');
  assert.equal(nodes(view).filter(node => node.type === 'button' && /Open useful phrases/.test(text(node))).length, 1);
  assert.equal(find(view, 'article'), undefined, 'Law and culture are no longer duplicated below practical facts');
  assert.doesNotMatch(text(view), /not ready|Phrases and cultural guidance|Law advice|Culture advice/);
  h.choose('Local tips and rules'); assert.deepEqual(h.localTips, ['TR']); assert.deepEqual(h.phrases, []);
  find(view, 'CountryPicker').props.onChange('GB'); view = h.render();
  h.choose('Local tips and rules'); assert.deepEqual(h.localTips, ['TR', 'GB']);
  h.choose('Open useful phrases'); assert.deepEqual(h.phrases, ['GB']);
});

test('Moving local advice out of the country guide preserves it even without a local phrase pack', () => {
  const guides = load('lib/travel-assistant/guides.ts', {});
  const essentials = load('mobile/src/data/travelEssentials.ts', {'../../../lib/travel-assistant/guides':guides});
  assert.equal(essentials.essentialProfile('TR'), null, 'Türkiye currently uses the emergency phrase fallback');
  const profile=essentials.fallbackEssentialProfile('TR','Türkiye','TR');
  const reviewed=guides.GUIDE_CARDS.filter(card=>card.country==='TR'&&(card.category==='law'||card.category==='culture'));
  assert.ok(reviewed.length>0);
  for(const rule of reviewed){
    const entries=profile.etiquette.filter(item=>item.id===`verified-${rule.title.en}`);
    assert.equal(entries.length,1);assert.equal(entries[0].en,rule.text.en);assert.equal(entries[0].sourceUrl,rule.sourceUrl);
  }
});

function nearbyComponent(props, provider='Apple Maps') {
  const slots=[],effects=[],calls=[],opened=[];let cursor=0,view;let activeProvider=provider;
  const now=Date.parse('2026-10-24T12:00:00.000Z');
  const places=load('lib/travel-assistant/places.ts',{});
  const responses=load('lib/travel-assistant/responses.ts',{});
  const react={
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];},
    useRef(initial){const i=cursor++;return slots[i]||={current:initial};},useMemo:factory=>factory(),useEffectEvent:fn=>fn,
    useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,index)=>value!==old.deps[index])){slots[i]={deps,cleanup:null};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=effect();});}},
    lazy:()=> 'TravelPointMap',Suspense:'Suspense',
  };
  const api=load('mobile/src/components/TravelNearby.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
    '../lib/localeFormatting':{formatAppDate:()=>''},
    '../../../lib/travel-assistant/places':places,'../../../lib/travel-assistant/responses':responses,
    '../lib/travelAssistant':{
      locateForTravel:async()=>{throw Error('This destination task must not request device location');},
      loadPlaces:async(center,mode)=>{calls.push({center,mode});const id=activeProvider==='Apple Maps'?'apple/LONDON_PHARMACY':'node/123';const fetchedAt=new Date(now).toISOString();return{
        center,fetchedAt,radius:3000,limited:false,attribution:activeProvider,
        places:[{...center,id,category:mode==='needs'?'pharmacy':'museum',name:mode==='needs'?'Pharmacy fixture':'Museum fixture',description:null,hours:null,free:null,accessible:null,website:null,representedCountry:null,
          sourceUrl:activeProvider==='Apple Maps'?'https://maps.apple.com/place?place-id=LONDON_PHARMACY':'https://www.openstreetmap.org/node/123',fetchedAt}],
      };},directionsUrl:()=>'',
    },
    '../lib/i18n':{useI18n:()=>({locale:'en',copy:(_tr,en)=>en})},
    '../lib/native':{openExternal:async url=>{opened.push(url);return true;}},
    '../hooks/useCurrentTime':{useCurrentTime:()=>now},
    '../lib/savedPlaces':{readSavedPlaces:()=>({items:[]}),subscribeSavedPlaces:()=>()=>{}},
    './Icon':{Icon:'Icon'},'./Sheet':{Sheet:'Sheet'},'./TravelAreaPicker':{TravelAreaPicker:'TravelAreaPicker'},
  });
  const h={
    render(){cursor=0;view=api.TravelNearby(props);effects.splice(0).forEach(effect=>effect());return view;},
    click(label){const target=button(view,label);assert.ok(target,`Nearby action: ${label}`);assert.notEqual(target.props.disabled,true);target.props.onClick();return h.render();},
    category(value){find(view,'select').props.onChange({target:{value}});return h.render();},
    async search(){find(view,'TravelAreaPicker').props.onChange({latitude:51.51,longitude:-.13});h.render();h.click('Search selected area');await new Promise(setImmediate);return h.render();},
    setProvider(value){activeProvider=value;},
    calls,opened,dispose(){slots.forEach(slot=>slot?.cleanup?.());},
  };
  h.render();return h;
}

test('Legacy Apple-only categories retain explicit coverage and source search recovery, while consulates reach the existing tool',async()=>{
  const app=harness({initialCountry:'GB'});app.expand();
  const map=nearbyComponent({mode:'needs',citizenship:'',destinationCountry:'GB',onEmbassies:()=>{app.render({initialTool:'embassies'});app.render();}});let view=await map.search();
  assert.match(text(view),/Pharmacy fixture/);assert.equal(map.calls.length,1);
  for(const [category,query] of [['exchange','currency exchange'],['wifi','public wifi'],['embassy','embassy consulate']]){
    view=map.category(category);
    assert.match(text(view),/This source does not cover the selected category separately/);
    assert.doesNotMatch(text(view),/No records match these filters/,'An unsupported category is not a confirmed empty search');
    map.click('Search in maps');
    const target=new URL(map.opened.at(-1));assert.equal(target.origin,'https://www.google.com');assert.equal(target.pathname,'/maps/search/');
    assert.equal(target.searchParams.get('query'),`${query} near 51.51,-0.13`);
    assert.equal(map.calls.length,1,'Changing filters and opening external maps do not requery a provider or AI service');
  }
  map.click('Open consulate information');view=app.render();
  assert.equal(find(view,'TravelNearby'),undefined);
  assert.equal(find(view,'TravelMap').props.destinationCountry,'GB','The real parent callback keeps the selected destination');
  assert.equal(find(view,'TravelMap').props.initialSection,'embassies');
  assert.equal(find(view,'EmbassyCards'),undefined,'The parent no longer renders a separate consulate surface');
  assert.equal(text(find(view,'h2')),'Map');
  assert.deepEqual(app.phrases,[],'The consulate action must not navigate to phrases or an unrelated screen');
  map.dispose();
});

test('Supported Apple categories and OSM emptiness keep the normal filter recovery instead of an unsupported-provider claim',async()=>{
  for(const provider of ['Apple Maps','© OpenStreetMap contributors']){
    const map=nearbyComponent({mode:'needs',citizenship:'',destinationCountry:'GB'},provider);await map.search();
    let view=map.category(provider==='Apple Maps'?'hospital':'exchange');
    assert.match(text(view),/No records match these filters/);assert.doesNotMatch(text(view),/does not cover the selected category/);
    assert.ok(button(view,'Search in maps'));
    view=map.click('Clear filters');assert.match(text(view),/Pharmacy fixture/);
    assert.doesNotMatch(text(view),/No records match these filters|does not cover the selected category/);
    assert.equal(map.calls.length,1);map.dispose();
  }
});

test('Saved-place cards retain the exact Apple or OSM source action and display the matching attribution',async()=>{
  const opened=[];
  const base={category:'museum',latitude:51.51,longitude:-.13,description:null,hours:null,free:null,accessible:null,website:null,representedCountry:null,fetchedAt:'2026-10-24T12:00:00.000Z'};
  const records=[
    {...base,id:'apple/LONDON_MUSEUM',name:'Apple museum fixture',sourceUrl:'https://maps.apple.com/place?place-id=LONDON_MUSEUM'},
    {...base,id:'node/456',name:'OSM museum fixture',sourceUrl:'https://www.openstreetmap.org/node/456'},
  ];
  const state={items:records.map(place=>({place,note:'Keep my note',savedAt:'2026-10-24T12:05:00.000Z'})),dayIds:[],error:null};
  let nextId=0;
  const api=load('mobile/src/components/TravelSavedPlaces.tsx',{
    react:{useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useEffect:()=>{},useId:()=>`saved-source-${++nextId}`,lazy:()=> 'TravelPointMap',Suspense:'Suspense'},
    'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
    '../../../lib/travel-assistant/places':load('lib/travel-assistant/places.ts',{}),
    '../lib/localeFormatting':{formatAppDate:()=>''},'../lib/i18n':{useI18n:()=>({locale:'en',copy:(_tr,en)=>en})},
    '../lib/native':{openExternal:async url=>{opened.push(url);return true;}},
    '../lib/travelAssistant':{directionsUrl:()=>''},
    '../lib/savedPlaces':{readSavedPlaces:()=>state,subscribeSavedPlaces:()=>()=>{},MAX_SAVED_PLACES:60,MAX_DAY_STOPS:12,MAX_PLACE_NOTE:280},
    './Icon':{Icon:'Icon'},'./TravelPointMap':{TravelPointMap:'TravelPointMap'},
  });
  const view=api.TravelSavedPlaces({ownerId:null});
  const overview=find(view,'TravelPointMap');assert.ok(overview,'Apple bookmarks have an overview on the shared provider-aware map');
  assert.equal(overview.props.ownerId,null);assert.deepEqual(overview.props.places.map(place=>place.id),records.map(place=>place.id));
  const cards=nodes(view).filter(node=>typeof node.type==='function'&&node.props?.item?.place);
  assert.equal(cards.length,2);
  for(const card of cards){
    const content=card.type(card.props),apple=card.props.item.place.id.startsWith('apple/');
    const source=button(content,apple?'Apple Maps source':'OpenStreetMap source');assert.ok(source);
    assert.equal(button(content,apple?'OpenStreetMap source':'Apple Maps source'),undefined);
    assert.match(text(content),/Keep my note/);
    if(apple){assert.match(text(content),/Apple Maps/);assert.doesNotMatch(text(content),/OpenStreetMap|ODbL/);}
    else assert.match(text(content),/© OpenStreetMap contributors · ODbL/);
    source.props.onClick();await new Promise(setImmediate);
    assert.equal(opened.at(-1),card.props.item.place.sourceUrl,'The source action must preserve the provider place identity without substituting a search link');
  }
  assert.equal(opened.length,2);
  overview.props.onSelect(records[0]);await new Promise(setImmediate);
  assert.equal(opened.at(-1),records[0].sourceUrl,'Selecting an overview marker opens the original provider place');
  state.items=state.items.filter(item=>!item.place.id.startsWith('apple/'));
  assert.equal(find(api.TravelSavedPlaces({ownerId:null}),'TravelPointMap'),undefined,'An OSM-only saved list does not acquire an Apple overview');
});

test('TravelPointMap renders Apple and mixed saved points through JourneyMap while OSM-only points keep the existing Leaflet renderer',()=>{
  const selected=[];let effects=0,leafletCalls=0;
  const api=load('mobile/src/components/TravelPointMap.tsx',{
    react:{useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{effects++;}},
    'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
    leaflet:{default:{map:()=>{leafletCalls++;throw Error('Renderer-choice tests must not initialize a live map or request tiles');}}},
    '../lib/i18n':{useI18n:()=>({locale:'en',copy:(_tr,en)=>en})},'./JourneyMap':{JourneyMap:'JourneyMap'},
  });
  const center={latitude:51.51,longitude:-.13};
  const base={...center,category:'museum',name:'Museum fixture',description:null,hours:null,free:null,accessible:null,website:null,representedCountry:null,fetchedAt:'2026-10-24T12:00:00.000Z'};
  const apple={...base,id:'apple/LONDON_MUSEUM',sourceUrl:'https://maps.apple.com/place?place-id=LONDON_MUSEUM'};
  const osm={...base,id:'node/456',sourceUrl:'https://www.openstreetmap.org/node/456'};
  for(const points of [[apple],[osm,apple]]){
    const routed=api.TravelPointMap({center,places:points,ownerId:'owner-a',onSelect:place=>selected.push(place)});
    const view=routed.type(routed.props),map=find(view,'JourneyMap');assert.ok(map,'Every set containing Apple POIs uses the Apple-capable JourneyMap');
    assert.equal(map.props.center,center);assert.equal(map.props.ownerId,'owner-a');assert.equal(map.props.discoveredPlaces,points);
    assert.equal(map.props.stops.length,0,'A place overview must not manufacture itinerary stops or route lines');
    const before=selected.length;
    map.props.onSelectPlace({id:'apple/UNKNOWN'},'discovered');assert.equal(selected.length,before);
    map.props.onSelectPlace({...apple,name:'Changed display label'},'discovered');
    assert.equal(selected.at(-1),apple,'Marker selection resolves the original source record rather than trusting substituted callback fields');
  }
  assert.equal(effects,0,'The Apple branch must not mount any Leaflet effects');assert.equal(leafletCalls,0);
  const routed=api.TravelPointMap({center,places:[osm],onSelect:place=>selected.push(place)});
  const osmView=routed.type(routed.props);assert.equal(find(osmView,'JourneyMap'),undefined);
  assert.ok(find(osmView,'div',props=>props.className==='ta-map'&&/accessible list/.test(props['aria-label'])));
  assert.ok(effects>0,'OSM points retain the existing effect-driven Leaflet implementation');
  assert.equal(leafletCalls,0,'No renderer-choice test performs network work');
});


test('Apple capabilities disable unsupported categories and metadata filters while genuine results remain visible', async () => {
  for (const mode of ['needs','explore']) {
    const map = nearbyComponent({mode,citizenship:'TR',destinationCountry:'GB'});
    let view=map.render();
    const checks=nodes(view).filter(n=>n.type==='input'&&n.props.type==='checkbox');
    for(const check of checks) check.props.onChange({target:{checked:true}});
    map.category(mode==='needs'?'embassy':'palace'); view=await map.search();
    const label=mode==='needs'?'Pharmacy fixture':'Museum fixture';
    assert.match(text(view),new RegExp(label)); assert.match(text(view),/Showing all places/);
    for(const check of nodes(view).filter(n=>n.type==='input'&&n.props.type==='checkbox')) { assert.equal(check.props.disabled,true); assert.equal(check.props.checked,false); }
    const unsupported=mode==='needs'?['exchange','wifi','embassy']:['statue','palace','square','viewpoint'];
    for(const value of unsupported) assert.equal(find(view,'option',p=>p.value===value).props.disabled,true,value);
    assert.doesNotMatch(text(view),/No records match these filters/);
    map.dispose();
  }
  const map=nearbyComponent({mode:'needs',citizenship:'TR',destinationCountry:'GB'},'© OpenStreetMap contributors');
  let view=await map.search(); const check=nodes(view).find(n=>n.type==='input'&&n.props.type==='checkbox');
  assert.notEqual(check.props.disabled,true);check.props.onChange({target:{checked:true}});view=map.render();
  assert.match(text(view),/No records match these filters/,'OSM retains its existing metadata-filter semantics'); map.dispose();
});

test('Area selection and result maps are mutually exclusive and a completed search collapses the area map', async () => {
  const map=nearbyComponent({mode:'needs',citizenship:'',destinationCountry:'GB'});
  let view=map.render(); assert.equal(find(view,'TravelAreaPicker').props.mapOpen,false);
  find(view,'TravelAreaPicker').props.onMapOpenChange(true);view=map.render(); assert.equal(find(view,'TravelPointMap'),undefined);
  view=await map.search(); assert.equal(find(view,'TravelAreaPicker').props.mapOpen,false); assert.ok(find(view,'TravelPointMap'));
  find(view,'TravelAreaPicker').props.onMapOpenChange(true);view=map.render(); assert.equal(find(view,'TravelPointMap'),undefined);assert.match(text(view),/Pharmacy fixture/);
  find(view,'TravelAreaPicker').props.onMapOpenChange(false);view=map.render();assert.ok(find(view,'TravelPointMap'));map.dispose();
});
