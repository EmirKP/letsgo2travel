import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { isIP } from 'node:net';
import ts from 'typescript';

const pair = () => crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const first = pair(), second = pair();
const pem = key => key.export({ type: 'pkcs8', format: 'pem' });
const site = 'https://app.example.test';
function load(path, imports, context) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fixtureModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { URL, Buffer, Error, Response, Request, ...context })(name => {
    if (name in imports) return imports[name];
    throw Error(`Unexpected fixture import: ${name}`);
  }, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
function harness(overrides = {}) {
  let now = 1_800_000_000_000, signs = 0, keyReads = 0;
  const values = { NODE_ENV: 'test', APPLE_MAPS_ALLOWED_ORIGINS: site, APPLE_MAPS_TEAM_ID: 'TEAMID1234',
    APPLE_MAPS_KEY_ID: 'KEYID12345', APPLE_MAPS_PRIVATE_KEY: pem(first.privateKey), ...overrides };
  const env = new Proxy(values, { get(target, name) { if (name === 'APPLE_MAPS_PRIVATE_KEY') keyReads++; return target[name]; } });
  const clock = class extends Date { static now() { return now; } };
  const model = load('lib/maps/mapkit-token.ts', { 'node:net': { isIP }, 'node:crypto': { ...crypto, sign(...args) { signs++; return crypto.sign(...args); } } }, { process: { env }, Date: clock });
  const route = load('app/api/maps/token/route.ts', { '@/lib/maps/mapkit-token': model }, {});
  const post = (origin, headers = {}, body) => route.POST(new Request('https://api.example.test/api/maps/token', {
    method: 'POST', headers: { ...(origin === undefined ? {} : { Origin: origin }), ...headers }, ...(body ? { body } : {}),
  }));
  return { values, model, route, post, get signs() { return signs; }, get keyReads() { return keyReads; }, setTime(value) { now = value; }, advance(seconds) { now += seconds * 1000; }, get now() { return now; } };
}
function decode(token) {
  const [header, payload, signature] = token.split('.');
  return { header: JSON.parse(Buffer.from(header, 'base64url')), payload: JSON.parse(Buffer.from(payload, 'base64url')),
    signature: Buffer.from(signature, 'base64url'), unsigned: Buffer.from(`${header}.${payload}`) };
}
const verifies = (token, publicKey) => { const value = decode(token); return crypto.verify('sha256', value.unsigned, { key: publicKey, dsaEncoding: 'ieee-p1363' }, value.signature); };

test('MapKit JWT has a real ES256 P-256 signature, current Apple scope and exact ten-minute origin-bound claims', async () => {
  const h = harness(), response = h.post(site), result = await response.json(), jwt = decode(result.token);
  assert.equal(response.status, 200);
  assert.deepEqual(jwt.header, { alg: 'ES256', kid: 'KEYID12345', typ: 'JWT' });
  assert.deepEqual(jwt.payload, { iss: 'TEAMID1234', iat: h.now / 1000, exp: h.now / 1000 + 600, scope: 'mapkit_js', origin: site });
  assert.equal(jwt.signature.length, 64); assert.equal(verifies(result.token, first.publicKey), true); assert.equal(verifies(result.token, second.publicKey), false);
  assert.equal(result.expiresAt, new Date((jwt.payload.iat + 600) * 1000).toISOString());
  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'token']); assert.doesNotMatch(JSON.stringify(result), /BEGIN PRIVATE KEY|fingerprint/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Origin');
  assert.equal(response.headers.get('access-control-allow-origin'), site); assert.equal(response.headers.get('access-control-allow-credentials'), null);
});

