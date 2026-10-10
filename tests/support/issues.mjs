import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
function load(path, imports = {}, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const sourceModule = { exports: {} };
  vm.runInNewContext(compiled, { module: sourceModule, exports: sourceModule.exports, require: name => imports[name] ?? require(name), Buffer, Request, Response, URL, crypto: { randomUUID }, ...globals }, { filename: path });
  return sourceModule.exports;
}
const lib = load('lib/support-issues.ts', { sharp: { default: sharp } }, { process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'test-secret' } } });
const input = () => ({ requestId: randomUUID(), description: 'The save button did not respond.', email: 'reply@example.com', screen: 'community', locale: 'en', version: '1.4.0', build: '65', screenshot: null });

test('issue validation bounds private data and rejects URLs, injected recipients and unsupported images', () => {
  const valid = input(); assert.equal(lib.parseSupportIssue(valid).description, valid.description);
  for (const change of [{ description: 'short' }, { description: 'x'.repeat(3001) }, { email: 'a@example.com\nBcc:b@e.co' }, { screen: 'community?token=private' }, { screenshot: 'data:image/svg+xml;base64,PHN2Zz4=' }, { screenshot: 'data:image/png;base64,abc$' }, { locale: 'invalid' }, { requestId: '1' }]) assert.equal(lib.parseSupportIssue({ ...valid, ...change }), null);
  assert.equal(lib.supportPayloadHash(valid), lib.supportPayloadHash({ ...valid, locale: 'sq', version: '1.5.0' }));
  assert.notEqual(lib.supportPayloadHash(valid), lib.supportPayloadHash({ ...valid, description: 'Changed description' }));
});

test('screenshots are verified, resized, converted to JPEG and have metadata removed', async () => {
  const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#00aaff' } }).withMetadata({ exif: { IFD0: { Artist: 'Private author' } } }).png().toBuffer();
  const base64 = await lib.normalizeSupportScreenshot(`data:image/png;base64,${png.toString('base64')}`);
  const metadata = await sharp(Buffer.from(base64, 'base64')).metadata();
  assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 1400); assert.equal(metadata.height, 700); assert.equal(metadata.exif, undefined);
  await assert.rejects(lib.normalizeSupportScreenshot('data:image/jpeg;base64,bm90IGFuIGltYWdl'));
  assert.equal(await lib.normalizeSupportScreenshot(null), null);
});

test('guest limiter stores a keyed fingerprint, never a raw IP address', () => {
  const request = new Request('https://example.test', { headers: { 'x-vercel-forwarded-for': '192.0.2.17' } });
  const actor = lib.supportActorKey(request, null);
  assert.match(actor, /^guest:[a-f0-9]{64}$/); assert.ok(!actor.includes('192.0.2.17'));
  assert.equal(actor, lib.supportActorKey(request, null));
  assert.equal(lib.supportActorKey(request, 'user-1'), 'user:user-1');
});

const bounded = load('lib/travel-assistant/http.ts');
test('body size limit also applies to streamed requests without content-length', async () => {
  await assert.rejects(bounded.boundedJson(new Request('https://example.test', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(200) }) }), 64), /too-large/);
});

test('API success requires durable RPC acknowledgement; unavailable DB, rejection and bad sessions never claim success', async () => {
  let rpcResult = { data: null, error: null }, calls = 0, configured = true, auth = true;
  const route = load('app/api/support/issues/route.ts', {
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => configured ? { rpc: async (name, args) => { calls++; assert.equal(name, 'submit_support_issue'); assert.equal(args.p_screen, 'community'); return rpcResult; } } : null },
    '@/lib/authenticated-user': { requireAuthenticatedUser: async () => auth ? { ok: true, user: { id: 'user-1' } } : { ok: false } },
    '@/lib/travel-assistant/http': bounded, '@/lib/support-issues': lib,
  });
  const call = headers => route.POST(new Request('https://example.test/api/support/issues', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input()) }));
  configured = false; assert.equal((await call()).status, 503); assert.equal(calls, 0); configured = true;
  assert.equal((await call()).status, 503);
  rpcResult = { data: null, error: { message: 'support-rate-limited' } }; assert.equal((await call()).status, 429);
  rpcResult = { data: null, error: { message: 'support-id-conflict' } }; assert.equal((await call()).status, 409);
  const id = randomUUID(); rpcResult = { data: id, error: null };
  const saved = await call(); assert.equal(saved.status, 201); assert.equal((await saved.json()).id, id); assert.match(saved.headers.get('cache-control'), /no-store/);
  auth = false; const before = calls; assert.equal((await call({ Authorization: 'Bearer bad' })).status, 401); assert.equal(calls, before);
});

