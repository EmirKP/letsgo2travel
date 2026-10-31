import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// Reuse the existing executable hooks/JSX fixture without registering its tests.
// The component under test is still loaded from the current application source.
function fixture(file, names, importsByFile = {}) {
  const require = createRequire(import.meta.url);
  let setup = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, setup, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const globals = { Date, Intl, URL, URLSearchParams, console, process, setTimeout, clearTimeout, setImmediate, Event, EventTarget, TextEncoder, AbortController, AbortSignal, Error, crypto: globalThis.crypto, importsByFile };
  for (const statement of [...source.statements].reverse()) if (ts.isImportDeclaration(statement)) {
    const imported = statement.moduleSpecifier.text === 'node:test' ? { default: () => {} } : require(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (clause?.name) globals[clause.name.text] = imported.default ?? imported;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const member of clause.namedBindings.elements) globals[member.name.text] = imported[member.propertyName?.text || member.name.text];
    setup = setup.slice(0, statement.pos) + setup.slice(statement.end);
  }
  setup = setup.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(resolve(file)).href));
  const output = { exports: {} };
  const code = ts.transpileModule(`${setup}\nconst originalFixtureLoad=load; load=(file,imports={},environment={})=>originalFixtureLoad(file,{...imports,...importsByFile[file]},environment);\nmodule.exports={${names.join(',')}};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(module,exports){${code}\n})`, globals, { filename: `${file}:overnight-fixture` })(output, output.exports);
  return output.exports;
}

const { hooks, load, find, button, text, tick } = fixture('tests/active-trip-shared-flow.mjs', ['hooks', 'load', 'find', 'button', 'text', 'tick']);

function sharedBudgetFixture({ target = 100, expenses = [], performAction } = {}) {
  const h = hooks(), actions = [], notices = [];
  let nextId = 0;
  const language = { copy: (_tr, en) => en, locale: 'en', countryName: (_code, name) => name };
  const trip = { id: 'trip-a', title: 'Paris trip', destinationCity: 'Paris', destinationCountry: 'France', destinationCode: 'FR', startDate: '2026-10-01', endDate: '2026-10-03', status: 'upcoming', role: 'owner', memberCount: 1 };
  const workspace = { trip, myRole: 'owner', members: [{ userId: 'owner-a', name: 'Owner', role: 'owner' }], options: [], budget: { currency: 'EUR', targetAmount: target }, expenses, balances: [] };
  const imports = {
    react: h.react,
    '../lib/localeFormatting': { formatAppDate: date => date.toISOString().slice(0, 10) },
    '../lib/dates': { isCalendarDate: value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value, localIsoDate: () => '2026-10-30' },
    '../lib/i18n': { useI18n: () => language },
    '../lib/native': { shareContent: async () => true },
    '../lib/tripCollaboration': {
      listSharedTrips: async () => [trip], getTripCollaboration: async () => workspace,
      collaborationAction: async (_token, body) => { actions.push(body); return performAction ? performAction(body) : { success: true }; },
      tripInviteFromUrl: () => '', rememberTripInvite: () => {},
    },
    '../data/countries': { COUNTRY_LIST: [] },
    '../data/countryIso': { alpha2FromAlpha3: () => 'FR' },
    '../lib/supabaseData': { createCockpitTrip: () => { throw Error('No real trip creation in this fixture'); }, getSupabaseDataErrorMessage: (_error, fallback) => fallback },
    '../lib/activeTripContext': { activeTripContextFromTrip: () => null, writeActiveTripContext: () => false },
    '../lib/id': { createId: () => `request-${++nextId}` },
  };
  for (const name of ['DateTimeField', 'CountryPicker', 'Icon', 'TravelToolArtwork', 'CountryFlag', 'Sheet']) imports[`./${name}`] = { [name]: name };
  const { TripCollaborationHub } = load('mobile/src/components/TripCollaborationHub.tsx', imports, { navigator: {} });
  h.start(TripCollaborationHub, { accessToken: 'fixture-token', userId: 'owner-a', refreshKey: '', onNotice: notice => notices.push(notice) });
  return {
    h, actions, notices,
    async openBudget() {
      await tick();
      const list = find(h.render(), 'div', props => props.className === 'trip-collaboration-list');
      find(list, 'button').props.onClick();
      await tick();
      button(h.render(), 'Budget').props.onClick();
      return h.render();
    },
  };
}

