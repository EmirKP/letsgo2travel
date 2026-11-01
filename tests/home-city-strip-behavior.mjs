import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

function homeFixture() {
  const require = createRequire(import.meta.url), file = 'tests/planning-ux.mjs';
  let setup = readFileSync(file, 'utf8'), activeHost, locale = 'en', reduced = false;
  const observers = [], storageWrites = [];
  const browser = {
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: reduced }),
    localStorage: { setItem: (...args) => storageWrites.push(args), removeItem: (...args) => storageWrites.push(args) },
  };
  class VisibilityObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.disconnected = true; }
    deliver(target, visible = true) { this.callback([{ target, isIntersecting: visible }]); }
  }
  const react = new Proxy({}, { get: (_target, name) => name === 'useId' ? () => 'home-fixture' : (...args) => activeHost.react[name](...args) });
  const i18n = { useI18n: () => ({ locale, dateLocale: 'en-GB', copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en }) };
  const globals = { Date, Intl, URL, URLSearchParams, console, process, setTimeout, clearTimeout, setImmediate, Event, EventTarget, AbortController, Error,
    fixtureImports: { react, '../lib/i18n': i18n }, fixtureEnvironment: { window: browser, IntersectionObserver: VisibilityObserver } };
  const source = ts.createSourceFile(file, setup, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of [...source.statements].reverse()) if (ts.isImportDeclaration(statement)) {
    const imported = statement.moduleSpecifier.text === 'node:test' ? { default: () => {} } : require(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (clause?.name) globals[clause.name.text] = imported.default ?? imported;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const member of clause.namedBindings.elements) globals[member.name.text] = imported[member.propertyName?.text || member.name.text];
    setup = setup.slice(0, statement.pos) + setup.slice(statement.end);
  }
  const output = { exports: {} };
  const code = ts.transpileModule(`${setup}\nconst baseLoad=load;load=(file,imports={},environment={})=>baseLoad(file,file==='mobile/src/screens/HomeScreen.tsx'?{...imports,...fixtureImports}:imports,file==='mobile/src/screens/HomeScreen.tsx'?{...environment,...fixtureEnvironment}:environment);module.exports={hooks,loadHome,guestHomeProps,nodes,text,find};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(module,exports){${code}\n})`, globals)(output, output.exports);
  const { hooks, loadHome, guestHomeProps, nodes, text, find } = output.exports;
  // One production module, fresh React hook state on each remount. The public
  // position cache therefore has the same lifetime as the real lazy module.
  const Home = loadHome({ react });
  let host, view, mountedNav;
  const opened = [], saved = [], catalogs = [], navigated = [];
  function mount(owner = 'owner-a', language = 'en', width = 80, options = {}) {
    locale = language; activeHost = host = hooks();
    view = host.start(Home, { ...guestHomeProps, ownerId: owner,
      onOpenCity: code => opened.push(code), onToggleCitySaved: code => saved.push(code),
      savedCityCodes: ['CDG'], onOpenAllCities: () => catalogs.push(language), onNavigate: value => navigated.push(value), ...options });
    const nav = find(view, 'nav', props => props.className === 'rh-city-chips');
    const articles = nodes(nav).filter(node => node.type === 'article');
    const cards = articles.map((article, index) => ({ dataset: { homeCityCode: article.props['data-home-city-code'] }, offsetLeft: 6 + index * (width + 7), offsetWidth: width }));
    const element = { scrollLeft: 0, clientWidth: 300, scrollWidth: 6 + cards.length * (width + 7), querySelectorAll: () => cards };
    mountedNav = { nav, articles, cards, element }; nav.props.ref(element);
    return mountedNav;
  }
  return { mount, opened, saved, catalogs, navigated, observers, storageWrites, nodes, text, find,
    get view() { return view; }, reduce: value => { reduced = value; },
    scroll(left) { mountedNav.element.scrollLeft = left; mountedNav.nav.props.onScroll({ currentTarget: mountedNav.element }); },
    unmount() { mountedNav.nav.props.ref(null); host.dispose(); },
  };
}

test('Opening a city and going back restores the same city anchor even when card widths change', () => {
  const f = homeFixture();
  let row = f.mount('return-owner', 'en', 80);
  f.scroll(6 + 10 * 87 + 13);
  const city = row.cards[10].dataset.homeCityCode;
  f.find(row.articles[10], 'button', props => props.className?.includes('rh-city-card')).props.onClick();
  assert.deepEqual(f.opened, [city]);
  f.unmount(); row = f.mount('return-owner', 'en', 90);
  assert.equal(row.element.scrollLeft, 6 + 10 * 97 + 13);
  assert.equal(f.storageWrites.length, 0, 'Public scroll position never writes saved/account/browser storage');
  f.unmount();
});

test('Account and language positions stay separate, and a hidden zero-width node cannot erase a remembered position', () => {
  const f = homeFixture();
  f.mount('owner-a', 'en'); f.scroll(430); f.unmount();
  let row = f.mount('owner-b', 'en'); assert.equal(row.element.scrollLeft, 0); f.scroll(210); f.unmount();
  row = f.mount('owner-a', 'tr'); assert.equal(row.element.scrollLeft, 0); f.scroll(310); f.unmount();
  row = f.mount('owner-a', 'en'); assert.equal(row.element.scrollLeft, 430);
  row.element.clientWidth = 0; row.element.scrollLeft = 0; f.unmount();
  row = f.mount('owner-a', 'en'); assert.equal(row.element.scrollLeft, 430); f.unmount();
  row = f.mount('owner-a', 'tr'); assert.equal(row.element.scrollLeft, 310); f.unmount();
  row = f.mount('owner-b', 'en'); assert.equal(row.element.scrollLeft, 210); f.unmount();
  assert.equal(f.storageWrites.length, 0);
});

