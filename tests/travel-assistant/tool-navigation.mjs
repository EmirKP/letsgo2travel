import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
function load(path, imports, globals = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Date, ...globals })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name.endsWith('.css')) return {};
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

// Run the real component and event closures. Only child tools and React's host
// are replaced. Refs attach during a simulated commit, before animation frames.
function harness({ initialCountry = '', savedCountry = '', locale: initialLocale = 'en', selection, guides = [] } = {}) {
  const slots = [], frames = [], selectedCountries = [], phrases = [];
  let cursor = 0, locale = initialLocale, view, focused, oldRefs = [], signIns = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
    lazy(loader) { const name = loader.toString().match(/require\(['"]\.\/([^'"]+)/)?.[1]; assert.ok(name, 'Lazy child remains identifiable'); return name; },
    Suspense: 'Suspense',
  };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../../../lib/travel-assistant/guides': { GUIDE_CARDS: guides },
    '../../../lib/country-intelligence/advisory-destinations.json': {default: JSON.parse(readFileSync('lib/country-intelligence/advisory-destinations.json', 'utf8'))},
    '../lib/native': { openExternal: async () => true },
    '../data/countries': { COUNTRY_LIST: [{ alpha3: 'TUR', name: 'Türkiye' }, { alpha3: 'GBR', name: 'United Kingdom' }] },
    '../data/countryIso': { alpha2FromAlpha3: code => ({ TUR: 'TR', GBR: 'GB' })[code] },
    '../hooks/usePassportPreference': { usePassportPreference: () => ({ country: 'TR' }) },
    '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en) => locale === 'tr' ? tr : en, countryName: (_, fallback) => fallback }) },
    './CountryPicker': { CountryPicker: 'CountryPicker' },
    '../lib/travelSelection': selection || { readTravelCountry: () => savedCountry, selectTravelCountry: code => selectedCountries.push(code) },
    '../lib/searchText': searchText,
    './TravelSafety': { TravelSafety: 'TravelSafety', EmbassyCards: 'EmbassyCards', EvidenceLine: 'EvidenceLine' },
    '../../../lib/travel-assistant/evidence': { evidenceStatus: () => 'current' },
    '../hooks/useCurrentTime': { useCurrentTime: () => Date.parse('2026-09-27T08:00:00Z') },
    './Icon': { Icon: 'Icon' },
    './TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
  };
  const api = load('mobile/src/components/TravelAssistant.tsx', imports, { window: { requestAnimationFrame: fn => frames.push(fn) } });
  let props = { initialCountry, onPhrases: country => phrases.push(country), onNotice: () => {}, accessToken: '', onSignIn: () => signIns++ };
  const h = {
    render(next = {}) {
      props = { ...props, ...next }; cursor = 0; view = api.TravelAssistant(props);
      oldRefs.forEach(ref => { ref.current = null; }); oldRefs = [];
      nodes(view).forEach(node => { if (node.props?.ref && typeof node.props.ref === 'object') { const ref = node.props.ref; oldRefs.push(ref); ref.current = { focus: () => { focused = node; } }; } });
      frames.splice(0).forEach(fn => fn());
      return view;
    },
    choose(label) { const control = button(view, label); assert.ok(control, `Visible control: ${label}`); control.props.onClick(); return h.render(); },
    search(query) { find(view, 'input', props => props.type === 'search').props.onChange({ target: { value: query } }); return h.render(); },
    expand() { const control = find(view, 'button', props => props['aria-controls'] === 'ta-other-tools'); if (!control.props['aria-expanded']) { control.props.onClick(); h.render(); } return view; },
    language(next) { locale = next; return h.render(); },
    focused: () => focused, selectedCountries, phrases, signIns: () => signIns,
  };
  h.render(); return h;
}

test('Four main tools and all remaining tools stay reachable without an unrelated country gate', () => {
  const h = harness();
  assert.deepEqual(cardLabels(h.render()), ['Sightseeing map', 'Translate', 'Money', 'Saved places']);
  assert.equal(find(h.render(), 'CountryPicker'), undefined);
  assert.equal(cardLabels(h.expand()).length, 10);
  for (const [label, component, mode] of [
    ['Sightseeing map', 'TravelNearby', 'explore'], ['Essentials map', 'TravelNearby', 'needs'],
    ['Translate', 'TravelTranslation'], ['Money', 'TravelMoney'], ['Saved places', 'TravelSavedPlaces'],
    ['Transport', 'TravelTransit'], ['Photo guide', 'TravelPhotoGuide'], ['Offline map', 'TravelOfflineMap'],
  ]) {
    const view = h.choose(label);
    assert.ok(find(view, component), `${label} renders its real child boundary`);
    assert.equal(find(view, 'CountryPicker'), undefined, `${label} does not require country selection`);
    if (mode) assert.equal(find(view, component).props.mode, mode);
    h.choose('All tools');
    assert.equal(cardLabels(h.render()).length, 10, 'Returning preserves the expanded directory');
  }
  assert.ok(button(h.render(), 'Emergency help'));
  assert.ok(button(h.render(), 'Consulate'));
  assert.ok(button(h.render(), 'Before you go'));
});

test('Search handles either language, Turkish keyboard variants, and the example pharmacy query', () => {
  const h = harness();
  for (const [query, expected] of [['  ÇEVİRİ  ', 'Translate'], ['IHTIYAC', 'Essentials map'], ['kayitli', 'Saved places'], ['pharmacy', 'Essentials map'], ['dolar', 'Money'], ['museum', 'Sightseeing map'], ['metro', 'Transport'], ['ambulans', 'Emergency']]) {
    assert.ok(cardLabels(h.search(query)).includes(expected), `${query} finds ${expected}`);
  }
  h.language('tr');
  assert.ok(cardLabels(h.search('offline')).includes('Çevrimdışı harita'));
  const empty = h.search('no matching tool');
  assert.equal(cardLabels(empty).length, 0);
  assert.match(text(find(empty, 'p', props => props.role === 'status')), /^0 /);
  assert.ok(button(empty, 'Acil yardım'), 'Emergency access survives empty search results');
  assert.equal(find(h.choose('Acil yardım'), 'CountryPicker').props.value, '');
});

test('Country-dependent tools share an explicit destination and keep citizenship separate', () => {
  const h = harness();
  let view = h.choose('Emergency help');
  assert.equal(find(view, 'TravelSafety'), undefined, 'No country-specific emergency data without a country');
  find(view, 'CountryPicker').props.onChange('GB'); view = h.render();
  assert.equal(find(view, 'TravelSafety').props.country, 'GB');
  assert.deepEqual(h.selectedCountries, ['GB']);
  find(view, 'TravelSafety').props.onOpen('embassies'); view = h.render();
  assert.equal(find(view, 'EmbassyCards').props.country, 'GB');
  assert.equal(find(view, 'EmbassyCards').props.citizenship, 'TR');
  find(view, 'CountryPicker', props => props.label === 'Your citizenship').props.onChange('GB');
  assert.equal(find(h.render(), 'EmbassyCards').props.citizenship, 'GB');
  assert.deepEqual(h.selectedCountries, ['GB'], 'Citizenship changes do not overwrite the destination');
  h.choose('All tools'); h.expand(); view = h.choose('Before you go');
  assert.equal(find(view, 'CountryPicker').props.value, 'GB');
  h.choose('Phrases and cultural guidance'); assert.deepEqual(h.phrases, ['GB']);
  const initial = harness({ initialCountry: 'TR', savedCountry: 'GB' });
  assert.equal(find(initial.choose('Emergency help'), 'TravelSafety').props.country, 'TR', 'Explicit destination overrides the saved preference');
});

test('Opening and leaving a result focus its heading and preserve the previous search', () => {
  const h = harness();
  h.search('translate'); h.choose('Translate');
  assert.equal(h.focused().type, 'h2'); assert.equal(text(h.focused()), 'Translate');
  assert.equal(h.focused().props.tabIndex, -1);
  const restored = h.choose('All tools');
  assert.equal(text(h.focused()), 'What do you need?');
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
  let view = h.choose('Saved places'); find(view, 'TravelSavedPlaces').props.onExplore(); view = h.render();
  assert.equal(find(view, 'TravelNearby').props.mode, 'explore');
  h.choose('All tools'); view = h.choose('Translate'); find(view, 'TravelTranslation').props.onPhrases();
  assert.deepEqual(h.phrases, ['GB']);
  h.choose('All tools'); view = h.choose('Emergency help'); find(view, 'TravelSafety').props.onOpen('phrases');
  assert.deepEqual(h.phrases, ['GB', 'GB']);
  find(view, 'TravelSafety').props.onOpen('needs'); view = h.render();
  assert.equal(find(view, 'TravelNearby').props.mode, 'needs');
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
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
    useMemo: factory => factory(), useEffect: () => {}, lazy: () => 'TravelAssistant', Suspense: 'Suspense',
  };
  const profile = code => ({ code, languageTr: 'Test', languageEn: 'Test', phrases: [], etiquette: [] });
  const api = load('mobile/src/screens/TravelCompanionScreen.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../components/Icon': { Icon: 'Icon' }, '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' }, '../components/PageHero': { PageHero: 'PageHero' },
    '../components/CountryPicker': { CountryPicker: 'CountryPicker' },
    '../data/countries': { COUNTRY_LIST: [{ alpha3: 'TUR', name: 'Türkiye' }, { alpha3: 'GBR', name: 'United Kingdom' }] },
    '../data/countryIso': { alpha2FromAlpha3: code => ({ TUR: 'TR', GBR: 'GB' })[code], flagEmoji: code => code },
    '../data/travelEssentials': { TRAVEL_ESSENTIALS: [profile('TR'), profile('GB')], essentialProfile: profile, fallbackEssentialProfile: profile },
    '../lib/api': { getTravelNow: () => { throw Error('Country switching must not fetch live data'); } },
    '../lib/i18n': { useI18n: () => ({ locale: 'en', copy: (_, en) => en, countryName: (_, fallback) => fallback }) },
    '../lib/native': { openExternal: () => {} }, '../lib/travelSelection': selection,
    '../components/TravelSafety': { EvidenceLine: 'EvidenceLine' },
  });
  const render = () => { cursor = 0; return api.TravelCompanionScreen({ accessToken: '', onSignIn: () => {}, onNotice: () => {}, onNavigate: () => {} }); };
  let view = render();
  button(view, 'Useful phrases').props.onClick(); view = render();
  find(view, 'CountryPicker').props.onChange('GB'); view = render();
  assert.equal(find(view, 'CountryPicker').props.value, 'GB');
  assert.equal(selection.readTravelCountry(), 'GB', 'Phrase selection is available to the assistant');
  button(view, 'Tools').props.onClick(); view = render();
  assert.ok(find(view, 'TravelAssistant'));
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
});


