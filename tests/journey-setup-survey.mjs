import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const tick = () => new Promise(resolve => setImmediate(resolve));
const jsx = (type, props, key) => ({ type, props, key });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const city = (name, latitude = 40, longitude = 20) => ({ name, latitude, longitude, sourceUrl: 'https://maps.apple.com/' });

function fixture(options = {}) {
  let active, dirty = false, effects = [], output, visited = new Set();
  const fibers = new Map();
  let locale = options.locale || 'en';
  const calls = { search: [], generate: [], saved: [], cancel: 0, focus: [] };
  const storage = options.storage || new Map();
  let timerId = 0, now = 0;
  const timers = new Map();
  const timerApi = { setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id) };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (options.storageFails) throw Error('quota'); storage.set(key, value); }, removeItem: key => storage.delete(key), key: i => [...storage.keys()][i], get length() { return storage.size; } };
  const load = (path, imports = {}) => {
    const fixtureModule = { exports: {} }, source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { window: { localStorage }, Date })(name => imports[name], fixtureModule, fixtureModule.exports);
    return fixtureModule.exports;
  };
  const draftLib = load('mobile/src/lib/journeySurveyDraft.ts');
  const searchText = load('mobile/src/lib/searchText.ts');
  const areas = load('mobile/src/lib/travelAreas.ts');
  const areaClient = { knownJourneyArea: name => ['İstanbul', 'Paris', 'Tokyo', 'Tirana'].includes(name) ? city(name) : null };
  const suggestions = load('mobile/src/lib/journeyAreaSuggestions.ts', { './mapJourneyClient': areaClient, './searchText': searchText, './travelAreas': areas });
  let props = { ownerId: options.ownerId ?? null, draftScope: options.draftScope, initialCity: options.initialCity, initialValues: options.initialValues,
    savedPlans: options.savedPlans || [], onOpenSaved: id => calls.saved.push(id),
    onGenerate: value => calls.generate.push(value), onCancel: () => calls.cancel++ };
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, index) => !Object.is(value, a[index]));
  const react = {
    useState(initial) { const fiber = active, i = fiber.cursor++; if (!fiber.slots[i]) fiber.slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [fiber.slots[i].value, next => { const value = typeof next === 'function' ? next(fiber.slots[i].value) : next; if (!Object.is(value, fiber.slots[i].value)) { fiber.slots[i].value = value; dirty = true; } }]; },
    useRef(initial) { const i = active.cursor++; if (!active.slots[i]) active.slots[i] = { current: initial }; return active.slots[i]; },
    useEffect(fn, deps) { const fiber = active, i = fiber.cursor++, old = fiber.slots[i]; if (!old || changed(old.deps, deps)) { fiber.slots[i] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); fiber.slots[i].cleanup = fn(); }); } },
  };
  const fixtureModule = { exports: {} };
  const source = ts.transpileModule(readFileSync('mobile/src/components/JourneySetupSurvey.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const imports = {
    '../lib/surveyKeyboard': {observeSurveyKeyboard:()=>()=>{}},
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, './Icon': { Icon: 'Icon' }, './journey-setup-survey.css': {},
    './WelcomeArtwork': { WelcomeArtwork: 'WelcomeArtwork' }, '../lib/journeySurveyDraft': draftLib, '../lib/journeyAreaSuggestions': suggestions,
    '../lib/onboardingPreferences': { readWelcomePreferences: () => ({ interests: options.welcomeInterests ?? ['Kültür', 'Yeme-içme'] }) },
    '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq : en }) },
    '../lib/mapJourneyClient': {
      knownJourneyArea: name => ['İstanbul', 'Paris', 'Tokyo', 'Tirana'].includes(name) ? city(name) : null,
      searchJourneyArea: (...args) => { calls.search.push(args); return options.search ? options.search(...args) : Promise.resolve([city(args[0])]); },
    },
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, AbortController, ...timerApi })(name => {
    assert.ok(Object.hasOwn(imports, name), `Missing import ${name}`); return imports[name];
  }, fixtureModule, fixtureModule.exports);
  function resolve(node, path = 'root') {
    if (Array.isArray(node)) return node.map((child, index) => resolve(child, `${path}/${child?.key ?? index}`));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const key = `${path}:${node.type.name}:${node.key ?? ''}`;
      visited.add(key);
      let fiber = fibers.get(key);
      if (!fiber) { fiber = { slots: [], cursor: 0 }; fibers.set(key, fiber); }
      fiber.cursor = 0; active = fiber;
      return resolve(node.type(node.props), `${key}/render`);
    }
    if (node.props?.ref) node.props.ref.current = { scrollTop: 0, closest: () => null, focus() { calls.focus.push(node.props.id || node.type); } };
    return { ...node, props: { ...node.props, children: resolve(node.props?.children, `${path}/children`) } };
  }
  const app = {
    calls,
    storage, draftLib,
    async advance(ms = 300) { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } await tick(); return this.render(); },
    render(next = {}) {
      props = { ...props, ...next };
      for (let i = 0; i < 15; i++) {
        dirty = false; effects = []; visited = new Set();
        output = resolve(jsx(fixtureModule.exports.JourneySetupSurvey, props));
        for (const [key, fiber] of fibers) if (!visited.has(key)) { fiber.slots.forEach(slot => slot?.cleanup?.()); fibers.delete(key); }
        effects.forEach(fn => fn());
        if (!dirty) return output;
      }
      throw Error('Unstable survey');
    },
    get tree() { return output; },
    get title() { return text(find(output, 'h3')); },
    input(id, value) { const node = find(output, 'input', p => p.id === id) || find(output, 'textarea', p => p.id === id); assert.ok(node, `Missing input ${id}`); node.props.onChange({ target: { value } }); return this.render(); },
    choose(name, value) { const node = find(output, 'input', p => p.name === name && p.value === value); assert.ok(node, `Missing choice ${name} ${value}`); node.props.onChange(); return this.render(); },
    toggle(value) { const node = find(output, 'input', p => p.type === 'checkbox' && p.value === value); assert.ok(node); node.props.onChange(); return this.render(); },
    click(label) { const node = find(output, 'button', p => text(p.children) === label); assert.ok(node, `Missing button ${label}`); assert.ok(!node.props.disabled); node.props.onClick(); return this.render(); },
    submit() { find(output, 'form').props.onSubmit({ preventDefault() {} }); return this.render(); },
    locale(value) { locale = value; return this.render(); },
    dispose() { fibers.forEach(fiber => fiber.slots.forEach(slot => slot?.cleanup?.())); },
  };
  app.render();
  return app;
}

