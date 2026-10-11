import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function harness() {
  const state = { now: Date.parse('2026-10-12T10:00:00Z'), rows: [], writes: 0, readError: false, writeError: false, beforeWrite: null, fetch: async () => { throw new Error('Unexpected network request'); } };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const db = { from: () => {
    const filters = []; let payload = null, single = false;
    const q = {
      select: () => q, maybeSingle: () => { single = true; return q; },
      eq: (key, value) => { filters.push(row => row[key] === value); return q; },
      is: (key, value) => { filters.push(row => value == null ? row[key] == null : row[key] === value); return q; },
      update: value => { payload = value; return q; },
      then: resolve => {
        if (payload) { state.writes++; state.beforeWrite?.(); }
        if (payload ? state.writeError : state.readError) return resolve({ data: null, error: { message: 'offline' } });
        const matched = state.rows.filter(row => filters.every(filter => filter(row)));
        if (payload) matched.forEach(row => Object.assign(row, payload));
        resolve({ data: single ? (matched[0] ? { ...matched[0] } : null) : matched.map(row => ({ ...row })), error: null });
      },
    }; return q;
  } };
  const cache = new Map(), env = { CRON_SECRET: 'fixture-signing-only', RESEND_API_KEY: 'fixture-no-real-provider' };
  const load = file => {
    let full = path.resolve(file); if (!existsSync(full)) full += '.ts';
    if (cache.has(full)) return cache.get(full).exports;
    const loaded = { exports: {} }; cache.set(full, loaded);
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
      Date: Clock, Buffer, URL, URLSearchParams, Request, Response, AbortSignal, process: { env },
      console: { error() {}, warn() {} }, fetch: (...args) => state.fetch(...args),
    })(name => {
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/lib/supabaseAdmin') return { getSupabaseAdmin: () => db };
      if (name === './structured-data') return { siteUrl: value => `https://example.test${value}` };
      if (name.startsWith('@/')) return load(name.slice(2));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(full), name));
      return require(name);
    }, loaded, loaded.exports);
    return loaded.exports;
  };
  const helpers = load('lib/price-alerts.ts'), route = load('app/api/flight-alerts/[id]/unsubscribe/route.ts');
  const row = { id: 'alert-1', user_id: null, email: 'private@example.test', departure_date: '2027-01-20', manage_token_hash: helpers.hashAlertToken('creation-token'), manage_token_expires_at: '2027-10-12T10:00:00Z', is_active: true, cancelled_at: null, status: 'active' };
  state.rows.push(row);
  const signed = () => helpers.createAlertUnsubscribeToken({ alertId: row.id, departureDate: row.departure_date, storedHash: row.manage_token_hash, expiresAt: row.manage_token_expires_at });
  const request = (method, token, extra = {}) => new Request(`https://example.test/api/flight-alerts/alert-1/unsubscribe${method === 'GET' ? `?token=${encodeURIComponent(token)}` : ''}`, {
    method, ...(method === 'POST' ? { body: new URLSearchParams({ token }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://example.test' } } : {}), ...extra,
  });
  const context = { params: Promise.resolve({ id: row.id }) };
  return { state, row, helpers, route, signed, request, context, load, env };
}

test('Guest signed links and legacy creation links show confirmation on GET; only POST cancels', async () => {
  for (const kind of ['signed', 'legacy']) {
    const h = harness(), token = kind === 'signed' ? h.signed() : 'creation-token';
    const preview = await h.route.GET(h.request('GET', token), h.context);
    assert.equal(preview.status, 200); assert.equal(h.state.writes, 0); assert.equal(h.row.is_active, true);
    const body = await preview.text(); assert.match(body, /<form method="post"/); assert.match(body, /Alarmı kapat/);
    assert.ok(!body.includes(h.row.email)); assert.ok(!body.includes(h.row.manage_token_hash));
    assert.equal(preview.headers.get('cache-control'), 'no-store'); assert.equal(preview.headers.get('referrer-policy'), 'no-referrer');
    assert.match(preview.headers.get('content-security-policy'), /form-action 'self'/);
    const confirm = await h.route.POST(h.request('POST', token), h.context);
    assert.equal(confirm.status, 200); assert.equal(h.row.is_active, false); assert.equal(h.row.status, 'cancelled');
    const closedAt = h.row.cancelled_at;
    h.state.now += 10000;
    assert.equal((await h.route.POST(h.request('POST', token), h.context)).status, 200);
    assert.equal(h.row.cancelled_at, closedAt, 'Repeated confirmation cannot extend the restore window');
  }
});

test('Signed cancellation does not confer full management access, and cannot target a different alert', async () => {
  const h = harness(), token = h.signed();
  assert.equal(h.helpers.verifyAlertToken({ plainToken: token, storedHash: h.row.manage_token_hash, expiresAt: h.row.manage_token_expires_at }), false);
  const other = { ...h.row, id: 'alert-other' }; h.state.rows.push(other);
  const result = await h.route.POST(h.request('POST', token), { params: Promise.resolve({ id: other.id }) });
  assert.equal(result.status, 400); assert.equal(h.state.writes, 0); assert.equal(other.is_active, true);
  assert.equal((await h.route.POST(h.request('POST', `${token}x`), h.context)).status, 400);
  assert.equal((await h.route.POST(h.request('POST', token.slice(0, -1) + 'é'), h.context)).status, 400);
});

test('Management expiry is unchanged; distant active trips and legacy null-hash rows still get cancel-only links', async () => {
  for (const noHash of [false, true]) {
    const h = harness(); h.row.manage_token_expires_at = '2025-01-01T00:00:00Z';
    if (noHash) h.row.manage_token_hash = null;
    const token = h.signed(); assert.ok(token);
    assert.equal(h.helpers.verifyAlertToken({ plainToken: 'creation-token', storedHash: h.row.manage_token_hash, expiresAt: h.row.manage_token_expires_at }), false);
    assert.equal((await h.route.GET(h.request('GET', 'creation-token'), h.context)).status, 400);
    assert.equal((await h.route.POST(h.request('POST', token), h.context)).status, 200);
    assert.equal(h.row.manage_token_expires_at, '2025-01-01T00:00:00Z'); assert.equal(h.row.is_active, false);
  }
});

test('Token generation rotation, departure change and cancellation expiry invalidate old links', async () => {
  for (const mutate of [
    h => { h.row.manage_token_hash = h.helpers.hashAlertToken('rotated'); },
    h => { h.row.manage_token_expires_at = '2028-10-12T10:00:00Z'; },
    h => { h.row.departure_date = '2027-01-21'; },
    h => { h.state.now = Date.parse('2027-01-22T00:00:00Z'); },
  ]) {
    const h = harness(), token = h.signed(); mutate(h);
    assert.equal((await h.route.POST(h.request('POST', token), h.context)).status, 400); assert.equal(h.state.writes, 0);
  }
});

test('Rotation between authorization and cancellation is fenced for hash, expiry and departure', async () => {
  for (const column of ['manage_token_hash', 'manage_token_expires_at', 'departure_date']) {
    const h = harness(), token = h.signed();
    h.state.beforeWrite = () => { h.row[column] = `changed-${column}`; };
    assert.equal((await h.route.POST(h.request('POST', token), h.context)).status, 409); assert.equal(h.row.is_active, true);
  }
});

test('Bad origin, oversized body, malformed token and storage failure never cancel an alert', async () => {
  const h = harness(), token = h.signed();
  assert.equal((await h.route.POST(h.request('POST', token, { headers: { origin: 'https://attacker.test', 'content-type': 'application/x-www-form-urlencoded' } }), h.context)).status, 403);
  assert.equal((await h.route.POST(h.request('POST', token, { body: 'x'.repeat(2049) }), h.context)).status, 400);
  assert.equal((await h.route.POST(h.request('POST', '"<script>alert(1)</script>'), h.context)).status, 400);
  h.state.readError = true; assert.equal((await h.route.POST(h.request('POST', token), h.context)).status, 503);
  h.state.readError = false; h.state.writeError = true; assert.equal((await h.route.POST(h.request('POST', token), h.context)).status, 503);
  assert.equal(h.row.is_active, true);
});

test('Email transport forwards the event idempotency key and identifies ambiguous failures', async () => {
  const h = harness(), mail = h.load('lib/mail.ts'); let request;
  h.state.fetch = async (url, options) => { request = { url, options }; return Response.json({ id: 'provider-1' }); };
  const params = { to: 'fixture@example.test', subject: 'Fixture', html: '<p>Fixture</p>', idempotencyKey: h.helpers.alertEmailIdempotencyKey('a', 'event') };
  assert.equal((await mail.sendMail(params)).success, true);
  assert.equal(request.options.headers['Idempotency-Key'], params.idempotencyKey);
  for (const [status, uncertain] of [[429, false], [422, false], [500, true], [503, true]]) {
    h.state.fetch = async () => Response.json({ message: 'fixture error' }, { status });
    const result = await mail.sendMail(params); assert.equal(result.success, false); assert.equal(result.deliveryUncertain, uncertain);
  }
  h.state.fetch = async () => { throw new Error('Lost acknowledgement'); };
  assert.equal((await mail.sendMail(params)).deliveryUncertain, true);
  h.state.fetch = async () => Response.json({});
  assert.equal((await mail.sendMail(params)).deliveryUncertain, true);
});
