import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
class ApiError extends Error { constructor(message, status = 0) { super(message); this.status = status; } }
function load(path, imports, globals = {}, expose = '') {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n${expose}})`, { Date, Intl, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, ...globals })(name => {
    if (name.endsWith('.css')) return {};
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error(`Missing import ${name}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}
function nodes(value) { if (!value || typeof value !== 'object' || value.props?.hidden) return []; return [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)]; }
function text(value) { return Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const button = (tree, label) => find(tree, 'button', props => props['aria-label'] === label || text(props.children).trim() === label);
function hookHost() {
  const slots = []; let cursor, effects, dirty, tree;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, index) => !Object.is(value, a[index]));
  const react = {
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect, deps) { const index = cursor++, old = slots[index]; if (changed(old?.deps, deps)) { slots[index] = { ...old, deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  return { react, render(fn) { for (let pass = 0; pass < 20; pass++) { cursor = 0; effects = []; dirty = false; tree = fn(); effects.forEach(effect => effect()); if (!dirty) return tree; } throw Error('Unstable render'); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const uuid = n => `11111111-2222-4333-8444-${String(n).padStart(12, '0')}`;
const photo = 'data:image/jpeg;base64,/9j/AA==';
const samplePost = (n = 1, overrides = {}) => ({ id: uuid(n), author: { key: 'user:me', userId: 'me', username: 'traveller', avatarUrl: null }, caption: `My trip ${n}`, photoUrl: `/api/country-community/social/${uuid(n)}/photo`, createdAt: '2026-10-11T10:00:00Z', visibility: 'public', status: 'published', likeCount: 2, commentCount: 0, liked: false, saved: false, collectionIds: [], isOwn: true, place: { name: 'Ksamil', countryCode: 'AL' }, ...overrides });
const sampleComment = (n = 2) => ({ id: uuid(n), author: { key: 'user:me', userId: 'me', username: 'traveller', avatarUrl: null }, body: 'Beautiful!', parentId: null, createdAt: '2026-10-11T10:10:00Z', status: 'published', isOwn: true });
function environment(storage = new Map()) {
  const requests = [], events = new Map(); let ids = 0;
  const requestJson = (path, options = {}) => { const wait = deferred(); requests.push({ path, options, ...wait }); return wait.promise; };
  const globals = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, window: { addEventListener: (name, handler) => events.set(name, handler), removeEventListener: name => events.delete(name) } };
  const id = { createId: () => uuid(++ids) };
  const social = load('mobile/src/lib/social.ts', { './api': { requestJson }, './id': id }, globals);
  return { requests, storage, events, globals, id, social, requestJson };
}
function harness(kind, initial = {}, env = environment()) {
  const host = hookHost(), calls = { published: [], closed: 0, changed: [], deleted: [], login: 0, profiles: [], places: [], selected: [], handled: 0, blocked: [] };
  const copy = (_, en) => en;
  const i18n = { useI18n: () => ({ copy, dateLocale: 'en-GB', countryName: (_, fallback) => fallback }) };
  const imports = { react: host.react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' }, '../lib/i18n': i18n, '../lib/social': env.social, '../lib/id': env.id, '../lib/api': { ApiError }, '../lib/localeFormatting': { formatAppDate: value => value.toISOString().slice(0, 10) }, './Icon': { Icon: 'Icon' }, './Sheet': { Sheet: 'Sheet' }, './CommunityAvatar': { CommunityAvatar: 'CommunityAvatar' }, './SocialComposer': { SocialComposer: 'SocialComposer' }, './SocialPhoto': { SocialPhoto: 'SocialPhoto' }, './ForumTranslation': { ForumTranslation: 'ForumTranslation' }, '../lib/communityPhoto': { prepareCommunityPhoto: async () => photo }, '../data/countries': { COUNTRY_LIST: [] }, '../data/countryIso': { alpha2FromAlpha3: x => x }, './CountryPicker': { CountryPicker: 'CountryPicker' } };
  const path = kind === 'SocialComposer' ? 'mobile/src/components/SocialComposer.tsx' : 'mobile/src/components/SocialHub.tsx';
  const source = load(path, imports, env.globals, kind === 'SocialComposer' ? '' : 'exports.SocialBrowser = SocialBrowser; exports.SocialPostSheet = SocialPostSheet; exports.CollectionsSheet = CollectionsSheet; exports.ReportSheet = ReportSheet;');
  let props = { ownerId: 'me', userId: 'me', accessToken: 'TOKEN', onClose: () => calls.closed++, onPublished: post => calls.published.push(post), onOpenAccount: () => calls.login++, onOpenProfile: key => calls.profiles.push(key), onAddPlace: place => calls.places.push(place), onChanged: post => calls.changed.push(post), onDeleted: (...value) => calls.deleted.push(value), onSelect: collection => calls.selected.push(collection), onIntentHandled: () => calls.handled++, onBlocked: userId => calls.blocked.push(userId), ...initial };
  let tree;
  const h = { ...env, calls, render(next = {}) { props = { ...props, ...next }; tree = host.render(() => source[kind](props)); return tree; }, get tree() { return tree; }, click(label) { const target = button(tree, label); assert.ok(target, `button ${label}`); target.props.onClick(); return h.render(); }, async resolve(index, value) { env.requests[index].resolve({ data: value }); await tick(); return h.render(); }, async reject(index) { env.requests[index].reject(new Error('offline')); await tick(); return h.render(); }, dispose: () => host.dispose() };
  h.render(); return h;
}

test('social drafts are isolated by account, validate corrupted input and retain an idempotency key', () => {
  const env = environment();
  const draft = { ...env.social.emptySocialDraft(), caption: 'A quiet coast', photo, visibility: 'followers', place: 'Ksamil', countryCode: 'AL' };
  assert.equal(env.social.saveSocialDraft('alice', draft), true);
  assert.equal(env.social.readSocialDraft('alice').photo, photo);
  assert.equal(env.social.readSocialDraft('alice').requestId, draft.requestId);
  assert.equal(env.social.readSocialDraft('bob').caption, '');
  env.storage.set('l2t.social.draft.v1.alice', JSON.stringify({ ...draft, photo: 'https://outside.example/private.jpg' }));
  assert.equal(env.social.readSocialDraft('alice').photo, '');
  env.storage.set('l2t.social.draft.v1.alice', 'not-json');
  assert.equal(env.social.readSocialDraft('alice').caption, '');
});

test('composer persists on close, retries without duplicate IDs and clears only on confirmed upload', async () => {
  const env = environment();
  env.social.saveSocialDraft('me', { ...env.social.emptySocialDraft(), photo, caption: 'Coastal walk', place: 'Ksamil', countryCode: 'AL', visibility: 'followers' });
  const h = harness('SocialComposer', {}, env);
  const share = button(h.tree, 'Share'); share.props.onClick(); share.props.onClick(); h.render();
  assert.equal(h.requests.length, 1, 'Double tap creates one upload');
  assert.equal(h.requests[0].options.headers.Authorization, 'Bearer TOKEN');
  assert.equal(h.requests[0].options.body.visibility, 'followers');
  assert.equal(find(h.tree, 'Sheet').props.dismissible, false);
  await h.reject(0);
  assert.equal(find(h.tree, 'textarea').props.value, 'Coastal walk');
  assert.equal(env.social.readSocialDraft('me').caption, 'Coastal walk');
  h.click('Try again');
  assert.equal(h.requests[0].options.body.requestId, h.requests[1].options.body.requestId);
  await h.resolve(1, samplePost());
  assert.equal(h.calls.published.length, 1);
  assert.equal(env.social.readSocialDraft('me').caption, '');
  h.dispose();
  assert.equal(env.social.readSocialDraft('me').photo, '', 'Unmount cannot resurrect a published draft');
});

test('edited failed draft gets a fresh operation ID and pagehide retains its latest text', async () => {
  const env = environment(); env.social.saveSocialDraft('me', { ...env.social.emptySocialDraft(), photo, caption: 'Before' });
  const h = harness('SocialComposer', {}, env);
  h.click('Share'); await h.reject(0);
  find(h.tree, 'textarea').props.onChange({ target: { value: 'After' } }); h.render();
  env.events.get('pagehide')();
  assert.equal(env.social.readSocialDraft('me').caption, 'After');
  h.click('Share');
  assert.notEqual(h.requests[0].options.body.requestId, h.requests[1].options.body.requestId);
  h.dispose();
  await h.resolve(1, samplePost());
  assert.equal(h.calls.published.length, 0, 'Unmounted account does not open another account\'s post');
});

test('feed preserves old rows on paging error, ignores stale requests and opens notification target once', async () => {
  const h = harness('SocialBrowser', { feed: 'following', initialPostId: uuid(9) });
  assert.equal(h.calls.handled, 1);
  assert.match(h.requests[0].path, /feed=following/);
  assert.equal(h.requests[0].options.headers.Authorization, 'Bearer TOKEN');
  await h.resolve(0, { items: [samplePost()], nextOffset: 20 });
  h.click('Show more'); await h.reject(1);
  assert.match(text(h.tree), /My trip 1/);
  h.render({ revision: 1, initialPostId: undefined });
  assert.equal(h.requests[0].options.signal.aborted, true);
  await h.resolve(2, { items: [samplePost(2)], nextOffset: null });
  assert.match(text(h.tree), /My trip 2/); assert.doesNotMatch(text(h.tree), /My trip 1/);
  h.dispose();
});

test('post likes only change after server success and fast taps send one mutation', async () => {
  const h = harness('SocialPostSheet', { postId: uuid(1) });
  await h.resolve(0, { post: samplePost(), comments: { items: [], nextOffset: null } });
  const like = button(h.tree, '2Like'); like.props.onClick(); like.props.onClick(); h.render();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].options.body.action, 'like');
  await h.reject(1);
  assert.ok(button(h.tree, '2Like'));
  h.click('2Like'); await h.resolve(2, samplePost(1, { liked: true, likeCount: 3 }));
  assert.equal(button(h.tree, '3Like').props['aria-pressed'], true);
  assert.equal(h.calls.changed[0].likeCount, 3);
  h.dispose();
});

test('failed comments retain body and retry ID, post place passes real structured location', async () => {
  const h = harness('SocialPostSheet', { postId: uuid(1) });
  await h.resolve(0, { post: samplePost(), comments: { items: [], nextOffset: null } });
  find(h.tree, 'textarea').props.onChange({ target: { value: 'Beautiful!' } }); h.render();
  find(h.tree, 'form').props.onSubmit({ preventDefault() {} }); h.render(); await h.reject(1);
  assert.equal(find(h.tree, 'textarea').props.value, 'Beautiful!');
  find(h.tree, 'form').props.onSubmit({ preventDefault() {} }); h.render();
  assert.equal(h.requests[1].options.body.requestId, h.requests[2].options.body.requestId);
  await h.resolve(2, sampleComment());
  assert.equal(find(h.tree, 'textarea').props.value, '');
  h.click('Add to my route');
  assert.deepEqual(h.calls.places[0], { name: 'Ksamil', countryCode: 'AL' });
  h.dispose();
});

test('deletion reports server undo deadline; collection membership removal uses the actual saved collection', async () => {
  const h = harness('SocialPostSheet', { postId: uuid(1) });
  await h.resolve(0, { post: samplePost(), comments: { items: [], nextOffset: null } });
  h.click('Delete post'); h.click('Delete');
  const until = new Date(Date.now() + 30_000).toISOString(); await h.resolve(1, { undoUntil: until });
  assert.equal(h.calls.deleted[0][1], until);
  h.dispose();
  const saved = samplePost(1, { saved: true, collectionIds: [uuid(4)] });
  let updated;
  const c = harness('CollectionsSheet', { post: saved, onPostChanged: post => { updated = post; } });
  await c.resolve(0, [{ id: uuid(4), name: 'Summer', postCount: 1 }]);
  c.click('Summer1 posts');
  assert.equal(c.requests[1].options.body.active, false);
  assert.equal(c.requests[1].options.body.collectionId, uuid(4));
  await c.resolve(1, { ...saved, saved: false, collectionIds: [] });
  assert.equal(updated.saved, false);
  c.dispose();
});

test('blocking requires the chosen post/comment target, ignores duplicate taps and preserves the sheet on failure', async () => {
  const h = harness('ReportSheet', { postId: uuid(1), commentId: uuid(2) });
  h.click('Block user');
  assert.equal(h.requests.length, 0, 'Opening confirmation cannot block a user');
  const block = button(h.tree, 'Block'); block.props.onClick(); block.props.onClick(); h.render();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.headers.Authorization, 'Bearer TOKEN');
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].options.body)), { action: 'block', postId: uuid(1), commentId: uuid(2) });
  assert.equal(find(h.tree, 'Sheet').props.dismissible, false);
  await h.reject(0);
  assert.equal(h.calls.blocked.length, 0);
  assert.match(text(h.tree), /Could not block/);
  h.click('Block'); await h.resolve(1, { success: true, userId: 'canonical-comment-author' });
  assert.deepEqual(h.calls.blocked, ['canonical-comment-author']);
  h.dispose();
});

test('blocked social-only author is removed immediately and the server feed refreshes', async () => {
  const h = harness('SocialBrowser');
  await h.resolve(0, { items: [samplePost(1, { author: { userId: 'social-only', key: 'user:social-only', username: 'person', avatarUrl: null }, isOwn: false }), samplePost(2)], nextOffset: null });
  find(h.tree, 'SocialPhoto').props.onOpen(); h.render();
  const detail = nodes(h.tree).find(node => typeof node.type === 'function' && node.type.name === 'SocialPostSheet');
  detail.props.onBlocked('social-only'); h.render();
  assert.doesNotMatch(text(h.tree), /My trip 1/);
  assert.match(text(h.tree), /My trip 2/);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.calls.blocked, ['social-only']);
  assert.equal(nodes(h.tree).some(node => typeof node.type === 'function' && node.type.name === 'SocialPostSheet'), false);
  h.dispose();
});
