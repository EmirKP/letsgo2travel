import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' ? value : '';
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node) === label);
const code = ts.transpileModule(readFileSync('mobile/src/components/TravelTranslation.tsx', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function editor({ status = async () => 'installed', translate = async () => { throw Error('packs not ready'); }, initial } = {}) {
  const slots = []; let cursor = 0, dirty = false, effects = [], tree, resume;
  let statusCalls = 0, prepareCalls = 0, translateCalls = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
    useRef(value) { const i = cursor++; return (slots[i] ||= { current: value }); },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((item, index) => !Object.is(item, old.deps[index]))) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  const imports = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '../lib/i18n': { useI18n: () => ({ locale: 'en', copy: (_, en) => en }) },
    '../lib/capacitor': { isIOSNative: () => true },
    '../lib/accountResume': { onAccountResume: callback => { resume = callback; return () => { resume = null; }; } },
    '../lib/offlineTranslation': { translationStatus: (...args) => { statusCalls++; return status(...args); }, prepareTranslation: async () => { prepareCalls++; return 'installed'; }, translateOffline: (...args) => { translateCalls++; return translate(...args); } },
  };
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\nexports.editor=TranslationEditor;})`, {})(name => imports[name] || {}, output, output.exports);
  const props = { source: 'tr', target: 'en', text: 'Draft stays here', initial, onTextChange: value => { props.text = value; }, onSave() {}, onShow() {} };
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
