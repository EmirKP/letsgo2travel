import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { realLocaleModule } from './fixtures/real-locale-modules.mjs';

const jsx = (type, props, key) => ({ type, props, key });
const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' ? value : '';
function load(file, imports = {}, globals = {}) {
  const result = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { ...globals })(name => {
    if (name.endsWith('.css')) return {};
    if (Object.hasOwn(imports, name)) return imports[name];
    const localeModule=realLocaleModule(name);if(localeModule)return localeModule;throw Error(`Unexpected lesson dependency: ${name}`);
  }, result, result.exports);
  return result.exports;
}
const exampleApi = load('mobile/src/lib/guideExample.ts');
function harness({ ownerId = null, locale = 'en', saved = [], failSave = false } = {}) {
  const slots = [], calls = { save: [], read: [], open: [], close: 0, own: 0, requests: [] };
  let cursor = 0, tree;
  const react = { useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }]; } };
  const { RouteExampleLesson } = load('mobile/src/components/RouteExampleLesson.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq : en }) },
    '../lib/guideExample': exampleApi, './Sheet': { Sheet: 'Sheet' }, './Icon': { Icon: 'Icon' },
    '../lib/storage': {
      getSavedRoutePlans: owner => { calls.read.push(owner); return saved; },
      saveRoutePlan: (plan, owner) => { calls.save.push({ plan, owner }); if (failSave) throw Error('storage full'); saved = [plan, ...saved]; return saved; },
    },
  }, { fetch: (...args) => { calls.requests.push(args); throw Error('The example must not make requests'); } });
  const h = {
    calls, get tree() { return tree; }, get saved() { return saved; },
    render() { cursor = 0; tree = RouteExampleLesson({ open: true, ownerId, onClose: () => calls.close++, onPlanOwn: () => calls.own++, onOpenSaved: id => calls.open.push(id) }); return tree; },
    click(label) { const button = nodes(tree).find(node => node.type === 'button' && text(node) === label); assert.ok(button, `Missing ${label}`); assert.notEqual(button.props.disabled, true); button.props.onClick(); return h.render(); },
    retry() { failSave = false; },
  };
  h.render(); return h;
}

test('The labelled example is local, does not consume AI and saves only after explicit review and Save', () => {
  const original = [{ id: 'my-existing-plan', plan: { summary: 'Untouched personal draft' } }], before = JSON.stringify(original);
  const h = harness({ saved: original });
  assert.match(text(h.tree), /Example plan · Uses no AI allowance/);
  assert.equal(nodes(h.tree).find(node => node.type === 'button' && text(node) === 'Save example to Plans').props.disabled, true);
  assert.equal(h.calls.save.length, 0);
  h.click('Day 2'); assert.match(text(h.tree), /Pantheon area/); h.click('Save example to Plans');
  assert.equal(h.calls.save.length, 1); assert.equal(h.calls.save[0].owner, null);
  assert.equal(h.calls.save[0].plan.plan.routes[0].name, 'Learning example · Rome');
  assert.equal(JSON.stringify(original), before);
  assert.equal(h.saved[1], original[0]);
  assert.deepEqual(h.calls.requests, []);
  h.click('Open my saved example'); assert.deepEqual(h.calls.open, ['guide-example.rome.v1.en']);
});

test('Relearning opens the already saved example without overwriting its user edits', () => {
  const existing = exampleApi.createGuideExample('en', new Date('2026-10-20T10:00:00Z'));
  existing.plan.routes[0].dailyPlan = ['My edited day'];
  const before = JSON.stringify(existing), h = harness({ ownerId: 'account-A', saved: [existing] });
  h.click('Day 2'); h.click('Save example to Plans'); h.click('Open my saved example');
  assert.deepEqual(h.calls.read, ['account-A']); assert.equal(h.calls.save.length, 0);
  assert.equal(JSON.stringify(existing), before); assert.deepEqual(h.calls.open, [existing.id]);
});

test('Failed storage never announces a saved example and allows an explicit retry', () => {
  const h = harness({ ownerId: 'account-B', failSave: true });
  h.click('Day 2'); h.click('Save example to Plans');
  assert.match(text(h.tree), /could not be saved/); assert.equal(nodes(h.tree).some(node => node.type === 'button' && text(node) === 'Open my saved example'), false);
  assert.deepEqual(h.calls.open, []); assert.equal(h.saved.length, 0);
  h.retry(); h.click('Save example to Plans'); assert.equal(h.calls.save.at(-1).owner, 'account-B');
  assert.match(text(h.tree), /Example saved on this device/); assert.doesNotMatch(text(h.tree), /could not be saved/);
});

test('Learning can be closed or left for the own planner without saving or generating', () => {
  const h = harness(); h.tree.props.onClose(); h.click('Plan my own route');
  assert.equal(h.calls.close, 1); assert.equal(h.calls.own, 1); assert.deepEqual(h.calls.save, []); assert.deepEqual(h.calls.requests, []);
});

test('Every locale clearly labels the separate example and provides matching two-day content', () => {
  for (const [locale, label, day2, save, open] of [['tr', 'Örnek plan · AI hakkını kullanmaz', '2. gün', 'Örneği Planlar’a kaydet', 'Kaydettiğim örneği aç'], ['sq', 'Plan shembull · Nuk përdor të drejtën e AI', 'Dita 2', 'Ruaj shembullin te Planet', 'Hap shembullin tim të ruajtur']]) {
    const h = harness({ locale }); assert.ok(text(h.tree).includes(label)); h.click(day2); h.click(save); h.click(open);
    assert.deepEqual(h.calls.open, [`guide-example.rome.v1.${locale}`]); assert.deepEqual(h.calls.requests, []);
    assert.equal(h.saved[0].plan.routes[0].verifiedEntryStatus, 'unknown');
  }
});

test('Task progress validates ids and task values while preserving legacy completion records', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const api = load('mobile/src/lib/appGuide.ts', {}, { window: { localStorage: storage } });
  api.saveGuideProgress({ active: true, seen: ['exploreSearch', 'forged'], skipped: ['exploreSearch', 'exploreSave', 'forged'], task: 'inspiration' });
  assert.deepEqual(JSON.parse(JSON.stringify(api.readGuideProgress())), { active: true, seen: ['exploreSearch'], skipped: ['exploreSave'], task: 'inspiration' });
  assert.equal(api.guideTaskForIntent('route'), 'routeExample'); assert.equal(api.guideTaskForIntent('companion'), 'onTrip'); assert.equal(api.guideTaskForIntent('explore'), 'inspiration');
  assert.deepEqual([...api.guideSteps('routeExample')], [], 'The example owns its local lesson and never guides a retained draft');
  api.saveGuideProgress({ active: false, seen: ['destination'] }); assert.deepEqual(JSON.parse(JSON.stringify(api.readGuideProgress())), { active: false, seen: ['destination'] });
});
