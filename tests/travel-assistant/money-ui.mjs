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
    if (name === '../../../lib/travel-assistant/money') return money;
    if (name === '../../../lib/country-intelligence/currencies') return require('../../lib/country-intelligence/currencies.ts');
    throw Error(`Unexpected formatting dependency ${name}`);
  }, output, output.exports);
  return output.exports;
}
const localeFormatting = loadFormatting('mobile/src/lib/localeFormatting.ts');
const { moneyCurrencyForCountry } = loadFormatting('mobile/src/lib/moneyPreferences.ts');
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

function mount({ response = quote(), saved = null, loader, locale = 'en', initialPair = null, locate = () => Promise.reject(Error('denied')) } = {}) {
  const slots = []; let cursor = 0, dirty = false, effects = [], tree;
  const calls = [], opened = [], choices = []; let locationCalls = 0;
  const react = {
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
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
    '../lib/deviceArea': { locateDeviceArea: () => { locationCalls++; return locate(); } },
    '../lib/moneyPreferences': { readMoneyPair: () => initialPair, saveMoneyPair: value => choices.push(value), moneyCurrencyForCountry },
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
  return { get tree() { return tree; }, render, calls, opened, choices, get locationCalls() { return locationCalls; }, async settle() { await tick(); return render(); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
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
  assert.match(text(byClass(app.tree, 'tm-conversion')), /≈ 110/);
  amount().props.onChange({ target: { value: '0' } }); app.render();
  assert.match(text(byClass(app.tree, 'tm-conversion')), /≈ 0/);
  amount().props.onChange({ target: { value: '1.000,50' } }); app.render();
  assert.equal(amount().props['aria-invalid'], true);
  assert.ok(find(app.tree, node => node.props?.role === 'alert'));
  assert.doesNotMatch(text(byClass(app.tree, 'tm-conversion')), /≈/);
  app.dispose();
});

test('A cached old rate remains dated but cannot create a current conversion', async () => {
  const app = mount({ saved: quote({ date: '2026-09-01', previousDate: '2026-08-31' }), loader: () => Promise.reject(Error('offline')) }); await app.settle();
  assert.match(text(app.tree), /SAVED REFERENCE/);
  assert.match(text(app.tree), /Update unavailable · saved rate/);
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


test('Local currency is selected on first opening, with a distinct target for Turkey', async () => {
  for (const [country, base, target] of [['TR', 'TRY', 'EUR'], ['AL', 'ALL', 'TRY'], ['GB', 'GBP', 'TRY'], ['DE', 'EUR', 'TRY']]) {
    const app = mount({ locate: async () => ({ country }) }); await app.settle();
    assert.equal(app.locationCalls, 1);
    assert.deepEqual(app.calls.at(-1), [base, target]);
    assert.match(text(app.tree), /Your local currency is selected/);
    assert.equal(app.choices.length, 0, 'Automatic selection must not become a manual preference');
    app.dispose();
  }
});

test('A saved manual choice suppresses GPS and late GPS never overwrites a manual change', async () => {
  const saved = mount({ initialPair: { base: 'GBP', quote: 'USD' } }); await saved.settle();
  assert.equal(saved.locationCalls, 0); assert.deepEqual(saved.calls[0], ['GBP', 'USD']); saved.dispose();
  let resolveLocation; const app = mount({ locate: () => new Promise(resolve => { resolveLocation = resolve; }) });
  find(app.tree, node => node.type === 'select' && node.props['aria-label'] === 'From').props.onChange({ target: { value: 'CHF' } }); app.render();
  resolveLocation({ country: 'TR' }); await app.settle();
  assert.deepEqual(app.calls.at(-1), ['CHF', 'TRY']); assert.equal(app.choices.at(-1).base, 'CHF');
  assert.match(text(app.tree), /choices are remembered/); app.dispose();
});

test('Denied or unsupported device area leaves manual selection available without guessing', async () => {
  for (const locate of [async () => { throw Error('denied'); }, async () => ({ country: 'ZZ' })]) {
    const app = mount({ locate }); await app.settle();
    assert.match(text(app.tree), /could not be determined/);
    assert.equal(nodes(app.tree).filter(node => node.type === 'select').length, 2);
    assert.deepEqual(app.calls[0], ['EUR', 'TRY']); app.dispose();
  }
});


function fxLoader(request, assistant = 'https://assistant.example') {
  const values = new Map(), calls = [];
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync('mobile/src/lib/travelAssistant.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports = {
    './api': { requestJson: async (url, options) => { calls.push({ url, options }); return request(url); } },
    './config': { config: { apiBaseUrl: 'https://main.example', travelAssistantApiBaseUrl: assistant } },
    '../../../lib/travel-assistant/places': require('../../lib/travel-assistant/places.ts'),
    '../../../lib/travel-assistant/responses': require('../../lib/travel-assistant/responses.ts'),
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date: FixedDate, URLSearchParams, localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } })(name => imports[name], output, output.exports);
  return { ...output.exports, calls, values };
}

test('FX uses the main public API when the optional host is down; concurrent requests share one validated result', async () => {
  const app = fxLoader(async url => { if (url.startsWith('https://assistant')) throw Error('502'); return quote(); });
  const first = app.loadQuote('EUR', 'TRY'), second = app.loadQuote('EUR', 'TRY'); assert.equal(first, second);
  assert.equal((await first).rate, 44);
  assert.deepEqual(app.calls.map(call => call.url), ['https://assistant.example/api/travel-assistant/rates?base=EUR&quote=TRY', '/api/travel-assistant/rates?base=EUR&quote=TRY']);
  assert.equal(app.storedQuote('EUR', 'TRY').rate, 44);
  assert.equal(app.calls.every(call => call.options.timeoutMs === 8000), true);
});

test('FX rejects malformed, wrong-pair and stale host data before fallback; failed retries leave the saved rate intact', async () => {
  for (const bad of [{ ...quote(), quote: 'USD' }, { ...quote(), rate: Infinity }, { ...quote(), date: '2026-09-01', previousDate: '2026-08-31' }]) {
    const app = fxLoader(async url => url.startsWith('https://assistant') ? bad : quote());
    assert.equal((await app.loadQuote('EUR', 'TRY')).date, '2026-09-28'); assert.equal(app.calls.length, 2);
  }
  let failing = false;
  const app = fxLoader(async () => { if (failing) throw Error('offline'); return quote(); }, '');
  await app.loadQuote('EUR', 'TRY'); failing = true;
  await assert.rejects(app.loadQuote('EUR', 'TRY'), /offline/);
  assert.equal(app.storedQuote('EUR', 'TRY').rate, 44);
  failing = false; assert.equal((await app.loadQuote('EUR', 'TRY')).rate, 44); assert.equal(app.calls.length, 3);
});
