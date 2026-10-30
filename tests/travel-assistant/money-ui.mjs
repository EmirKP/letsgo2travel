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

function mount({ response = quote(), saved = null, loader, locale = 'en', initialPair = null, initialBaseCurrency, destinationCountry, locate = () => Promise.reject(Error('denied')) } = {}) {
  const slots = []; let cursor = 0, dirty = false, effects = [], tree;
  let props = { initialBaseCurrency, destinationCountry };
  const calls = [], opened = [], choices = [], listeners = new Map(); let locationCalls = 0;
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
    Date: FixedDate, Intl, window: { setInterval: () => 1, clearInterval() {}, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); } },
  })(name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; }, output, output.exports);
  function render(next = {}) {
    props = { ...props, ...next };
    for (let pass = 0; pass < 20; pass++) {
      cursor = 0; dirty = false; effects = []; tree = output.exports.TravelMoney(props);
      effects.forEach(effect => effect());
      if (!dirty) return tree;
    }
    throw Error('Money render did not settle');
  }
  render();
  return { get tree() { return tree; }, render, calls, opened, choices, emit: name => listeners.get(name)?.(), get locationCalls() { return locationCalls; }, async settle() { await tick(); return render(); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}

test('Amount, both currencies and a real conversion are available before optional rate details', async () => {
  const app = mount(); await app.settle();
  const converter = byClass(app.tree, 'tm-converter');
  const details = byClass(app.tree, 'tm-rate-details');
  const ordered = nodes(app.tree);
  assert.ok(ordered.indexOf(converter) < ordered.indexOf(details));
  assert.ok(nodes(converter).some(node => node.type === 'input' && node.props.inputMode === 'decimal'));
  assert.equal(nodes(converter).filter(node => node.type === 'select').length, 2);
  assert.ok(byClass(converter, 'tm-conversion'));
  assert.ok(namedButton(converter, 'Swap currencies'));
  assert.notEqual(details.props.open, true, 'References never cover the calculator on first use');
  assert.ok(byClass(details, 'tm-board'), 'Reference dates, comparisons and sources remain accessible');
  app.dispose();
});

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

test('Failed refresh exposes the saved date and retry beside the calculator, and reconnect preserves the amount and pair', async () => {
  let offline = true;
  const app = mount({ initialPair: { base: 'EUR', quote: 'TRY' }, saved: quote(), loader: () => offline ? Promise.reject(Error('offline')) : Promise.resolve(quote({ rate: 45 })) });
  try {
    await app.settle();
    const alert = byClass(byClass(app.tree, 'tm-converter'), 'tm-rate-alert');
    assert.match(text(alert), /Rate update failed.*28 Sep 2026|Rate update failed.*Sep 28, 2026/);
    assert.ok(find(alert, node => node.type === 'button' && text(node) === 'Try again'));
    find(app.tree, node => node.type === 'input').props.onChange({ target: { value: '2.5' } }); app.render();
    assert.match(text(byClass(app.tree, 'tm-conversion')), /110/);
    offline = false; app.emit('online'); app.render(); await app.settle();
    assert.equal(byClass(byClass(app.tree, 'tm-converter'), 'tm-rate-alert'), undefined);
    assert.equal(find(app.tree, node => node.type === 'input').props.value, '2.5');
    assert.deepEqual(app.calls, [['EUR', 'TRY'], ['EUR', 'TRY']]);
    assert.match(text(byClass(app.tree, 'tm-conversion')), /112.5/);
  } finally { app.dispose(); }
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
  assert.match(text(byClass(byClass(app.tree, 'tm-converter'), 'tm-rate-alert')), /The rate is unavailable.*Try again/);
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
  assert.equal(byClass(app.tree, 'tm-location-note'), undefined, 'A saved manual pair does not need repeated explanatory copy'); app.dispose();
});

test('A validated guide currency opens the real converter without GPS or saving, and never reapplies over manual edits', async () => {
  for (const [initialPair, expectedQuote] of [[null, 'TRY'], [{ base: 'USD', quote: 'GBP' }, 'GBP'], [{ base: 'USD', quote: 'JPY' }, 'TRY']]) {
    const app = mount({ initialBaseCurrency: 'JPY', initialPair, locate: async () => { throw Error('Guide entry must not ask for location'); } });
    await app.settle(); assert.equal(app.locationCalls, 0); assert.deepEqual(app.calls[0], ['JPY', expectedQuote]);
    assert.match(text(byClass(app.tree, 'tm-location-note')), /selected from your country guide/);
    assert.doesNotMatch(text(byClass(app.tree, 'tm-location-note')), /choices are remembered/);
    assert.equal(find(app.tree, node => node.type === 'select' && node.props['aria-label'] === 'From').props.value, 'JPY');
    assert.equal(find(app.tree, node => node.type === 'select' && node.props['aria-label'] === 'To').props.value, expectedQuote);
    assert.equal(app.choices.length, 0, 'The guide handoff must not overwrite a saved manual pair');
    app.render({ initialBaseCurrency: 'EUR' }); assert.equal(app.calls.length, 1, 'An unrelated rerender cannot reset the initial handoff');
    find(app.tree, node => node.type === 'select' && node.props['aria-label'] === 'From').props.onChange({ target: { value: 'CHF' } });
    await app.settle(); assert.deepEqual(app.calls.at(-1), ['CHF', expectedQuote]); assert.equal(app.choices.length, 1);
    assert.equal(byClass(app.tree, 'tm-location-note'), undefined, 'The guide handoff explanation disappears after a deliberate manual change');
    app.render({ initialBaseCurrency: 'JPY' });
    assert.equal(find(app.tree, node => node.type === 'select' && node.props['aria-label'] === 'From').props.value, 'CHF');
    assert.equal(app.locationCalls, 0); app.dispose();
  }
});

test('Invalid guide currencies leave ordinary saved-pair and automatic-location behavior intact', async () => {
  const saved = mount({ initialBaseCurrency: 'XXX', initialPair: { base: 'GBP', quote: 'USD' } });
  await saved.settle(); assert.deepEqual(saved.calls[0], ['GBP', 'USD']); assert.equal(saved.locationCalls, 0); assert.equal(saved.choices.length, 0); saved.dispose();
  const fresh = mount({ initialBaseCurrency: 'XXX', locate: async () => ({ country: 'GB' }) });
  await fresh.settle(); assert.equal(fresh.locationCalls, 1); assert.deepEqual(fresh.calls.at(-1), ['GBP', 'TRY']); assert.equal(fresh.choices.length, 0); fresh.dispose();
});

test('A travel-country currency overrides only this visit, suppresses local GPS and preserves the saved manual pair', async () => {
  const app = mount({ destinationCountry: 'JP', initialBaseCurrency: 'JPY', initialPair: { base: 'GBP', quote: 'USD' } });
  try {
    await app.settle();
    assert.equal(app.locationCalls, 0); assert.deepEqual(app.calls[0], ['JPY', 'USD']);
    assert.equal(app.choices.length, 0, 'Entering with destination context does not write manual preferences');
    assert.match(text(byClass(app.tree, 'tm-location-note')), /travel country/);
    find(app.tree, node => node.type === 'select' && node.props['aria-label'] === 'From').props.onChange({target:{value:'CHF'}});
    await app.settle(); assert.deepEqual(app.calls.at(-1), ['CHF', 'USD']);
    assert.equal(app.choices.length, 1, 'Only a deliberate converter edit saves a new preference');
  } finally { app.dispose(); }
});

test('An unsupported destination never falls back to local GPS or mislabels an existing saved pair', async () => {
  const app = mount({ destinationCountry: 'ID', initialPair: {base:'GBP',quote:'USD'} });
  try {
    await app.settle(); assert.equal(app.locationCalls, 0); assert.equal(app.choices.length, 0);
    assert.deepEqual(app.calls[0], ['GBP', 'USD']);
    assert.match(text(byClass(app.tree, 'tm-location-note')), /destination currency is not supported.*previous choice or the default/);
  } finally { app.dispose(); }
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
    '../../../lib/travel-assistant/money': money,
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


test('Same currency converts immediately offline without cache, provider calls or fabricated attribution', async () => {
  const app = mount({ initialPair: { base: 'EUR', quote: 'EUR' }, loader: () => Promise.reject(Error('offline')) });
  try {
    await app.settle(); assert.equal(app.calls.length, 0);
    assert.match(text(app.tree), /SAME CURRENCY/); assert.doesNotMatch(text(app.tree), /Frankfurter|No usable rate|Updating rate/);
    assert.equal(namedButton(app.tree, 'Refresh rate'), undefined);
    for (const [amount, expected] of [['2.5', '= 2.5'], ['0', '= 0']]) {
      find(app.tree, node => node.type === 'input').props.onChange({ target: { value: amount } }); app.render();
      assert.match(text(byClass(app.tree, 'tm-conversion')), new RegExp(expected.replace('.', '\\.')));
    }
    find(app.tree, node => node.type === 'select' && node.props['aria-label'] === 'To').props.onChange({ target: { value: 'TRY' } });
    await app.settle(); assert.deepEqual(app.calls, [['EUR', 'TRY']]); await app.settle();
    assert.match(text(app.tree), /rate is unavailable/);
  } finally { app.dispose(); }
});

test('Shared FX loader returns identity 1 for every supported currency without network or storage', async () => {
  const app = fxLoader(() => { throw Error('must not request a rate'); });
  for (const currency of money.CURRENCIES) {
    const result = await app.loadQuote(currency, currency);
    assert.equal(result.rate, 1); assert.equal(result.base, currency); assert.equal(result.quote, currency);
    assert.equal(result.sourceUrl, ''); assert.equal(result.changePercent, null);
  }
  assert.equal(app.calls.length, 0); assert.equal(app.values.size, 0);
  assert.equal(money.identityQuote('XXX', 'XXX'), null);
});
