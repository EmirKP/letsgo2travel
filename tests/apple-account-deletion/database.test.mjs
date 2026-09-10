import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

// Execute from the repository root; requires the existing local PGlite package.
// No network, Apple requests, Supabase connection or real account mutation.
const projectRoot = process.env.L2T_TEST_PROJECT_ROOT || process.cwd();
const require = createRequire(resolve(projectRoot, 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const otherUserId = '00000000-0000-4000-8000-000000000003';
const state = 'a'.repeat(64), state2 = 'b'.repeat(64), nonce = 'A'.repeat(43);
const past = '2020-01-01T00:00:00.000Z';
const future = '2099-01-01T00:00:00.000Z';

await test('Apple deletion database authorization and fencing contracts', async (suite) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key, user_id uuid not null, not_after timestamptz);
      create table public.account_deletion_jobs(target_user_id uuid, lease_until timestamptz);
    `);
    await db.exec(await readFile(resolve(projectRoot, 'supabase/migrations/20260910233000_apple_account_deletion.sql'), 'utf8'));
    const scalar = async (sql, parameters = []) => (await db.query(sql, parameters)).rows[0]?.value;
    const reset = async () => {
      await db.exec('truncate public.apple_account_deletion_authorizations, public.apple_account_deletion_grants, public.account_deletion_jobs, auth.sessions, auth.users cascade');
      await db.query('insert into auth.users values($1),($2)', [userId, otherUserId]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessionId, userId]);
    };
    const begin = (hash = state, signedIn = past) => scalar('select public.begin_apple_deletion_authorization($1,$2,$3,$4,$5) as value', [userId, sessionId, hash, nonce, signedIn]);
    const claim = (hash = state) => scalar('select public.claim_apple_deletion_authorization($1) as value', [hash]);
    const save = (hash = state, owner = userId, signedIn = past) => scalar('select public.save_apple_deletion_grant($1,$2,$3,$4,$5,$6) as value', [hash, owner, 'tr.com.example.apple', 'c'.repeat(64), 'synthetic-encrypted-token', signedIn]);

    await suite.test('valid session claims and saves once; replay cannot create another grant', async () => {
      await reset();
      assert.equal(await begin(), true);
      assert.deepEqual(await claim(), { user_id: userId, nonce, state_hash: state });
      assert.equal(await claim(), null);
      assert.equal(await save(), true);
      assert.equal(await save(), false);
      assert.equal(await scalar('select count(*)::int as value from public.apple_account_deletion_grants'), 1);
      assert.equal(await scalar('select count(*)::int as value from public.apple_account_deletion_authorizations'), 0);
    });

    await suite.test('wrong-owner and expired sessions cannot begin authorization', async () => {
      await reset();
      await db.query('update auth.sessions set user_id=$1 where id=$2', [otherUserId, sessionId]);
      assert.equal(await begin(), false);
      await db.query("update auth.sessions set user_id=$1,not_after=now()-interval '1 second' where id=$2", [userId, sessionId]);
      assert.equal(await begin(), false);
    });

    await suite.test('one-minute throttle permits replacing only an unclaimed older authorization', async () => {
      await reset();
      assert.equal(await begin(), true);
      assert.equal(await begin(state2), false);
      await db.exec("update public.apple_account_deletion_authorizations set created_at=now()-interval '2 minutes'");
      assert.equal(await begin(state2), true);
      assert.equal(await claim(), null);
      assert.equal((await claim(state2))?.state_hash, state2);
    });

    await suite.test('claimed authorization is protected from replacement and gets a full callback fence', async () => {
      await reset();
      assert.equal(await begin(), true);
      await db.exec("update public.apple_account_deletion_authorizations set created_at=now()-interval '2 minutes',expires_at=now()+interval '1 second'");
      assert.ok(await claim());
      assert.equal(await begin(state2), false);
      const seconds = await scalar('select extract(epoch from expires_at-now())::int as value from public.apple_account_deletion_authorizations');
      assert.ok(seconds >= 89 && seconds <= 90, `callback lease ${seconds}s`);
    });

    await suite.test('expired state and a removed session cannot be claimed or saved', async () => {
      await reset();
      assert.equal(await begin(), true);
      await db.exec("update public.apple_account_deletion_authorizations set expires_at=now()-interval '1 second'");
      assert.equal(await claim(), null);
      await reset();
      assert.equal(await begin(), true);
      assert.ok(await claim());
      await db.query('delete from auth.sessions where id=$1', [sessionId]);
      assert.equal(await save(), false);
    });

    await suite.test('deletion lease blocks begin, claim and save independently', async () => {
      await reset();
      await db.query("insert into public.account_deletion_jobs values($1,now()+interval '5 minutes')", [userId]);
      assert.equal(await begin(), false);
      await db.exec('truncate public.account_deletion_jobs');
      assert.equal(await begin(), true);
      await db.query("insert into public.account_deletion_jobs values($1,now()+interval '5 minutes')", [userId]);
      assert.equal(await claim(), null);
      await db.exec('truncate public.account_deletion_jobs');
      assert.ok(await claim());
      await db.query("insert into public.account_deletion_jobs values($1,now()+interval '5 minutes')", [userId]);
      assert.equal(await save(), false);
      await db.exec("update public.account_deletion_jobs set lease_until=now()-interval '1 second'");
      assert.equal(await save(), true);
    });

    await suite.test('ready grant blocks redundant authorization; later Apple sign-in can refresh stale credentials', async () => {
      await reset();
      assert.equal(await begin(), true);
      assert.ok(await claim());
      assert.equal(await save(), true);
      assert.equal(await begin(state2), false);
      assert.equal(await begin(state2, future), true);
      assert.ok(await claim(state2));
      assert.equal(await save(state2, userId, future), true);
    });

    await suite.test('revoked receipt cannot be replaced without a later Apple sign-in', async () => {
      await reset();
      assert.equal(await begin(), true);
      assert.ok(await claim());
      assert.equal(await save(), true);
      await db.exec('update public.apple_account_deletion_grants set revoked_at=now(),encrypted_refresh_token=null');
      assert.equal(await begin(state2, null), false);
      assert.equal(await begin(state2, past), false);
      assert.equal(await begin(state2, future), true);
      assert.ok(await claim(state2));
      assert.equal(await save(state2, userId, past), false);
      assert.equal(await save(state2, userId, future), true);
    });

    await suite.test('claimed state cannot be saved to another account', async () => {
      await reset();
      assert.equal(await begin(), true);
      assert.ok(await claim());
      assert.equal(await save(state, otherUserId), false);
      assert.equal(await scalar('select count(*)::int as value from public.apple_account_deletion_grants'), 0);
      assert.equal(await save(), true);
    });

    await suite.test('client roles have no token-table or authorization-RPC access', async () => {
      const functions = [
        'public.begin_apple_deletion_authorization(uuid,uuid,text,text,timestamptz)',
        'public.claim_apple_deletion_authorization(text)',
        'public.save_apple_deletion_grant(text,uuid,text,text,text,timestamptz)',
      ];
      for (const role of ['anon', 'authenticated']) {
        for (const fn of functions) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE') as value", [role, fn]), false);
        for (const table of ['public.apple_account_deletion_authorizations', 'public.apple_account_deletion_grants']) {
          assert.equal(await scalar("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as value", [role, table]), false);
        }
      }
      for (const fn of functions) assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE') as value", [fn]), true);
    });

    await suite.test('deleting an account cascades its token credentials', async () => {
      await reset();
      assert.equal(await begin(), true);
      assert.ok(await claim());
      assert.equal(await save(), true);
      await db.query('delete from auth.users where id=$1', [userId]);
      assert.equal(await scalar('select count(*)::int as value from public.apple_account_deletion_grants'), 0);
      assert.equal(await scalar('select count(*)::int as value from public.apple_account_deletion_authorizations'), 0);
    });
  } finally { await db.close(); }
});

await test('Apple authorization and the actual admin deletion claim exclude each other', async () => {
  const db = new PGlite();
  const requestId = '00000000-0000-4000-8000-000000000004';
  const leaseToken = '00000000-0000-4000-8000-000000000005';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
      set request.jwt.claim.role = 'service_role';
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key, user_id uuid not null, not_after timestamptz);
      create table public.kvkk_requests(id uuid primary key default gen_random_uuid(), user_id uuid,
        request_type text not null,status text not null,notes text,created_at timestamptz default now());
      create table public.forum_reports(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id));
    `);
    await db.exec(await readFile(resolve(projectRoot, 'supabase/migrations/20260910180000_account_deletion_lifecycle.sql'), 'utf8'));
    await db.exec(await readFile(resolve(projectRoot, 'supabase/migrations/20260910233000_apple_account_deletion.sql'), 'utf8'));
    await db.query('insert into auth.users values($1)', [userId]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessionId, userId]);
    await db.query("insert into public.kvkk_requests(id,user_id,request_type,status) values($1,$2,'Hesabımı kapatmak istiyorum','reviewing')", [requestId, userId]);
    await db.query('insert into public.account_deletion_jobs(request_id,target_user_id) values($1,$2)', [requestId, userId]);
    const scalar = async (sql, parameters = []) => (await db.query(sql, parameters)).rows[0]?.value;
    const start = (hash = state, signedIn = past) => scalar('select public.begin_apple_deletion_authorization($1,$2,$3,$4,$5) as value', [userId, sessionId, hash, nonce, signedIn]);
    const claimAdmin = async () => (await db.query('select * from public.claim_account_deletion_job($1,$2)', [requestId, leaseToken])).rows;
    assert.equal(await start(), true);
    assert.equal((await claimAdmin()).length, 0, 'pending Apple consent fences deletion');
    await db.exec("update public.apple_account_deletion_authorizations set expires_at=now()+interval '1 second'");
    assert.ok(await scalar('select public.claim_apple_deletion_authorization($1) as value', [state]));
    assert.equal((await claimAdmin()).length, 0, 'in-flight token exchange fences deletion');
    assert.equal(await scalar('select public.save_apple_deletion_grant($1,$2,$3,$4,$5,$6) as value', [state,userId,'tr.com.example.apple','c'.repeat(64),'synthetic-encrypted-token',past]), true);
    assert.equal((await claimAdmin()).length, 1, 'completed credential save allows deletion lease');
    assert.equal((await claimAdmin()).length, 0, 'second worker cannot claim active deletion lease');
    assert.equal(await start(state2, future), false, 'active deletion lease fences fresh Apple consent');
    await db.exec("update public.account_deletion_jobs set lease_until=now()-interval '1 second'");
    assert.equal(await start(state2, future), true, 'expired worker lease permits user recovery');
    assert.equal((await claimAdmin()).length, 0);
    await db.exec("update public.apple_account_deletion_authorizations set expires_at=now()-interval '1 second'");
    assert.equal((await claimAdmin()).length, 1, 'expired abandoned Apple flow cannot permanently block deletion');
  } finally { await db.close(); }
});
