import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function modules(overrides = {}) {
  const cache = new Map();
  function load(file) {
    const full = path.resolve(file.endsWith('.ts') || file.endsWith('.tsx') ? file : `${file}.ts`);
    if (cache.has(full)) return cache.get(full).exports;
    const compiledModule = { exports: {} }; cache.set(full, compiledModule);
    const compiled = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Date, Intl })(name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.startsWith('.')) return load(path.resolve(path.dirname(full), name));
      throw Error(`Unexpected import ${name}`);
    }, compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  return load;
}
const load = modules();
const dates = load('mobile/src/lib/dates.ts');
const labels = load('mobile/src/lib/localeFormatting.ts');

test('Changing a flight cannot leave scheduled arrival trapped between reversed date bounds', () => {
  const bounds = dates.flightArrivalDateBounds('2026-11-27', '2026-11-07', '2028-11-01');
  assert.deepEqual({ ...bounds }, { min: '2026-11-26', max: '2028-11-01' });
  assert.equal(dates.validPickerValue('2026-11-27', 'date', bounds.min, bounds.max), true);
  const valid = dates.flightArrivalDateBounds('2026-11-27', '2026-11-30', '2028-11-01');
  assert.equal(valid.max, '2026-11-30');
  assert.equal(dates.validPickerValue('2026-12-01', 'date', valid.min, valid.max), false);
});

test('Arrival allows the previous destination calendar day without bypassing real instant validation', () => {
  assert.equal(dates.flightArrivalDateBounds('2028-03-01', '').min, '2028-02-29');
  assert.equal(dates.flightArrivalDateBounds('2026-01-01', '').min, '2025-12-31');
  assert.doesNotThrow(() => dates.flightArrivalDateBounds('partial', ''));
});

test('Visible flight dates and airport timezone labels use all four selected app languages', () => {
  const expected = { tr: '27 Kasım 2026', en: '27 November 2026', sq: '27 nëntor 2026', ro: '27 noiembrie 2026' };
  for (const [locale, text] of Object.entries(expected)) assert.equal(labels.formatCalendarDate('2026-11-27', locale), text);
  assert.equal(labels.formatCalendarDate('2026-02-30', 'tr'), '');
  assert.equal(labels.formatCalendarDate('', 'en'), '');
  assert.equal(labels.localTimeZoneLabel('Asia/Kabul', 'tr', 'Kabul'), 'Kabil yerel saati');
  assert.equal(labels.localTimeZoneLabel('Europe/Bucharest', 'ro'), 'Ora locală · București');
  assert.equal(labels.localTimeZoneLabel('Europe/Tirane', 'sq'), 'Ora lokale · Tiranë');
  assert.equal(labels.localTimeZoneLabel('America/New_York', 'en'), 'New York local time');
});

const elements = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(elements)];
function fieldHost(initial = {}) {
  const slots = []; let cursor = 0, effects = [], props = { type: 'date', label: 'Arrival', value: '', min: '2026-11-26', max: '2026-11-30', onChange: value => changes.push(value), ...initial };
  const changes = [], native = { value: '' };
  const react = {
    useId: () => 'test-date',
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useState(value) { const i = cursor++; slots[i] ||= { value }; return [slots[i].value, next => { slots[i].value = next; }]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((item, index) => item !== old.deps[index])) { slots[i] = { deps }; effects.push(fn); } },
  };
  const jsx = (type, props) => ({ type, props });
  const component = modules({ react, 'react/jsx-runtime': { jsx, jsxs: jsx }, './Icon': { Icon: 'Icon' }, '../lib/i18n': { useI18n: () => ({ locale: 'en', copy: (_, en) => en }) } })('mobile/src/components/DateTimeField.tsx').DateTimeField;
  let input, tree;
  return {
    native, changes,
    render(next = {}) { props = { ...props, ...next }; cursor = 0; effects = []; tree = component(props); input = elements(tree).find(node => node.type === 'input'); input.props.ref.current = native; effects.forEach(fn => fn()); return tree; },
    event(name, value) { native.value = value; input.props[name]({ currentTarget: native }); },
    input: () => input,
  };
}

test('Native iOS intermediate inputs keep their draft instead of being reset to the controlled blank', () => {
  const field = fieldHost(); field.render();
  field.event('onInput', '2026-11-01'); field.render();
  assert.deepEqual(field.changes, []);
  assert.equal(field.native.value, '2026-11-01', 'The user can continue navigating to the valid flight day');
  assert.equal(Object.hasOwn(field.input().props, 'value'), false);
  field.event('onInput', '2026-11-27'); field.render({ value: field.changes.at(-1) });
  assert.deepEqual(field.changes, ['2026-11-27']);
  assert.equal(field.input().props['aria-invalid'], undefined);
  assert.equal(field.native.value, '2026-11-27');
});

test('Done/blur commits a valid native value, rejects an invalid draft and retains external updates', () => {
  const field = fieldHost({ value: '2026-11-27' }); field.render();
  field.event('onBlur', '2026-11-28'); assert.deepEqual(field.changes, ['2026-11-28']);
  field.render({ value: '2026-11-28' });
  field.event('onBlur', '2026-12-01'); assert.equal(field.native.value, '2026-11-28');
  assert.deepEqual(field.changes, ['2026-11-28']);
  field.render({ value: '2026-11-29' }); assert.equal(field.native.value, '2026-11-29');
  assert.equal(field.input().props['aria-invalid'], undefined, 'External corrected values clear obsolete errors');
  field.event('onChange', ''); assert.equal(field.changes.at(-1), '');
});
