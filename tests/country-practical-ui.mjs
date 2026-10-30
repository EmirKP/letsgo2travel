import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props: props || {}, key });
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : !value || typeof value !== 'object' || value.props?.hidden ? [] : [value, ...nodes(value.props?.children)];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const byClass = (tree, name) => nodes(tree).find(node => node.props?.className?.split(' ').includes(name));
const buttons = tree => nodes(tree).filter(node => node.type === 'button');
const factCards = tree => buttons(tree).filter(node => node.props.className?.split(' ').includes('country-fact-card'));
const fact = (tree, label) => factCards(tree).find(node => text(byClass(node, 'country-fact-label')) === label);
// The fact value is a direct child; decorative clock faces also contain strong
// digital labels and must not be mistaken for the device-relative offset.
const value = node => text([node?.props.children].flat().find(child => child?.type === 'strong'));
const tick = () => new Promise(setImmediate);

function load(path, imports = {}, globals = {}) {
  const file = resolve(path);
  if (file.endsWith('.json')) return { __esModule: true, default: JSON.parse(readFileSync(file, 'utf8')) };
  const fixtureModule = { exports: {} };
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, { Date, Intl, ...globals })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name.endsWith('.css')) return {};
    if (/\.(png|webp|svg)$/.test(name)) return { default: name };
    if (name.startsWith('.')) {
      const base = resolve(dirname(file), name);
      const target = [base, `${base}.ts`, `${base}.json`].find(candidate => existsSync(candidate));
      assert.ok(target, `Resolvable local import: ${name}`);
      return load(target);
    }
    throw Error(`Unstubbed import: ${name}`);
  }, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}

const practical = load('lib/travel-assistant/country-practical.ts');
const evidence = load('lib/travel-assistant/evidence.ts');
const searchText = load('mobile/src/lib/searchText.ts');
const guideCard = (country, suffix, extra = {}) => ({ country, category: 'culture', title: { tr: `Başlık ${suffix}`, en: `Advice ${suffix}`, sq: `Këshillë ${suffix}` }, text: { tr: `Bilgi ${suffix}`, en: `Detailed advice ${suffix}`, sq: `Hollësi ${suffix}` }, verifiedAt: '2026-10-20', sourceUrl: 'https://example.test/guide', ...extra });

// Reduced-locale WebViews can accept sq-AL while silently showing Turkish.
function limitedAlbanianIntl() {
  const locales = value => Array.isArray(value) ? value : [value];
  function DateTimeFormat(locale, options) {
    return new Intl.DateTimeFormat(locales(locale).some(value => String(value).startsWith('sq')) ? 'tr-TR' : locale, options);
  }
  DateTimeFormat.supportedLocalesOf = values => Intl.DateTimeFormat.supportedLocalesOf(locales(values).filter(value => !String(value).startsWith('sq')));
  return { DateTimeFormat };
}

// Real components/data/event handlers, with a small keyed hook host. Key changes
// run unmount cleanups, so pending source requests are checked across countries.
function harness({ country = 'TR', locale: initialLocale = 'en', assistant = false, highlightsOnly = false, safetyOnly = false, savedCountry = '', locate = async () => { throw Error('denied'); }, openExternal = async () => true, info = practical.countryPracticalInfo, deviceZone = 'Europe/Istanbul', now: initialNow = Date.parse('2026-10-20T12:00:00Z'), guides = [], intl = Intl } = {}) {
  const frames = new Map(), focused = [], scrolled = [], selections = [], phrases = [], external = [], animationFrames = [];
  let current, cursor, dirty, activePaths, effects, tree, refs = [], locale = initialLocale, now = initialNow, id = 0, stateUpdates = 0, unmounted = false, detailOpens = 0, guideRequests = 0;
  const slot = initial => { const at = cursor++; return current.slots[at] ||= initial(); };
  const react = {
    useState(initial) { const owner = current, item = slot(() => ({ value: typeof initial === 'function' ? initial() : initial })); return [item.value, next => { stateUpdates++; const result = typeof next === 'function' ? next(item.value) : next; if (!Object.is(result, item.value)) { item.value = result; if (owner.active) dirty = true; } }]; },
    useRef(initial) { return slot(() => ({ current: initial })); },
    useId() { return slot(() => ({ value: `test-${++id}` })).value; },
    useEffect(callback, deps) { const item = slot(() => ({ deps: null })); if (!item.deps || deps.some((entry, index) => !Object.is(entry, item.deps[index]))) { const cleanup = item.cleanup; item.deps = deps; effects.push(() => { cleanup?.(); item.cleanup = callback(); }); } },
    lazy(loader) { return loader.toString().match(/require\(['"]\.\/([^'"]+)/)?.[1] || 'LazyTool'; },
    Suspense: 'Suspense',
  };
  const i18n = { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en, countryName: (_, name) => name }) };
  const fakeIntl = { DateTimeFormat: function (...args) { const formatter = new intl.DateTimeFormat(...args); if (!args.length) { const previous = formatter.resolvedOptions.bind(formatter); formatter.resolvedOptions = () => ({ ...previous(), timeZone: deviceZone }); } return formatter; } };
  fakeIntl.DateTimeFormat.supportedLocalesOf = (...args) => intl.DateTimeFormat.supportedLocalesOf(...args);
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../../../lib/travel-assistant/country-practical': { ...practical, countryPracticalInfo: info },
    '../../../lib/travel-assistant/evidence': evidence,
    '../../../lib/travel-assistant/money': load('lib/travel-assistant/money.ts'),
    '../../../lib/travel-assistant/guides': { GUIDE_CARDS: guides },
    '../hooks/useCurrentTime': { useCurrentTime: () => now },
    '../lib/localeFormatting': load('mobile/src/lib/localeFormatting.ts', {}, { Intl: fakeIntl }),
    '../lib/i18n': i18n,
    '../lib/native': { openExternal: url => { external.push(url); return openExternal(url); } },
    '../lib/travelAssistant': { directionsUrl: address => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, locateForTravel: async () => { throw Error('Unexpected location request during emergency-information inspection'); } },
    './Icon': { Icon: 'Icon' },
  };
  imports['./CountryFactDiagram'] = load('mobile/src/components/CountryFactDiagram.tsx', imports, { Intl: fakeIntl });
  const { CountryGuideHighlights } = load('mobile/src/components/CountryGuideHighlights.tsx', imports, { Intl: fakeIntl });
  imports['./CountryGuideHighlights'] = { CountryGuideHighlights };
  const { CountryQuickFacts } = load('mobile/src/components/CountryQuickFacts.tsx', imports, { Intl: fakeIntl });
  const { TravelSafety } = safetyOnly ? load('mobile/src/components/TravelSafety.tsx', imports, { Intl: fakeIntl }) : {};
  const { TravelAssistant } = assistant ? load('mobile/src/components/TravelAssistant.tsx', {
    ...imports,
    './CountryQuickFacts': { CountryQuickFacts },
    '../lib/deviceArea': { locateDeviceArea: locate },
    '../../../lib/travel-assistant/guides': { GUIDE_CARDS: guides },
    '../../../lib/country-intelligence/advisory-destinations.json': { default: { TR: { fcdo: 'turkey' }, GB: { fcdo: 'united-kingdom' } } },
    '../data/countries': { COUNTRY_LIST: [{ alpha3: 'TUR', name: 'Türkiye' }, { alpha3: 'GBR', name: 'United Kingdom' }] },
    '../data/countryIso': { alpha2FromAlpha3: code => ({ TUR: 'TR', GBR: 'GB' })[code] },
    './CountryPicker': { CountryPicker: 'CountryPicker' },
    '../lib/travelSelection': { readTravelCountry: () => savedCountry, selectTravelCountry: next => selections.push(next) },
    '../lib/searchText': searchText,
    './TravelSafety': { TravelSafety: 'TravelSafety', EmbassyCards: 'EmbassyCards', EvidenceLine: 'EvidenceLine' },
    './TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
  }, { window: { requestAnimationFrame: callback => animationFrames.push(callback) } }) : {};
  const Component = safetyOnly ? TravelSafety : highlightsOnly ? CountryGuideHighlights : assistant ? TravelAssistant : CountryQuickFacts;
  let props = safetyOnly ? { country, onOpen() {}, onNotice() {} } : highlightsOnly ? { country, onOpenDetails: () => { detailOpens++; } } : assistant ? { initialCountry: country, initialTool: 'guide', onPhrases: next => phrases.push(next), onNotice() {}, onSignIn() {}, accessToken: '' } : { country, countryLabel: country === 'TR' ? 'Türkiye' : undefined };

  function materialize(node, path) {
    if (Array.isArray(node)) return node.map((child, index) => materialize(child, `${path}/${child?.key ?? index}`));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const identity = `${path}/${node.type.name}:${node.key ?? ''}`;
      const frame = frames.get(identity) || { slots: [], active: true };
      frames.set(identity, frame); activePaths.add(identity); current = frame; cursor = 0;
      const rendered = node.type(node.props); current = null;
      return materialize(rendered, `${identity}/output`);
    }
    return { ...node, props: { ...node.props, children: materialize(node.props.children, `${path}/children`) } };
  }
  const h = {
    render(next = {}) {
      assert.equal(unmounted, false); props = { ...props, ...next };
      for (let pass = 0; pass < 20; pass++) {
        dirty = false; activePaths = new Set(); effects = [];
        tree = materialize(jsx(Component, props), 'root');
        for (const [path, frame] of frames) if (!activePaths.has(path)) { frame.active = false; frame.slots.forEach(item => item.cleanup?.()); frames.delete(path); }
        refs.forEach(ref => typeof ref === 'function' ? ref(null) : ref.current = null); refs = [];
        nodes(tree).forEach(node => { const ref = node.props.ref; if (!ref) return; const element = { focus(options) { focused.push({ node, options }); }, scrollIntoView(options) { scrolled.push({ node, options }); } }; refs.push(ref); if (typeof ref === 'function') ref(element); else ref.current = element; });
        animationFrames.splice(0).forEach(callback => callback()); effects.splice(0).forEach(callback => callback());
        if (!dirty) return tree;
      }
      throw Error('Hook host did not settle');
    },
    click(control) { assert.ok(control, 'Visible clickable control'); assert.notEqual(control.props.disabled, true); control.props.onClick(); return h.render(); },
    label(label) { return buttons(tree).find(node => node.props['aria-label'] === label || text(node).trim() === label || text(find(node, 'strong')) === label); },
    fact(label) { return fact(tree, label); },
    openGuide() { return h.render({initialTool:'guide',toolRequestId:++guideRequests}); },
    language(next) { locale = next; return h.render(); },
    clock(next) { now = next; return h.render(); },
    unmount() { frames.forEach(frame => { frame.active = false; frame.slots.forEach(item => item.cleanup?.()); }); frames.clear(); unmounted = true; },
    tree: () => tree, focused: () => focused.at(-1), scrolled: () => scrolled.at(-1), stateUpdates: () => stateUpdates, detailOpens: () => detailOpens,
    selections, phrases, external,
  };
  h.render(); return h;
}

