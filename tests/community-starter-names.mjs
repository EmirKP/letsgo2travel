import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(path, 'utf8');
const sql = read('supabase/seeds/community-starter-names-20261010.sql');
const realUser = '55555555-5555-4555-8555-555555555555';
const topicId = n => `f09a2026-0930-4000-8000-${String(n).padStart(12, '0')}`;
const replyId = (topic, reply) => `f09a2026-1010-4000-8000-${String(topic).padStart(10, '0')}${String(reply).padStart(2, '0')}`;
const expectedNames = new Map([
  ['yoldaki.deniz', 'deniz.yilmaz'], ['seda.rota', 'seda_kaya'],
  ['mert.yoldefteri', 'mertcelik'], ['gezgin.ada', 'ada.eren'],
  ['elif.izler', 'elif.koc'], ['cem.pusula', 'cem_arslan'],
  ['melis.biryerlerde', 'melis.acar'], ['arda.kucukmolalar', 'ardatas'],
  ['ece.kesifnotu', 'ece.ozkan'], ['berk.yolarkadasi', 'berk_sahin'],
  ['duru.rotam', 'duru.kurt'], ['can.dunyayadogru', 'canertan'],
  ['aylin.sehirarasi', 'aylin.sari'], ['umut.gunbatimi', 'umut_akin'],
  ['selin.yolcizgisi', 'selin.kaplan'], ['ada.patikalar', 'ada.ozdemir'],
  ['alp.minikmola', 'alpkilic'], ['arda.yumusakrota', 'arda.sen'],
  ['asli.yolcuk', 'asli_kara'], ['ayca.kiyinotlari', 'ayca.soylu'],
  ['baran.adimadim', 'baran.yildiz'], ['beliz.parkdefteri', 'beliz_tek'],
  ['bora.fotodefter', 'borademir'], ['cem.kahvemolasi', 'cem.aydin'],
  ['derin.sehirsokak', 'derin_alkan'], ['dila.yolnotu', 'dila.aydin'],
  ['eda.yokusasagi', 'edayalcin'], ['emre.kucukdurak', 'emre.turan'],
  ['eren.yolgunlugu', 'eren_oz'], ['esin.kesisenrota', 'esin.ay'],
  ['ipek.pusulan', 'ipektunc'], ['kaan.kucukrota', 'kaan.erturk'],
  ['kerem.sahiladimi', 'kerem_ucar'], ['lale.muzemolasi', 'lale.gunes'],
  ['murat.yolpaylas', 'murataksoy'], ['nazli.kapipasaj', 'nazli.ozcan'],
  ['nil.rotanotlari', 'nil_aktas'], ['omer.ufuknotu', 'omer.yavuz'],
  ['onur.sokakizi', 'onur_bulut'], ['ozan.notdefteri', 'ozanergin'],
  ['selma.uzakyakin', 'selma.dogan'], ['sena.hafifcanta', 'sena_ozden'],
  ['tolga.rotaciz', 'tolga.sezer'], ['tuna.sehirritmi', 'tunacetin'],
  ['zeynep.sakinadim', 'zeynep.sonmez'],
]);
const replaceMentions = body => [...expectedNames].reduce((text, [oldName, newName]) =>
  text.replace(new RegExp(`(?<![\\p{L}\\p{N}_.@])@${oldName.replaceAll('.', '\\.')}(!?)(?![\\p{L}\\p{N}_.])`, 'gu'), `@${newName}$1`), body);

async function setup(db) {
  await db.exec(`create schema auth;
    create function auth.role() returns text language sql as $$select 'service_role'::text$$;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${realUser}');
    create table public.forum_topics (
      id uuid primary key, slug text unique not null, title text, content text,
      author_id uuid not null references auth.users(id), author_name text,
      country_slug text, category text, status text, is_paywalled boolean,
      created_at timestamptz default '2026-09-30T10:00:00Z'
    );
    create table public.forum_replies (
      id uuid primary key default gen_random_uuid(),
      topic_id uuid references public.forum_topics(id) on update cascade,
      user_id uuid references auth.users(id), author_name text, content text,
      status text, created_at timestamptz default '2026-10-10T10:00:00Z'
    );`);
  await db.exec(read('supabase/migrations/20260930121000_community_starter_topics.sql'));
  await db.exec(read('supabase/seeds/community-starters-20260930.sql'));
  await db.exec(read('supabase/migrations/20261010130000_community_starter_replies.sql'));
  await db.exec(read('supabase/seeds/community-starter-replies-20261010.sql'));
}

async function snapshot(db) {
  return {
    topics: (await db.query('select * from public.forum_topics order by id')).rows,
    replies: (await db.query('select * from public.forum_replies order by id')).rows,
    users: (await db.query('select * from auth.users order by id')).rows,
  };
}

