import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { ensureJourneyApi, localApiAddress } from '../scripts/mobile-dev-api.mjs';

async function server(handler) {
  const http = createServer(handler);
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  return { http, origin: `http://127.0.0.1:${http.address().port}`, close: () => new Promise(resolve => http.close(resolve)) };
}
function ready(req, res) {
  assert.equal(req.url, '/api/travel-assistant/journey-plan');
  assert.equal(req.method, 'POST');
  assert.equal(req.headers.authorization, undefined);
  let body = ''; req.on('data', chunk => { body += chunk; });
  req.on('end', () => { assert.equal(body, '{}'); res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"code":"plan_invalid"}'); });
}
test('An existing journey API is verified and never owned or stopped by another preview', async () => {
  const api = await server(ready);
  try { const stop = await ensureJourneyApi(api.origin, () => assert.fail('must not spawn')); stop(); assert.equal(api.http.listening, true); }
  finally { await api.close(); }
});
test('A closed API port starts the server and waits for actual route readiness', async () => {
  const reserved = await server(ready); const origin = reserved.origin; await reserved.close();
  let started = 0, stopped = 0, http;
  const stop = await ensureJourneyApi(origin, ({ host, port }) => {
    started++; http = createServer(ready); setTimeout(() => http.listen(port, host), 40);
    return () => { stopped++; http.close(); };
  }, { timeoutMs: 2000 });
  assert.equal(started, 1); assert.equal(stopped, 0); assert.equal(http.listening, true);
  stop(); assert.equal(stopped, 1);
});
test('An unrelated listening server cannot masquerade as a working planner', async () => {
  const api = await server((_req, res) => { res.writeHead(200); res.end('{}'); });
  try { await assert.rejects(ensureJourneyApi(api.origin, () => assert.fail('must not replace server')), /expected route/); assert.equal(api.http.listening, true); }
  finally { await api.close(); }
});

test('Account-only planner readiness needs no account and generic unauthorized servers stay rejected', async () => {
  for (const code of ['plan_sign_in', 'unauthorized']) {
    const api = await server((_req, res) => { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code })); });
    try {
      const ready = ensureJourneyApi(api.origin, () => assert.fail('must not spawn'));
      if (code === 'plan_sign_in') (await ready)();
      else await assert.rejects(ready, /expected route/);
    } finally { await api.close(); }
  }
});
test('A failed startup cleans up its owned child and prevents a falsely ready preview', async () => {
  const reserved = await server(ready); const origin = reserved.origin; await reserved.close(); let stopped = 0;
  await assert.rejects(ensureJourneyApi(origin, () => () => { stopped++; }, { timeoutMs: 80 }), /did not become ready/);
  assert.equal(stopped, 1);
});
test('No override needs no local server; remote origins, credentials and paths are refused', async () => {
  const stop = await ensureJourneyApi('', () => assert.fail('must not spawn')); stop();
  for (const raw of ['https://127.0.0.1:3000', 'http://example.com', 'http://user:pass@localhost:3000', 'http://localhost:3000/api', 'http://localhost:3000/']) assert.throws(() => localApiAddress(raw), /loopback/);
  assert.equal(localApiAddress('http://[::1]:3000').host, '::1');
});
