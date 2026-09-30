import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const languages = [['tr', 'Türkçe'], ['en', 'English'], ['de', 'Deutsch'], ['ar', 'العربية']];
function transpile(path) {
  return ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
}
function loadFormatting(file) {
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${transpile(file)}\n})`, { Intl })(name => {
    if (name === './locales/sq-regions') return loadFormatting('mobile/src/lib/locales/sq-regions.ts');
    throw Error(`Unexpected formatting dependency ${name}`);
  }, output, output.exports);
  return output.exports;
}
const localeFormatting = loadFormatting('mobile/src/lib/localeFormatting.ts');
function storageModule() {
  let stored = null, writes = 0, quota = false;
  const result = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${transpile('mobile/src/lib/savedTranslations.ts')}\n})`, {
    Blob, Date, crypto: { randomUUID },
    localStorage: { getItem: () => stored, setItem: (_, value) => { if (quota) throw Error('quota'); writes++; stored = value; }, removeItem: () => { if (quota) throw Error('quota'); writes++; stored = null; } },
  })(() => ({ TRANSLATION_LANGUAGES: languages }), result, result.exports);
  return { api: result.exports, raw: () => stored, writes: () => writes, inject: value => { stored = value; }, quota: value => { quota = value; } };
}
const card = { source: 'tr', target: 'en', text: 'Su alabilir miyim?', translation: 'May I have some water?' };

test('Saved translations persist only when explicitly saved, reuse duplicates, and delete exactly one card', () => {
  const s = storageModule();
  assert.equal(s.api.readSavedTranslations().length, 0);
  assert.equal(s.writes(), 0);
  const first = s.api.saveTranslation(card)[0];
  assert.equal(s.api.readSavedTranslations()[0].translation, card.translation);
  assert.equal(s.api.saveTranslation(card).length, 1);
  assert.equal(s.api.readSavedTranslations()[0].id, first.id);
  s.api.saveTranslation({ ...card, text: 'Merhaba', translation: 'Hello' });
  const next = s.api.deleteSavedTranslation(first.id);
  assert.equal(next.length, 1);
  assert.equal(next[0].translation, 'Hello');
});

test('Saved translation limits and quota failures preserve existing cards', () => {
  const s = storageModule();
  for (let i = 0; i < s.api.MAX_SAVED_TRANSLATIONS; i++) s.api.saveTranslation({ ...card, text: `Text ${i}` });
  const full = s.raw();
  assert.throws(() => s.api.saveTranslation({ ...card, text: 'One too many' }), /full/);
  assert.equal(s.raw(), full);
  assert.equal(s.api.saveTranslation({ ...card, text: 'Text 1' }).length, 30);
  const beforeFailure = s.raw();
  s.quota(true);
  assert.throws(() => s.api.deleteSavedTranslation(s.api.readSavedTranslations()[0].id), /quota/);
  assert.equal(s.raw(), beforeFailure);
});

test('Malformed, oversized, duplicate and future saved cards cannot enter the card list', () => {
  const s = storageModule();
  const valid = { ...card, id: randomUUID(), savedAt: new Date().toISOString(), unexpected: 'not retained' };
  s.inject(JSON.stringify([valid, valid, { ...valid, id: randomUUID(), source: 'unknown' }, { ...valid, id: randomUUID(), savedAt: '2099-01-01' }, { ...valid, id: randomUUID(), translation: 'a'.repeat(12001) }]));
  assert.equal(s.api.readSavedTranslations().length, 1);
  assert.equal(s.api.readSavedTranslations()[0].unexpected, undefined);
  s.inject('{broken'); assert.equal(s.api.readSavedTranslations().length, 0);
  s.inject('a'.repeat(500001)); assert.equal(s.api.readSavedTranslations().length, 0);
  for (const invalid of [{ ...card, source: 'xyz' }, { ...card, source: 'en' }, { ...card, text: ' ' }, { ...card, text: 'a'.repeat(2001) }, { ...card, translation: '' }]) assert.throws(() => s.api.saveTranslation(invalid), /invalid/);
});

test('Storage byte budget includes multibyte translation content', () => {
  const s = storageModule();
  let count = 0;
  for (; count < 30; count++) {
    try { s.api.saveTranslation({ ...card, text: `Text ${count}`, translation: '語'.repeat(12000) }); }
    catch (error) { assert.match(error.message, /full/); break; }
  }
  assert.ok(count > 0 && count < 30);
  assert.ok(new Blob([s.raw()]).size <= 500000);
  assert.equal(s.api.readSavedTranslations().length, count);
});

