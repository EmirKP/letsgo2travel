import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props: type === 'ForumTranslation' && typeof props.children === 'function' ? { ...props, children: props.children(props.text, props.title) } : props, key });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
function load(path, imports, globals = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Date, Intl, URL, URLSearchParams, AbortController, ...globals })(name => {
    if (name.endsWith('.css')) return {};
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error(`Missing import ${name}`);
  }, result, result.exports);
  return result.exports;
}
function nodes(value) {
  if (!value || typeof value !== 'object' || value.props?.hidden) return [];
  return [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
}
function text(value) { return Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const button = (tree, label) => find(tree, 'button', props => text(props.children) === label || props['aria-label'] === label);
function hookHost() {
  const slots = []; let cursor, dirty, effects, view;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, index) => !Object.is(value, a[index]));
  const react = {
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useId() { const index = cursor++; return `test-${index}`; },
    useEffect(effect, deps) { const index = cursor++, old = slots[index]; if (changed(old?.deps, deps)) { slots[index] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  return { react, render(render) { for (let pass = 0; pass < 20; pass++) { cursor = 0; dirty = false; effects = []; view = render(); effects.forEach(effect => effect()); if (!dirty) return view; } throw Error('Render did not settle'); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const sample = (key = 'starter:selin.kaplan', overrides = {}) => ({ key, userId: key.startsWith('user:') ? key.slice(5) : null, username: key.slice(key.indexOf(':') + 1), avatarUrl: null, bio: '', isOwn: false, isFollowing: false, followerCount: 0, followingCount: 0, postCount: 1, answerCount: 2, isStarter: key.startsWith('starter:'), ...overrides });
const post = id => ({ id, title: `Topic ${id}`, body: `Advice ${id}`, countryCode: 'TR', createdAt: '2026-10-01T10:00:00Z' });
function harness(initial = {}, { dateLocale = 'en-GB', intl = Intl, inline = false } = {}) {
  let activeHost, navHost, contentHost, navKey, contentKey, tree, navigation;
  const requests = [], calls = { account: 0, follow: 0, profile: 0, questions: [], focused: [] };
  const requestJson = (path, options = {}) => { const waiting = deferred(); requests.push({ path, options, ...waiting }); return waiting.promise; };
  const profiles = load('mobile/src/lib/communityProfiles.ts', { './api': { requestJson } });
  const localeFormatting = load('mobile/src/lib/localeFormatting.ts', {
    './locales/sq-regions': load('mobile/src/lib/locales/sq-regions.ts', {}),
  }, { Intl: intl });
  const react = Object.fromEntries(['useState', 'useRef', 'useEffect', 'useId'].map(name => [name, (...args) => activeHost.react[name](...args)]));
  const source = load('mobile/src/components/CommunityProfileSheet.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../lib/api': { ApiError }, '../lib/communityProfiles': profiles,
    '../lib/i18n': { useI18n: () => ({ copy: (_, en) => en, dateLocale }) },
    '../lib/localeFormatting': localeFormatting,
    './CommunityAvatar': { CommunityAvatar: 'CommunityAvatar' }, './OfficialBadge': { OfficialBadge: 'OfficialBadge' }, './Icon': { Icon: 'Icon' }, './Sheet': { Sheet: 'Sheet' },
    './CommunitySafetySheet': { CommunitySafetySheet: 'CommunitySafetySheet', CommunityBlocksSheet: 'CommunityBlocksSheet' },
    './SocialHub': { SocialGallery: 'SocialGallery' }, './SocialComposer': { SocialComposer: 'SocialComposer' },
    './ForumTranslation': { ForumTranslation: 'ForumTranslation' }, './CommunityPostPhoto': { CommunityPostPhoto: 'CommunityPostPhoto' },
  }, { window: { addEventListener() {}, removeEventListener() {} }, document: { getElementById: id => ({ focus() { calls.focused.push(id); } }) } });
  let props = { profileKey: 'starter:selin.kaplan', userId: 'me', accessToken: 'token', onClose() {}, onOpenAccount: () => calls.account++, onEditProfile() {}, onFollowChanged: () => calls.follow++, onProfileChanged: () => calls.profile++, onOpenQuestion: id => calls.questions.push(id), ...initial };
  const h = {
    requests, calls, profiles,
    render(next = {}) {
      props = { ...props, ...next };
      const outer = inline ? source.CommunityProfileInline(props) : source.CommunityProfileSheet(props);
      if (!outer) { navHost?.dispose(); contentHost?.dispose(); navHost = contentHost = null; tree = null; return tree; }
      if (!navHost || navKey !== outer.key) { navHost?.dispose(); contentHost?.dispose(); navHost = hookHost(); contentHost = null; navKey = outer.key; }
      activeHost = navHost;
      navigation = navHost.render(() => outer.type(outer.props));
      const child = nodes(navigation).find(node => typeof node.type === 'function' && node.type.name === 'ProfileContent');
      if (!contentHost || contentKey !== child.key) { contentHost?.dispose(); contentHost = hookHost(); contentKey = child.key; }
      activeHost = contentHost;
      tree = contentHost.render(() => child.type(child.props));
      return tree;
    },
    get tree() { return tree; },
    get navigation() { return navigation; },
    async resolve(index, value) { requests[index].resolve(value); await tick(); h.render(); },
    async reject(index, error = new Error('offline')) { requests[index].reject(error); await tick(); h.render(); },
    click(label) { const target = button(tree, label) || button(navigation, label); assert.ok(target, `Missing button ${label}`); target.props.onClick(); return h.render(); },
    dispose() { navHost?.dispose(); contentHost?.dispose(); },
  };
  h.render(); return h;
}

test('inline account profile displays followers and posts directly without duplicating identity or self-follow', async () => {
  const h = harness({ profileKey: 'user:me' }, { inline: true });
  await h.resolve(0, { profile: sample('user:me', { isOwn: true, followerCount: 5, followingCount: 3 }), items: [post('mine')], nextOffset: null });
  assert.equal(find(h.navigation, 'Sheet'), undefined);
  assert.equal(find(h.tree, 'CommunityAvatar'), undefined, 'The existing account header remains the only avatar');
  assert.equal(button(h.tree, 'Follow'), undefined);
  assert.ok(button(h.tree, '5Followers'));
  assert.ok(button(h.tree, '3Following'));
  assert.equal(find(h.tree, 'SocialGallery').props.authorRef, 'user:me');
  h.click('Share a post');
  const composer = find(h.tree, 'SocialComposer');
  assert.equal(composer.props.ownerId, 'me');
  const before = find(h.tree, 'SocialGallery').props.revision;
  composer.props.onPublished(); h.render();
  assert.equal(find(h.tree, 'SocialComposer'), undefined);
  assert.equal(find(h.tree, 'SocialGallery').props.revision, before + 1);
  h.click('Answers2');
  await h.resolve(1, { profile: sample('user:me', { isOwn: true }), items: [{ id: 'answer', questionId: 'thread', questionTitle: 'My thread', body: 'My answer', createdAt: '2026-10-01' }], nextOffset: null });
  h.click('View discussion');
  assert.deepEqual(h.calls.questions, ['thread']);
  h.dispose();
});

test('inline follower navigation refreshes authoritative counts and changes account without leaking private drafts', async () => {
  const h = harness({ profileKey: 'user:me' }, { inline: true });
  await h.resolve(0, { profile: sample('user:me', { isOwn: true, followerCount: 1 }), items: [], nextOffset: null });
  h.click('1Followers');
  await h.resolve(1, { profile: sample('user:me', { isOwn: true, followerCount: 1 }), items: [{ key: 'user:friend', userId: 'friend', username: 'friend', avatarUrl: null }], nextOffset: null });
  h.click('@friend');
  const publicProfile = nodes(h.navigation).find(node => typeof node.type === 'function' && node.type.name === 'CommunityProfileSheet');
  assert.equal(publicProfile.props.profileKey, 'user:friend');
  publicProfile.props.onFollowChanged(); h.render();
  assert.match(h.requests.at(-1).path, /user%3Ame.*section=followers/);
  const pending = h.requests.at(-1);
  h.render({ profileKey: 'user:other', userId: 'other', accessToken: 'other-token' });
  assert.equal(pending.options.signal.aborted, true);
  assert.equal(find(h.tree, 'SocialGallery'), undefined);
  assert.equal(nodes(h.navigation).some(node => node.props?.profileKey === 'user:friend'), false);
  await h.resolve(h.requests.length - 1, { profile: sample('user:other', { isOwn: true }), items: [], nextOffset: null });
  assert.equal(find(h.tree, 'SocialGallery').props.authorRef, 'user:other');
  h.dispose();
});

test('profiles opened from the normal Profile retain reporting and blocking, then refresh the own list', async () => {
  const h = harness({ profileKey: 'user:me' }, { inline: true });
  await h.resolve(0, { profile: sample('user:me', { isOwn: true }), items: [], nextOffset: null });
  find(h.tree, 'SocialGallery').props.onOpenProfile('user:other'); h.render();
  const publicProfile = nodes(h.navigation).find(node => typeof node.type === 'function' && node.type.name === 'CommunityProfileSheet');
  const target = { targetType: 'question', targetId: 'reported-post', authorId: 'other', username: 'Other' };
  publicProfile.props.onSafety(target); h.render();
  const safety = find(h.navigation, 'CommunitySafetySheet');
  assert.deepEqual(safety.props.target, target);
  assert.equal(safety.props.userId, 'me');
  safety.props.onBlocked('other'); h.render();
  assert.equal(find(h.navigation, 'CommunitySafetySheet'), undefined);
  assert.equal(nodes(h.navigation).some(node => node.props?.profileKey === 'user:other'), false);
  assert.equal(h.requests.length, 2, 'Blocking refreshes own counters/list from the server');
  h.dispose();
});

test('profile dates retain the selected language, including Albanian on limited WebViews', async () => {
  function LimitedDateTimeFormat(locale, options) {
    return new Intl.DateTimeFormat(/^sq(?:-|$)/i.test(locale) ? 'tr-TR' : locale, options);
  }
  LimitedDateTimeFormat.supportedLocalesOf = locales => Intl.DateTimeFormat.supportedLocalesOf(locales.filter(locale => !/^sq(?:-|$)/i.test(locale)));
  for (const [dateLocale, expected] of [['tr-TR', '1 Eki 2026'], ['en-GB', '1 Oct 2026'], ['sq-AL', '1 tet 2026']]) {
    const h = harness({}, { dateLocale, intl: { DateTimeFormat: LimitedDateTimeFormat } });
    await h.resolve(0, { profile: sample(), items: [post('date')], nextOffset: null });
    h.click('Forum1');
    assert.ok(text(h.tree).includes(expected), `${dateLocale}: ${text(h.tree)}`);
    h.dispose();
  }
});

test('guest follow opens login without a mutation and avatar/content do not invent counts', async () => {
  const h = harness({ userId: null, accessToken: '' });
  await h.resolve(0, { profile: sample(), items: [post('a')], nextOffset: null });
  h.click('Follow');
  assert.equal(h.calls.account, 1);
  assert.equal(h.requests.length, 1);
  assert.match(text(h.tree), /0Followers0Following/);
  assert.equal(find(h.tree, 'CommunityAvatar').props.avatarUrl, null);
  h.dispose();
});

test('profile starts with a real photo gallery and offers three navigable sections plus own sharing', async () => {
  const h = harness({ profileKey: 'user:me' });
  await h.resolve(0, { profile: sample('user:me', { isOwn: true }), items: [post('forum')], nextOffset: null });
  const gallery = find(h.tree, 'SocialGallery');
  assert.equal(gallery.props.authorRef, 'user:me');
  assert.equal(gallery.props.accessToken, 'token');
  assert.deepEqual(nodes(h.tree).filter(node => node.props?.role === 'tab').map(text), ['Posts', 'Forum1', 'Answers2']);
  const posts = button(h.tree, 'Posts');
  posts.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} }); h.render();
  assert.equal(button(h.tree, 'Forum1').props['aria-selected'], true);
  assert.match(text(h.tree), /Topic forum/);
  h.click('Share a post');
  assert.equal(find(h.tree, 'SocialComposer').props.ownerId, 'me');
  h.dispose();
});

test('follow ignores double taps, refetches authoritative counters and notifies the Following feed', async () => {
  const h = harness();
  await h.resolve(0, { profile: sample(), items: [], nextOffset: null });
  const follow = button(h.tree, 'Follow');
  follow.props.onClick(); follow.props.onClick(); h.render();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].options.method, 'POST');
  assert.equal(h.requests[1].options.headers.Authorization, 'Bearer token');
  await h.resolve(1, { success: true, isFollowing: true });
  assert.equal(h.calls.follow, 1);
  assert.equal(h.requests.length, 3);
  await h.resolve(2, { profile: sample(undefined, { isFollowing: true, followerCount: 6 }), items: [], nextOffset: null });
  assert.equal(button(h.tree, 'Following').props['aria-pressed'], true);
  assert.ok(button(h.tree, '6Followers'));
  h.click('Following');
  assert.equal(h.requests[3].options.method, 'DELETE');
  h.dispose();
});

