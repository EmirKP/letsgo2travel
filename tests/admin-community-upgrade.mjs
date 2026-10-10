import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = file => readFileSync(file, 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, imports) {
  const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { URL, URLSearchParams, Date, Object, Set, console: { error() {} } })
    (name => { assert.ok(name in imports, `Unstubbed ${name}`); return imports[name]; }, m, m.exports);
  return m.exports;
}
const iso = JSON.parse(read('lib/countries/iso3166.json'));
const countries = load('lib/leaderboard/countries.ts', { '../countries/isoSource': { ISO_COUNTRIES: iso } });
const starter = load('lib/community/starter-topic.ts', {});
const json = (body, init = {}) => ({ body: plain(body), status: init.status || 200, headers: new Headers(init.headers) });
const next = { NextResponse: { json } };
const uid = 'f09a2026-0930-4000-8000-000000000099';

test('League deduplicates all supported country encodings and rejects corrupt values', () => {
  assert.equal(countries.countExplorerCountries(['TR', 'TUR', '792', ' tur ', 'DE', 'DEU', '276', '000', '383', 'XKK', 'XKX']), 3);
  assert.equal(countries.countExplorerCountries('TUR'), 0);
  assert.equal(countries.countExplorerCountries([null, {}, 792, '', 'not-a-country']), 0);
});

test('Starter reply permission is narrowly limited to service-owned published discussions', () => {
  const valid = { seed_key: 'starter-20260930-01', author_id: null, status: 'published', category: 'Ülke Bazlı Sorunlar', is_paywalled: false };
  assert.equal(starter.isOpenStarterDiscussion(valid), true);
  for (const patch of [{ seed_key: null }, { seed_key: 'anything' }, { author_id: uid }, { status: 'hidden' }, { status: 'pending' }, { is_paywalled: true }, { category: 'Vize & Konsolosluk' }]) {
    assert.equal(starter.isOpenStarterDiscussion({ ...valid, ...patch }), false);
  }
});

test('Database ranks beyond the old 500-profile cutoff, excludes blocks and counts distinct countries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table profiles(id uuid primary key, username text, visited_countries text[], opt_in_leaderboard boolean);
      create table leaderboard_blocks(user_id uuid);
      insert into profiles select gen_random_uuid(), 'empty' || n, '{}', true from generate_series(1, 501) n;
      insert into profiles values ('${uid}', 'best', '{TR,TUR,792,DE,276,000,383,XKX,invalid}', true);
      insert into profiles values ('f09a2026-0930-4000-8000-000000000098', 'private', '{TR,TUR,792,DE}', false);
      insert into profiles values ('f09a2026-0930-4000-8000-000000000097', 'blocked', '{TR,DE,FR,GB,JP}', true);
      insert into leaderboard_blocks values ('f09a2026-0930-4000-8000-000000000097');`);
    await db.exec(read('supabase/migrations/20260930120000_explorer_league_query.sql'));
    const result = await db.query('select * from get_explorer_league($1::jsonb,100)', [JSON.stringify(countries.explorerCountryAliases)]);
    assert.equal(result.rows.length, 100);
    assert.deepEqual(result.rows[0], { username: 'best', visited_count: 3, points: 30, level: 'Yeni Kaşif' });
    assert.ok(!result.rows.some(row => ['private', 'blocked'].includes(row.username)));
    const access = await db.query("select has_function_privilege('anon','get_explorer_league(jsonb,integer)','execute') as public_access");
    assert.equal(access.rows[0].public_access, false);
  } finally { await db.close(); }
});

test('Starter seed is idempotent, preserves real replies and clients cannot impersonate seed authors', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'')$$;
      create table auth.users(id uuid primary key); insert into auth.users values ('${uid}');
      create table forum_topics(id uuid primary key, slug text unique not null, title text, content text, author_id uuid not null references auth.users(id), author_name text, country_slug text, category text, status text, is_paywalled boolean, created_at timestamptz default now());
      create table forum_replies(id uuid primary key default gen_random_uuid(), topic_id uuid references forum_topics(id), user_id uuid references auth.users(id), content text);
      grant usage on schema public,auth to authenticated; grant all on forum_topics to authenticated;`);
    const migration = read('supabase/migrations/20260930121000_community_starter_topics.sql');
    const seed = read('supabase/seeds/community-starters-20260930.sql');
    await db.exec(migration); await db.exec(seed);
    let rows = (await db.query('select * from forum_topics order by seed_key')).rows;
    assert.equal(rows.length, 15); assert.equal(new Set(rows.map(row => row.author_name)).size, 15);
    assert.ok(rows.every(row => row.author_id === null && row.status === 'published' && !row.is_paywalled));
    assert.ok(rows.some(row => row.country_slug === 'turkiye'));
    await db.query('insert into forum_replies(topic_id,user_id,content) values ($1,$2,$3)', [rows[0].id, uid, 'Genuine user reply']);
    await db.query("update forum_topics set status='hidden' where id=$1", [rows[1].id]);
    await db.exec(seed);
    rows = (await db.query('select * from forum_topics order by seed_key')).rows;
    assert.equal(rows.length, 15); assert.equal(rows[1].status, 'hidden');
    assert.equal((await db.query('select content from forum_replies')).rows[0].content, 'Genuine user reply');
    await db.exec("set role authenticated; set request.jwt.claim.role='authenticated';");
    await assert.rejects(() => db.query("update forum_topics set title='forged' where seed_key='starter-20260930-01'"), /Starter content is managed/);
    await assert.rejects(() => db.query("insert into forum_topics(id,slug,title,author_id,seed_key) values (gen_random_uuid(),'forged','fake',null,'starter-20260930-16')"), /Starter content is managed/);
  } finally { await db.close(); }
});

