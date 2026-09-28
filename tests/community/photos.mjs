import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const root = process.cwd();
function load(file, mocks = {}) {
  const filename = path.resolve(root, file);
  const output = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Buffer, Response, Request, Uint8Array, console })(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name) + '.ts', mocks);
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    return require(name);
  }, output, output.exports);
  return output.exports;
}
const photos = load('lib/community/photos.ts');
const serializers = load('lib/community/serializers.ts');
const safety = load('lib/community/safety.ts');
const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const topicId = '20000000-0000-4000-8000-000000000001';
const sourcePhoto = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#347cab' } })
  .withExif({ IFD0: { ImageDescription: 'private-camera-metadata' } }).jpeg().toBuffer();
const photoData = `data:image/jpeg;base64,${sourcePhoto.toString('base64')}`;

function fixture(overrides = {}) {
  const state = {
    rows: { forum_topics: [], forum_topic_photos: [] },
    objects: new Map(), publicBucket: false, noBucket: false, failures: {}, events: [],
    authenticated: true, admin: true, hidden: [], ...overrides,
  };
  const db = {
    from(table) {
      let operation = 'select', value, filters = [];
      const query = {
        select() { return query; },
        eq(field, expected) { filters.push(row => row[field] === expected); return query; },
        in(field, values) { filters.push(row => values.includes(row[field])); return query; },
        insert(row) { operation = 'insert'; value = row; return query; },
        delete() { operation = 'delete'; return query; },
        maybeSingle() { return execute(true); },
        then(resolve, reject) { return execute(false).then(resolve, reject); },
      };
      async function execute(single) {
        state.events.push(`${table}:${operation}`);
        const error = state.failures[`${table}:${operation}`];
        if (error) return { data: null, error };
        const rows = state.rows[table] || [];
        if (operation === 'insert') { rows.push({ ...value }); state.rows[table] = rows; return { data: null, error: null }; }
        const found = rows.filter(row => filters.every(filter => filter(row)));
        if (operation === 'delete') state.rows[table] = rows.filter(row => !found.includes(row));
        return { data: single ? found[0] || null : found, error: null };
      }
      return query;
    },
    storage: {
      async getBucket(bucket) {
        assert.equal(bucket, photos.COMMUNITY_PHOTO_BUCKET);
        return state.noBucket ? { data: null, error: state.bucketError || { status: 404 } } : { data: { public: state.publicBucket }, error: null };
      },
      from(bucket) {
        assert.equal(bucket, photos.COMMUNITY_PHOTO_BUCKET);
        return {
          async upload(key, bytes, options) {
            state.events.push('upload');
            assert.equal(options.contentType, 'image/jpeg'); assert.equal(options.upsert, false);
            if (state.failures.upload) return { error: state.failures.upload };
            state.objects.set(key, bytes); return { error: null };
          },
          async download(key) {
            state.events.push('download');
            const bytes = state.objects.get(key);
            return { data: bytes ? new Blob([bytes], { type: 'image/jpeg' }) : null, error: null };
          },
          async remove(keys) {
            state.events.push('remove');
            if (state.failures.remove) return { error: state.failures.remove };
            keys.forEach(key => state.objects.delete(key)); return { error: null };
          },
          async list(prefix, { limit }) {
            return { data: [...state.objects.keys()].filter(key => key.startsWith(prefix + '/')).slice(0, limit).map(key => ({ name: key.slice(prefix.length + 1) })), error: null };
          },
        };
      },
    },
  };
  const mocks = {
    'next/server': { NextResponse: Response },
    '@/lib/community/photos': photos,
    '@/lib/community/safety': safety,
    '@/lib/authenticated-user': { requireAuthenticatedUser: async () => state.authenticated
      ? { ok: true, supabase: db, user: { id: owner, user_metadata: { full_name: 'Test traveler' } } }
      : { ok: false, response: Response.json({ error: 'Sign in' }, { status: 401 }) } },
    '@/lib/community/viewer': { communityViewer: async () => ({ ok: true, userId: other, hiddenUserIds: state.hidden }) },
    '@/lib/admin-auth': { requireAdmin: async () => state.admin ? null : Response.json({ error: 'No access' }, { status: 401 }) },
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => db },
    '@/lib/community/forum-sync': {
      createForumTopicSlug: (_title, id) => `topic-${id}`,
      forumCountrySlugFromCode: () => 'japonya', forumCategoryFromCommunityCategory: () => 'Ülke Bazlı Sorunlar',
      forumStatusFromModeration: action => action === 'visible' ? 'published' : 'pending',
    },
  };
  return { state, db, route: file => load(file, mocks) };
}
function addPhoto(f, status = 'published', photoOwner = owner) {
  f.state.rows.forum_topics.push({ id: topicId, author_id: owner, status });
  const storage_path = `${photoOwner}/${topicId}.jpg`;
  f.state.rows.forum_topic_photos.push({ topic_id: topicId, user_id: photoOwner, storage_path });
  f.state.objects.set(storage_path, sourcePhoto);
}
const createRoute = 'app/api/country-community/photo-posts/route.ts';
const textCreateRoute = 'app/api/country-community/questions/route.ts';
const photoRoute = 'app/api/country-community/questions/[id]/photo/route.ts';
const adminPhotoRoute = 'app/api/admin/forum/topics/[id]/photo/route.ts';
const request = body => new Request('https://example.test/api/country-community/questions', { method: 'POST', body: JSON.stringify(body) });
const content = { countryCode: 'JP', title: 'Tokyo walking route', body: 'A pleasant route with several stops.' };
const params = { params: Promise.resolve({ id: topicId }) };

