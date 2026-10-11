import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
set "request.jwt.claim.role"='service_role';
create table public.profiles(id uuid primary key references auth.users(id),role text);
create table public.trips(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now());`);
const updates = read('supabase_updates.sql');
await db.exec(updates.slice(updates.indexOf('CREATE TABLE IF NOT EXISTS public.travel_verifications'), updates.indexOf('-- Tablo zaten var')));
await db.exec(read('supabase_belgeli_gezgin.sql').split('-- country_questions')[0]);
await db.exec(read('supabase/migrations/20260905000100_trip_collaboration.sql').replace('create extension if not exists pgcrypto;', ''));
await db.exec(read('supabase/migrations/20260905000200_build24_integrity.sql'));
const retention = read('supabase_evening_web_android.sql');
await db.exec(retention.slice(retention.indexOf('alter table public.travel_verifications'), retention.indexOf('-- İşlenmiş hesap silme')));
// Match the deployed legacy omissions, then run the same repair used in production.
await db.exec(`alter table travel_verifications drop column user_note, drop column evidence_path,
  drop column evidence_type, drop column evidence_expires_at;
drop table user_country_unlocks,user_badges,user_trust_scores,admin_audit_logs;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
insert into storage.buckets(id,name,public) values('travel-proofs','travel-proofs',false);`);
const repair = read('supabase/migrations/20261012190000_verification_upload_contract.sql');
await db.exec(repair);
await db.exec(repair);
await db.query('insert into auth.users values ($1)', [owner]);
await db.query("insert into profiles values ($1,'admin')", [owner]);

// Run the real multipart handler against the repository's PostgreSQL schema.
// Only authentication and object storage are local substitutes; no network calls.
function fixture(options = {}) {
  const state = { uploads: [], removals: [], insertErrors: [] };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: owner } } }) },
    storage: { from(bucket) {
      assert.equal(bucket, 'travel-evidence');
      return {
        upload: async (path) => { state.uploads.push(path); return { error: options.uploadError ? { message: 'storage unavailable' } : null }; },
        remove: async (paths) => { state.removals.push(...paths); return { error: null }; },
      };
    } },
    from(table) {
      assert.equal(table, 'travel_verifications');
      const filters = [], args = [];
      let row;
      const query = {
        select() { return query; },
        eq(column, value) { args.push(value); filters.push(`${column} = $${args.length}`); return query; },
        gte(column, value) { args.push(value); filters.push(`${column} >= $${args.length}`); return query; },
        limit() { return query; },
        insert(rows) { [row] = rows; return query; },
        async then(resolve, reject) {
          try {
            if (options.lookupError && !row) return resolve({ data: null, error: { message: 'lookup unavailable' } });
            let result;
            if (row) {
              const columns = Object.keys(row);
              assert.ok(columns.every((key) => /^[a-z_]+$/.test(key)));
              result = await db.query(`insert into travel_verifications (${columns.join(',')}) values (${columns.map((_, i) => `$${i + 1}`).join(',')}) returning *`, Object.values(row));
            } else {
              result = await db.query(`select id from travel_verifications where ${filters.join(' and ')} limit 1`, args);
            }
            return resolve({ data: result.rows, error: null });
          } catch (error) {
            if (row) state.insertErrors.push(error);
            try { return resolve({ data: null, error }); } catch (failure) { return reject(failure); }
          }
        },
      };
      return query;
    },
  };
  const code = ts.transpileModule(read('app/api/travel-verifications/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    Date, File, Uint8Array, crypto: webcrypto, console: { error() {} },
  })((name) => {
    if (name === 'next/server') return { NextResponse: { json: Response.json.bind(Response) } };
    if (name === '@/lib/supabaseAdmin') return { getSupabaseAdmin: () => client };
    if (name === '@/lib/countries/isoSource') return { isoCountryByAlpha2: (code) => code === 'AL' ? { name: 'Albania' } : null };
    throw new Error(`Unexpected import ${name}`);
  }, mod, mod.exports);
  return { state, post: mod.exports.POST };
}

function request({ token = true, country = 'AL', validFile = true } = {}) {
  const body = new FormData();
  body.set('countryCode', country);
  body.set('note', 'Local regression fixture');
  body.set('file', new File([new Uint8Array(validFile ? [255, 216, 255, 0] : [1, 2, 3, 4])], 'proof.jpg', { type: 'image/jpeg' }));
  return new Request('https://example.test/api/travel-verifications', {
    method: 'POST', headers: token ? { Authorization: 'Bearer local-test-token' } : {}, body,
  });
}

await test('document upload persists a pending review using the canonical DB contract, without awarding points', async () => {
  const { post, state } = fixture();
  const response = await post(request());
  assert.equal(response.status, 200, `${JSON.stringify(await response.clone().json())} ${state.insertErrors.map((error) => error.message).join('; ')}`);
  const { data } = await response.json();
  assert.equal(data.verification_method, 'document');
  assert.equal(data.status, 'pending');
  assert.equal(data.user_id, owner);
  assert.equal(data.evidence_path, state.uploads[0]);
  assert.ok(data.evidence_path.startsWith(`${owner}/`));
  assert.ok(Date.parse(data.evidence_expires_at) > Date.now());
  assert.equal(state.removals.length, 0);
  for (const table of ['user_points_log', 'user_country_unlocks', 'user_badges']) {
    assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0);
  }
  const duplicate = await post(request());
  assert.equal(duplicate.status, 409);
  assert.equal(state.uploads.length, 1);
});

await test('insert failure removes the just-uploaded proof and never reports success', async () => {
  await db.exec('delete from travel_verifications; alter table travel_verifications add constraint simulate_insert_failure check(false)');
  try {
    const { post, state } = fixture();
    assert.equal((await post(request())).status, 500);
    assert.equal(state.insertErrors.length, 1);
    assert.deepEqual(state.removals, state.uploads);
    assert.equal(state.uploads.length, 1);
    assert.equal((await db.query('select count(*)::int as n from travel_verifications')).rows[0].n, 0);
  } finally { await db.exec('alter table travel_verifications drop constraint simulate_insert_failure'); }
});

await test('storage failure does not create a review or award points', async () => {
  const { post, state } = fixture({ uploadError: true });
  assert.equal((await post(request())).status, 500);
  assert.equal(state.uploads.length, 1);
  assert.equal((await db.query('select count(*)::int as n from travel_verifications')).rows[0].n, 0);
});

await test('lookup outages stop before upload', async () => {
  const { post, state } = fixture({ lookupError: true });
  assert.equal((await post(request())).status, 500);
  assert.equal(state.uploads.length, 0);
});

await test('authentication and file validation reject before writing storage or DB', async () => {
  const { post, state } = fixture();
  assert.equal((await post(request({ token: false }))).status, 401);
  assert.equal((await fixture({ noUser: true }).post(request())).status, 401);
  assert.equal((await post(request({ validFile: false }))).status, 400);
  assert.equal((await post(request({ country: 'XX' }))).status, 400);
  assert.equal(state.uploads.length, 0);
});

await test('legacy proof paths retain their bucket, approvals are atomic and award only once', async () => {
  const legacy = '22222222-2222-4222-8222-222222222222';
  await db.query(`insert into travel_verifications(id,user_id,country_code,country_name,verification_method,proof_file_path,created_at)
    values($1,$2,'AL','Albania','document','legacy/proof.pdf',now() - interval '2 days')`, [legacy,owner]);
  await db.exec(repair);
  const record = (await db.query('select * from travel_verifications where id=$1', [legacy])).rows[0];
  assert.equal(record.evidence_bucket, 'travel-proofs');
  assert.equal(record.evidence_path, 'legacy/proof.pdf');
  assert.ok(record.evidence_expires_at > new Date());
  assert.equal((await db.query('select count(*)::int as n from user_points_log')).rows[0].n, 0);
  const review = () => db.query("select review_travel_verification($1,$2,'approve','Local fixture','legacy/proof.pdf')", [legacy,owner]);
  await db.exec('alter table admin_audit_logs add constraint simulate_audit_failure check(false)');
  await assert.rejects(review, /simulate_audit_failure/);
  assert.equal((await db.query('select status from travel_verifications where id=$1', [legacy])).rows[0].status, 'pending');
  assert.equal((await db.query('select count(*)::int as n from user_points_log')).rows[0].n, 0);
  await db.exec('alter table admin_audit_logs drop constraint simulate_audit_failure');
  await review(); await review();
  assert.equal((await db.query('select count(*)::int as n from user_points_log')).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int as n from admin_audit_logs')).rows[0].n, 1);
  assert.equal((await db.query("select public from storage.buckets where id='travel-evidence'")).rows[0].public, false);
  await db.exec('set role authenticated');
  await assert.rejects(() => db.query('select * from admin_audit_logs'), /permission denied/);
  await db.exec('reset role');
});
await db.close();
