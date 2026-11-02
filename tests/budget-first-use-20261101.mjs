import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';

// Reuse the established executable budget fixture, without registering its
// unrelated tests. The current product modules/handlers are always loaded.
function fixture(intl = Intl) {
  const file = 'tests/planning-ux.mjs', require = createRequire(pathToFileURL(resolve(file)));
  let setup = readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, setup, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const globals = { Date, Intl: intl, URL, URLSearchParams, console, process, setTimeout, clearTimeout, setImmediate, Event, EventTarget, TextEncoder, AbortController, AbortSignal, Error, crypto: globalThis.crypto };
  for (const statement of [...parsed.statements].reverse()) if (ts.isImportDeclaration(statement)) {
    const imported = statement.moduleSpecifier.text === 'node:test' ? { default: () => {} } : require(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (clause?.name) globals[clause.name.text] = imported.default ?? imported;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const member of clause.namedBindings.elements) globals[member.name.text] = imported[member.propertyName?.text || member.name.text];
    setup = setup.slice(0, statement.pos) + setup.slice(statement.end);
  }
  setup = setup.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(resolve(file)).href));
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(`${setup}\nmodule.exports={costHarness,text,load,localeFormatting,cityData};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(module,exports){${compiled}\n})`, globals, { filename: `${file}:budget-first-use` })(loaded, loaded.exports);
  return loaded.exports;
}

function forcedIntl(zone, reducedAlbanian = false) {
  const wrapper = Object.create(Intl), NativeDateTimeFormat = Intl.DateTimeFormat;
  function DateTimeFormat(locale, options = {}) {
    const selected = reducedAlbanian && /^sq(?:-|$)/i.test(String(locale)) ? 'tr-TR' : locale;
    return new NativeDateTimeFormat(selected, { ...options, timeZone: options.timeZone || zone });
  }
  DateTimeFormat.supportedLocalesOf = locales => NativeDateTimeFormat.supportedLocalesOf((Array.isArray(locales) ? locales : [locales]).filter(locale => !reducedAlbanian || !/^sq(?:-|$)/i.test(String(locale))));
  Object.defineProperty(wrapper, 'DateTimeFormat', { value: DateTimeFormat }); return wrapper;
}

const shared = fixture();
const elements = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(elements)] : [];
const rows = h => h.nodes().filter(node => node.type === 'button' && node.props.className === 'budget-city-row has-photo');
const ids = h => Array.from(rows(h), row => h.rowSource(row).id);
const aliases = [['ro', 'București', 'RO-bucharest'], ['ro', 'Viena', 'AT-vienna'], ['sq', 'Bukuresht', 'RO-bucharest'], ['sq', 'Tiranë', 'AL-tirana'], ['sq', 'Vjenë', 'AT-vienna']];

test('Existing researched cities accept Romanian and Albanian city aliases in estimates and suggestions', () => {
  for (const [locale, query, expected] of aliases) {
    const h = shared.costHarness({ locale });
    try {
      h.query(query); h.focusSearch();
      assert(ids(h).includes(expected), `${locale}/${query}: estimate must be available`);
      assert(h.destinationSearch.budgetDestinationSuggestions(query, locale).some(option => option.cityId === expected), `${locale}/${query}: suggestions must agree`);
      assert.equal(h.destinationSearch.exactBudgetCityId(query), expected);
      assert.equal(h.saved.length, 0); assert.equal(h.intents.length, 0);
    } finally { h.dispose(); }
  }
});

