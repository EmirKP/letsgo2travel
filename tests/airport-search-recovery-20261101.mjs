import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const localeModules = new Map();
function loadLocaleModule(file) {
  const path = resolve(file);
  if (localeModules.has(path)) return localeModules.get(path);
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  const loadedModule = { exports: {} };
  localeModules.set(path, loadedModule.exports);
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {})(id => {
    assert.ok(id.startsWith('.'), `Unexpected locale dependency ${id}`);
    return loadLocaleModule(resolve(dirname(path), id.endsWith('.json') ? id : `${id}.ts`));
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const locales = loadLocaleModule('mobile/src/lib/locale.ts');
await Promise.all([locales.loadLocaleMessages('sq'), locales.loadLocaleMessages('ro')]);
const jsx = (type, props) => ({ type, props });
const nodes = tree => tree && typeof tree === 'object'
  ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' ? tree : tree?.props ? text(tree.props.children) : '';
const tick = () => new Promise(resolve => setImmediate(resolve));
const airports = {
  london: { iata: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', countryCode: 'GB', timeZone: 'Europe/London' },
  paris: { iata: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France', countryCode: 'FR', timeZone: 'Europe/Paris' },
  rome: { iata: 'FCO', name: 'Leonardo da Vinci Airport', city: 'Rome', country: 'Italy', countryCode: 'IT', timeZone: 'Europe/Rome' },
};
const componentSource = readFileSync('mobile/src/components/AirportField.tsx', 'utf8');
const compiled = ts.transpileModule(componentSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Execute the actual AirportField and its event closures. Only React scheduling,
// document/timers, and the airport transport are controlled; no real API writes.
function fixture(locale = 'en') {
  const slots = [], jobs = new Map(), listeners = new Map(), calls = [], selected = [];
  let cursor = 0, effects = [], dirty, nextJob = 0, tree, disposed = false;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  const react = {
    useId() { const i = cursor++; return (slots[i] ||= { id: `airport-${i}` }).id; },
    useState(initial) {
      const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect(effect, deps) {
      const i = cursor++, old = slots[i];
      if (!old || changed(old.deps, deps)) {
        slots[i] = { ...old, deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  const loadedModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
    window: {
      setTimeout(fn) { jobs.set(++nextJob, fn); return nextJob; },
      clearTimeout(key) { jobs.delete(key); }, requestAnimationFrame: fn => fn(),
    },
    document: {
      addEventListener(name, fn) { listeners.set(name, fn); },
      removeEventListener(name) { listeners.delete(name); },
    },
  })(name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === './Icon') return { Icon: 'Icon' };
    if (name === '../lib/i18n') return { useI18n: () => ({ copy: (...args) => locales.translateCopy(locale, ...args), locale }) };
    if (name === '../../../lib/airport-lifecycle') return loadLocaleModule('lib/airport-lifecycle.ts');
    if (name === '../lib/airports') return {
      airportTitle: option => option.city || option.name,
      searchAirports(query) {
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        calls.push({ query, resolve, reject }); return promise;
      },
    };
    throw Error(`Unexpected fixture dependency: ${name}`);
  }, loadedModule, loadedModule.exports);
  let props = { label: 'Arrival airport', value: null, required: true, onChange: option => selected.push(option) };
  function render(next) {
    assert.equal(disposed, false);
    if (next) props = { ...props, ...next };
    for (let pass = 0; pass < 12; pass++) {
      cursor = 0; effects = []; dirty = false; tree = loadedModule.exports.AirportField(props);
      tree.props.ref.current = { contains: target => target === 'inside' };
      effects.forEach(effect => effect());
      if (!dirty) return tree;
    }
    throw Error('Unstable fixture');
  }
  const input = () => nodes(tree).find(node => node.type === 'input');
  const options = () => nodes(tree).filter(node => node.props?.role === 'option');
  render();
  return {
    calls, selected, render, input, options,
    status: () => nodes(tree).find(node => node.props?.role === 'status'),
    type(query) { input().props.onChange({ target: { value: query } }); return render(); },
    startRequest() { const job = jobs.entries().next().value; assert.ok(job, 'Expected one debounced search'); jobs.delete(job[0]); job[1](); return render(); },
    async respond(index, rows) { calls[index].resolve(rows); await tick(); return render(); },
    async fail(index) { calls[index].reject(new Error('isolated offline')); await tick(); return render(); },
    focus() { input().props.onFocus(); return render(); },
    press(key, native = {}) { let prevented = false; input().props.onKeyDown({ key, ...native, preventDefault() { prevented = true; } }); render(); return prevented; },
    pointer(target = 'outside') { listeners.get('pointerdown')({ target }); return render(); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); disposed = true; },
  };
}

test('A changed airport query cannot select prior-city options by pointer or keyboard during debounce/request', async () => {
  const h = fixture();
  try {
    h.type('London'); h.startRequest(); await h.respond(0, [airports.london]);
    const oldOption = h.options()[0], oldKey = h.input().props.onKeyDown;
    h.type('Paris');
    assert.equal(h.options().length, 0, 'Previous city disappears immediately');
    assert.equal(h.input().props['aria-activedescendant'], undefined);
    oldOption.props.onClick(); oldKey({ key: 'Enter', preventDefault() {} }); h.render();
    h.press('Enter'); assert.deepEqual(h.selected, []);
    h.startRequest(); oldOption.props.onClick(); h.press('ArrowDown'); h.press('Enter');
    assert.deepEqual(h.selected, []);
    await h.respond(1, [airports.paris]);
    assert.equal(h.selected.length, 0, 'A response never selects automatically');
    assert.equal(h.options().length, 1);
    h.press('Enter'); assert.deepEqual(h.selected.map(option => option.iata), ['CDG']);
    assert.deepEqual(h.calls.map(call => call.query), ['London', 'Paris']);
  } finally { h.dispose(); }
});

test('A prior result callback cannot escape query fencing after London→Paris→London', async () => {
  const h = fixture();
  try {
    h.type('London'); h.startRequest(); await h.respond(0, [airports.london]);
    const original = h.options()[0];
    h.type('Paris'); h.startRequest(); h.type('London');
    original.props.onClick(); h.render(); assert.deepEqual(h.selected, []);
    h.startRequest(); await h.respond(2, [airports.london]);
    original.props.onClick(); h.render(); assert.deepEqual(h.selected, [], 'Old generation remains unselectable even for the same text');
    h.pointer('inside'); h.options()[0].props.onClick();
    assert.deepEqual(h.selected.map(option => option.iata), ['LHR']);
  } finally { h.dispose(); }
});

test('Pending airport success or failure cannot reopen after outside, Escape or Tab dismissal', async () => {
  for (const dismiss of ['outside', 'Escape', 'Tab']) for (const result of ['success', 'failure']) {
    const h = fixture();
    try {
      h.type('Paris'); h.startRequest();
      if (dismiss === 'outside') h.pointer(); else h.press(dismiss);
      assert.equal(h.input().props['aria-expanded'], false);
      if (result === 'success') await h.respond(0, [airports.paris]); else await h.fail(0);
      assert.equal(h.input().props['aria-expanded'], false, `${dismiss}/${result}: preserve intentional dismissal`);
      assert.equal(h.options().length, 0); assert.deepEqual(h.selected, []);
      const refocused = h.focus(); assert.equal(h.input().props['aria-expanded'], true);
      if (result === 'success') { assert.equal(h.options().length, 1); h.press('Enter'); assert.equal(h.selected[0].iata, 'CDG'); }
      else assert.match(text(refocused), /Search is unavailable/);
      assert.equal(h.calls.length, 1, 'Dismiss/refocus adds no transport requests or retry loop');
    } finally { h.dispose(); }
  }
});

test('Refocusing during an existing request shows its waiting status and accepts only its eventual current results', async () => {
  const h = fixture();
  try {
    h.type('Paris'); h.startRequest(); h.press('Escape'); h.focus();
    assert.match(text(h.status()), /Searching/); assert.equal(h.options().length, 0);
    await h.respond(0, [airports.paris]);
    h.pointer('inside'); h.options()[0].props.onClick();
    assert.equal(h.selected[0].iata, 'CDG'); assert.equal(h.calls.length, 1);
    assert.equal(Object.hasOwn(h.input()?.props || {}, 'onBlur'), false, 'iOS blur never removes a result before click');
  } finally { h.dispose(); }
});

test('Shortening/clearing a query cancels debounce and rejects late replies and captured option clicks', async () => {
  const h = fixture();
  try {
    h.type('London'); h.startRequest(); await h.respond(0, [airports.london]); const oldOption = h.options()[0];
    h.type('Paris'); h.startRequest(); h.type('P');
    oldOption.props.onClick(); h.render(); await h.respond(1, [airports.paris]);
    assert.equal(h.input().props['aria-expanded'], false); assert.equal(h.options().length, 0); assert.deepEqual(h.selected, []);
    h.type('Rome'); h.type('');
    assert.equal(h.calls.length, 2, 'Clearing before debounce does not start a request');
    assert.equal(h.input().props['aria-expanded'], false);
  } finally { h.dispose(); }
});

test('Out-of-order successes and failures cannot replace the latest airport result or its waiting state', async () => {
  for (const staleReply of ['success', 'failure']) {
    const h = fixture();
    try {
      h.type('London'); h.startRequest(); h.type('Paris'); h.startRequest();
      if (staleReply === 'success') await h.respond(0, [airports.london]); else await h.fail(0);
      assert.match(text(h.status()), /Searching/); assert.equal(h.options().length, 0);
      await h.respond(1, [airports.paris]); h.press('Enter');
      assert.deepEqual(h.selected.map(option => option.iata), ['CDG']);
    } finally { h.dispose(); }
  }
});

test('Active pending airport search exposes its existing status in all four locales without extra calls', () => {
  for (const locale of ['tr', 'en', 'sq', 'ro']) {
    const h = fixture(locale);
    try {
      h.type('Paris'); assert.equal(h.input().props['aria-expanded'], true);
      assert.equal(text(h.status()), locales.translateCopy(locale, 'Aranıyor…', 'Searching…'));
      assert.equal(h.calls.length, 0, 'Debounce still delays transport');
      h.startRequest(); assert.equal(h.calls.length, 1);
      h.press('Enter'); assert.deepEqual(h.selected, []);
    } finally { h.dispose(); }
  }
});

test('Selected-airport replacement, current empty results and external selection leave no stale selectable list', async () => {
  const h = fixture();
  try {
    h.type('Paris'); h.startRequest(); await h.respond(0, []);
    assert.match(text(h.render()), /No results/); h.press('Enter'); assert.deepEqual(h.selected, []);
    h.type('Rome'); h.startRequest(); h.render({ value: airports.paris });
    await h.respond(1, [airports.rome]);
    assert.equal(h.input(), undefined); assert.equal(h.options().length, 0);
    h.render({ value: null }); assert.equal(h.options().length, 0);
  } finally { h.dispose(); }
});

const historicalAirport = { iata: 'TXL', name: 'Berlin-Tegel International Airport', city: 'Berlin', country: 'Germany', countryCode: 'DE' };
const currentBerlin = { iata: 'BER', name: 'Berlin Brandenburg Airport', city: 'Berlin', country: 'Germany', countryCode: 'DE' };
const closedLabels = { tr: 'Artık kapalı · tarihî havalimanı', en: 'Now closed · historical airport', sq: 'Tani i mbyllur · aeroport historik', ro: 'Închis acum · aeroport istoric' };

for (const locale of ['tr', 'en', 'sq', 'ro']) test(`Verified historical airport is qualified and remains exactly selectable by pointer and keyboard in ${locale}`, async () => {
  for (const method of ['pointer', 'keyboard']) {
    const h = fixture(locale);
    try {
      h.type('Berlin'); h.startRequest(); await h.respond(0, [currentBerlin, historicalAirport]);
      assert.equal(h.options().length, 2);
      assert.equal(text(h.options()[0]).includes(closedLabels[locale]), false);
      assert.ok(text(h.options()[1]).includes(closedLabels[locale]));
      assert.equal(h.options()[1].props.disabled, undefined, 'The annotation must not impose a new selection policy');
      if (method === 'pointer') { h.options()[1].props.onClick(); h.render(); }
      else { h.press('ArrowDown'); h.press('Enter'); }
      assert.equal(h.selected.length, 1); assert.equal(h.selected[0], historicalAirport);
      h.render({ value: h.selected[0] });
      const selected = nodes(h.render()).find(node => node.props?.className === 'airport-field-selected');
      assert.ok(text(selected).includes(closedLabels[locale]));
      assert.ok(selected.props['aria-label'].includes(closedLabels[locale]), 'The existing button accessible name must also disclose archived status');
      assert.equal(h.calls.length, 1, 'Metadata display adds no lookup or policy requests');
    } finally { h.dispose(); }
  }
});

test('Preloaded historical origin without a country keeps its identity and gets the canonical fallback annotation', () => {
  const h = fixture();
  try {
    const saved = { iata: 'TXL', name: 'TXL', city: '', country: '', countryCode: '' };
    const tree = h.render({ value: saved });
    assert.ok(text(tree).includes(closedLabels.en));
    assert.equal(h.calls.length, 0); assert.equal(h.selected.length, 0);
    const selected = nodes(tree).find(node => node.props?.className === 'airport-field-selected');
    assert.match(text(selected), /TXL/);
  } finally { h.dispose(); }
});

test('Untrusted lifecycle objects cannot qualify unrelated airport identities or render their unsafe metadata', async () => {
  const badMetadata = [null, 'closed', [], { status: 'open' }, { status: 'closed', checkedAt: 'not-a-date', sourceUrl: 'javascript:alert(1)' }];
  for (const lifecycle of badMetadata) {
    const h = fixture();
    try {
      const rows = [{ ...currentBerlin, lifecycle }, { ...historicalAirport, countryCode: 'FR', lifecycle }, { ...airports.london, iata: 'ZZZ', lifecycle }];
      h.type('Airport'); h.startRequest(); await h.respond(0, rows);
      assert.equal(h.options().length, rows.length);
      const tree = h.render();
      assert.doesNotMatch(text(tree), /historical airport|not-a-date|javascript:|Invalid Date/);
      assert.equal(nodes(tree).filter(node => node.type === 'a').length, 0);
      h.options()[0].props.onClick(); h.render(); assert.equal(h.selected[0], rows[0]);
      assert.doesNotMatch(text(h.render({ value: rows[0] })), /historical airport/);
      const reviewed = h.render({ value: { ...historicalAirport, lifecycle } });
      assert.ok(text(reviewed).includes(closedLabels.en), 'Malformed optional metadata cannot hide independently reviewed history');
      assert.doesNotMatch(text(reviewed), /not-a-date|javascript:|Invalid Date/);
    } finally { h.dispose(); }
  }
});