test('Visible cards get one reveal only; offscreen or disconnected callbacks do not animate them', () => {
  const f = homeFixture(), row = f.mount();
  const observer = f.observers[0];
  assert.equal(observer.options.root, row.element);
  observer.deliver(row.cards[0], false); assert.equal(row.cards[0].dataset.homeCityVisible, undefined);
  observer.deliver(row.cards[0]); assert.equal(row.cards[0].dataset.homeCityVisible, 'true');
  assert.equal(observer.targets.has(row.cards[0]), false, 'A revealed card stops being observed');
  f.unmount(); assert.equal(observer.disconnected, true);
  observer.deliver(row.cards[1]); assert.equal(row.cards[1].dataset.homeCityVisible, undefined);
});

test('Reduced motion keeps all fifty city and heart actions usable without a reveal observer', () => {
  const f = homeFixture(); f.reduce(true); const row = f.mount();
  assert.equal(f.observers.length, 0); assert.equal(row.articles.length, 50);
  const hearts = f.nodes(row.nav).filter(node => node.type?.name === 'CityHeartButton');
  assert.equal(hearts.length, 50); assert.equal(hearts[0].props.saved, true);
  hearts[1].props.onToggle();
  assert.deepEqual(f.saved, [row.cards[1].dataset.homeCityCode]); assert.deepEqual(f.opened, []);
  assert.ok(row.cards.every(card => card.dataset.homeCityVisible === undefined));
  f.unmount();
});

test('Long public city names remain complete and receive compact fit treatment in each language', () => {
  const f = homeFixture();
  for (const locale of ['tr', 'en', 'sq', 'ro']) {
    const row = f.mount('name-owner', locale);
    for (const code of ['SJJ', 'EDI', 'ARN']) {
      const article = row.articles.find(node => node.props['data-home-city-code'] === code);
      assert.ok(article); assert.equal(article.props['data-home-long-name'], 'true');
      const card = f.find(article, 'button', props => props.className?.includes('rh-city-card'));
      assert.equal(f.text(f.find(card, 'strong')), card.props['aria-label']);
      const country = f.find(card, 'small'); assert.equal(card.props['aria-describedby'], country.props.id);
      assert.ok(f.text(country));
    }
    assert.ok(row.articles.slice(0, 4).every(article => !article.props['data-home-long-name']), 'The original four short cards keep their compact width');
    f.unmount();
  }
});

test('Seven-letter Turkish city names found clipped on phones receive the same wider fit as longer names', () => {
  const f = homeFixture(), row = f.mount('phone-name-owner', 'tr');
  for (const code of ['SJJ', 'LUX', 'HAM', 'AMS', 'WAW', 'VCE', 'GVA']) {
    const article = row.articles.find(node => node.props['data-home-city-code'] === code);
    const card = f.find(article, 'button', props => props.className?.includes('rh-city-card'));
    assert.equal(article.props['data-home-long-name'], 'true', `${card.props['aria-label']} must not use the narrow short-name card`);
    assert.equal(f.text(f.find(card, 'strong')), card.props['aria-label']);
  }
  assert.ok(row.articles.slice(0, 4).every(article => !article.props['data-home-long-name']));
  f.unmount();
});

test('English Warsaw fits the wider phone card while the original four remain compact in every language', () => {
  const f = homeFixture(), row = f.mount('english-phone-name-owner', 'en');
  const article = row.articles.find(node => node.props['data-home-city-code'] === 'WAW');
  const card = f.find(article, 'button', props => props.className?.includes('rh-city-card'));
  assert.equal(card.props['aria-label'], 'Warsaw');
  assert.equal(article.props['data-home-long-name'], 'true', 'Six-letter Warsaw needs additional room at320px');
  f.unmount();
  for (const locale of ['tr', 'en', 'sq', 'ro']) {
    const localized = f.mount('original-phone-name-owner', locale);
    assert.ok(localized.articles.slice(0, 4).every(city => !city.props['data-home-long-name']));
    f.unmount();
  }
});

test('The country catalog link explains its destination in all four languages and preserves the navigation fallback', () => {
  const f = homeFixture(), labels = { tr: 'Ülkeler', en: 'Countries', sq: 'Shtetet', ro: 'Țări' };
  for (const [locale, label] of Object.entries(labels)) {
    f.mount('catalog-owner', locale);
    const action = f.find(f.view, 'button', props => props.className === 'rh-city-view-all');
    assert.equal(f.text(action), label); assert.ok(action.props['aria-label']); action.props.onClick(); f.unmount();
  }
  assert.deepEqual(f.catalogs, ['tr', 'en', 'sq', 'ro']);
  f.mount('fallback-owner', 'en', 80, { onOpenAllCities: undefined });
  f.find(f.view, 'button', props => props.className === 'rh-city-view-all').props.onClick();
  assert.deepEqual(f.navigated, ['explore']); f.unmount();
});