test('A shared budget shows the real overrun percentage while the visual progress bar remains bounded', async () => {
  const f = sharedBudgetFixture({ expenses: [
    { id: 'e1', title: 'Dinner', amount: 11.01, currency: 'EUR', paidByName: 'Owner', spentAt: '2026-10-01', shares: [] },
    { id: 'e2', title: 'Stay', amount: 138.99, currency: 'EUR', paidByName: 'Owner', spentAt: '2026-10-01', shares: [] },
    { id: 'e3', title: 'Old USD entry', amount: 90, currency: 'USD', paidByName: 'Owner', spentAt: '2026-10-01', shares: [] },
  ] });
  try {
    const tree = await f.openBudget();
    const summary = find(tree, 'div', props => props.className === 'trip-budget-summary');
    assert.match(text(summary), /€150\.00/);
    assert.match(text(summary), /150% of €100\.00 budget/);
    const bar = find(tree, 'progress');
    assert.equal(bar.props.value, 100);
    assert.equal(bar.props.max, 100);
    assert.equal(bar.props['aria-valuetext'], '150%');
    assert.match(text(tree), /total includes only the budget currency/);
    assert.equal(f.actions.length, 0, 'Viewing totals does not write a budget or expense');
  } finally { f.h.close(); }
});

test('Below-target and undefined shared budgets retain honest percentages without division by zero', async () => {
  for (const [target, amount, percent] of [[100, 42, 42], [0, 150, 0], [100, 100, 100]]) {
    const f = sharedBudgetFixture({ target, expenses: [{ id: 'expense', title: 'Dinner', amount, currency: 'EUR', paidByName: 'Owner', spentAt: '2026-10-01', shares: [] }] });
    try {
      const tree = await f.openBudget(), bar = find(tree, 'progress');
      assert.equal(bar.props.value, Math.min(100, percent));
      assert.equal(bar.props['aria-valuetext'], `${percent}%`);
      if (!target) assert.match(text(tree), /No target budget yet/);
      assert.doesNotMatch(text(tree), /NaN|Infinity/);
    } finally { f.h.close(); }
  }
});

test('A failed shared expense keeps its details and retry identity; rapid resubmission cannot create two writes', async () => {
  let attempts = 0;
  const f = sharedBudgetFixture({ performAction: async () => { if (++attempts === 1) throw Error('Connection lost'); return { success: true }; } });
  try {
    let tree = await f.openBudget();
    find(tree, 'input', props => props['aria-label'] === 'Expense name').props.onChange({ target: { value: 'Dinner' } });
    find(tree, 'input', props => props['aria-label'] === 'Expense amount').props.onChange({ target: { value: '10.01' } });
    tree = f.h.render();
    const submit = find(tree, 'form', props => props.className === 'trip-expense-form').props.onSubmit;
    const first = submit({ preventDefault() {} });
    await submit({ preventDefault() {} });
    await first;
    tree = f.h.render();
    assert.equal(f.actions.length, 1);
    assert.equal(find(tree, 'input', props => props['aria-label'] === 'Expense name').props.value, 'Dinner');
    assert.equal(find(tree, 'input', props => props['aria-label'] === 'Expense amount').props.value, '10.01');
    await find(tree, 'form', props => props.className === 'trip-expense-form').props.onSubmit({ preventDefault() {} });
    tree = f.h.render();
    assert.equal(f.actions.length, 2);
    assert.equal(f.actions[1].clientRequestId, f.actions[0].clientRequestId);
    assert.deepEqual(JSON.parse(JSON.stringify(f.actions[1].participantIds)), ['owner-a']);
    assert.equal(f.actions[1].currency, 'EUR');
    assert.equal(find(tree, 'input', props => props['aria-label'] === 'Expense name').props.value, '');
    assert.equal(find(tree, 'input', props => props['aria-label'] === 'Expense amount').props.value, '');
  } finally { f.h.close(); }
});

