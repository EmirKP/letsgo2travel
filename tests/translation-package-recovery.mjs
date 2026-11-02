import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { realLocaleModule } from './fixtures/real-locale-modules.mjs';

const locales = realLocaleModule('../lib/locale');
await Promise.all([locales.loadLocaleMessages('sq'), locales.loadLocaleMessages('ro')]);

const jsx = (type, props) => ({ type, props });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' ? value : '';
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node) === label);
const code = ts.transpileModule(readFileSync('mobile/src/components/TravelTranslation.tsx', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function editor({ status = async () => 'installed', translate = async () => { throw Error('packs not ready'); }, initial, platform = 'ios', locale = 'en', source = 'tr', target = 'en' } = {}) {
  const slots = []; let cursor = 0, dirty = false, effects = [], tree, resume;
  let statusCalls = 0, prepareCalls = 0, translateCalls = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
    useRef(value) { const i = cursor++; return (slots[i] ||= { current: value }); },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((item, index) => !Object.is(item, old.deps[index]))) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const imports = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '../lib/i18n': { useI18n: () => ({ locale, copy: (...args) => locales.translateCopy(locale, ...args) }) },
    '../lib/capacitor': { isIOSNative: () => platform === 'ios' },
    '../lib/accountResume': { onAccountResume: callback => { resume = callback; return () => { resume = null; }; } },
    '../lib/offlineTranslation': { translationStatus: (...args) => { statusCalls++; return status(...args); }, prepareTranslation: async () => { prepareCalls++; return 'installed'; }, translateOffline: (...args) => { translateCalls++; return translate(...args); } },
  };
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\nexports.editor=TranslationEditor;})`, {})(name => imports[name] || {}, output, output.exports);
  const props = { source, target, text: 'Draft stays here', initial, onTextChange: value => { props.text = value; }, onSave() {}, onShow() {} };
  function render() { for (let pass = 0; pass < 15; pass++) { cursor = 0; dirty = false; effects = []; tree = output.exports.editor(props); effects.forEach(effect => effect()); if (!dirty) return tree; } throw Error('render did not settle'); }
  render();
  return { render, get tree() { return tree; }, get statusCalls() { return statusCalls; }, get prepareCalls() { return prepareCalls; }, get translateCalls() { return translateCalls; }, resume: () => resume?.(), async settle() { await new Promise(setImmediate); return render(); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}

test('A rejected native translation rechecks packs, exposes preparation and preserves the draft', async () => {
  let checks = 0;
  const app = editor({ status: async () => ++checks === 1 ? 'installed' : 'supported' });
  try {
    await app.settle(); button(app.tree, 'Translate on device').props.onClick(); await app.settle(); await app.settle();
    assert.equal(app.statusCalls, 2); assert.equal(app.translateCalls, 1);
    assert.equal(nodes(app.tree).find(node => node.type === 'textarea').props.value, 'Draft stays here');
    assert.ok(button(app.tree, 'Download language packs'));
    assert.equal(button(app.tree, 'Translate on device').props.disabled, true);
    button(app.tree, 'Download language packs').props.onClick(); await app.settle();
    assert.equal(app.prepareCalls, 1); assert.equal(button(app.tree, 'Translate on device').props.disabled, false);
  } finally { app.dispose(); }
});

test('Returning from system settings refreshes availability without clearing text or a reusable result', async () => {
  let state = 'installed';
  const initial = { source: 'tr', target: 'en', text: 'Draft stays here', translation: 'Preserved result' };
  const app = editor({ initial, status: async () => state });
  try {
    await app.settle(); state = 'supported'; app.resume(); app.render(); await app.settle();
    assert.equal(app.statusCalls, 2); assert.match(text(app.tree), /Preserved result/);
    assert.ok(button(app.tree, 'Save on device')); assert.ok(button(app.tree, 'Download language packs'));
    assert.equal(nodes(app.tree).find(node => node.type === 'textarea').props.value, initial.text);
    assert.equal(app.translateCalls, 0); assert.equal(app.prepareCalls, 0, 'Resume never downloads or translates by itself');
  } finally { app.dispose(); }
});

test('A previous status response cannot overwrite a newer same-pair foreground check', async () => {
  let resolveOld, calls = 0;
  const app = editor({ status: () => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve('supported') });
  try {
    app.resume(); app.render(); await app.settle(); assert.ok(button(app.tree, 'Download language packs'));
    resolveOld('installed'); await app.settle();
    assert.ok(button(app.tree, 'Download language packs')); assert.equal(button(app.tree, 'Translate on device').props.disabled, true);
  } finally { app.dispose(); }
});

for (const platform of ['android', 'ios']) {
  test(`An initial ${platform} pack-status read failure exposes explicit recovery without claiming unsupported`, async () => {
    let fail = true;
    const app = editor({ platform, status: async () => { if (fail) throw Error('Model status unavailable'); return 'installed'; } });
    try {
      await app.settle();
      assert.match(text(app.tree), /Language pack status could not be checked/);
      assert.doesNotMatch(text(app.tree), /Offline translation is unavailable for this language pair/);
      assert.equal(button(app.tree, 'Translate on device').props.disabled, true);
      assert.ok(button(app.tree, 'Check language packs'));
      assert.equal(nodes(app.tree).find(node => node.type === 'textarea').props.value, 'Draft stays here');
      assert.equal(app.statusCalls, 1); assert.equal(app.prepareCalls, 0); assert.equal(app.translateCalls, 0);
      nodes(app.tree).find(node => node.type === 'textarea').props.onChange({ target: { value: 'Edited while the status check is unavailable' } }); app.render();
      assert.match(text(app.tree), /Language pack status could not be checked/);
      assert.ok(button(app.tree, 'Check language packs'), 'Editing the draft must retain status-read recovery');
      assert.equal(app.statusCalls, 1, 'Typing does not request a model check or run a translation');
      fail = false;
      button(app.tree, 'Check language packs').props.onClick(); app.render(); await app.settle();
      assert.equal(button(app.tree, 'Translate on device').props.disabled, false);
      assert.doesNotMatch(text(app.tree), /could not be checked/);
      assert.equal(nodes(app.tree).find(node => node.type === 'textarea').props.value, 'Edited while the status check is unavailable');
      assert.equal(app.statusCalls, 2); assert.equal(app.prepareCalls, 0); assert.equal(app.translateCalls, 0);
    } finally { app.dispose(); }
  });
}

test('A confirmed unsupported Romanian pair remains unavailable without a download or invented support', async () => {
  for (const platform of ['android', 'ios']) {
    const app = editor({ platform, source: 'ro', target: 'en', status: async () => 'unsupported' });
    try {
      await app.settle();
      assert.match(text(app.tree), /Offline translation is unavailable for this language pair/);
      assert.doesNotMatch(text(app.tree), /could not be checked/);
      assert.equal(button(app.tree, 'Download language packs'), undefined);
      assert.equal(button(app.tree, 'Translate on device').props.disabled, true);
      assert.equal(app.statusCalls, 1); assert.equal(app.prepareCalls, 0); assert.equal(app.translateCalls, 0);
    } finally { app.dispose(); }
  }
});

test('A stale failed pack-status read cannot replace a newer ready foreground result', async () => {
  let rejectOld, calls = 0;
  const app = editor({ platform: 'android', status: () => ++calls === 1 ? new Promise((_resolve, reject) => { rejectOld = reject; }) : Promise.resolve('installed') });
  try {
    app.resume(); app.render(); await app.settle();
    rejectOld(Error('Old read failed')); await app.settle();
    assert.equal(button(app.tree, 'Translate on device').props.disabled, false);
    assert.doesNotMatch(text(app.tree), /could not be checked|unavailable for this language pair/);
    assert.equal(app.statusCalls, 2); assert.equal(app.prepareCalls, 0); assert.equal(app.translateCalls, 0);
  } finally { app.dispose(); }
});

for (const [locale, expected] of Object.entries({ tr: 'Dil paketlerinin durumu kontrol edilemedi.', en: 'Language pack status could not be checked.', sq: 'Gjendja e paketave të gjuhëve nuk u kontrollua.', ro: 'Starea pachetelor de limbă nu a putut fi verificată.' })) {
  test(`Pack-check failure guidance uses the normal ${locale} copy provider and preserves the draft`, async () => {
    const app = editor({ platform: 'android', locale, status: async () => { throw Error('Fixture unavailable'); } });
    try {
      await app.settle();
      assert.ok(text(app.tree).includes(expected));
      assert.equal(nodes(app.tree).find(node => node.type === 'textarea').props.value, 'Draft stays here');
      assert.equal(app.prepareCalls, 0); assert.equal(app.translateCalls, 0);
    } finally { app.dispose(); }
  });
}