test('All 15 topic and 135 reply names change consistently; dates, counts and prose survive', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    const before = await snapshot(db);
    assert.equal(before.topics.length, 15);
    assert.equal(before.replies.length, 135);
    assert.equal(new Set(before.replies.map(row => row.author_name)).size, 30);
    await db.exec(sql);
    const after = await snapshot(db);
    for (const collection of ['topics', 'replies']) {
      assert.equal(after[collection].length, before[collection].length);
      for (const original of before[collection]) {
        const changed = after[collection].find(row => row.id === original.id);
        assert.deepEqual(changed, {
          ...original,
          author_name: expectedNames.get(original.author_name),
          content: replaceMentions(original.content),
        }, `Only name and exact @mentions may change: ${original.id}`);
        assert.ok(!expectedNames.has(changed.author_name));
        for (const name of expectedNames.keys()) assert.ok(!changed.content.includes(`@${name}`));
      }
    }
    assert.equal(new Set(after.replies.map(row => row.author_name)).size, 30);
    assert.deepEqual(after.users, before.users, 'No synthetic accounts');
    await db.exec(sql);
    assert.deepEqual(await snapshot(db), after, 'Second application is a no-op');
  } finally { await db.close(); }
});

test('Exact mention replacement preserves prose, longer handles, emails and existing new mentions', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    const body = 'Dila ve Baran; @dila.yolnotu, (@baran.adimadim). @dila.yolnotu! @dila.yolnotu_more @dila.yolnotu.more mail@dila.yolnotu @@dila.yolnotu @dila.aydin';
    const expected = 'Dila ve Baran; @dila.aydin, (@baran.yildiz). @dila.aydin! @dila.yolnotu_more @dila.yolnotu.more mail@dila.yolnotu @@dila.yolnotu @dila.aydin';
    await db.query('update forum_replies set content=$1 where id=$2', [body, replyId(1, 1)]);
    await db.query('update forum_topics set content=$1 where id=$2', [body, topicId(1)]);
    await db.exec(sql);
    assert.equal((await db.query('select content from forum_replies where id=$1', [replyId(1, 1)])).rows[0].content, expected);
    assert.equal((await db.query('select content from forum_topics where id=$1', [topicId(1)])).rows[0].content, expected);
  } finally { await db.close(); }
});

test('Real authors, moderated rows, unexpected identifiers and out-of-scope discussions are untouched', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.exec(`
      update forum_topics set status='hidden' where id='${topicId(1)}';
      update forum_topics set status='pending' where id='${topicId(2)}';
      update forum_topics set status='deleted' where id='${topicId(3)}';
      update forum_topics set is_paywalled=true where id='${topicId(4)}';
      update forum_topics set category='Other category' where id='${topicId(5)}';
      update forum_topics set author_id='${realUser}' where id='${topicId(6)}';
      update forum_topics set author_name='Moderator chosen name' where id='${topicId(7)}';
      update forum_topics set id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where id='${topicId(8)}';
      update forum_replies set status='hidden' where id='${replyId(9, 1)}';
      update forum_replies set status='pending' where id='${replyId(9, 2)}';
      update forum_replies set status='deleted' where id='${replyId(9, 3)}';
      update forum_replies set author_name='Moderator chosen name' where id='${replyId(9, 4)}';
      update forum_replies set id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='${replyId(9, 5)}';
      update forum_replies set seed_key=null where id='${replyId(9, 6)}';
      update forum_replies set topic_id='${topicId(11)}' where id='${replyId(10, 1)}';
      update forum_replies set seed_key=null,user_id='${realUser}' where id='${replyId(10, 2)}';
      update forum_replies set seed_key='starter-reply-20261010-10-16' where id='${replyId(10, 3)}';
      update forum_topics set seed_key='starter-20260930-16' where id='${topicId(15)}';
      insert into forum_topics(id,slug,title,content,author_id,author_name,status,is_paywalled,category)
        values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','real-topic','Real','@dila.yolnotu please help','${realUser}','dila.yolnotu','published',false,'Ülke Bazlı Sorunlar');
      insert into forum_replies(topic_id,user_id,author_name,content,status)
        values ('${topicId(12)}','${realUser}','dila.yolnotu','@baran.adimadim genuine reply','published');
    `);
    const before = await snapshot(db);
    const excludedTopics = before.topics.filter(row => !row.seed_key || Number(row.seed_key.slice(-2)) <= 8 || row.id === topicId(15));
    const excludedTopicIds = new Set(excludedTopics.map(row => row.id));
    const excludedReplies = before.replies.filter(row =>
      excludedTopicIds.has(row.topic_id) || row.topic_id === topicId(9)
      || row.id === replyId(10, 1) || row.id === replyId(10, 2) || row.id === replyId(10, 3) || row.user_id === realUser);
    await db.exec(sql);
    const after = await snapshot(db);
    for (const row of excludedTopics) assert.deepEqual(after.topics.find(item => item.id === row.id), row);
    for (const row of excludedReplies) assert.deepEqual(after.replies.find(item => item.id === row.id), row);
    assert.notEqual(after.topics.find(row => row.id === topicId(12)).author_name, before.topics.find(row => row.id === topicId(12)).author_name, 'Eligible rows still update');
    assert.deepEqual(after.users, before.users);
    await db.exec(sql);
    assert.deepEqual(await snapshot(db), after);
  } finally { await db.close(); }
});