test('real JPEG is re-encoded without EXIF or embedded camera metadata', async () => {
  assert.ok((await sharp(sourcePhoto).metadata()).exif);
  const clean = await photos.prepareCommunityPhoto(photoData);
  assert.ok(clean);
  const metadata = await sharp(clean).metadata();
  assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined);
  assert.equal(clean.includes(Buffer.from('private-camera-metadata')), false);
});

test('external URLs, SVG, spoofed JPEG and oversized photos are rejected', async () => {
  for (const candidate of ['https://example.test/photo.jpg', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/jpeg;base64,/9j/2Q==', `data:image/jpeg;base64,${Buffer.alloc(300001).toString('base64')}`, {}, null]) {
    assert.equal(await photos.prepareCommunityPhoto(candidate), null);
  }
});

test('exactly 300,000 decoded JPEG bytes are allowed, excluding the data URL prefix', async () => {
  // Valid JPEG comment segments pad the fixture without changing its pixels.
  const comments = [];
  let remaining = photos.MAX_COMMUNITY_PHOTO_BYTES - sourcePhoto.length;
  while (remaining) {
    let length = Math.min(60000, remaining);
    if (remaining > length && remaining - length < 4) length -= 4;
    const comment = Buffer.alloc(length);
    comment[0] = 255; comment[1] = 254; comment.writeUInt16BE(length - 2, 2);
    comments.push(comment); remaining -= length;
  }
  const exact = Buffer.concat([sourcePhoto.subarray(0, 2), ...comments, sourcePhoto.subarray(2)]);
  assert.equal(exact.length, 300000);
  const dataUrl = `data:image/jpeg;base64,${exact.toString('base64')}`;
  assert.equal(photos.decodeCommunityPhoto(dataUrl).length, 300000);
  assert.ok(await photos.prepareCommunityPhoto(dataUrl));
  const oversized = Buffer.concat([exact.subarray(0, -2), Buffer.from([0]), exact.subarray(-2)]);
  assert.equal(photos.decodeCommunityPhoto(`data:image/jpeg;base64,${oversized.toString('base64')}`), null);
});

test('valid detailed client JPEG remains accepted when initial server encoding grows over the limit', async () => {
  const noise = Buffer.alloc(810 * 810 * 3);
  let seed = 104729;
  for (let i = 0; i < noise.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; noise[i] = seed >>> 24; }
  const detailed = await sharp(noise, { raw: { width: 810, height: 810, channels: 3 } }).jpeg({ quality: 60 }).toBuffer();
  assert.ok(detailed.length <= 300000, `client fixture ${detailed.length}`);
  const initial = await sharp(detailed).jpeg({ quality: 76, progressive: true }).toBuffer();
  assert.ok(initial.length > 300000, `regression fixture must grow: ${initial.length}`);
  const prepared = await photos.prepareCommunityPhoto(`data:image/jpeg;base64,${detailed.toString('base64')}`);
  assert.ok(prepared); assert.ok(prepared.length <= 300000);
  const metadata = await sharp(prepared).metadata();
  assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined);
});