test('changing account discards pending follow responses and private editor state', async () => {
  const h = harness();
  await h.resolve(0, { profile: sample(), items: [], nextOffset: null });
  h.click('Follow');
  h.render({ userId: 'other', accessToken: 'other-token' });
  assert.equal(h.requests[1].options.signal.aborted, true);
  await h.resolve(1, { success: true, isFollowing: true });
  assert.equal(h.calls.follow, 0);
  assert.equal(h.requests[2].options.headers.Authorization, 'Bearer other-token');
  await h.resolve(2, { profile: sample(), items: [], nextOffset: null });
  assert.ok(button(h.tree, 'Follow'));
  h.dispose();
});

test('switching sections rejects stale responses; answers open their parent topic', async () => {
  const h = harness();
  await h.resolve(0, { profile: sample(), items: [post('first')], nextOffset: null });
  h.click('Answers2');
  h.click('Forum1');
  assert.equal(h.requests[1].options.signal.aborted, true);
  await h.resolve(1, { profile: sample(), items: [{ id: 'answer', questionId: 'parent', questionTitle: 'Parent', body: 'Old response', createdAt: '2026-10-01T10:00:00Z' }], nextOffset: null });
  assert.doesNotMatch(text(h.tree), /Old response/);
  await h.resolve(2, { profile: sample(), items: [post('current')], nextOffset: null });
  h.click('Answers2');
  await h.resolve(3, { profile: sample(), items: [{ id: 'answer', questionId: 'parent', questionTitle: 'Parent', body: 'Answer text', createdAt: '2026-10-01T10:00:00Z' }], nextOffset: null });
  find(h.tree, 'button', props => props.className === 'community-profile-post-cta').props.onClick();
  assert.deepEqual(h.calls.questions, ['parent']);
  h.dispose();
});

