import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
function expose(file, names, extra = {}, prefix = '') {
  const require = createRequire(pathToFileURL(path.resolve(file)));
  let setup = readFileSync(file, 'utf8');
  const globals = { Date, Intl, URL, URLSearchParams, Event, EventTarget, AbortController, Error, console, process, setTimeout, clearTimeout, setImmediate, ...extra };
  const source = ts.createSourceFile(file, setup, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of [...source.statements].reverse()) if (ts.isImportDeclaration(statement)) {
    const imported = statement.moduleSpecifier.text === 'node:test' ? { default: () => {} } : require(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (clause?.name) globals[clause.name.text] = imported.default ?? imported;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const member of clause.namedBindings.elements) globals[member.name.text] = imported[member.propertyName?.text || member.name.text];
    setup = setup.slice(0, statement.pos) + setup.slice(statement.end);
  }
  setup = setup.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(path.resolve(file)).href));
  const output = { exports: {} };
  const code = ts.transpileModule(`${prefix}\n${setup}\nmodule.exports={${names.join(',')}};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(module,exports){${code}\n})`, globals)(output, output.exports);
  return output.exports;
}

const owner = 'city-map-owner';
const oldDraft = () => ({ step: 3, query: 'Paris', area: { latitude: 48.8566, longitude: 2.3522, name: 'Paris' },
  dayText: '4', dateMode: 'specific', startDate: '2027-04-12', firstDayStartTime: '14:30', party: 'family', budget: 'comfortable',
  pace: 'relaxed', walking: 'light', interests: ['culture', 'food'], notes: 'Paris museum near the Louvre' });
function storageFixture() {
  const storage = new Map(), writes = [], removals = [];
  const set = storage.set.bind(storage), remove = storage.delete.bind(storage);
  storage.set = (key, value) => { writes.push(key); return set(key, value); };
  storage.delete = key => { removals.push(key); return remove(key); };
  return { storage, writes, removals, seed: set, reset() { writes.length = 0; removals.length = 0; } };
}
function mapFixture(options = {}) {
  let request = Object.hasOwn(options, 'cityRequestId') ? options.cityRequestId : 42;
  const helpers = expose('tests/map-journey-ui.mjs', ['fixture', 'client', 'field', 'find', 'nodes', 'text', 'quotaValue', 'generated'],
    { currentCityRequest: () => request, catalogueCityNames: options.cityNames },
    `const originalLoad=load;load=(file,imports={},environment={})=>{const actual=originalLoad(file,imports,environment);return file==='mobile/src/components/MapJourneyPlanner.tsx'?{...actual,MapJourneyPlanner:props=>actual.MapJourneyPlanner({...props,cityRequestId:currentCityRequest(),cityNames:catalogueCityNames})}:actual;};`);
  const area = clone(options.initialArea || helpers.client.knownJourneyArea('Tokyo'));
  const app = helpers.fixture({ ownerId: owner, initialCity: 'Tokyo', initialArea: area, ...options });
  return { ...helpers, app, area, setRequest(value) { request = value; app.render(); } };
}
let identityCache;
function catalogIdentity() {
  if (identityCache) return identityCache;
  const { cityData } = expose('tests/planning-ux.mjs', ['cityData']);
  const file = 'mobile/src/screens/RouteAssistantScreen.tsx', text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const helper = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'cityNamesForArea'); assert.ok(helper);
  const output = { exports: {} };
  const code = ts.transpileModule(`module.exports=${helper.getText(source)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(module,exports){${code}\n})`, { cityDestinations: cityData.cityDestinations, cityDestination: cityData.cityDestination })(output, output.exports);
  identityCache = { cityData, namesForArea: output.exports }; return identityCache;
}
const recoveryKey = id => `l2t.journey-survey-recovery.v1:${encodeURIComponent(id)}`;
const receiptKey = id => `l2t.mobile.journey-operation.v1.${encodeURIComponent(id)}`;
const surveyKey = (id, scope) => `l2t.journey-survey.v1:owner:${encodeURIComponent(id)}:${encodeURIComponent(scope)}`;
function seedRecovery(memory) {
  memory.seed(recoveryKey(owner), JSON.stringify({ scope: 'city:Paris', createdAt: Date.now(), draft: oldDraft(), locale: 'ro' }));
  memory.seed(receiptKey(owner), 'SYNTHETIC_OPAQUE_RECEIPT'); memory.reset();
}

