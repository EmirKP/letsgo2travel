import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(path, 'utf8');
const uid = 'f09a2026-0930-4000-8000-000000000099';
const other = 'f09a2026-0930-4000-8000-000000000098';
const migration = read('supabase/migrations/20261010130000_community_starter_replies.sql');
const seed = read('supabase/seeds/community-starter-replies-20261010.sql');
const followUp = read('supabase/seeds/community-starter-replies-variation-20261010.sql');
const targetCounts = [7, 3, 12, 5, 16, 8, 4, 11, 6, 15, 2, 9, 14, 10, 13];

async function setup(db) {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'')$$;
      create table auth.users(id uuid primary key); insert into auth.users values ('${uid}'), ('${other}');
      create table forum_topics(id uuid primary key, slug text unique not null, title text, content text, author_id uuid not null references auth.users(id), author_name text, country_slug text, category text, status text, is_paywalled boolean, created_at timestamptz default now());
      create table forum_replies(id uuid primary key default gen_random_uuid(), topic_id uuid references forum_topics(id), user_id uuid references auth.users(id), author_name text, content text, status text, created_at timestamptz default now());
      create table blocks(viewer uuid, author uuid);
      create function community_users_blocked(viewer uuid, author uuid) returns boolean language sql as $$select exists(select 1 from public.blocks b where b.viewer=$1 and b.author=$2)$$;
      grant usage on schema public,auth to authenticated, service_role;
      grant all on forum_topics,forum_replies to authenticated,service_role;`);
    await db.exec(read('supabase/migrations/20260930121000_community_starter_topics.sql'));
    await db.exec(read('supabase/seeds/community-starters-20260930.sql'));
    await db.exec(migration);
    // Execute the production counting function, not a simulated UI number.
    const safety = read('supabase/migrations/20260910160000_community_safety.sql');
    await db.exec(safety.slice(safety.indexOf('create or replace function public.get_forum_visible_reply_counts'), safety.indexOf('-- Authenticated web RPC')));
}

test('Starter replies persist with varied canonical counts, recurring personas and no synthetic accounts', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(seed);
    let rows = (await db.query('select * from forum_replies order by seed_key')).rows;
    const topic = rows[0].topic_id;
    assert.equal(rows.length, 135);
    assert.equal(new Set(rows.map(row => row.author_name)).size, 30);
    assert.equal(new Set(rows.map(row => row.content)).size, 135);
    assert.ok(rows.every(row => row.user_id === null && !row.author_name.includes('Örnek profil') && row.status === 'published'));
    assert.equal((await db.query('select count(*) as count from auth.users')).rows[0].count, 2, 'No synthetic users');
    let counts = (await db.query('select * from get_forum_visible_reply_counts(array(select id from forum_topics),$1)', [uid])).rows;
    assert.equal(counts.length, 15);
    assert.deepEqual(counts.map(row => Number(row.reply_count)).sort((a, b) => a - b), Array.from({ length: 15 }, (_, index) => index + 2));
    const persistedCounts = (await db.query('select t.seed_key, count(r.id)::int as replies from forum_topics t join forum_replies r on r.topic_id=t.id group by t.seed_key order by t.seed_key')).rows;
    assert.deepEqual(persistedCounts.map(row => row.replies), targetCounts);
    await db.query("update forum_replies set status='hidden' where id=$1", [rows[0].id]);
    await db.query("insert into forum_replies(topic_id,user_id,author_name,content,status) values ($1,$2,'Real user','My genuine reply','published'),($1,$3,'Blocked user','Blocked reply','published'),($1,$2,'Real user','Awaiting review','pending')", [topic, uid, other]);
    await db.query('insert into blocks values ($1,$2)', [uid, other]);
    await db.exec(seed); await db.exec(followUp); await db.exec(migration);
    rows = (await db.query('select * from forum_replies order by seed_key')).rows;
    assert.equal(rows.length, 138, 'Re-running never creates duplicate comments or removes genuine ones');
    assert.equal(rows.filter(row => row.seed_key && row.status === 'hidden').length, 1, 'Moderation remains respected');
    counts = (await db.query('select * from get_forum_visible_reply_counts($1::uuid[],$2)', [[topic], uid])).rows;
    assert.equal(Number(counts[0].reply_count), targetCounts[0], 'Only six visible starter replies and one unblocked genuine reply count');
    const names = (await db.query('select author_name from forum_topics')).rows;
    assert.ok(names.every(row => !row.author_name.includes('Örnek profil')));
    await db.exec("set role authenticated; set request.jwt.claim.role='authenticated';");
    await assert.rejects(db.query("update forum_replies set content='forged' where seed_key is not null"), /Starter content is managed/);
    await assert.rejects(db.query("insert into forum_replies(topic_id,user_id,seed_key) values ($1,$2,'starter-reply-20261010-16-01')", [topic, uid]), /Starter content is managed/);
    await assert.rejects(db.query('insert into forum_replies(topic_id,user_id) values ($1,null)', [topic]), /Authorless content is managed/);
    await db.query("insert into forum_replies(topic_id,user_id,author_name,content,status) values ($1,$2,'Real user','Another real answer','pending')", [topic, uid]);
    await db.exec("reset role; set role service_role; set request.jwt.claim.role='service_role';");
    await db.query("update forum_replies set user_id=null,author_name='Silinmiş kullanıcı',content='Anonimleştirildi' where user_id=$1", [uid]);
    assert.equal((await db.query('select count(*) as count from forum_replies where seed_key is not null')).rows[0].count, 135, 'Legitimate account anonymization leaves editorial replies intact');
  } finally { await db.close(); }
});

test('Live follow-up adds only missing replies and preserves genuine and moderated content', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    // Reproduce the original 30-row release and its old display-name suffixes.
    await db.exec(seed.replace("on conflict (seed_key)", "where v.reply_number <= 2\non conflict (seed_key)"));
    await db.exec("update forum_topics set author_name=author_name || ' · Örnek profil'; update forum_replies set author_name=author_name || ' · Örnek profil';");
    assert.equal((await db.query('select count(*) as count from forum_replies')).rows[0].count, 30);
    const existing = (await db.query('select * from forum_replies order by seed_key')).rows;
    await db.query("update forum_replies set status='hidden', content='Moderator revision' where id=$1", [existing[0].id]);
    await db.query("insert into forum_replies(topic_id,user_id,author_name,content,status) values ($1,$2,'Real user · Örnek profil','Keep my genuine reply','published')", [existing[0].topic_id, uid]);
    await db.exec(followUp);
    let rows = (await db.query('select * from forum_replies order by seed_key')).rows;
    assert.equal(rows.length, 136);
    for (const original of existing) {
      const row = rows.find(item => item.id === original.id);
      assert.equal(String(row.created_at), String(original.created_at), 'Published dates never change');
      assert.equal(row.topic_id, original.topic_id);
      if (row.id !== existing[0].id) { assert.equal(row.content, original.content); assert.equal(row.author_name, original.author_name.replace(/ · Örnek profil$/, '')); }
    }
    const hidden = rows.find(row => row.id === existing[0].id);
    assert.equal(hidden.status, 'hidden'); assert.equal(hidden.content, 'Moderator revision');
    assert.equal(hidden.author_name, existing[0].author_name, 'Moderated records are untouched, including display names');
    const genuine = rows.find(row => row.user_id === uid);
    assert.equal(genuine.author_name, 'Real user · Örnek profil'); assert.equal(genuine.content, 'Keep my genuine reply');
    const snapshot = JSON.stringify(rows);
    await db.exec(followUp); await db.exec(seed);
    rows = (await db.query('select * from forum_replies order by seed_key')).rows;
    assert.equal(JSON.stringify(rows), snapshot, 'Both rollout paths are idempotent and preserve moderation');
    assert.equal((await db.query('select count(*) as count from auth.users')).rows[0].count, 2);
  } finally { await db.close(); }
});

test('Additional replies never populate hidden, paywalled or non-starter discussions', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(seed.replace("on conflict (seed_key)", "where v.reply_number <= 2\non conflict (seed_key)"));
    await db.exec("update forum_topics set status='hidden',author_name='Moderated topic · Örnek profil' where seed_key='starter-20260930-01'; update forum_topics set is_paywalled=true where seed_key='starter-20260930-02';");
    await db.query("insert into forum_topics(id,slug,title,author_id,author_name,status,is_paywalled,category) values (gen_random_uuid(),'ordinary','Genuine discussion',$1,'Real author · Örnek profil','published',false,'Ülke Bazlı Sorunlar')", [uid]);
    await db.query("insert into forum_replies(topic_id,user_id,author_name,content,status) select id,$1,'Real user','Genuine discussion reply','published' from forum_topics where slug='ordinary'", [uid]);
    await db.exec(followUp);
    const rows = (await db.query("select t.seed_key,t.author_name,count(r.id)::int as count from forum_topics t join forum_replies r on r.topic_id=t.id where t.seed_key in ('starter-20260930-01','starter-20260930-02') group by t.seed_key,t.author_name order by t.seed_key")).rows;
    assert.equal(rows[0].count, 2); assert.equal(rows[0].author_name, 'Moderated topic · Örnek profil'); assert.equal(rows[1].count, 2);
    const ordinary = (await db.query("select t.author_name,count(r.id)::int as count from forum_topics t join forum_replies r on r.topic_id=t.id where t.slug='ordinary' group by t.author_name")).rows[0];
    assert.equal(ordinary.count, 1); assert.equal(ordinary.author_name, 'Real author · Örnek profil');
  } finally { await db.close(); }
});

test('API serializes only trusted starter metadata without leaking internal keys', () => {
  const code = ts.transpileModule(read('lib/community/serializers.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const sourceModule = { exports: {} }; vm.runInNewContext(`(function(module,exports){${code}})`, {})(sourceModule,sourceModule.exports);
  const { serializeAnswer, serializeQuestionSummary } = sourceModule.exports;
  const example = serializeAnswer({ id: uid, authorId: null, seed_key: 'starter-reply-20261010-01-01', body: 'Example', email: 'private' }, 'Example persona');
  assert.equal(example.isStarter, true); assert.equal('seed_key' in example, false); assert.equal('email' in example, false);
  assert.equal(serializeAnswer({ authorId: uid, seed_key: 'starter-reply-20261010-01-01' }, 'Real user').isStarter, false);
  assert.equal(serializeAnswer({ authorId: null }, 'Deleted user').isStarter, false);
  assert.equal(serializeQuestionSummary({ authorId: null, seed_key: 'starter-20260930-01' }, 'Example persona', 2).isStarter, true);
});
