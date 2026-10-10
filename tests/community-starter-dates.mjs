import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(path, 'utf8');
const timeline = read('supabase/seeds/community-starter-dates-20261010.sql');
const userId = 'f09a2026-0930-4000-8000-000000000099';
const topicId = n => `f09a2026-0930-4000-8000-${String(n).padStart(12, '0')}`;
const replyId = (t, n) => `f09a2026-1010-4000-8000-${String(t).padStart(10, '0')}${String(n).padStart(2, '0')}`;
const boundary = Date.parse('2026-10-10T00:00:00+03:00');
const milliseconds = value => new Date(value).getTime();
const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(value));

async function setup(db) {
  await db.exec(`create schema auth;
    create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'')$$;
    create table auth.users(id uuid primary key); insert into auth.users values ('${userId}');
    create table forum_topics(id uuid primary key, slug text unique not null, title text, content text,
      author_id uuid not null references auth.users(id), author_name text, country_slug text,
      category text, status text, is_paywalled boolean, created_at timestamptz default now());
    create table forum_replies(id uuid primary key default gen_random_uuid(), topic_id uuid references forum_topics(id),
      user_id uuid references auth.users(id), author_name text, content text, status text, created_at timestamptz default now());`);
  await db.exec(read('supabase/migrations/20260930121000_community_starter_topics.sql'));
  await db.exec(read('supabase/seeds/community-starters-20260930.sql'));
  await db.exec(read('supabase/migrations/20261010130000_community_starter_replies.sql'));
  await db.exec(read('supabase/seeds/community-starter-replies-20261010.sql'));
}

async function snapshot(db) {
  return {
    topics: (await db.query('select * from forum_topics order by id')).rows,
    replies: (await db.query('select * from forum_replies order by id')).rows,
  };
}

const withoutDates = data => Object.fromEntries(Object.entries(data).map(([key, rows]) =>
  [key, rows.map(row => Object.fromEntries(Object.entries(row).filter(([field]) => field !== 'created_at')))]));

test('Fixed editorial dates are varied, ordered, before cutoff and exactly idempotent', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    const before = await snapshot(db);
    await db.exec(timeline);
    const after = await snapshot(db);
    assert.equal(after.topics.length, 15);
    assert.equal(after.replies.length, 135);
    assert.deepEqual(withoutDates(after), withoutDates(before), 'Only dates change, not content, authors, moderation or counts');
    assert.equal(new Set(after.topics.map(row => day(row.created_at))).size, 15);
    assert.equal(Math.min(...after.topics.map(row => milliseconds(row.created_at))), Date.parse('2026-09-12T17:52:00+03:00'));
    assert.equal(Math.max(...after.topics.map(row => milliseconds(row.created_at))), Date.parse('2026-10-08T08:26:00+03:00'));
    const intervals = new Set();
    for (const topic of after.topics) {
      const replies = after.replies.filter(row => row.topic_id === topic.id).sort((a, b) => a.seed_key.localeCompare(b.seed_key));
      let previous = milliseconds(topic.created_at);
      assert.ok(new Set(replies.map(row => day(row.created_at))).size >= 2, `Comments under ${topic.seed_key} span multiple visible dates`);
      for (const reply of replies) {
        const date = milliseconds(reply.created_at);
        assert.ok(date > previous, 'Reply ordinal and @mention progression stay chronological');
        assert.ok(date < boundary && date < Date.now(), 'No future comments');
        intervals.add(date - previous);
        previous = date;
      }
    }
    assert.ok(intervals.size > 100, 'Gaps are uneven rather than an obvious regular schedule');
    const rerun = await db.exec(timeline);
    assert.deepEqual(await snapshot(db), after, 'Rerun causes no timestamp drift');
    const result = rerun.find(entry => entry.rows?.[0]?.updated_starter_topics !== undefined).rows[0];
    assert.equal(Number(result.updated_starter_topics), 0);
    assert.equal(Number(result.updated_starter_replies), 0);
  } finally { await db.close(); }
});

