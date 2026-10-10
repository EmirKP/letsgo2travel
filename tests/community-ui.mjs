import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function load(path, imports, globals = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Date, Intl, URLSearchParams, ...globals })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === '../lib/localeFormatting') return localeFormatting;
    if (/\.(webp|jpg|css)$/.test(name)) return name;
    throw Error(`Unstubbed import: ${name}`);
  }, testModule, testModule.exports);
  return testModule.exports;
}
const localeFormatting = load('mobile/src/lib/localeFormatting.ts', {
  './locales/sq-regions': load('mobile/src/lib/locales/sq-regions.ts', {}),
});
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
  sq: { locale: 'sq', dateLocale: 'sq-AL', copy: (_, en, sq) => sq ?? en, countryName: (_, fallback) => fallback },
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
  const requests = [], photoPreparations = [], frames = [], notices = [], navigation = [], searches = [], values = new Map();
  let accountOpened = 0;
  const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (failStorage) throw Error('Storage full'); values.set(key, value); } }, requestAnimationFrame: fn => frames.push(fn) };
  const document = { getElementById: id => nodes(tree).some(node => node.props?.id === id) ? { focus: () => { focused = id; } } : null };
  const requestJson = (path, options = {}) => { const wait = deferred(); requests.push({ path, options, ...wait }); return wait.promise; };
  const prepareCommunityPhoto = file => { const wait = deferred(); photoPreparations.push({ file, ...wait }); return wait.promise; };
  const preferences = load('mobile/src/lib/communityPreferences.ts', { '../data/countries': countries }, { window });
  const community = load('mobile/src/lib/community.ts', { './api': { requestJson } });
  const react = Object.fromEntries(['useState', 'useRef', 'useEffect', 'useMemo', 'useCallback'].map(name => [name, (...args) => host.react[name](...args)]));
  const source = load('mobile/src/screens/CommunityScreen.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../components/CountryFlag': { CountryFlag: 'CountryFlag' },
    '../components/CountryPicker': { CountryPicker: 'CountryPicker' }, '../components/Icon': { Icon: 'Icon' }, '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' }, '../components/Sheet': { Sheet: 'Sheet' },
    '../components/CommunityPostPhoto': { CommunityPostPhoto: 'CommunityPostPhoto' },
    '../components/CommunityProfileSheet': { CommunityProfileSheet: 'CommunityProfileSheet' },
    '../components/SocialHub': { SocialHub: 'SocialHub' },
    '../components/ForumTranslation': { ForumTranslation: 'ForumTranslation' },
    '../components/CommunityAvatar': { CommunityAvatar: 'CommunityAvatar' },
    '../components/CommunitySafetySheet': { CommunityBlocksSheet: 'CommunityBlocksSheet', CommunitySafetySheet: 'CommunitySafetySheet' }, '../components/SupportSheet': { SupportSheet: 'SupportSheet' },
    '../data/countries': countries, '../data/countryIso': countryIso, '../data/communityDiscovery': discovery,
    '../lib/communityPreferences': preferences, '../lib/community': community,
    '../lib/communityPhoto': { prepareCommunityPhoto },
    '../lib/api': { ApiError, requestJson }, '../lib/native': { openExternal: async () => true },
    '../lib/i18n': { useI18n: () => i18n[locale] },
  }, { window, document });
  let props = { user: null, accessToken: '', initialCountryCode: '', onOpenAccount: () => accountOpened++, onNotice: value => notices.push(value), onNavigate: value => navigation.push(value), onSearchDestination: value => searches.push(value), ...initial };
  const h = {
    requests, photoPreparations, notices, navigation, searches, preferences,
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
    tab(id) { h.click(i18n[locale].copy('Forum', 'Forum', 'Forumi')); const control = find(tree, 'button', props => props.id === `community-tab-${id}`); assert.ok(control); control.props.onClick(); return h.render(); },
    change(type, predicate, value) { const control = find(tree, type, predicate); assert.ok(control, `Input: ${type}`); control.props.onChange({ target: { value } }); return h.render(); },
    selectPhoto(file) { const control = find(tree, 'input', props => props.type === 'file' && props['aria-label'] === 'Post photo'); assert.ok(control, 'Photo picker is visible'); assert.ok(!control.props.disabled, 'Photo picker is enabled'); const target = { files: file ? [file] : [], value: file?.name || '' }; control.props.onChange({ target }); assert.equal(target.value, '', 'Picker resets so the same file can be selected again'); return h.render(); },
    async feed(data = rows, nextOffset = null) { const request = requests.findLast(item => item.path.startsWith('/api/country-community/feed') && !item.done); assert.ok(request, 'Pending feed request'); request.done = true; request.resolve({ data, nextOffset }); await tick(); return h.render(); },
    async settle() { await tick(); return h.render(); },
    language(next) { locale = next; return h.render(); },
    failStorage(value) { failStorage = value; },
    get focused() { return focused; }, get accountOpened() { return accountOpened; },
    dispose() { host.dispose(); },
  };
  h.render(); h.click(i18n[locale].copy('Forum', 'Forum', 'Forumi')); return h;
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
    assert.ok(h.requests.every(request => request.path.startsWith('/api/country-community/feed')), 'Tab browsing only requests community data');
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
  const following = async () => {
    h.tab('following'); h.click('Country groups');
    const request = h.requests.findLast(item => item.path.startsWith('/api/country-community/feed') && !item.done);
    return request ? await h.feed() : h.render();
  };
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
    assert.deepEqual(postTitles(await following()), ['Cappadocia walking routes', 'Istanbul ferry tips']);
    h.render({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' }); await h.feed();
    assert.deepEqual(postTitles(await following()), []);
    follow('JP', true); assert.deepEqual(postTitles(await following()), ['Tokyo train advice']);
    h.render({ user: { id: 'account-b' }, accessToken: 'TOKEN_B' }); await h.feed();
    assert.deepEqual(postTitles(await following()), []);
    h.render({ user: null, accessToken: '' }); await h.feed();
    assert.deepEqual(postTitles(await following()), ['Cappadocia walking routes', 'Istanbul ferry tips']);
    h.tab('groups'); h.failStorage(true);
    const trArticle = nodes(h.render()).find(node => node.type === 'article' && find(node, 'CountryFlag', props => props.code === 'TR'));
    byClass(trArticle, 'cs-follow').props.onClick(); h.render();
    assert.match(h.notices.at(-1), /could not be saved/);
    assert.deepEqual(postTitles(await following()), ['Cappadocia walking routes', 'Istanbul ferry tips'], 'Failed storage does not pretend an unfollow succeeded');
    assert.deepEqual(Array.from(h.preferences.readCommunityFollows(null)), ['TR']);
    h.failStorage(false); follow('TR', false); assert.deepEqual(postTitles(await following()), []);
    h.render({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' }); await h.feed();
    assert.deepEqual(postTitles(await following()), ['Tokyo train advice']);
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
    const form = find(view, 'Sheet', props => props.title === 'Share your experience');
    assert.ok(find(form, 'input', props => props.placeholder === 'What would you like to share?'));
    assert.ok(find(form, 'textarea', props => props.placeholder === 'Write your experience or question here…'));
    find(form, 'input').props.onChange({ target: { value: 'Museum booking question' } }); h.render();
    find(find(h.render(), 'Sheet'), 'textarea').props.onChange({ target: { value: 'Which tickets should I book before travelling?' } }); h.render();
    h.click('Post to community');
    const request = h.requests.at(-1);
    assert.equal(request.path, '/api/country-community/questions'); assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer TOKEN_A'); assert.equal(request.options.body.countryCode, 'IT');
    assert.equal(request.options.body.title, 'Museum booking question');
    assert.equal(Object.hasOwn(request.options.body, 'photo'), false, 'Text-only posts omit the optional media payload entirely');
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
    h.requests.at(-1).reject(Error('Temporary issue')); view = await h.settle();
    assert.equal(nodes(view).filter(node => node.props?.className?.startsWith('community-leader-card')).length, 2, 'Failed refresh preserves last successful ranking');
    assert.ok(text(view).includes('Last successful update'));
    assert.equal(button(view, 'Refresh').props.disabled, false);
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

test('Editorial inspiration, community search and events use their actual actions without becoming user posts', async () => {
  const h = harness();
  try {
    let view = await h.feed([]);
    assert.deepEqual(postTitles(view), []);
    assert.match(text(byClass(view, 'cs-inspiration')), /Travel ideas from LetsGo2Travel/);
    const first = nodes(view).find(node => node.props?.className === 'cs-inspiration-open'); first.props.onClick();
    assert.deepEqual(h.searches, ['Kapadokya']);
    view = h.click('Search community');
    assert.equal(h.focused, 'community-search-input');
    assert.equal(button(view, 'Search community').props['aria-expanded'], true);
    assert.deepEqual(postTitles(view), [], 'Editorial content is not inserted into an empty user feed');
    h.click('Close search');
    view = h.tab('events'); assert.equal(byClass(view, 'cs-inspiration'), undefined); h.click('Discover events');
    assert.deepEqual(h.navigation, ['events']);
  } finally { h.dispose(); }
});

test('Community reflects application locale changes in both directions while keeping its selected country', async () => {
  const h = harness({ initialCountryCode: 'JP' });
  try {
    await h.feed();
    h.language('tr');
    let view = await h.feed();
    assert.equal(text(find(view, 'h1')), 'Topluluk');
    assert.ok(button(view, 'Toplulukta ara'));
    assert.deepEqual(postTitles(view), ['Tokyo train advice']);
    h.language('en');
    view = await h.feed();
    assert.equal(text(find(view, 'h1')), 'Community');
    assert.ok(button(view, 'Search community'));
    assert.deepEqual(postTitles(view), ['Tokyo train advice']);
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

const account = { user: { id: 'account-a' }, accessToken: 'TOKEN_A' };
const photoPreview = tree => find(tree, 'img', props => props.alt === 'Photo to attach to your post');
function composeDraft(h) {
  h.click('Forum');
  let view = h.click('Share a Post');
  find(view, 'CountryPicker').props.onChange('IT'); h.render();
  h.change('input', props => props.placeholder === 'What would you like to share?', 'Rome walking experience');
  view = h.change('textarea', props => props.placeholder === 'Write your experience or question here…', 'A quiet morning walk through the old streets of Rome.');
  return view;
}

test('Feed renders photos only for the post’s genuine protected endpoint and leaves text-only cards without media', async () => {
  const h = harness(account);
  const photoId = '12345678-1234-4234-8234-123456789abc';
  const remoteId = '22345678-1234-4234-8234-123456789abc';
  const mismatchId = '32345678-1234-4234-8234-123456789abc';
  const dataId = '42345678-1234-4234-8234-123456789abc';
  const photoUrl = `/api/country-community/questions/${photoId}/photo`;
  try {
    const view = await h.feed([
      question(photoId, 'IT', 'My Rome photo', { photoUrl }),
      question(remoteId, 'IT', 'Remote photo is ignored', { photoUrl: 'https://untrusted.example/photo.jpg' }),
      question(mismatchId, 'IT', 'Another post photo is ignored', { photoUrl }),
      question(dataId, 'IT', 'Inline photo is ignored', { photoUrl: 'data:image/jpeg;base64,arbitrary' }),
      question('plain', 'IT', 'A plain question'),
    ]);
    const feed = byClass(view, 'cs-posts');
    const media = nodes(feed).filter(node => node.type === 'CommunityPostPhoto');
    assert.equal(media.length, 1);
    assert.equal(media[0].props.photoUrl, photoUrl);
    assert.equal(media[0].props.accessToken, 'TOKEN_A');
    assert.match(media[0].props.alt, /My Rome photo/);
    for (const title of ['Remote photo is ignored', 'Another post photo is ignored', 'Inline photo is ignored', 'A plain question']) {
      const card = nodes(feed).find(node => node.type === 'article' && postTitles(node).includes(title));
      assert.ok(card);
      assert.equal(find(card, 'CommunityPostPhoto'), undefined);
      assert.equal(find(card, 'img'), undefined, 'No editorial country fallback or broken-image placeholder');
    }
  } finally { h.dispose(); }
});

test('Prepared photos use the dedicated endpoint, survive a missing-server 404 and clear only after review submission', async () => {
  const h = harness(account);
  const file = { name: 'rome.jpg', type: 'image/jpeg', size: 12000 };
  const prepared = 'data:image/jpeg;base64,cHJlcGFyZWQ=';
  try {
    await h.feed([]); composeDraft(h);
    let view = h.selectPhoto(file);
    assert.equal(h.photoPreparations[0].file, file);
    assert.equal(button(view, 'Post to community').props.disabled, true, 'A half-prepared photo cannot be submitted');
    assert.equal(find(view, 'input', props => props.type === 'file').props.disabled, true);
    assert.equal(h.requests.length, 1, 'Selecting a local file never uploads it before submission');
    h.photoPreparations[0].resolve(prepared); view = await h.settle();
    assert.equal(photoPreview(view).props.src, prepared);
    assert.equal(button(view, 'Post to community').props.disabled, false);
    assert.match(text(find(view, 'Sheet')), /Posts with photos appear after review/);
    const submit = button(view, 'Post to community');
    submit.props.onClick(); submit.props.onClick(); view = h.render();
    assert.equal(h.requests.filter(request => request.path === '/api/country-community/photo-posts').length, 1, 'Rapid double taps produce one upload');
    const request = h.requests.at(-1);
    assert.equal(request.path, '/api/country-community/photo-posts');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer TOKEN_A');
    assert.equal(request.options.body.photo, prepared);
    assert.equal(request.options.body.title, 'Rome walking experience');
    assert.equal(find(view, 'Sheet').props.dismissible, false, 'A pending submission cannot be dismissed');
    assert.equal(button(view, 'Remove photo').props.disabled, true);
    request.reject(new ApiError('Photo endpoint not found', 404)); view = await h.settle();
    assert.equal(photoPreview(view).props.src, prepared);
    assert.equal(find(view, 'input', props => props.maxLength === 160).props.value, 'Rome walking experience');
    assert.ok(find(view, 'Sheet', props => props.title === 'Share your experience'), 'Unavailable photo support leaves the draft open');
    assert.equal(h.requests.filter(request => request.path === '/api/country-community/questions').length, 0, 'A photo failure must never fall back to publishing only its text');
    assert.equal(h.notices.at(-1), 'Photo posting is not available yet. Your draft is still here.');
    h.click('Post to community');
    assert.equal(h.requests.at(-1).path, '/api/country-community/photo-posts');
    assert.equal(h.requests.at(-1).options.body.photo, prepared, 'Retry retains the selected photo');
    h.requests.at(-1).resolve({ moderation: { action: 'pending' } }); view = await h.settle();
    assert.equal(find(view, 'Sheet', props => props.title === 'Share your experience'), undefined);
    assert.equal(h.notices.at(-1), 'Your post was sent for review.');
    assert.equal(h.requests.filter(request => request.path === '/api/country-community/feed').length, 1, 'Pending photos do not appear in the public feed');
    view = h.click('Share a Post');
    assert.equal(photoPreview(view), undefined);
    assert.equal(find(view, 'input', props => props.maxLength === 160).props.value, '');
  } finally { h.dispose(); }
});

test('Removing a photo cancels a pending replacement and restores a text-only submission', async () => {
  const h = harness(account);
  try {
    await h.feed([]); composeDraft(h);
    h.selectPhoto({ name: 'first.jpg' }); h.photoPreparations[0].resolve('data:image/jpeg;base64,Zmlyc3Q='); await h.settle();
    h.selectPhoto({ name: 'replacement.jpg' });
    let view = h.click('Remove photo');
    assert.equal(photoPreview(view), undefined);
    assert.equal(button(view, 'Post to community').props.disabled, false);
    h.photoPreparations[1].resolve('data:image/jpeg;base64,bGF0ZQ=='); view = await h.settle();
    assert.equal(photoPreview(view), undefined, 'Late preparation cannot resurrect a removed photo');
    h.click('Post to community');
    assert.equal(h.requests.at(-1).path, '/api/country-community/questions', 'Removing media explicitly returns to the text-only endpoint');
    assert.equal(Object.hasOwn(h.requests.at(-1).options.body, 'photo'), false);
  } finally { h.dispose(); }
});

test('Closing the composer invalidates unfinished photo preparation and cancelling the native picker is a no-op', async () => {
  const h = harness(account);
  try {
    await h.feed([]); composeDraft(h);
    h.selectPhoto(undefined); assert.equal(h.photoPreparations.length, 0);
    let view = h.selectPhoto({ name: 'late.jpg' });
    find(view, 'Sheet', props => props.title === 'Share your experience').props.onClose(); h.render();
    h.photoPreparations[0].resolve('data:image/jpeg;base64,bGF0ZQ=='); view = await h.settle();
    assert.equal(find(view, 'Sheet', props => props.title === 'Share your experience'), undefined, 'Late photo result cannot reopen the composer');
    view = h.click('Share a Post');
    assert.equal(photoPreview(view), undefined);
    assert.equal(button(view, 'Post to community').props.disabled, false);
    assert.equal(find(view, 'input', props => props.maxLength === 160).props.value, 'Rome walking experience', 'Closing preserves the text draft');
  } finally { h.dispose(); }
});

test('Failed photo preparation shows an error, preserves text, and permits a clean retry', async () => {
  const h = harness(account);
  try {
    await h.feed([]); composeDraft(h);
    h.selectPhoto({ name: 'unreadable.jpg' }); h.photoPreparations[0].reject(Error('decode'));
    let view = await h.settle();
    assert.equal(photoPreview(view), undefined);
    assert.match(text(byClass(view, 'cs-photo-error')), /could not be opened/);
    assert.equal(byClass(view, 'cs-photo-error').props.role, 'alert');
    assert.equal(button(view, 'Post to community').props.disabled, false);
    assert.equal(find(view, 'input', props => props.maxLength === 160).props.value, 'Rome walking experience');
    view = h.selectPhoto({ name: 'valid.jpg' }); assert.equal(byClass(view, 'cs-photo-error'), undefined);
    h.photoPreparations[1].resolve('data:image/jpeg;base64,cmV0cnk='); view = await h.settle();
    assert.equal(photoPreview(view).props.src, 'data:image/jpeg;base64,cmV0cnk=');
  } finally { h.dispose(); }
});

test('Account changes isolate late photo preparation and late submission results from the new account', async () => {
  const h = harness(account);
  try {
    await h.feed([]); composeDraft(h); h.selectPhoto({ name: 'account-a.jpg' });
    h.render({ user: { id: 'account-b' }, accessToken: 'TOKEN_B' }); await h.feed([]);
    h.photoPreparations[0].resolve('data:image/jpeg;base64,YWNjb3VudEE='); await h.settle();
    let view = composeDraft(h); assert.equal(photoPreview(view), undefined);
    h.selectPhoto({ name: 'account-b.jpg' }); h.photoPreparations[1].resolve('data:image/jpeg;base64,YWNjb3VudEI='); await h.settle();
    h.click('Post to community'); const pending = h.requests.at(-1);
    assert.equal(pending.path, '/api/country-community/photo-posts');
    assert.equal(pending.options.headers.Authorization, 'Bearer TOKEN_B');
    assert.equal(pending.options.body.photo, 'data:image/jpeg;base64,YWNjb3VudEI=');
    h.render(account); await h.feed([]); view = composeDraft(h);
    const noticeCount = h.notices.length;
    pending.resolve({ moderation: { action: 'pending' } }); view = await h.settle();
    assert.ok(find(view, 'Sheet', props => props.title === 'Share your experience'), 'An old account submit cannot close the new composer');
    assert.equal(find(view, 'input', props => props.maxLength === 160).props.value, 'Rome walking experience');
    assert.equal(photoPreview(view), undefined);
    assert.equal(h.notices.length, noticeCount, 'An old account response cannot announce another account’s result');
  } finally { h.dispose(); }
});

test('The slim reply row opens genuine detail and own posts have no inert author menu', async () => {
  const h = harness(account);
  try {
    let view = await h.feed([question('mine', 'IT', 'My own question', { authorId: 'account-a', username: 'me', answerCount: 4 }), rows[2]]);
    const ownCard = nodes(byClass(view, 'cs-posts')).find(node => node.type === 'article' && postTitles(node).includes('My own question'));
    assert.ok(button(ownCard, "Open @me's profile"));
    assert.equal(byClass(ownCard, 'cs-post-options'), undefined);
    h.click('4 replies: My own question'); const detailRequest = h.requests.at(-1);
    assert.equal(detailRequest.path, '/api/country-community/questions/mine');
    assert.equal(detailRequest.options.headers.Authorization, 'Bearer TOKEN_A');
    detailRequest.resolve({ data: { ...question('mine', 'IT', 'My own question', { authorId: 'account-a' }), answers: [{ id: 'reply', body: 'A real response from the API.', username: 'another', authorId: 'other', createdAt: '2026-09-28T10:10:00Z' }], totalAnswerCount: 1, hiddenAnswerCount: 0 } });
    view = await h.settle(); assert.match(text(byClass(view, 'community-question-detail')), /A real response from the API/);
    find(view, 'Sheet', props => props.title === 'Question details').props.onClose(); h.render();
    view = h.click('User options for @akira');
    assert.equal(find(view, 'CommunitySafetySheet').props.target.targetId, 'jp');
    assert.equal(find(view, 'CommunitySafetySheet').props.target.targetType, 'question');
  } finally { h.dispose(); }
});

test('A country starter with no auth account remains visible, reportable and replyable in Albanian', async () => {
  const h = harness({ ...account, locale: 'sq' });
  try {
    const starter = question('starter', 'TR', 'Istanbul to Bodrum ideas', { authorId: null, username: 'yol_notlari', isStarter: true });
    let view = await h.feed([starter]);
    assert.ok(button(view, 'Hap profilin e @yol_notlari'));
    view = h.click('Veprimet për përdoruesin @yol_notlari');
    assert.equal(find(view, 'CommunitySafetySheet').props.target.authorId, null);
    find(view, 'CommunitySafetySheet').props.onClose(); h.render();
    h.click('0 përgjigje: Istanbul to Bodrum ideas');
    assert.equal(h.requests.at(-1).path, '/api/country-community/questions/starter');
    h.requests.at(-1).resolve({ data: { ...starter, answers: [], totalAnswerCount: 0, hiddenAnswerCount: 0 } });
    view = await h.settle();
    assert.equal(find(byClass(view, 'community-question-detail'), 'button', props => props['aria-label'] === 'Veprimet për përdoruesin @yol_notlari'), undefined);
    h.change('textarea', props => props.id === 'community-answer-body', 'A ferry and bus combination could work.');
    h.click('Send answer');
    assert.equal(h.requests.at(-1).path, '/api/country-community/answers');
    assert.equal(h.requests.at(-1).options.headers.Authorization, 'Bearer TOKEN_A');
    assert.deepEqual(JSON.parse(JSON.stringify(h.requests.at(-1).options.body)), { countryCode: 'TR', questionId: 'starter', body: 'A ferry and bus combination could work.' });
    h.requests.at(-1).resolve({ moderation: { action: 'pending' } }); await h.settle();
    assert.equal(h.notices.at(-1), 'Your answer was sent for review.');
  } finally { h.dispose(); }
});

test('Web forum visibility accepts a null starter author and still hides a blocked real author', () => {
  const visibility = { ready: true, hidden: new Set(['blocked']), error: false };
  const source = load('components/ForumVisibility.tsx', {
    react: { createContext: () => ({}), useContext: () => visibility },
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/lib/supabase-client': { supabase: {} },
  });
  assert.equal(source.ForumUserContent({ authorId: null, children: 'Starter topic' }), 'Starter topic');
  assert.equal(source.ForumUserContent({ authorId: 'blocked', children: 'Blocked topic' }), null);
  visibility.ready = false;
  assert.equal(source.ForumUserContent({ authorId: null, children: 'Starter topic' }), null, 'No content flashes before session safety checks');
});

test('Country filters request server pages and older posts can be reached without losing the current page on failure', async()=>{
 const h=harness({initialCountryCode:'TR'});
 try{
  assert.equal(new URL(h.requests[0].path,'https://test').searchParams.get('countries'),'TR');
  await h.feed([question('older-tr','TR','Older Turkey discussion')],40);
  h.click('Load more posts');const more=h.requests.at(-1);
  assert.equal(new URL(more.path,'https://test').searchParams.get('offset'),'40');
  more.reject(Error('503'));let view=await h.settle();assert.deepEqual(postTitles(view),['Older Turkey discussion']);
  h.click('Load more posts');view=await h.feed([question('last-tr','TR','Last Turkey discussion')]);
  assert.equal(postTitles(view).length,2);assert.ok(!button(view,'Load more posts'));
  h.click('Search community');h.change('input',props=>props.id==='community-search-input','ferry');
  assert.equal(new URL(h.requests.at(-1).path,'https://test').searchParams.get('search'),'ferry');
  view=await h.feed([question('body-hit','TR','Search in long post',{body:'x'.repeat(850)+' ferry'})]);
  assert.deepEqual(postTitles(view),['Search in long post'],'Server search matches after the mobile summary truncation');
 }finally{h.dispose();}
});

test('Starter discussions accept genuine replies and refresh the feed count after publication', async () => {
  const h = harness({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' });
  const starter = question('starter', 'TR', 'A starter discussion', { authorId: null, isStarter: true, username: 'nil', answerCount: 2 });
  const answer = { id: 'starter-reply', authorId: null, username: 'baran', isStarter: true, body: 'An editorial travel idea', createdAt: starter.createdAt };
  try {
    let view = await h.feed([starter]);
    assert.doesNotMatch(text(view), /Example discussion|Example comment|Örnek profil|Fictional participants/);
    const travellerCount = nodes(view).find(node => node.type === 'span' && text(find(node, 'small')) === 'In this feed');
    assert.equal(text(find(travellerCount, 'strong')), '0', 'Fictional personas never inflate actual traveller numbers');
    h.click('Open question: A starter discussion');
    h.requests.at(-1).resolve({ data: { ...starter, answers: [answer], totalAnswerCount: 2 } });
    view = await h.settle();
    assert.equal(nodes(view).filter(node => node.props?.className === 'community-starter-badge').length, 0);
    assert.doesNotMatch(text(view), /Example comment|Örnek profil/);
    h.change('textarea', props => props.id === 'community-answer-body', 'My genuine advice');
    view = h.click('Reply to @baran');
    assert.equal(h.focused, 'community-answer-body');
    assert.equal(find(view, 'textarea', props => props.id === 'community-answer-body').props.value, '@baran My genuine advice');
    const submit = button(view, 'Send answer'); submit.props.onClick(); submit.props.onClick(); h.render();
    const writes = h.requests.filter(request => request.path === '/api/country-community/answers');
    assert.equal(writes.length, 1, 'Double taps produce exactly one real submission');
    assert.equal(writes[0].options.body.body, '@baran My genuine advice');
    assert.equal(writes[0].options.headers.Authorization, 'Bearer TOKEN_A');
    writes[0].resolve({ moderation: { action: 'visible' } }); await h.settle();
    assert.ok(h.requests.findLast(request => request.path.startsWith('/api/country-community/feed') && !request.done), 'Successful post refreshes canonical feed counts');
    const detail = h.requests.findLast(request => request.path === '/api/country-community/questions/starter');
    detail.resolve({ data: { ...starter, answers: [answer, { ...answer, id: 'real-reply', authorId: 'account-a', username: 'Real user', isStarter: false }], totalAnswerCount: 3 } });
    await h.settle(); view = await h.feed([{ ...starter, answerCount: 3 }]);
    find(view, 'Sheet', props => props.title === 'Question details').props.onClose(); view = h.render();
    assert.ok(button(view, '3 replies: A starter discussion'));
  } finally { h.dispose(); }
});

test('Guests can read starter examples but replying opens real account sign-in', async () => {
  const h = harness();
  try {
    await h.feed(); h.click('Open question: Tokyo train advice');
    h.requests.at(-1).resolve({ data: { ...rows[2], answers: [{ id: 'example', authorId: null, username: 'nil · Örnek profil', isStarter: true, body: 'An example', createdAt: rows[2].createdAt }] } });
    await h.settle(); h.click('Reply to @nil · Örnek profil');
    assert.equal(h.accountOpened, 1);
    assert.equal(h.requests.filter(request => request.options.method === 'POST').length, 0);
  } finally { h.dispose(); }
});

test('A reply finishing after detail closes refreshes its real feed count without reopening the sheet', async () => {
  const h = harness({ user: { id: 'account-a' }, accessToken: 'TOKEN_A' });
  try {
    await h.feed(); h.click('Open question: Tokyo train advice');
    h.requests.at(-1).resolve({ data: { ...rows[2], answers: [] } });
    await h.settle(); h.change('textarea', props => props.id === 'community-answer-body', 'A real traveller reply'); h.click('Send answer');
    const pending = h.requests.at(-1);
    find(h.render(), 'Sheet', props => props.title === 'Question details').props.onClose(); h.render();
    pending.resolve({ moderation: { action: 'visible' } }); const view = await h.settle();
    assert.equal(find(view, 'Sheet', props => props.title === 'Question details'), undefined);
    assert.ok(h.requests.findLast(request => request.path.startsWith('/api/country-community/feed') && !request.done));
    assert.equal(h.requests.filter(request => request.path === '/api/country-community/questions/jp').length, 1);
  } finally { h.dispose(); }
});

test('Author photos and names open profiles for accounts and starter personas, preserve drafts and isolate account changes', async () => {
  const h = harness(account);
  try {
    const starter = question('starter', 'TR', 'Starter conversation', { authorId: null, isStarter: true, username: 'selma.dogan', profileKey: 'starter:selma.dogan' });
    let view = await h.feed([starter, rows[2]]);
    const entry = button(view, "Open @selma.dogan's profile");
    assert.ok(find(entry, 'CommunityAvatar', props => props.username === 'selma.dogan'));
    view = h.click("Open @selma.dogan's profile");
    assert.equal(find(view, 'CommunityProfileSheet').props.profileKey, 'starter:selma.dogan');
    assert.equal(find(view, 'CommunitySafetySheet').props.target, null);
    find(view, 'CommunityProfileSheet').props.onClose(); h.render();
    h.click('Open question: Tokyo train advice');
    const answer = { id: 'a1', username: 'Selin', authorId: 'author-selin', body: 'Advice', createdAt: rows[2].createdAt, avatarUrl: 'https://example.com/avatar.jpg' };
    h.requests.at(-1).resolve({ data: { ...rows[2], answers: [answer] } });
    await h.settle(); h.change('textarea', props => props.id === 'community-answer-body', 'Keep this reply draft');
    view = h.click("Open @Selin's profile");
    assert.equal(find(view, 'CommunityProfileSheet').props.profileKey, 'user:author-selin');
    assert.ok(find(button(view, "Open @Selin's profile"), 'CommunityAvatar', props => props.avatarUrl === answer.avatarUrl));
    find(view, 'CommunityProfileSheet').props.onClose(); view = h.render();
    assert.equal(find(view, 'textarea', props => props.id === 'community-answer-body').props.value, 'Keep this reply draft');
    h.click("Open @Selin's profile");
    view = h.render({ user: { id: 'account-b' }, accessToken: 'TOKEN_B' });
    assert.equal(find(view, 'CommunityProfileSheet'), undefined);
  } finally { h.dispose(); }
});

test('Following travellers uses authenticated server results, separates country follows and refreshes after a follow change', async () => {
  const h = harness(account);
  try {
    await h.feed(); let view = h.tab('following');
    assert.deepEqual(postTitles(view), [], 'Discover rows cannot flash as followed travellers');
    let req = h.requests.at(-1);
    assert.equal(new URL(req.path, 'https://test').searchParams.get('following'), '1');
    assert.equal(req.options.headers.Authorization, 'Bearer TOKEN_A');
    view = await h.feed([rows[2]]); assert.deepEqual(postTitles(view), ['Tokyo train advice']);
    view = h.click("Open @akira's profile");
    find(view, 'CommunityProfileSheet').props.onFollowChanged(); h.render();
    req = h.requests.at(-1); assert.equal(new URL(req.path, 'https://test').searchParams.get('following'), '1');
    await h.feed([]);
    h.render({ user: null, accessToken: '' }); await h.feed();
    view = h.tab('following'); assert.deepEqual(postTitles(view), []);
    view = h.click('Sign in'); assert.equal(h.accountOpened, 1);
  } finally { h.dispose(); }
});

test('More than 100 replies remain accessible and a failed later page preserves both replies and draft',async()=>{
 const h=harness({user:{id:'account-a'},accessToken:'TOKEN_A'});
 try{
  await h.feed();h.click('Open question: Tokyo train advice');
  const answers=Array.from({length:100},(_,i)=>({id:`reply-${i}`,body:`Reply ${i}`,username:'traveller',authorId:null,createdAt:'2026-10-01'}));
  h.requests.at(-1).resolve({data:{...rows[2],answers,totalAnswerCount:101,shownAnswerCount:100,hasFullAccess:true,nextOffset:100}});
  await h.settle();h.change('textarea',props=>props.id==='community-answer-body','Keep my draft');
  h.click('Load more replies');let request=h.requests.at(-1);assert.match(request.path,/offset=100$/);assert.equal(request.options.headers.Authorization,'Bearer TOKEN_A');
  request.reject(Error('503'));let view=await h.settle();assert.equal(nodes(view).filter(n=>n.props?.className==='community-answer').length,100);assert.equal(find(view,'textarea').props.value,'Keep my draft');
  h.click('Load more replies');h.requests.at(-1).resolve({data:{...rows[2],answers:[{...answers[0],id:'latest',body:'Newest reply'}],totalAnswerCount:101,nextOffset:null}});
  view=await h.settle();assert.equal(nodes(view).filter(n=>n.props?.className==='community-answer').length,101);assert.equal(find(view,'textarea').props.value,'Keep my draft');assert.ok(!button(view,'Load more replies'));
 }finally{h.dispose();}
});

test('Discussion and individual reply options retain their exact moderation targets while author taps open profiles', async () => {
  const h = harness(account);
  try {
    await h.feed(); h.click('Open question: Tokyo train advice');
    const replies = [
      { id: 'reply-one', username: 'Selin', authorId: 'author-selin', body: 'First advice', createdAt: rows[2].createdAt },
      { id: 'reply-two', username: 'Selin', authorId: 'author-selin', body: 'Second advice', createdAt: rows[2].createdAt },
    ];
    h.requests.at(-1).resolve({ data: { ...rows[2], answers: replies } });
    let view = await h.settle();
    view = h.click('Options for this post');
    assert.equal(find(view, 'CommunitySafetySheet').props.target.targetType, 'question');
    assert.equal(find(view, 'CommunitySafetySheet').props.target.targetId, 'jp');
    find(view, 'CommunitySafetySheet').props.onClose(); view = h.render();
    const articles = nodes(view).filter(node => node.props?.className === 'community-answer');
    button(articles[1], 'Options for this answer by @Selin').props.onClick(); view = h.render();
    assert.equal(find(view, 'CommunitySafetySheet').props.target.targetType, 'answer');
    assert.equal(find(view, 'CommunitySafetySheet').props.target.targetId, 'reply-two', 'The second reply does not report the author’s first published answer');
    find(view, 'CommunitySafetySheet').props.onClose(); h.render();
    view = h.click("Open @Selin's profile");
    assert.equal(find(view, 'CommunityProfileSheet').props.profileKey, 'user:author-selin');
  } finally { h.dispose(); }
});

test('Saving a community profile refreshes author photos without resetting the discussion, reply draft or loaded answer pages', async () => {
  const h = harness(account);
  try {
    await h.feed(); h.click('Open question: Tokyo train advice');
    const own = { id: 'own-reply', username: 'Me', authorId: account.user.id, body: 'My advice', createdAt: rows[2].createdAt };
    const other = { id: 'other-reply', username: 'Other', authorId: 'other', body: 'Other advice', createdAt: rows[2].createdAt };
    h.requests.at(-1).resolve({ data: { ...rows[2], answers: [other, own], nextOffset: 100, totalAnswerCount: 101 } });
    await h.settle(); h.change('textarea', props => props.id === 'community-answer-body', 'Unsent travel advice');
    let view = h.click("Open @Me's profile");
    find(view, 'CommunityProfileSheet').props.onProfileChanged(); view = h.render();
    assert.equal(find(view, 'textarea', props => props.id === 'community-answer-body').props.value, 'Unsent travel advice');
    const refresh = h.requests.findLast(request => request.path.startsWith('/api/country-community/profiles/'));
    refresh.resolve({ profile: { key: `user:${account.user.id}`, userId: account.user.id, username: 'Me', avatarUrl: 'https://example.com/new-photo.jpg' } });
    view = await h.settle();
    assert.equal(find(view, 'textarea', props => props.id === 'community-answer-body').props.value, 'Unsent travel advice');
    assert.equal(nodes(view).filter(node => node.props?.className === 'community-answer').length, 2);
    assert.ok(button(view, 'Load more replies'));
    assert.equal(find(button(view, "Open @Me's profile"), 'CommunityAvatar').props.avatarUrl, 'https://example.com/new-photo.jpg');
    assert.equal(h.requests.filter(request => request.path === '/api/country-community/questions/jp').length, 1, 'Profile edits must not reopen and reset the discussion');
  } finally { h.dispose(); }
});
