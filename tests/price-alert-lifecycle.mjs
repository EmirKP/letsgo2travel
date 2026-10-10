import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function harness() {
  const state = { now: Date.parse('2026-10-11T01:00:00Z'), user: { id: 'owner', email: 'owner@example.test' }, rows: [], mutationError: false, beforeUpdate: null };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const db = {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: () => {
      const filters = []; let op = 'select', payload, single = false, count = false;
      const q = {
        select: (_, options) => { count = options?.count === 'exact'; return q; },
        single: () => { single = true; return q; },
        eq: (key, value) => { filters.push(row => row[key] === value); return q; },
        is: (key, value) => { filters.push(row => value === null ? row[key] == null : row[key] === value); return q; },
        or: () => { filters.push(row => row.status == null || row.status !== 'cancelled'); return q; },
        in: (key, values) => { filters.push(row => values.includes(row[key])); return q; },
        order: () => q, limit: () => q,
        update: value => { op = 'update'; payload = value; return q; },
        insert: value => { op = 'insert'; payload = value; return q; },
        then: resolve => {
          if (op === 'update') state.beforeUpdate?.();
          if (state.mutationError && op !== 'select') return resolve({ error: { message: 'database unavailable' }, data: null });
          let rows = state.rows.filter(row => filters.every(fn => fn(row)));
          if (op === 'update') rows.forEach(row => Object.assign(row, payload));
          if (op === 'insert') { const row = { id: `new-${state.rows.length}`, is_active: true, cancelled_at: null, ...payload }; state.rows.push(row); rows = [row]; }
          resolve({ data: single ? (rows[0] ? { ...rows[0] } : null) : rows.map(row => ({ ...row })), count: count ? rows.length : undefined, error: null });
        },
      };
      return q;
    },
  };
  const cache = new Map();
  const load = filename => {
    let full = path.resolve(filename); if (!existsSync(full)) full += '.ts';
    if (cache.has(full)) return cache.get(full).exports;
    const result = { exports: {} }; cache.set(full, result);
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Date: Clock, Intl, Buffer, URL, URLSearchParams, process: { env: {} }, console })(name => {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
      if (name === '@/lib/supabaseAdmin') return { getSupabaseAdmin: () => db };
      if (name === '@/lib/mail') return { sendMailAndLog: async () => ({ success: true }), generateAlertCreatedEmailHtml: () => '' };
      if (name === './structured-data') return { siteUrl: path => `https://example.test${path}` };
      if (name.startsWith('@/')) return load(name.slice(2));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(full), name));
      return require(name);
    }, result, result.exports);
    return result.exports;
  };
  const list = load('app/api/flight-alerts/route.ts'), item = load('app/api/flight-alerts/[id]/route.ts');
  const request = (method, body) => new Request('https://example.test/api/flight-alerts/a1', { method, headers: { Authorization: 'Bearer fixture' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const params = { params: Promise.resolve({ id: 'a1' }) };
  const alert = overrides => ({ id: 'a1', user_id: 'owner', email: 'owner@example.test', departure_date: '2026-11-10', status: 'active', is_active: true, notify_email: true, notify_push: false, cancelled_at: null, ...overrides });
  return { state, db, list, item, request, params, alert, load };
}

test('Deleting persists across refresh and reload; stale cron status cannot resurrect a tombstone', async () => {
  const h = harness(); h.state.rows = [h.alert()];
  const result = await h.item.DELETE(h.request('DELETE'), h.params);
  assert.equal(result.status, 200); assert.equal(h.state.rows[0].status, 'cancelled');
  for (const status of ['cancelled', 'active', 'triggered']) {
    h.state.rows[0].status = status;
    const listed = await h.list.GET(h.request('GET'));
    assert.deepEqual((await listed.json()).data, []);
    assert.match(listed.headers.get('cache-control'), /no-store/);
  }
});

test('Legacy cancelled rows with no timestamp are also hidden', async () => {
  const h = harness(); h.state.rows = [h.alert({ status: 'cancelled' }), h.alert({ id: 'a2' })];
  assert.deepEqual((await (await h.list.GET(h.request('GET'))).json()).data.map(row => row.id), ['a2']);
});

test('Failed deletion is a real failure and preserves the saved alert', async () => {
  const h = harness(); h.state.rows = [h.alert()]; h.state.mutationError = true;
  assert.equal((await h.item.DELETE(h.request('DELETE'), h.params)).status, 500);
  assert.equal(h.state.rows[0].status, 'active');
});

test('Undo restores owner alert; repeated deletion does not extend the restore window', async () => {
  const h = harness(); h.state.rows = [h.alert()];
  await h.item.DELETE(h.request('DELETE'), h.params);
  const deletedAt = h.state.rows[0].cancelled_at;
  h.state.now += 5_000;
  await h.item.DELETE(h.request('DELETE'), h.params);
  assert.equal(h.state.rows[0].cancelled_at, deletedAt);
  const restored = await h.item.PATCH(h.request('PATCH', { restore: true, is_active: true, timeZone: 'Europe/Istanbul' }), h.params);
  assert.equal(restored.status, 200); assert.equal(h.state.rows[0].cancelled_at, null); assert.equal(h.state.rows[0].is_active, true);
  assert.equal((await (await h.list.GET(h.request('GET'))).json()).data.length, 1);
});

test('Expired undo and normal PATCH cannot resurrect a deleted row', async () => {
  const h = harness(); h.state.rows = [h.alert()];
  await h.item.DELETE(h.request('DELETE'), h.params); h.state.now += 61_000;
  assert.equal((await h.item.PATCH(h.request('PATCH', { restore: true, is_active: true }), h.params)).status, 409);
  assert.equal((await h.item.PATCH(h.request('PATCH', { is_active: true }), h.params)).status, 410);
  assert.equal(h.state.rows[0].status, 'cancelled');
});

test('A delete between authorization and PATCH is fenced', async () => {
  const h = harness(); h.state.rows = [h.alert()];
  h.state.beforeUpdate = () => Object.assign(h.state.rows[0], { status: 'cancelled', is_active: false, cancelled_at: new Date(h.state.now).toISOString() });
  assert.equal((await h.item.PATCH(h.request('PATCH', { notify_email: false, notify_push: true }), h.params)).status, 409);
  assert.equal(h.state.rows[0].status, 'cancelled'); assert.equal(h.state.rows[0].notify_email, true);
});

test('Expired departures cannot resume; undo can recover them as inactive history', async () => {
  const h = harness(); h.state.rows = [h.alert({ departure_date: '2026-10-10', is_active: false, status: 'paused' })];
  assert.equal((await h.item.PATCH(h.request('PATCH', { is_active: true, timeZone: 'Europe/Istanbul' }), h.params)).status, 409);
  await h.item.DELETE(h.request('DELETE'), h.params);
  assert.equal((await h.item.PATCH(h.request('PATCH', { restore: true, is_active: false }), h.params)).status, 200);
  assert.equal(h.state.rows[0].is_active, false);
});

test('Timezone-aware resume permits today in the user timezone; invalid zones fail', async () => {
  const h = harness(); h.state.rows = [h.alert({ departure_date: '2026-10-10', is_active: false, status: 'paused' })];
  assert.equal((await h.item.PATCH(h.request('PATCH', { is_active: true, timeZone: 'America/Los_Angeles' }), h.params)).status, 200);
  assert.equal((await h.item.PATCH(h.request('PATCH', { is_active: true, timeZone: 'made-up' }), h.params)).status, 400);
});

test('Other users cannot delete, restore or change an alert', async () => {
  const h = harness(); h.state.rows = [h.alert()]; h.state.user.id = 'other';
  assert.equal((await h.item.DELETE(h.request('DELETE'), h.params)).status, 403);
  assert.equal((await h.item.PATCH(h.request('PATCH', { is_active: false }), h.params)).status, 403);
  assert.equal((await h.item.PATCH(h.request('PATCH', { restore: true }), h.params)).status, 403);
  assert.equal(h.state.rows[0].status, 'active');
});

test('New alert is immediately listed, pause/resume persists, and last channel cannot be disabled', async () => {
  const h = harness();
  const created = await h.list.POST(h.request('POST', { originCode: 'IST', destinationCode: 'LHR', departureDate: '2026-11-10', notifyEmail: true, notifyPush: false, timeZone: 'Europe/Istanbul' }));
  assert.equal(created.status, 200);
  h.state.rows[0].id = 'a1';
  assert.equal((await (await h.list.GET(h.request('GET'))).json()).data.length, 1);
  assert.equal((await h.item.PATCH(h.request('PATCH', { notify_email: false }), h.params)).status, 400);
  assert.equal((await h.item.PATCH(h.request('PATCH', { is_active: false }), h.params)).status, 200);
  assert.equal(h.state.rows[0].status, 'paused');
  assert.equal((await h.item.PATCH(h.request('PATCH', { is_active: true }), h.params)).status, 200);
  assert.equal(h.state.rows[0].status, 'active');
});

test('Global alert preferences default only on missing schema/row; a read failure never bypasses opt-out', async () => {
  const { priceAlertPreferenceReader } = harness().load('lib/price-alert-preferences.ts');
  for (const [error, expected] of [[null, true], [{ code: '42P01' }, true], [{ code: 'PGRST205' }, true], [{ code: 'network' }, false], [{ code: '42501' }, false]]) {
    let queries = 0;
    const db = { from: () => { queries++; const query = { select: () => query, eq: () => query, limit: async () => ({ data: [], error }) }; return query; } };
    const read = priceAlertPreferenceReader(db);
    const prefs = await read('owner');
    assert.equal(prefs.email, expected); assert.equal(prefs.push, expected);
    await read('owner'); assert.equal(queries, 1, 'One read per user in each cron run');
  }
});
