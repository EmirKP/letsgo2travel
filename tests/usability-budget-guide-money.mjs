import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Reuse the executable real-component fixtures without registering their suites.
function fixture(file, names) {
  let setup = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, setup, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const globals = { Date, Intl, URL, URLSearchParams, console, process, setTimeout, clearTimeout, setImmediate, TextEncoder, AbortController, Event, crypto: globalThis.crypto };
  for (const statement of [...source.statements].reverse()) if (ts.isImportDeclaration(statement)) {
    const moduleName = statement.moduleSpecifier.text;
    const imported = moduleName === 'node:test' ? { default: () => {} } : require(moduleName);
    const clause = statement.importClause;
    if (clause?.name) globals[clause.name.text] = imported.default ?? imported;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const member of clause.namedBindings.elements) globals[member.name.text] = imported[member.propertyName?.text || member.name.text];
    setup = setup.slice(0, statement.pos) + setup.slice(statement.end);
  }
  setup = setup.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(resolve(file)).href));
  const output = { exports: {} };
  const code = ts.transpileModule(`${setup}\nmodule.exports={${names.join(',')}};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(module,exports){${code}\n})`, globals, { filename: `${file}:fixture` })(output, output.exports);
  return output.exports;
}

const { costHarness } = fixture('tests/planning-ux.mjs', ['costHarness']);

test('An incomplete budget date cannot be confirmed; clearing dates restores the selected day count in every locale', () => {
  for (const locale of ['tr', 'en', 'sq']) {
    const h = costHarness({ locale, preferences: { days: '5' } });
    try {
      h.query('Paris'); h.tap(h.labels.dates); h.change(h.labels.departure, '2026-11-01');
      assert.equal(h.field(h.labels.days).props.disabled, true);
      const done = h.findButton(h.labels.done);
      assert.equal(done.props.disabled, true);
      done.props.onClick(); h.render();
      assert.ok(h.openSheet(), 'Even a stale/programmatic click cannot confirm invalid dates');
      assert.equal(h.findButton(h.labels.show).props.disabled, true);
      h.tap(h.labels.clearDates);
      assert.equal(h.field(h.labels.days).props.disabled, false);
      assert.equal(h.field(h.labels.days).props.value, '5');
      assert.equal(h.findButton(h.labels.done).props.disabled, false);
      h.tap(h.labels.done);
      assert.equal(h.openSheet(), undefined);
      assert.equal(h.findButton(h.labels.show).props.disabled, false);
      assert.match(h.summary(h.labels.dates), /5/);
    } finally { h.dispose(); }
  }
});

test('Cancel restores the previous duration when its date editor contains invalid values', () => {
  const h = costHarness({ preferences: { days: '7', adults: '3', rooms: '2' } });
  try {
    h.query('Paris'); const initialRange = h.range(h.rows()[0]);
    h.tap(h.labels.dates); h.change(h.labels.departure, '2026-11-01');
    assert.equal(h.findButton(h.labels.done).props.disabled, true);
    h.close();
    assert.equal(h.findButton(h.labels.show).props.disabled, false);
    assert.equal(h.range(h.rows()[0]), initialRange);
    assert.match(h.summary(h.labels.dates), /7 days/);
  } finally { h.dispose(); }
});

test('An invalid party cannot be confirmed and closing restores the last usable budget in every locale', () => {
  for (const locale of ['tr', 'en', 'sq']) for (const [field, value] of [['adults', '0'], ['adults', '21'], ['children', ''], ['children', '19'], ['rooms', '0'], ['rooms', '']]) {
    const h = costHarness({ locale, preferences: { adults: '3', children: '1', rooms: '2', days: '5' } });
    try {
      h.query('Paris'); const originalRange = h.range(h.rows()[0]);
      h.tap(h.labels.party); h.change(h.labels[field], value);
      const done = h.findButton(h.labels.done);
      assert.equal(done.props.disabled, true, `${locale}: invalid ${field} cannot be confirmed`);
      done.props.onClick(); h.render(); assert.ok(h.openSheet(), 'A stale/programmatic click also keeps the editor open');
      h.close();
      assert.equal(h.findButton(h.labels.show).props.disabled, false);
      assert.equal(h.range(h.rows()[0]), originalRange);
      h.tap(h.labels.party);
      assert.equal(h.field(h.labels.adults).props.value, '3');
      assert.equal(h.field(h.labels.children).props.value, '1');
      assert.equal(h.field(h.labels.rooms).props.value, '2');
      assert.equal(h.saved.at(-1).value.adults, '3');
      assert.equal(h.saved.at(-1).value.children, '1');
      assert.equal(h.saved.at(-1).value.rooms, '2');
    } finally { h.dispose(); }
  }
});

