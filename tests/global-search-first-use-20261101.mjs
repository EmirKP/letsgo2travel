import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const button = (tree, label) => find(tree, 'button', props => text(props.children) === label);
const tick = () => new Promise(resolve => setImmediate(resolve));

function loader(imports = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    const full = path.resolve(file);
    if (cache.has(full)) return cache.get(full).exports;
    if (full.endsWith('.json')) return JSON.parse(readFileSync(full, 'utf8'));
    const loadedModule = { exports: {} }; cache.set(full, loadedModule);
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Intl, Date, ...globals }, { filename: full })(name => {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name.endsWith('.css')) return {};
      if (/\.(webp|png|svg)$/.test(name)) return name;
      if (!name.startsWith('.')) throw Error(`Unexpected search dependency ${name}`);
      const base = path.resolve(path.dirname(full), name);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!target) throw Error(`Missing search dependency ${name}`);
      return load(target);
    }, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}

function hooks() {
  const slots = []; let cursor = 0, dirty = false, effects = [], component, props;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, index) => value !== b[index]);
  const memo = (fn, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; };
  return {
    react: {
      useState(initial) { const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
      useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
      useId: () => 'search-first-use', useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
      useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || changed(old.deps, deps)) { slots[i] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    },
    start(fn, initial) { component = fn; props = initial; return this.render(); },
    render(next, flush = true) { if (next) props = { ...props, ...next }; for (let i = 0; i < 15; i++) { cursor = 0; dirty = false; const tree = component(props); if (!flush) return tree; const tasks = effects; effects = []; tasks.forEach(fn => fn()); if (!dirty) return tree; } throw Error('Search fixture did not settle'); },
    close() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

async function fixture({ locale = 'en', initialQuery = 'Paris', ownerId = null, accessToken = '', readSaved = () => [], ...extra } = {}) {
  const h = hooks(), requests = [], calls = [], focus = [], listeners = new Map();
  const window = { addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }, removeEventListener: (name, fn) => listeners.get(name)?.delete(fn) };
  let language = locale;
  const imports = {
    react: h.react,
    './Sheet': { Sheet: 'Sheet' }, './Icon': { Icon: 'Icon' }, './TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
    './CityPhotoCredits': { CityPhotoCredits: 'CityPhotoCredits' }, './DestinationSearchFallback': { DestinationSearchFallback: 'DestinationSearchFallback' },
    '../lib/storage': { getSavedRoutePlans: readSaved },
    '../lib/supabaseData': { listCockpitTrips: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })) },
    '../lib/i18n': { useI18n: () => ({ locale: language, copy: (tr, en, sq) => messages.translateCopy(language, tr, en, sq) }) },
  };
  const load = loader(imports, { window });
  const messages = load('mobile/src/lib/locale.ts'); await messages.loadLocaleMessages(locale);
  const Component = load('mobile/src/components/GlobalSearchSheet.tsx').GlobalSearchSheet;
  const initial = { open: true, initialQuery, ownerId, accessToken, onClose: () => calls.push('close'), onOpenTrip: id => calls.push(`trip:${id}`), onOpenSavedRoute: id => calls.push(`route:${id}`), onOpenCountry: id => calls.push(`country:${id}`), onSearchDestination: query => calls.push(`query:${query}`), onOpenTool: tool => calls.push(`tool:${tool}`), onNavigate: view => calls.push(`view:${view}`), ...extra };
  let tree = h.start(Component, initial), previousRefs = [];
  function render(next, flush = true) {
    tree = h.render(next, flush);
    previousRefs.forEach(ref => { ref.current = null; }); previousRefs = [];
    const elements = nodes(tree);
    const dom = new Map(elements.map(node => [node, { focus: () => focus.push({ type: node.type, text: text(node) }), blur: () => focus.push({ type: 'blur' }), querySelector: selector => {
      if (selector === 'section li button') {
        const section = elements.find(item => item.type === 'section' && find(item, 'li'));
        return section ? dom.get(find(section, 'button')) : null;
      }
      const className = selector.replace(/^\./, '').split(' ')[0];
      const target = elements.find(item => item.props?.className?.split(' ').includes(className));
      return target ? dom.get(selector.endsWith(' button') ? find(target, 'button') : target) : null;
    } }]));
    for (const node of elements) if (node.props?.ref && typeof node.props.ref === 'object') { node.props.ref.current = dom.get(node); previousRefs.push(node.props.ref); }
    return tree;
  }
  render();
  return { h, requests, calls, focus, messages, load, render, tree: () => tree, async language(next) { await messages.loadLocaleMessages(next); language = next; return render(); }, close() { h.close(); assert([...listeners.values()].every(set => set.size === 0)); } };
}

test('Keyboard Search moves to a visible result without navigating, while IME and empty Enter remain untouched', async () => {
  const f = await fixture();
  try {
    const input = find(f.tree(), 'input');
    assert.equal(input.props.enterKeyHint, 'search');
    assert.equal(typeof input.props.onKeyDown, 'function', 'The advertised Search key must have a useful action');
    let prevented = 0;
    const event = { key: 'Enter', nativeEvent: { isComposing: false }, currentTarget: input.props.ref.current, preventDefault: () => prevented++ };
    input.props.onKeyDown(event);
    assert.equal(prevented, 1); assert.equal(f.focus[0].type, 'blur');
    assert.equal(f.focus.at(-1).type, 'button'); assert.match(f.focus.at(-1).text, /Paris/); assert.deepEqual(f.calls, []);
    f.focus.length = 0; input.props.onKeyDown({ ...event, nativeEvent: { isComposing: true } }); assert.equal(prevented, 1); assert.deepEqual(f.focus, []);
    input.props.onChange({ target: { value: '  ' } }); const empty = find(f.render(), 'input');
    empty.props.onKeyDown({ ...event, currentTarget: empty.props.ref.current }); assert.equal(prevented, 1); assert.deepEqual(f.focus, []);
  } finally { f.close(); }
});