test('Exact localized budget entry stays on the selected city while free typing retains country matching', () => {
  for (const [locale, initialCityQuery, expected] of aliases) {
    const h = shared.costHarness({ locale, initialCityQuery });
    try { assert.deepEqual(ids(h), [expected]); } finally { h.dispose(); }
  }
  const h = shared.costHarness();
  try {
    for (const row of h.benchmarks.CITY_BENCHMARKS) for (const name of [row.city.tr, row.city.en]) assert.equal(h.destinationSearch.exactBudgetCityId(name), row.id);
    for (const name of ['Romania', 'România', 'France', 'Fransa', 'Rome museum', '', 'Unknown place']) assert.equal(h.destinationSearch.exactBudgetCityId(name), null);
    assert.equal(h.destinationSearch.matchesBudgetDestination('RO-bucharest', 'Roma'), true);
    assert.equal(h.destinationSearch.matchesBudgetDestination('IT-rome', 'Romania'), false);
  } finally { h.dispose(); }
});

test('Budget calendar-day summaries retain the selected dates in UTC+12,+13 and+14 without changing day/night arithmetic', () => {
  const preferences = { startDate: '2027-02-10', endDate: '2027-02-14', currency: 'GBP' };
  let reference;
  for (const zone of ['UTC', 'Europe/Istanbul', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Kiritimati']) {
    const { costHarness } = fixture(forcedIntl(zone));
    const h = costHarness({ locale: 'tr', preferences });
    try {
      const summary = h.summary(h.labels.dates); reference ||= summary;
      assert.equal(summary, reference, zone);
      assert.deepEqual({ ...h.personal.personalBudgetDuration(preferences) }, { days: 5, nights: 4 });
      assert.equal(h.saved.length, 0); assert.equal(h.intents.length, 0);
    } finally { h.dispose(); }
  }
});

test('Budget dates use the existing selected-language fallback when native Intl lacks Albanian data', () => {
  const preferences = { startDate: '2027-02-10', endDate: '2027-02-14', currency: 'GBP' };
  const { costHarness, localeFormatting } = fixture(forcedIntl('Pacific/Auckland', true));
  const h = costHarness({ locale: 'sq', preferences });
  try {
    const expected = [preferences.startDate, preferences.endDate].map(value => localeFormatting.formatAppDate(new Date(`${value}T12:00:00Z`), 'sq', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })).join(' – ');
    assert.equal(h.summary(h.labels.dates), expected); assert.match(expected, /10 shk 2027/);
  } finally { h.dispose(); }
});

test('Lightweight city labels preserve the original46extra and2core translations and agree with the discovery catalogue', () => {
  const labels = shared.load('mobile/src/data/budgetCityLabels.ts').BUDGET_CITY_LABELS;
  const canonical = JSON.stringify(Object.fromEntries(Object.keys(labels).sort().map(key => [key, labels[key]])));
  // Pinned from the existing labels before extraction, not from this new map.
  assert.equal(createHash('sha256').update(canonical).digest('hex'), 'e0d4b2c20f38992341023033c5af3ea39dbc45a94497acc1125be89f0fce4a9b');
  assert.equal(Object.keys(labels).length, 48);
  const h = shared.costHarness();
  try {
    assert.equal(h.benchmarks.CITY_BENCHMARKS.length, 50);
    assert.deepEqual(Array.from(h.benchmarks.CITY_BENCHMARKS.filter(row => !labels[row.id]), row => row.id).sort(), ['FR-lille', 'SK-trencin']);
    for (const locale of ['tr', 'en', 'sq', 'ro']) {
      const cities = shared.cityData.cityDestinations(locale);
      for (const [id, names] of Object.entries(labels)) {
        const destination = cities.find(city => city.budgetBenchmarkId === id);
        assert(destination, `${id}: existing discovery identity`);
        assert.equal(names[locale], destination.name, `${locale}/${id}: shared approved label`);
        assert.equal(h.destinationSearch.exactBudgetCityId(names[locale]), id);
        assert.equal(h.destinationSearch.matchesBudgetDestination(id, names[locale]), true);
        const suggestion = h.destinationSearch.budgetDestinationSuggestions(names[locale], locale).find(option => option.cityId === id);
        assert(suggestion, `${locale}/${id}: matching suggestion`); assert.equal(suggestion.label, names[locale]);
      }
      for (const id of ['FR-lille', 'SK-trencin']) {
        const row = h.benchmarks.CITY_BENCHMARKS.find(row => row.id === id);
        assert.equal(h.destinationSearch.exactBudgetCityId(row.city.en), id);
      }
    }
  } finally { h.dispose(); }
});

