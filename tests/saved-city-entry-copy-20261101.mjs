import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { realLocaleModule } from './fixtures/real-locale-modules.mjs';

const localeHelpers = realLocaleModule('../lib/locale');
await Promise.all(['sq', 'ro'].map(locale => localeHelpers.loadLocaleMessages(locale)));
const parse = file => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const plans = parse('mobile/src/screens/PlansScreen.tsx');
function locate(source, predicate) {
  let found;
  const visit = node => { if (!found) { if (predicate(node)) found = node; else ts.forEachChild(node, visit); } };
  visit(source); assert.ok(found, 'Production render expression exists'); return found;
}
const variable = name => locate(plans, node => ts.isVariableDeclaration(node) && node.name.getText(plans) === name).initializer.getText(plans);
const card = locate(plans, node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.text === 'className' && prop.initializer?.text === 'plans-category'));
const savedMap = locate(plans, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(plans) === 'TravelMap');
const jsx = (type, props) => ({ type, props });
function evaluate(expression, globals) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(`module.exports = (${expression});`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, globals)(id => {
    assert.equal(id, 'react/jsx-runtime'); return { jsx, jsxs: jsx };
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const cityPin = { id: 'personal/00000000-0000-4000-8000-000000000001', name: 'Rome', destinationCode: 'FCO',
  latitude: 41.9028, longitude: 12.4964, note: 'Read-only fixture', inDay: false, createdAt: '2026-10-31T12:00:00.000Z' };
const scopeKey = owner => `l2t.personal-map-pins.v1:${owner ? `user:${encodeURIComponent(owner)}` : 'guest'}`;

// Render the actual category card source with the actual personal-pin reader and
// locale helper. Unrelated Plans hooks, requests and mutation handlers never run.
function fixture(language, { ownerId = 'owner-a', personalOwnerItems = [cityPin], guestItems = [], cloud = {}, personalUnavailable = false, personalCorrupt = false } = {}) {
  const reads = [], actions = [], mutationAttempts = [];
  const seeded = new Map([
    [scopeKey('owner-a'), JSON.stringify({ version: 1, ownerId: 'owner-a', items: personalOwnerItems })],
    [scopeKey(null), JSON.stringify({ version: 1, ownerId: null, items: guestItems })],
  ]);
  if (personalCorrupt) seeded.set(scopeKey(ownerId), '{invalid fixture');
  const localStorage = {
    getItem(key) { reads.push(key); if (personalUnavailable && key === scopeKey(ownerId)) throw Error('Synthetic unreadable storage'); return seeded.get(key) ?? null; },
    setItem() { mutationAttempts.push('write'); throw Error('Read-only storage fixture'); },
    removeItem() { mutationAttempts.push('remove'); throw Error('Read-only storage fixture'); },
  };
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync('mobile/src/lib/personalMapPins.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { localStorage })(id => {
    assert.equal(id, './id'); return { createId() { throw Error('No new pin creation in read-only tests'); } };
  }, loadedModule, loadedModule.exports);
  const personalPins = loadedModule.exports.readPersonalMapPins(ownerId);
  const savedPlaces = { items: [], error: null, pending: false, ...cloud };
  const copy = (tr, en, sq) => localeHelpers.translateCopy(language, tr, en, sq);
  const context = { copy, ownerId, routes: [], cloudRoutes: [], savedEvents: [], favorites: [],
    savedPlaces, personalPins, cloudLoading: false, cloudError: '', localReadError: {},
    Icon: 'Icon', TravelToolArtwork: 'TravelToolArtwork', TravelMap: 'TravelMap',
    chooseSection: section => actions.push(section),
  };
  context.item = evaluate(variable('categories'), context).find(item => item.id === 'places');
  context.pendingCount = evaluate(variable('pendingCount'), context);
  context.unavailableCount = evaluate(variable('unavailableCount'), context);
  const tree = evaluate(card.getText(plans), context);
  return { tree, caption: text(nodes(tree).find(node => node.type === 'em')),
    badge: nodes(tree).find(node => node.props?.className === 'plans-category-count'),
    title: context.item.title, personalPins, savedPlaces, actions, reads, mutationAttempts,
    map: () => evaluate(savedMap.getText(plans), context), copy };
}

const mixed = {
  tr: 'Bu cihazdaki işaretler dahil', en: 'Including pins on this device',
  sq: 'Përfshin shenjat në këtë pajisje', ro: 'Inclusiv marcajele de pe acest dispozitiv',
};
for (const [language, caption] of Object.entries(mixed)) {
  test(`${language}: a city saved only as a device pin is counted and the existing Places entry explains that scope`, () => {
    const f = fixture(language);
    assert.equal(f.savedPlaces.items.length, 0); assert.equal(f.personalPins.items[0].destinationCode, 'FCO');
    assert.equal(text(f.badge), '1'); assert.equal(f.caption, caption);
    assert.equal(f.title, f.copy('Yerlerim', 'My places'));
    f.tree.props.onClick(); assert.deepEqual(f.actions, ['places']);
    const map = f.map(); assert.equal(map.props.initialSection, 'saved'); assert.equal(map.props.ownerId, 'owner-a');
    assert.deepEqual(f.mutationAttempts, []); assert.deepEqual(f.reads, [scopeKey('owner-a')]);
  });

  test(`${language}: pure account places keep their caption and pending sync keeps priority over the local-pin caption`, () => {
    const provider = { id: 'node/42' };
    const cloud = fixture(language, { personalOwnerItems: [], cloud: { items: [provider] } });
    assert.equal(text(cloud.badge), '1'); assert.equal(cloud.caption, cloud.copy('Hesabındaki yerler', 'Places in your account', 'Vendet në llogarinë tënde'));
    const both = fixture(language, { cloud: { items: [provider] } });
    assert.equal(text(both.badge), '2'); assert.equal(both.caption, caption);
    const pending = fixture(language, { cloud: { items: [provider], pending: true } });
    assert.equal(pending.caption, pending.copy('Eşitleme bekliyor', 'Waiting to sync'));
    assert.deepEqual(cloud.mutationAttempts, []); assert.deepEqual(both.mutationAttempts, []); assert.deepEqual(pending.mutationAttempts, []);
  });

  test(`${language}: an error from either collection overrides counts and sync wording without deleting readable pins`, () => {
    for (const scenario of [
      { cloud: { error: 'unavailable', pending: true } },
      { personalUnavailable: true, cloud: { pending: true } },
      { personalCorrupt: true },
      { personalUnavailable: true, cloud: { error: 'unavailable' } },
    ]) {
      const f = fixture(language, scenario);
      assert.equal(f.caption, f.copy('Listeyi kontrol et', 'Check your list'));
      assert.equal(text(f.badge), '!'); assert.equal(f.badge.props['aria-label'], f.copy('Liste okunamadı', "The list couldn't be read"));
      if (!scenario.personalUnavailable && !scenario.personalCorrupt) assert.equal(f.personalPins.items[0].id, cityPin.id);
      assert.deepEqual(f.mutationAttempts, []);
    }
  });

  test(`${language}: guest copy remains device-scoped and another owner never receives the first owner's city pin`, () => {
    const guestPin = { ...cityPin, id: 'personal/00000000-0000-4000-8000-000000000002', name: 'Guest city' };
    const guest = fixture(language, { ownerId: null, guestItems: [guestPin] });
    assert.equal(text(guest.badge), '1'); assert.equal(guest.personalPins.items[0].name, 'Guest city');
    assert.equal(guest.caption, guest.copy('1 yer · Bu cihazda', '1 place · On this device', '1 vende · Në këtë pajisje'));
    const other = fixture(language, { ownerId: 'owner-b', guestItems: [guestPin] });
    assert.equal(text(other.badge), '0'); assert.equal(other.personalPins.items.length, 0);
    assert.equal(other.map().props.ownerId, 'owner-b'); assert.deepEqual(other.reads, [scopeKey('owner-b')]);
    assert.deepEqual(guest.mutationAttempts, []); assert.deepEqual(other.mutationAttempts, []);
  });
}
