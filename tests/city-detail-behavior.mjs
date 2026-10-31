import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Render the production detail and heart components, not a copied handler.
// Photos/icons/credits stay inert; this suite checks actions, not presentation.
const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object'
  ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const accessibleName = node => node.props['aria-label'] || text(node);

function hooks(component, initialProps) {
  const slots = []; let cursor = 0, dirty = false, pending = [], props = initialProps;
  const changed = (before, after) => !before || !after || before.length !== after.length || after.some((value, index) => !Object.is(value, before[index]));
  const memo = (fn, deps) => { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value; };
  return {
    react: {
      useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; dirty = true; }]; },
      useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
      useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useId: () => ':city-detail-test:',
      useEffect(fn, deps) { const index = cursor++, before = slots[index]; if (!before || changed(before.deps, deps)) { slots[index] = { ...before, deps }; pending.push(() => { before?.cleanup?.(); slots[index].cleanup = fn(); }); } },
    },
    render(next, flush = true) {
      if (next) props = { ...props, ...next };
      for (let count = 0; count < 15; count++) {
        cursor = 0; dirty = false;
        const tree = component(props);
        if (!flush) return tree;
        const effects = pending; pending = [];
        effects.forEach(effect => effect());
        if (!dirty) return tree;
      }
      throw Error('City detail render did not settle');
    },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

async function fixture(locale) {
  const cache = new Map();
  let active;
  const inert = new Map(['Icon', 'DestinationPhoto', 'CityPhotoCredits', 'CountryFlag'].map(name => [name, { [name]: name }]));
  const load = filename => {
    const full = path.resolve(filename);
    const component = path.basename(full, path.extname(full));
    if (inert.has(component)) return inert.get(component);
    if (full.endsWith('.css')) return {};
    if (/\.(webp|png|svg)$/.test(full)) return { __esModule: true, default: full };
    if (full.endsWith('.json')) return JSON.parse(readFileSync(full, 'utf8'));
    if (cache.has(full)) return cache.get(full).exports;
    const loadedModule = { exports: {} }; cache.set(full, loadedModule);
    const code = ts.transpileModule(readFileSync(full, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
      Date, Intl, URL,
      window: { matchMedia: () => ({ matches: true }) },
      fetch() { throw Error('No network in city-detail regression tests'); },
    }, { filename: full })(id => {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === 'react') return Object.fromEntries(['useState', 'useRef', 'useMemo', 'useCallback', 'useId', 'useEffect'].map(name => [name, (...args) => active.react[name](...args)]));
      if (id === '../lib/i18n') return { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en }) };
      if (id === '../components/Sheet') return { Sheet: props => props.open ? ({ type: 'Sheet', props }) : null };
      if (id === '../lib/native') return { openExternal: async () => { throw Error('No external navigation in city-detail tests'); } };
      if (!id.startsWith('.')) throw Error(`Unexpected city-detail dependency: ${id}`);
      const base = path.resolve(path.dirname(full), id);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!target) throw Error(`Missing city-detail dependency: ${id}`);
      return load(target);
    }, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  };
  await load('mobile/src/lib/locale.ts').loadLocaleMessages(locale);
  const catalog = load('mobile/src/data/cityDestinations.ts');
  const highlightDetails = load('mobile/src/data/cityHighlightDetails.ts').cityHighlightDetails;
  const { CityDestinationScreen } = load('mobile/src/screens/CityDestinationScreen.tsx');
  return { catalog, highlightDetails, render(code, saved = false) {
    let destination = catalog.cityDestination(code, locale); const calls = [], snapshots = [];
    assert.ok(destination, `${code}: real catalog entry`);
    let host;
    const capture = action => { calls.push(action); snapshots.push(nodes(render()).some(node => node.type === 'Sheet')); };
    const actions = Object.fromEntries(['Plan', 'Budget', 'Events', 'Back', 'OpenReadyRoute', 'ToggleSaved'].map(name => [`on${name}`, () => capture({ action: name })]));
    host = hooks(CityDestinationScreen, { destination, saved, ...actions, onMap: point => capture({ action: 'Map', point }) });
    const render = (next, flush) => { active = host; return host.render(next, flush); };
    return { get destination() { return destination; }, get tree() { return render(); }, calls, snapshots,
      get buttons() { return nodes(render()).filter(node => node.type === 'button'); },
      get sheet() { return nodes(render()).find(node => node.type === 'Sheet'); },
      changeCity(nextCode, flush = true) { destination = catalog.cityDestination(nextCode, locale); assert.ok(destination); return render({ destination }, flush); },
      replaceDestination(next) { destination = next; return render({ destination }); },
      dispose: () => host.dispose(),
    };
  } };
}

