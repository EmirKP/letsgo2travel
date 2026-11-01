import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const plain = value => JSON.parse(JSON.stringify(value));
const airport = (iata, city, country, countryCode) => ({ iata, name: `${city} airport`, city, country, countryCode });
const previousDraft = () => ({
  form: { origin: 'Istanbul', days: '5 gün', dayCount: 5, month: 'Kasım', budget: 'Orta', tier: 'balanced',
    party: { adults: 1, children: 0, childAges: [] }, currency: 'TRY', accommodation: 'Otel', who: 'Tek başıma',
    tempo: 'Dengeli', vibe: ['Şehir'], visa: 'Vizesiz veya kolay giriş', mode: 'fixed',
    destination: { code: 'CDG', name: 'Paris', country: 'France', countryCode: 'FR' } },
  origin: airport('IST', 'Istanbul', 'Türkiye', 'TR'), destination: airport('CDG', 'Paris', 'France', 'FR'), locale: 'ro',
});
const cityArea = { latitude: 35.6762, longitude: 139.6503, name: 'Tokyo' };
const recovered = { data: { summary: 'Recovered Paris result', routes: [{ name: 'Paris', country: 'France', destinationCode: 'CDG', cityOrRegion: 'Paris',
  why: 'A previous request', visaStatus: 'Check entry rules', estimatedBudget: 'Balanced', idealDuration: '5 days', bestFor: 'Culture',
  transportEase: 'Public transport', scores: { overall: 80 }, dailyPlan: ['Day 1: Paris walk'], warnings: [] }] } };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture({ owner = 'owner-a', explicit = true, oldDraft = previousDraft(), pendingHandoff = null, strict = false, result = recovered } = {}) {
  const require = createRequire(import.meta.url), file = 'tests/planning-ux.mjs';
  let setup = readFileSync(file, 'utf8');
  const draftBytes = new Map(oldDraft ? [['owner-a', JSON.stringify(oldDraft)]] : []);
  const receiptBytes = new Map(oldDraft ? [['owner-a', 'SYNTHETIC_PENDING_RECEIPT_A']] : []);
  const handoffBytes = new Map(pendingHandoff ? [['owner-a', JSON.stringify(pendingHandoff)]] : []);
  const claims = [], recoveryChecks = [], generated = [], draftWrites = [], quotaChecks = [];
  const overrides = {
    '../lib/api': {
      hasPendingRoutePlan: id => receiptBytes.has(id),
      hasRoutePlanRecovery: async (input, locale, id) => {
        recoveryChecks.push({ input: plain(input), locale, owner: id });
        return receiptBytes.has(id) && JSON.stringify(input) === JSON.stringify(JSON.parse(draftBytes.get(id)).form);
      },
      generateRoutePlan: async (input, locale, options) => {
        generated.push({ input: plain(input), locale, owner: options.ownerId, signal: options.signal });
        return result;
      },
    },
    '../lib/plannerSignInDraft': {
      readPlannerRecoveryDraft: id => draftBytes.has(id) ? JSON.parse(draftBytes.get(id)) : null,
      takePlannerSignInDraft: id => { claims.push(id); const raw = handoffBytes.get(id); handoffBytes.delete(id); return raw ? JSON.parse(raw) : null; },
      savePlannerRecoveryDraft: (id, value) => { draftWrites.push({ owner: id, value: plain(value) }); draftBytes.set(id, JSON.stringify(value)); },
      preparePlannerSignInDraft() { throw Error('These signed-in fixtures must not create a guest handoff'); },
    },
    '../lib/journeyPlanClient': { loadJourneyPlanQuota: async () => {
      quotaChecks.push(owner);
      return { limit: 3, used: 3, remaining: 0, pending: true, resetAt: new Date(Date.now() + 3600_000).toISOString(), timeZone: 'UTC' };
    } },
  };
  const startProps = { ownerId: owner, accessToken: `UNIT_TEST_ONLY_${owner}`, ...(explicit ? { mapRequestId: 12, placeArea: cityArea } : {}) };
  const globals = { Date, Intl, URL, URLSearchParams, console, process, setTimeout, clearTimeout, setImmediate, Event, EventTarget, AbortController, Error,
    fixtureImports: overrides, fixtureProps: startProps };
  const source = ts.createSourceFile(file, setup, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of [...source.statements].reverse()) if (ts.isImportDeclaration(statement)) {
    const imported = statement.moduleSpecifier.text === 'node:test' ? { default: () => {} } : require(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (clause?.name) globals[clause.name.text] = imported.default ?? imported;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const member of clause.namedBindings.elements) globals[member.name.text] = imported[member.propertyName?.text || member.name.text];
    setup = setup.slice(0, statement.pos) + setup.slice(statement.end);
  }
  const output = { exports: {} };
  const code = ts.transpileModule(`${setup}\nconst baseLoad=load;load=(file,imports={},env={})=>{if(file!=='mobile/src/screens/RouteAssistantScreen.tsx')return baseLoad(file,imports,env);const actual=baseLoad(file,{...imports,...fixtureImports},env);return{...actual,RouteAssistantScreen:props=>actual.RouteAssistantScreen({...props,...fixtureProps})};};module.exports={plannerHarness,find,button,nodes,text};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(module,exports){${code}\n})`, globals)(output, output.exports);
  const { plannerHarness, find, button, nodes, text } = output.exports;
  const h = plannerHarness({ seeded: false, placeName: explicit ? 'Tokyo' : '', keepMapOpen: true, strict });
  const view = () => h.host.render();
  const closeMap = () => { const sheet = find(view(), 'Sheet', props => props.title === 'Plan on the map'); assert.ok(sheet); sheet.props.onClose(); };
  const openAlternative = () => { const action = button(view(), 'Help me choose a destination'); if (action) action.props.onClick(); };
  return { ...h, view, find, button, nodes, text, generated, claims, recoveryChecks, draftBytes, receiptBytes, handoffBytes, draftWrites, quotaChecks, closeMap, openAlternative };
}