test('Missing, null, malformed and unapproved Origin is rejected before reading keys; Host and body cannot forge it', async () => {
  const h = harness({ APPLE_MAPS_PRIVATE_KEY: 'private fixture marker' });
  for (const origin of [undefined, 'null', '*', 'https://evil.test', site + '/', site + '/path', site + '?x=1', site + '#hash',
    'https://APP.example.test', 'https://app.example.test:443', 'https://user@app.example.test', `${site},https://evil.test`, 'https://*.example.test',
    'http://app.example.test', 'http://192.168.1.2:5173', 'http://localhost.evil.test:5173']) {
    const response = h.post(origin, { Host: 'app.example.test', 'X-Forwarded-Host': 'app.example.test', 'X-Forwarded-Proto': 'https', Referer: site }, JSON.stringify({ origin: site }));
    assert.equal(response.status, 403, String(origin)); assert.equal((await response.json()).code, 'map_origin_forbidden');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(h.keyReads, 0); assert.equal(h.signs, 0);
});

test('Only explicit canonical allowlists work; broad, duplicate, malformed or excessive configurations fail closed', () => {
  for (const configured of [undefined, '', '*', 'https://*.example.test', `${site},`, `${site},${site}`, site + '/',
    `${site},http://untrusted.test`, Array.from({ length: 9 }, (_, i) => `https://site${i}.test`).join(','), 'x'.repeat(2501)]) {
    const h = harness({ APPLE_MAPS_ALLOWED_ORIGINS: configured });
    assert.equal(h.post(site).status, 503, String(configured)); assert.equal(h.signs, 0); assert.equal(h.keyReads, 0);
  }
  const eight = Array.from({ length: 8 }, (_, i) => `https://site${i}.test`);
  const h = harness({ APPLE_MAPS_ALLOWED_ORIGINS: eight.join(', ') });
  for (const origin of eight) assert.equal(h.post(origin).status, 200);
  assert.equal(h.post(site).status, 403);
});

test('HTTP is confined to explicitly allowlisted development loopback; production and lookalike hosts cannot use it', async () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173']) {
    const h = harness({ APPLE_MAPS_ALLOWED_ORIGINS: origin });
    assert.equal(decode((await h.post(origin).json()).token).payload.origin, origin);
    h.values.NODE_ENV = 'production'; assert.equal(h.post(origin).status, 403);
  }
  for (const origin of ['http://localhost.evil.test:5173', 'http://127.0.0.1.evil.test:5173', 'http://192.168.1.1:5173', 'http://0.0.0.0:5173']) {
    const h = harness({ APPLE_MAPS_ALLOWED_ORIGINS: origin }); assert.equal(h.post(origin).status, 403);
  }
  const production = harness({ NODE_ENV: 'production' }); assert.equal(production.post(site).status, 200);
});

test('Missing, malformed, public, RSA and wrong-curve keys return generic private errors without leaking crypto details', async () => {
  const wrongCurve = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  for (const overrides of [
    { APPLE_MAPS_TEAM_ID: undefined }, { APPLE_MAPS_TEAM_ID: 'wrong' }, { APPLE_MAPS_KEY_ID: 'lowercase1' }, { APPLE_MAPS_PRIVATE_KEY: undefined },
    { APPLE_MAPS_PRIVATE_KEY: 'private fixture marker' }, { APPLE_MAPS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nprivate fixture marker\n-----END PRIVATE KEY-----' },
    { APPLE_MAPS_PRIVATE_KEY: first.publicKey.export({ type: 'spki', format: 'pem' }) }, { APPLE_MAPS_PRIVATE_KEY: pem(wrongCurve.privateKey) },
    { APPLE_MAPS_PRIVATE_KEY: pem(rsa.privateKey) }, { APPLE_MAPS_PRIVATE_KEY: 'x'.repeat(4097) },
  ]) {
    const h = harness(overrides), response = h.post(site), body = await response.json();
    assert.equal(response.status, 503); assert.deepEqual(body, { code: 'map_token_unavailable', error: 'Map authorization is unavailable' });
    assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('access-control-allow-origin'), site);
    assert.equal(h.signs, 0); assert.doesNotMatch(JSON.stringify(body), /private fixture marker|PEM|decoder|BEGIN/);
  }
  const escaped = harness({ APPLE_MAPS_PRIVATE_KEY: pem(first.privateKey).replace(/\n/g, '\\n') });
  assert.equal(verifies((await escaped.post(site).json()).token, first.publicKey), true);
});

