import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20260927090000_flight_lookup_quota.sql', import.meta.url), 'utf8');
const users = Array.from({ length: 4 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
async function fixture() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role; create schema auth; create table auth.users(id uuid primary key);');
  await db.exec(migration);
  for (const user of users) await db.query('insert into auth.users(id) values($1)', [user]);
  return db;
}
async function consume(db, user = users[0], limit = 100) {
  return (await db.query('select public.consume_flight_lookup_quota($1,$2) as allowed', [user, limit])).rows[0].allowed;
}
async function rows(db) { return (await db.query('select bucket,scope,user_id,uses from public.flight_lookup_quota order by bucket,scope')).rows; }

test('Quota table uses RLS and only service_role can execute the quota function', async () => {
  const db = await fixture();
  try {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.flight_lookup_quota'::regclass")).rows[0].relrowsecurity, true);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(() => consume(db), /permission denied/);
      await assert.rejects(() => db.query('select * from public.flight_lookup_quota'), /permission denied/);
      await assert.rejects(() => db.query("insert into public.flight_lookup_quota values ('x','x',null,1)"), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role'); assert.equal(await consume(db), true);
  } finally { await db.close(); }
});

test('Null-user readiness and invalid allowances are read-only even when old buckets exist', async () => {
  const db = await fixture();
  try {
    await db.query("insert into public.flight_lookup_quota values ('2000-01','global',null,10)");
    const before = await rows(db);
    await db.exec('set role service_role');
    assert.equal(await consume(db, null), false);
    for (const limit of [null, 0, -1, 10001]) assert.equal(await consume(db, users[0], limit), false);
    await db.exec('reset role'); assert.deepEqual(await rows(db), before);
  } finally { await db.close(); }
});

test('Ten lookups per user per UTC day are capped atomically without charging rejected calls', async () => {
  const db = await fixture();
  try {
    await db.exec('set role service_role');
    const results = await Promise.all(Array.from({ length: 12 }, () => consume(db)));
    assert.equal(results.filter(Boolean).length, 10);
    assert.equal(await consume(db, users[1]), true);
    await db.exec('reset role');
    const data = await rows(db);
    assert.equal(data.find(row => row.scope === users[0]).uses, 10);
    assert.equal(data.find(row => row.scope === 'global').uses, 11);
    assert.equal(data.find(row => row.scope === 'minute').uses, 11);
  } finally { await db.close(); }
});

test('Monthly global quota survives user deletion and cannot be reset by another account', async () => {
  const db = await fixture();
  try {
    await db.exec('set role service_role');
    for (let i = 0; i < 3; i++) assert.equal(await consume(db, users[0], 3), true);
    assert.equal(await consume(db, users[1], 3), false);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1', [users[0]]);
    const data = await rows(db);
    assert.equal(data.filter(row => row.user_id === users[0]).length, 0);
    assert.equal(data.find(row => row.scope === 'global').uses, 3);
    assert.equal(data.find(row => row.scope === 'minute').uses, 3);
    await db.exec('set role service_role'); assert.equal(await consume(db, users[1], 3), false);
  } finally { await db.close(); }
});

test('Twenty provider requests per minute are shared across users', async () => {
  const db = await fixture();
  try {
    await db.exec('set role service_role');
    for (const user of users.slice(0, 2)) for (let i = 0; i < 10; i++) assert.equal(await consume(db, user), true);
    assert.equal(await consume(db, users[2]), false);
    await db.exec('reset role');
    const data = await rows(db);
    assert.equal(data.find(row => row.scope === 'global').uses, 20);
    assert.equal(data.find(row => row.scope === 'minute').uses, 20);
    assert.equal(data.some(row => row.user_id === users[2]), false);
  } finally { await db.close(); }
});

test('Stale daily/minute counters expire while the current monthly aggregate remains', async () => {
  const db = await fixture();
  try {
    await db.exec('set role service_role'); assert.equal(await consume(db), true);
    await db.exec('reset role');
    await db.query("insert into public.flight_lookup_quota values ('2000-01','global',null,10),('2000-01-01',$1,$2::uuid,10),('2000-01-01 00:00','minute',null,20)", [users[0], users[0]]);
    await db.exec('set role service_role'); assert.equal(await consume(db, users[1]), true);
    await db.exec('reset role');
    const data = await rows(db);
    assert.equal(data.some(row => row.bucket.startsWith('2000-')), false);
    assert.equal(data.find(row => row.scope === 'global').uses, 2);
    const before = await rows(db);
    await db.exec('set role service_role');
    await assert.rejects(() => consume(db, '99999999-0000-4000-8000-000000000001'), /foreign key/);
    await db.exec('reset role'); assert.deepEqual(await rows(db), before);
  } finally { await db.close(); }
});