test('Six real country cards and every disclosure are localized in Turkish, English and Albanian', () => {
  const translations = {
    tr: ['Para birimi', 'Priz ve elektrik', 'Acil numaralar', 'Trafik yönü', 'İnternet', 'Saat farkı'],
    en: ['Currency', 'Plugs & power', 'Emergency', 'Driving side', 'Internet', 'Time difference'],
    sq: ['Monedha', 'Prizat dhe rryma', 'Urgjenca', 'Ana e drejtimit', 'Interneti', 'Diferenca e orës'],
  };
  for (const [locale, labels] of Object.entries(translations)) {
    const h = harness({ locale, country: 'GB' });
    assert.deepEqual(factCards(h.tree()).map(card => text(byClass(card, 'country-fact-label'))), labels);
    assert.equal(value(h.fact(labels[0])), 'GBP'); assert.equal(value(h.fact(labels[1])), 'G');
    assert.equal(value(h.fact(labels[3])), { tr: 'Soldan', en: 'Left', sq: 'Majtas' }[locale]);
    assert.equal(byClass(h.tree(), 'country-fact-detail'), undefined);
    for (const label of labels) {
      h.click(h.fact(label)); const detail = byClass(h.tree(), 'country-fact-detail');
      assert.equal(factCards(h.tree()).filter(card => card.props['aria-expanded']).length, 1);
      assert.equal(h.fact(label).props['aria-controls'], detail.props.id);
      assert.equal(text(find(detail, 'h4')), label); assert.equal(text(h.focused().node), label);
      assert.ok(text(detail).length > label.length + 40, `${locale}/${label} has explanatory content`);
    }
    h.unmount();
  }
});

test('Six compact summaries retain values without miniature data diagrams or added image resources; details show the full real data',()=>{
 const h=harness({country:'TH',now:Date.parse('2026-10-21T12:00:00Z')}),expected=practical.countryPracticalInfo('TH').plugs.types;
 const summaries=factCards(h.tree());assert.equal(summaries.length,6);
 for(const card of summaries){
  assert.equal(card.type,'button');assert.equal(card.props.type,'button');
  assert.ok(text(byClass(card,'country-fact-label')).length>0);assert.ok(value(card).length>0);
  assert.ok(nodes(card).some(node=>node.type==='small'&&text(node).length>0));
  assert.equal(nodes(card).some(node=>node.type==='img'||node.props['data-diagram']),false,'Summary artwork is a compact pictogram; real diagrams belong to the expanded detail');
 }
 assert.equal(value(h.fact('Plugs & power')),expected.join(' · '));
 h.click(h.fact('Plugs & power'));
 assert.deepEqual(nodes(byClass(h.tree(),'country-fact-detail')).filter(node=>node.props['data-socket-type']).map(node=>node.props['data-socket-type']),Array.from(expected),'All registered socket types are inspectable at full detail size');
 assert.equal(nodes(h.tree()).some(node=>node.type==='img'),false);assert.deepEqual(h.external,[]);
 h.render({country:'CA',countryLabel:'Canada'});h.click(h.fact('Time difference'));
 const clockFor=city=>nodes(byClass(h.tree(),'country-fact-detail')).find(node=>node.type==='figure'&&text(node).includes(city));
 assert.equal(nodes(byClass(h.tree(),'country-fact-detail')).filter(node=>node.type==='figure').length,2);
 assert.ok(find(clockFor('Toronto'),'svg',props=>props['data-clock-hour']===8&&props['data-clock-minute']===0));
 assert.ok(find(clockFor('You'),'svg',props=>props['data-clock-hour']===15&&props['data-clock-minute']===0));
 h.clock(Date.parse('2026-11-20T12:00:00Z'));
 assert.equal(value(h.fact('Time difference')),'−8 h');
 assert.ok(find(clockFor('Toronto'),'svg',props=>props['data-clock-hour']===7&&props['data-clock-minute']===0),'Expanded destination clock follows real daylight-saving changes');
 assert.deepEqual(h.external,[]);h.unmount();
});

