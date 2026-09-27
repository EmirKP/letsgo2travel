import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fixedNow = Date.parse('2026-09-27T08:00:00Z');
const owner = '10000000-0000-4000-8000-000000000001';
const otherOwner = '10000000-0000-4000-8000-000000000002';
const tripId = '20000000-0000-4000-8000-000000000001';
const query = { flightNumber: 'TK1985', date: '2026-09-28' };
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
function flight() {
  return {
    id: 'TK1985:IST:LHR:2026-09-28T09:00:00.000Z', flightNumber: 'TK1985', airline: 'Fixture Airline', source: 'AeroDataBox', fetchedAt: new Date(fixedNow).toISOString(),
    origin: { iata: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Türkiye', countryCode: 'TR', timeZone: 'Europe/Istanbul' },
    destination: { iata: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'United Kingdom', countryCode: 'GB', timeZone: 'Europe/London' },
    departureAt: '2026-09-28T09:00:00.000Z', arrivalAt: '2026-09-29T13:00:00.000Z', departureDate: '2026-09-28', departureTime: '12:00', arrivalDate: '2026-09-29', arrivalTime: '14:00',
  };
}

// Execute real routes, access checks and HMAC helpers with a fixed clock.
// Auth/DB/network boundaries are controlled; no live endpoints are reachable.
function harness(overrides = {}) {
  const env = { FLIGHT_LOOKUP_ENABLED: 'true', AERODATABOX_API_CHANNEL: 'rapidapi', AERODATABOX_API_KEY: 'NONFUNCTIONAL_PROVIDER_KEY',
    FLIGHT_LOOKUP_MODE: 'commercial', FLIGHT_LOOKUP_MONTHLY_LIMIT: '100', FLIGHT_LOOKUP_RECEIPT_SECRET: 'NONFUNCTIONAL_RECEIPT_SECRET_32_CHARACTERS', CRON_SECRET: 'NONFUNCTIONAL_CRON_SECRET', ...overrides };
  const state = { now: fixedNow, userId: owner, auth: true, retention: true, createError: false, admin: true, purgeError: false, purgeResult: 3, resolveRetention: null };
  const calls = { auth: 0, rpc: [], signals: [], admin: 0, network: 0 };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const timeout = ms => { const controller = new AbortController(); calls.signals.push({ ms, controller }); return controller.signal; };
  const db = { rpc: (name, args) => {
    calls.rpc.push({ name, args: args && plain(args) });
    return { abortSignal: () => {
      if (name === 'flight_lookup_retention_ready' || name === 'flight_lookup_refresh_ready') return state.retention === 'pending' ? new Promise(resolve => { state.resolveRetention = resolve; }) : Promise.resolve({ data: state.retention === true, error: state.retention === 'error' ? { message: env.AERODATABOX_API_KEY } : null });
      if (name === 'create_flight_lookup_trip_v3') return Promise.resolve({ error: state.createError ? { message: env.FLIGHT_LOOKUP_RECEIPT_SECRET } : null,
        data: { trip: { id: tripId, user_id: args.p_user, flight_lookup_managed: true, flight_lookup_expires_at: args.p_expires_at }, flight: args.p_flight, expiresAt: args.p_expires_at } });
      if (name === 'create_flight_lookup_trip') return Promise.resolve({ error: state.createError ? { message: env.FLIGHT_LOOKUP_RECEIPT_SECRET } : null,
        data: state.createError ? null : { id: tripId, user_id: args.p_user, flight_lookup_managed: true, flight_lookup_expires_at: args.p_expires_at, flight_pnr: args.p_flight_pnr, checklist_items: args.p_checklist_items } });
      if (name === 'purge_expired_trip_flight_data') return Promise.resolve({ data: state.purgeResult, error: state.purgeError ? { message: env.CRON_SECRET } : null });
      throw new Error(`Unexpected RPC: ${name}`);
    } };
  } };
  const overridesByImport = {
    '@/lib/authenticated-user': { requireAuthenticatedUser: async () => { calls.auth++; return state.auth ? { ok: true, user: { id: state.userId }, supabase: db } : { ok: false, response: Response.json({ error: 'login' }, { status: 401 }) }; } },
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => { calls.admin++; return state.admin ? db : null; } },
  };
  const context = vm.createContext({ Date: Clock, Buffer, URL, URLSearchParams, Response, Request, Headers, AbortSignal: { timeout },
    process: { env }, setTimeout, clearTimeout, fetch: () => { calls.network++; throw new Error('No live network in retention tests'); } });
  const cache = new Map();
  const load = filename => {
    let full = path.resolve(filename);
    if (!existsSync(full)) full = ['.ts', '.tsx', '.json'].map(extension => full + extension).find(existsSync) || full;
    if (cache.has(full)) return cache.get(full).exports;
    const output = { exports: {} }; cache.set(full, output);
    if (full.endsWith('.json')) return (output.exports = JSON.parse(readFileSync(full, 'utf8')));
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: full })(name => {
      if (Object.hasOwn(overridesByImport, name)) return overridesByImport[name];
      return name.startsWith('@/') ? load(name.slice(2)) : name.startsWith('.') ? load(path.resolve(path.dirname(full), name)) : require(name);
    }, output, output.exports);
    return output.exports;
  };
  const receipts = load('lib/flight-selection-receipt.ts');
  const api = load('app/api/cockpit/flight-trips/route.ts');
  const cleanup = load('app/api/cron/purge-flight-data/route.ts');
  const issue = (user = owner, value = flight()) => receipts.issueFlightReceipt(user, query, value, env.FLIGHT_LOOKUP_RECEIPT_SECRET);
  const body = selection => ({ receipt: selection.receipt, endDate: '2026-10-02', flightPnr: 'abc123', checklistItems: [{ id: 'pack', label: 'My note', completed: false, category: 'other' }], appLanguage: 'en' });
  const request = (value, version = '2') => new Request('https://our-app.example/api/cockpit/flight-trips', { method: 'POST', headers: { Authorization: 'Bearer UNIT_TEST_SESSION', ...(version === null ? {} : { 'X-Flight-Lookup-Version': version }) }, body: JSON.stringify(value) });
  return { env, state, calls, receipts, api, cleanup, issue, body, request };
}