test('The first question accepts a resolved city outside the examples and never reuses an edited destination', async () => {
  const app = fixture({ search: async () => [city('Kyoto, Japan', 35.01, 135.77)] });
  try {
    assert.equal(app.title, 'Where would you like to go?');
    assert.equal(find(app.tree, 'input', p => p.id === 'jsv-city').props.maxLength, 160);
    app.input('jsv-city', 'Ky'); await app.advance();
    assert.equal(app.calls.search.length, 0);
    assert.equal(find(app.tree, 'button', p => text(p.children) === 'Search'), undefined);
    app.input('jsv-city', 'Kyoto');
    app.submit();
    assert.match(text(app.tree), /Type a destination and choose a result/);
    await app.advance();
    app.click('Kyoto, Japan');
    app.input('jsv-city', 'Osaka');
    app.submit();
    assert.equal(app.title, 'Where would you like to go?');
    assert.equal(app.calls.generate.length, 0);
    await app.advance();
    app.click('Kyoto, Japan'); app.submit(); app.submit(); app.submit(); app.submit();
    assert.equal(app.calls.generate.length, 1);
    assert.equal(app.calls.generate[0].area.name, 'Kyoto, Japan');
    assert.equal(app.calls.generate[0].area.longitude, 135.77);
    assert.ok(app.calls.search.every(args => args[2] === 'en'));
  } finally { app.dispose(); }
});

