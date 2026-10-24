import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const resetAt = () => `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`;
const snapshot = (limit = 3, used = 0, pending = false) => ({ limit, used, remaining: pending ? 0 : limit - used, pending, resetAt: resetAt(), timeZone: 'UTC' });
const signal = () => new AbortController().signal;
class PlanError extends Error {
  constructor(code, providerCapacity) { super(code); this.code = code; this.providerCapacity = providerCapacity; }
}

/** Frozen contract of the shipped version-one decoder, not the new implementation. */
function assertShippedV1Quota(quota) {
  assert.equal(quota.limit, 1);
  assert.ok(quota.used === 0 || quota.used === 1);
  assert.equal(quota.remaining, quota.pending || quota.used === 1 ? 0 : 1);
  assert.equal(typeof quota.pending, 'boolean');
  assert.equal(quota.timeZone, 'UTC');
  const reset = new Date(quota.resetAt);
  assert.ok(reset.getTime() > Date.now() && reset.getTime() <= Date.now() + 25 * 3_600_000);
  assert.equal(reset.getUTCHours() + reset.getUTCMinutes() + reset.getUTCSeconds() + reset.getUTCMilliseconds(), 0);
}

function fixture(options = {}) {
  const calls = [];
  let limit = options.limit ?? 3, used = options.used ?? 0, generated = 0;
  const cachedPlan = { summary: 'Cached complete trip', routes: [{ name: 'Bodrum', country: 'Türkiye', dailyPlan: ['Day 1', 'Day 2'], scores: { overall: 80 } }] };
  const receipts = new Map();
  const db = {
    rpc(name, args) {
      calls.push({ name, args });
      const promise = Promise.resolve().then(() => {
        const overridden = options.rpc?.(name, args);
        if (overridden !== undefined) return overridden;
        if (name === 'get_ai_route_quota') return { error: null, data: Object.hasOwn(options, 'quota') ? options.quota : snapshot(limit, used) };
        if (name === 'begin_ai_route_operation') {
          if (options.denied) return { error: null, data: { state: options.denied, quota: snapshot(limit, used, options.denied === 'pending'), retryAfterSeconds: 23 } };
          if (receipts.has(args.p_operation)) return { error: null, data: { state: 'succeeded', result: receipts.get(args.p_operation), quota: snapshot(limit, used) } };
          return { error: null, data: { state: used >= limit ? 'limit' : 'acquired', quota: snapshot(limit, used, used < limit) } };
        }
        if (name === 'complete_ai_route_operation') {
          if (args.p_result && !receipts.has(args.p_operation)) { receipts.set(args.p_operation, args.p_result); used++; }
          return { error: null, data: { ok: true, quota: snapshot(limit, used) } };
        }
        if (name === 'reserve_ai_route_provider_attempt') return { error: null, data: { allowed: true } };
        return { error: null, data: true };
      });
      promise.abortSignal = () => promise;
      return promise;
    },
    from() { return { select() { return { eq() { return { maybeSingle: async () => ({ data: { output_json: cachedPlan }, error: null }) }; } }; }, upsert: async () => ({ error: null }) }; },
  };
  const provider = {
    JourneyPlanError: PlanError, journeyPlanWait: async value => value,
    journeyPlanModel: () => ({}), parseJourneyPlanRequest: value => value,
    journeyPlanProviderError: error => error instanceof PlanError ? error : new PlanError('plan_failed'),
    createJourneyPlan: async () => { generated++; return { generatedBy: 'ai', summary: 'Complete result' }; },
  };
  const overrides = {
    './authenticated-user': { requireAuthenticatedUser: async () => ({ ok: true, user: { id: 'verified-account' }, supabase: db }) },
    './travel-assistant/journey-plan': provider, '@/lib/travel-assistant/journey-plan': provider,
    '@/lib/travel-assistant/http': { boundedJson: request => request.json() },
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => db },
    '@/lib/travel-assistant/journey-plan-groq': { groqJourneyModel: () => ({}), generateBoundedGroqJourneyJson: async () => { assert.fail('Cached legacy route must not call the provider'); } },
    '@google/genai': { GoogleGenAI: class { constructor() { assert.fail('Quota compatibility must not call paid AI'); } } },
    'next/server': { NextResponse: Response },
  };
  const context = vm.createContext({
    Error, Date, URL, Request, Response, Headers, AbortSignal, AbortController, setTimeout, clearTimeout,
    console: { warn() {}, error() {} }, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'compat-test-only', AI_PLAN_ENABLED: 'true', JOURNEY_AI_PROVIDER: 'groq', GROQ_API_KEY: 'not-a-real-key' } },
  });
  const cache = new Map();
  function load(filename, extra = {}) {
    let full = path.resolve(filename);
    if (!existsSync(full)) full += '.ts';
    if (cache.has(full)) return cache.get(full).exports;
    const result = { exports: {} }; cache.set(full, result);
    if (full.endsWith('.json')) { result.exports = JSON.parse(readFileSync(full, 'utf8')); return result.exports; }
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(name => Object.hasOwn(extra, name) ? extra[name] : Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('@/') ? load(name.slice(2)) : name.startsWith('.') ? load(path.resolve(path.dirname(full), name), extra) : require(name), result, result.exports);
    return result.exports;
  }
  const quota = load('lib/ai-route-quota.ts');
  const request = (version, { method = 'GET', body, id = randomUUID() } = {}) => new Request(`https://example.test/api/travel-assistant/journey-plan${version === undefined ? '' : `?quotaVersion=${encodeURIComponent(version)}`}`, { method, headers: { Authorization: 'Bearer test-session', ...(method === 'POST' ? { 'Idempotency-Key': id, 'Content-Type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body || {}) } : {}) });
  return { quota, load, request, calls, account: { supabase: db, user: { id: 'verified-account' } }, used: () => used, generated: () => generated,
    changeLimit(value) { limit = value; }, journey: () => load('app/api/travel-assistant/journey-plan/route.ts'), suggestions: () => load('app/api/ai-plan/route.ts') };
}

test('Raw and nested quota responses preserve full v2 snapshots and project every v1 state without mutating the body', async () => {
  const f = fixture();
  for (const limit of [1, 3]) for (let used = 0; used <= limit; used++) for (const pending of [false, true]) {
    const current = Object.freeze(snapshot(limit, used, pending));
    for (const nested of [false, true]) {
      const body = nested ? Object.freeze({ summary: 'Private route', quota: current }) : current;
      const before = JSON.stringify(body);
      const modernResponse = f.quota.aiRouteReply(body, 200, { 'X-Test': 'kept' }, f.request('2'));
      assert.equal(modernResponse.headers.get('cache-control'), 'private, no-store'); assert.equal(modernResponse.headers.get('x-test'), 'kept');
      assert.deepEqual(await modernResponse.json(), JSON.parse(before));
      for (const version of [undefined, '1', '3', '02', '']) {
        const response = f.quota.aiRouteReply(body, 200, {}, f.request(version));
        const payload = await response.json(), legacy = nested ? payload.quota : payload;
        assertShippedV1Quota(legacy);
        assert.equal(legacy.used, used >= limit ? 1 : 0); assert.equal(legacy.remaining, pending || used >= limit ? 0 : 1);
        assert.equal(legacy.pending, pending); assert.equal(legacy.resetAt, current.resetAt);
        if (nested) assert.equal(payload.summary, 'Private route');
      }
      assert.equal(JSON.stringify(body), before);
      assert.deepEqual(await f.quota.aiRouteReply(body).json(), JSON.parse(before), 'Direct helper callers without Request preserve their existing contract');
    }
  }
});

test('Quota-bearing errors negotiate the same contract while preserving status, Retry-After, UTC and error codes', async () => {
  const f = fixture();
  for (const [code, status, used, pending] of [['plan_limit', 429, 3, false], ['plan_pending', 409, 1, true], ['plan_busy', 429, 2, false]]) {
    for (const version of [undefined, '2']) {
      const current = snapshot(3, used, pending), error = new f.quota.AiRouteQuotaError(code, status, current, 23);
      const response = f.quota.aiRouteErrorReply(error, f.request(version)), payload = await response.json();
      assert.equal(response.status, status); assert.equal(response.headers.get('retry-after'), '23'); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(payload.code, code);
      if (version === '2') assert.deepEqual(payload.quota, current); else assertShippedV1Quota(payload.quota);
      assert.equal(payload.quota.resetAt, current.resetAt);
    }
  }
  for (const version of [undefined, '2']) {
    const response = f.quota.aiRouteErrorReply(new PlanError('plan_timeout'), f.request(version));
    assert.equal(response.status, 504); assert.deepEqual(await response.json(), { code: 'plan_timeout' });
  }
});

test('The authoritative quota reader accepts old and new DB snapshots during staging and rejects impossible counts', async () => {
  for (const limit of [1, 3]) for (let used = 0; used <= limit; used++) for (const pending of [false, true]) {
    const current = snapshot(limit, used, pending), f = fixture({ quota: current });
    assert.deepEqual(JSON.parse(JSON.stringify(await f.quota.readAiRouteQuota(f.account, signal()))), current);
  }
  const valid = snapshot();
  for (const invalid of [
    null, {}, { ...valid, limit: 0 }, { ...valid, limit: 2 }, { ...valid, limit: 4 },
    { ...valid, used: -1 }, { ...valid, used: 4 }, { ...valid, used: 1.5 }, { ...valid, used: '1' }, { ...valid, used: Number.NaN },
    { ...valid, remaining: 4 }, { ...valid, used: 1, remaining: 3 }, { ...valid, pending: true, remaining: 3 }, { ...valid, pending: 'false' },
    { ...valid, limit: 1, used: 2, remaining: 0 }, { ...valid, timeZone: 'Europe/Istanbul' }, { ...valid, resetAt: 'invalid' },
  ]) {
    const f = fixture({ quota: invalid });
    await assert.rejects(() => f.quota.readAiRouteQuota(f.account, signal()), error => error.code === 'plan_unavailable');
  }
});

test('Real journey GET and POST deliver negotiated snapshots on success, replay and quota denial', async () => {
  for (const version of [undefined, '2']) {
    const f = fixture(), route = f.journey();
    const initial = await route.GET(f.request(version)); assert.equal(initial.status, 200);
    const initialQuota = await initial.json(); if (version === '2') assert.equal(initialQuota.limit, 3); else assertShippedV1Quota(initialQuota);
    const id = randomUUID(), response = await route.POST(f.request(version, { method: 'POST', id }));
    assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.generatedBy, 'ai'); assert.equal(f.used(), 1);
    if (version === '2') assert.deepEqual(result.quota, snapshot(3, 1)); else { assertShippedV1Quota(result.quota); assert.equal(result.quota.remaining, 1); }
    const replay = await route.POST(f.request(version, { method: 'POST', id })); assert.deepEqual(await replay.json(), result); assert.equal(f.generated(), 1); assert.equal(f.used(), 1);
    const exhausted = fixture({ used: 3 }), denied = await exhausted.journey().POST(exhausted.request(version, { method: 'POST' }));
    assert.equal(denied.status, 429); const failure = await denied.json(); assert.equal(failure.code, 'plan_limit');
    if (version === '2') assert.deepEqual(failure.quota, snapshot(3, 3)); else { assertShippedV1Quota(failure.quota); assert.equal(failure.quota.remaining, 0); }
    assert.equal(exhausted.generated(), 0);
  }
});

test('Malformed quota data is never delivered as a route or a fabricated legacy snapshot at any API boundary', async () => {
  const invalid = { ...snapshot(3, 1), remaining: 3 };
  for (const version of [undefined, '2']) {
    const status = fixture({ quota: invalid }), response = await status.journey().GET(status.request(version));
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'plan_unavailable' });
    const admission = fixture({ rpc: name => name === 'begin_ai_route_operation' ? { error: null, data: { state: 'acquired', quota: invalid } } : undefined });
    const rejected = await admission.journey().POST(admission.request(version, { method: 'POST' }));
    assert.equal(rejected.status, 503); assert.equal(admission.generated(), 0); assert.deepEqual(await rejected.json(), { code: 'plan_unavailable' });
    const completion = fixture({ rpc: (name, args) => name === 'complete_ai_route_operation' && args.p_result ? { error: null, data: { ok: true, quota: invalid } } : undefined });
    const uncertain = await completion.journey().POST(completion.request(version, { method: 'POST' }));
    assert.equal(uncertain.status, 503); assert.equal(completion.generated(), 1); assert.deepEqual(await uncertain.json(), { code: 'plan_unavailable' });
    assert.equal(completion.calls.filter(call => call.name === 'complete_ai_route_operation' && call.args.p_result === null).length, 0, 'An uncertain successful commit is not refunded and potentially spent a second time');
  }
});

test('A shipped v1 client can consume three distinct successful routes and the fourth is rejected without extra generation', async () => {
  const f = fixture(), route = f.journey();
  for (let count = 1; count <= 3; count++) {
    const status = await route.GET(f.request()); assertShippedV1Quota(await status.json());
    const response = await route.POST(f.request(undefined, { method: 'POST', body: { choice: count } })); assert.equal(response.status, 200);
    const result = await response.json(); assertShippedV1Quota(result.quota); assert.equal(result.quota.remaining, count < 3 ? 1 : 0);
  }
  const fourth = await route.POST(f.request(undefined, { method: 'POST' })); assert.equal(fourth.status, 429); assertShippedV1Quota((await fourth.json()).quota);
  assert.equal(f.generated(), 3); assert.equal(f.used(), 3);
});

const suggestionsInput = { mode: 'fixed', destination: { code: 'BJV' }, origin: 'İstanbul', dayCount: 2 };
test('Real cached suggestions POST negotiates success, replay and admission errors through the same quota boundary', async () => {
  for (const version of [undefined, '2']) {
    const f = fixture(), route = f.suggestions(), id = randomUUID();
    const response = await route.POST(f.request(version, { method: 'POST', body: suggestionsInput, id })); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.success, true); assert.equal(result.isFallback, false); assert.equal(result.cached, true); assert.equal(f.used(), 1);
    if (version === '2') assert.deepEqual(result.quota, snapshot(3, 1)); else { assertShippedV1Quota(result.quota); assert.equal(result.quota.remaining, 1); }
    const replay = await route.POST(f.request(version, { method: 'POST', body: suggestionsInput, id })); assert.deepEqual(await replay.json(), result); assert.equal(f.used(), 1);
    const pending = fixture({ used: 1, denied: 'pending' });
    const denied = await pending.suggestions().POST(pending.request(version, { method: 'POST', body: suggestionsInput })); assert.equal(denied.status, 409);
    const failure = await denied.json(); assert.equal(failure.code, 'plan_pending');
    if (version === '2') assert.deepEqual(failure.quota, snapshot(3, 1, true)); else assertShippedV1Quota(failure.quota);
  }
});

