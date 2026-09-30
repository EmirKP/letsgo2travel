import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual provider, catalog and controls. Only React's host hooks,
// the dialog shell and browser storage are supplied by this in-memory fixture.
// No application locale/translation functions are replaced.
const compiled = new Map();
function fixture({ language = 'sq-AL', storage = new Map(), readError = false, writeError = false, intl = Intl, imports = {} } = {}) {
  let activeHost, nextId = 0;
  const document = { documentElement: { lang: '', dir: '' } };
  const localStorage = {
    getItem(key) { if (readError) throw Error('Storage denied'); return storage.get(key) ?? null; },
    setItem(key, value) { if (writeError) throw Error('Storage full'); storage.set(key, String(value)); },
  };
  const jsx = (type, props) => {
    if (type?.context) type.context.value = props.value;
    return { type, props };
  };
  const react = {
    createContext(value) { const context = { value }; context.Provider = { context }; return context; },
    useContext: context => context.value,
    useState: value => activeHost.useState(value),
    useMemo: (fn, deps) => activeHost.useMemo(fn, deps),
    useEffect: (fn, deps) => activeHost.useEffect(fn, deps),
    useId: () => activeHost.useState(() => `field-${++nextId}`)[0],
  };
  const context = vm.createContext({ document, navigator: { language }, window: { localStorage, setInterval: () => 1, clearInterval() {} }, Intl: intl, Date, console });
  const cache = new Map();
  const load = filename => {
    let full = path.resolve(filename);
    if (!existsSync(full)) full = ['.ts', '.tsx', '.json'].map(ext => full + ext).find(existsSync) || full;
    if (full.endsWith('.css')) return {};
    if (/\.(png|webp|svg)$/.test(full)) return full;
    if (cache.has(full)) return cache.get(full).exports;
    const module = { exports: {} }; cache.set(full, module);
    if (full.endsWith('.json')) return (module.exports = JSON.parse(readFileSync(full, 'utf8')));
    if (!compiled.has(full)) compiled.set(full, ts.transpileModule(readFileSync(full, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText);
    const resolve = name => {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === './Sheet') return { Sheet: 'Sheet' };
      if (name === './Icon') return { Icon: 'Icon' };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(full), name));
      throw Error(`Unexpected dependency ${name}`);
    };
    vm.runInContext(`(function(require,module,exports){${compiled.get(full)}\n})`, context, { filename: full })(resolve, module, module.exports);
    return module.exports;
  };
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  function mount(component, initial = {}) {
    let cursor = 0, props = initial, effects = [];
    const slots = [];
    const host = {
      useState(initial) {
        const index = cursor++;
        if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
        return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
      },
      useMemo(fn, deps) {
        const index = cursor++;
        if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn(), deps };
        return slots[index].value;
      },
      useEffect(fn, deps) {
        const index = cursor++, old = slots[index];
        if (!old || !same(old.deps, deps)) { slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); }); }
      },
      render(next) {
        if (next) props = { ...props, ...next };
        activeHost = host; cursor = 0; effects = [];
        const tree = component(props); effects.forEach(fn => fn()); return tree;
      },
      dispose() { slots.forEach(slot => slot?.cleanup?.()); },
    };
    host.render(); return host;
  }
  const i18n = load('mobile/src/lib/i18n.tsx');
  const provider = mount(i18n.I18nProvider, { children: null });
  return { load, mount, provider, i18n, storage, document, value: () => provider.render().props.value };
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));

test('Provider chooses a supported stored language first, then the device language, then English', () => {
  const scenarios = [
    { language: 'tr-TR', stored: 'sq', expected: 'sq' },
    { language: 'sq-XK', stored: 'en', expected: 'en' },
    { language: 'SQ-al', expected: 'sq' }, { language: 'tr-TR', expected: 'tr' },
    { language: 'en-US', expected: 'en' }, { language: 'de-DE', expected: 'en' },
    { language: 'sq-AL', stored: 'de', expected: 'sq' },
    { language: 'sq-AL', stored: 'tr', readError: true, expected: 'sq' },
  ];
  for (const scenario of scenarios) {
    const storage = new Map(scenario.stored ? [['l2t-language-v1', scenario.stored]] : []);
    const app = fixture({ ...scenario, storage });
    assert.equal(app.value().locale, scenario.expected);
    assert.equal(app.i18n.localeFromStorage(), scenario.expected);
    assert.equal(app.document.documentElement.lang, scenario.expected);
    assert.equal(app.document.documentElement.dir, 'ltr');
    assert.equal(app.value().dateLocale, { tr: 'tr-TR', en: 'en-GB', sq: 'sq-AL' }[scenario.expected]);
  }
});