test('The actual city caller forwards its explicit request id, while ordinary route entry does not claim one', () => {
  const { fixture } = expose('tests/city-route-intent-20261101.mjs', ['fixture']);
  const city = fixture({ oldDraft: null }), ordinary = fixture({ oldDraft: null, explicit: false });
  try {
    assert.equal(city.find(city.view(), 'LazyComponent', props => props.initialCity === 'Tokyo').props.cityRequestId, 12);
    assert.deepEqual(clone(city.find(city.view(), 'LazyComponent', props => props.initialCity === 'Tokyo').props.cityNames).sort(), ['Tokio', 'Tokyo']);
    assert.equal(ordinary.find(ordinary.view(), 'LazyComponent').props.cityRequestId, undefined);
  } finally { city.host.dispose(); ordinary.host.dispose(); }
});

test('An explicit Tokyo request keeps the real nested survey on Tokyo despite a previous submitted Paris receipt and quota outage', async () => {
  const memory = storageFixture(); seedRecovery(memory); const before = new Map(memory.storage);
  const { app, field, text, find } = mapFixture({ storage: memory.storage, strict: true, recovery: true, quota: async () => { throw Error('Synthetic quota outage'); } });
  try {
    await tick(); app.render();
    assert.match(text(app.tree), /Where would you like to go/); assert.equal(field(app.tree, 'Destination').props.value, 'Tokyo');
    assert.doesNotMatch(text(app.tree), /Paris museum near the Louvre/);
    assert.equal(app.calls.generation.length, 0); assert.equal(app.calls.saved.length, 0);
    for (const [key, raw] of before) assert.equal(memory.storage.get(key), raw);
    assert.deepEqual(memory.writes, []); assert.deepEqual(memory.removals, []);
    app.submit(); app.submit(); app.submit();
    assert.doesNotMatch(text(app.tree), /Open previous itinerary \/ result/);
    const submit = find(app.tree, 'button', props => props.type === 'submit');
    assert.equal(submit.props.disabled, true, 'An unrelated Paris receipt must not advertise recovery for new Tokyo answers');
  } finally { app.dispose(); }
});

test('An explicit city mount leaves an unrelated guest sign-in survey unclaimed and unchanged', () => {
  const memory = storageFixture(), key = 'l2t.journey-survey-sign-in.v1';
  const raw = JSON.stringify({ createdAt: Date.now(), draft: oldDraft() }); memory.seed(key, raw); memory.reset();
  const { app, field } = mapFixture({ storage: memory.storage });
  try {
    assert.equal(field(app.tree, 'Destination').props.value, 'Tokyo'); assert.equal(memory.storage.get(key), raw);
    assert.deepEqual(memory.writes, []); assert.deepEqual(memory.removals, []); assert.equal(app.calls.generation.length, 0);
  } finally { app.dispose(); }
});

test('Area-only generic map entry still automatically offers the exact previous recovery choices', () => {
  const memory = storageFixture(); seedRecovery(memory);
  const { app, field } = mapFixture({ storage: memory.storage, recovery: true, cityRequestId: undefined });
  try { assert.equal(field(app.tree, 'Anything else you would like?', 'textarea').props.value, oldDraft().notes); assert.equal(app.calls.generation.length, 0); }
  finally { app.dispose(); }
});