test('Typing, language changes and unmount cancel searches; late replies never replace current destination results', async () => {
  const old = deferred(), current = deferred(), afterLanguage = deferred();
  let number = 0;
  const app = fixture({ search: () => [old, current, afterLanguage][number++].promise });
  app.input('jsv-city', 'Kyoto'); await app.advance();
  app.input('jsv-city', 'Osaka');
  assert.equal(app.calls.search[0][1].aborted, true);
  await app.advance(); current.resolve([city('Osaka')]); await tick(); app.render();
  old.resolve([city('Kyoto')]); await tick(); app.render();
  assert.ok(find(app.tree, 'button', p => text(p.children) === 'Osaka'));
  assert.ok(!find(app.tree, 'button', p => text(p.children) === 'Kyoto'));
  app.input('jsv-city', 'Lisbon'); await app.advance(); app.locale('sq');
  assert.equal(app.calls.search[2][1].aborted, true);
  afterLanguage.resolve([city('Lisbon')]); await tick(); app.render();
  assert.ok(!find(app.tree, 'button', p => text(p.children) === 'Lisbon'));
  app.dispose();
  const pending = deferred(), closing = fixture({ search: () => pending.promise });
  closing.input('jsv-city', 'Kyoto'); await closing.advance(); closing.dispose();
  assert.equal(closing.calls.search[0][1].aborted, true);
  pending.resolve([city('Kyoto')]); await tick();
});

test('Four-step answers survive Back, failed generation and cancellation; a retry preserves the selected intent', () => {
  const app = fixture();
  try {
    app.click('Tokyo'); app.submit();
    app.input('jsv-days', '5'); app.click('Specific dates'); app.input('jsv-date', '2027-04-12'); app.submit();
    app.choose('jsv-party', 'family'); app.choose('jsv-budget', 'economical'); app.choose('jsv-pace', 'relaxed'); app.choose('jsv-walking', 'light');
    app.submit(); app.toggle('nature'); app.input('jsv-notes', '  Children aged 5 and 8, with a sunset stop.  ');
    app.click('Back');
    assert.equal(find(app.tree, 'input', p => p.value === 'family').props.checked, true);
    app.submit(); app.submit();
    const first = JSON.parse(JSON.stringify(app.calls.generate[0]));
    assert.deepEqual(first, { area: city('Tokyo'), dayCount: 5, startDate: '2027-04-12', party: 'family', budget: 'economical', pace: 'relaxed', walking: 'light', interests: ['culture', 'food', 'nature'], notes: 'Children aged 5 and 8, with a sunset stop.' });
    app.render({ busy: true });
    assert.match(text(app.tree), /Creating your personal itinerary/);
    app.click('Stop and edit my choices'); assert.equal(app.calls.cancel, 1);
    app.render({ busy: false, error: 'Please try again.' });
    assert.equal(find(app.tree, 'textarea').props.value.trim(), first.notes);
    app.submit();
    assert.equal(app.calls.generate.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(app.calls.generate[1])), first);
    app.render({ busy: true }); app.render({ busy: false, error: 'Temporary failure' });
    app.submit(); assert.equal(app.calls.generate.length, 3);
  } finally { app.dispose(); }
});

test('Invalid day counts, dates and empty interests stay actionable and focus the field that needs correction', () => {
  const app = fixture();
  try {
    app.click('Paris'); app.submit();
    for (const value of ['', '0', '15', '2.5', 'x']) {
      app.input('jsv-days', value); app.submit();
      assert.equal(app.title, 'How many days will you explore?');
      assert.equal(app.calls.focus.at(-1), 'jsv-days');
    }
    app.input('jsv-days', '3'); app.click('Specific dates'); app.input('jsv-date', '2027-02-30'); app.submit();
    assert.equal(app.calls.focus.at(-1), 'jsv-date');
    app.click('Flexible'); app.submit(); app.submit();
    app.toggle('culture'); app.toggle('food'); app.submit();
    assert.match(text(app.tree), /Choose at least one interest/);
    assert.equal(app.calls.generate.length, 0);
    app.toggle('shopping'); app.submit();
    assert.equal(app.calls.generate[0].startDate, null);
    assert.deepEqual([...app.calls.generate[0].interests], ['shopping']);
  } finally { app.dispose(); }
});