test('Per-origin cache stays stable until the final minute, then renews and never serves a future-issued token after a clock rollback', () => {
  const h = harness({ APPLE_MAPS_ALLOWED_ORIGINS: `${site},https://other.test` });
  const firstToken = h.model.createMapKitToken(site);
  assert.equal(h.model.createMapKitToken(site).token, firstToken.token); h.advance(539);
  assert.equal(h.model.createMapKitToken(site).token, firstToken.token); assert.equal(h.signs, 1);
  const other = h.model.createMapKitToken('https://other.test'); assert.equal(decode(other.token).payload.origin, 'https://other.test');
  h.advance(1); const renewed = h.model.createMapKitToken(site);
  assert.notEqual(renewed.token, firstToken.token); assert.equal(decode(renewed.token).payload.exp - decode(renewed.token).payload.iat, 600);
  h.advance(-10); const rollback = h.model.createMapKitToken(site); assert.notEqual(rollback.token, renewed.token);
  assert.equal(decode(rollback.token).payload.iat, h.now / 1000);
});

test('Private-key, key-id and team-id rotation invalidate cached tokens; removed configuration cannot revive an old signed result', () => {
  const h = harness(), original = h.model.createMapKitToken(site);
  h.values.APPLE_MAPS_PRIVATE_KEY = pem(second.privateKey);
  const rotated = h.model.createMapKitToken(site); assert.notEqual(rotated.token, original.token);
  assert.equal(verifies(rotated.token, second.publicKey), true); assert.equal(verifies(rotated.token, first.publicKey), false);
  h.values.APPLE_MAPS_KEY_ID = 'NEWKEY1234'; h.values.APPLE_MAPS_TEAM_ID = 'NEWTEAM123';
  const identity = h.model.createMapKitToken(site); assert.equal(decode(identity.token).header.kid, 'NEWKEY1234'); assert.equal(decode(identity.token).payload.iss, 'NEWTEAM123');
  h.values.APPLE_MAPS_PRIVATE_KEY = undefined; assert.throws(() => h.model.createMapKitToken(site), error => error.status === 503);
  h.values.APPLE_MAPS_PRIVATE_KEY = pem(second.privateKey); const restored = h.model.createMapKitToken(site);
  assert.notEqual(restored.token, identity.token);
  h.values.APPLE_MAPS_ALLOWED_ORIGINS = 'https://replacement.test'; assert.equal(h.post(site).status, 403);
});

test('Token cache is bounded while configured origins change; evicted origins require a fresh signature', () => {
  const h = harness(), original = h.model.createMapKitToken(site);
  for (let index = 0; index < 8; index++) {
    const origin = `https://site${index}.test`; h.values.APPLE_MAPS_ALLOWED_ORIGINS = origin; h.model.createMapKitToken(origin);
  }
  assert.equal(h.signs, 9); h.values.APPLE_MAPS_ALLOWED_ORIGINS = site;
  assert.notEqual(h.model.createMapKitToken(site).token, original.token); assert.equal(h.signs, 10);
});

test('CORS preflight grants only the exact permitted origin, POST and Content-Type without reading signing secrets', () => {
  const h = harness({ APPLE_MAPS_PRIVATE_KEY: undefined });
  const preflight = (origin, method = 'POST', extra = '') => h.route.OPTIONS(new Request('https://api.example.test/api/maps/token', {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method, ...(extra ? { 'Access-Control-Request-Headers': extra } : {}) },
  }));
  const response = preflight(site, 'POST', 'content-type'); assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), site); assert.equal(response.headers.get('access-control-allow-methods'), 'POST');
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal(preflight('https://evil.test').status, 403); assert.equal(preflight(site, 'GET').status, 403);
  assert.equal(preflight(site, 'POST', 'authorization').status, 403); assert.equal(h.keyReads, 0); assert.equal(h.signs, 0);
});
