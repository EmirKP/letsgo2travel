import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function load(path, imports, globals = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Date, Intl, ...globals })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (/\.(webp|jpg|css)$/.test(name)) return name;
    throw Error(`Unstubbed import: ${name}`);
  }, testModule, testModule.exports);
  return testModule.exports;
}
const countries = load('mobile/src/data/countries.ts', { './iso3166.json': JSON.parse(readFileSync('mobile/src/data/iso3166.json', 'utf8')) });
const countryIso = load('mobile/src/data/countryIso.ts', { './countries': countries });
const discovery = load('mobile/src/data/communityDiscovery.ts', { './countries': countries });
function nodes(value) {
  if (!value || typeof value !== 'object' || value.props?.hidden || (value.type === 'Sheet' && !value.props.open)) return [];
  return [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join('');
  return value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const button = (tree, label) => find(tree, 'button', props => props['aria-label'] === label || text(props.children).trim() === label);
const byClass = (tree, name) => nodes(tree).find(node => node.props?.className?.split(' ').includes(name));
const postTitles = tree => nodes(tree).filter(node => node.props?.className === 'community-question-open').map(node => text(find(node, 'h3')));
const activeTab = tree => find(tree, 'button', props => props.role === 'tab' && props['aria-selected']).props.id;
class TestApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

// Real hook/event/effect closures are executed. The keyed inner component is
// mounted afresh on an account change, just as React does in the application.
function hookHost() {
  const slots = []; let cursor = 0, dirty = false, effects = [], renderFn, view;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, index) => !Object.is(value, a[index]));
  const memo = (factory, deps) => { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: factory(), deps }; return slots[index].value; };
  const react = {
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect(effect, deps) { const index = cursor++, old = slots[index]; if (changed(old?.deps, deps)) { slots[index] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  return {
    react,
    render(fn, commit) { renderFn = fn || renderFn; for (let pass = 0; pass < 20; pass++) { cursor = 0; dirty = false; effects = []; view = renderFn(); commit(view); effects.forEach(effect => effect()); if (!dirty) return view; } throw Error('Community render did not settle'); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const i18n = {
  en: { locale: 'en', dateLocale: 'en-GB', copy: (_, en) => en, countryName: (_, fallback) => fallback },
  tr: { locale: 'tr', dateLocale: 'tr-TR', copy: tr => tr, countryName: (_, fallback) => fallback },
};
const question = (id, countryCode, title, overrides = {}) => ({ id, countryCode, title, body: `Advice about ${title}`, category: 'general', createdAt: '2026-09-28T10:00:00Z', username: `traveller_${id}`, authorId: `author-${id}`, answerCount: 0, ...overrides });
const rows = [
  question('tr-old', 'TR', 'Istanbul ferry tips', { answerCount: 3, createdAt: '2026-09-27T09:00:00Z' }),
  question('tr-new', 'TR', 'Cappadocia walking routes'),
  question('jp', 'JP', 'Tokyo train advice', { username: 'akira', answerCount: 2 }),
  question('it', 'IT', 'Rome museum tickets'),
  question('id', 'ID', 'Bali temples'),
  question('general', 'ZZ', 'Packing a small bag'),
];
function harness(initial = {}) {
  let host, ownerKey, tree, locale = initial.locale || 'en', failStorage = false, focused = '';
  const requests = [], frames = [], notices = [], navigation = [], searches = [], languageChanges = [], values = new Map();
  let accountOpened = 0, menuOpened = 0, notificationsOpened = 0;
  const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (failStorage) throw Error('Storage full'); values.set(key, value); } }, requestAnimationFrame: fn => frames.push(fn) };
  const document = { getElementById: id => nodes(tree).some(node => node.props?.id === id) ? { focus: () => { focused = id; } } : null };
  const requestJson = (path, options = {}) => { const wait = deferred(); requests.push({ path, options, ...wait }); return wait.promise; };
  const preferences = load('mobile/src/lib/communityPreferences.ts', { '../data/countries': countries }, { window });
  const community = load('mobile/src/lib/community.ts', { './api': { requestJson } });
  const react = Object.fromEntries(['useState', 'useRef', 'useEffect', 'useMemo', 'useCallback'].map(name => [name, (...args) => host.react[name](...args)]));
  const source = load('mobile/src/screens/CommunityScreen.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../components/CountryFlag': { CountryFlag: 'CountryFlag' }, '../components/BrandMark': { BrandMark: 'BrandMark' },
    '../components/CountryPicker': { CountryPicker: 'CountryPicker' }, '../components/Icon': { Icon: 'Icon' }, '../components/Sheet': { Sheet: 'Sheet' },
    '../components/CommunitySafetySheet': { CommunityBlocksSheet: 'CommunityBlocksSheet', CommunitySafetySheet: 'CommunitySafetySheet' }, '../components/SupportSheet': { SupportSheet: 'SupportSheet' },
    '../data/countries': countries, '../data/countryIso': countryIso, '../data/communityDiscovery': discovery,
    '../data/artwork': { destinationArtwork: code => `artwork-${code || 'fallback'}.webp` },
    '../lib/communityPreferences': preferences, '../lib/community': community,
    '../lib/api': { ApiError: TestApiError, requestJson }, '../lib/native': { openExternal: async () => true },
    '../lib/i18n': { useI18n: () => ({ ...i18n[locale], setLocale: next => { languageChanges.push(next); locale = next; } }) },
  }, { window, document });
  let props = { user: null, accessToken: '', initialCountryCode: '', unreadCount: 0, onOpenAccount: () => accountOpened++, onNotice: value => notices.push(value), onNavigate: value => navigation.push(value), onOpenNotifications: () => notificationsOpened++, onOpenMenu: () => menuOpened++, onSearchDestination: value => searches.push(value), ...initial };
  const h = {
    requests, notices, navigation, searches, languageChanges, preferences,
    render(next = {}) {
      props = { ...props, ...next };
      const child = source.CommunityScreen(props);
      if (!host || child.key !== ownerKey) { host?.dispose(); host = hookHost(); ownerKey = child.key; }
      tree = host.render(() => child.type(child.props), view => {
        tree = view;
        for (const node of nodes(view)) if (node.props?.ref) node.props.ref.current = { focus: () => { focused = node.props.id || node.type; } };
      });
      frames.splice(0).forEach(fn => fn()); return tree;
    },
    click(label) { const control = button(tree, label); assert.ok(control, `Visible button: ${label}`); assert.ok(!control.props.disabled, `${label} is enabled`); control.props.onClick(); return h.render(); },
    tab(id) { const control = find(tree, 'button', props => props.id === `community-tab-${id}`); assert.ok(control); control.props.onClick(); return h.render(); },
    change(type, predicate, value) { const control = find(tree, type, predicate); assert.ok(control, `Input: ${type}`); control.props.onChange({ target: { value } }); return h.render(); },
    async feed(data = rows) { const request = requests.findLast(item => item.path === '/api/country-community/feed' && !item.done); assert.ok(request, 'Pending feed request'); request.done = true; request.resolve({ data }); await tick(); return h.render(); },
    async settle() { await tick(); return h.render(); },
    language(next) { locale = next; return h.render(); },
    failStorage(value) { failStorage = value; },
    get focused() { return focused; }, get accountOpened() { return accountOpened; }, get menuOpened() { return menuOpened; }, get notificationsOpened() { return notificationsOpened; },
    dispose() { host.dispose(); },
  };
  h.render(); return h;
}

test('Five community tabs support arrow wrap, Home/End and one keyboard focus target', async () => {
  const h = harness();
  try {
    let view = await h.feed();
    assert.deepEqual(nodes(view).filter(node => node.props?.role === 'tab').map(node => node.props.id), ['feed', 'following', 'groups', 'questions', 'events'].map(id => `community-tab-${id}`));
    for (const [key, id] of [['ArrowLeft', 'events'], ['ArrowRight', 'feed'], ['End', 'events'], ['Home', 'feed'], ['ArrowRight', 'following'], ['ArrowRight', 'groups'], ['ArrowRight', 'questions']]) {
      let prevented = false;
      find(view, 'button', props => props.role === 'tab' && props['aria-selected']).props.onKeyDown({ key, preventDefault: () => { prevented = true; } });
      view = h.render();
      assert.equal(prevented, true); assert.equal(activeTab(view), `community-tab-${id}`); assert.equal(h.focused, `community-tab-${id}`);
      assert.equal(nodes(view).filter(node => node.props?.role === 'tab' && node.props.tabIndex === 0).length, 1);
      const panel = find(view, 'section', props => props.role === 'tabpanel');
      assert.equal(panel.props.id, `community-panel-${id}`); assert.equal(panel.props['aria-labelledby'], `community-tab-${id}`);
    }
    assert.equal(h.requests.length, 1, 'Tab browsing does not load ranking or request a provider');
  } finally { h.dispose(); }
});

test('Feed combines real region, country, text and answer filters and country deep links', async () => {
  const h = harness({ initialCountryCode: 'JP' });
  try {
    assert.deepEqual(postTitles(await h.feed()), ['Tokyo train advice']);
    let view = h.click('Asia');
    assert.deepEqual(postTitles(view), ['Tokyo train advice', 'Bali temples'], 'Changing region clears an incompatible country filter');
    const country = nodes(byClass(view, 'community-country-filters')).find(node => node.type === 'button' && find(node, 'CountryFlag', props => props.code === 'JP'));
    country.props.onClick(); view = h.render(); assert.deepEqual(postTitles(view), ['Tokyo train advice']);
    h.click('Search community');
    assert.equal(h.focused, 'community-search-input');
    view = h.change('input', props => props.id === 'community-search-input', 'akira');
    assert.deepEqual(postTitles(view), ['Tokyo train advice']);
    assert.deepEqual(postTitles(h.change('input', props => props.id === 'community-search-input', 'no matching content')), []);
    assert.deepEqual(postTitles(h.click('Close search')), ['Tokyo train advice']);
    h.click('All');
    view = h.render({ initialCountryCode: 'TR' });
    assert.deepEqual(postTitles(view), ['Cappadocia walking routes', 'Istanbul ferry tips']);
    assert.deepEqual(postTitles(h.change('select', () => true, 'answered')), ['Istanbul ferry tips', 'Cappadocia walking routes']);
    assert.deepEqual(postTitles(h.change('select', () => true, 'unanswered')), ['Cappadocia walking routes']);
    view = h.render({ initialCountryCode: 'IT' }); assert.deepEqual(postTitles(view), ['Rome museum tickets']);
  } finally { h.dispose(); }
});

test('Country-group follows use the real device store, survive remounts and never leak across accounts', async () => {
  const h = harness();
  const follow = (code, expected) => {
    let view = h.tab('groups');
    const article = nodes(view).find(node => node.type === 'article' && find(node, 'CountryFlag', props => props.code === code));
    const control = byClass(article, 'cs-follow'); assert.ok(control); assert.equal(control.props['aria-pressed'], !expected);
    control.props.onClick(); view = h.render();
    assert.equal(byClass(nodes(view).find(node => node.type === 'article' && find(node, 'CountryFlag', props => props.code === code)), 'cs-follow').props['aria-pressed'], expected);
  };
  try {
    await h.feed(); follow('TR', true);
    assert.deepEqual(Array.from(h.preferences.readCommunityFollows(null)), ['TR']);
    assert.deepEqual(postTitles(h.tab('following')), ['Cappadocia walking routes', 'Istanbul ferry tips']);
    h.render({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' }); await h.feed();
    assert.deepEqual(postTitles(h.tab('following')), []);
    follow('JP', true); assert.deepEqual(postTitles(h.tab('following')), ['Tokyo train advice']);
    h.render({ user: { id: 'account-b' }, accessToken: 'TOKEN_B' }); await h.feed();
    assert.deepEqual(postTitles(h.tab('following')), []);
    h.render({ user: null, accessToken: '' }); await h.feed();
    assert.deepEqual(postTitles(h.tab('following')), ['Cappadocia walking routes', 'Istanbul ferry tips']);
    h.tab('groups'); h.failStorage(true);
    const trArticle = nodes(h.render()).find(node => node.type === 'article' && find(node, 'CountryFlag', props => props.code === 'TR'));
    byClass(trArticle, 'cs-follow').props.onClick(); h.render();
    assert.match(h.notices.at(-1), /could not be saved/);
    assert.deepEqual(postTitles(h.tab('following')), ['Cappadocia walking routes', 'Istanbul ferry tips'], 'Failed storage does not pretend an unfollow succeeded');
    assert.deepEqual(Array.from(h.preferences.readCommunityFollows(null)), ['TR']);
    h.failStorage(false); follow('TR', false); assert.deepEqual(postTitles(h.tab('following')), []);
    h.render({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' }); await h.feed();
    assert.deepEqual(postTitles(h.tab('following')), ['Tokyo train advice']);
  } finally { h.dispose(); }
});

test('Guest composition opens sign-in; signed-in groups prefill the genuine question form', async () => {
  const h = harness();
  try {
    await h.feed(); let view = h.click('Share a Post');
    assert.equal(h.accountOpened, 1); assert.equal(find(view, 'Sheet'), undefined); assert.equal(h.requests.length, 1);
    h.render({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' }); await h.feed(); view = h.tab('groups');
    const group = nodes(view).find(node => node.props?.className === 'cs-group-open' && find(node, 'CountryFlag', props => props.code === 'IT'));
    group.props.onClick(); view = h.render();
    assert.equal(activeTab(view), 'community-tab-questions'); assert.deepEqual(postTitles(view), ['Rome museum tickets']);
    view = h.click('Share a Post'); assert.equal(find(view, 'CountryPicker').props.value, 'IT');
    const form = find(view, 'Sheet');
    find(form, 'input').props.onChange({ target: { value: 'Museum booking question' } }); h.render();
    find(find(h.render(), 'Sheet'), 'textarea').props.onChange({ target: { value: 'Which tickets should I book before travelling?' } }); h.render();
    h.click('Post to community');
    const request = h.requests.at(-1);
    assert.equal(request.path, '/api/country-community/questions'); assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer TOKEN_A'); assert.equal(request.options.body.countryCode, 'IT');
    assert.equal(request.options.body.title, 'Museum booking question');
    request.reject(Error('Temporary failure')); view = await h.settle();
    assert.equal(find(find(view, 'Sheet'), 'input').props.value, 'Museum booking question', 'A failed submit preserves the draft');
  } finally { h.dispose(); }
});

test('League is lazy, reuses loaded results and never infers a verification badge from scores', async () => {
  const h = harness();
  try {
    await h.feed(); h.tab('groups'); h.tab('following'); h.tab('feed');
    assert.equal(h.requests.filter(item => item.path === '/api/kasifler-ligi').length, 0);
    h.click('Explore League'); const request = h.requests.at(-1); assert.equal(request.path, '/api/kasifler-ligi');
    request.resolve({ data: [{ username: 'high_score', visitedCount: 30, points: 300, verified: 'true' }, { username: 'explicitly_verified', visitedCount: 1, points: 10, verified: true }] });
    let view = await h.settle();
    assert.equal(nodes(view).filter(node => node.props?.className === 'community-verified').length, 1);
    find(view, 'Sheet', props => props.title === 'Explorers League').props.onClose(); h.render(); h.click('Explore League');
    assert.equal(h.requests.filter(item => item.path === '/api/kasifler-ligi').length, 1);
    h.click('Refresh'); assert.equal(h.requests.filter(item => item.path === '/api/kasifler-ligi').length, 2);
    view = h.render(); assert.equal(button(view, 'Refresh').props.disabled, true);
  } finally { h.dispose(); }
});

test('Question details carry bearer, ignore late selections and retain filtered feed and failed answer drafts', async () => {
  const h = harness({ user: { id: 'account-a' }, accessToken: 'TOKEN_A', initialCountryCode: 'TR' });
  try {
    await h.feed(); h.click('Open question: Istanbul ferry tips'); const old = h.requests.at(-1);
    h.click('Open question: Cappadocia walking routes'); const current = h.requests.at(-1);
    assert.equal(current.options.headers.Authorization, 'Bearer TOKEN_A');
    current.resolve({ data: { ...rows[1], answers: [], totalAnswerCount: 0, hiddenAnswerCount: 0 } });
    let view = await h.settle();
    old.resolve({ data: { ...rows[0], answers: [] } }); view = await h.settle();
    assert.equal(text(find(byClass(view, 'community-question-detail'), 'h3')), 'Cappadocia walking routes');
    h.change('textarea', props => props.id === 'community-answer-body', 'A useful walking suggestion'); h.click('Send answer');
    const reply = h.requests.at(-1); assert.equal(reply.path, '/api/country-community/answers');
    assert.equal(reply.options.headers.Authorization, 'Bearer TOKEN_A'); assert.equal(reply.options.body.questionId, 'tr-new');
    reply.reject(Error('offline')); view = await h.settle();
    assert.equal(find(view, 'textarea', props => props.id === 'community-answer-body').props.value, 'A useful walking suggestion');
    find(view, 'Sheet', props => props.title === 'Question details').props.onClose(); view = h.render();
    assert.deepEqual(postTitles(view), ['Cappadocia walking routes', 'Istanbul ferry tips']);
    h.click('Open question: Istanbul ferry tips'); const late = h.requests.at(-1);
    find(h.render(), 'Sheet', props => props.title === 'Question details').props.onClose(); h.render();
    late.resolve({ data: { ...rows[0], answers: [] } }); view = await h.settle();
    assert.equal(find(view, 'Sheet', props => props.title === 'Question details'), undefined, 'Late data cannot reopen a closed sheet');
    h.click('Open question: Istanbul ferry tips'); const previousAccount = h.requests.at(-1);
    h.render({ user: { id: 'account-b' }, accessToken: 'TOKEN_B', initialCountryCode: '' }); await h.feed([]);
    previousAccount.resolve({ data: { ...rows[0], answers: [] } }); view = await h.settle();
    assert.equal(find(view, 'Sheet', props => props.title === 'Question details'), undefined); assert.deepEqual(postTitles(view), []);
  } finally { h.dispose(); }
});

test('Editorial inspiration and header actions use actual callbacks without being user posts', async () => {
  const h = harness({ unreadCount: 3 });
  try {
    let view = await h.feed([]);
    assert.deepEqual(postTitles(view), []);
    assert.match(text(byClass(view, 'cs-inspiration')), /Travel ideas from LetsGo2Travel/);
    const first = nodes(view).find(node => node.props?.className === 'cs-inspiration-open'); first.props.onClick();
    assert.deepEqual(h.searches, ['Kapadokya']);
    h.click('Notifications, 3 unread'); h.click('Open menu'); h.click('Open your profile');
    assert.equal(h.notificationsOpened, 1); assert.equal(h.menuOpened, 1); assert.deepEqual(h.navigation, ['profile']);
    view = h.tab('events'); assert.equal(byClass(view, 'cs-inspiration'), undefined); h.click('Discover events');
    assert.deepEqual(h.navigation, ['profile', 'events']);
  } finally { h.dispose(); }
});

test('The community header language button changes the application locale in both directions', async () => {
  const h = harness();
  try {
    await h.feed([]);
    let view = h.click('Switch app language to Turkish');
    assert.deepEqual(h.languageChanges, ['tr']);
    assert.equal(text(find(view, 'h1')), 'Topluluk');
    assert.equal(text(button(view, 'Uygulama dilini İngilizce yap')), 'TR');
    await h.feed([]);
    view = h.click('Uygulama dilini İngilizce yap');
    assert.deepEqual(h.languageChanges, ['tr', 'en']);
    assert.equal(text(find(view, 'h1')), 'Community');
    assert.equal(text(button(view, 'Switch app language to Turkish')), 'EN');
    assert.equal(h.menuOpened, 0, 'Changing language is a direct action, independent of opening the menu');
  } finally { h.dispose(); }
});

test('Closing search from its header control removes the hidden text filter', async () => {
  const h = harness();
  try {
    await h.feed(); h.click('Search community');
    assert.deepEqual(postTitles(h.change('input', props => props.id === 'community-search-input', 'Tokyo')), ['Tokyo train advice']);
    const view = h.click('Search community');
    assert.equal(find(view, 'input', props => props.id === 'community-search-input'), undefined);
    assert.equal(postTitles(view).length, rows.length, 'A hidden search cannot silently narrow the feed');
    assert.equal(button(view, 'Search community').props['aria-expanded'], false);
  } finally { h.dispose(); }
});

test('Changing language during a league request does not strand the ranking in a loading state', async () => {
  const h = harness();
  try {
    await h.feed(); h.click('Explore League');
    const pending = h.requests.at(-1);
    h.language('tr'); await h.feed();
    pending.resolve({ data: [{ username: 'traveller_after_language_change', visitedCount: 4, points: 40 }] });
    const view = await h.settle();
    const sheet = find(view, 'Sheet', props => props.title === 'Kaşifler Ligi');
    assert.ok(sheet); assert.match(text(sheet), /traveller_after_language_change/);
    assert.equal(byClass(sheet, 'community-native-loading'), undefined);
    assert.equal(h.requests.filter(item => item.path === '/api/kasifler-ligi').length, 1, 'Feed refresh must not duplicate or invalidate the independent league request');
  } finally { h.dispose(); }
});

test('Changing language while a question opens preserves the independent authenticated detail response', async () => {
  const h = harness({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' });
  try {
    await h.feed(); h.click('Open question: Tokyo train advice');
    const pending = h.requests.at(-1); assert.equal(pending.options.headers.Authorization, 'Bearer TOKEN_A');
    h.language('tr'); await h.feed();
    pending.resolve({ data: { ...rows[2], answers: [], totalAnswerCount: 0, hiddenAnswerCount: 0 } });
    const view = await h.settle();
    assert.equal(text(find(byClass(view, 'community-question-detail'), 'h3')), 'Tokyo train advice');
    assert.ok(find(view, 'textarea', props => props.id === 'community-answer-body'), 'The answer form remains usable after the locale switch');
  } finally { h.dispose(); }
});

const reply = (id, body) => ({ id, body, username: `reader_${id}`, authorId: `reader-${id}`, createdAt: '2026-09-28T12:00:00Z' });
const visibleComments = tree => nodes(tree).filter(node => node.props?.className?.split(' ').includes('cs-inline-answer'));

test('Inline comments load on demand, show only real server replies and respect locked previews', async () => {
  const h = harness();
  try {
    let view = await h.feed();
    assert.equal(h.requests.length, 1, 'Reading the feed does not fetch every question');
    assert.equal(visibleComments(view).length, 0);
    view = h.click('3 comments');
    assert.equal(button(view, '3 comments').props['aria-expanded'], true);
    assert.equal(find(view, 'Sheet'), undefined, 'Comments open beneath the post');
    const request = h.requests.at(-1);
    assert.equal(request.path, '/api/country-community/questions/tr-old');
    assert.equal(request.options.headers?.Authorization, undefined);
    request.resolve({ data: { ...rows[0], answers: [reply('one', 'The ferry accepts contactless payment.'), reply('two', 'Check the evening timetable.')], totalAnswerCount: 3, hiddenAnswerCount: 1, hasFullAccess: false } });
    view = await h.settle();
    assert.equal(visibleComments(view).length, 2);
    assert.match(text(byClass(view, 'cs-comment-preview')), /The ferry accepts contactless payment\./);
    assert.match(text(byClass(view, 'cs-comment-preview')), /Check the evening timetable\./);
    assert.match(text(byClass(view, 'cs-inline-comments')), /1 comments are locked/);
    assert.equal(find(view, 'Sheet'), undefined);
    view = h.click('3 comments');
    assert.equal(button(view, '3 comments').props['aria-expanded'], false);
    assert.equal(visibleComments(view).length, 0);
    h.click('3 comments');
    h.requests.at(-1).resolve({ data: { ...rows[0], answers: [reply('one', 'First actual reply.'), reply('two', 'Second actual reply.'), reply('three', 'Third belongs in the full conversation.')], totalAnswerCount: 3, hiddenAnswerCount: 0, hasFullAccess: true } });
    view = await h.settle();
    assert.equal(visibleComments(view).length, 2, 'Even unlocked discussions keep the feed preview brief');
    assert.doesNotMatch(text(byClass(view, 'cs-comment-preview')), /Third belongs/);
  } finally { h.dispose(); }
});

test('Closing or switching inline comments prevents late responses from opening or replacing another post', async () => {
  const h = harness();
  try {
    await h.feed(); h.click('3 comments'); const closed = h.requests.at(-1);
    h.click('3 comments');
    closed.resolve({ data: { ...rows[0], answers: [reply('closed', 'A closed post must remain closed.')] } });
    let view = await h.settle();
    assert.equal(visibleComments(view).length, 0);
    assert.equal(button(view, '3 comments').props['aria-expanded'], false);
    h.click('3 comments'); const older = h.requests.at(-1);
    h.click('2 comments'); const newer = h.requests.at(-1);
    newer.resolve({ data: { ...rows[2], answers: [reply('tokyo', 'The airport train is convenient.')] } });
    view = await h.settle();
    older.resolve({ data: { ...rows[0], answers: [reply('ferry', 'This is the previous selection.')] } });
    view = await h.settle();
    assert.equal(visibleComments(view).length, 1);
    assert.match(text(byClass(view, 'cs-comment-preview')), /airport train/);
    assert.doesNotMatch(text(byClass(view, 'cs-comment-preview')), /previous selection/);
    assert.equal(button(view, '2 comments').props['aria-expanded'], true);
    assert.equal(button(view, '3 comments').props['aria-expanded'], false);
  } finally { h.dispose(); }
});

test('Inline previews carry the current bearer and discard data after account or token changes', async () => {
  const h = harness({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' });
  try {
    await h.feed(); h.click('3 comments'); const firstAccount = h.requests.at(-1);
    assert.equal(firstAccount.options.headers.Authorization, 'Bearer TOKEN_A');
    h.render({ user: { id: 'account-b' }, accessToken: 'TOKEN_B' }); await h.feed();
    firstAccount.resolve({ data: { ...rows[0], answers: [reply('private-a', 'Visible only under account A.')] } });
    let view = await h.settle();
    assert.equal(visibleComments(view).length, 0);
    h.click('3 comments'); const oldToken = h.requests.at(-1);
    assert.equal(oldToken.options.headers.Authorization, 'Bearer TOKEN_B');
    h.render({ accessToken: 'TOKEN_B_REFRESHED' }); await h.feed();
    oldToken.resolve({ data: { ...rows[0], answers: [reply('stale-token', 'A stale authenticated response.')] } });
    view = await h.settle();
    assert.equal(visibleComments(view).length, 0);
    assert.equal(button(view, '3 comments').props['aria-expanded'], false);
    h.click('3 comments');
    assert.equal(h.requests.at(-1).options.headers.Authorization, 'Bearer TOKEN_B_REFRESHED');
  } finally { h.dispose(); }
});

test('A failed inline preview retries explicitly and a 401 offers sign-in without anonymous fallback', async () => {
  const h = harness({ user: { id: 'account-a' }, accessToken: 'EXPIRED_TOKEN' });
  try {
    await h.feed(); h.click('3 comments'); const failed = h.requests.at(-1);
    failed.reject(new TestApiError('Service unavailable', 503));
    let view = await h.settle();
    assert.equal(visibleComments(view).length, 0);
    assert.equal(h.requests.length, 2, 'A failed read must not silently fetch a different view');
    assert.ok(button(byClass(view, 'cs-inline-comments'), 'Try again'));
    h.click('Try again'); const retry = h.requests.at(-1);
    assert.equal(retry.path, failed.path);
    assert.equal(retry.options.headers.Authorization, 'Bearer EXPIRED_TOKEN');
    retry.reject(new TestApiError('Sign in required', 401));
    view = await h.settle();
    assert.match(text(byClass(view, 'cs-inline-comments')), /Sign in/);
    assert.equal(h.requests.length, 3, '401 never triggers an anonymous retry');
    const signIn = find(byClass(view, 'cs-inline-comments'), 'button', props => /Sign in/i.test(text(props.children)));
    assert.ok(signIn); signIn.props.onClick(); view = h.render();
    assert.equal(h.accountOpened, 1);
    assert.equal(h.requests.length, 3);
    assert.equal(visibleComments(view).length, 0);
  } finally { h.dispose(); }
});

test('Blocking a participant clears inline replies and invalidates their pending response', async () => {
  const h = harness({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' });
  try {
    await h.feed(); h.click('3 comments'); const pending = h.requests.at(-1);
    const safety = find(h.render(), 'CommunitySafetySheet');
    safety.props.onBlocked('reader-blocked');
    let view = h.render();
    pending.resolve({ data: { ...rows[0], answers: [reply('blocked', 'Reply from a newly blocked participant.')] } });
    await h.settle(); view = await h.feed();
    assert.equal(visibleComments(view).length, 0);
    assert.equal(button(view, '3 comments').props['aria-expanded'], false);
    assert.doesNotMatch(text(view), /Reply from a newly blocked/);
  } finally { h.dispose(); }
});
