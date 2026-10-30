import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://letsgo2travel-testonly-emirkaanpolat34-9211s-projects.vercel.app';
const source = readFileSync('scripts/event-community-preview-relay.mjs', 'utf8').replace("import http from 'node:http';", '');
function harness({ writes = false, url = origin, upstream = async () => Response.json({ success: true }) } = {}) {
  let handler, bound, failed = false; const calls = [], logs = [];
  const server = { listen: (port, host, cb) => { bound = { port, host }; cb(); }, close: cb => cb() };
  const process = { env: { L2T_EVENT_COMMUNITY_PREVIEW_URL: url, VERCEL_OIDC_TOKEN: 'unit-test-only-oidc', L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES: String(writes) }, on() {}, exit: () => { failed = true; throw Error('exit'); } };
  try { vm.runInNewContext(source, { URL, Buffer, AbortSignal, console: { log: value => logs.push(value), error: value => logs.push(value) }, process, http: { createServer: cb => { handler = cb; return server; } }, fetch: async (...args) => { calls.push(args); return upstream(...args); } }); }
  catch (failure) { if (!failed) throw failure; }
  const request = async ({ method = 'GET', path = '/api/event-community', authorization = 'Bearer unit-test-only-user', body = '', headers = {} } = {}) => {
    const req = { method, url: path, headers: { authorization, ...headers }, async *[Symbol.asyncIterator]() { yield Buffer.from(body); } };
    let status, outputHeaders, payload;
    const res = { writeHead: (code, values) => { status = code; outputHeaders = values; }, end: value => { payload = JSON.parse(value); } };
    await handler(req, res); return { status, headers: outputHeaders, body: payload };
  };
  return { request, calls, logs, get bound() { return bound; }, failed };
}

test('protected preview relay binds loopback, exact event path and app auth; it does not expose server credentials', async () => {
  const h = harness(); assert.deepEqual(h.bound, { port: 3984, host: '127.0.0.1' });
  assert.equal((await h.request({ authorization: '' })).status, 401);
  assert.equal((await h.request({ path: '/api/profile' })).status, 404);
  assert.equal((await h.request({ path: '/api/event-community/other' })).status, 404);
  assert.equal((await h.request({ method: 'POST' })).status, 405); assert.equal(h.calls.length, 0);
  const response = await h.request({ path: '/api/event-community?eventId=ticketmaster%3Areal' });
  assert.equal(response.status, 200); assert.equal(h.calls[0][0], origin + '/api/event-community?eventId=ticketmaster%3Areal');
  assert.equal(h.calls[0][1].headers.Authorization, 'Bearer unit-test-only-user');
  assert.equal(h.calls[0][1].headers['x-vercel-trusted-oidc-idp-token'], 'unit-test-only-oidc');
  assert.equal(h.calls[0][1].redirect, 'manual');
  assert.ok(!JSON.stringify([response, h.logs]).includes('unit-test-only-oidc'));
  assert.ok(!JSON.stringify([response, h.logs]).includes('unit-test-only-user'));
});

test('explicit human-write mode forwards only authenticated bounded POST payloads to the same event handler', async () => {
  const h = harness({ writes: true });
  const body = JSON.stringify({ eventId: 'ticketmaster:real', action: 'join' });
  assert.equal((await h.request({ method: 'POST', body })).status, 200);
  assert.equal(h.calls[0][1].method, 'POST'); assert.equal(h.calls[0][1].body.toString(), body);
  assert.equal((await h.request({ method: 'POST', body: 'x'.repeat(10001) })).status, 413);
  assert.equal((await h.request({ method: 'DELETE' })).status, 405); assert.equal(h.calls.length, 1);
});

test('protection pages fail closed and the relay cannot be configured for another project, userinfo or an arbitrary host', async () => {
  const h = harness({ upstream: async () => new Response('Private protection page', { status: 302, headers: { location: 'https://vercel.com/login' } }) });
  const response = await h.request(); assert.equal(response.status, 503); assert.equal(response.body.code, 'preview_protection_unavailable');
  assert.ok(!JSON.stringify(response).includes('Private protection page'));
  for (const url of ['https://evil.example', 'https://other-project.vercel.app', origin + '/path', origin.replace('https://', 'https://user:private@')]) assert.equal(harness({ url }).failed, true);
});

test('JSON deployment protection cannot masquerade as an expired app session, while real app auth failures pass through',async()=>{
 const protectedPreview=harness({upstream:async()=>Response.json({error:{code:'401',message:'Protected deployment'}},{status:401})});
 const unavailable=await protectedPreview.request();
 assert.equal(unavailable.status,503);assert.equal(unavailable.body.code,'preview_protection_unavailable');
 assert.equal(JSON.stringify(unavailable).includes('Protected deployment'),false);
 const app=harness({upstream:async()=>Response.json({error:'Geçersiz oturum.'},{status:401})});
 const expired=await app.request();assert.equal(expired.status,401);assert.deepEqual(expired.body,{error:'Geçersiz oturum.'});
});

test('startup health checks reach application authentication without forwarding a user token or reading chats', async () => {
  const h = harness({ writes: true, upstream: async () => Response.json({ error: 'Oturum gerekli.' }, { status: 401 }) });
  const response = await h.request({ path: '/__event-community-health', authorization: '' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { service: 'event-community-preview', status: 'ready', writesEnabled: true });
  assert.equal(h.calls[0][0], origin + '/api/event-community');
  assert.equal(h.calls[0][1].headers.Authorization, undefined);
  assert.equal(h.calls[0][1].headers['x-vercel-trusted-oidc-idp-token'], 'unit-test-only-oidc');
  assert.equal(h.calls[0][1].redirect, 'manual');
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.ok(!JSON.stringify(response).includes('unit-test-only-oidc'));
  assert.equal((await h.request({ path: '/__event-community-health', method: 'POST' })).status, 405);
  assert.equal(h.calls.length, 1);
});

test('expired protection, an unrelated upstream and network failure cannot report a healthy chat connection', async () => {
  for (const upstream of [
    async () => new Response('Protection login', { status: 302, headers: { location: 'https://vercel.com/login' } }),
    async () => Response.json({ error: 'Upstream private diagnostic' }, { status: 401 }),
    async () => Response.json({ error: 'Oturum gerekli.' }, { status: 503 }),
    async () => { throw Error('Private network diagnostic'); },
  ]) {
    const h = harness({ upstream });
    const response = await h.request({ path: '/__event-community-health', authorization: '' });
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'preview_backend_unavailable');
    assert.ok(!JSON.stringify(response).includes('diagnostic'));
    assert.equal(h.calls.length, 1);
  }
});