test('Changing to Albanian persists across a fresh provider and updates document language immediately', () => {
  const storage = new Map(); const app = fixture({ language: 'tr-TR', storage });
  app.value().setLocale('sq');
  assert.equal(app.value().locale, 'sq'); assert.equal(app.document.documentElement.lang, 'sq');
  assert.equal(storage.get('l2t-language-v1'), 'sq');
  const reloaded = fixture({ language: 'en-GB', storage });
  assert.equal(reloaded.value().locale, 'sq'); assert.equal(reloaded.value().dateLocale, 'sq-AL');
  reloaded.value().setLocale('unsupported');
  assert.equal(reloaded.value().locale, 'sq'); assert.equal(storage.get('l2t-language-v1'), 'sq');
});

test('Storage write failure keeps the chosen language usable for this session', () => {
  const app = fixture({ language: 'tr-TR', writeError: true });
  app.value().setLocale('sq');
  assert.equal(app.value().locale, 'sq'); assert.equal(app.document.documentElement.lang, 'sq');
  assert.equal(app.value().copy('Kaydet', 'Save'), 'Ruaj');
  assert.equal(app.storage.size, 0);
});

test('Language picker exposes all three languages, selects Albanian and closes its dialog', () => {
  const app = fixture({ language: 'tr-TR' });
  const { LanguagePicker } = app.load('mobile/src/components/LanguagePicker.tsx');
  const picker = app.mount(LanguagePicker);
  find(picker.render(), 'button', props => props.className === 'language-toggle').props.onClick();
  let tree = picker.render(); assert.equal(find(tree, 'Sheet').props.open, true);
  const options = nodes(tree).filter(node => node.type === 'button' && node.props.lang);
  assert.deepEqual(options.map(node => node.props.lang), ['tr', 'en', 'sq']);
  assert.deepEqual(options.map(node => text(node.props.children)), ['TürkçeTR', 'EnglishEN', 'ShqipSQ']);
  options[2].props.onClick(); app.value(); tree = picker.render();
  assert.equal(find(tree, 'Sheet').props.open, false);
  assert.equal(find(tree, 'Sheet').props.title, 'Zgjidh gjuhën');
  assert.equal(find(tree, 'button', props => props.lang === 'sq').props['aria-pressed'], true);
  assert.equal(find(tree, 'button', props => props.className === 'language-toggle').props['aria-label'], 'Gjuha e aplikacionit: Shqip');
  assert.equal(app.storage.get('l2t-language-v1'), 'sq');
});