for (const strict of [false, true]) test(`Explicit city intent opens Tokyo instead of pending Paris without consuming private drafts (StrictMode=${strict})`, () => {
  const h = fixture({ strict, pendingHandoff: previousDraft() });
  try {
    const view = h.view();
    assert.ok(h.find(view, 'Sheet', props => props.title === 'Plan on the map'), 'The newly selected city must open its map planner');
    const map = h.find(view, 'LazyComponent', props => props.initialCity === 'Tokyo');
    assert.ok(map); assert.deepEqual(plain(map.props.initialArea), cityArea); assert.equal(map.props.ownerId, 'owner-a');
    assert.ok(h.nodes(view).filter(node => node.type === 'AirportField').every(node => !node.props.value));
    assert.equal(h.generated.length, 0); assert.equal(h.saves.length, 0); assert.equal(h.quotaChecks.length, 0);
    assert.deepEqual(h.claims, []); assert.equal(h.draftWrites.length, 0);
    assert.equal(h.draftBytes.get('owner-a'), JSON.stringify(previousDraft()));
    assert.equal(h.handoffBytes.get('owner-a'), JSON.stringify(previousDraft()));
    assert.equal(h.receiptBytes.get('owner-a'), 'SYNTHETIC_PENDING_RECEIPT_A');
  } finally { h.host.dispose(); }
});

test('Ordinary planner entry still restores the same-owner recovery form without making an AI request', () => {
  const h = fixture({ explicit: false });
  try {
    const view = h.view(); assert.equal(h.find(view, 'Sheet'), undefined);
    assert.deepEqual(plain(h.nodes(view).filter(node => node.type === 'AirportField').map(node => node.props.value?.city)), ['Istanbul', 'Paris']);
    assert.ok(h.button(view, 'Recover my previous result')); assert.equal(h.generated.length, 0); assert.equal(h.draftWrites.length, 0);
  } finally { h.host.dispose(); }
});