test('Rapid repeated transitions cannot skip validation and duplicate final submits generate only once', () => {
  const app = fixture({ initialCity: 'Tokyo' });
  try {
    const firstSubmit = find(app.tree, 'form').props.onSubmit;
    firstSubmit({ preventDefault() {} }); firstSubmit({ preventDefault() {} }); app.render();
    assert.equal(app.title, 'How many days will you explore?');
    app.submit(); app.submit();
    const finalSubmit = find(app.tree, 'form').props.onSubmit;
    finalSubmit({ preventDefault() {} }); finalSubmit({ preventDefault() {} });
    assert.equal(app.calls.generate.length, 1);
  } finally { app.dispose(); }
});

test('Turkish, English and Albanian steps update in place, and saved plans stay a secondary real action', () => {
  const app = fixture({ locale: 'tr', savedPlans: [{ id: 'saved-kyoto', city: 'Kyoto', dayCount: 4 }] });
  try {
    assert.equal(app.title, 'Nereye gitmek istiyorsun?');
    assert.match(text(app.tree), /Kayıtlı planlarım/);
    app.click('Kyoto4 gün'); assert.deepEqual(app.calls.saved, ['saved-kyoto']);
    app.click('İstanbul'); app.submit();
    app.input('jsv-days', '7'); app.locale('sq');
    assert.equal(app.title, 'Sa ditë do të eksplorosh?');
    assert.equal(find(app.tree, 'input', p => p.id === 'jsv-days').props.value, '7');
    app.click('Prapa'); assert.equal(app.title, 'Ku dëshiron të shkosh?');
    assert.equal(find(app.tree, 'input', p => p.id === 'jsv-city').props.value, 'İstanbul');
    app.locale('en'); assert.equal(app.title, 'Where would you like to go?');
    assert.ok(app.calls.focus.filter(value => value === 'h3').length >= 3);
  } finally { app.dispose(); }
});

test('Reopened preferences restore the complete survey without searching or mutating the saved plan', () => {
  const initial = { area: city('Kyoto, Japan', 35, 135), dayCount: 6, startDate: null, party: 'friends', budget: 'comfortable', pace: 'busy', walking: 'light', interests: ['nature'], notes: 'Sunset views' };
  const app = fixture({ initialValues: initial });
  try {
    app.submit(); app.submit(); app.submit(); app.submit();
    assert.equal(app.calls.search.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(app.calls.generate[0])), initial);
    assert.equal(app.calls.saved.length, 0);
  } finally { app.dispose(); }
});

test('Autocomplete offers Istanbul immediately, debounces provider calls, and requires an explicit neighbourhood choice', async () => {
  const neighbourhood = { ...city('Sultan Ahmet Mh.', 41.006, 28.976), address: 'Sultan Ahmet, Fatih, İstanbul, Türkiye' };
  const app = fixture({ search: async () => [neighbourhood] });
  try {
    app.input('jsv-city', 'ist');
    assert.match(text(find(app.tree, 'ul', p => p.id === 'jsv-results')), /İstanbulİstanbul, Türkiye/);
    assert.equal(app.calls.search.length, 0);
    app.input('jsv-city', 'Sultan');
    await app.advance(299); assert.equal(app.calls.search.length, 0);
    await app.advance(1); assert.equal(app.calls.search.length, 1);
    assert.match(text(app.tree), /Sultan Ahmet, Fatih, İstanbul, Türkiye/);
    app.submit(); assert.equal(app.title, 'Where would you like to go?');
    const input = find(app.tree, 'input', p => p.id === 'jsv-city');
    input.props.onKeyDown({ key: 'ArrowDown', preventDefault() {} }); app.render();
    find(app.tree, 'input', p => p.id === 'jsv-city').props.onKeyDown({ key: 'Enter', preventDefault() {} }); app.render();
    app.submit(); app.submit(); app.submit(); app.submit();
    assert.equal(app.calls.generate[0].area.name, neighbourhood.name);
    assert.equal(app.calls.generate[0].area.address, neighbourhood.address);
  } finally { app.dispose(); }
});

