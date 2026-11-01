import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object'
  ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number'
  ? String(tree) : tree?.props ? text(tree.props.children) : '';
function host() {
  const slots = []; let cursor = 0, component, props;
  return {
    react: {
      useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }]; },
      useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
      useMemo(fn, deps) { const index = cursor++, before = slots[index]; if (!before || deps.some((value, position) => !Object.is(value, before.deps[position]))) slots[index] = { value: fn(), deps }; return slots[index].value; },
    },
    start(nextComponent, nextProps) { component = nextComponent; props = nextProps; return this.render(); },
    render(next) { if (next) props = { ...props, ...next }; cursor = 0; return component(props); },
  };
}
function fixture(locale = 'en', initial = {}) {
  const h = host(), cache = new Map(), calls = { cities: [], countries: [], globalQueries: [], saved: [], queries: [], savedFilters: [], backs: 0, retries: 0 };
  const stubs = new Map(['Icon', 'CountryFlag', 'DestinationPhoto', 'CityPhotoCredits', 'CityHeartButton'].map(name => [name, { [name]: name }]));
  const load = filename => {
    const full = path.resolve(filename), name = path.basename(full, path.extname(full));
    if (stubs.has(name)) return stubs.get(name);
    if (full.endsWith('.css')) return {};
    if (/\.(webp|png|svg)$/.test(full)) return { __esModule: true, default: full };
    if (full.endsWith('.json')) return JSON.parse(readFileSync(full, 'utf8'));
    if (cache.has(full)) return cache.get(full).exports;
    const loadedModule = { exports: {} }; cache.set(full, loadedModule);
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
      Intl, Date, URL,
      fetch() { throw Error('No network in city discovery regression tests'); },
      localStorage: { getItem() { throw Error('Discovery must use savedCityCodes, not read or write another store'); }, setItem() { throw Error('No persistent writes in discovery tests'); } },
    }, { filename: full })(id => {
      if (id === 'react') return h.react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === '../lib/i18n') return { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en }) };
      if (!id.startsWith('.')) throw Error(`Unexpected city browser dependency ${id}`);
      const base = path.resolve(path.dirname(full), id), target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!target) throw Error(`Missing city browser dependency ${id}`);
      return load(target);
    }, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  };
  const catalog = load('mobile/src/data/cityDestinations.ts').cityDestinations(locale);
  const { CityDiscoveryScreen } = load('mobile/src/screens/CityDiscoveryScreen.tsx');
  h.start(CityDiscoveryScreen, { onBack: () => calls.backs++, onOpenCity: code => calls.cities.push(code),
    onOpenCountry: code => calls.countries.push(code), onSearchAllCountries: query => calls.globalQueries.push(query),
    onToggleCitySaved: code => calls.saved.push(code), onQueryChange: query => calls.queries.push(query), onSavedOnlyChange: value => calls.savedFilters.push(value), onRetrySaved: () => calls.retries++, ...initial });
  return { catalog, calls, render: next => h.render(next) };
}
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const cards = tree => nodes(tree).filter(node => node.type === 'button' && node.props.className === 'city-discovery-card');
const countryRows = tree => nodes(tree).filter(node => node.type === 'button' && node.props.className === 'city-discovery-country-card');
function button(tree, label) {
  const result = find(tree, 'button', props => (props['aria-label'] || text(props.children)) === label);
  assert.ok(result, `Action available: ${label}`); return result;
}
const words = {
  tr: { all: 'Tümü', saved: 'Kaydettiklerim', global: 'Tüm ülkelerde ara', noSaved: 'Henüz şehir kaydetmedin', noSavedCountry: 'Bu ülkede kayıtlı şehrin yok', clear: 'Aramayı temizle', unavailable: 'Kaydedilen şehirler şu anda okunamıyor', retry: 'Yeniden dene' },
  en: { all: 'All', saved: 'Saved', global: 'Search all countries', noSaved: 'No saved cities yet', noSavedCountry: 'No saved cities in this country', clear: 'Clear search', unavailable: 'Saved cities cannot be read right now', retry: 'Try again' },
  sq: { all: 'Të gjitha', saved: 'Të ruajturat', global: 'Kërko në të gjitha shtetet', noSaved: 'Ende nuk ke ruajtur qytete', noSavedCountry: 'Nuk ke qytete të ruajtura në këtë shtet', clear: 'Pastro kërkimin', unavailable: 'Qytetet e ruajtura nuk mund të lexohen tani', retry: 'Provo sërish' },
  ro: { all: 'Toate', saved: 'Salvate', global: 'Caută în toate țările', noSaved: 'Nu ai salvat încă orașe', noSavedCountry: 'Nu ai orașe salvate în această țară', clear: 'Șterge căutarea', unavailable: 'Orașele salvate nu pot fi citite momentan', retry: 'Încearcă din nou' },
};

