import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';

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
  let disposed = false, postDisposeUpdates = 0;
  const changed = (before, after) => !before || !after || before.length !== after.length || after.some((value, index) => !Object.is(value, before[index]));
  const memo = (fn, deps) => { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value; };
  return {
    react: {
      useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { if (disposed) postDisposeUpdates++; slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; dirty = true; }]; },
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
    get postDisposeUpdates() { return postDisposeUpdates; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); disposed = true; },
  };
}

async function fixture(locale, { openExternal = async () => { throw Error('No external navigation in city-detail tests'); } } = {}) {
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
      if (id === '../lib/i18n') return { useI18n: () => ({ locale, copy: (tr, en, sq) => load('mobile/src/lib/locale.ts').translateCopy(locale, tr, en, sq) }) };
      if (id === '../components/Sheet') return { Sheet: props => props.open ? ({ type: 'Sheet', props }) : null };
      if (id === '../lib/native') return { openExternal };
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
  const essentials = load('mobile/src/data/cityEssentials.ts').cityEssentials;
  const essentialPhoto = load('mobile/src/data/cityEssentialPhotos.ts').cityEssentialPhoto;
  const essentialDescription = load('mobile/src/data/cityEssentialDescriptions.ts').cityEssentialDescription;
  const { CityDestinationScreen } = load('mobile/src/screens/CityDestinationScreen.tsx');
  return { catalog, highlightDetails, essentials, essentialPhoto, essentialDescription, render(code, saved = false) {
    let destination = catalog.cityDestination(code, locale); const calls = [], snapshots = [];
    assert.ok(destination, `${code}: real catalog entry`);
    let host;
    const capture = action => { calls.push(action); snapshots.push(nodes(render()).some(node => node.type === 'Sheet')); };
    const actions = Object.fromEntries(['Plan', 'Budget', 'Events', 'Back', 'OpenReadyRoute', 'ToggleSaved'].map(name => [`on${name}`, () => capture({ action: name })]));
    host = hooks(CityDestinationScreen, { destination, saved, ...actions, onMap: point => capture({ action: 'Map', point }), onSearchPlace: name => capture({ action: 'SearchPlace', name }) });
    const render = (next, flush) => { active = host; return host.render(next, flush); };
    return { get destination() { return destination; }, get tree() { return render(); }, calls, snapshots,
      get buttons() { return nodes(render()).filter(node => node.type === 'button'); },
      get sheet() { return nodes(render()).find(node => node.type === 'Sheet'); },
      changeCity(nextCode, flush = true) { destination = catalog.cityDestination(nextCode, locale); assert.ok(destination); return render({ destination }, flush); },
      replaceDestination(next) { destination = next; return render({ destination }); },
      renderWithoutEffects: () => render(undefined, false),
      get postDisposeUpdates() { return host.postDisposeUpdates; },
      dispose: () => host.dispose(),
    };
  } };
}