test('The budget search runtime dependency graph excludes photographs and editorial destination modules', () => {
  const visited = new Set();
  function visit(file) {
    const full = resolve(file); if (visited.has(full)) return; visited.add(full);
    assert.doesNotMatch(full.replaceAll('\\', '/'), /\/assets\/|\/screens\/|\/components\/|cityDestinationExtras|cityDestinations\.ts|cityEssentials|budgetCityPhotos|\/routes\.ts/);
    const source = ts.createSourceFile(full, readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings) && !statement.importClause.name && bindings.elements.every(item => item.isTypeOnly)) continue;
      const target = statement.moduleSpecifier.text;
      assert(target.startsWith('.'), `Data-only helper cannot import ${target}`);
      const next = resolve(dirname(full), target); visit(extname(next) ? next : `${next}.ts`);
    }
  }
  visit('mobile/src/lib/budgetDestinationSearch.ts');
  assert(visited.has(resolve('mobile/src/data/budgetCityLabels.ts')));
  assert(readFileSync('mobile/src/data/budgetCityLabels.ts').length < 16 * 1024);
});

test('Selecting a localized budget suggestion keeps its name in the query, card, photo, summary, detail and trip snapshot', () => {
  for (const [locale, name, expected] of [['tr', 'Bükreş', 'RO-bucharest'], ['en', 'Bucharest', 'RO-bucharest'], ...aliases]) {
    const h = shared.costHarness({ locale });
    try {
      h.query(name); h.focusSearch(); h.chooseSearchOption(name);
      assert.equal(h.queryValue(), name); assert.deepEqual(ids(h), [expected]);
      const row = rows(h)[0]; assert.equal(h.rowName(row), name);
      assert.equal(elements(row).find(node => node.type === 'DestinationPhoto').props.label, name);
      const summary = h.nodes().find(node => node.props.className === 'budget-action-summary');
      assert.equal(shared.text(elements(summary).find(node => node.type === 'small')), name);
      h.openDetail(row); assert.equal(h.openSheet().props.title, name);
      const attach = locale === 'ro' ? 'Add this estimate to My trips' : h.labels.addTrip;
      h.tap(attach);
      assert.equal(h.intents.length, 1); assert.equal(h.intents[0].city, name);
      assert.equal(h.intents[0].sourceBenchmarkId, expected);
      assert.equal(h.intentModule.validateBudgetCockpitIntent(h.intents[0]), true);
      assert.equal(h.saved.length, 0, 'Destination labels never rewrite calculation preferences');
    } finally { h.dispose(); }
  }
});

test('A trip with an approved localized city name reopens that exact budget without crossing its country identity', () => {
  for (const [locale, name, expected] of aliases) {
    const code = expected.split('-')[0];
    const h = shared.costHarness({ locale, activeTrip: { tripId: 'fixture-trip', title: `${name} trip`, city: name, countryCode: code, startDate: '2027-02-10', endDate: '2027-02-14' } });
    try {
      h.tap(locale === 'ro' ? 'Use trip details' : h.labels.useTrip);
      assert.equal(h.queryValue(), name); assert.deepEqual(ids(h), [expected]);
      assert.equal(h.intents.length, 0, 'Importing comparison context does not create a trip');
    } finally { h.dispose(); }
  }
  const mismatch = shared.costHarness({ activeTrip: { tripId: 'fixture-mismatch', title: 'Comparison', city: 'București', countryCode: 'FR', startDate: '2027-02-10', endDate: '2027-02-14' } });
  try { mismatch.tap(mismatch.labels.useTrip); assert.equal(mismatch.queryValue(), ''); assert.match(mismatch.text(), /No researched prices for this city/); assert.equal(mismatch.intents.length, 0); } finally { mismatch.dispose(); }
});