test('Wrong-city edits under the same entry scope fork safely; shared preferences and later matching Tokyo edits survive reopening', () => {
  const memory = storageFixture(), initial = mapFixture({ storage: new Map() });
  const scope = `area:${initial.area.latitude}:${initial.area.longitude}`; initial.app.dispose();
  const oldKey = surveyKey(owner, scope), oldRaw = JSON.stringify({ version: 1, draft: oldDraft() }); memory.seed(oldKey, oldRaw); memory.reset();
  let current = mapFixture({ storage: memory.storage });
  try {
    assert.equal(current.field(current.app.tree, 'Destination').props.value, 'Tokyo');
    assert.deepEqual(memory.writes, []); assert.equal(memory.storage.get(oldKey), oldRaw);
    current.app.submit(); current.app.submit();
    assert.equal(current.find(current.app.tree, 'input', props => props.name === 'jsv-party' && props.value === 'family').props.checked, true);
    assert.equal(current.find(current.app.tree, 'input', props => props.name === 'jsv-budget' && props.value === 'comfortable').props.checked, true);
    current.app.submit(); assert.equal(current.field(current.app.tree, 'Anything else you would like?', 'textarea').props.value, '');
    current.app.input('Anything else you would like?', 'Tokyo quiet gardens', 'textarea');
    assert.equal(memory.storage.get(oldKey), oldRaw); assert.ok(memory.writes.some(key => key !== oldKey)); current.app.dispose(); memory.reset();
    current = mapFixture({ storage: memory.storage, cityRequestId: 43 });
    assert.equal(current.field(current.app.tree, 'Anything else you would like?', 'textarea').props.value, 'Tokyo quiet gardens');
    assert.equal(memory.storage.get(oldKey), oldRaw); assert.deepEqual(memory.writes, []); assert.deepEqual(memory.removals, []);
  } finally { current.app.dispose(); }
});

test('Manual recovery still restores the original Paris notes and request locale with no new allowance', async () => {
  const memory = storageFixture(); seedRecovery(memory);
  const f = mapFixture({ storage: memory.storage, recovery: request => request.destination.name === 'Paris' && request.notes === oldDraft().notes,
    quota: async () => ({ limit: 3, used: 3, remaining: 0, pending: true, resetAt: new Date(Date.now() + 3600_000).toISOString(), timeZone: 'UTC' }) });
  try {
    await tick(); f.app.render(); f.app.submit(); f.app.submit(); f.app.submit();
    assert.equal(f.find(f.app.tree, 'button', props => props.type === 'submit').props.disabled, true);
    assert.doesNotMatch(f.text(f.app.tree), /Open previous itinerary \/ result/);
    f.app.click('Restore previous choices');
    assert.equal(f.field(f.app.tree, 'Anything else you would like?', 'textarea').props.value, oldDraft().notes);
    assert.match(f.text(f.app.tree), /Open previous itinerary \/ result/);
    assert.equal(f.find(f.app.tree, 'button', props => props.type === 'submit').props.disabled, false);
    assert.equal(f.app.calls.generation.length, 0); f.app.submit(); await tick(); f.app.render();
    assert.equal(f.app.calls.generation.length, 1); assert.equal(f.app.calls.generation[0][0].destination.name, 'Paris');
    assert.equal(f.app.calls.generation[0][0].locale, 'ro'); assert.equal(memory.storage.get(receiptKey(owner)), 'SYNTHETIC_OPAQUE_RECEIPT');
    assert.equal(Object.hasOwn(f.app.calls.generation[0][0], 'cityNames'), false, 'UI identity metadata never enters the paid request/fingerprint');
  } finally { f.app.dispose(); }
});

test('All fifty actual catalogue centres provide their four localized identities without guessing for another area', () => {
  const { cityData, namesForArea } = catalogIdentity(), locales = ['tr', 'en', 'sq', 'ro'];
  const cities = Array.from(cityData.cityDestinations('en')); assert.equal(cities.length, 50);
  for (const city of cities) for (const locale of locales) {
    const selected = cityData.cityDestination(city.code, locale), expected = locales.map(language => cityData.cityDestination(city.code, language).name);
    assert.deepEqual(new Set(namesForArea({ ...selected.center, name: selected.name })), new Set(expected), `${city.code}/${locale}: metadata must come from the real city model`);
  }
  assert.equal(namesForArea(undefined), undefined); assert.equal(namesForArea({ latitude: 0, longitude: 0 }), undefined);
});