test('Real account cleanup anonymizes ordinary authors and starter replies without enabling forged identities', async () => {
  const db = new PGlite();
  const other = 'f09a2026-0930-4000-8000-000000000098';
  try {
    await db.exec(`create role authenticated; create role service_role;
      create schema auth; create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'')$$;
      create table auth.users(id uuid primary key); insert into auth.users values ('${uid}'), ('${other}');
      create table forum_topics(id uuid primary key default gen_random_uuid(), slug text unique not null, title text, content text, author_id uuid not null references auth.users(id), author_name text, country_slug text, category text, status text, is_paywalled boolean, created_at timestamptz default now());
      create table forum_replies(id uuid primary key default gen_random_uuid(), topic_id uuid references forum_topics(id), user_id uuid references auth.users(id), author_name text, content text);
      insert into forum_topics(slug,title,content,author_id,author_name) values ('ordinary','Personal title','Personal body','${uid}','Original user'), ('other-user','Other title','Other body','${other}','Other user');
      grant usage on schema public,auth to authenticated,service_role; grant all on forum_topics,forum_replies to authenticated,service_role;`);
    const migration = read('supabase/migrations/20260930121000_community_starter_topics.sql');
    await db.exec(migration);
    await db.exec(read('supabase/seeds/community-starters-20260930.sql'));
    const starterBefore = (await db.query("select * from forum_topics where seed_key='starter-20260930-01'")).rows[0];
    await db.query('insert into forum_replies(topic_id,user_id,author_name,content) values ($1,$2,$3,$4)', [starterBefore.id, uid, 'Original user', 'Personal reply to starter']);
    await db.exec("set role authenticated; set request.jwt.claim.role='authenticated';");
    await assert.rejects(() => db.query("insert into forum_topics(slug,title,author_id,author_name) values ('client-null','Anonymous',null,'Silinmiş kullanıcı')"), /Authorless content is managed/);
    await assert.rejects(() => db.query("update forum_topics set author_id=null,author_name='Silinmiş kullanıcı',title='Anonimleştirilmiş konu',content='Bu içerik hesap silme talebi üzerine anonimleştirildi.' where slug='ordinary'"), /Authorless content is managed/);
    await assert.rejects(() => db.query("update forum_topics set seed_key='starter-20260930-99' where slug='ordinary'"), /Starter content is managed/);
    await db.exec("reset role; set role service_role; set request.jwt.claim.role='service_role';");
    const sqlUpdates = [];
    // Execute actual cleanup update objects against PostgreSQL constraints and
    // triggers. Unrelated stores contain no fixtures in this focused test.
    const supabase = { from(table) {
      let values, filter;
      const query = {
        select() { return query; }, not() { return query; }, delete() { return query; },
        update(next) { values = next; return query; }, eq(key, value) { filter = [key, value]; return query; },
        then(resolve, reject) {
          const run = async () => {
            if (!values || !['forum_topics', 'forum_replies'].includes(table)) return { data: [], error: null };
            const entries = Object.entries(values);
            const sql = `update ${table} set ${entries.map(([key], index) => `${key}=$${index + 1}`).join(',')} where ${filter[0]}=$${entries.length + 1}`;
            try { await db.query(sql, [...entries.map(([,value]) => value), filter[1]]); sqlUpdates.push(table); return { data: [], error: null }; }
            catch (error) { return { data: null, error }; }
          };
          return run().then(resolve, reject);
        },
      };
      return query;
    } };
    const photoCleanup = [];
    const { cleanAccountData } = load('lib/account-deletion-cleanup.ts', {
      './profile-photo': { ownedAvatarPath: () => false },
      './community/photos': { removeCommunityAccountPhotos: async (client, ownerId) => {
        assert.equal(client, supabase); assert.equal(ownerId, uid); photoCleanup.push('forum');
      } },
      './community/social': { removeSocialAccountPhotos: async (client, ownerId) => {
        assert.equal(client, supabase); assert.equal(ownerId, uid);
        assert.deepEqual(sqlUpdates, [], 'Private media is removed before author data is anonymized');
        photoCleanup.push('social');
      } },
    });
    await cleanAccountData(supabase, { id: uid, user_metadata: {} });
    assert.deepEqual(photoCleanup, ['forum', 'social']);
    assert.deepEqual(sqlUpdates, ['forum_topics', 'forum_replies']);
    const ordinary = (await db.query("select * from forum_topics where slug='ordinary'")).rows[0];
    assert.equal(ordinary.author_id, null); assert.equal(ordinary.seed_key, null);
    assert.equal(ordinary.author_name, 'Silinmiş kullanıcı'); assert.equal(ordinary.title, 'Anonimleştirilmiş konu');
    assert.equal(ordinary.content, 'Bu içerik hesap silme talebi üzerine anonimleştirildi.');
    assert.deepEqual((await db.query('select * from forum_topics where id=$1', [starterBefore.id])).rows[0], starterBefore, 'Starter persona and content are untouched by user deletion');
    const reply = (await db.query('select * from forum_replies')).rows[0];
    assert.equal(reply.user_id, null); assert.equal(reply.author_name, 'Silinmiş kullanıcı');
    assert.equal(reply.content, ordinary.content); assert.equal(reply.topic_id, starterBefore.id);
    assert.equal((await db.query("select author_id from forum_topics where slug='other-user'")).rows[0].author_id, other);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1', [uid]);
    await db.exec(migration); // Reapplying must preserve the new anonymous row.
    await db.exec("set role authenticated; set request.jwt.claim.role='authenticated';");
    await assert.rejects(() => db.query("update forum_topics set author_name='Fake persona' where slug='ordinary'"), /Authorless content is managed/);
  } finally { await db.close(); }
});

