import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create table public.forum_topics(id uuid primary key, author_id uuid references auth.users(id) on delete set null, status text);
  grant all on public.forum_topics to service_role;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
  create policy broad_existing_access on storage.objects for all to anon, authenticated using (true) with check (true);
`);
await db.exec(readFileSync('supabase/migrations/20260928150000_community_post_photos.sql', 'utf8'));
const owner = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
const topic = '20000000-0000-4000-8000-000000000001';
await db.query('insert into auth.users values ($1),($2)', [owner, other]);
await db.query("insert into forum_topics values ($1,$2,'pending')", [topic, owner]);
const bucket = (await db.query("select * from storage.buckets where id='community-post-photos'")).rows[0];
assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 300000); assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg']);
await db.query("insert into storage.objects(bucket_id,name) values ('community-post-photos','private.jpg'),('other-bucket','other.jpg')");
await db.exec('set role service_role');
await assert.rejects(db.query('insert into forum_topic_photos(topic_id,user_id,storage_path) values ($1,$2,$3)', [topic, other, `${other}/${topic}.jpg`]));
await assert.rejects(db.query('insert into forum_topic_photos(topic_id,user_id,storage_path) values ($1,$2,$3)', [topic, owner, `${other}/${topic}.jpg`]));
await db.query("update forum_topics set status='published' where id=$1", [topic]);
await assert.rejects(db.query('insert into forum_topic_photos(topic_id,user_id,storage_path) values ($1,$2,$3)', [topic, owner, `${owner}/${topic}.jpg`]));
await db.query("update forum_topics set status='pending' where id=$1", [topic]);
await db.query('insert into forum_topic_photos(topic_id,user_id,storage_path) values ($1,$2,$3)', [topic, owner, `${owner}/${topic}.jpg`]);
console.log('PASS owner, path, pending review and private bucket constraints');
for (const role of ['anon', 'authenticated']) {
  await db.exec(`reset role; set role ${role}`);
  await assert.rejects(db.query('select * from forum_topic_photos'));
  await assert.rejects(db.query('delete from forum_topic_photos'));
  assert.deepEqual((await db.query('select name from storage.objects')).rows, [{ name: 'other.jpg' }]);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('community-post-photos','forged.jpg')"));
  await db.query("delete from storage.objects where bucket_id='community-post-photos'");
}
console.log('PASS ordinary clients cannot read/write photo metadata or objects even with broad storage policies');
await db.exec('reset role');
assert.equal((await db.query("select count(*) from storage.objects where bucket_id='community-post-photos'")).rows[0].count, 1);
await db.query('delete from auth.users where id=$1', [owner]);
assert.equal((await db.query('select count(*) from forum_topic_photos')).rows[0].count, 0);
console.log('PASS author deletion removes photo metadata while topic is retained anonymously');
await db.close();