test('Unreadable translation data blocks mutations, retains readable cards, and requires explicit reset', () => {
  const s = storageModule();
  const valid = { ...card, id: randomUUID(), savedAt: new Date().toISOString() };
  for (const raw of ['{broken', JSON.stringify([valid, { ...valid, id: 'invalid' }]), 'a'.repeat(500001)]) {
    s.inject(raw);
    assert.equal(s.api.readSavedTranslationState().error, 'corrupt');
    assert.throws(() => s.api.saveTranslation(card), /corrupt/);
    assert.throws(() => s.api.deleteSavedTranslation(valid.id), /corrupt/);
    assert.equal(s.raw(), raw);
  }
  s.inject(JSON.stringify([valid, { ...valid, id: 'invalid' }]));
  assert.equal(s.api.readSavedTranslationState().items[0].text, card.text);
  s.quota(true);
  assert.throws(() => s.api.resetSavedTranslations(), /quota/);
  assert.ok(s.raw().includes(valid.id));
  s.quota(false); s.api.resetSavedTranslations();
  assert.equal(s.raw(), null);
  assert.equal(s.api.saveTranslation(card).length, 1);
});

function editorHarness() {
  const hooks = [], effects = [];
  let index = 0, first = true, resolve;
  const saved = [];
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const i = index++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useEffect(effect) { if (first) effects.push(effect); },
  };
  const testModule = { exports: {} };
  const imports = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../lib/i18n': { useI18n: () => ({ copy: (tr, en) => en, locale: 'en' }) },
    '../lib/offlineTranslation': { TRANSLATION_LANGUAGES: languages, translationStatus: async () => 'installed', translateOffline: () => new Promise(done => { resolve = done; }) },
  };
  vm.runInNewContext(`(function(require,module,exports){${transpile('mobile/src/components/TravelTranslation.tsx')}\nexports.editorForTest = TranslationEditor;})`, {})(name => imports[name] || {}, testModule, testModule.exports);
  const props = { source: 'tr', target: 'en', text: '', onTextChange: text => { props.text = text; }, onSave: value => saved.push(value), onShow: () => {} };
  return {
    render() { index = 0; const view = testModule.exports.editorForTest(props); if (first) { first = false; effects.splice(0).forEach(effect => effect()); } return view; },
    resolve: text => resolve(text), saved,
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const control = (tree, type, text) => nodes(tree).find(node => node.type === type && (!text || node.props.children === text));

test('Translation result is tied to the submitted draft and only an explicit Save persists it', async () => {
  const h = editorHarness(); h.render(); await Promise.resolve();
  control(h.render(), 'textarea').props.onChange({ target: { value: 'Merhaba' } });
  control(h.render(), 'button', 'Translate on device').props.onClick();
  assert.equal(control(h.render(), 'textarea').props.disabled, true);
  h.resolve('Hello'); await new Promise(setImmediate);
  assert.equal(h.saved.length, 0);
  control(h.render(), 'button', 'Save on device').props.onClick();
  assert.equal(h.saved[0].text, 'Merhaba'); assert.equal(h.saved[0].translation, 'Hello');
  control(h.render(), 'textarea').props.onChange({ target: { value: 'Edited' } });
  assert.equal(control(h.render(), 'button', 'Save on device'), undefined);
});

test('A late translation completion cannot reappear after its draft revision changed', async () => {
  const h = editorHarness(); h.render(); await Promise.resolve();
  control(h.render(), 'textarea').props.onChange({ target: { value: 'Old draft' } });
  control(h.render(), 'button', 'Translate on device').props.onClick();
  // Exercise a delayed input event even though the rendered input is disabled while busy.
  control(h.render(), 'textarea').props.onChange({ target: { value: 'New draft' } });
  h.resolve('Old translation'); await new Promise(setImmediate);
  assert.equal(control(h.render(), 'button', 'Save on device'), undefined);
  assert.equal(control(h.render(), 'textarea').props.value, 'New draft');
});

test('Changing either translation language, swapping, or switching app locale retains the draft', () => {
  const hooks = []; let index = 0, locale = 'en';
  const jsx = (type, props, key) => ({ type, props, key });
  const react = {
    useState(initial) { const i = index++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
  };
  const output = { exports: {} };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../lib/i18n': { useI18n: () => ({ copy: (tr, en) => en, locale }) },
    '../lib/capacitor': { isIOSNative: () => false },
    '../lib/offlineTranslation': { TRANSLATION_LANGUAGES: languages, translationLanguageOptions: () => languages },
    '../lib/savedTranslations': { readSavedTranslationState: () => ({ items: [], error: null }) },
  };
  vm.runInNewContext(`(function(require,module,exports){${transpile('mobile/src/components/TravelTranslation.tsx')}\n})`, {})(name => imports[name] || {}, output, output.exports);
  const render = () => { index = 0; return output.exports.TravelTranslation({ onPhrases() {} }); };
  const editor = view => nodes(view).find(node => typeof node.type === 'function' && node.type.name === 'TranslationEditor');
  editor(render()).props.onTextChange('Please help me find my hotel.');
  const oldKey = editor(render()).key;
  const selectors = () => nodes(render()).filter(node => node.type === 'select');
  selectors()[1].props.onChange({ target: { value: 'de' } });
  assert.notEqual(editor(render()).key, oldKey);
  assert.equal(editor(render()).props.text, 'Please help me find my hotel.');
  selectors()[0].props.onChange({ target: { value: 'ar' } });
  assert.equal(editor(render()).props.text, 'Please help me find my hotel.');
  control(render(), 'button', 'Swap languages').props.onClick();
  assert.equal(editor(render()).props.source, 'de'); assert.equal(editor(render()).props.target, 'ar');
  locale = 'sq';
  assert.equal(editor(render()).props.text, 'Please help me find my hotel.');
});

test('Albanian model selection is offered only on the wired-up ML Kit platform', () => {
  for (const platform of ['android', 'ios', 'web']) {
    const output = { exports: {} };
    vm.runInNewContext(`(function(require,module,exports){${transpile('mobile/src/lib/offlineTranslation.ts')}\n})`, {})(() => ({ nativePlatform: () => platform }), output, output.exports);
    assert.equal(output.exports.translationLanguageOptions().some(([code]) => code === 'sq'), platform === 'android');
  }
});

test('Offline point search and category filtering update map points and clear hidden selections', () => {
  const hooks = [];
  let index = 0;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const i = index++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useMemo: fn => fn(), useCallback: fn => fn,
  };
  const testModule = { exports: {} };
  const imports = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../lib/i18n': { useI18n: () => ({ copy: (tr, en) => en, locale: 'en', dateLocale: 'en-GB' }) },
    '../lib/localeFormatting': localeFormatting,
    '../../../lib/travel-assistant/places': { CATEGORY_LABELS: { pharmacy: ['Eczane', 'Pharmacy'], museum: ['Müze', 'Museum'] } },
  };
  vm.runInNewContext(`(function(require,module,exports){${transpile('mobile/src/components/TravelOfflineMap.tsx')}\nexports.explorerForTest = OfflinePackExplorer;})`, { requestAnimationFrame: fn => fn() })(name => imports[name] || {}, testModule, testModule.exports);
  const base = { latitude: 52.52, longitude: 13.4, sourceUrl: 'https://www.openstreetmap.org/node/1', description: null, hours: null };
  const pack = { downloadedAt: new Date().toISOString(), places: [{ ...base, id: 'a', name: 'Central Pharmacy', category: 'pharmacy' }, { ...base, id: 'b', name: 'Art Museum', category: 'museum' }] };
  const render = () => { index = 0; return testModule.exports.explorerForTest({ pack }); };
  const canvas = tree => nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'OfflineCanvas');
  assert.equal(canvas(render()).props.places.length, 2);
  canvas(render()).props.onSelect('a');
  assert.equal(canvas(render()).props.selected.id, 'a');
  control(render(), 'input').props.onChange({ target: { value: 'MUSEUM' } });
  assert.equal(canvas(render()).props.places.length, 1);
  assert.equal(canvas(render()).props.places[0].id, 'b');
  assert.equal(canvas(render()).props.selected, null);
  control(render(), 'select').props.onChange({ target: { value: 'pharmacy' } });
  assert.equal(canvas(render()).props.places.length, 0);
  control(render(), 'button', 'Clear filters').props.onClick();
  assert.equal(canvas(render()).props.places.length, 2);
});