for (const code of ['SJJ', 'OTP']) for (const locale of ['tr', 'en', 'sq', 'ro']) test(`${code}/${locale}: catalogue aliases keep real matching choices despite a synthetic same-city centre variation`, () => {
  const { cityData, namesForArea } = catalogIdentity(), selected = cityData.cityDestination(code, locale), english = cityData.cityDestination(code, 'en');
  const area = { ...selected.center, name: selected.name }, memory = storageFixture(), scope = `area:${area.latitude}:${area.longitude}`;
  const draft = { ...oldDraft(), query: english.name, area: { name: english.name, latitude: area.latitude + .005, longitude: area.longitude + .005 }, notes: `${code} same-city private notes` };
  const raw = JSON.stringify({ version: 1, draft }); memory.seed(surveyKey(owner, scope), raw); memory.reset();
  const f = mapFixture({ storage: memory.storage, initialCity: selected.name, initialArea: area, cityNames: namesForArea(area), locale });
  try {
    const notes = f.find(f.app.tree, 'textarea'); assert.ok(notes); assert.equal(notes.props.value, draft.notes);
    assert.equal(memory.storage.get(surveyKey(owner, scope)), raw); assert.deepEqual(memory.writes, []); assert.equal(f.app.calls.generation.length, 0);
  } finally { f.app.dispose(); }
});

test('An unreadable target-fork draft is reported and never overwritten by mount or a later answer change', () => {
  const memory = storageFixture(), base = mapFixture({ storage: new Map() }); const area = base.area; base.app.dispose();
  const scope = `area:${area.latitude}:${area.longitude}`, originalKey = surveyKey(owner, scope), forkKey = surveyKey(owner, `${scope}:city-entry`);
  const original = JSON.stringify({ version: 1, draft: oldDraft() }); memory.seed(originalKey, original); memory.seed(forkKey, '{broken'); memory.reset();
  const f = mapFixture({ storage: memory.storage });
  try {
    assert.equal(f.field(f.app.tree, 'Destination').props.value, 'Tokyo'); assert.deepEqual(memory.writes, []);
    f.app.submit();
    assert.equal(memory.storage.get(originalKey), original); assert.equal(memory.storage.get(forkKey), '{broken');
    assert.deepEqual(memory.writes, []); assert.deepEqual(memory.removals, []); assert.equal(f.app.calls.generation.length, 0);
    assert.ok(f.nodes(f.app.tree).some(node => node.props?.role === 'status' && /not.*saved|not.*read|could not/i.test(f.text(node))));
  } finally { f.app.dispose(); }
});

test('An occupied London fork stays byte-for-byte intact while a new Tokyo draft gets a separate reusable scope', () => {
  const memory = storageFixture(), base = mapFixture({ storage: new Map() }); const area = base.area; base.app.dispose();
  const scope = `area:${area.latitude}:${area.longitude}`, baseKey = surveyKey(owner, scope), occupiedKey = surveyKey(owner, `${scope}:city-entry`);
  const parisRaw = JSON.stringify({ version: 1, draft: oldDraft() });
  const londonRaw = JSON.stringify({ version: 1, draft: { ...oldDraft(), query: 'London', area: { name: 'London', latitude: 51.5074, longitude: -0.1278 }, notes: 'London private notes' } });
  const moreOccupied = [
    ['Berlin', 52.52, 13.405], ['Madrid', 40.4168, -3.7038],
  ].map(([name, latitude, longitude], index) => [surveyKey(owner, `${scope}:city-entry:${index + 2}`), JSON.stringify({ version: 1, draft: { ...oldDraft(), query: name, area: { name, latitude, longitude }, notes: `${name} private notes` } })]);
  memory.seed(baseKey, parisRaw); memory.seed(occupiedKey, londonRaw); moreOccupied.forEach(([key, value]) => memory.seed(key, value)); memory.reset();
  let f = mapFixture({ storage: memory.storage });
  try {
    assert.equal(f.field(f.app.tree, 'Destination').props.value, 'Tokyo'); assert.deepEqual(memory.writes, []);
    f.app.submit(); f.app.submit(); f.app.submit(); f.app.input('Anything else you would like?', 'Newest Tokyo answers', 'textarea');
    assert.equal(memory.storage.get(baseKey), parisRaw); assert.equal(memory.storage.get(occupiedKey), londonRaw);
    for (const [key, value] of moreOccupied) assert.equal(memory.storage.get(key), value);
    assert.ok(memory.writes.every(key => key !== baseKey && key !== occupiedKey)); f.app.dispose(); memory.reset();
    f = mapFixture({ storage: memory.storage, cityRequestId: 43 });
    assert.equal(f.field(f.app.tree, 'Anything else you would like?', 'textarea').props.value, 'Newest Tokyo answers');
    assert.equal(memory.storage.get(occupiedKey), londonRaw); assert.deepEqual(memory.writes, []); assert.deepEqual(memory.removals, []);
    for (const [key, value] of moreOccupied) assert.equal(memory.storage.get(key), value);
  } finally { f.app.dispose(); }
});