test('Name sorting and quick picks use the same approved language labels as their budget cards', () => {
  const { BUDGET_CITY_LABELS, budgetCityLabel } = shared.load('mobile/src/data/budgetCityLabels.ts');
  for (const locale of ['tr', 'en', 'sq', 'ro']) {
    const h = shared.costHarness({ locale });
    try {
      for (const id of ['FR-paris', 'IT-rome', 'AL-tirana']) {
        h.query(''); const label = BUDGET_CITY_LABELS[id][locale]; h.tap(label);
        assert.equal(h.queryValue(), label); assert.deepEqual(ids(h), [id]); assert.equal(h.rowName(rows(h)[0]), label);
      }
      h.query('');
      const sort = elements(h.nodes().find(node => node.props.className === 'budget-results-sort')).find(node => node.type === 'select');
      sort.props.onChange({ target: { value: 'name' } }); h.render();
      const expected = Array.from(h.benchmarks.CITY_BENCHMARKS, row => budgetCityLabel(row, locale)).sort((a, b) => a.localeCompare(b, locale)).slice(0, 8);
      assert.deepEqual(Array.from(rows(h), row => h.rowName(row)), expected);
    } finally { h.dispose(); }
  }
});

test('Localized budget snapshots match the same saved city across Romanian/Albanian without hiding real city, country or date changes', () => {
  const h = shared.costHarness();
  try {
    const { budgetTripContext } = shared.load('mobile/src/lib/budgetTripContext.ts', {
      '../../../lib/country-intelligence/city-benchmarks': h.benchmarks,
      './searchText': shared.load('mobile/src/lib/searchText.ts'),
    });
    const row = h.benchmarks.CITY_BENCHMARKS.find(row => row.id === 'RO-bucharest');
    const preferences = { ...h.personal.DEFAULT_PERSONAL_BUDGET, startDate: '2027-02-10', endDate: '2027-02-12' };
    for (const [budgetName, tripName] of [['București', 'Bukuresht'], ['Bukuresht', 'București'], ['Bucharest', 'Bukuresht']]) {
      const snapshot = h.intentModule.createPersonalBudgetCockpitIntent(row, preferences, 'GBP', null, 'fixture-owner', budgetName);
      assert.equal(h.intentModule.validateBudgetCockpitIntent(snapshot), true);
      const original = JSON.stringify(snapshot);
      const trip = { destinationCode: 'RO', destinationCity: tripName, startDate: preferences.startDate, endDate: preferences.endDate };
      const context = budgetTripContext(snapshot, trip);
      assert.deepEqual({ ...context }, { country: false, city: false, days: false, dates: false, tripDays: 3, differs: false });
      const city = budgetTripContext(snapshot, { ...trip, destinationCity: 'Paris' });
      assert.equal(city.city, true); assert.equal(city.country, false); assert.equal(city.differs, true);
      const country = budgetTripContext(snapshot, { ...trip, destinationCode: 'FR' });
      assert.equal(country.country, true); assert.equal(country.city, false); assert.equal(country.differs, true);
      const both = budgetTripContext(snapshot, { ...trip, destinationCity: 'Tirana', destinationCode: 'AL' });
      assert.equal(both.country, true); assert.equal(both.city, true); assert.equal(both.differs, true);
      const dates = budgetTripContext(snapshot, { ...trip, startDate: '2027-02-11' });
      assert.equal(dates.city, false); assert.equal(dates.days, true); assert.equal(dates.dates, true); assert.equal(dates.differs, true);
      assert.equal(JSON.stringify(snapshot), original, 'Context comparisons never recalculate or mutate saved amounts');
    }
  } finally { h.dispose(); }
});