test('empty posts shortcut uses the real answer count and opens the answers tab with keyboard focus', async () => {
  const h = harness();
  const profile = sample(undefined, { postCount: 0, answerCount: 6 });
  await h.resolve(0, { profile, items: [], nextOffset: null });
  h.click('Forum0');
  assert.match(text(h.tree), /No posts yetThis traveller’s posts will appear here\./);
  assert.ok(button(h.tree, 'View 6 answers'));
  h.click('View 6 answers');
  assert.match(h.requests[1].path, /section=answers/);
  const selectedTab = find(h.tree, 'button', props => props.role === 'tab' && props['aria-selected']);
  assert.equal(text(selectedTab), 'Answers6');
  assert.deepEqual(h.calls.focused, [selectedTab.props.id]);
  await h.resolve(1, { profile, items: [{ id: 'answer', questionId: 'parent', questionTitle: 'Parent', body: 'Answer text', createdAt: '2026-10-01T10:00:00Z' }], nextOffset: null });
  assert.match(text(h.tree), /Answer text/);
  assert.equal(button(h.tree, 'View 6 answers'), undefined);
  h.dispose();
});

test('empty posts never invent an answer shortcut for a profile without answers', async () => {
  const h = harness();
  await h.resolve(0, { profile: sample(undefined, { postCount: 0, answerCount: 0 }), items: [], nextOffset: null });
  h.click('Forum0');
  assert.match(text(h.tree), /No posts yet/);
  assert.equal(find(h.tree, 'button', props => props.className === 'community-profile-answer-link'), undefined);
  assert.match(text(h.tree), /0Forum contributions/);
  h.dispose();
});