test('Real catalogue locale aliases retain matching Tokyo choices when the local suggestion centre differs from the catalogue centre', () => {
  const { cityData } = expose('tests/planning-ux.mjs', ['cityData']);
  for (const locale of ['tr', 'en', 'sq', 'ro']) {
    const city = cityData.cityDestination('HND', locale), area = { ...city.center, name: city.name }, memory = storageFixture();
    const scope = `area:${area.latitude}:${area.longitude}`;
    const draft = { ...oldDraft(), query: 'Tokyo', area: { name: 'Tokyo', latitude: 35.68, longitude: 139.76 }, notes: 'Keep my Tokyo garden choices' };
    const raw = JSON.stringify({ version: 1, draft }); memory.seed(surveyKey(owner, scope), raw); memory.reset();
    const f = mapFixture({ storage: memory.storage, initialCity: city.name, initialArea: area, locale });
    try {
      const notes = f.find(f.app.tree, 'textarea'); assert.ok(notes, `${locale}: matching city choices remain open for review`);
      assert.equal(notes.props.value, draft.notes, `${locale}: the existing Tokyo/Tokio alias must not reset matching notes`);
      assert.equal(memory.storage.get(surveyKey(owner, scope)), raw); assert.deepEqual(memory.writes, []); assert.equal(f.app.calls.generation.length, 0);
    } finally { f.app.dispose(); }
  }
});

test('Changing the explicit request id aborts the old generation and its late result cannot replace newer unsent Tokyo choices', async () => {
  let resolve; const pending = new Promise(yes => { resolve = yes; }); const memory = storageFixture();
  const f = mapFixture({ storage: memory.storage, generate: () => pending });
  try {
    f.app.submit(); f.app.submit(); f.app.submit(); f.app.input('Anything else you would like?', 'First Tokyo request', 'textarea');
    f.app.submit(); await tick(); f.app.render(); assert.equal(f.app.calls.generation.length, 1);
    f.setRequest(43); assert.equal(f.app.calls.generation[0][2].aborted, true);
    f.app.input('Anything else you would like?', 'Newer Tokyo choices', 'textarea');
    resolve(f.generated(f.app.calls.generation[0][0])); await tick(); f.app.render();
    assert.equal(f.app.map, undefined); assert.equal(f.field(f.app.tree, 'Anything else you would like?', 'textarea').props.value, 'Newer Tokyo choices');
    assert.equal(f.app.calls.generation.length, 1); assert.equal(f.app.calls.saved.length, 0);
  } finally { f.app.dispose(); }
});

test('Matching Tokyo edits stay across locale changes, while another owner gets a clean Tokyo survey without claiming old data', () => {
  const memory = storageFixture(), base = mapFixture({ storage: new Map() }); const area = base.area; base.app.dispose();
  const scope = `area:${area.latitude}:${area.longitude}`; const tokyo = { ...oldDraft(), query: 'Tokyo', area, notes: 'My Tokyo notes' };
  const raw = JSON.stringify({ version: 1, draft: tokyo }); memory.seed(surveyKey(owner, scope), raw); memory.reset();
  const f = mapFixture({ storage: memory.storage });
  try {
    assert.equal(f.field(f.app.tree, 'Anything else you would like?', 'textarea').props.value, tokyo.notes);
    f.app.locale('tr'); assert.ok(f.nodes(f.app.tree).find(node => node.type === 'textarea' && node.props.value === tokyo.notes));
    assert.deepEqual(memory.writes, []); f.app.render({ ownerId: 'other-city-owner', accessToken: 'OTHER_UNIT_TEST_TOKEN' });
    assert.equal(f.find(f.app.tree, 'input', props => props.type === 'search').props.value, 'Tokyo');
    assert.doesNotMatch(f.text(f.app.tree), /My Tokyo notes/); assert.equal(memory.storage.get(surveyKey(owner, scope)), raw);
    assert.deepEqual(memory.writes, []); assert.deepEqual(memory.removals, []); assert.equal(f.app.calls.generation.length, 0);
  } finally { f.app.dispose(); }
});

