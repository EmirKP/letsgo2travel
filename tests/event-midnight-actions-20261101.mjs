import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

function fixture({ deviceDay = '2026-11-01', now = '2026-10-31T21:30:00Z' } = {}) {
  const require = createRequire(import.meta.url), file = 'tests/ux14-community-events.mjs';
  const instant = Date.parse(now);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  const localDay = offset => new Date(Date.parse(`${deviceDay}T12:00:00Z`) + offset * 86400_000).toISOString().slice(0, 10);
  let setup = readFileSync(file, 'utf8');
  const globals = { Date: Clock, Intl, URL, URLSearchParams, Request, Response, Headers, AbortSignal, console, process,
    setTimeout, clearTimeout, setImmediate, frozenLocalDay: localDay };
  const source = ts.createSourceFile(file, setup, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of [...source.statements].reverse()) if (ts.isImportDeclaration(statement)) {
    const imported = statement.moduleSpecifier.text === 'node:test' ? { default: () => {} } : require(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (clause?.name) globals[clause.name.text] = imported.default ?? imported;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const member of clause.namedBindings.elements) globals[member.name.text] = imported[member.propertyName?.text || member.name.text];
    setup = setup.slice(0, statement.pos) + setup.slice(statement.end);
  }
  setup = setup.replaceAll('import.meta.url', JSON.stringify(new URL('./ux14-community-events.mjs', import.meta.url).href));
  // Freeze the actual component clock and the device's local day independently.
  // Tests therefore cover offset boundaries on every CI host timezone.
  setup = `const baseLoad=load;load=(file,imports={},environment={})=>{const actual=baseLoad(file,imports,environment);return file==='mobile/src/lib/dates.ts'?{...actual,localIsoDate:frozenLocalDay}:actual;};\n${setup}\nmodule.exports={eventsHarness,uiEvent,nodes,text};`;
  const output = { exports: {} };
  const code = ts.transpileModule(setup, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(module,exports){${code}\n})`, globals)(output, output.exports);
  const { eventsHarness, uiEvent, nodes, text } = output.exports;
  const event = (extra = {}) => uiEvent('curated:midnight', '2026-10-31T23:30:00Z', { localDate: '2026-10-31', timeZone: 'UTC', ...extra });
  function detail(value, owner = null, trips = []) {
    const h = eventsHarness(undefined, { initialOwner: owner, initialSaved: [value], trips });
    const pending = [];
    const view = h.render({ focusEventId: value.id, onTripIntentPending: item => pending.push(item) });
    const sheet = nodes(view).find(node => node.type === 'Sheet' && node.props.open && node.props.title === 'Event details');
    assert.ok(sheet);
    const action = label => nodes(sheet).find(node => node.type === 'button' && text(node).trim() === label);
    return { h, action, pending };
  }
  return { event, detail, nodes, text };
}

test('Future exact UTC events retain trip and reminder actions after the device crosses midnight', async () => {
  const f = fixture(), value = f.event(), { h, action, pending } = f.detail(value);
  try {
    assert.ok(action('Add to trip')); assert.equal(action('Remind me').props.disabled, false);
    action('Add to trip').props.onClick(); await h.settle();
    assert.equal(h.accountOpens, 1); assert.equal(pending[0].id, value.id); assert.equal(h.tripLists.length, 0); assert.equal(h.attachments.length, 0);
  } finally { h.dispose(); }
});

test('The signed-in trip picker uses the event day rather than silently changing it to the device day', async () => {
  const f = fixture(); const trip = { id: 'prior-local-day-trip', title: 'UTC visit', destinationCity: 'Paris', destinationCountry: 'France',
    startDate: '2026-10-31', endDate: '2026-10-31', status: 'active', checklistItems: [] };
  const { h, action } = f.detail(f.event(), 'a', [trip]);
  try {
    action('Add to trip').props.onClick(); const view = await h.settle();
    const picker = f.nodes(view).find(node => node.type === 'Sheet' && node.props.open && node.props.title === 'Add event to trip');
    assert.ok(picker); const choice = f.nodes(picker).find(node => node.type === 'button' && f.text(node).includes('Paris'));
    assert.ok(choice); assert.equal(choice.props.disabled, false, 'The UTC event still belongs to October31 for trip-date compatibility');
    assert.equal(h.tripLists.length, 1); assert.equal(h.attachments.length, 0, 'Opening the picker does not attach an event');
  } finally { h.dispose(); }
});

test('A future-looking local date cannot make a past exact event addable on a device behind its timezone', () => {
  const f = fixture({ deviceDay: '2026-10-31' });
  const { h, action } = f.detail(f.event({ startsAt: '2026-10-31T19:30:00Z', localDate: '2026-11-01', timeZone: 'Asia/Tokyo' }));
  try { assert.equal(action('Add to trip'), undefined); assert.equal(action('Remind me'), undefined); }
  finally { h.dispose(); }
});

test('An ongoing exact event with a valid future end remains addable but cannot receive a past-start reminder', () => {
  const f = fixture(); const { h, action } = f.detail(f.event({ startsAt: '2026-10-31T20:30:00Z', endsAt: '2026-10-31T22:30:00Z' }));
  try { assert.ok(action('Add to trip')); assert.equal(action('Remind me').props.disabled, true); }
  finally { h.dispose(); }
});

for (const endsAt of ['2026-10-31T21:00:00Z', '2026-10-31T19:00:00Z', 'not-a-date']) test(`An elapsed or invalid end cannot revive a past exact event: ${endsAt}`, () => {
  const f = fixture({ deviceDay: '2026-10-31' }); const { h, action } = f.detail(f.event({ startsAt: '2026-10-31T20:30:00Z', endsAt }));
  try { assert.equal(action('Add to trip'), undefined); }
  finally { h.dispose(); }
});

for (const [day, enabled] of [['2026-10-31', false], ['2026-11-01', true], ['2026-11-02', true]]) test(`Date-only event policy remains based on its day: ${day}`, () => {
  const f = fixture(); const { h, action } = f.detail(f.event({ startsAt: day, localDate: day, timeZone: null, timePrecision: 'date' }));
  try { assert.equal(Boolean(action('Add to trip')), enabled); if (enabled) assert.equal(action('Remind me').props.disabled, true); }
  finally { h.dispose(); }
});

for (const status of ['cancelled', 'postponed']) test(`Future exact event actions retain the ${status} status policy`, () => {
  const f = fixture(); const { h, action } = f.detail(f.event({ status }));
  try { assert.equal(Boolean(action('Add to trip')), status === 'postponed'); if (status === 'postponed') assert.equal(action('Remind me').props.disabled, true); }
  finally { h.dispose(); }
});
