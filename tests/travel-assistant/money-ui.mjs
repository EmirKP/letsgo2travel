import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const money = require('../../lib/travel-assistant/money.ts');
function loadFormatting(file) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Intl })(name => {
    if (name === './locales/sq-regions') return loadFormatting('mobile/src/lib/locales/sq-regions.ts');
    throw Error(`Unexpected formatting dependency ${name}`);
  }, output, output.exports);
  return output.exports;
}
const localeFormatting = loadFormatting('mobile/src/lib/localeFormatting.ts');
const jsx = (type, props, key) => ({ type, props, key });
const tick = () => new Promise(resolve => setImmediate(resolve));
const now = Date.parse('2026-09-29T12:00:00Z');
class FixedDate extends Date { static now() { return now; } }
const quote = (changes = {}) => ({ base: 'EUR', quote: 'TRY', rate: 44, date: '2026-09-28', previousRate: 40, previousDate: '2026-09-25', changePercent: 10, fetchedAt: new Date(now).toISOString(), sourceUrl: 'https://frankfurter.dev/', ...changes });
const code = ts.transpileModule(readFileSync('mobile/src/components/TravelMoney.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const find = (tree, predicate) => nodes(tree).find(predicate);
const byClass = (tree, name) => find(tree, node => node.props?.className?.split(' ').includes(name));
const namedButton = (tree, name) => find(tree, node => node.type === 'button' && node.props['aria-label'] === name);

function mount({ response = quote(), saved = null, loader, locale = 'en' } = {}) {
  const slots = []; let cursor = 0, dirty = false, effects = [], tree;
  const calls = [], opened = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++, old = slots[index];
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
        slots[index] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../../../lib/travel-assistant/money': money,
    '../lib/travelAssistant': {
      storedQuote: (base, target) => saved?.base === base && saved.quote === target ? saved : null,
      loadQuote: (base, target) => { calls.push([base, target]); return loader ? loader(base, target) : Promise.resolve(response); },
    },
    '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en) => locale === 'tr' ? tr : en }) },
    '../lib/localeFormatting': localeFormatting,
    '../lib/native': { openExternal: url => opened.push(url) }, './Icon': { Icon: 'Icon' }, './travel-money.css': {},
    '../assets/money-exchange.png': { default: '/money-exchange.png' },
  };
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    Date: FixedDate, Intl, window: { setInterval: () => 1, clearInterval() {} },
  })(name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; }, output, output.exports);
  function render() {
    for (let pass = 0; pass < 20; pass++) {
      cursor = 0; dirty = false; effects = []; tree = output.exports.TravelMoney();
      effects.forEach(effect => effect());
      if (!dirty) return tree;
    }
    throw Error('Money render did not settle');
  }
  render();
  return { get tree() { return tree; }, render, calls, opened, async settle() { await tick(); return render(); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}

test('Dated real comparisons distinguish rising, falling and unchanged reference rates', async () => {
  for (const [rate, changePercent, direction, label] of [[44, 10, 'up', 'Increase: 10%'], [36, -10, 'down', 'Decrease: 10%'], [40, 0, 'flat', 'Unchanged: 0%']]) {
    const app = mount({ response: quote({ rate, changePercent }) }); await app.settle();
    const movement = byClass(app.tree, 'tm-movement');
    assert.equal(movement.props.className, `tm-movement is-${direction}`);
    assert.equal(movement.props['aria-label'], label);
    assert.ok(text(byClass(app.tree, 'tm-comparison')).includes('Previous reference40 TRY'));
    assert.deepEqual(nodes(app.tree).filter(node => node.type === 'time').map(node => node.props.dateTime), ['2026-09-25', '2026-09-28']);
    assert.match(text(app.tree), /daily reference rates, not real-time buy\/sell prices/);
    app.dispose();
  }
});

test('Missing comparison is never drawn as a zero change or fabricated arrow', async () => {
  const app = mount({ response: quote({ previousRate: null, previousDate: null, changePercent: null }) }); await app.settle();
  assert.equal(byClass(app.tree, 'tm-movement'), undefined);
  assert.equal(byClass(app.tree, 'tm-comparison'), undefined);
  assert.match(text(app.tree), /unavailable without a previous reference rate/);
  app.dispose();
});

test('Small reference rates retain enough precision to show a real difference', async () => {
  for (const [rate, previousRate, shown, previousShown] of [[0.01983456, 0.01985687, '0.019835', '0.019857'], [0.00018526, 0.00018548, '0.00018526', '0.00018548']]) {
    const app = mount({ response: quote({ rate, previousRate, changePercent: (rate / previousRate - 1) * 100 }) }); await app.settle();
    assert.equal(text(find(byClass(app.tree, 'tm-rate'), node => node.type === 'strong')), shown);
    const comparison = text(byClass(app.tree, 'tm-comparison'));
    assert.ok(comparison.includes(previousShown));
    assert.ok(comparison.includes(shown));
    assert.equal(byClass(app.tree, 'tm-movement').props.className, 'tm-movement is-down');
    assert.ok(text(byClass(app.tree, 'tm-conversion')).includes(new Intl.NumberFormat('en', { maximumFractionDigits: 4 }).format(rate)), 'Conversion amounts keep their existing precision');
    app.dispose();
  }
});

test('Converter accepts Turkish decimals and zero, and clears the result for invalid input', async () => {
  const app = mount({ locale: 'tr' }); await app.settle();
  const amount = () => find(app.tree, node => node.type === 'input');
  amount().props.onChange({ target: { value: '2,5' } }); app.render();
  assert.match(text(byClass(app.tree, 'tm-conversion')), /≈ 110 TRY/);
  amount().props.onChange({ target: { value: '0' } }); app.render();
  assert.match(text(byClass(app.tree, 'tm-conversion')), /≈ 0 TRY/);
  amount().props.onChange({ target: { value: '1.000,50' } }); app.render();
  assert.equal(amount().props['aria-invalid'], true);
  assert.ok(find(app.tree, node => node.props?.role === 'alert'));
  assert.doesNotMatch(text(byClass(app.tree, 'tm-conversion')), /≈/);
  app.dispose();
});

test('A cached old rate remains dated but cannot create a current conversion', async () => {
  const app = mount({ saved: quote({ date: '2026-09-01', previousDate: '2026-08-31' }), loader: () => Promise.reject(Error('offline')) }); await app.settle();
  assert.match(text(app.tree), /SAVED REFERENCE/);
  assert.match(text(app.tree), /Offline · saved rate/);
  assert.match(text(app.tree), /No usable rate from the last seven days/);
  assert.doesNotMatch(text(byClass(app.tree, 'tm-conversion')), /≈/);
  app.dispose();
});

test('Pair shortcuts suppress old results and ignore late responses for the previous pair', async () => {
  const pending = [];
  const app = mount({ loader: (base, target) => new Promise(resolve => pending.push({ base, target, resolve })) });
  const usd = find(app.tree, node => node.type === 'button' && text(node).includes('USD'));
  usd.props.onClick(); app.render();
  assert.deepEqual(app.calls, [['EUR', 'TRY'], ['USD', 'TRY']]);
  pending[1].resolve(quote({ base: 'USD', rate: 42, previousRate: 40, changePercent: 5 })); await app.settle();
  pending[0].resolve(quote()); await app.settle();
  assert.match(text(byClass(app.tree, 'tm-rate')), /1 USD =42TRY/);
  assert.doesNotMatch(text(byClass(app.tree, 'tm-rate')), /44/);
  namedButton(app.tree, 'Swap currencies').props.onClick(); app.render();
  assert.deepEqual(app.calls.at(-1), ['TRY', 'USD']);
  assert.doesNotMatch(text(byClass(app.tree, 'tm-conversion')), /≈/);
  app.dispose();
});

test('Missing rates show no number; refresh and the source control remain usable', async () => {
  const app = mount({ loader: () => Promise.reject(Error('unavailable')) });
  assert.equal(namedButton(app.tree, 'Refresh rate').props.disabled, true);
  await app.settle();
  assert.match(text(app.tree), /The rate is unavailable/);
  assert.equal(namedButton(app.tree, 'Refresh rate').props.disabled, false);
  namedButton(app.tree, 'Refresh rate').props.onClick(); app.render();
  assert.equal(app.calls.length, 2);
  find(app.tree, node => node.type === 'button' && text(node).includes('Rate source: Frankfurter')).props.onClick();
  assert.deepEqual(app.opened, ['https://frankfurter.dev/']);
  assert.equal(nodes(app.tree).filter(node => /^h[1-6]$/.test(node.type) && /Money centre/.test(text(node))).length, 0);
  await app.settle(); app.dispose();
});