test('A signed-out saved-trip search shows sign-in guidance rather than a false no-result summary', async () => {
  const f = await fixture();
  try {
    button(f.tree(), 'Saved trips').props.onClick(); const tree = f.render();
    assert.match(text(tree), /Sign in to search your saved trips/);
    assert.doesNotMatch(text(tree), /No results[. ]|No results in the other categories/);
  } finally { f.close(); }
});

test('Private loading and read failures never claim the unavailable category was searched empty', async () => {
  const f = await fixture({ ownerId: 'owner-a', accessToken: 'test-session' });
  try {
    button(f.tree(), 'Saved trips').props.onClick(); let tree = f.render();
    assert.match(text(tree), /Loading your saved trips/); assert.doesNotMatch(text(tree), /No results/);
    f.requests[0].reject(Error('offline')); await tick(); tree = f.render();
    assert.match(text(tree), /could not be loaded/); assert.doesNotMatch(text(tree), /No results/);
    button(tree, 'Try again').props.onClick(); f.render(); assert.equal(f.requests.length, 2);
    f.requests[1].resolve([]); await tick(); tree = f.render(); assert.match(text(tree), /There are results in other categories/);
  } finally { f.close(); }
  const local = await fixture({ readSaved: () => { throw Error('storage unavailable'); } });
  try { button(local.tree(), 'Saved routes').props.onClick(); const tree = local.render(); assert.match(text(tree), /could not be read/); assert.doesNotMatch(text(tree), /No results/); } finally { local.close(); }
});

test('The first-use search and scoped sign-in guidance follow all four selected languages', async () => {
  const cases = { tr: ['Kayıtlı seyahatler', 'giriş yap'], en: ['Saved trips', 'Sign in'], sq: ['Udhëtimet e ruajtura', 'Hyr për'], ro: ['Călătorii salvate', 'Conectează-te'] };
  for (const [locale, [label, hint]] of Object.entries(cases)) {
    const f = await fixture({ locale });
    try { button(f.tree(), label).props.onClick(); assert(text(f.render()).includes(hint), `${locale}: localized sign-in help`); } finally { f.close(); }
  }
});

test('Search key reveals the existing place fallback or category recovery without starting either automatically', async () => {
  const unknown = await fixture({ initialQuery: 'unlisted fictional destination' });
  try {
    const input = find(unknown.tree(), 'input');
    input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, currentTarget: input.props.ref.current, preventDefault() {} });
    assert.match(unknown.focus.at(-1).text, /Plan a route for/); assert.deepEqual(unknown.calls, []);
    assert.equal(input.props.value, 'unlisted fictional destination');
  } finally { unknown.close(); }
  const category = await fixture({ initialQuery: 'visa' });
  try {
    button(category.tree(), 'Cities').props.onClick(); const tree = category.render(), input = find(tree, 'input');
    input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, currentTarget: input.props.ref.current, preventDefault() {} });
    assert.equal(category.focus.at(-1).text, 'Search all categories');
    assert.equal(button(category.render(), 'Cities').props['aria-pressed'], true, 'Enter does not silently widen the chosen scope');
    assert.equal(find(category.tree(), 'input').props.value, 'visa'); assert.deepEqual(category.calls, []);
  } finally { category.close(); }
});

test('Search key focuses an explicit retry after a private lookup fails and does not resend requests itself', async () => {
  const f = await fixture({ ownerId: 'owner-a', accessToken: 'test-session' });
  try {
    button(f.tree(), 'Saved trips').props.onClick(); f.render();
    f.requests[0].reject(Error('offline')); await tick(); const tree = f.render(), input = find(tree, 'input');
    input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, currentTarget: input.props.ref.current, preventDefault() {} });
    assert.equal(f.focus.at(-1).text, 'Try again'); assert.equal(f.requests.length, 1); assert.deepEqual(f.calls, []);
  } finally { f.close(); }
});

test('Query, category and loading scope cannot expose a previous owner before effects or delayed requests settle', async () => {
  const f = await fixture({ ownerId: 'owner-a', accessToken: 'test-a', initialQuery: 'Private city' });
  try {
    button(f.tree(), 'Saved trips').props.onClick(); f.render();
    let tree = f.render({ ownerId: 'owner-b', accessToken: 'test-b' }, false);
    assert.doesNotMatch(text(tree), /Private trip A/);
    tree = f.render(); assert.equal(f.requests.length, 2);
    f.requests[0].resolve([{ id: 'trip-a', userId: 'owner-a', destinationCity: 'Private trip A', destinationCountry: 'France', destinationCode: 'FR', startDate: '2027-01-01', endDate: '2027-01-03' }]);
    await tick(); tree = f.render(); assert.doesNotMatch(text(tree), /Private trip A/);
    f.requests[1].resolve([]); await tick(); tree = f.render(); assert.doesNotMatch(text(tree), /Private trip A/);
    assert.deepEqual(f.calls, []);
  } finally { f.close(); }
});