test('serializer returns only canonical real-photo path and null for text-only posts', () => {
  assert.equal(serializers.serializeQuestionSummary({ id: topicId, photoUrl: 'https://evil.test/tracker' }, 'Traveler', 0).photoUrl, null);
  assert.equal(serializers.serializeQuestionSummary({ id: topicId, hasPhoto: true }, 'Traveler', 0).photoUrl, `/api/country-community/questions/${topicId}/photo`);
  assert.equal(serializers.serializeQuestionSummary({ id: '../secret', hasPhoto: true }, 'Traveler', 0).photoUrl, null);
});

test('text-only create stays published, requires authentication and never touches photo storage', async () => {
  const f = fixture(); const post = f.route(textCreateRoute).POST;
  assert.equal((await post(request(content))).status, 200);
  assert.equal(f.state.rows.forum_topics[0].status, 'published'); assert.equal(f.state.objects.size, 0);
  f.state.authenticated = false;
  assert.equal((await post(request(content))).status, 401); assert.equal(f.state.rows.forum_topics.length, 1);
});

test('photo create uses authenticated owner and queues the complete post for review', async () => {
  const f = fixture();
  const response = await f.route(createRoute).POST(request({ ...content, photo: photoData, userId: other, photoUrl: 'https://evil.test/tracker' }));
  assert.equal(response.status, 200); assert.equal((await response.json()).moderation.action, 'pending_review');
  const topic = f.state.rows.forum_topics[0], photo = f.state.rows.forum_topic_photos[0];
  assert.equal(topic.status, 'pending'); assert.equal(topic.author_id, owner);
  assert.equal(photo.user_id, owner); assert.equal(photo.storage_path, `${owner}/${topic.id}.jpg`);
  assert.equal(f.state.objects.size, 1);
});

test('photo upload rejects a public/missing bucket and invalid bytes without creating a topic', async () => {
  for (const options of [{ publicBucket: true }, { noBucket: true }]) {
    const f = fixture(options);
    assert.equal((await f.route(createRoute).POST(request({ ...content, photo: photoData }))).status, 503);
    assert.equal(f.state.rows.forum_topics.length, 0); assert.equal(f.state.objects.size, 0);
  }
  const f = fixture();
  assert.equal((await f.route(createRoute).POST(request({ ...content, photo: 'https://evil.test/file' }))).status, 400);
  assert.equal(f.state.rows.forum_topics.length, 0);
});

test('request byte limit applies when Content-Length is absent', async () => {
  const f = fixture();
  const response = await f.route(createRoute).POST(request({ ...content, photo: 'x'.repeat(430001) }));
  assert.equal(response.status, 413); assert.equal(f.state.objects.size, 0); assert.equal(f.state.rows.forum_topics.length, 0);
});

test('metadata failure rolls back pending topic and private uploaded object', async () => {
  const f = fixture({ failures: { 'forum_topic_photos:insert': { code: 'PGRST205' } } });
  const response = await f.route(createRoute).POST(request({ ...content, photo: photoData }));
  assert.equal(response.status, 503); assert.equal(f.state.rows.forum_topics.length, 0); assert.equal(f.state.objects.size, 0);
});

test('pending/hidden/deleted posts and blocked or mismatched owners never download photos', async () => {
  for (const status of ['pending', 'hidden', 'rejected']) {
    const f = fixture(); addPhoto(f, status);
    assert.equal((await f.route(photoRoute).GET(new Request('https://example.test/photo'), params)).status, 404);
    assert.equal(f.state.events.includes('download'), false);
  }
  for (const options of [{ hidden: [owner] }, {}]) {
    const f = fixture(options); addPhoto(f, 'published', options.hidden ? owner : other);
    assert.equal((await f.route(photoRoute).GET(new Request('https://example.test/photo'), params)).status, 404);
    assert.equal(f.state.events.includes('download'), false);
  }
  const f = fixture(); addPhoto(f); f.state.rows.forum_topics = [];
  assert.equal((await f.route(photoRoute).GET(new Request('https://example.test/photo'), params)).status, 404);
});