test('An ordinary sign-in handoff still resumes once in StrictMode when there is no new city intent', () => {
  const h = fixture({ explicit: false, strict: true, oldDraft: null, pendingHandoff: previousDraft() });
  try {
    const view = h.view();
    assert.equal(h.find(view, 'Sheet'), undefined);
    assert.deepEqual(plain(h.nodes(view).filter(node => node.type === 'AirportField').map(node => node.props.value?.city)), ['Istanbul', 'Paris']);
    assert.deepEqual(h.claims, ['owner-a']); assert.equal(h.handoffBytes.has('owner-a'), false);
    assert.equal(h.generated.length, 0); assert.equal(h.draftWrites.length, 0);
  } finally { h.host.dispose(); }
});

test('City entry retains explicit same-owner manual recovery with its original locale even with no new allowance', async () => {
  const h = fixture();
  try {
    h.closeMap(); h.openAlternative(); await tick(); let view = h.view(); await tick(); view = h.view();
    const action = h.button(view, 'Recover my previous result'); assert.ok(action); assert.equal(action.props.disabled, false);
    action.props.onClick(); action.props.onClick(); await tick(); view = h.view();
    assert.equal(h.generated.length, 1, 'Only the deliberate recovery click requests a result; double tap cannot duplicate it');
    assert.deepEqual(h.generated[0].input, previousDraft().form); assert.equal(h.generated[0].locale, 'ro'); assert.equal(h.generated[0].owner, 'owner-a');
    assert.equal(h.recoveryChecks.length, 1); assert.equal(h.recoveryChecks[0].owner, 'owner-a');
    assert.match(h.text(view), /Recovered Paris result/); assert.equal(h.saves.length, 0);
    assert.equal(h.receiptBytes.get('owner-a'), 'SYNTHETIC_PENDING_RECEIPT_A');
  } finally { h.host.dispose(); }
});

for (const outcome of ['success', 'failure']) test(`An obsolete ${outcome} after a new-city remount cannot replace Tokyo or start another request`, async () => {
  let resolve, reject; const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const old = fixture({ explicit: false, result: pending }); let current;
  try {
    await tick(); let view = old.view(); await tick(); view = old.view();
    old.button(view, 'Recover my previous result').props.onClick(); await tick();
    assert.equal(old.generated.length, 1); old.host.dispose();
    assert.equal(old.generated[0].signal.aborted, true, 'The real request signal is aborted on the App-style remount');
    current = fixture();
    if (outcome === 'success') resolve(recovered); else reject(Error('Obsolete provider failure'));
    await tick(); const next = current.view();
    assert.ok(current.find(next, 'Sheet', props => props.title === 'Plan on the map'));
    assert.ok(current.find(next, 'LazyComponent', props => props.initialCity === 'Tokyo'));
    assert.doesNotMatch(current.text(next), /Recovered Paris result|Obsolete provider failure/);
    assert.equal(current.generated.length, 0); assert.equal(current.saves.length, 0); assert.equal(current.draftWrites.length, 0);
  } finally { old.host.dispose(); current?.host.dispose(); }
});

test('A different owner cannot inherit or recover the previous owner Paris draft or sign-in claim', () => {
  const h = fixture({ owner: 'owner-b', pendingHandoff: previousDraft() });
  try {
    assert.ok(h.find(h.view(), 'LazyComponent', props => props.initialCity === 'Tokyo' && props.ownerId === 'owner-b'));
    h.closeMap(); h.openAlternative(); const view = h.view();
    assert.equal(h.button(view, 'Recover my previous result'), undefined);
    assert.ok(h.nodes(view).filter(node => node.type === 'AirportField').every(node => !node.props.value));
    assert.equal(h.draftBytes.get('owner-a'), JSON.stringify(previousDraft())); assert.equal(h.handoffBytes.get('owner-a'), JSON.stringify(previousDraft()));
    assert.equal(h.generated.length, 0); assert.equal(h.draftWrites.length, 0); assert.deepEqual(h.claims, []);
  } finally { h.host.dispose(); }
});