test('Visible summaries explain the currency and local operators while diagrams follow the selected country', async () => {
  for (const [locale, currencyLabel, internetLabel] of [['tr', 'Para birimi', 'İnternet'], ['en', 'Currency', 'Internet'], ['sq', 'Monedha', 'Interneti']]) {
    const h = harness({ country: 'TR', locale }); const data = practical.countryPracticalInfo('TR');
    assert.match(text(h.fact(currencyLabel)), new RegExp(data.currency.name[locale])); assert.match(text(h.fact(currencyLabel)), /₺/);
    assert.equal(value(h.fact(internetLabel)), 'Turkcell · Vodafone'); assert.match(text(h.fact(internetLabel)), /Türk Telekom/);
    h.click(h.fact(internetLabel)); const sources = byClass(h.tree(), 'country-fact-sources');
    assert.deepEqual(buttons(sources).map(button => text(button)), [...data.internet.sources, ...(data.communication?.sources || [])].map(source => source.label));
    h.click(buttons(sources)[0]); await tick(); h.render(); assert.deepEqual(h.external, [data.internet.sources[0].url]);
    h.click(h.fact({tr:'Priz ve elektrik',en:'Plugs & power',sq:'Prizat dhe rryma'}[locale]));
    const sockets = nodes(byClass(h.tree(),'country-fact-detail')).filter(node => node.type === 'svg' && node.props['data-socket-type']);
    assert.deepEqual(sockets.map(socket => socket.props['data-socket-type']), ['C', 'F']);
    h.click(h.fact({tr:'Trafik yönü',en:'Driving side',sq:'Ana e drejtimit'}[locale]));
    assert.equal(find(byClass(h.tree(),'country-fact-detail'), 'svg', props => props['data-driving-side']).props['data-driving-side'], 'right');
    h.render({ country: 'GB' });
    assert.equal(value(h.fact(currencyLabel)), 'GBP'); assert.match(text(h.fact(currencyLabel)), /£/);
    h.click(h.fact({tr:'Trafik yönü',en:'Driving side',sq:'Ana e drejtimit'}[locale]));
    assert.equal(find(byClass(h.tree(),'country-fact-detail'), 'svg', props => props['data-driving-side']).props['data-driving-side'], 'left');
    h.click(h.fact({tr:'Priz ve elektrik',en:'Plugs & power',sq:'Prizat dhe rryma'}[locale]));
    assert.deepEqual(nodes(byClass(h.tree(),'country-fact-detail')).filter(node => node.type === 'svg' && node.props['data-socket-type']).map(socket => socket.props['data-socket-type']), ['G']);
    h.render({ country: 'JP' }); assert.equal(value(h.fact({ tr: 'Acil numaralar', en: 'Emergency', sq: 'Urgjenca' }[locale])), '110 / 119', 'Separate services are not mislabelled as a universal general number');
    h.unmount();
  }
});

test('Closing, toggling and Escape restore the opening card focus without starting navigation', () => {
  const h = harness();
  h.click(h.fact('Plugs & power')); h.click(h.label('Close fact details'));
  assert.equal(byClass(h.tree(), 'country-fact-detail'), undefined); assert.equal(text(byClass(h.focused().node, 'country-fact-label')), 'Plugs & power');
  h.click(h.fact('Emergency')); let prevented = false;
  byClass(h.tree(), 'country-fact-detail').props.onKeyDown({ key: 'Escape', preventDefault() { prevented = true; } }); h.render();
  assert.equal(prevented, true); assert.equal(h.fact('Emergency').props['aria-expanded'], false);
  assert.equal(text(byClass(h.focused().node, 'country-fact-label')), 'Emergency');
  h.click(h.fact('Internet')); h.click(h.fact('Internet'));
  assert.equal(byClass(h.tree(), 'country-fact-detail'), undefined); assert.deepEqual(h.external, []); h.unmount();
});

test('An unsupported country keeps six honest choices without borrowed currency, power, emergency or driving claims', () => {
  const h = harness({ country: 'ZZ' });
  assert.equal(factCards(h.tree()).length, 6);
  for (const label of ['Currency', 'Plugs & power', 'Emergency', 'Driving side', 'Time difference']) {
    assert.equal(value(h.fact(label)), 'Check details'); h.click(h.fact(label));
    assert.match(text(byClass(h.tree(), 'country-fact-detail')), /no verified record/);
    assert.doesNotMatch(text(byClass(h.tree(), 'country-fact-detail')), /112|230 V|EUR|TRY|Traffic drives on/);
  }
  h.click(h.fact('Internet')); assert.match(text(byClass(h.tree(), 'country-fact-detail')), /operator compatibility have not been verified/);
  assert.equal(h.external.length, 0); h.unmount();
});

test('Sources keep their actual check dates; emergency services and clock reference cities stay explicit', () => {
  const h = harness({ country: 'US' });
  assert.match(text(h.fact('Time difference')), /New York/); h.click(h.fact('Time difference'));
  let detail = byClass(h.tree(), 'country-fact-detail'); assert.match(text(detail), /several time.zone.*(?:destination city|named reference location)/);
  assert.match(text(detail), /Calculated:/); assert.ok(nodes(detail).some(node => node.type === 'time' && node.props.dateTime === '2026-10-20T12:00:00.000Z'));
  h.render({ country: 'TR' }); h.click(h.fact('Plugs & power')); detail = byClass(h.tree(), 'country-fact-detail');
  assert.equal(find(detail, 'time').props.dateTime, practical.countryPracticalInfo('TR').plugs.sources[0].checkedAt);
  h.click(h.fact('Emergency')); detail = byClass(h.tree(), 'country-fact-detail');
  const sourceDate = practical.countryPracticalInfo('TR').emergency[0].verifiedAt;
  assert.equal(find(detail, 'time').props.dateTime, sourceDate); assert.notEqual(sourceDate, '2026-10-20', 'Emergency source date is not falsely refreshed');
  const services = nodes(byClass(detail, 'country-fact-numbers')).filter(node => node.type === 'li');
  assert.equal(services.length, practical.countryPracticalInfo('TR').emergency.length); assert.match(text(services), /112/);
  h.click(h.fact('Currency')); detail = byClass(h.tree(), 'country-fact-detail');
  assert.equal(find(detail, 'time').props.dateTime, practical.countryPracticalInfo('TR').currency.sources[0].checkedAt);
  assert.match(text(detail), /Central Bank of the Republic of Türkiye/);
  h.clock(Date.parse('2026-10-21T12:00:00Z'));
  h.render({ country: 'CA' }); h.click(h.fact('Currency')); detail = byClass(h.tree(), 'country-fact-detail');
  assert.equal(value(h.fact('Currency')), 'CAD'); assert.match(text(detail), /SIX.*ISO 4217/);
  assert.equal(find(detail, 'time').props.dateTime, '2026-10-21');
  assert.doesNotMatch(text(detail), /Last check date not provided|Bank of Canada/, 'The actual register check is shown without inventing a new central-bank review'); h.unmount();
});

