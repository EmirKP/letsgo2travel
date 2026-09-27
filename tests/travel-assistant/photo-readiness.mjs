import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const sharp = require('sharp');
const { boundedJson } = require('../../lib/travel-assistant/http.ts');
const { validatePhotoGuide } = require('../../lib/travel-assistant/photo.ts');
const source = ts.transpileModule(readFileSync('app/api/travel-assistant/photo/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const validGuide = { title: 'Stone arch', observation: 'A stone arch is visible.', context: 'The location is uncertain.', uncertain: true };
const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#abc' } }).jpeg().toBuffer();
const request = (extra = {}) => new Request('http://local', { method: 'POST', body: JSON.stringify({ image: image.toString('base64'), locale: 'en', consent: true, ...extra }) });

function fixture(options = {}) {
  const calls = { probe: 0, quota: 0, ai: 0, userIds: [] };
  const rpc = (name, args) => {
    assert.equal(name, 'consume_travel_photo_quota');
    calls.userIds.push(args.p_user);
    const probe = args.p_user === null;
    calls[probe ? 'probe' : 'quota']++;
    const result = probe
      ? options.probe?.() ?? Promise.resolve({ data: false, error: null })
      : options.quota?.() ?? Promise.resolve({ data: true, error: null });
    result.abortSignal = () => result;
    return result;
  };
  const admin = { rpc };
  const imports = {
    sharp,
    '@google/genai': { GoogleGenAI: class { models = { generateContent: async () => { calls.ai++; return { text: JSON.stringify(validGuide) }; } }; } },
    '@/lib/authenticated-user': { requireAuthenticatedUser: async () => options.auth ? options.auth() : { ok: true, user: { id: 'fixture-user' }, supabase: admin } },
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => options.noAdmin ? null : admin },
    '@/lib/travel-assistant/http': { boundedJson },
    '@/lib/travel-assistant/photo': { validatePhotoGuide },
  };
  const testModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    Buffer, Response, Date,
    AbortSignal: { timeout: () => { const controller = new AbortController(); setTimeout(() => controller.abort(), 40).unref(); return controller.signal; } },
    process: { env: { AI_CAMERA_ENABLED: options.disabled ? 'false' : 'true', GEMINI_CAMERA_MODEL: 'fixture-model', GEMINI_API_KEY: 'NONFUNCTIONAL_FIXTURE' } },
  })(name => imports[name], testModule, testModule.exports);
  return { ...testModule.exports, calls };
}

test('Readiness is disabled without touching auth, quota or the model', async () => {
  const app = fixture({ disabled: true });
  const response = await app.GET();
  assert.deepEqual(await response.json(), { available: false, reason: 'disabled' });
  assert.equal(app.calls.probe, 0);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('Readiness fails closed for missing admin configuration and quota migration without exposing provider errors', async () => {
  for (const options of [{ noAdmin: true }, { probe: () => Promise.resolve({ error: { message: 'SECRET_SCHEMA_DIAGNOSTIC' }, data: null }) }]) {
    const result = await fixture(options).GET();
    assert.deepEqual(await result.json(), { available: false, reason: 'temporarily-unavailable' });
  }
});

test('Concurrent readiness checks share a non-consuming probe and cache its result', async () => {
  const app = fixture();
  const responses = await Promise.all([app.GET(), app.GET(), app.GET()]);
  for (const response of responses) assert.deepEqual(await response.json(), { available: true });
  await app.GET();
  assert.equal(app.calls.probe, 1);
  assert.deepEqual(app.calls.userIds, [null]);
  assert.equal(app.calls.quota, 0);
  assert.equal(app.calls.ai, 0);
});

test('Hanging auth times out and cannot consume quota or start analysis when it later resolves', async () => {
  let resolveAuth;
  const app = fixture({ auth: () => new Promise(resolve => { resolveAuth = resolve; }) });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    assert.equal((await app.POST(request())).status, 503);
    resolveAuth({ ok: true, user: { id: 'late' }, supabase: { rpc: () => { throw Error('must not execute'); } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.calls.quota, 0);
    assert.equal(app.calls.ai, 0);
  } finally { clearTimeout(keepAlive); }
});

test('Unavailable quota times out or throws without starting paid analysis', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    for (const quota of [() => new Promise(() => {}), () => Promise.reject(Error('DATABASE_DETAIL'))]) {
      const app = fixture({ quota });
      const response = await app.POST(request());
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { code: 'unavailable' });
      assert.equal(app.calls.ai, 0);
    }
  } finally { clearTimeout(keepAlive); }
});

test('Invalid image, locale and consent never consume a photo use', async () => {
  const app = fixture();
  for (const extra of [{ image: 'not-jpeg' }, { image: 'eHl6' }, { locale: 'fr' }, { consent: false }]) {
    assert.equal((await app.POST(request(extra))).status, 400);
  }
  assert.equal(app.calls.quota, 0);
  assert.equal(app.calls.ai, 0);
  const valid = await app.POST(request());
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), validGuide);
  assert.equal(app.calls.quota, 1);
  assert.equal(app.calls.ai, 1);
});