for (const [locale, labels] of Object.entries(words)) {
  test(`${locale}: unsupported-country recovery opens all countries and clears local and parent filters`, () => {
    const f = fixture(locale, { countryCode: 'ZZ', initialQuery: '  Rome  ', initialSavedOnly: true, savedCityCodes: ['FCO'] });
    const recovery = find(find(f.render(), 'div', props => props.className === 'city-discovery-empty'), 'button');
    assert.equal(text(recovery), { tr: 'Tüm ülkeler', en: 'All countries', sq: 'Të gjitha shtetet', ro: 'Toate țările' }[locale]);
    recovery.props.onClick();
    assert.deepEqual(f.calls.globalQueries, [''], 'Recovery explicitly selects the unfiltered country list instead of history');
    assert.deepEqual(f.calls.queries, ['']); assert.deepEqual(f.calls.savedFilters, [false]);
    const view = f.render();
    assert.equal(find(view, 'input').props.value, ''); assert.equal(button(view, labels.all).props['aria-pressed'], true);
    assert.equal(f.calls.backs, 0); assert.deepEqual(f.calls.saved, []); assert.deepEqual(f.calls.cities, []); assert.deepEqual(f.calls.countries, []);
  });

  test(`${locale}: unsupported-country recovery retains a Back fallback while ordinary Back preserves filters`, () => {
    const initial = { countryCode: 'ZZ', initialQuery: 'Rome', initialSavedOnly: true, savedCityCodes: ['FCO'] };
    const fallback = fixture(locale, { ...initial, onSearchAllCountries: undefined });
    find(find(fallback.render(), 'div', props => props.className === 'city-discovery-empty'), 'button').props.onClick();
    assert.equal(fallback.calls.backs, 1); assert.deepEqual(fallback.calls.globalQueries, []); assert.deepEqual(fallback.calls.saved, []);
    const ordinary = fixture(locale, initial);
    find(ordinary.render(), 'button', props => props.className === 'city-discovery-back').props.onClick();
    assert.equal(ordinary.calls.backs, 1); assert.deepEqual(ordinary.calls.globalQueries, []);
    assert.equal(find(ordinary.render(), 'input').props.value, 'Rome');
    assert.equal(button(ordinary.render(), labels.saved).props['aria-pressed'], true);
    assert.deepEqual(ordinary.calls.queries, []); assert.deepEqual(ordinary.calls.savedFilters, []); assert.deepEqual(ordinary.calls.saved, []);
  });

  test(`${locale}: country search states its scope and hands the unchanged query to global search explicitly`, () => {
    const f = fixture(locale, { countryCode: 'RO' }); let view = f.render();
    const country = f.catalog.find(city => city.countryCode === 'RO').country;
    const input = find(view, 'input'); assert.ok(input.props.placeholder.includes(country)); assert.equal(input.props['aria-label'], input.props.placeholder);
    input.props.onChange({ target: { value: '  Paris  ' } }); view = f.render();
    assert.equal(cards(view).length, 0); assert.deepEqual(f.calls.globalQueries, [], 'Filtering a country never silently changes country');
    button(view, labels.global).props.onClick();
    assert.deepEqual(f.calls.globalQueries, ['Paris']); assert.equal(find(f.render(), 'input').props.value, '  Paris  ');
    assert.equal(f.calls.backs, 0); assert.deepEqual(f.calls.countries, []); assert.deepEqual(f.calls.saved, []);
    find(view, 'button', props => props.className === 'city-discovery-back').props.onClick(); assert.equal(f.calls.backs, 1, 'Back remains the parent history action');
  });

  test(`${locale}: Saved is derived only from current saved city codes and reacts to account scope changes`, () => {
    const codes = ['FCO', 'CDG', 'FCO', 'unknown-code'], f = fixture(locale, { savedCityCodes: codes }); let view = f.render();
    button(view, labels.saved).props.onClick(); view = f.render();
    assert.deepEqual(cards(view).map(card => card.props['aria-label']), Array.from(f.catalog.filter(city => ['CDG', 'FCO'].includes(city.code)), city => city.name));
    assert.equal(countryRows(view).length, 0, 'Saved opens the saved cities directly, without another country navigation');
    assert.equal(button(view, labels.saved).props['aria-pressed'], true);
    assert.deepEqual(f.calls.savedFilters, [true], 'The parent can restore the filter after city navigation without another persistent store');
    const city = f.catalog.find(item => item.code === 'FCO');
    find(view, 'input').props.onChange({ target: { value: city.name } }); view = f.render();
    assert.equal(cards(view).length, 1); cards(view)[0].props.onClick(); assert.deepEqual(f.calls.cities, ['FCO']);
    const heart = find(view, 'CityHeartButton'); assert.equal(heart.props.saved, true);
    heart.props.onToggle(); assert.deepEqual(f.calls.saved, ['FCO']); assert.deepEqual(f.calls.cities, ['FCO'], 'The sibling heart does not also open the city');
    view = f.render({ savedCityCodes: ['CDG'] }); assert.equal(cards(view).length, 0, 'Removed or previous-owner codes cannot remain in the saved results');
    button(view, labels.clear).props.onClick(); view = f.render(); assert.equal(cards(view).length, 1);
    assert.equal(cards(view)[0].props['aria-label'], f.catalog.find(item => item.code === 'CDG').name);
    view = f.render({ savedCityCodes: [] }); assert.equal(cards(view).length, 0); assert.ok(text(view).includes(labels.noSaved));
    assert.deepEqual(codes, ['FCO', 'CDG', 'FCO', 'unknown-code'], 'A filter does not mutate the supplied saved list');
  });

  test(`${locale}: saved empty states distinguish the selected country and recover without a saved-data write`, () => {
    const f = fixture(locale, { countryCode: 'RO', savedCityCodes: ['FCO'] }); let view = f.render();
    button(view, labels.saved).props.onClick(); view = f.render();
    assert.equal(cards(view).length, 0); assert.ok(text(view).includes(labels.noSavedCountry));
    find(find(view, 'div', props => props.className === 'city-discovery-empty'), 'button').props.onClick(); view = f.render();
    assert.equal(cards(view).length, 1); assert.equal(cards(view)[0].props['aria-label'], f.catalog.find(city => city.code === 'OTP').name);
    assert.equal(button(view, labels.all).props['aria-pressed'], true); assert.deepEqual(f.calls.saved, []); assert.equal(f.calls.backs, 0);
    const noCallback = fixture(locale, { countryCode: 'RO', onSearchAllCountries: undefined });
    assert.equal(find(noCallback.render(), 'button', props => props.className === 'city-discovery-search-all'), undefined, 'Do not disguise arbitrary Back navigation as global search');
  });

  test(`${locale}: clearing a failed country saved search accurately labels the action and preserves the saved filter`, () => {
    const f = fixture(locale, { countryCode: 'IT', savedCityCodes: ['FCO'] });
    button(f.render(), labels.saved).props.onClick();
    find(f.render(), 'input').props.onChange({ target: { value: 'no-such-city' } });
    const empty = find(f.render(), 'div', props => props.className === 'city-discovery-empty');
    assert.ok(empty);
    const recovery = find(empty, 'button');
    assert.equal(text(recovery), labels.clear);
    recovery.props.onClick();
    const view = f.render();
    assert.equal(find(view, 'input').props.value, '');
    assert.equal(button(view, labels.saved).props['aria-pressed'], true);
    assert.deepEqual(cards(view).map(card => card.props['aria-label']), [f.catalog.find(city => city.code === 'FCO').name]);
    assert.equal(f.calls.backs, 0); assert.deepEqual(f.calls.saved, []);
    button(view, labels.all).props.onClick();
    assert.equal(cards(f.render()).length, f.catalog.filter(city => city.countryCode === 'IT').length, 'Only the explicit All filter reveals the other cities');
  });

  test(`${locale}: unreadable saved cities show one retry state and recover without confusing an error with an empty collection`, () => {
    const f = fixture(locale, { initialSavedOnly: true, initialQuery: 'Rome', savedUnavailable: true, savedCityCodes: ['FCO'] });
    let view = f.render();
    const alert = find(view, 'div', props => props.role === 'alert');
    assert.ok(alert); assert.ok(text(alert).includes(labels.unavailable));
    assert.equal(cards(view).length, 0, 'Cached supplied codes are not rendered alongside a failed read');
    assert.equal(find(view, 'CityPhotoCredits'), undefined);
    assert.equal(find(view, 'p', props => props.className === 'city-discovery-count'), undefined, 'Unknown count is not displayed as zero');
    assert.ok(!text(view).includes(labels.noSaved));
    button(view, labels.retry).props.onClick(); assert.equal(f.calls.retries, 1);
    assert.ok(find(f.render(), 'div', props => props.role === 'alert'), 'Retry waits for the parent read result');
    view = f.render({ savedUnavailable: false, savedCityCodes: ['FCO'] });
    assert.equal(find(view, 'div', props => props.role === 'alert'), undefined);
    assert.equal(button(view, labels.saved).props['aria-pressed'], true);
    assert.equal(find(view, 'input').props.value, 'Rome');
    assert.deepEqual(cards(view).map(card => card.props['aria-label']), [f.catalog.find(city => city.code === 'FCO').name]);
    view = f.render({ savedCityCodes: [] });
    assert.ok(text(view).includes(labels.noSaved), 'A successful empty read retains the real empty-state message');
    assert.equal(find(view, 'div', props => props.role === 'alert'), undefined);
    view = f.render({ savedUnavailable: true });
    assert.ok(text(view).includes(labels.unavailable), 'An empty result with a failed read is still an error');
    assert.ok(!text(view).includes(labels.noSaved));
    assert.deepEqual(f.calls.saved, []); assert.deepEqual(f.calls.cities, []);
  });

  test(`${locale}: unreadable saved state does not block All or country-wide search`, () => {
    const f = fixture(locale, { countryCode: 'RO', initialSavedOnly: true, initialQuery: 'Paris', savedUnavailable: true });
    let view = f.render(); assert.ok(text(view).includes(labels.unavailable));
    button(view, labels.global).props.onClick(); view = f.render();
    assert.deepEqual(f.calls.globalQueries, ['Paris']);
    assert.equal(button(view, labels.all).props['aria-pressed'], true);
    assert.equal(find(view, 'div', props => props.role === 'alert'), undefined);
    button(view, labels.clear).props.onClick(); view = f.render();
    assert.equal(cards(view).length, 1, 'All country cities stay available even if the saved list is unreadable');
    button(view, labels.saved).props.onClick(); view = f.render();
    assert.ok(text(view).includes(labels.unavailable));
    button(view, labels.all).props.onClick(); assert.equal(cards(f.render()).length, 1);
    assert.deepEqual(f.calls.saved, []); assert.equal(f.calls.retries, 0);
    const noRetry = fixture(locale, { initialSavedOnly: true, savedUnavailable: true, onRetrySaved: undefined });
    assert.ok(text(noRetry.render()).includes(labels.unavailable));
    assert.equal(find(noRetry.render(), 'button', props => text(props.children) === labels.retry), undefined, 'Do not render an inactive retry action without a parent handler');
  });
}