function dbMock(resolve) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const chain = { insert(value) { call.insert = value; return chain; }, select(value) { call.select = value; return chain; }, eq(key,value) { call.filters.push([key,value]); return chain; }, in() { return chain; }, order() { return chain; }, limit() { return chain; }, or(value) { call.search = value; return chain; }, range(a,b) { call.range = [a,b]; return chain; }, maybeSingle() { return Promise.resolve(resolve(call)); }, then(yes,no) { return Promise.resolve(resolve(call)).then(yes,no); } };
    return chain;
  } };
}

test('Admin partial failures remain unknown; legacy review status is read without enabling review', async () => {
  const db = dbMock(call => {
    if (call.table === 'profiles' && call.select === 'role') return { data: { role: 'super_admin' }, error: null };
    if (call.table === 'travel_verifications') {
      if (call.filters.some(([key]) => key === 'status')) return { data: null, count: null, error: { code: '42703', message: 'column status does not exist' } };
      return { data: [{ id: uid, country_code: 'TR', verification_status: 'pending', created_at: '2026-09-30' }], count: 1, error: null };
    }
    if (call.table === 'forum_reports') return { data: null, count: null, error: { code: '42501' } };
    return { data: [], count: 0, error: null };
  });
  const helper = load('lib/admin-verifications.ts', {});
  const route = load('app/api/admin/mobile-overview/route.ts', { 'next/server': next, '@/lib/authenticated-user': { requireAuthenticatedUser: async () => ({ ok: true, supabase: db, user: { id: uid } }) }, '@/lib/admin-verifications': helper });
  const response = await route.GET(new Request('https://test/api/admin/mobile-overview'));
  assert.equal(response.body.data.stats.openReports, null);
  assert.equal(response.body.data.moduleHealth.reports, 'unavailable');
  assert.equal(response.body.data.stats.pendingVerifications, 1);
  assert.equal(response.body.data.verificationReviewReady, false);
  assert.equal(response.body.data.pendingVerifications[0].hasEvidence, false);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('Admin record drilldowns enforce super-admin, bounded pagination and field allowlists', async () => {
  let role = 'user';
  const db = dbMock(call => call.select === 'role' ? { data: { role }, error: null } : { data: [{ id: uid, username: 'user', email: 'never-public@test', role: 'user', password: 'SECRET', evidence_path: 'PRIVATE', created_at: '2026-09-30' }], count: 81, error: null });
  const route = load('app/api/admin/mobile-records/route.ts', { 'next/server': next, '@/lib/authenticated-user': { requireAuthenticatedUser: async () => ({ ok: true, supabase: db, user: { id: uid } }) } });
  assert.equal((await route.GET(new Request('https://test?collection=users'))).status, 403);
  role = 'super_admin';
  const response = await route.GET(new Request('https://test?collection=users&page=2&search=foo%22%2Crole.eq.admin'));
  assert.equal(response.status, 200); assert.equal(response.body.count, 81);
  assert.deepEqual(db.calls.at(-1).range, [25,49]);
  assert.ok(!db.calls.at(-1).search.includes('role.eq.admin'));
  assert.deepEqual(Object.keys(response.body.data[0].fields), ['username','role','created_at']);
  assert.equal((await route.GET(new Request('https://test?collection=secrets'))).status, 400);
  assert.equal((await route.GET(new Request('https://test?collection=users&status=published'))).status, 400);
  assert.equal((await route.GET(new Request('https://test?collection=visa&status=paused'))).status, 200);
  assert.equal((await route.GET(new Request('https://test?collection=visa&status=cancelled'))).status, 400);
  assert.equal(response.headers.get('Vary'), 'Authorization');
});

test('Admin records deny missing sessions, non-super-admin roles and failed role lookups before reading records', async () => {
  let signedIn = false, role = 'super_admin', roleError = null;
  const db = dbMock(() => ({ data: { role }, error: roleError }));
  const route = load('app/api/admin/mobile-records/route.ts', {
    'next/server': next,
    '@/lib/authenticated-user': { requireAuthenticatedUser: async () => signedIn
      ? ({ ok: true, supabase: db, user: { id: uid } })
      : ({ ok: false, response: json({ error: 'Sign in' }, { status: 401 }) }) },
  });
  const request = () => new Request('https://test?collection=users');
  const denied = await route.GET(request());
  assert.equal(denied.status, 401); assert.equal(db.calls.length, 0);
  assert.equal(denied.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(denied.headers.get('Vary'), 'Authorization');
  signedIn = true;
  for (role of ['user', 'moderator', 'admin', null]) assert.equal((await route.GET(request())).status, 403);
  role = 'super_admin'; roleError = { code: '42501' };
  assert.equal((await route.GET(request())).status, 503);
  assert.ok(db.calls.every(call => call.table === 'profiles' && call.select === 'role' && call.filters.some(([key,value]) => key === 'id' && value === uid)));
});

test('Admin username search tolerates only the optional legacy name column and fails closed on read errors', async () => {
  let missingName = true, unavailable = false;
  const db = dbMock(call => {
    if (call.select === 'role') return { data: { role: 'super_admin' }, error: null };
    if (unavailable) return { data: null, count: null, error: { code: '42501', message: 'Permission denied' } };
    if (missingName && call.search.includes('full_name')) return { data: null, error: { code: '42703', message: 'column profiles.full_name does not exist' } };
    return { data: [{ id: uid, username: 'traveller', evidence_path: 'private' }], count: 1, error: null };
  });
  const route = load('app/api/admin/mobile-records/route.ts', { 'next/server': next, '@/lib/authenticated-user': { requireAuthenticatedUser: async () => ({ ok: true, supabase: db, user: { id: uid } }) } });
  const request = () => new Request('https://test?collection=users&search=traveller');
  const response = await route.GET(request());
  assert.equal(response.status, 200); assert.equal(response.body.data[0].fields.username, 'traveller');
  assert.equal(db.calls.at(-1).search, 'username.ilike.%traveller%');
  unavailable = true; missingName = false;
  const failed = await route.GET(request());
  assert.equal(failed.status, 503); assert.equal(failed.body.data, undefined);
});

test('League failure is a retryable error, never an invented empty ranking', async () => {
  const route = load('app/api/kasifler-ligi/route.ts', { 'next/server': next, '@/lib/supabaseAdmin': { getSupabaseAdmin: () => ({ rpc: async () => ({ data: null, error: { code: '42883' } }) }) }, '@/lib/leaderboard/countries': countries });
  const response = await route.GET(); assert.equal(response.status, 503); assert.equal(response.body.data, undefined);
});

test('Real answer route accepts seed discussion replies, preserves moderation and normal country permissions', async () => {
  let topic = { id: uid, seed_key: 'starter-20260930-01', author_id: null, status: 'published', country_slug: 'turkiye', category: 'Ülke Bazlı Sorunlar', is_paywalled: false };
  let action = 'visible', permitted = true, signedIn = true, permissionChecks = 0;
  const db = dbMock(call => call.table === 'forum_topics' ? { data: topic, error: null } : { data: [{ id: 'reply-id' }], error: null });
  const route = load('app/api/country-community/answers/route.ts', {
    'next/server': next,
    '@/lib/community/safety': { canCommunityUsersInteract: async () => permitted },
    '@/lib/community/moderation': { moderateUserText: () => ({ action }) },
    '@/lib/community/permissions': { getCountryPermission: async () => { permissionChecks++; return { canAnswer: false }; } },
    '@/lib/community/forum-sync': { countryCodeFromForumSlug: () => 'TR', forumStatusFromModeration: value => value === 'visible' ? 'published' : 'pending', GENERAL_FORUM_COUNTRY_CODE: 'ZZ' },
    '@/lib/authenticated-user': { requireAuthenticatedUser: async () => signedIn ? ({ ok: true, supabase: db, user: { id: uid, user_metadata: { full_name: 'Real traveller' } } }) : ({ ok: false, response: json({ error: 'Sign in' }, { status: 401 }) }) },
    '@/lib/community/starter-topic': starter,
  });
  const request = () => new Request('https://test/api/country-community/answers', { method: 'POST', body: JSON.stringify({ countryCode: 'TR', questionId: uid, body: 'Gerçek bir cevap yazıyorum.' }) });
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(permissionChecks, 0);
  assert.equal(db.calls.find(call => call.table === 'forum_replies').insert.author_name, 'Real traveller');
  action = 'pending_review';
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(db.calls.filter(call => call.table === 'forum_replies').at(-1).insert.status, 'pending');
  permitted = false; assert.equal((await route.POST(request())).status, 403); permitted = true;
  topic = { ...topic, seed_key: null, author_id: 'f09a2026-0930-4000-8000-000000000002' };
  assert.equal((await route.POST(request())).status, 403); assert.equal(permissionChecks, 1);
  signedIn = false; assert.equal((await route.POST(request())).status, 401);
});