test('published photo is served privately, and new blocks/hiding revoke the same URL', async () => {
  const f = fixture(); addPhoto(f); const get = f.route(photoRoute).GET;
  const response = await get(new Request('https://example.test/photo'), params);
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store'); assert.equal(response.headers.get('Vary'), 'Authorization');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), sourcePhoto);
  f.state.hidden = [owner]; assert.equal((await get(new Request('https://example.test/photo'), params)).status, 404);
  f.state.hidden = []; f.state.rows.forum_topics[0].status = 'hidden';
  assert.equal((await get(new Request('https://example.test/photo'), params)).status, 404);
});

test('only current admin roles can preview pending photo', async () => {
  const f = fixture(); addPhoto(f, 'pending'); const get = f.route(adminPhotoRoute).GET;
  assert.equal((await get(new Request('https://example.test/photo'), params)).status, 200);
  f.state.admin = false;
  assert.equal((await get(new Request('https://example.test/photo'), params)).status, 401);
});

test('feed metadata lookup hides mismatched owners and supports migration-free text feeds', async () => {
  const f = fixture(); addPhoto(f, 'published', other);
  assert.equal((await photos.communityPhotoTopics(f.db, f.state.rows.forum_topics)).size, 0);
  f.state.failures['forum_topic_photos:select'] = { code: 'PGRST205' };
  assert.equal((await photos.communityPhotoTopics(f.db, f.state.rows.forum_topics)).size, 0);
  f.state.failures['forum_topic_photos:select'] = { code: '42501' };
  await assert.rejects(photos.communityPhotoTopics(f.db, f.state.rows.forum_topics));
});

test('account cleanup removes linked and orphaned owned photos, preserves other owners and fails closed', async () => {
  const f = fixture(); addPhoto(f);
  const orphanId = '20000000-0000-4000-8000-000000000002';
  f.state.objects.set(`${owner}/${orphanId}.jpg`, sourcePhoto);
  f.state.objects.set(`${other}/${topicId}.jpg`, sourcePhoto);
  await photos.removeCommunityAccountPhotos(f.db, owner);
  assert.equal(f.state.objects.size, 1); assert.ok(f.state.objects.has(`${other}/${topicId}.jpg`));
  assert.equal(f.state.rows.forum_topic_photos.length, 0);
  const blocked = fixture({ failures: { remove: { code: 'unavailable' } } }); addPhoto(blocked);
  await assert.rejects(photos.removeCommunityAccountPhotos(blocked.db, owner));
  assert.equal(blocked.state.rows.forum_topic_photos.length, 1);
});

test('account cleanup supports text-only rollout before photo migration but fails on missing linked storage', async () => {
  const oldSchema = fixture({ failures: { 'forum_topic_photos:select': { code: 'PGRST205' } }, noBucket: true });
  await photos.removeCommunityAccountPhotos(oldSchema.db, owner);
  const lostBucket = fixture({ noBucket: true }); addPhoto(lostBucket);
  await assert.rejects(photos.removeCommunityAccountPhotos(lostBucket.db, owner));
  for (const bucketError of [{ status: 400, statusCode: '404' }, { status: 400, statusCode: 'NoSuchBucket' }]) {
    await photos.removeCommunityAccountPhotos(fixture({ noBucket: true, bucketError }).db, owner);
  }
  await assert.rejects(photos.removeCommunityAccountPhotos(fixture({ noBucket: true, bucketError: { status: 400, statusCode: 'InvalidRequest' } }).db, owner));
});

test('topic cleanup deletes only its private photo and preserves metadata until topic deletion succeeds', async () => {
  const f = fixture(); addPhoto(f);
  f.state.objects.set(`${other}/${topicId}.jpg`, sourcePhoto);
  await photos.removeCommunityTopicPhotos(f.db, [topicId]);
  assert.equal(f.state.objects.size, 1); assert.ok(f.state.objects.has(`${other}/${topicId}.jpg`));
  assert.equal(f.state.rows.forum_topic_photos.length, 1);
});
