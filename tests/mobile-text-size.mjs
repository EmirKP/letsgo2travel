import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';
import { mobileTextScaling, scalableFontSize } from '../scripts/mobile-text-scaling.mjs';

const key = 'l2t-text-size';
const read = file => readFileSync(file, 'utf8');
function browser({ stored, denied = '', values = new Map() } = {}) {
  if (stored !== undefined) values.set(key, stored);
  const listeners = new Set(); let writes = 0;
  const localStorage = {
    getItem(name) { if (denied === 'read') throw Error('Storage blocked'); return values.get(name) ?? null; },
    setItem(name, value) { if (denied === 'write') throw Error('Storage blocked'); writes++; values.set(name, String(value)); },
  };
  const sessionStorage = {};
  const document = { documentElement: { dataset: {} } };
  const window = {
    addEventListener(name, listener) { assert.equal(name, 'storage'); listeners.add(listener); },
    removeEventListener(name, listener) { assert.equal(name, 'storage'); listeners.delete(listener); },
  };
  Object.defineProperty(window, 'localStorage', { get() { if (denied === 'getter') throw Error('Storage blocked'); return localStorage; } });
  const globals = { document, window };
  function load() {
    const source = ts.transpileModule(read('mobile/src/lib/textSize.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const sourceModule = { exports: {} };
    vm.runInNewContext(`(function(module,exports){${source}})`, globals)(sourceModule, sourceModule.exports);
    return sourceModule.exports;
  }
  return { globals, document, values, listeners, sessionStorage, load, get writes() { return writes; },
    remote(value, { eventKey = key, storageArea = localStorage } = {}) {
      if (storageArea === localStorage) {
        if (eventKey === null) values.clear();
        else if (value === null) values.delete(eventKey);
        else values.set(eventKey, value);
      }
      listeners.forEach(listener => listener({ key: eventKey, newValue: value, storageArea }));
    },
  };
}
const renderedSize = fixture => fixture.document.documentElement.dataset.textSize || 'normal';
const html = read('mobile/index.html');
const bootstrap = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match => match[1].includes(key));
assert.ok(bootstrap, 'Text size must be restored before the application bundle paints');

test('Text-size first paint and runtime agree for saved choices, missing/invalid values and blocked storage', () => {
  assert.ok(bootstrap.index < html.indexOf('</head>'));
  assert.ok(bootstrap.index < html.indexOf('type="module"'));
  for (const stored of [undefined, 'normal', 'large', 'LARGE', 'invalid', '']) {
    const fixture = browser({ stored });
    vm.runInNewContext(bootstrap[1], fixture.globals);
    const expected = stored === 'large' ? 'large' : 'normal';
    assert.equal(renderedSize(fixture), expected);
    const state = fixture.load(), cleanup = state.initializeTextSize();
    assert.equal(state.getTextSize(), expected); assert.equal(renderedSize(fixture), expected);
    assert.equal(state.getServerTextSize(), 'normal'); assert.equal(fixture.writes, 0);
    cleanup();
  }
  for (const denied of ['read', 'getter']) {
    const fixture = browser({ stored: 'large', denied });
    assert.doesNotThrow(() => vm.runInNewContext(bootstrap[1], fixture.globals));
    assert.equal(renderedSize(fixture), 'normal');
    const state = fixture.load(), cleanup = state.initializeTextSize();
    assert.equal(state.getTextSize(), 'normal'); cleanup();
  }
});

test('Normal/large preferences persist across remounts and invalid values never alter state', () => {
  const fixture = browser(), state = fixture.load(), cleanup = state.initializeTextSize();
  const changes = []; const unsubscribe = state.subscribeTextSize(() => changes.push(state.getTextSize()));
  state.setTextSize('large'); assert.equal(renderedSize(fixture), 'large'); assert.equal(fixture.values.get(key), 'large');
  state.setTextSize('large'); assert.deepEqual(changes, ['large'], 'Identical values do not rerender subscribers');
  state.setTextSize('huge'); state.setTextSize(null); assert.equal(state.getTextSize(), 'large');
  cleanup(); unsubscribe();
  const remount = browser({ values: fixture.values }), restarted = remount.load(), finish = restarted.initializeTextSize();
  assert.equal(restarted.getTextSize(), 'large'); assert.equal(renderedSize(remount), 'large');
  restarted.setTextSize('normal'); assert.equal(remount.values.get(key), 'normal'); assert.equal(renderedSize(remount), 'normal');
  finish();
});

test('Blocked storage still permits local text-size changes and never throws in a storage listener', () => {
  for (const denied of ['read', 'write', 'getter']) {
    const fixture = browser({ denied }), state = fixture.load(), cleanup = state.initializeTextSize();
    assert.doesNotThrow(() => state.setTextSize('large'));
    assert.equal(renderedSize(fixture), 'large'); assert.equal(state.getTextSize(), 'large');
    assert.doesNotThrow(() => fixture.remote('normal', { storageArea: fixture.sessionStorage }));
    assert.equal(state.getTextSize(), 'large', 'A foreign/unverifiable storage area must not change the selection');
    assert.doesNotThrow(() => state.setTextSize('normal')); assert.equal(renderedSize(fixture), 'normal'); cleanup();
  }
});

test('Cross-tab updates/removal/clear apply without echo writes while session-storage events are ignored', () => {
  const fixture = browser(), state = fixture.load(), cleanup = state.initializeTextSize();
  fixture.remote('large'); assert.equal(state.getTextSize(), 'large');
  fixture.remote('normal', { eventKey: 'unrelated' }); assert.equal(state.getTextSize(), 'large');
  fixture.remote('normal', { storageArea: fixture.sessionStorage }); assert.equal(state.getTextSize(), 'large');
  fixture.remote(null); assert.equal(state.getTextSize(), 'normal');
  fixture.remote('large'); fixture.remote(null, { eventKey: null }); assert.equal(state.getTextSize(), 'normal');
  fixture.remote('large'); fixture.remote('invalid'); assert.equal(state.getTextSize(), 'normal');
  assert.equal(fixture.writes, 0, 'Observing another tab never writes the preference back');
  cleanup(); assert.equal(fixture.listeners.size, 0);
});

test('Initializer and subscription cleanup stop future updates and tolerate repeated cleanup/remount', () => {
  const fixture = browser(), state = fixture.load(), cleanup = state.initializeTextSize();
  let notices = 0; const unsubscribe = state.subscribeTextSize(() => notices++);
  fixture.remote('large'); assert.equal(notices, 1);
  unsubscribe(); unsubscribe(); fixture.remote('normal'); assert.equal(notices, 1);
  cleanup(); cleanup(); assert.equal(fixture.listeners.size, 0);
  fixture.remote('large'); assert.equal(state.getTextSize(), 'normal', 'Unmounted state no longer observes the other tab');
  const finish = state.initializeTextSize(); assert.equal(state.getTextSize(), 'large', 'Remount rereads the stored preference');
  cleanup(); assert.equal(fixture.listeners.size, 1, 'Stale cleanup cannot remove the new listener');
  finish(); assert.equal(fixture.listeners.size, 0);
});

test('Text scaling wraps px/rem/clamp once and preserves inherited em/% or already scaled sizes', () => {
  for (const value of ['16px', '.95rem', 'clamp(14px, 3vw, 20px)', 'clamp(1rem, 4vw, 2rem)', 'calc(12px + 1vw)']) {
    const scaled = scalableFontSize(value);
    assert.match(scaled, /--app-text-scale/);
    assert.equal((scaled.match(/--app-text-scale/g) || []).length, 1);
    assert.ok(scaled.includes(value)); assert.equal(scalableFontSize(scaled), scaled);
  }
  for (const value of ['inherit', 'initial', 'medium', '1.2em', '120%', 'clamp(1rem, 120%, 2rem)', 'calc(1rem + 20%)', 'calc(14px + .2em)', 'var(--font-size)']) {
    assert.equal(scalableFontSize(value), value, `Inherited/semantic sizing remains unchanged: ${value}`);
  }
});

test('PostCSS transforms only app font declarations, preserves layout/vendor map CSS and is idempotent', async () => {
  const input = '.card{font-size:16px;width:16px;padding:1rem}.title{font-size:clamp(1rem,3vw,2rem)}.meta{font:600 14px/1.5 system-ui}.handwritten{font:550 clamp(24px, 4.5vw, 36px)/1.05 "Caveat", cursive}.relative{font-size:1.2em}.percent{font-size:120%}';
  const file = path.resolve('mobile/src/test-text-size.css');
  const once = await postcss([mobileTextScaling()]).process(input, { from: file });
  const twice = await postcss([mobileTextScaling()]).process(once.css, { from: file });
  assert.equal(twice.css, once.css);
  const declarations = []; once.root.walkDecls(decl => declarations.push([decl.prop, decl.value]));
  assert.ok(declarations.some(([property, value]) => property === 'font' && value.includes('--app-text-scale')));
  assert.ok(declarations.some(([property, value]) => property === 'font' && value.includes('clamp(') && value.includes('--app-text-scale') && value.includes('/1.05 "Caveat", cursive')), 'The real cover/header font shorthand scales its clamp size without changing line-height or font family');
  assert.ok(declarations.some(([property, value]) => property === 'width' && value === '16px'));
  assert.ok(declarations.some(([property, value]) => property === 'padding' && value === '1rem'));
  assert.ok(declarations.some(([property, value]) => property === 'font-size' && value === '1.2em'));
  assert.ok(declarations.some(([property, value]) => property === 'font-size' && value === '120%'));
  for (const vendorFile of [path.resolve('mobile/node_modules/leaflet/dist/leaflet.css'), 'C:\\repo\\mobile\\node_modules\\maplibre-gl\\dist\\maplibre-gl.css', path.resolve('app/globals.css')]) {
    assert.equal((await postcss([mobileTextScaling()]).process(input, { from: vendorFile })).css, input);
  }
});

test('Shorthand scanning balances nested functions and never rewrites font names or line heights', async () => {
  const fonts = [
    'oblique 12deg 600 clamp(1rem, min(4vw, 40px), 2rem)/1.2 "Travel 18px Display", sans-serif',
    '600 max(14px, calc(1rem + 1vw))/calc(1 + .2) "Family 22px", serif',
  ];
  for (const font of fonts) {
    const result = await postcss([mobileTextScaling()]).process(`.sample{font:${font}}`, { from: path.resolve('mobile/src/test-font.css') });
    const output = result.root.first.first.value;
    assert.equal((output.match(/--app-text-scale/g) || []).length, 1);
    assert.equal(output.slice(output.lastIndexOf('/')), font.slice(font.lastIndexOf('/')), 'Line height and quoted family are unchanged');
  }
  for (const font of ['500 1.2em "Travel 18px Display", serif', '600 medium "14px Family", serif', '500 120%/1.3 "Family 20px", sans-serif', '500 clamp(1rem, 120%, 2rem)/1.4 "Family 20px", serif']) {
    const input = `.sample{font:${font}}`;
    assert.equal((await postcss([mobileTextScaling()]).process(input, { from: path.resolve('mobile/src/test-font.css') })).css, input);
  }
});

test('Every current app CSS file parses with scaling without rewriting non-font declarations', async () => {
  function cssFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? cssFiles(path.join(directory, entry.name)) : entry.name.endsWith('.css') ? [path.join(directory, entry.name)] : []);
  }
  const files = cssFiles(path.resolve('mobile/src')); assert.ok(files.length > 20);
  let fontCount = 0;
  for (const file of files) {
    const original = postcss.parse(read(file), { from: file });
    const before = []; original.walkDecls(decl => { if (!['font', 'font-size'].includes(decl.prop)) before.push([decl.prop, decl.value]); });
    const result = await postcss([mobileTextScaling()]).process(original, { from: file });
    const after = []; result.root.walkDecls(decl => { if (!['font', 'font-size'].includes(decl.prop)) after.push([decl.prop, decl.value]); else if (decl.value.includes('--app-text-scale')) { fontCount++; assert.equal((decl.value.match(/--app-text-scale/g) || []).length, 1, `${file}: each font declaration is scaled once`); } });
    assert.deepEqual(after, before, `${file}: geometry, illustration sizes and colours remain intact`);
    assert.doesNotThrow(() => postcss.parse(result.css, { from: file }));
  }
  assert.ok(fontCount > 100, 'The build plugin scales actual application typography across screens');
});