test('admin listing, images and status updates require current administrator authorization', async () => {
  let denied = true, reads = 0, selected = '';
  const row = { id: randomUUID(), screenshot_base64: Buffer.from('test image').toString('base64') };
  const query = { select: fields => { selected = fields; return query; }, eq: () => query, order: () => query, range: async () => ({ data: [], count: 0, error: null }), maybeSingle: async () => ({ data: row, error: null }), update: () => query };
  const route = load('app/api/admin/support-issues/route.ts', {
    '@/lib/admin-auth': { requireAdmin: async () => denied ? Response.json({ error: 'denied' }, { status: 401 }) : null },
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => ({ from: () => { reads++; return query; } }) },
    '@/lib/travel-assistant/http': bounded, '@/lib/support-issues': lib,
  });
  assert.equal((await route.GET(new Request('https://example.test/api/admin/support-issues'))).status, 401);
  assert.equal((await route.GET(new Request(`https://example.test/api/admin/support-issues?image=${row.id}`))).status, 401);
  assert.equal((await route.PATCH(new Request('https://example.test/api/admin/support-issues', { method: 'PATCH', body: '{}' }))).status, 401);
  assert.equal(reads, 0);
  denied = false;
  const list = await route.GET(new Request('https://example.test/api/admin/support-issues')); assert.equal(list.status, 200); assert.ok(!selected.includes('screenshot_base64')); assert.match(list.headers.get('cache-control'), /no-store/);
  const image = await route.GET(new Request(`https://example.test/api/admin/support-issues?image=${row.id}`)); assert.equal(image.headers.get('content-type'), 'image/jpeg'); assert.match(image.headers.get('cache-control'), /no-store/);
  assert.equal((await route.PATCH(new Request('https://example.test/api/admin/support-issues', { method: 'PATCH', body: JSON.stringify({ id: row.id, status: 'invalid' }) }))).status, 400);
  assert.equal((await route.PATCH(new Request('https://example.test/api/admin/support-issues', { method: 'PATCH', body: JSON.stringify({ id: row.id, status: 'resolved' }) }))).status, 200);
});

test('database atomically deduplicates retries, bounds hourly reports and prevents public access', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
    const sql = readFileSync('supabase/migrations/20261010150000_support_issues.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    const submit = (id, hash = 'same', actor = 'guest:key') => db.query('select public.submit_support_issue($1,$2,$3,null,$4,null,$5,$6,$7,$8,null) as id', [id, actor, hash, 'Description of a problem', 'community', 'en', '1.4.0', '65']);
    const id = randomUUID(); assert.equal((await submit(id)).rows[0].id, id); assert.equal((await submit(id)).rows[0].id, id);
    assert.equal((await db.query('select count(*)::int as count from support_issues')).rows[0].count, 1);
    await assert.rejects(submit(id, 'changed'), /support-id-conflict/);
    await assert.rejects(submit(id, 'same', 'guest:other'), /support-id-conflict/);
    for (let i = 0; i < 4; i++) await submit(randomUUID());
    await assert.rejects(submit(randomUUID()), /support-rate-limited/);
    assert.equal((await submit(id)).rows[0].id, id, 'retry works even at quota');
    await submit(randomUUID(), 'another', 'guest:other');
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from support_issues'), error => error.code === '42501');
      await assert.rejects(submit(randomUUID()), error => error.code === '42501');
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});