test('paging failure keeps existing content and retry deduplicates rows', async () => {
  const h = harness();
  await h.resolve(0, { profile: sample(), items: [post('a')], nextOffset: 20 });
  h.click('Forum1');
  h.click('Show more');
  await h.reject(1);
  assert.match(text(h.tree), /Topic a/);
  h.click('Try again');
  assert.match(h.requests[2].path, /offset=20/);
  await h.resolve(2, { profile: sample(), items: [post('a'), post('b')], nextOffset: null });
  assert.equal(nodes(h.tree).filter(node => node.props?.className === 'community-profile-post').length, 2);
  assert.equal(button(h.tree, 'Show more'), undefined);
  h.dispose();
});

test('own edit preserves failed draft and saves public-avatar choice explicitly', async () => {
  const h = harness({ profileKey: 'user:me' });
  const own = sample('user:me', { isOwn: true, bio: 'Original bio', showAvatar: false });
  await h.resolve(0, { profile: own, items: [], nextOffset: null });
  assert.equal(button(h.tree, 'Follow'), undefined);
  h.click('Edit profile');
  find(h.tree, 'textarea').props.onChange({ target: { value: 'A different bio' } });
  find(h.tree, 'input').props.onChange({ target: { checked: true } }); h.render();
  assert.equal(button(h.tree, 'Change profile photo').props.disabled, true, 'Photo navigation cannot silently discard a dirty bio/public-photo setting');
  assert.match(text(h.tree), /Save or cancel your changes/);
  find(h.tree, 'form').props.onSubmit({ preventDefault() {} }); h.render();
  assert.equal(h.requests[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[1].options.body)), { bio: 'A different bio', showAvatar: true });
  await h.reject(1);
  assert.equal(find(h.tree, 'textarea').props.value, 'A different bio');
  await h.resolve(2, { profile: own, items: [], nextOffset: null });
  find(h.tree, 'form').props.onSubmit({ preventDefault() {} }); h.render();
  await h.resolve(3, { success: true, bio: 'A different bio', showAvatar: true });
  assert.equal(h.calls.profile, 1);
  assert.equal(find(h.tree, 'textarea'), undefined);
  assert.match(text(h.tree), /A different bio/);
  h.dispose();
});