test('A staged database upgrade retains an existing success and new mobile requests v2 while accepting either DB limit', async () => {
  const f = fixture({ limit: 1, used: 1 }), route = f.journey();
  assert.deepEqual(await (await route.GET(f.request('2'))).json(), snapshot(1, 1));
  f.changeLimit(3);
  assert.deepEqual(await (await route.GET(f.request('2'))).json(), snapshot(3, 1));
  const legacy = await (await route.GET(f.request())).json(); assertShippedV1Quota(legacy); assert.equal(legacy.remaining, 1);
  for (const limit of [1, 3]) {
    const requests = [], current = snapshot(limit, 1), client = fixture().load('mobile/src/lib/journeyPlanClient.ts', {
      './api': { requestJson: async (url, options) => { requests.push({ url, options }); return current; } },
      '../../../lib/travel-assistant/places': {}, './mapJourney': {},
    });
    const parsed = await client.loadJourneyPlanQuota('test-access-token', signal());
    assert.equal(parsed.limit, limit); assert.equal(parsed.used, 1); assert.equal(parsed.remaining, limit - 1);
    assert.equal(requests.length, 1); assert.match(requests[0].url, /[?&]quotaVersion=2(?:&|$)/); assert.equal(requests[0].options.headers.Authorization, 'Bearer test-access-token');
  }
});