test('Party validation stays scoped when another budget section is incomplete and valid corrections can be confirmed', () => {
  const h = costHarness({ preferences: { startDate: '2027-07-01', endDate: '', adults: '2', rooms: '1' } });
  try {
    h.tap(h.labels.party); h.change(h.labels.adults, '');
    assert.equal(h.findButton(h.labels.done).props.disabled, true);
    const sheetText = JSON.stringify(h.openSheet());
    assert.match(sheetText, /Enter at least 1 adult/);
    h.change(h.labels.adults, '3'); h.change(h.labels.rooms, '2');
    assert.equal(h.findButton(h.labels.done).props.disabled, false, 'Unfinished dates do not trap a valid party editor');
    h.tap(h.labels.done); assert.equal(h.openSheet(), undefined);
    h.tap(h.labels.party); assert.equal(h.field(h.labels.adults).props.value, '3'); assert.equal(h.field(h.labels.rooms).props.value, '2');
  } finally { h.dispose(); }
});

test('A hostel or a day trip does not require unused room fields to confirm the party', () => {
  for (const preferences of [{ accommodation: 'hostel', rooms: '' }, { days: '1', rooms: '' }]) {
    const h = costHarness({ preferences });
    try { h.tap(h.labels.party); assert.equal(h.findButton(h.labels.done).props.disabled, false); h.tap(h.labels.done); assert.equal(h.openSheet(), undefined); }
    finally { h.dispose(); }
  }
});

const { modules, existingHarness } = fixture('tests/17-visa-money-profile.mjs', ['modules', 'existingHarness']);
const { host, nodes, text } = existingHarness('tests/auth-profile-regressions.mjs', ['host', 'nodes', 'text']);

function passportHarness(activeTrip = null) {
  const h = host(), opened = [];
  const jsx = (type, props, key) => ({ type, props, key });
  const load = modules({
    react: { ...h.react, useDeferredValue: value => value, lazy: () => 'PassportWorldMap', Suspense: 'Suspense' },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../lib/i18n': { useI18n: () => ({ locale: 'tr', copy: tr => tr, countryName: (_, name) => name }) },
    '../hooks/usePassportPreference': { usePassportPreference: () => ({ country: 'TR', type: 'ordinary', setPreference: () => true }) },
    '../lib/activeTripContext': { useActiveTripContext: () => activeTrip },
    '../hooks/useCurrentTime': { useCurrentTime: () => Date.parse('2026-10-27T12:00:00Z') },
    '../lib/countryIntelligence': { useAdvisories: () => [] },
    '../components/CountryPicker': { CountryPicker: 'CountryPicker' },
    '../components/CountryFlag': { CountryFlag: 'CountryFlag' },
    '../components/Icon': { Icon: 'Icon' }, '../components/Sheet': { Sheet: 'Sheet' },
    '../components/CountryAdvisory': { CountryAdvisory: 'CountryAdvisory', CountryRiskBadge: 'CountryRiskBadge' },
    '../lib/native': { openExternal: () => true },
  });
  const { PassportScreen } = load('mobile/src/screens/PassportScreen.tsx');
  const render = () => h.render(() => PassportScreen({ onOpenCountryNews: code => opened.push(code) }));
  return {
    render, opened, dispose: () => h.dispose(),
    query(value) { nodes(render()).find(n => n.type === 'input' && n.props.id === 'passport-country-search').props.onChange({ target: { value } }); return render(); },
    advice() { return nodes(render()).find(n => n.props.className?.split(' ').includes('passport-advice-link')); },
    openSheet() { return nodes(render()).find(n => n.type === 'Sheet' && n.props.open); },
  };
}

test('Visa advice keeps the sole searched destination even when a visa filter hides its result', () => {
  const h = passportHarness({ countryCode: 'JP' });
  try {
    h.query('Fransa');
    nodes(h.render()).find(n => n.type === 'button' && text(n) === 'Vizesiz').props.onClick();
    assert.ok(text(h.advice()).includes('Fransa'));
    h.advice().props.onClick();
    assert.deepEqual(h.opened, ['FR']);
  } finally { h.dispose(); }
});

test('Visa advice uses the active destination without a query and asks for a country when context is absent or ambiguous', () => {
  const active = passportHarness({ countryCode: 'JP' });
  try { active.advice().props.onClick(); assert.deepEqual(active.opened, ['JP']); } finally { active.dispose(); }
  for (const query of ['', 'Güney']) {
    const h = passportHarness(query ? { countryCode: 'JP' } : null);
    try {
      h.query(query); h.advice().props.onClick();
      assert.deepEqual(h.opened, [], 'No destination is silently replaced with Turkey');
      const picker = nodes(h.openSheet()).find(n => n.type === 'CountryPicker');
      assert.equal(picker.props.value, '');
      assert.ok(picker.props.options.some(option => option.code === 'FR'));
      picker.props.onChange('FR'); h.render();
      assert.deepEqual(h.opened, ['FR']); assert.equal(h.openSheet(), undefined);
    } finally { h.dispose(); }
  }
});