test('one inline profile editor saves identity before bio, retains photo access and waits for both acknowledgements', async () => {
  const identity = deferred(), identityWrites = [], editing = []; let photos = 0;
  const h = harness({ profileKey: 'user:me', identityFullName: 'Original Name', onSaveIdentity: (...values) => { identityWrites.push(values); return identity.promise; }, onEditProfile: () => photos++, onEditingChange: value => editing.push(value) }, { inline: true });
  try {
    await h.resolve(0, { profile: sample('user:me', { isOwn: true, bio: 'Original bio', showAvatar: true }), items: [], nextOffset: null });
    h.click('Edit profile');
    assert.equal(editing.at(-1), true);
    const field = suffix => find(h.tree, 'input', props => props.id?.endsWith(suffix));
    assert.equal(field('-full-name').props.value, 'Original Name'); assert.equal(field('-username').props.value, 'me');
    field('-full-name').props.onChange({ target: { value: '  Updated  Name ' } });
    field('-username').props.onChange({ target: { value: 'new_name' } });
    find(h.tree, 'textarea').props.onChange({ target: { value: 'Updated bio' } }); h.render();
    assert.equal(button(h.tree, 'Change profile photo').props.disabled, false);
    h.click('Change profile photo'); assert.equal(photos, 1); assert.equal(find(h.tree, 'textarea').props.value, 'Updated bio');
    find(h.tree, 'form').props.onSubmit({ preventDefault() {} }); h.render();
    assert.deepEqual(identityWrites, [['Updated Name', 'new_name']]); assert.equal(h.requests.length, 1, 'No bio write runs before identity acknowledgement');
    assert.equal(find(h.tree, 'textarea').props.disabled, true); assert.equal(h.calls.profile, 0);
    identity.resolve(); await tick(); h.render();
    assert.equal(editing.at(-1), true, 'Auth completion cannot release the parent resume guard while bio is pending');
    assert.equal(h.requests[1].options.method, 'PATCH'); assert.equal(h.requests[1].options.body.bio, 'Updated bio');
    await h.resolve(1, { success: true, bio: 'Updated bio', showAvatar: true });
    assert.equal(h.calls.profile, 1); assert.equal(find(h.tree, 'form'), undefined); assert.match(text(h.tree), /@new_name/);
    assert.equal(editing.at(-1), false);
  } finally { h.dispose(); }
});