test('permanent account deletion removes private support reports without touching other accounts or guest email matches', async () => {
  const sql = readFileSync('supabase/migrations/20261010150000_support_issues.sql', 'utf8');
  for (const previousRelation of [false, true]) {
    const db = new PGlite();
    try {
      await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
      await db.exec(sql);
      const owner = randomUUID(), other = randomUUID(), email = 'shared@example.test';
      await db.query('insert into auth.users(id) values ($1), ($2)', [owner, other]);
      const submit = userId => db.query('select public.submit_support_issue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [randomUUID(), userId ? `user:${userId}` : 'guest:fingerprint', 'payload', userId, 'Private issue description', email, 'profile', 'en', '1.4.0', '65', 'cHJpdmF0ZQ==']);
      await submit(owner); await submit(owner); await submit(other); await submit(null);
      if (previousRelation) {
        // A previously initialized database must receive the corrected relation too.
        await db.exec('alter table support_issues drop constraint support_issues_user_id_fkey; alter table support_issues add constraint support_issues_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null;');
        await db.exec(sql);
      }
      const unaffected = await db.query('select * from support_issues where user_id is distinct from $1 order by id', [owner]);
      await db.query('delete from auth.users where id = $1', [owner]);
      assert.equal((await db.query('select count(*)::int as count from support_issues where actor_key = $1 or user_id = $2', [`user:${owner}`, owner])).rows[0].count, 0, 'Deleted accounts must leave no description, reply email, screenshot or embedded account ID');
      assert.deepEqual((await db.query('select * from support_issues order by id')).rows, unaffected.rows, 'Another account and a guest using the same unverified email must remain unchanged');
    } finally { await db.close(); }
  }
});

test('mobile draft survives close/failure and text reload; screenshots are kept off persistent storage', async () => {
  const values = new Map();
  const sessionStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let result = null, requests = [];
  const imports = { './api': { requestJson: async (path, options) => { requests.push({ path, options }); if (result instanceof Error) throw result; return result; } } };
  const globals = { sessionStorage, window: { location: { hash: '#community?private-id=secret' } } };
  const client = load('mobile/src/lib/issueReport.ts', imports, globals);
  const draft = client.readIssueDraft(); assert.equal(draft.screen, 'community');
  Object.assign(draft, { description: 'Keep this useful description', email: 'me@example.com', screenshot: 'data:image/jpeg;base64,cGl4ZWxz' });
  client.saveIssueDraft(draft); assert.equal(client.readIssueDraft().screenshot, draft.screenshot);
  assert.ok(![...values.values()].join('').includes('cGl4ZWxz'));
  result = new Error('offline'); await assert.rejects(client.sendIssueReport(draft, { locale: 'en', version: '1.4.0', build: '65' }));
  assert.equal(client.readIssueDraft().description, draft.description); assert.equal(client.readIssueDraft().requestId, draft.requestId);
  const reloaded = load('mobile/src/lib/issueReport.ts', imports, globals).readIssueDraft(); assert.equal(reloaded.description, draft.description); assert.equal(reloaded.screenshot, null);
  result = {}; await assert.rejects(client.sendIssueReport(draft, { locale: 'en', version: '1.4.0', build: '65' }));
  result = { id: draft.requestId }; assert.equal(await client.sendIssueReport(draft, { locale: 'en', version: '1.4.0', build: '65' }), draft.requestId);
  assert.equal(requests.at(-1).options.body.requestId, requests[0].options.body.requestId);
  client.clearIssueDraft(); assert.equal(values.size, 0); assert.equal(client.readIssueDraft().description, '');
  const newer = { ...draft, requestId: randomUUID(), description: 'A newer unsent description' };
  client.saveIssueDraft(newer); client.clearIssueDraft(draft.requestId);
  assert.equal(client.readIssueDraft().description, newer.description, 'An older send completing after reopen must not erase newer work');
});

test('drafts never cross account, guest or logout boundaries; old requests cannot overwrite the new owner', () => {
  const values = new Map();
  const sessionStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const client = load('mobile/src/lib/issueReport.ts', { './api': {} }, { sessionStorage, window: { location: { hash: '#community' } } });
  const a = { ...client.readIssueDraft('community', 'account-a'), description: 'Account A private description', email: 'account-a@example.com', screenshot: 'data:image/jpeg;base64,cHJpdmF0ZQ==' };
  client.saveIssueDraft(a, 'account-a'); assert.equal(client.readIssueDraft('community', 'account-a').screenshot, a.screenshot);
  const restarted = load('mobile/src/lib/issueReport.ts', { './api': {} }, { sessionStorage, window: { location: { hash: '#community' } } });
  assert.equal(restarted.readIssueDraft('community', 'account-a').email, a.email);
  const b = client.readIssueDraft('community', 'account-b'); assert.equal(b.description, ''); assert.equal(b.email, ''); assert.equal(b.screenshot, null); assert.equal(values.size, 0);
  b.description = 'Account B own description'; client.saveIssueDraft(b, 'account-b');
  client.saveIssueDraft(a, 'account-a'); client.clearIssueDraft(a.requestId, 'account-a');
  assert.equal(client.readIssueDraft('community', 'account-b').description, b.description);
  const guest = client.readIssueDraft('community', null); assert.equal(guest.description, ''); assert.equal(guest.email, ''); assert.equal(guest.screenshot, null); assert.equal(values.size, 0);
  assert.equal(client.readIssueDraft('community', 'account-a').description, '', 'Leaving an owner purges its draft rather than restoring it for a different session');
});

test('support UI keeps failed text visible, retries the same draft and clears only after acknowledgement', async () => {
  let state = [], refs = [], cursor = 0, refCursor = 0, clearCount = 0, saved;
  let fail = true, sent = [];
  const jsx = (type, props) => ({ type, props });
  const initial = { ...input(), description: 'My route did not save after tapping.' };
  const hooks = { useEffect: () => {}, useId: () => 'report', useRef: value => { const i = refCursor++; return refs[i] ||= { current: value }; }, useState: initialValue => { const i = cursor++; if (!(i in state)) state[i] = typeof initialValue === 'function' ? initialValue() : initialValue; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; } };
  const component = load('mobile/src/components/SupportSheet.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../lib/config': { config: { appVersion: '1.4.0', buildNumber: '65' } },
    '../lib/i18n': { useI18n: () => ({ locale: 'en', copy: (_tr, en) => en }) },
    '../lib/native': {}, '../lib/support': {}, '../lib/api': { ApiError: Error },
    '../lib/issueReport': { readIssueDraft: () => initial, newIssueId: randomUUID, saveIssueDraft: draft => { saved = draft; }, clearIssueDraft: () => clearCount++, sendIssueReport: async draft => { sent.push(draft); if (fail) throw new Error('offline'); return draft.requestId; } },
    './Sheet': {}, './support-sheet.css': {},
  });
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  const render = () => { cursor = 0; refCursor = 0; return nodes(component.IssueReportForm({ screen: 'community' })); };
  const submit = async () => { render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve)); };
  await submit(); let view = render(); assert.ok(view.some(node => node.props?.role === 'alert')); assert.equal(clearCount, 0); assert.equal(saved.description, initial.description); assert.equal(view.find(node => node.type === 'textarea').props.value, initial.description);
  fail = false; await submit(); view = render(); assert.equal(clearCount, 1); assert.equal(sent[0].requestId, sent[1].requestId); assert.ok(view.some(node => node.props?.className === 'support-report-receipt')); assert.ok(!view.some(node => node.type === 'form'));
});