test('Managed save requires commercial mode, v2 clients and authentication before any database work', async () => {
  for (const env of [{ FLIGHT_LOOKUP_ENABLED: 'false' }, { FLIGHT_LOOKUP_MODE: undefined }, { FLIGHT_LOOKUP_MODE: 'trial', FLIGHT_LOOKUP_TRIAL_USER_IDS: owner }, { FLIGHT_LOOKUP_RECEIPT_SECRET: 'short' }]) {
    const h = harness(env); const result = await h.api.POST(h.request({ receipt: null }));
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { protocol: 2, code: 'unavailable' });
    assert.equal(h.calls.auth, 0); assert.equal(h.calls.rpc.length, 0); assert.equal(h.calls.network, 0);
  }
  for (const version of [null, '1']) {
    const h = harness(); const result = await h.api.POST(h.request(h.body(h.issue()), version));
    assert.equal(result.status, 426); assert.deepEqual(await result.json(), { protocol: 2, code: 'update-required' }); assert.equal(h.calls.auth, 0); assert.equal(h.calls.rpc.length, 0);
  }
  const h = harness(); h.state.auth = false;
  const response = await h.api.POST(h.request(h.body(h.issue())));
  assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(h.calls.rpc.length, 0);
});

test('Receipts bind the owner, reject tampering and expire at ten minutes or scheduled departure', async () => {
  for (const scenario of ['owner', 'tamper', 'expired', 'missing']) {
    const h = harness(); const selection = h.issue(); const input = h.body(selection);
    if (scenario === 'owner') h.state.userId = otherOwner;
    if (scenario === 'tamper') {
      const [encoded, mac] = input.receipt.split('.'); const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      payload.flight.destination.city = 'FORGED_CITY'; input.receipt = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${mac}`;
    }
    if (scenario === 'expired') h.state.now += 10 * 60000;
    if (scenario === 'missing') input.receipt = null;
    const response = await h.api.POST(h.request(input));
    assert.equal(response.status, 409, scenario); assert.deepEqual(await response.json(), { protocol: 2, code: 'selection-expired' }); assert.equal(h.calls.rpc.length, 0);
  }
  const h = harness();
  const departingSoon = { ...flight(), departureAt: new Date(fixedNow + 2 * 60000).toISOString() };
  const selection = h.issue(owner, departingSoon); h.state.now += 2 * 60000;
  assert.equal(h.receipts.verifyFlightReceipt(selection.receipt, owner, h.env.FLIGHT_LOOKUP_RECEIPT_SECRET), null);
  assert.throws(() => h.issue(owner, { ...flight(), fetchedAt: new Date(h.state.now + 31000).toISOString() }), /stale-flight/);
});

test('V3 saves fresh airborne receipts through the v3 RPC and rechecks native entitlement', async () => {
  const h = harness();
  const source = new Date(fixedNow - 2 * 60000).toISOString();
  const value = { ...flight(), departureAt: new Date(fixedNow - 30 * 60000).toISOString(), nativeDisplayAllowed: true,
    progress: { phase: 'en-route', status: 'EnRoute', sourceUpdatedAt: source, freshUntil: new Date(fixedNow + 13 * 60000).toISOString(), freshness: 'fresh', departure: { revisedAt: null, revisedKind: null }, arrival: { revisedAt: null, revisedKind: null } } };
  const selection = h.issue(owner, value);
  assert.equal((await h.api.POST(h.request(h.body(selection), '2'))).status, 426);
  assert.equal(h.calls.rpc.length, 0);
  const response = await h.api.POST(h.request(h.body(selection), '3')); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.protocol, 3); assert.equal(data.flight.progress.phase, 'en-route'); assert.equal(data.flight.nativeDisplayAllowed, false);
  assert.deepEqual(h.calls.rpc.map(c => c.name), ['flight_lookup_refresh_ready', 'create_flight_lookup_trip_v3']);
  assert.equal(h.calls.rpc[1].args.p_flight.nativeDisplayAllowed, false);
  h.state.now = fixedNow + 10 * 60000;
  assert.equal((await h.api.POST(h.request(h.body(selection), '3'))).status, 409);
});

test('Saving uses signed flight fields and the original lifetime, and retries forward the same receipt identity', async () => {
  const h = harness(); const selection = h.issue(); h.state.now += 5 * 60000;
  const input = { ...h.body(selection), flight: { flightNumber: 'FORGED' }, userId: otherOwner, flightNumber: 'FORGED', destinationCity: 'FORGED_CITY', expiresAt: '2099-01-01T00:00:00Z', startDate: '2099-01-01' };
  for (let i = 0; i < 2; i++) {
    const response = await h.api.POST(h.request(input)); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const data = await response.json(); assert.equal(data.protocol, 2); assert.equal(data.flight.flightNumber, 'TK1985');
    assert.equal(data.expiresAt, selection.expiresAt); assert.equal(data.trip.id, tripId);
    assert.doesNotMatch(JSON.stringify(data), /FORGED|NONFUNCTIONAL/);
  }
  const writes = h.calls.rpc.filter(call => call.name === 'create_flight_lookup_trip');
  assert.equal(writes.length, 2); assert.equal(writes[0].args.p_receipt_id, writes[1].args.p_receipt_id);
  assert.equal(writes[0].args.p_user, owner); assert.equal(writes[0].args.p_flight_number, query.flightNumber); assert.equal(writes[0].args.p_start_date, query.date);
  assert.equal(writes[0].args.p_expires_at, selection.expiresAt); assert.equal(writes[0].args.p_fetched_at, flight().fetchedAt);
  assert.equal(Date.parse(writes[0].args.p_expires_at), fixedNow + 5 * 86400000);
  assert.equal(writes[0].args.p_flight_pnr, 'ABC123'); assert.deepEqual(writes[0].args.p_checklist_items, input.checklistItems);
  assert.deepEqual(writes[0].args.p_flight, flight()); assert.doesNotMatch(JSON.stringify(writes), /FORGED/); assert.equal(h.calls.network, 0);
});

test('Save rejects end dates before arrival, invalid user fields and oversized input before retention or creation', async () => {
  for (const change of [{ endDate: '2026-09-28' }, { endDate: '2026-09-26' }, { endDate: '2026-02-30' }, { endDate: '2099-01-01' }, { flightPnr: 'INVALID!*' }, { appLanguage: 'de' }, { checklistItems: {} }, { checklistItems: Array.from({ length: 51 }, () => ({})) }]) {
    const h = harness(); const result = await h.api.POST(h.request({ ...h.body(h.issue()), ...change }));
    assert.equal(result.status, 400); assert.deepEqual(await result.json(), { protocol: 2, code: 'invalid' }); assert.equal(h.calls.rpc.length, 0);
  }
  const h = harness(); const response = await h.api.POST(h.request({ ...h.body(h.issue()), padding: 'x'.repeat(30001) }));
  assert.equal(response.status, 400); assert.equal(h.calls.rpc.length, 0);
});

test('Missing retention, database errors and timed-out checks cannot create a trip or expose secrets', async () => {
  for (const change of [{ retention: false }, { retention: 'error' }, { createError: true }]) {
    const h = harness(); Object.assign(h.state, change);
    const response = await h.api.POST(h.request(h.body(h.issue())));
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { protocol: 2, code: 'unavailable' });
    assert.equal(h.calls.rpc.filter(call => call.name === 'create_flight_lookup_trip').length, change.createError ? 1 : 0);
  }
  const h = harness(); h.state.retention = 'pending';
  const response = h.api.POST(h.request(h.body(h.issue()))); await tick();
  h.calls.signals.find(item => item.ms === 5000).controller.abort();
  assert.equal((await response).status, 503);
  h.state.resolveRetention({ data: true, error: null }); await tick();
  assert.equal(h.calls.rpc.filter(call => call.name === 'create_flight_lookup_trip').length, 0);
});

test('Cleanup requires the bearer header, rejects URL secrets and fails closed on missing storage or invalid results', async () => {
  const missing = harness({ CRON_SECRET: undefined });
  assert.equal((await missing.cleanup.GET(new Request('https://our-app.example/api/cron/purge-flight-data'))).status, 503); assert.equal(missing.calls.admin, 0);
  for (const headers of [{}, { authorization: 'Bearer wrong' }]) {
    const h = harness(); const response = await h.cleanup.GET(new Request(`https://our-app.example/api/cron/purge-flight-data?secret=${h.env.CRON_SECRET}`, { headers }));
    assert.equal(response.status, 401); assert.equal(h.calls.admin, 0); assert.equal(h.calls.rpc.length, 0);
  }
  for (const change of [{ admin: false }, { purgeError: true }, { purgeResult: '3' }]) {
    const h = harness(); Object.assign(h.state, change);
    const response = await h.cleanup.GET(new Request('https://our-app.example/api/cron/purge-flight-data', { headers: { Authorization: `Bearer ${h.env.CRON_SECRET}` } }));
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { ok: false });
  }
  const h = harness(); const response = await h.cleanup.GET(new Request('https://our-app.example/api/cron/purge-flight-data', { headers: { Authorization: `Bearer ${h.env.CRON_SECRET}` } }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, removed: 3 }); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(h.calls.rpc, [{ name: 'purge_expired_trip_flight_data', args: undefined }]); assert.equal(h.calls.network, 0);
});