test('An incomplete auth identity is explicitly completed even when its displayed values already match the profile row', async () => {
  const identity=deferred(),writes=[];
  const h=harness({profileKey:'user:me',identityFullName:'Original Name',identityNeedsCompletion:true,onSaveIdentity:(...values)=>{writes.push(values);return identity.promise;}},{inline:true});
  try {
    await h.resolve(0,{profile:sample('user:me',{isOwn:true,username:'valid_user',bio:'Original bio',showAvatar:true}),items:[],nextOffset:null});
    h.click('Edit profile');find(h.tree,'form').props.onSubmit({preventDefault(){}});h.render();
    assert.deepEqual(writes,[['Original Name','valid_user']]);assert.equal(h.requests.length,1);
    identity.resolve();await tick();h.render();assert.equal(h.requests[1].options.method,'PATCH');
    await h.resolve(1,{success:true,bio:'Original bio',showAvatar:true});assert.equal(h.calls.profile,1);
  } finally {h.dispose();}
});

test('invalid or rejected identity leaves the unified draft available and never reports a successful profile save', async () => {
  const writes = [], identity = deferred();
  const h = harness({ profileKey: 'user:me', identityFullName: 'Original Name', onSaveIdentity: (...values) => { writes.push(values); return identity.promise; } }, { inline: true });
  try {
    await h.resolve(0, { profile: sample('user:me', { isOwn: true, username: 'original_name' }), items: [], nextOffset: null }); h.click('Edit profile');
    const name = () => find(h.tree, 'input', props => props.id?.endsWith('-full-name'));
    const username = () => find(h.tree, 'input', props => props.id?.endsWith('-username'));
    name().props.onChange({ target: { value: 'X' } }); h.render(); find(h.tree, 'form').props.onSubmit({ preventDefault() {} }); h.render();
    assert.equal(writes.length, 0); assert.match(text(h.tree), /Full name must/);
    name().props.onChange({ target: { value: 'New Name' } }); username().props.onChange({ target: { value: 'new_name' } });
    find(h.tree, 'textarea').props.onChange({ target: { value: 'Draft retained' } }); h.render();
    find(h.tree, 'form').props.onSubmit({ preventDefault() {} }); h.render(); identity.reject(new ApiError('conflict', 409)); await tick(); h.render();
    assert.equal(h.requests.length, 2, 'Failure triggers a read refresh, never a bio PATCH');
    assert.ok(h.requests.every(request => request.options.method !== 'PATCH')); assert.equal(h.calls.profile, 0);
    assert.equal(name().props.value, 'New Name'); assert.equal(username().props.value, 'new_name'); assert.equal(find(h.tree, 'textarea').props.value, 'Draft retained');
    assert.ok(button(h.tree, 'Save')); assert.doesNotMatch(text(h.tree), /Your profile was updated/);
  } finally { h.dispose(); }
});

test('a bio failure after identity acknowledgement reports partial completion and retains the remaining draft', async () => {
  const h = harness({ profileKey: 'user:me', identityFullName: 'Original Name', onSaveIdentity: async () => {} }, { inline: true });
  try {
    await h.resolve(0, { profile: sample('user:me', { isOwn: true, username: 'original_name' }), items: [], nextOffset: null }); h.click('Edit profile');
    find(h.tree, 'input', props => props.id?.endsWith('-full-name')).props.onChange({ target: { value: 'New Name' } });
    find(h.tree, 'input', props => props.id?.endsWith('-username')).props.onChange({ target: { value: 'new_name' } });
    find(h.tree, 'textarea').props.onChange({ target: { value: 'Remaining draft' } }); h.render();
    find(h.tree, 'form').props.onSubmit({ preventDefault() {} }); await tick(); h.render(); await h.reject(1);
    assert.match(text(h.tree), /Your name and username were saved/); assert.equal(find(h.tree, 'textarea').props.value, 'Remaining draft'); assert.equal(h.calls.profile, 0);
  } finally { h.dispose(); }
});