test('Flags use bundled Turkish and British SVGs and diagonally layered Kosovo/Albania artwork', () => {
  const app = fixture(); const { LanguageFlag } = app.load('mobile/src/components/LanguagePicker.tsx');
  for (const [locale, expected] of [['tr', ['tr']], ['en', ['gb']], ['sq', ['xk', 'al']]]) {
    const tree = LanguageFlag({ locale }); const images = nodes(tree).filter(node => node.type === 'img');
    assert.equal(tree.props['aria-hidden'], 'true');
    assert.deepEqual(images.map(node => node.props.src), expected.map(code => `/flags/${code}.svg`));
    for (const image of images) {
      assert.equal(image.props.alt, '');
      for (const root of ['public', 'mobile/public']) assert.match(readFileSync(path.join(root, image.props.src.slice(1)), 'utf8'), /<svg\b/);
    }
    if (locale === 'sq') assert.equal(images[1].props.className, 'language-flag-al');
  }
  const css = readFileSync('mobile/src/components/language-picker.css', 'utf8');
  assert.match(css, /\.language-flag img\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/);
  assert.match(css, /\.language-flag-sq \.language-flag-al\s*\{\s*clip-path:\s*polygon\(100% 0, 100% 100%, 0 100%\)/);
});

test('Country names and input search use Albanian while unknown source text stays unchanged', () => {
  const app = fixture(); const i18n = app.value();
  assert.equal(i18n.countryName('ALB', 'Albania'), 'Shqipëri');
  assert.equal(i18n.countryName('XKK', 'Kosovo'), 'Kosova');
  assert.equal(i18n.countryName('UNKNOWN', 'Source country label'), 'Source country label');
  assert.equal(i18n.copy('Kaydet', 'Save'), 'Ruaj');
  assert.equal(i18n.copy('Yerel metin', 'Source text without an interface key'), 'Source text without an interface key');
  assert.equal(i18n.copy('İfade', 'Expression', 'Përkthim i posaçëm'), 'Përkthim i posaçëm');
  const changes = [];
  const picker = app.mount(app.load('mobile/src/components/CountryPicker.tsx').CountryPicker, {
    value: '', includeWorldwide: true, options: [{ code: 'AL', name: i18n.countryName('ALB', 'Albania') }, { code: 'XK', name: i18n.countryName('XKK', 'Kosovo') }],
    label: 'Destinacioni', placeholder: 'Zgjidh shtetin', onChange: value => changes.push(value),
  });
  find(picker.render(), 'button', props => props['aria-haspopup'] === 'dialog').props.onClick();
  let tree = picker.render(); const field = find(tree, 'input');
  assert.equal(field.props.placeholder, 'Kërko shtete'); assert.equal(field.props['aria-label'], 'Kërko shtete');
  field.props.onChange({ target: { value: 'shqiperi' } }); tree = picker.render();
  assert.equal(nodes(tree).filter(node => node.props?.role === 'option').length, 1);
  assert.match(text(tree), /Shqipëri/); assert.doesNotMatch(text(tree), /Kosova/);
  find(tree, 'input').props.onChange({ target: { value: 'nothing-matches' } }); tree = picker.render();
  assert.match(text(tree), /Nuk u gjet shtet që përputhet/);
  find(tree, 'button', props => props['aria-label'] === 'Pastro kërkimin').props.onClick(); tree = picker.render();
  assert.equal(find(tree, 'input').props.value, '');
  find(tree, 'button', props => props.role === 'option' && text(props.children) === 'Shqipëri').props.onClick();
  assert.deepEqual(changes, ['AL']); assert.equal(find(picker.render(), 'Sheet').props.open, false);
});

test('Date input displays Albanian dates and rejects invalid dates with localized accessible errors', () => {
  const app = fixture(); const changes = [];
  const field = app.mount(app.load('mobile/src/components/DateTimeField.tsx').DateTimeField, {
    type: 'date', label: 'Nisja', value: '2026-09-30', min: '2026-09-01', max: '2026-10-31', required: true, onChange: value => changes.push(value),
  });
  let tree = field.render();
  assert.equal(text(find(tree, 'strong')), new Intl.DateTimeFormat('sq-AL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(2026, 8, 30, 12)));
  const input = find(tree, 'input'); assert.equal(input.props['aria-label'], 'Nisja');
  input.props.onInput({ currentTarget: { value: '2026-09-31' } }); tree = field.render();
  assert.equal(changes.length, 0); assert.equal(find(tree, 'input').props['aria-invalid'], true);
  const alert = find(tree, 'span', props => props.role === 'alert');
  assert.equal(text(alert), 'Zgjidh një datë ose orë të vlefshme brenda intervalit të lejuar.');
  assert.equal(find(tree, 'input').props['aria-describedby'], alert.props.id);
  find(tree, 'input').props.onChange({ currentTarget: { value: '2026-10-03' } }); tree = field.render();
  assert.deepEqual(changes, ['2026-10-03']); assert.equal(find(tree, 'input').props['aria-invalid'], undefined);
  assert.equal(find(tree, 'span', props => props.role === 'alert'), undefined);
});

function withoutAlbanianIntl() {
  const languageList = locale => Array.isArray(locale) ? locale : [locale];
  const fallback = locale => languageList(locale).some(value => String(value).startsWith('sq')) ? 'tr-TR' : locale;
  function DateTimeFormat(locale, options) { return new Intl.DateTimeFormat(fallback(locale), options); }
  DateTimeFormat.supportedLocalesOf = locales => Intl.DateTimeFormat.supportedLocalesOf(languageList(locales).filter(value => !String(value).startsWith('sq')));
  function DisplayNames(locale, options) { return new Intl.DisplayNames(fallback(locale), options); }
  DisplayNames.supportedLocalesOf = locales => Intl.DisplayNames.supportedLocalesOf(languageList(locales).filter(value => !String(value).startsWith('sq')));
  return { DateTimeFormat, DisplayNames, NumberFormat: Intl.NumberFormat };
}

test('Bundled Albanian dates, all 30 currencies and 250 countries survive an Intl runtime that falls back to Turkish', () => {
  const app = fixture({ intl: withoutAlbanianIntl() });
  const { formatAppDate, appCurrencyName, appRegionName } = app.load('mobile/src/lib/localeFormatting.ts');
  assert.equal(app.value().countryName('ALB', 'Albania'), 'Shqipëri');
  assert.equal(app.value().countryName('XKK', 'Kosovo'), 'Kosova');
  const names = app.load('mobile/src/lib/locales/sq-regions.ts').SQ_REGIONS;
  const countries = app.load('mobile/src/data/countries.ts').ISO_3166;
  assert.equal(countries.length, 250);
  for (const country of countries) {
    assert.ok(names[country.alpha2], country.alpha2);
    assert.equal(appRegionName(country.alpha2, 'sq'), names[country.alpha2]);
  }
  const currencies = app.load('lib/travel-assistant/money.ts').CURRENCIES;
  assert.equal(currencies.length, 30);
  for (const currency of currencies) assert.notEqual(appCurrencyName(currency, 'sq'), currency);
  assert.equal(appCurrencyName('TRY', 'sq'), 'Lira turke');
  assert.equal(appCurrencyName('ALL', 'sq'), 'Leku shqiptar');
  assert.equal(appCurrencyName('UNKNOWN', 'sq'), 'UNKNOWN');
  const options = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  assert.equal(formatAppDate(new Date('2026-09-30T12:00:00Z'), 'sq', options), '30 sht 2026');
  assert.equal(formatAppDate(new Date('2026-10-01T00:30:00Z'), 'sq', { ...options, timeZone: 'America/New_York' }), '30 sht 2026', 'Fallback preserves the requested timezone');
  assert.match(formatAppDate(new Date('2026-09-30T12:00:00Z'), 'sq', { ...options, month: 'long', weekday: 'long' }), /e mërkurë.*30 shtator 2026/);
  for (let month = 0; month < 12; month++) {
    const date = new Date(Date.UTC(2026, month, 15, 12));
    assert.equal(formatAppDate(date, 'sq', options), new Intl.DateTimeFormat('sq-AL', options).format(date));
  }
});

test('Money currency labels, historical dates and input errors stay Albanian on reload with limited Intl data', async () => {
  for (const intl of [Intl, withoutAlbanianIntl()]) {
    const quote = { base: 'EUR', quote: 'TRY', rate: 55.8, date: '2026-09-30', previousRate: 55.7, previousDate: '2026-09-29', changePercent: 0.18 };
    const app = fixture({ language: 'tr-TR', storage: new Map([['l2t-language-v1', 'sq']]), intl, imports: {
      '../lib/travelAssistant': { storedQuote: () => quote, loadQuote: async () => quote },
      '../lib/native': { openExternal() { throw Error('No external navigation in locale tests'); } },
    } });
    const money = app.mount(app.load('mobile/src/components/TravelMoney.tsx').TravelMoney);
    await Promise.resolve(); let tree = money.render();
    assert.equal(text(find(tree, 'div', props => props.className === 'tm-pair')), 'EUR/TRYEuroja → Lira turke');
    assert.match(text(find(tree, 'div', props => props.className === 'tm-rate-context')), /30 sht 2026/);
    assert.doesNotMatch(text(tree), /Türk lirası|Eyl|GÜNLÜK REFERANS/);
    find(tree, 'input', props => props.id === 'tm-amount').props.onChange({ target: { value: '-2' } }); tree = money.render();
    const error = find(tree, 'p', props => props.role === 'alert');
    assert.equal(text(error), 'Shkruaj zero ose një shumë pozitive, pa ndarës të mijësheve.');
    assert.equal(find(tree, 'input').props['aria-describedby'], error.props.id);
    money.dispose();
  }
});

test('Community, saved plans, Cockpit, alerts and notification dates accept full sq-AL tags on limited Intl runtimes', () => {
  const app = fixture({ intl: withoutAlbanianIntl() });
  const { formatAppDate } = app.load('mobile/src/lib/localeFormatting.ts');
  const cases = [
    ['mobile/src/screens/CommunityScreen.tsx', 'formatQuestionDate', '30 sht 2026'],
    ['mobile/src/screens/PlansScreen.tsx', 'date', '30 sht 2026'],
    ['mobile/src/screens/CockpitScreen.tsx', 'formatDate', '30 sht 2026', '2026-09-30'],
    ['mobile/src/screens/PriceAlertsScreen.tsx', 'formatDate', '30 sht 2026', '2026-09-30'],
    ['mobile/src/screens/PriceAlertsScreen.tsx', 'formatDateTime', '30 sht'],
    ['mobile/src/components/NotificationCenter.tsx', 'formatDate', '30 sht'],
  ];
  for (const [file, name, expected, value = '2026-09-30T12:00:00Z'] of cases) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration, `${file} has its visible date formatter`);
    // Run the view's real function, isolated only from unrelated screen effects.
    const code = ts.transpileModule(`${declaration.getText(source)}\nmodule.exports = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, Date, formatAppDate, Intl: withoutAlbanianIntl() });
    const formatted = module.exports(value, 'sq-AL');
    assert.ok(formatted.includes(expected), `${file}: ${formatted}`);
    assert.doesNotMatch(formatted, /Eyl|Sept/);
    assert.equal(module.exports('not-a-date', 'sq-AL'), 'not-a-date', 'Existing invalid source-date behavior is retained');
  }
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  const sample = new Date('2026-09-30T12:00:00Z');
  for (const locale of ['tr', 'tr-TR', 'en', 'en-US', 'en-GB']) {
    assert.equal(formatAppDate(sample, locale, options), new Intl.DateTimeFormat(locale, options).format(sample), `Exact ${locale} preferences remain unchanged`);
  }
  const timestampOptions = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
  assert.equal(formatAppDate(sample, 'en-GB', timestampOptions), sample.toLocaleString('en-GB'), 'Stored/download timestamps keep their time component');
});

test('Event labels keep venue calendar days, exact timezones and date-only uncertainty with Albanian formatting', () => {
  const app = fixture({ intl: withoutAlbanianIntl() });
  const { formatAppDate } = app.load('mobile/src/lib/localeFormatting.ts');
  const { eventDateLabel, eventTimeLabel, eventLocalDate } = app.load('lib/event-time.ts');
  const event = { startsAt: '2026-10-01T00:30:00Z', localDate: '2026-09-30', timeZone: 'America/New_York', timePrecision: 'exact' };
  assert.equal(eventLocalDate(event), '2026-09-30');
  assert.equal(eventDateLabel(event, 'sq-AL', undefined, formatAppDate), '30 sht 2026');
  assert.match(eventTimeLabel(event, 'sq-AL', formatAppDate), /^20:30/);
  assert.equal(eventTimeLabel({ ...event, timePrecision: 'date' }, 'sq-AL', formatAppDate), 'Ora nuk është njoftuar');
  assert.equal(eventDateLabel({ startsAt: 'invalid' }, 'sq-AL', undefined, formatAppDate), 'Data nuk është njoftuar');
  assert.equal(event.startsAt, '2026-10-01T00:30:00Z');
});

test('Mobile visible dates use the fallback formatter while machine timezone and ISO formatting stay isolated', () => {
  const bypasses = [];
  for (const directory of ['mobile/src/screens', 'mobile/src/components']) {
    for (const entry of readdirSync(directory)) {
      if (!entry.endsWith('.tsx')) continue;
      const file = path.join(directory, entry), source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = node => {
        if (ts.isCallExpression(node)) {
          if (ts.isPropertyAccessExpression(node.expression)) {
            const member = node.expression.name.text, receiver = node.expression.expression;
            if (['toLocaleDateString', 'toLocaleTimeString'].includes(member) || member === 'toLocaleString' && ts.isNewExpression(receiver) && receiver.expression.getText(source) === 'Date') bypasses.push(`${file}: ${member}`);
            if (member === 'format' && ts.isNewExpression(receiver) && receiver.expression.getText(source) === 'Intl.DateTimeFormat') bypasses.push(`${file}: Intl.DateTimeFormat.format`);
          }
          if (ts.isIdentifier(node.expression) && ['eventDateLabel', 'eventTimeLabel'].includes(node.expression.text)) {
            if (node.arguments.at(-1)?.getText(source) !== 'formatAppDate') bypasses.push(`${file}: ${node.expression.text}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  assert.deepEqual(bypasses, []);
  assert.match(readFileSync('mobile/src/lib/dates.ts', 'utf8'), /new Intl\.DateTimeFormat\("en-CA"/);
});

test('Every static copy() interface message without an explicit third translation is covered by the Albanian catalog', t => {
  const app = fixture(); const { SQ_MESSAGES } = app.load('mobile/src/lib/locales/sq.ts');
  const keys = new Set(), missing = []; let explicit = 0;
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = node => {
        if (ts.isCallExpression(node)) {
          const name = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
          if (name === 'copy' && node.arguments.length >= 2) {
            if (node.arguments.length >= 3) explicit++;
            // Dynamic templates, user posts, provider/source text and metadata
            // are outside a literal UI catalog; explicit third translations win.
            else if (ts.isStringLiteralLike(node.arguments[1])) {
              const key = node.arguments[1].text; keys.add(key);
              if (!Object.hasOwn(SQ_MESSAGES, key) || !SQ_MESSAGES[key].trim()) {
                missing.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${key}`);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  walk('mobile/src');
  assert.ok(keys.size > 1800, 'The audit must cover the complete mobile interface, not a small sample');
  assert.deepEqual(missing, []);
  t.diagnostic(`${keys.size} unique static interface keys covered; ${explicit} explicit third-language calls excluded.`);
});
