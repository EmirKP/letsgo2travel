import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(filename) {
  let full = path.resolve(filename); if (!existsSync(full)) full += '.ts';
  if (cache.has(full)) return cache.get(full);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Date, URL })(name => load(path.resolve(path.dirname(full), name)), module, module.exports);
  cache.set(full, module.exports); return module.exports;
}
const budgets = load('mobile/src/lib/budgetCockpitIntent.ts');
const routes = load('mobile/src/lib/routeCockpitIntent.ts');
const { DEFAULT_PERSONAL_BUDGET } = load('lib/country-intelligence/personal-budget.ts');
const row = load('lib/country-intelligence/city-benchmarks.ts').CITY_BENCHMARKS.find(row => row.city.en === 'Paris');
const { budgetTripContext } = load('mobile/src/lib/budgetTripContext.ts');
const preferences = () => ({ ...DEFAULT_PERSONAL_BUDGET, startDate: '2027-02-10', endDate: '2027-02-14' });
const budget = () => budgets.createPersonalBudgetCockpitIntent(row, preferences(), 'GBP', null, 'audit-owner');

function prepare(intent, busy = false) {
  const filename = 'mobile/src/screens/CockpitScreen.tsx';
  const tree = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  const visit = node => { if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node); ts.forEachChild(node, visit); };
  visit(tree);
  const snippet = `const EMPTY_FORM = ${declarations.get('EMPTY_FORM').initializer.getText(tree)}; const prepare = ${declarations.get('prepareJourneyTrip').initializer.getText(tree)};`;
  let form;
  const context = { userId: 'audit-owner', busy, loading: false,
    validJourneyIntent: (value, owner) => value.ownerId === owner && (value.kind === 'city-budget' ? budgets.validateBudgetCockpitIntent(value) : routes.validateRouteCockpitIntent(value)),
    journeyCountry: () => ({ alpha3: 'FRA', name: 'France' }), alpha2FromAlpha3: () => 'FR', countryName: (_, name) => name,
    setForm: value => { form = value; }, setMatchedFlight() {}, setManualFlight() {}, setFormOpen() {}, setError() {},
    window: { requestAnimationFrame() {} },
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(`${snippet}\nprepare(input);`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, Object.assign(context, { input: intent }));
  return form;
}

test('Dated personal budget pre-fills the new trip without altering its snapshot; undated budget stays undated', () => {
  const intent = budget(); assert.ok(intent);
  const before = JSON.stringify(intent);
  const form = prepare(intent);
  assert.equal(form.destinationCity, row.city.en);
  assert.equal(form.startDate, '2027-02-10'); assert.equal(form.endDate, '2027-02-14');
  assert.equal(JSON.stringify(intent), before);
  const undated = budgets.createBudgetCockpitIntent(row, 3, 2, 'GBP', null, 'audit-owner');
  assert.equal(prepare(undated).startDate, ''); assert.equal(prepare(undated).endDate, '');
  assert.equal(prepare(intent, true), undefined, 'An in-flight save still fences a new form');
});

test('Saved-route dates and ownership guards remain intact', () => {
  const saved = { id: 'route-a', createdAt: '2026-10-01T00:00:00Z', plan: { summary: 'Paris', routes: [{ name: 'Paris', country: 'France', cityOrRegion: 'Paris', dailyPlan: ['Museum'], warnings: [], idealDuration: '1 day', estimatedBudget: 'Estimate' }] } };
  const intent = routes.createRouteCockpitIntent(saved, 0, 'audit-owner');
  intent.dates = { startDate: '2027-02-10', endDate: '2027-02-14' };
  assert.equal(prepare(intent).startDate, '2027-02-10'); assert.equal(prepare(intent).endDate, '2027-02-14');
  assert.equal(prepare({ ...intent, ownerId: 'other-owner' }), undefined);
});

test('Budget context warning detects destination, duration and date differences while preserving saved prices', () => {
  const intent = budget();
  const same = { destinationCode: 'FR', destinationCity: row.city.tr, startDate: '2027-02-10', endDate: '2027-02-14' };
  assert.equal(budgetTripContext(intent, same).differs, false, 'Translated names of the source city are accepted');
  const before = JSON.stringify(intent);
  assert.equal(budgetTripContext(intent, { ...same, destinationCode: 'IT', destinationCity: 'Roma' }).country, true);
  assert.equal(budgetTripContext(intent, { ...same, destinationCity: 'Lyon' }).city, true);
  assert.equal(budgetTripContext(intent, { ...same, endDate: '2027-02-15' }).days, true);
  assert.equal(budgetTripContext(intent, { ...same, startDate: '2027-03-10', endDate: '2027-03-14' }).dates, true);
  assert.equal(JSON.stringify(intent), before, 'Comparing context never rewrites the estimate or FX snapshot');
});