test('Guide cards use available Albanian text and mark English fallback only for untranslated cards', () => {
  const cards = [
    { country: 'TR', category: 'water', title: { tr: 'Başlık', en: 'English title', sq: 'Titull shqip' }, text: { tr: 'Metin', en: 'English body', sq: 'Tekst shqip' }, sourceUrl: 'https://example.test/source', verifiedAt: '2026-10-04' },
    { country: 'GB', category: 'law', title: { tr: 'Kural', en: 'English fallback' }, text: { tr: 'Metin', en: 'Untranslated body' }, sourceUrl: 'https://example.test/source', verifiedAt: '2026-10-04' },
  ];
  const h = harness({ initialCountry: 'TR', locale: 'sq', guides: cards });
  h.expand(); let view = h.choose('Before you go');
  assert.match(text(view), /Titull shqip.*Tekst shqip/);
  assert.doesNotMatch(text(view), /English title|English body|Disa karta ende/);
  assert.equal(find(view, 'article').props.lang, 'sq');
  find(view, 'CountryPicker').props.onChange('GB'); view = h.render();
  assert.match(text(view), /Disa karta ende/); assert.match(text(view), /English fallback.*Untranslated body/);
  assert.equal(find(view, 'article').props.lang, 'en');
  view = h.language('tr'); assert.match(text(view), /Kural.*Metin/); assert.equal(find(view, 'article').props.lang, 'tr');
});