const labels = {
  tr: { plan: 'Rota oluştur', budget: 'Bütçe', map: 'Harita', events: 'Etkinlikler', back: 'Keşfet’e dön', open: 'Rotayı aç', full: 'Tüm planı gör', save: name => `${name} şehrini kaydet`, unsave: name => `${name} kaydını kaldır`, landmark: name => `${name} konumunu haritada gör` },
  en: { plan: 'Create a route', budget: 'Budget', map: 'Map', events: 'Events', back: 'Back to Discover', open: 'Open route', full: 'View full plan', save: name => `Save ${name}`, unsave: name => `Unsave ${name}`, landmark: name => `See ${name} on the map` },
  sq: { plan: 'Krijo itinerar', budget: 'Buxheti', map: 'Harta', events: 'Aktivitete', back: 'Kthehu te Zbulo', open: 'Hap itinerarin', full: 'Shiko planin e plotë', save: name => `Ruaj ${name}`, unsave: name => `Hiq ${name} nga të ruajturat`, landmark: name => `Shih ${name} në hartë` },
  ro: { plan: 'Creează un traseu', budget: 'Buget', map: 'Hartă', events: 'Evenimente', back: 'Înapoi la Descoperă', open: 'Deschide traseul', full: 'Vezi planul complet', save: name => `Salvează ${name}`, unsave: name => `Elimină ${name} din salvate`, landmark: name => `Vezi ${name} pe hartă` },
};
function button(view, label) {
  const matches = view.buttons.filter(node => accessibleName(node) === label);
  assert.equal(matches.length, 1, `One operable action named ${label}`);
  return matches[0];
}
const sheetButtons = sheet => ({ buttons: nodes(sheet).filter(node => node.type === 'button') });
function placeDetailsButton(view, point, words) {
  const matches = view.buttons.filter(node => accessibleName(node).includes(point.name) && accessibleName(node) !== words.landmark(point.name));
  assert.equal(matches.length, 1, `${point.name}: one distinct detail action beside the map action`);
  return matches[0];
}