test('Unreadable nested queued routes fail without clearing storage, losing tombstones or replacing the collection', () => {
  const route = { id: 'route-a', createdAt: '2026-10-30', plan: { summary: 'Saved outline', routes: [{ name: 'Paris', country: 'France', dailyPlan: ['Walk'], warnings: [] }] } };
  const valid = { 'route-a': { kind: 'save', revision: 'r1', pending: true, route }, removed: { kind: 'delete', revision: 'r2', pending: true } };
  const variants = [[null], [42], [[]], [{ name: { invalid: true } }], [{ dailyPlan: [{}] }], [{ warnings: [null] }]];
  for (const routes of variants) {
    let raw = JSON.stringify({ ...valid, 'route-a': { ...valid['route-a'], route: { ...route, plan: { ...route.plan, routes } } } });
    const before = raw, writes = [];
    const outbox = load('mobile/src/lib/routeOutbox.ts', {}, { window: { localStorage: { getItem: () => raw, setItem: (...args) => writes.push(args) }, dispatchEvent() { throw Error('Unexpected write event'); } } });
    assert.throws(() => outbox.readRouteOutbox('owner-a'), /cannot be read/);
    assert.throws(() => outbox.queueRouteSave('owner-a', route), /cannot be read/);
    assert.deepEqual(writes, []);
    assert.equal(raw, before);
    raw = JSON.stringify(valid);
    assert.equal(outbox.readRouteOutbox('owner-a').removed.kind, 'delete');
    assert.equal(outbox.readRouteOutbox('owner-a')['route-a'].route.plan.routes[0].name, 'Paris');
    // Minimal older suggestions stay compatible; missing optional display data
    // is different from a present object where the UI expects text.
    raw = JSON.stringify({ ...valid, 'route-a': { ...valid['route-a'], route: { ...route, plan: { routes: [{ name: 'Rome', country: 'Italy' }] } } } });
    assert.equal(outbox.readRouteOutbox('owner-a')['route-a'].route.plan.routes[0].name, 'Rome');
  }
});

test('Plans contains a nested queue failure locally and Read again recovers without any device writes', async () => {
  const { plansHarness, text: planText, button: planButton } = fixture('tests/audit-root-recovery-20261030.mjs', ['plansHarness', 'text', 'button']);
  const raw = JSON.stringify({ bad: { kind: 'save', revision: 'r1', pending: true, route: { id: 'bad', createdAt: '2026-10-30', plan: { routes: [null] } } } });
  const f = plansHarness({ raw, section: 'routes', cloud: [{ id: 1, clientKey: 'readable', mobileKind: 'route_plan', title: 'Readable account route', destination: 'Paris', createdAt: '2026-10-30' }] });
  try {
    let tree = await f.settle();
    assert.match(planText(tree), /On-device records could not be checked/);
    assert.doesNotMatch(planText(tree), /No saved routes yet|Readable account route/);
    assert.equal(f.raw, raw);
    assert.equal(f.writes.length, 0);
    f.raw = '{}';
    planButton(tree, 'Read again').props.onClick();
    tree = f.host.render();
    assert.doesNotMatch(planText(tree), /On-device records could not be checked/);
    assert.match(planText(tree), /Readable account route/);
    assert.equal(f.writes.length, 0);
  } finally { f.host.dispose(); }
});

test('The actual saved-route deep-link effect contains an unreadable queue before consuming its one-shot request', () => {
  const path = 'mobile/src/screens/PlansScreen.tsx';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('if (!initialRouteId) return')) callback = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback);
  let handled = 0, section = '', state = { routes: false, events: false };
  const code = ts.transpileModule(`(${callback.getText(source)})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  assert.doesNotThrow(() => vm.runInNewContext(code, {
    initialRouteId: 'bad', ownerId: 'owner-a', getSavedRoutePlans() { throw Error('Queue cannot be read'); },
    setLibraryTab: value => { section = value; }, setLocalReadError: next => { state = next(state); },
    onInitialRouteHandled: () => handled++, onNotice() { throw Error('An unreadable route must not be misreported as deleted'); },
  }));
  assert.equal(section, 'routes');
  assert.equal(state.routes, true);
  assert.equal(state.events, false);
  assert.equal(handled, 1);
});

test('The route form opens despite unreadable saved records and its explicit retry never generates or overwrites a plan', () => {
  let unreadable = true;
  const storage = { getSavedRoutePlans: () => { if (unreadable) throw Error('Unreadable saved records'); return []; }, saveRoutePlan: () => { throw Error('No save allowed in this fixture'); } };
  const { plannerHarness } = fixture('tests/planning-ux.mjs', ['plannerHarness'], { 'mobile/src/screens/RouteAssistantScreen.tsx': { '../lib/storage': storage } });
  const f = plannerHarness();
  try {
    let tree = f.host.render();
    const failure = find(tree, 'RequestFailure', props => /On-device records/.test(props.message));
    assert.ok(failure);
    assert.match(text(tree), /Rome/);
    assert.equal(f.generated.length, 0);
    assert.equal(f.saves.length, 0);
    unreadable = false;
    failure.props.onRetry(); tree = f.host.render();
    assert.equal(find(tree, 'RequestFailure', props => /On-device records/.test(props.message)), undefined);
    assert.equal(f.generated.length, 0);
    assert.equal(f.saves.length, 0);
  } finally { f.host.dispose(); }
});