test('Closing and reloading restores the exact step and answers, while another owner and edit scope stay isolated', () => {
  const storage = new Map(), app = fixture({ ownerId: 'owner-a', storage });
  app.click('Paris'); app.submit(); app.input('jsv-days', '7'); app.click('Specific dates'); app.input('jsv-date', '2027-10-20');
  app.input('jsv-time', '15:30'); app.submit(); app.choose('jsv-party', 'family'); app.submit(); app.input('jsv-notes', 'Quiet afternoon'); app.dispose();
  const reopened = fixture({ ownerId: 'owner-a', storage });
  try {
    assert.equal(reopened.title, 'What would you love to discover?');
    assert.match(text(reopened.tree), /First day 15:30/);
    assert.equal(find(reopened.tree, 'textarea').props.value, 'Quiet afternoon');
    reopened.submit();
    assert.equal(reopened.calls.generate[0].dayCount, 7);
    assert.equal(reopened.calls.generate[0].firstDayStartTime, '15:30');
    assert.equal(reopened.calls.generate[0].party, 'family');
    reopened.render({ ownerId: 'owner-b' });
    assert.equal(reopened.title, 'Where would you like to go?');
    assert.equal(find(reopened.tree, 'input', p => p.id === 'jsv-city').props.value, '');
    assert.doesNotMatch(text(reopened.tree), /Quiet afternoon/);
    reopened.render({ ownerId: 'owner-a', draftScope: 'edit:another-plan' });
    assert.equal(find(reopened.tree, 'input', p => p.id === 'jsv-city').props.value, '');
  } finally { reopened.dispose(); }
});

test('Welcome interests retain their exact meaning, cap at four, and optional first-day time survives flexible dates', () => {
  const app = fixture({ welcomeInterests: ['Şehir', 'Deniz', 'Doğa', 'Macera'] });
  try {
    app.click('Tokyo'); app.submit(); app.input('jsv-time', '23:00'); app.submit();
    assert.equal(app.calls.focus.at(-1), 'jsv-time');
    app.input('jsv-time', '14:30'); app.submit();
    assert.match(text(app.tree), /A balanced day with time to explore and rest/);
    app.choose('jsv-pace', 'busy'); assert.match(text(app.tree), /More stops and shorter visits/);
    assert.doesNotMatch(text(app.tree), /A balanced day with time to explore and rest/);
    app.submit();
    assert.equal(find(app.tree, 'input', p => p.value === 'food').props.disabled, true);
    app.toggle('city'); app.toggle('food'); app.submit();
    assert.deepEqual([...app.calls.generate[0].interests], ['sea', 'nature', 'adventure', 'food']);
    assert.equal(app.calls.generate[0].startDate, null);
    assert.equal(app.calls.generate[0].firstDayStartTime, '14:30');
  } finally { app.dispose(); }
});

test('The day wheel supports keyboard and direct entry; summary cards return to the real editable step', () => {
  const app = fixture();
  try {
    app.click('Paris'); app.submit();
    const wheel = () => find(app.tree, 'div', p => p.className === 'jsv-wheel');
    wheel().props.onKeyDown({ key: 'End', preventDefault() {} }); app.render();
    assert.equal(find(app.tree, 'input', p => p.id === 'jsv-days').props.value, '14');
    wheel().props.onKeyDown({ key: 'ArrowUp', preventDefault() {} }); app.render();
    assert.equal(find(app.tree, 'input', p => p.id === 'jsv-days').props.value, '13');
    app.input('jsv-days', '4'); app.submit();
    const summary = find(app.tree, 'div', p => p.className === 'jsv-completed');
    find(summary, 'button', p => text(p.children).startsWith('When')).props.onClick(); app.render();
    assert.equal(app.title, 'How many days will you explore?');
    assert.equal(find(app.tree, 'input', p => p.id === 'jsv-days').props.value, '4');
  } finally { app.dispose(); }
});