test('an account edit request waits for the owned profile and cannot reset a draft or open another account editor', async () => {
  let handled = 0;
  const h = harness({ profileKey: 'user:me', editRequest: 1, onEditRequestHandled: () => handled++, identityFullName: 'Own Name', onSaveIdentity: async () => {} }, { inline: true });
  try {
    assert.equal(find(h.tree, 'form'), undefined);
    await h.resolve(0, { profile: sample('user:me', { isOwn: true, username: 'own_name' }), items: [], nextOffset: null });
    assert.equal(handled, 1); assert.ok(find(h.tree, 'form'));
    find(h.tree, 'textarea').props.onChange({ target: { value: 'Do not reset this' } }); h.render({ identityFullName: 'Refreshed Name' });
    assert.equal(handled, 1); assert.equal(find(h.tree, 'textarea').props.value, 'Do not reset this');
    h.render({ profileKey: 'user:other', userId: 'other', editRequest: 0 });
    await h.resolve(h.requests.length - 1, { profile: sample('user:other', { isOwn: true }), items: [], nextOffset: null });
    assert.equal(find(h.tree, 'form'), undefined); assert.doesNotMatch(text(h.tree), /Do not reset this/);
  } finally { h.dispose(); }
});

test('followers navigate into the selected profile and provide a route back', async () => {
  const h = harness();
  await h.resolve(0, { profile: sample(undefined, { followerCount: 1 }), items: [], nextOffset: null });
  h.click('1Followers');
  await h.resolve(1, { profile: sample(undefined, { followerCount: 1 }), items: [{ key: 'user:friend', userId: 'friend', username: 'friend', avatarUrl: null }], nextOffset: null });
  h.click('@friend');
  assert.match(h.requests[2].path, /user%3Afriend/);
  await h.resolve(2, { profile: sample('user:friend'), items: [], nextOffset: null });
  h.click('Previous profile');
  assert.match(h.requests[3].path, /starter%3Aselin.kaplan/);
  h.dispose();
});

test('avatar helper rejects unsafe URLs and generates stable initials for real names and handles', () => {
  const helpers = load('mobile/src/lib/communityProfiles.ts', { './api': {} });
  assert.equal(helpers.profileAvatarUrl('javascript:alert(1)'), null);
  assert.equal(helpers.profileAvatarUrl('https://user:secret@example.com/photo.jpg'), null);
  assert.equal(helpers.profileAvatarUrl('https://example.com/photo.jpg'), 'https://example.com/photo.jpg');
  assert.equal(helpers.profileInitials('@selin.kaplan'), 'SK');
  assert.equal(helpers.profileInitials('HÜLYA POLAT'), 'HP');
  assert.equal(helpers.profileInitials(''), '?');
});

test('an unavailable profile clears previously displayed identity and content, unlike ordinary network failures', async () => {
  const h = harness();
  await h.resolve(0, { profile: sample(), items: [post('private-now')], nextOffset: null });
  h.click('Answers2');
  await h.reject(1, new ApiError('blocked', 403));
  assert.equal(find(h.tree, 'CommunityAvatar'), undefined);
  assert.doesNotMatch(text(h.tree), /selin.kaplan|Topic private-now/);
  assert.match(text(h.tree), /currently unavailable/);
  h.click('Try again');
  await h.resolve(2, { profile: sample(), items: [], nextOffset: null });
  assert.ok(find(h.tree, 'CommunityAvatar'));
  h.dispose();
});


test('own unpublished forum photos show distinct status and no broken public discussion link',async()=>{
 const h=harness({profileKey:'user:me'});try{
  const items=['pending','hidden','rejected','closed','published'].map((status,i)=>({...post(String(i)),status,photoUrl:`/api/country-community/questions/${i}/photo`}));
  await h.resolve(0,{profile:sample('user:me',{isOwn:true,postCount:5}),items,nextOffset:null});h.click('Forum5');
  for(const status of ['In review','Hidden','Rejected','Closed'])assert.ok(text(h.tree).includes(status));
  assert.equal(nodes(h.tree).filter(n=>n.type==='CommunityPostPhoto').length,5);assert.ok(nodes(h.tree).filter(n=>n.type==='CommunityPostPhoto').every(n=>n.props.accessToken==='token'));
  assert.equal(nodes(h.tree).filter(n=>n.type==='button'&&text(n)==='View discussion').length,1);h.click('View discussion');assert.deepEqual(h.calls.questions,['4']);
 }finally{h.dispose();}
});