test('The unchanged country-first All view still reaches every real city exactly once with its own flag', () => {
  const f = fixture('en'); let view = f.render(); const expected = new Set(f.catalog.map(city => city.countryCode));
  assert.equal(f.catalog.length, 50); assert.equal(countryRows(view).length, expected.size);
  assert.deepEqual(new Set(countryRows(view).map(row => find(row, 'CountryFlag').props.code)), expected);
  for (const code of expected) {
    const row = countryRows(view).find(item => find(item, 'CountryFlag').props.code === code); assert.ok(row); row.props.onClick();
    view = f.render({ countryCode: code });
    const expectedCities = f.catalog.filter(city => city.countryCode === code);
    assert.deepEqual(cards(view).map(card => card.props['aria-label']), Array.from(expectedCities, city => city.name));
    for (const card of cards(view)) { assert.equal(find(card, 'DestinationPhoto').props.countryCode, code); card.props.onClick(); }
    view = f.render({ countryCode: null });
  }
  assert.equal(f.calls.cities.length, 50); assert.deepEqual(new Set(f.calls.cities), new Set(f.catalog.map(city => city.code))); assert.deepEqual(f.calls.saved, []);
});

test('A remounted catalogue restores the saved filter supplied by parent navigation', () => {
  const f = fixture('en', { initialSavedOnly: true, initialQuery: 'Rome', savedCityCodes: ['FCO', 'CDG'] });
  const view = f.render(); assert.equal(button(view, 'Saved').props['aria-pressed'], true);
  assert.equal(cards(view).length, 1); assert.equal(cards(view)[0].props['aria-label'], 'Rome');
  assert.deepEqual(f.calls.savedFilters, [], 'Mounting a restored filter does not dispatch a new preference change');
  assert.deepEqual(f.calls.saved, []);
});

test('The same saved search accepts all four supported aliases without creating another saved collection', () => {
  for (const locale of Object.keys(words)) {
    const f = fixture(locale, { savedCityCodes: ['FCO'] }); button(f.render(), words[locale].saved).props.onClick();
    for (const alias of ['Roma', 'Rome', 'Romë']) {
      find(f.render(), 'input').props.onChange({ target: { value: alias } });
      const view = f.render(); assert.equal(cards(view).length, 1, `${locale}: ${alias}`); assert.equal(cards(view)[0].props['aria-label'], f.catalog.find(city => city.code === 'FCO').name);
    }
    assert.deepEqual(f.calls.saved, []);
  }
});