const labels = {
  tr: { plan: 'Rota oluştur', budget: 'Bütçe', map: 'Harita', events: 'Etkinlikler', back: 'Geri', open: 'Rotayı aç', full: 'Tüm planı gör', save: name => `${name} şehrini kaydet`, unsave: name => `${name} kaydını kaldır`, landmark: name => `${name} konumunu haritada gör` },
  en: { plan: 'Create a route', budget: 'Budget', map: 'Map', events: 'Events', back: 'Back', open: 'Open route', full: 'View full plan', save: name => `Save ${name}`, unsave: name => `Unsave ${name}`, landmark: name => `See ${name} on the map` },
  sq: { plan: 'Krijo itinerar', budget: 'Buxheti', map: 'Harta', events: 'Aktivitete', back: 'Prapa', open: 'Hap itinerarin', full: 'Shiko planin e plotë', save: name => `Ruaj ${name}`, unsave: name => `Hiq ${name} nga të ruajturat`, landmark: name => `Shih ${name} në hartë` },
  ro: { plan: 'Creează un traseu', budget: 'Buget', map: 'Hartă', events: 'Evenimente', back: 'Înapoi', open: 'Deschide traseul', full: 'Vezi planul complet', save: name => `Salvează ${name}`, unsave: name => `Elimină ${name} din salvate`, landmark: name => `Vezi ${name} pe hartă` },
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

test('All 138 added-city venue photos are bundled, credited derivatives with independent place identities', async () => {
  const f = await fixture('en');
  const directory = 'mobile/src/assets/city-essentials/';
  const manifest = JSON.parse(readFileSync(`${directory}venue-photo-credits.json`, 'utf8'));
  assert.equal(Object.keys(manifest).length, 138);
  const expected = f.catalog.cityDestinations('en').filter(city => !city.highlights.length);
  assert.equal(expected.length, 46);
  for (const city of expected) for (const place of f.essentials(city.code, 'en').places) {
    const photo = f.essentialPhoto(city.code, place.id);
    assert.ok(photo);
    const filename = path.basename(photo.photo);
    const evidence = manifest[filename];
    assert.equal(evidence.cityCode, city.code);
    assert.equal(evidence.placeId, place.id);
    assert.equal(evidence.placeName, place.name);
    assert.deepEqual(evidence.credit, JSON.parse(JSON.stringify(photo.photoCredit)), 'Compare every credit field across the isolated VM realm');
    assert.equal(evidence.identityEvidence.officialGuide.url, place.source.url);
    const bytes = readFileSync(`${directory}${filename}`);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    assert.equal(bytes.length, evidence.derivative.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.derivative.sha256);
    assert.ok(evidence.credit.author);
    assert.match(evidence.credit.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(evidence.credit.licenseUrl, /^https:\/\/(creativecommons\.org|commons\.wikimedia\.org)\//);
    assert.ok(evidence.derivative.width >= 180 && evidence.derivative.height >= 180);
    const descriptions = ['tr','en','sq','ro'].map(locale => f.essentialDescription(place.id, locale));
    assert.ok(descriptions.every(description => typeof description === 'string' && description.length >= 18));
    assert.equal(new Set(descriptions).size, 4, 'Every card description is actually translated');
  }
  assert.match(manifest['tia-bunkart-2.webp'].credit.source, /BunkArt2_Bunker_Clocktower/);
  assert.match(manifest['ams-van-gogh-museum.webp'].credit.source, /Exterior_of_the_Kurokawavleugel/);
  assert.match(manifest['lux-bock-casemates.webp'].credit.source, /Bock_casemates/);
  assert.match(manifest['lis-sao-jorge-castle.webp'].credit.source, /Castelo_de_S%C3%A3o_Jorge|Castelo_de_São_Jorge/);
  assert.match(manifest['sjj-sarajevo-city-hall.webp'].credit.source, /Sarajevo_City_Hall/);
  assert.equal(Object.values(manifest).filter(entry => entry.retainedExistingDerivative).length, 2);
  const totalBytes = Object.values(manifest).reduce((sum, entry) => sum + entry.derivative.bytes, 0);
  assert.ok(totalBytes < 12 * 1024 * 1024, 'The complete local photo set stays below a bounded 12 MiB');
});

test('Venue photo and description lookup rejects unknown, prototype and hostile keys without fallback or mutation', async () => {
  const f = await fixture('en');
  const hostile = { toString() { throw Error('Never coerce untrusted keys'); } };
  for (const id of ['__proto__', 'constructor', 'toString', 'missing-place', null, undefined, hostile]) {
    assert.equal(f.essentialPhoto('SJJ', id), undefined);
    assert.equal(f.essentialDescription(id, 'en'), undefined);
  }
  for (const city of ['__proto__', 'constructor', 'ZZZ', null, undefined, hostile]) assert.equal(f.essentialPhoto(city, 'bascarsija'), undefined);
  for (const locale of ['__proto__', 'constructor', 'de', null, undefined, hostile]) assert.equal(f.essentialDescription('bascarsija', locale), undefined);
  const before = f.essentialPhoto('SJJ', 'bascarsija');
  const originalTitle = before.photoCredit.title;
  before.photoCredit.title = 'Private caller edit'; before.photo = '/wrong-place.webp';
  assert.equal(f.essentialPhoto('SJJ', 'bascarsija').photoCredit.title, originalTitle);
  assert.notEqual(f.essentialPhoto('SJJ', 'bascarsija').photo, before.photo);
});

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

for (const [locale, words] of Object.entries(labels)) {
  test(`${locale}: all 50 cities share photographed cards with the correct venue identity, description and map action`, async () => {
    const f = await fixture(locale);
    assert.equal(f.catalog.cityDestinations(locale).length, 50);
    for (const destination of f.catalog.cityDestinations(locale)) {
      const view = f.render(destination.code);
      const cards = nodes(view.tree).filter(node => node.type === 'article' && node.props.className === 'city-place-card');
      const basic = !destination.highlights.length;
      const places = basic ? f.essentials(destination.code, locale).places : destination.highlights;
      assert.equal(cards.length, places.length, `${destination.code}: every place uses the same card structure`);
      assert.equal(nodes(view.tree).some(node => node.props?.className === 'city-essentials-list'), false, 'The text-only alternate layout is gone');
      const credits = nodes(view.tree).find(node => node.type === 'CityPhotoCredits' && !node.props.compact);
      for (const [index, card] of cards.entries()) {
        const place = places[index];
        const photo = nodes(card).find(node => node.type === 'DestinationPhoto');
        const expectedPhoto = basic ? f.essentialPhoto(destination.code, place.id) : place;
        assert.ok(expectedPhoto?.photo, `${destination.code}/${place.id}: a real local venue image is required`);
        assert.equal(photo.props.src, expectedPhoto.photo);
        assert.equal(photo.props.label, place.name);
        assert.ok(existsSync(photo.props.src), `${destination.code}/${place.id}: image bytes are bundled`);
        assert.equal(nodes(card).filter(node => node.props?.className === 'city-place-open').length, 1);
        const summary = nodes(card).find(node => node.props?.className === 'city-place-summary');
        const category = nodes(card).find(node => node.props?.className === 'city-place-category');
        assert.ok(text(category).length > 1);
        assert.ok(text(summary).length >= 18, `${destination.code}/${place.id}: a readable short description is shown`);
        const map = nodes(card).find(node => node.type === 'button' && node.props.className === 'city-place-map');
        assert.equal(accessibleName(map), words.landmark(place.name));
        if (basic) {
          assert.notEqual(photo.props.src, destination.photo, 'A destination panorama is not a venue photograph');
          assert.equal(text(summary), f.essentialDescription(place.id, locale));
          const credit = credits.props.destinations.find(item => item.code === place.id);
          assert.deepEqual(credit.photoCredit, expectedPhoto.photoCredit);
          assert.ok(credit.photoCredit.author && credit.photoCredit.license && credit.photoCredit.licenseUrl);
          map.props.onClick();
          assert.deepEqual(view.calls.splice(0), [{ action: 'SearchPlace', name: f.essentials(destination.code, 'en').places[index].name }]);
          nodes(card).find(node => node.type === 'button' && node.props.className === 'city-place-open').props.onClick();
          assert.equal(view.sheet.props.title, place.name);
          assert.ok(text(view.sheet).includes(text(summary)));
          const source = nodes(view.sheet).find(node => node.props?.className === 'city-place-source');
          assert.ok(text(source).includes(place.source.title));
          nodes(view.sheet).find(node => node.props?.className === 'city-detail-primary').props.onClick();
          assert.equal(view.sheet, undefined);
          assert.deepEqual(view.calls.splice(0), [{ action: 'SearchPlace', name: f.essentials(destination.code, 'en').places[index].name }]);
          assert.equal(view.snapshots.at(-1), false, 'The detail closes before navigation');
        }
      }
      view.dispose();
    }
  });
}

test('Bucharest keeps all three real places, venue-specific photos and their attribution in all languages', async () => {
  for (const locale of Object.keys(labels)) {
    const { render } = await fixture(locale);
    const view = render('OTP');
    const articles = nodes(view.tree).filter(node => node.type === 'article' && node.props.className === 'city-place-card');
    assert.equal(articles.length, 3, 'Every reviewed place remains discoverable in the shared card layout');
    const photos = articles.map(article => nodes(article).find(node => node.type === 'DestinationPhoto'));
    assert.match(photos[0].props.src, /otp-palace-of-parliament\.webp$/, 'Parliament now has its own reviewed photo, never the city panorama');
    assert.notEqual(photos[0].props.src, view.destination.photo);
    assert.match(photos[1].props.src, /otp-romanian-athenaeum\.webp$/);
    assert.match(photos[2].props.src, /otp-dimitrie-gusti-village-museum\.webp$/);
    const credits = nodes(view.tree).find(node => node.type === 'CityPhotoCredits');
    for (const [index, id] of [[1, 'romanian-athenaeum'], [2, 'dimitrie-gusti-village-museum']]) {
      const credit = credits.props.destinations.find(item => item.code === id);
      assert.equal(credit.name, photos[index].props.label);
      assert.ok(credit.photoCredit.author);
      assert.match(credit.photoCredit.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      assert.match(credit.photoCredit.licenseUrl, /^https:\/\/creativecommons\.org\/licenses\/by-sa\//);
    }
    for (const [index, article] of articles.entries()) {
      const name = photos[index].props.label;
      const search = nodes(article).find(node => node.type === 'button' && /harita|map|hart[ëă]/i.test(accessibleName(node)));
      assert.ok(search, `${locale}: one useful map search for ${name}`);
      search.props.onClick();
      assert.deepEqual(view.calls.at(-1), { action: 'SearchPlace', name: ['Palace of Parliament', 'Romanian Athenaeum', 'Dimitrie Gusti National Village Museum'][index] }, 'All UI languages retain a recognised international place query');
    }
    assert.ok(view.calls.every(call => call.action === 'SearchPlace'), 'Reading and searching do not save a record or start a paid route');
    view.dispose();
  }
});

const deferredSource = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settleSource = () => new Promise(resolve => setImmediate(resolve));
const sourceAlert = tree => nodes(tree).find(node => node.props?.role === 'alert');
const sourceFeedback = {
  tr: { warning: 'Resmî sayfa açılamadı. İnternet bağlantını kontrol et.', retry: 'Tekrar dene' },
  en: { warning: 'The official page could not open. Check your connection.', retry: 'Try again' },
  sq: { warning: 'Faqja zyrtare nuk u hap. Kontrollo lidhjen.', retry: 'Provo sërish' },
  ro: { warning: 'Pagina oficială nu a putut fi deschisă. Verifică conexiunea.', retry: 'Încearcă din nou' },
};

test('Official city sources show localized scoped failure and recover only after an explicit retry', async () => {
  for (const [locale, words] of Object.entries(sourceFeedback)) for (const kind of ['essential', 'highlight']) {
    const opened = []; let successful = false;
    const f = await fixture(locale, { openExternal: async url => { opened.push(url); if (kind === 'highlight' && !successful) throw Error('Fictional handoff rejection'); return successful; } });
    const view = f.render(kind === 'essential' ? 'OTP' : 'FCO');
    try {
      view.buttons.find(node => node.props.className === 'city-place-open').props.onClick();
      const source = view.buttons.find(node => node.props.className === 'city-place-source');
      source.props.onClick(); await settleSource();
      const alert = sourceAlert(view.tree); assert.ok(alert); assert.match(text(alert), new RegExp(words.warning.replaceAll('.', '\\.')));
      assert.equal(nodes(view.tree).filter(node => node.props?.role === 'alert').length, 1);
      const retry = nodes(alert).find(node => node.type === 'button' && text(node) === words.retry); assert.ok(retry);
      assert.equal(opened.length, 1); assert.deepEqual(view.calls, []); assert.equal(Boolean(view.sheet), true, 'Both kinds retain an operable local detail sheet');
      successful = true; retry.props.onClick(); assert.equal(sourceAlert(view.tree), undefined, 'A new explicit attempt clears its previous warning'); await settleSource();
      assert.equal(sourceAlert(view.tree), undefined); assert.equal(opened.length, 2); assert.equal(opened[0], opened[1], 'Retry opens the same current reviewed source'); assert.deepEqual(view.calls, []);
    } finally { view.dispose(); }
  }
});

test('A late official-source response cannot overwrite a newer source failure in the same city', async () => {
  const pending = [], f = await fixture('en', { openExternal: url => { const task = deferredSource(); pending.push({ url, ...task }); return task.promise; } }), view = f.render('OTP');
  try {
    const cards = view.buttons.filter(node => node.props.className === 'city-place-open');
    cards[0].props.onClick(); view.buttons.find(node => node.props.className === 'city-place-source').props.onClick(); view.sheet.props.onClose();
    cards[1].props.onClick(); view.buttons.find(node => node.props.className === 'city-place-source').props.onClick(); pending[1].resolve(false); await settleSource();
    assert.ok(sourceAlert(view.sheet)); assert.match(view.sheet.props.title, /Athenaeum/);
    const currentAlert = text(sourceAlert(view.sheet));
    pending[0].resolve(false); await settleSource(); assert.equal(text(sourceAlert(view.sheet)), currentAlert); assert.match(view.sheet.props.title, /Athenaeum/); assert.equal(pending.length, 2); assert.deepEqual(view.calls, []);
  } finally { view.dispose(); }
});

test('A superseded same-source retry cannot restore its warning after the latest explicit success', async () => {
  const pending = [], f = await fixture('en', { openExternal: () => { const task = deferredSource(); pending.push(task); return task.promise; } }), view = f.render('OTP');
  try {
    view.buttons.find(node => node.props.className === 'city-place-open').props.onClick();
    const source = view.buttons.find(node => node.props.className === 'city-place-source'); source.props.onClick(); pending[0].resolve(false); await settleSource();
    nodes(sourceAlert(view.tree)).find(node => node.type === 'button').props.onClick(); source.props.onClick();
    pending[2].resolve(true); await settleSource(); pending[1].reject(Error('Fictional late previous retry')); await settleSource();
    assert.equal(sourceAlert(view.tree), undefined); assert.equal(pending.length, 3); assert.deepEqual(view.calls, []);
  } finally { view.dispose(); }
});

test('Old source failure stays hidden before effects across city A→B→A', async () => {
  const pending = deferredSource(), f = await fixture('en', { openExternal: () => pending.promise }), view = f.render('OTP');
  try {
    view.buttons.find(node => node.props.className === 'city-place-open').props.onClick();
    view.buttons.find(node => node.props.className === 'city-place-source').props.onClick();
    view.changeCity('FCO', false); view.changeCity('OTP', false); view.renderWithoutEffects();
    pending.resolve(false); await settleSource(); assert.equal(sourceAlert(view.renderWithoutEffects()), undefined, 'Returning to the same code is a new panel identity, even before effect cleanup'); assert.deepEqual(view.calls, []);
  } finally { view.dispose(); }
});

test('Closing and reopening a highlight, including another highlight in between, fences old failure before effects', async () => {
  for (const visitAnother of [false, true]) {
    const pending = deferredSource(), f = await fixture('en', { openExternal: () => pending.promise }), view = f.render('FCO');
    try {
      const places = view.buttons.filter(node => node.props.className === 'city-place-open'); places[0].props.onClick();
      const close = view.sheet.props.onClose; view.buttons.find(node => node.props.className === 'city-place-source').props.onClick();
      close(); view.renderWithoutEffects();
      if (visitAnother) { places[1].props.onClick(); view.renderWithoutEffects(); }
      places[0].props.onClick(); view.renderWithoutEffects(); pending.resolve(false); await settleSource();
      const tree = view.renderWithoutEffects(); assert.ok(nodes(tree).find(node => node.type === 'Sheet')); assert.equal(sourceAlert(tree), undefined); assert.deepEqual(view.calls, []);
    } finally { view.dispose(); }
  }
});

test('An unmounted city detail never receives late official-source feedback or retries the handoff', async () => {
  const pending = deferredSource(), opened = [], f = await fixture('en', { openExternal: url => { opened.push(url); return pending.promise; } }), view = f.render('OTP');
  view.buttons.find(node => node.props.className === 'city-place-open').props.onClick();
  view.buttons.find(node => node.props.className === 'city-place-source').props.onClick(); view.dispose(); pending.resolve(false); await settleSource();
  assert.equal(view.postDisposeUpdates, 0); assert.equal(opened.length, 1); assert.deepEqual(view.calls, []);
});