test('Unreadable and future drafts are preserved, storage failure remains usable, and explicit account cleanup is exact', () => {
  const prefix = 'l2t.journey-survey.v1:';
  const storage = new Map([[`${prefix}owner:a:new`, '{broken'], [`${prefix}owner:ab:new`, '{other'], [`${prefix}guest:new`, '{guest'], [`${prefix}owner:a:edit%3A1`, '{owned']]);
  const app = fixture({ ownerId: 'a', storage });
  try {
    assert.match(text(app.tree), /This device cannot keep your answers/);
    app.click('Paris'); assert.equal(storage.get(`${prefix}owner:a:new`), '{broken');
    assert.equal(app.draftLib.clearJourneySurveyDraft('a'), false);
    assert.equal(app.draftLib.clearOwnerJourneySurveyDrafts(''), false);
    assert.equal(app.draftLib.clearOwnerJourneySurveyDrafts('a'), true);
    assert.equal(storage.has(`${prefix}owner:a:new`), false); assert.equal(storage.has(`${prefix}owner:a:edit%3A1`), false);
    assert.equal(storage.get(`${prefix}owner:ab:new`), '{other'); assert.equal(storage.get(`${prefix}guest:new`), '{guest');
  } finally { app.dispose(); }
  const future = new Map([[`${prefix}guest:new`, JSON.stringify({ version: 9, draft: {} })]]), futureApp = fixture({ storage: future });
  futureApp.click('Tokyo'); assert.equal(JSON.parse(future.get(`${prefix}guest:new`)).version, 9); futureApp.dispose();
  const blocked = fixture({ storageFails: true });
  try { blocked.click('Tokyo'); blocked.submit(); blocked.submit(); blocked.submit(); blocked.submit(); assert.equal(blocked.calls.generate.length, 1); }
  finally { blocked.dispose(); }
});

test('Changing accounts aborts an unfinished autocomplete and cannot reveal its late destination results', async () => {
  const pending = deferred(), app = fixture({ ownerId: 'owner-a', search: () => pending.promise });
  try {
    app.input('jsv-city', 'Private location'); await app.advance();
    app.render({ ownerId: 'owner-b' });
    assert.equal(app.calls.search[0][1].aborted, true);
    pending.resolve([city('Old account destination')]); await tick(); app.render();
    assert.doesNotMatch(text(app.tree), /Old account destination/);
    assert.equal(find(app.tree, 'input', p => p.id === 'jsv-city').props.value, '');
  } finally { app.dispose(); }
});

test('Animated mobile keyboard keeps the focused destination visible, frees suggestions, and cleans its viewport listeners',()=>{
  const source=ts.transpileModule(readFileSync('mobile/src/lib/surveyKeyboard.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const events=()=>({listeners:new Map(),addEventListener(name,fn){this.listeners.set(name,fn);},removeEventListener(name){this.listeners.delete(name);}});
  const viewport={...events(),height:800};let next=0;const frames=new Map();
  const window={...events(),innerHeight:800,visualViewport:viewport,requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)};
  const scroller={scrollTop:0,getBoundingClientRect:()=>({top:100,bottom:360})};
  const input={matches:()=>true,getBoundingClientRect:()=>({top:500-scroller.scrollTop,bottom:540-scroller.scrollTop})};
  const document={activeElement:input};
  const root={...events(),dataset:{},contains:element=>element===input,querySelector:()=>scroller};
  const fixtureModule={exports:{}};vm.runInNewContext(`(function(module,exports){${source}\n})`,{window,document})(fixtureModule,fixtureModule.exports);
  const cleanup=fixtureModule.exports.observeSurveyKeyboard(root);
  const flush=()=>{const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn());};
  flush();assert.equal(root.dataset.keyboard,'false');assert.equal(scroller.scrollTop,0);
  viewport.height=400;viewport.listeners.get('resize')();flush();
  assert.equal(root.dataset.keyboard,'true');assert.equal(scroller.scrollTop,384);
  assert.ok(input.getBoundingClientRect().top>=100&&input.getBoundingClientRect().bottom<280);
  document.activeElement=null;root.listeners.get('focusout')();flush();assert.equal(root.dataset.keyboard,'false');
  viewport.listeners.get('resize')();cleanup();flush();
  assert.equal(root.dataset.keyboard,undefined);assert.equal(viewport.listeners.size,0);assert.equal(root.listeners.size,0);assert.equal(window.listeners.size,0);
});