test('Early genuine, anonymized and moderated replies keep their dates and cap the seed timeline', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.query(`insert into forum_topics(id,slug,title,author_id,author_name,category,status,is_paywalled,created_at)
      values ($1,'genuine-topic','Actual user topic',$2,'Real author','Ülke Bazlı Sorunlar','published',false,'2026-08-20 13:14+03')`, [topicId(99), userId]);
    await db.query(`insert into forum_replies(topic_id,user_id,author_name,content,status,created_at) values
      ($1,$4,'Real author','First actual reply','published','2026-09-01 09:12+03'),
      ($2,null,'Deleted user','Anonymized actual reply','published','2026-09-07 20:33+03'),
      ($3,$4,'Real author','Ordinary discussion reply','published','2026-08-21 15:46+03')`, [topicId(1), topicId(2), topicId(99), userId]);
    await db.query("update forum_replies set status='hidden',created_at='2026-09-05 16:21+03' where id=$1", [replyId(3, 2)]);
    const before = await snapshot(db);
    const protectedReplies = before.replies.filter(row => !row.seed_key || row.status !== 'published');
    await db.exec(timeline);
    const after = await snapshot(db);
    assert.deepEqual(after.topics.find(row => row.id === topicId(99)), before.topics.find(row => row.id === topicId(99)));
    for (const protectedReply of protectedReplies) {
      assert.deepEqual(after.replies.find(row => row.id === protectedReply.id), protectedReply);
      if (protectedReply.topic_id === topicId(99)) continue;
      const parent = after.topics.find(row => row.id === protectedReply.topic_id);
      assert.ok(milliseconds(parent.created_at) <= milliseconds(protectedReply.created_at) - 3 * 86_400_000);
      const editable = after.replies.filter(row => row.topic_id === parent.id && row.seed_key && row.status === 'published');
      for (const reply of editable) {
        assert.ok(milliseconds(reply.created_at) > milliseconds(parent.created_at));
        assert.ok(milliseconds(reply.created_at) <= milliseconds(protectedReply.created_at) - 60_000);
      }
      assert.ok(new Set(editable.map(row => day(row.created_at))).size >= 2);
    }
    assert.deepEqual(withoutDates(after), withoutDates(before));
    await db.exec(timeline);
    assert.deepEqual(await snapshot(db), after, 'Genuine activity bounds are stable on rerun');
  } finally { await db.close(); }
});

test('Topic eligibility and exact reply identity guards protect every non-target row', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    await db.query("update forum_topics set status='hidden' where id=$1", [topicId(1)]);
    await db.query('update forum_topics set is_paywalled=true where id=$1', [topicId(2)]);
    await db.query("update forum_topics set category='Other' where id=$1", [topicId(3)]);
    await db.query('update forum_topics set author_id=$2 where id=$1', [topicId(4), userId]);
    // A seed key moved to another row must not grant that row an editorial identity.
    await db.query('delete from forum_replies where topic_id=$1', [topicId(5)]);
    await db.query('update forum_topics set id=$2 where id=$1', [topicId(5), topicId(95)]);
    await db.query('update forum_replies set id=gen_random_uuid() where id=$1', [replyId(6, 1)]);
    await db.query("update forum_replies set seed_key='starter-reply-20261010-99-01' where id=$1", [replyId(6, 2)]);
    await db.query('update forum_replies set topic_id=$2 where id=$1', [replyId(7, 1), topicId(8)]);
    await db.query("update forum_replies set status='pending' where id=$1", [replyId(7, 2)]);
    // Simulate legacy inconsistent attribution, bypassing only its check constraint.
    await db.exec('alter table forum_replies drop constraint forum_reply_starter_identity');
    await db.query('update forum_replies set user_id=$2 where id=$1', [replyId(8, 2), userId]);
    const before = await snapshot(db);
    await db.exec(timeline);
    const after = await snapshot(db);
    for (const id of [1, 2, 3, 4, 95].map(topicId)) {
      assert.deepEqual(after.topics.find(row => row.id === id), before.topics.find(row => row.id === id));
      assert.deepEqual(after.replies.filter(row => row.topic_id === id), before.replies.filter(row => row.topic_id === id));
    }
    for (const row of before.replies.filter(row =>
      row.seed_key === 'starter-reply-20261010-06-01' ||
      [replyId(6, 2), replyId(7, 1), replyId(7, 2), replyId(8, 2)].includes(row.id))) {
      assert.deepEqual(after.replies.find(candidate => candidate.id === row.id), row, `Protected identity ${row.seed_key} is unchanged`);
    }
    assert.deepEqual(withoutDates(after), withoutDates(before));
    await db.exec(timeline);
    assert.deepEqual(await snapshot(db), after);
  } finally { await db.close(); }
});

test('Timeline refuses future activation without any persisted mutation', async () => {
  const db = new PGlite();
  try {
    await setup(db);
    const before = await snapshot(db);
    await assert.rejects(db.exec(timeline.replaceAll('2026-10-10 00:00:00+03', '2999-10-10 00:00:00+03')), /must not be applied before/);
    await db.exec('rollback');
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});