test('Albanian source dates and calculated clock details survive Intl silently falling back to Turkish', () => {
  const intl = limitedAlbanianIntl();
  assert.match(new intl.DateTimeFormat('sq-AL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date('2026-10-20T12:00:00Z')), /Eki/, 'The fixture really reproduces the Turkish fallback');
  const h = harness({ locale: 'sq', country: 'TR', intl });
  h.click(h.fact('Prizat dhe rryma'));
  let detail = byClass(h.tree(), 'country-fact-detail');
  assert.equal(text(find(detail, 'time')), '20 tet 2026'); assert.equal(find(detail, 'time').props.dateTime, '2026-10-20');
  h.click(h.fact('Urgjenca')); detail = byClass(h.tree(), 'country-fact-detail');
  assert.equal(text(find(detail, 'time')), '26 sht 2026'); assert.equal(find(detail, 'time').props.dateTime, '2026-09-26');
  h.render({ country: 'GB' }); h.click(h.fact('Diferenca e orës')); detail = byClass(h.tree(), 'country-fact-detail');
  assert.match(text(detail), /Londër: 13:00\. Kjo pajisje: 15:00/);
  assert.match(text(detail), /Llogaritur: 20 tet/); assert.doesNotMatch(text(detail), /Eki|Oct|Eyl|Sep/);
  assert.ok(nodes(detail).some(node => node.type === 'time' && node.props.dateTime === '2026-10-20T12:00:00.000Z'));
  h.clock(Date.parse('2026-11-20T12:00:00Z')); detail = byClass(h.tree(), 'country-fact-detail');
  assert.match(text(detail), /Londër: 12:00\. Kjo pajisje: 15:00/); assert.match(text(detail), /Llogaritur: 20 nën/);
  assert.ok(nodes(detail).some(node => node.type === 'time' && node.props.dateTime === '2026-11-20T12:00:00.000Z')); h.unmount();
});

test('Invalid or expired evidence hides values, while review-due evidence remains visibly qualified', () => {
  const h = harness({ info: code => { const data = practical.countryPracticalInfo(code); return { ...data, plugs: { ...data.plugs, sources: data.plugs.sources.map(source => ({ ...source, checkedAt: '2099-01-01' })) }, emergency: data.emergency.map(contact => ({ ...contact, validUntil: '2026-10-19' })) }; } });
  assert.equal(value(h.fact('Plugs & power')), 'Check details'); assert.equal(value(h.fact('Emergency')), 'Check details');
  h.click(h.fact('Emergency')); assert.equal(byClass(h.tree(), 'country-fact-numbers'), undefined); assert.match(text(byClass(h.tree(), 'country-fact-detail')), /verification is no longer valid/);
  assert.ok(find(byClass(h.tree(), 'country-fact-detail'), 'time'), 'Original source/date remain inspectable'); h.unmount();
  const review = harness({ now: Date.parse('2027-02-01T12:00:00Z') });
  assert.equal(value(review.fact('Emergency')), '112'); review.click(review.fact('Emergency'));
  assert.match(text(find(review.tree(), 'p', props => props.role === 'status')), /due for review/); review.unmount();
});

test('Emergency service restrictions remain attached to their numbers in all three languages', () => {
  for (const [locale, label, mobileNote, simNote] of [
    ['tr', 'Acil numaralar', /Cep telefonundan arama numarası/, /Suudi Arabistan SIM/],
    ['en', 'Emergency', /calls from a mobile phone/, /Saudi SIM card/],
    ['sq', 'Urgjenca', /telefonata nga telefoni celular/, /SIM saudite/],
  ]) {
    const h = harness({ country: 'XK', locale }); h.click(h.fact(label));
    assert.match(text(byClass(h.tree(), 'country-fact-numbers')), mobileNote);
    assert.match(text(byClass(h.tree(), 'country-fact-numbers')), /192.*194.*193/);
    h.render({ country: 'SA' }); h.click(h.fact(label));
    assert.match(text(byClass(h.tree(), 'country-fact-numbers')), simNote);
    assert.match(text(byClass(h.tree(), 'country-fact-numbers')), /112.*911/); h.unmount();
  }
});

test('Emergency mode retains localized geographic and service limitations when numeric contacts are available', () => {
  const emergency = load('lib/travel-assistant/emergency.ts');
  for (const locale of ['tr', 'en', 'sq']) {
    const h = harness({ safetyOnly: true, country: 'GL', locale, now: Date.parse('2026-10-21T12:00:00Z') });
    for (const [country, qualification] of [['GL', /Grönland|Greenland|Grenland/], ['BQ', /Bonaire/], ['CD', /Kinshasa|Kinşasa/], ['ET', /Addis Ababa/], ['SJ', /Jan Mayen/]]) {
      h.render({ country });
      const guidance = emergency.emergencyGuidance(country);
      assert.match(guidance.note[locale], qualification);
      const displayedGuidance = nodes(h.tree()).filter(node => node.type === 'p' && text(node) === guidance.note[locale]);
      assert.equal(displayedGuidance.length, 1, `${country}/${locale}: one visible profile restriction even when numeric contacts exist`);
      assert.equal(displayedGuidance[0].props.role, 'status');
      const articles = nodes(byClass(h.tree(), 'ta-call-grid')).filter(node => node.type === 'article');
      assert.deepEqual(articles.map(article => text(find(article, 'strong'))), Array.from(emergency.emergencyContacts(country), contact => contact.number));
      if (country === 'GL' || country === 'BQ' || country === 'SJ') {
        const police = { tr: 'Polis', en: 'Police', sq: 'Policia' }[locale];
        assert.ok(articles.every(article => find(article, 'a').props['aria-label'].startsWith(`${police} `)), `${country}: police-only contacts must not become general emergency`);
      }
      assert.deepEqual(h.external, [], 'Inspecting emergency information does not open a link or request location');
    }
    h.unmount();
  }
});

test('Emergency mode keeps distinct repeated-service numbers and stable unique identities across country changes', () => {
  const emergency = load('lib/travel-assistant/emergency.ts');
  const h = harness({ safetyOnly: true, country: 'GG', now: Date.parse('2026-10-21T12:00:00Z') });
  for (const [country, generalNumbers] of [['GG', ['999', '112']], ['JE', ['999', '112']], ['VC', ['911', '999']], ['GG', ['999', '112']]]) {
    h.render({ country });
    const contacts = emergency.emergencyContacts(country);
    const articles = nodes(byClass(h.tree(), 'ta-call-grid')).filter(node => node.type === 'article');
    assert.equal(articles.length, contacts.length);
    assert.equal(new Set(articles.map(article => article.key)).size, contacts.length, `${country}: two general lines cannot share a React identity`);
    articles.forEach((article, index) => {
      const contact = contacts[index];
      assert.ok(article.key.includes(country) && article.key.includes(contact.category) && article.key.includes(contact.number), 'The identity distinguishes country, service and number');
      assert.equal(find(article, 'a').props.href, `tel:${contact.number}`);
      assert.equal(text(find(article, 'strong')), contact.number);
    });
    assert.deepEqual(articles.filter((_, index) => contacts[index].category === 'general').map(article => text(find(article, 'strong'))), generalNumbers);
    const source = find(byClass(h.tree(), 'ta-evidence'), 'a');
    assert.equal(source.props.href, contacts[0].sourceUrl, `${country}: the source changes along with the visible numbers`);
  }
  h.unmount();
});

test('An unavailable device time zone produces no guessed offset or misleading calculation time', () => {
  const h = harness({ country: 'US', deviceZone: '' });
  assert.equal(value(h.fact('Time difference')), 'Check details'); h.click(h.fact('Time difference'));
  assert.doesNotMatch(text(byClass(h.tree(), 'country-fact-detail')), /Calculated:|ahead|behind|Same time/);
  assert.ok(nodes(byClass(h.tree(), 'country-fact-detail')).filter(node => node.type === 'time').every(node => node.props.dateTime === '2026-10-21'), 'A dated IANA source check does not pretend a device-relative clock was calculated'); h.unmount();
});

test('A source open failure and exception are recoverable, with busy Retry preventing repeated requests', async () => {
  const pending = [];
  const h = harness({ openExternal: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
  h.click(h.fact('Plugs & power'));
  h.click(buttons(byClass(h.tree(), 'country-fact-sources'))[0]); assert.equal(h.external.length, 1);
  assert.equal(buttons(byClass(h.tree(), 'country-fact-sources'))[0].props.disabled, true);
  pending.shift().resolve(false); await tick(); h.render(); assert.match(text(find(h.tree(), 'div', props => props.role === 'alert')), /Could not open the source/);
  h.click(h.label('Retry')); assert.equal(h.label('Opening…').props.disabled, true); assert.equal(h.external.length, 2);
  pending.shift().reject(Error('offline')); await tick(); h.render(); assert.ok(h.label('Retry'));
  h.click(h.label('Retry')); pending.shift().resolve(true); await tick(); h.render();
  assert.equal(find(h.tree(), 'div', props => props.role === 'alert'), undefined); assert.equal(h.external.length, 3);
  assert.ok(h.external.every(url => url === practical.countryPracticalInfo('TR').plugs.sources[0].url)); h.unmount();
});

test('Country, detail and unmount changes fence late source failures instead of contaminating the next screen', async () => {
  for (const transition of ['country', 'detail', 'close', 'unmount']) {
    let finish; const h = harness({ openExternal: () => new Promise(resolve => { finish = resolve; }) });
    h.click(h.fact('Plugs & power')); h.click(buttons(byClass(h.tree(), 'country-fact-sources'))[0]);
    if (transition === 'country') { h.render({ country: 'GB', countryLabel: 'United Kingdom' }); assert.equal(byClass(h.tree(), 'country-fact-detail'), undefined); assert.equal(value(h.fact('Currency')), 'GBP'); h.click(h.fact('Driving side')); }
    if (transition === 'detail') h.click(h.fact('Internet'));
    if (transition === 'close') h.click(h.label('Close fact details'));
    if (transition === 'unmount') h.unmount();
    const updates = h.stateUpdates(); finish(false); await tick();
    assert.equal(h.stateUpdates(), updates, `${transition}: a stale result performs no state update`);
    if (transition !== 'unmount') { h.render(); assert.equal(find(h.tree(), 'div', props => props.role === 'alert'), undefined); h.unmount(); }
  }
});

test('Country Guide keeps one practical record with useful tool links and preserves fact/tool/phrase paths', () => {
  const h = harness({ assistant: true, country: 'TR', savedCountry: 'GB', guides: [guideCard('TR', 'Turkey', { category: 'water' }), guideCard('GB', 'Britain', { category: 'water' }), guideCard('TR', 'Expired', { category: 'water', validUntil: '2026-10-19' })] });
  assert.equal(factCards(h.tree()).length, 6); assert.equal(value(h.fact('Currency')), 'TRY');
  assert.match(text(h.tree()), /Detailed advice Turkey/); assert.doesNotMatch(text(h.tree()), /Detailed advice Expired|Detailed advice Britain/);
  assert.equal(h.label('See all country information'),undefined,'The guide does not jump to duplicate country content');
  assert.equal(nodes(h.tree()).filter(node=>node.type==='h3'&&text(node)==='Country guide details').length,0);
  assert.equal(nodes(h.tree()).filter(node=>node.type==='h3'&&text(node)==='Related links').length,1);
  assert.equal(nodes(h.tree()).filter(node=>node.type==='h4'&&text(node)==='Advice Turkey').length,1);
  h.click(h.label('Open useful phrases')); assert.deepEqual(h.phrases, ['TR']);
  h.click(h.fact('Plugs & power')); find(h.tree(), 'CountryPicker').props.onChange('GB'); h.render();
  assert.equal(byClass(h.tree(), 'country-fact-detail'), undefined); assert.equal(value(h.fact('Currency')), 'GBP');
  assert.match(text(h.tree()), /Detailed advice Britain/); assert.doesNotMatch(text(h.tree()), /Detailed advice Turkey/); assert.deepEqual(h.selections, ['GB']);
  h.click(h.label('Emergency numbers and help')); assert.equal(find(h.tree(), 'TravelSafety').props.country, 'GB'); assert.equal(factCards(h.tree()).length, 0);
  h.click(h.label('All tools')); h.click(h.label('Money')); assert.ok(find(h.tree(), 'TravelMoney')); assert.equal(find(h.tree(), 'CountryPicker'), undefined); h.unmount();
});

test('Removing the top guide strip keeps directory search connected to the real six-fact guide and explicit shared country',()=>{
 const h=harness({assistant:true,country:'GB',savedCountry:'TR'});
 h.click(h.label('All tools'));
 assert.equal(byClass(h.tree(),'ta-guide-shortcut'),undefined);assert.equal(h.label('Country Guide'),undefined,'The directory has no second top guide entry');
 find(h.tree(),'input',props=>props.type==='search').props.onChange({target:{value:'country guide'}});h.render();
 assert.ok(h.label('Country Guide'));h.click(h.label('Country Guide'));
 assert.equal(factCards(h.tree()).length,6);assert.equal(value(h.fact('Currency')),'GBP');assert.equal(find(h.tree(),'CountryPicker').props.value,'GB');
 h.click(h.fact('Plugs & power'));assert.equal(value(h.fact('Plugs & power')),'G');assert.ok(byClass(h.tree(),'country-fact-detail'));
 assert.deepEqual(h.selections,[]);assert.deepEqual(h.external,[]);h.unmount();
});

test('Standalone six-fact callers retain the optional all-information callback without forcing it into the guide',()=>{
 let opens=0;const h=harness({country:'TR'});h.render({onOpenAll:()=>opens++});
 assert.equal(factCards(h.tree()).length,6);h.click(h.label('See all country information'));assert.equal(opens,1);
 assert.equal(factCards(h.tree()).length,6);assert.deepEqual(h.external,[]);h.unmount();
});

test('The rendered Guide shows each water, tax-free and hours record once and expands full text inside that same article in every locale',()=>{
 const records=[
  guideCard('TR','Water record',{category:'water',text:{tr:'Su özeti. Su ayrıntısı.',en:'Water summary. Water extended detail.',sq:'Përmbledhje për ujin. Hollësi për ujin.'}}),
  guideCard('TR','Tax record',{category:'tax-free',validUntil:'2026-10-31',text:{tr:'Vergi özeti. Vergi ayrıntısı.',en:'Tax summary. Tax extended detail.',sq:'Përmbledhje për taksën. Hollësi për taksën.'}}),
  guideCard('TR','Hours record',{category:'hours',text:{tr:'Saat özeti. Saat ayrıntısı.',en:'Hours summary. Hours extended detail.',sq:'Përmbledhje për oraret. Hollësi për oraret.'}}),
  guideCard('TR','Second hours record',{category:'hours'}),
 ];
 for(const locale of ['tr','en','sq']){
  const h=harness({assistant:true,locale,guides:[...records,guideCard('TR','Law',{category:'law'}),guideCard('TR','Culture',{category:'culture'}),guideCard('GB','Other',{category:'water'})]});
  const articles=()=>nodes(h.tree()).filter(node=>node.type==='article');
  const articleFor=record=>articles().find(article=>text(find(article,'h4'))===record.title[locale]);
  assert.equal(factCards(h.tree()).length,6);assert.equal(articles().length,records.length);
  for(const record of records)assert.equal(nodes(h.tree()).filter(node=>node.type==='h4'&&text(node)===record.title[locale]).length,1);
  assert.equal(byClass(h.tree(),'ta-guide-details-heading'),undefined);assert.equal(h.label({tr:'Tüm ülke bilgilerini gör',en:'See all country information',sq:'Shiko të gjitha informacionet e shtetit'}[locale]),undefined);
  const water=records[0],collapsed=articleFor(water),initialKey=collapsed.key;
  const expand=find(collapsed,'button',props=>props['aria-expanded']===false);assert.ok(expand);
  assert.equal(text(byClass(collapsed,'country-guide-highlight-summary')),water.text[locale].split('. ')[0]+'.');
  const controlledId=expand.props['aria-controls'];assert.ok(controlledId);h.click(expand);
  const expanded=articleFor(water);assert.equal(expanded.key,initialKey);assert.equal(articles().length,records.length);
  assert.equal(byClass(expanded,'country-guide-highlight-summary'),undefined,'Full text replaces the summary paragraph');
  assert.equal(text(byClass(expanded,'country-guide-highlight-full')),water.text[locale]);
  assert.ok(nodes(expanded).some(node=>node.props.id===controlledId));assert.equal(find(expanded,'time').props.dateTime,water.verifiedAt);
  assert.equal(nodes(h.tree()).filter(node=>node.type==='p'&&text(node)===water.text[locale]).length,1,'The old lower article loop does not repeat the full text');
  assert.equal(nodes(h.tree()).filter(node=>node.type==='h4'&&text(node)===water.title[locale]).length,1);
  const collapse=find(expanded,'button',props=>props['aria-expanded']===true);h.click(collapse);
  assert.equal(byClass(articleFor(water),'country-guide-highlight-full'),undefined);assert.equal(articles().length,records.length);
  assert.equal(byClass(articleFor(water),'country-guide-highlight-hours-note'),undefined,'Water records do not inherit a generic business-hours caveat');
  h.click(find(articleFor(records[2]),'button',props=>props['aria-expanded']===false));
  assert.ok(text(byClass(articleFor(records[2]),'country-guide-highlight-hours-note')).length>0,'An expanded hours record without its own qualification gets one local caution');
  assert.equal(nodes(h.tree()).filter(node=>node.props.className==='country-guide-highlight-hours-note').length,1);
  assert.deepEqual(h.external,[]);h.unmount();
 }
});

test('Country Guide excludes duplicate law and culture previews but keeps practical highlights and all six facts', () => {
  const h = harness({ assistant:true,country:'TR',guides:[
    guideCard('TR','Water',{category:'water'}),
    guideCard('TR','Law',{category:'law'}),
    guideCard('TR','Culture',{category:'culture'}),
  ] });
  assert.equal(factCards(h.tree()).length,6);
  assert.match(text(h.tree()),/Detailed advice Water/);
  assert.doesNotMatch(text(h.tree()),/Detailed advice Law|Detailed advice Culture/);
  const topicLabels=nodes(h.tree()).filter(node=>node.props.className==='country-guide-highlight-topic').map(text);
  assert.deepEqual(topicLabels,['Tap water']);
  h.unmount();
});

test('Currency and emergency detail actions open the existing tools with the selected destination preserved', () => {
  const h = harness({ assistant: true, country: 'GB' });
  h.click(h.fact('Currency')); h.click(h.label('Convert currency'));
  assert.ok(find(h.tree(), 'TravelMoney')); assert.equal(find(h.tree(), 'TravelMoney').props.initialBaseCurrency, 'GBP'); assert.equal(factCards(h.tree()).length, 0);
  h.click(h.label('All tools'));h.openGuide();
  assert.equal(value(h.fact('Currency')), 'GBP'); h.click(h.fact('Emergency')); h.click(h.label('Open emergency help'));
  assert.equal(find(h.tree(), 'TravelSafety').props.country, 'GB'); assert.deepEqual(h.selections, []); assert.deepEqual(h.external, []); h.unmount();
});

test('An unsupported converter currency stays visible without offering a different currency or opening Money', () => {
  const h = harness({ country: 'ID', now: Date.parse('2026-10-21T12:00:00Z') });
  const conversions = [];
  h.render({ onOpenMoney: code => conversions.push(code) });
  assert.equal(value(h.fact('Currency')), 'IDR');
  h.click(h.fact('Currency'));
  const detail = byClass(h.tree(), 'country-fact-detail');
  assert.equal(buttons(detail).some(node => /Convert currency/.test(text(node))), false);
  assert.match(text(detail), /not yet supported by our converter/);
  assert.match(text(detail), /will not open a different currency/);
  assert.deepEqual(conversions, []); assert.equal(find(h.tree(), 'TravelMoney'), undefined);
  assert.match(text(detail), /SIX.*ISO 4217/);
  h.unmount();
});

test('A multi-currency destination lists both currencies and hands the supported one to Money explicitly', () => {
  const h = harness({ assistant: true, country: 'PA', now: Date.parse('2026-10-21T12:00:00Z') });
  assert.equal(value(h.fact('Currency')), 'PAB / USD');
  h.click(h.fact('Currency'));
  assert.match(text(byClass(h.tree(), 'country-fact-detail')), /Confirm the currency before paying/);
  h.click(h.label('Convert currency · USD'));
  assert.equal(find(h.tree(), 'TravelMoney').props.initialBaseCurrency, 'USD', 'The supported second code is passed instead of the unsupported primary PAB');
  assert.deepEqual(h.selections, []); assert.deepEqual(h.external, []);
  h.unmount();
});

test('A multi-zone country changes its reference clock on selection and resets that choice when the country changes', () => {
  const instant = Date.parse('2026-10-21T12:00:00Z');
  const h = harness({ country: 'CA', now: instant });
  assert.equal(value(h.fact('Time difference')), '−7 h');
  assert.match(text(h.fact('Time difference')), /Toronto 08:00/);
  h.click(h.fact('Time difference'));
  let selector = find(h.tree(), 'select');
  assert.equal(selector.props.value, 'America/Toronto');
  assert.ok(nodes(selector).some(node => node.type === 'option' && node.props.value === 'America/Vancouver'));
  selector.props.onChange({ target: { value: 'America/Vancouver' } }); h.render();
  assert.equal(find(h.tree(), 'select').props.value, 'America/Vancouver');
  assert.equal(value(h.fact('Time difference')), '−10 h');
  assert.match(text(h.fact('Time difference')), /Vancouver 05:00/);
  const vancouverClock=nodes(byClass(h.tree(),'country-fact-detail')).find(node=>node.type==='figure'&&text(node).includes('Vancouver'));
  assert.ok(vancouverClock);assert.ok(find(vancouverClock, 'svg', props => props['data-clock-hour'] === 5 && props['data-clock-minute'] === 0));
  assert.equal(find(h.fact('Time difference'),'svg',props=>props['data-clock-hour']!==undefined),undefined,'Compact summaries do not squeeze an unreadable duplicate analog clock');
  assert.match(text(byClass(h.tree(), 'country-fact-detail')), /named reference location/);
  h.render({ country: 'GB' });
  assert.equal(byClass(h.tree(), 'country-fact-detail'), undefined);
  assert.match(text(h.fact('Time difference')), /London 13:00/);
  h.render({ country: 'CA' }); h.click(h.fact('Time difference'));
  assert.equal(find(h.tree(), 'select').props.value, 'America/Toronto');
  assert.equal(value(h.fact('Time difference')), '−7 h');
  h.unmount();
});

test('Antarctica shows no country-wide clock until a station is chosen, and returning resets the station', () => {
  const h = harness({ country: 'AQ', now: Date.parse('2026-10-21T12:00:00Z') });
  assert.equal(value(h.fact('Time difference')), 'By station');
  assert.equal(byClass(h.tree(), 'country-guide-local-time'), undefined);
  assert.equal(find(h.fact('Time difference'), 'svg', props => props['data-clock-hour'] !== undefined), undefined);
  h.click(h.fact('Time difference'));
  assert.match(text(byClass(h.tree(), 'country-fact-detail')), /Antarctica has no single clock/);
  assert.equal(find(byClass(h.tree(),'country-fact-detail'),'svg',props=>props['data-clock-hour']!==undefined),undefined,'No target or device-clock illustration is borrowed before a station is selected');
  const selector = find(h.tree(), 'select');
  assert.equal(selector.props.value, '');
  assert.ok(find(selector, 'option', props => props.value === '' && props.disabled));
  assert.ok(find(selector, 'option', props => props.value === 'Antarctica/Syowa'));
  selector.props.onChange({ target: { value: 'Antarctica/Syowa' } }); h.render();
  assert.equal(value(h.fact('Time difference')), 'Same time');
  assert.match(text(h.fact('Time difference')), /Syowa 15:00/);
  assert.equal(byClass(h.tree(), 'country-guide-local-time'), undefined, 'The selected station has no duplicated heading clock');
  const stationClock=nodes(byClass(h.tree(),'country-fact-detail')).find(node=>node.type==='figure'&&text(node).includes('Syowa'));
  assert.ok(stationClock);assert.ok(find(stationClock, 'svg', props => props['data-clock-hour'] === 15 && props['data-clock-minute']===0));
  assert.equal(find(h.fact('Time difference'),'svg',props=>props['data-clock-hour']!==undefined),undefined);
  h.render({ country: 'CA' }); h.render({ country: 'AQ' }); h.click(h.fact('Time difference'));
  assert.equal(find(h.tree(), 'select').props.value, '');
  assert.equal(value(h.fact('Time difference')), 'By station');
  assert.equal(byClass(h.tree(), 'country-guide-local-time'), undefined);
  h.unmount();
});

test('Delayed GPS cannot replace a manual guide country, and denied GPS leaves manual selection usable', async () => {
  let finish; const h = harness({ assistant: true, country: '', locate: () => new Promise(resolve => { finish = resolve; }) });
  assert.equal(factCards(h.tree()).length, 0); find(h.tree(), 'CountryPicker').props.onChange('GB'); h.render();
  assert.equal(value(h.fact('Currency')), 'GBP'); finish({ country: 'TR' }); await tick(); h.render();
  assert.equal(find(h.tree(), 'CountryPicker').props.value, 'GB'); assert.equal(value(h.fact('Currency')), 'GBP'); assert.deepEqual(h.selections, ['GB']); h.unmount();
  const denied = harness({ assistant: true, country: '' }); await tick(); denied.render(); assert.match(text(denied.tree()), /Location unavailable/);
  find(denied.tree(), 'CountryPicker').props.onChange('TR'); denied.render(); assert.equal(factCards(denied.tree()).length, 6); assert.equal(value(denied.fact('Currency')), 'TRY'); denied.unmount();
});

test('A saved explicit country survives assistant remount and tool cycles until the user requests location', async () => {
  const locations = [];
  const h = harness({ assistant: true, country: '', savedCountry: 'GB', locate: () => new Promise(resolve => locations.push(resolve)) });
  assert.equal(find(h.tree(), 'CountryPicker').props.value, 'GB'); assert.equal(value(h.fact('Currency')), 'GBP');
  assert.equal(locations.length, 0, 'Reading an explicit travel country must not launch GPS');
  h.click(h.label('All tools')); h.click(h.label('Money')); h.click(h.label('All tools'));
  h.openGuide();
  assert.equal(locations.length, 0); assert.equal(value(h.fact('Currency')), 'GBP');
  h.click(h.label('Use my location')); assert.equal(locations.length, 1);
  locations[0]({ country: 'TR' }); await tick(); h.render();
  assert.equal(find(h.tree(), 'CountryPicker').props.value, 'TR'); assert.equal(value(h.fact('Currency')), 'TRY');
  assert.deepEqual(h.selections, [], 'Automatic location is not stored as an explicit manual choice');
  h.click(h.label('Use my location')); assert.equal(locations.length, 2);
  find(h.tree(), 'CountryPicker').props.onChange('GB'); h.render(); locations[1]({ country: 'TR' }); await tick(); h.render();
  assert.equal(find(h.tree(), 'CountryPicker').props.value, 'GB'); assert.equal(value(h.fact('Currency')), 'GBP');
  assert.deepEqual(h.selections, ['GB']); h.unmount();
});

test('Country highlights preserve every distinct verified record and replace each summary with local full text', () => {
  const water=guideCard('TR','Water',{category:'water',text:{tr:'Su cümlesi. İkinci ayrıntı.',en:'Check local water notices before drinking. This follow-up stays in the same card.',sq:'Kontrollo njoftimet për ujin. Hollësi shtesë.'}});
  const guides=[guideCard('TR','Law',{category:'law'}),guideCard('TR','Hours',{category:'hours'}),guideCard('TR','Culture',{text:{tr:'Kültür bilgisi. Sonraki cümle.',en:'A complete local custom. A second detail in the same card.',sq:'Një zakon i plotë. Një hollësi tjetër.'}}),water,guideCard('TR','Second water',{category:'water'}),guideCard('TR','Tax',{category:'tax-free'}),water,guideCard('GB','Other country',{category:'water'})];
  const h=harness({highlightsOnly:true,guides});
  const articles=()=>nodes(h.tree()).filter(node=>node.type==='article');
  assert.equal(articles().length,6,'Exact duplicate records are removed; separate records for the same topic remain');
  assert.deepEqual(articles().map(article=>text(byClass(article,'country-guide-highlight-topic'))),['Tap water','Tap water','Tax Free','Local customs','Local rules','Daily hours']);
  assert.equal(text(byClass(articles()[0],'country-guide-highlight-summary')),'Check local water notices before drinking.');
  assert.equal(text(byClass(articles()[3],'country-guide-highlight-summary')),'A complete local custom.');
  assert.doesNotMatch(text(h.tree()),/Other country|A second detail|This follow-up/);
  assert.ok(articles().every(article=>find(article,'time').props.dateTime==='2026-10-20'));
  assert.ok(articles().every(article=>buttons(article).some(button=>text(button)==='example.test')));
  const key=articles()[0].key;h.click(find(articles()[0],'button',props=>props['aria-expanded']===false));
  assert.equal(articles()[0].key,key);assert.equal(articles().length,6);
  assert.equal(byClass(articles()[0],'country-guide-highlight-summary'),undefined);
  assert.equal(text(byClass(articles()[0],'country-guide-highlight-full')),water.text.en);
  assert.equal(nodes(articles()[0]).filter(node=>node.type==='p'&&text(node)===water.text.en).length,1);
  assert.equal(h.detailOpens(),0,'A local disclosure never invokes the legacy parent jump callback');
  h.render({country:'GB'});assert.equal(articles().length,1);assert.equal(byClass(h.tree(),'country-guide-highlight-full'),undefined);
  h.render({country:'TR'});assert.equal(articles().length,6);assert.equal(find(articles()[0],'button',props=>props['aria-expanded']===false).props['aria-expanded'],false);
  assert.equal(h.external.length,0);h.unmount();
});

test('Unavailable guide records retain source/date access while hiding factual titles and bodies instead of borrowing or showing stale claims', () => {
  const guides=[guideCard('TR','Expired factual title',{validUntil:'2026-10-19'}),guideCard('TR','Future factual title',{verifiedAt:'2099-01-01',category:'water'}),guideCard('TR','Invalid factual title',{verifiedAt:'invalid',category:'tax-free'}),guideCard('GB','Other')];
  const h=harness({highlightsOnly:true,guides});const articles=nodes(h.tree()).filter(node=>node.type==='article');assert.equal(articles.length,3);
  assert.doesNotMatch(text(h.tree()),/Expired factual title|Future factual title|Invalid factual title|Detailed advice|Other/);
  assert.ok(articles.every(article=>find(article,'p',props=>props.role==='status')),'Every unavailable record explains why factual content is hidden');
  assert.ok(articles.every(article=>buttons(article).some(button=>text(button)==='example.test')));
  assert.ok(articles.every(article=>!find(article,'button',props=>props['aria-expanded']!==undefined)),'Unverified factual content cannot be expanded');
  assert.ok(nodes(h.tree()).some(node=>node.type==='time'&&node.props.dateTime==='2026-10-19'),'Original expiration metadata remains inspectable');
  assert.ok(nodes(h.tree()).filter(node=>node.type==='time').every(node=>node.props.dateTime!=='invalid'),'Malformed dates never become a misleading machine time');
  h.render({country:'ZZ'});assert.equal(h.tree(),null);assert.equal(h.external.length,0);h.unmount();
  const japan=harness({highlightsOnly:true,country:'JP',guides:[guideCard('JP','Timed tax-free',{category:'tax-free',verifiedAt:'2026-09-16',validUntil:'2026-10-31',text:{tr:'Özet. Ayrıntı.',en:'Tax summary. Original qualified tax detail.',sq:'Përmbledhje. Hollësi tatimore.'}})]});
  assert.match(text(japan.tree()),/Timed tax-free/);assert.match(text(byClass(japan.tree(),'country-guide-highlight-validity')),/Applies through: 31 Oct 2026/);
  assert.equal(find(byClass(japan.tree(),'country-guide-highlight-validity'),'time').props.dateTime,'2026-10-31');
  japan.click(find(japan.tree(),'button',props=>props['aria-expanded']===false));assert.match(text(byClass(japan.tree(),'country-guide-highlight-full')),/Original qualified tax detail/);
  japan.clock(Date.parse('2026-11-01T00:00:00Z'));
  assert.doesNotMatch(text(japan.tree()),/Timed tax-free|Tax summary|Original qualified tax detail/);
  assert.equal(byClass(japan.tree(),'country-guide-highlight-full'),undefined);assert.ok(japan.label('example.test'));assert.equal(find(byClass(japan.tree(),'country-guide-highlight-validity'),'time').props.dateTime,'2026-10-31');japan.unmount();
});

test('Highlight review notices, real source dates and explicit Albanian fallback survive reduced-locale devices', () => {
  const translated = guideCard('TR', 'Translated', { category: 'water', verifiedAt: '2026-07-01' });
  const fallback = guideCard('TR', 'English only', { category: 'tax-free', validUntil: '2026-10-31', title: { tr: 'Yalnız İngilizce', en: 'English only' }, text: { tr: 'Türkçe metin.', en: 'A complete English source sentence. More source detail.' } });
  const h = harness({ highlightsOnly: true, locale: 'sq', intl: limitedAlbanianIntl(), guides: [translated, fallback] });
  const articles = nodes(h.tree()).filter(node => node.type === 'article');
  assert.equal(find(articles[0], 'h4').props.lang, 'sq'); assert.equal(byClass(articles[0], 'country-guide-highlight-language'), undefined);
  assert.match(text(find(articles[0], 'p', props => props.role === 'status')), /rishikim/);
  assert.equal(text(find(articles[0], 'time')), '1 korr 2026'); assert.equal(find(articles[0], 'time').props.dateTime, '2026-07-01');
  assert.equal(find(articles[1], 'h4').props.lang, 'en'); assert.equal(byClass(articles[1], 'country-guide-highlight-summary').props.lang, 'en');
  assert.match(text(byClass(articles[1], 'country-guide-highlight-language')), /ende shfaqet në anglisht/);
  assert.equal(text(find(articles[1], 'time')), '20 tet 2026');
  assert.equal(text(byClass(articles[1], 'country-guide-highlight-validity')), 'Vlen deri më: 31 tet 2026');
  assert.doesNotMatch(text(h.tree()), /Tem|Eki/);
  h.click(find(articles[1],'button',props=>props['aria-expanded']===false));
  const expanded=nodes(h.tree()).find(node=>node.type==='article'&&text(find(node,'h4'))==='English only');
  assert.equal(byClass(expanded,'country-guide-highlight-summary'),undefined);
  assert.equal(text(byClass(expanded,'country-guide-highlight-full')),fallback.text.en);assert.equal(byClass(expanded,'country-guide-highlight-full').props.lang,'en');
  assert.match(text(byClass(expanded,'country-guide-highlight-language')),/ende shfaqet në anglisht/);
  assert.equal(text(byClass(expanded,'country-guide-highlight-validity')),'Vlen deri më: 31 tet 2026');
  assert.equal(find(expanded,'time').props.dateTime,'2026-10-20');
  h.language('tr'); assert.match(text(byClass(h.tree(), 'country-guide-highlight-validity')), /Kapsadığı son tarih: 31 Eki 2026/); h.unmount();
});

test('All five real Japan guide topics have complete Albanian text without refreshing their evidence or losing qualifications', () => {
  const guides = load('lib/travel-assistant/guides.ts').GUIDE_CARDS.filter(card => card.country === 'JP');
  assert.equal(guides.length, 5); assert.ok(guides.every(card => card.title.sq && card.text.sq && card.verifiedAt === '2026-09-16'));
  const byTopic = topic => guides.find(card => card.category === topic);
  assert.match(byTopic('water').text.sq, /nuk është i pijshëm.*pas fatkeqësive/);
  assert.match(byTopic('culture').text.sq, /jo ndalim ligjor/); assert.match(byTopic('law').text.sq, /detyrim ligjor, jo këshillë kulturore/);
  assert.match(byTopic('hours').text.sq, /10:00–20:00.*09:00–17:00.*festat bëjnë përjashtim/);
  assert.match(byTopic('tax-free').text.sq, /1 nëntori 2026.*dogana.*blerësi përjashtohen/); assert.equal(byTopic('tax-free').validUntil, '2026-10-31');
  const h = harness({ country: 'JP', highlightsOnly: true, locale: 'sq', guides, intl: limitedAlbanianIntl() });
  assert.equal(nodes(h.tree()).filter(node => node.type === 'article').length, 5);
  assert.ok(nodes(h.tree()).filter(node => node.type === 'h4').every(heading => heading.props.lang === 'sq'));
  assert.doesNotMatch(text(h.tree()), /ende shfaqet në anglisht/); assert.match(text(h.tree()), /Vlen deri më: 31 tet 2026/);
  for(const record of guides){
   const article=nodes(h.tree()).find(node=>node.type==='article'&&text(find(node,'h4'))===record.title.sq);assert.ok(article);
   const toggle=find(article,'button',props=>props['aria-expanded']===false);if(toggle)h.click(toggle);
   const current=nodes(h.tree()).find(node=>node.type==='article'&&text(find(node,'h4'))===record.title.sq);
   assert.equal(text(byClass(current,'country-guide-highlight-full')||byClass(current,'country-guide-highlight-summary')),record.text.sq,'All qualified source text remains reachable within its original card');
   assert.equal(find(current,'time').props.dateTime,record.verifiedAt);
   if(record.category==='hours')assert.equal(byClass(current,'country-guide-highlight-hours-note'),undefined,'The source’s own business-hours qualification is not repeated');
  }
  h.unmount();
});

test('Highlight source failures can retry, while country changes and unmount fence late source responses', async () => {
  const guides = [guideCard('TR', 'Source'), guideCard('GB', 'British source')], requests = [];
  const h = harness({ highlightsOnly: true, guides, openExternal: () => new Promise(resolve => requests.push(resolve)) });
  h.click(h.label('example.test')); requests.shift()(false); await tick(); h.render(); assert.ok(h.label('Retry'));
  h.click(h.label('Retry')); assert.equal(h.label('Opening…').props.disabled, true);
  h.render({ country: 'GB' }); assert.equal(find(h.tree(), 'div', props => props.role === 'alert'), undefined);
  const updates = h.stateUpdates(); requests.shift()(false); await tick(); h.render(); assert.equal(h.stateUpdates(), updates);
  assert.equal(find(h.tree(), 'div', props => props.role === 'alert'), undefined); assert.match(text(h.tree()), /British source/);
  h.click(h.label('example.test')); h.unmount(); const afterUnmount = h.stateUpdates(); requests.shift()(false); await tick(); assert.equal(h.stateUpdates(), afterUnmount);
});