for (const chosenCity of ['Paris', 'Tokyo']) test(`A cached ${chosenCity} plan cannot silently retarget an explicit Tokyo entry, and matching memory remains available`, async () => {
  const memory = storageFixture(), f = mapFixture({ storage: memory.storage, initialArea: { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 } });
  const scope = `area:${f.area.latitude}:${f.area.longitude}`;
  try {
    f.app.click(chosenCity);
    f.app.submit(); f.app.submit(); f.app.submit(); f.app.input('Anything else you would like?', `${chosenCity} private plan notes`, 'textarea');
    f.app.submit(); await tick(); f.app.render(); assert.ok(f.app.map); assert.equal(f.app.calls.generation.length, 1);
    const originalCenter = clone(f.app.map.center);
    // Model a missing persisted edit draft while the tab still has its valid
    // in-memory plan. This touches synthetic fixture storage only.
    memory.storage.delete(surveyKey(owner, scope)); memory.reset();
    if (chosenCity === 'Tokyo') { f.app.locale('sq'); f.app.render({ initialCity: 'Tokio', initialArea: { ...f.area, name: 'Tokio' } }); }
    f.setRequest(43);
    assert.equal(f.find(f.app.tree, 'input', props => props.id === 'jsv-city').props.value, 'Tokyo'); assert.deepEqual(memory.writes, []);
    const resume = f.nodes(f.app.tree).find(node => node.type === 'button' && node.props.className === 'mj-resume');
    if (chosenCity === 'Tokyo') assert.ok(resume, 'Matching city memory remains available');
    else {
      assert.equal(resume, undefined); assert.doesNotMatch(f.text(f.app.tree), /Paris private plan notes/);
      f.setRequest(undefined);
      f.app.click('Return to my open plan · Paris'); assert.deepEqual(clone(f.app.map.center), originalCenter, 'The ignored Paris cache was preserved for an ordinary recovery entry');
    }
    assert.equal(f.app.calls.generation.length, 1); assert.equal(f.app.calls.saved.length, 0);
  } finally { f.app.dispose(); }
});

test('The memory-plan guard also recognizes a canonical Sarajevo result from its localized catalogue entry', async () => {
  const { cityData, namesForArea } = catalogIdentity(), selected = cityData.cityDestination('SJJ', 'tr'), english = cityData.cityDestination('SJJ', 'en');
  const area = { ...selected.center, name: selected.name }, memory = storageFixture(), scope = `area:${area.latitude}:${area.longitude}`;
  let f;
  f = mapFixture({ storage: memory.storage, initialCity: selected.name, initialArea: area, cityNames: namesForArea(area),
    generate: request => Promise.resolve(f.generated({ ...request, destination: { ...request.destination, name: english.name, latitude: area.latitude + .005, longitude: area.longitude + .005 } })) });
  try {
    f.app.submit(); f.app.submit(); f.app.submit(); f.app.input('Anything else you would like?', 'Keep Sarajevo memory choices', 'textarea');
    f.app.submit(); await tick(); f.app.render(); assert.ok(f.app.map);
    memory.storage.delete(surveyKey(owner, scope)); memory.reset(); f.setRequest(43);
    assert.equal(f.find(f.app.tree, 'input', props => props.id === 'jsv-city').props.value, english.name);
    assert.ok(f.find(f.app.tree, 'button', props => props.className === 'mj-resume'));
    f.app.submit(); f.app.submit(); f.app.submit();
    assert.equal(f.field(f.app.tree, 'Anything else you would like?', 'textarea').props.value, 'Keep Sarajevo memory choices');
    assert.equal(f.app.calls.generation.length, 1); assert.equal(f.app.calls.saved.length, 0);
  } finally { f.app.dispose(); }
});