for (const [locale, words] of Object.entries(labels)) {
  test(`${locale}: real city detail retains independent actions and exact landmark identity`, async () => {
    const { render } = await fixture(locale);
    for (const code of ['CDG', 'DPS', 'HND', 'FCO']) {
      const view = render(code);
      assert.ok(nodes(view.tree).some(node => node.type === 'h1' && text(node) === view.destination.name));
      for (const [label, action] of [[words.plan, 'Plan'], [words.budget, 'Budget'], [words.events, 'Events'], [words.back, 'Back']]) {
        button(view, label).props.onClick();
        assert.deepEqual(view.calls.splice(0), [{ action }], `${code}: ${action} must not trigger another action`);
      }
      button(view, words.map).props.onClick();
      assert.equal(view.calls.length, 1); assert.equal(view.calls[0].action, 'Map'); assert.equal(view.calls[0].point, undefined); view.calls.length = 0;
      for (const point of view.destination.highlights) {
        button(view, words.landmark(point.name)).props.onClick();
        assert.equal(view.calls.length, 1); assert.equal(view.calls[0].action, 'Map');
        assert.strictEqual(view.calls[0].point, point, 'Pass the original matching landmark, including exact map coordinates');
        view.calls.length = 0;
      }
      button(view, words.save(view.destination.name)).props.onClick();
      assert.deepEqual(view.calls.splice(0), [{ action: 'ToggleSaved' }]);
      assert.equal(button(view, words.save(view.destination.name)).props['aria-pressed'], false);
      const saved = render(code, true);
      assert.equal(button(saved, words.unsave(saved.destination.name)).props['aria-pressed'], true);
      button(saved, words.unsave(saved.destination.name)).props.onClick();
      assert.deepEqual(saved.calls, [{ action: 'ToggleSaved' }]);
    }
  });

  test(`${locale}: ready routes are optional and cities without verified landmarks remain usable`, async () => {
    const { render } = await fixture(locale);
    const ready = render('FCO');
    assert.ok(ready.destination.route?.dailyPlan.length > 0);
    const open = ready.buttons.filter(node => text(node).includes(words.open));
    assert.equal(open.length, 1); open[0].props.onClick();
    assert.deepEqual(ready.calls, [{ action: 'OpenReadyRoute' }]);
    for (const code of ['HND', 'OTP']) {
      const view = render(code);
      assert.equal(view.destination.route, null);
      assert.equal(view.buttons.filter(node => text(node).includes(words.open)).length, 0, 'Do not offer an unavailable ready route');
      if (code === 'OTP') {
        assert.equal(view.destination.highlights.length, 0);
        assert.equal(view.buttons.some(node => /undefined|null/.test(accessibleName(node))), false);
      }
      button(view, words.plan).props.onClick(); button(view, words.map).props.onClick();
      assert.equal(view.calls.length, 2); assert.equal(view.calls[0].action, 'Plan'); assert.equal(view.calls[1].action, 'Map'); assert.equal(view.calls[1].point, undefined);
    }
  });

  test(`${locale}: place details expand locally, dismiss safely and hand the same landmark to the map`, async () => {
    const { render, highlightDetails } = await fixture(locale);
    for (const code of ['CDG', 'DPS', 'HND', 'FCO']) {
      const view = render(code);
      for (const point of view.destination.highlights) {
        placeDetailsButton(view, point, words).props.onClick();
        assert.deepEqual(view.calls, [], 'Reading details must not start navigation or save a record');
        assert.equal(view.sheet?.props.title, point.name);
        const details = highlightDetails(point.id, locale);
        assert.ok(details);
        assert.ok(text(view.sheet).includes(details.description), 'The panel shows this exact landmark description in the selected language');
        assert.ok(text(view.sheet).includes(details.tip), 'The matching editorial visit tip remains available');
        if (point.photoCredit) {
          const pageCredits = nodes(view.tree).find(node => node.type === 'CityPhotoCredits' && !node.props.compact);
          const panelCredits = nodes(view.sheet).find(node => node.type === 'CityPhotoCredits');
          assert.ok(pageCredits.props.destinations.some(item => item.code === point.id && item.photoCredit === point.photoCredit), 'The page exposes the matching photograph attribution');
          assert.equal(panelCredits.props.destinations[0].photoCredit, point.photoCredit, 'Attribution follows the photo into its detail panel');
        }
        view.sheet.props.onClose(); assert.equal(view.sheet, undefined); assert.deepEqual(view.calls, []);
        placeDetailsButton(view, point, words).props.onClick();
        const mapWord = { tr: /harita/i, en: /map/i, sq: /hart[ëa]/i, ro: /hart[ăa]/i }[locale];
        const actions = sheetButtons(view.sheet).buttons.filter(node => mapWord.test(accessibleName(node)) || accessibleName(node) === words.landmark(point.name));
        assert.equal(actions.length, 1, 'The place panel has one clear map action');
        actions[0].props.onClick();
        assert.equal(view.calls.length, 1); assert.equal(view.calls[0].action, 'Map'); assert.strictEqual(view.calls[0].point, point);
        assert.equal(view.snapshots.at(-1), false, 'Close the panel before handing control to parent navigation');
        assert.equal(view.sheet, undefined); view.calls.length = 0;
      }
      view.dispose();
    }
    const fallback = render('FCO'), original = fallback.destination;
    const pointWithoutCopy = { ...original.highlights[0], id: 'unlisted-fixture-landmark' };
    assert.equal(highlightDetails(pointWithoutCopy.id, locale), undefined);
    assert.doesNotThrow(() => fallback.replaceDestination({ ...original, highlights: [pointWithoutCopy] }));
    assert.ok(text(fallback.tree).includes(pointWithoutCopy.name), 'Missing editorial copy never hides the actual place name');
    button(fallback, words.landmark(pointWithoutCopy.name)).props.onClick();
    assert.equal(fallback.calls.length, 1); assert.strictEqual(fallback.calls[0].point, pointWithoutCopy);
    fallback.dispose();
  });

  test(`${locale}: route preview and expanded plan retain original rows, duration and grouped days`, async () => {
    const { render } = await fixture(locale);
    for (const code of ['CDG', 'DPS', 'FCO', 'SJJ', 'TIA', 'BEG']) {
      const view = render(code), route = view.destination.route;
      assert.ok(route);
      assert.deepEqual(nodes(view.tree).filter(node => node.type === 'li').map(text), Array.from(route.dailyPlan.slice(0, 2)), 'Preview exactly the first two editorial rows without invented day labels');
      assert.ok(text(view.tree).includes(route.idealDuration), 'Duration comes from the actual route, not the number of text rows');
      button(view, words.full).props.onClick();
      assert.ok(view.sheet); assert.deepEqual(view.calls, []);
      assert.deepEqual(nodes(view.sheet).filter(node => node.type === 'li').map(text), Array.from(route.dailyPlan), 'Expanded view preserves every original row, including any multi-day group');
      assert.ok(text(view.sheet).includes(route.why));
      view.sheet.props.onClose(); assert.equal(view.sheet, undefined); assert.deepEqual(view.calls, []);
      button(view, words.full).props.onClick();
      button(sheetButtons(view.sheet), words.open).props.onClick();
      assert.deepEqual(view.calls, [{ action: 'OpenReadyRoute' }]); assert.equal(view.snapshots.at(-1), false); assert.equal(view.sheet, undefined);
      view.dispose();
    }
    for (const code of ['HND', 'OTP']) {
      const view = render(code);
      assert.equal(view.buttons.some(node => accessibleName(node) === words.full), false, 'A city without a real route cannot expand a fabricated plan');
    }
  });

  test(`${locale}: a new city never renders or revives a previous city panel`, async () => {
    const { render } = await fixture(locale);
    for (const kind of ['place', 'route']) {
      const view = render('FCO'), point = view.destination.highlights[0];
      if (kind === 'place') placeDetailsButton(view, point, words).props.onClick(); else button(view, words.full).props.onClick();
      assert.ok(view.sheet);
      const firstNewRender = view.changeCity('HND', false);
      assert.equal(nodes(firstNewRender).some(node => node.type === 'Sheet'), false, 'Hide old-city content before effects run');
      assert.equal(view.sheet, undefined);
      view.changeCity('FCO'); assert.equal(view.sheet, undefined, 'Returning later must not reopen a panel dismissed by city navigation');
      assert.deepEqual(view.calls, []); view.dispose();
    }
  });
}

test('Rome editorial additions retain four distinct categories, translations and isolated source metadata', async () => {
  for (const locale of Object.keys(labels)) {
    const { highlightDetails } = await fixture(locale);
    const ids = ['pantheon', 'vatican-museums', 'trastevere', 'villa-borghese'];
    const entries = ids.map(id => highlightDetails(id, locale));
    assert.equal(new Set(entries.map(entry => entry.category)).size, 4);
    for (const [index, entry] of entries.entries()) {
      assert.ok(entry.summary && entry.description && entry.tip);
      assert.match(entry.source.url, /^https:\/\/(www\.turismoroma\.it|www\.museivaticani\.va)\//);
      const title = entry.source.title;
      entry.source.title = 'Private note';
      assert.equal(highlightDetails(ids[index], locale).source.title, title);
    }
    for (const id of ['__proto__', 'constructor', 'toString', 'missing-place']) assert.equal(highlightDetails(id, locale), undefined);
  }
});
