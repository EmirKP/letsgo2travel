import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureEventCommunityRelay, eventCommunityRelayConfig, eventCommunityRelayLaunch } from '../scripts/mobile-event-community-dev.mjs';

const previewOrigin = 'https://letsgo2travel-testonly-emirkaanpolat34-9211s-projects.vercel.app';
const settings = (origin, extra = {}) => ({ L2T_EVENT_COMMUNITY_DEV_API_URL: origin, L2T_EVENT_COMMUNITY_PREVIEW_URL: previewOrigin, L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES: 'true', ...extra });
async function server(handler) {
  const http = createServer(handler);
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  return { http, origin: `http://127.0.0.1:${http.address().port}`, close: () => new Promise(resolve => http.close(resolve)) };
}
function ready(req, res, writesEnabled = true) {
  assert.equal(req.method, 'GET'); assert.equal(req.url, '/__event-community-health');
  assert.equal(req.headers.authorization, undefined); assert.equal(req.headers['x-vercel-trusted-oidc-idp-token'], undefined);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ service: 'event-community-preview', status: 'ready', writesEnabled }));
}

test('No relay override or a deliberate local Next target needs no protected relay', async () => {
  for (const env of [{}, { L2T_EVENT_COMMUNITY_DEV_API_URL: '' }, { L2T_EVENT_COMMUNITY_DEV_API_URL: 'http://127.0.0.1:3000' }, { L2T_EVENT_COMMUNITY_DEV_API_URL: 'http://127.0.0.1:3100', L2T_MAPS_DEV_API_URL: 'http://127.0.0.1:3100' }]) {
    assert.equal(eventCommunityRelayConfig(env), null);
    (await ensureEventCommunityRelay(env, () => assert.fail('must not start an unused relay')))();
  }
  assert.throws(() => eventCommunityRelayConfig({ L2T_EVENT_COMMUNITY_DEV_API_URL: 'http://127.0.0.1:3984' }), /requires L2T_EVENT_COMMUNITY_PREVIEW_URL/);
});

test('Relay settings reject arbitrary origins, paths and invalid write modes without echoing values', () => {
  for (const raw of ['https://127.0.0.1:3984', 'http://evil.example', 'http://user:PRIVATE_CANARY@127.0.0.1:3984', 'http://127.0.0.1:3984/path', 'http://127.0.0.1:3984/']) {
    assert.throws(() => eventCommunityRelayConfig(settings(raw)), error => { assert.match(error.message, /loopback/); assert.ok(!error.message.includes('PRIVATE_CANARY')); return true; });
  }
  for (const origin of ['https://evil.example', previewOrigin + '/path', previewOrigin.replace('https://', 'https://user:PRIVATE_CANARY@'), 'http://letsgo2travel-testonly-emirkaanpolat34-9211s-projects.vercel.app']) {
    assert.throws(() => eventCommunityRelayConfig(settings('http://127.0.0.1:3984', { L2T_EVENT_COMMUNITY_PREVIEW_URL: origin })), error => { assert.match(error.message, /exact protected Preview/); assert.ok(!error.message.includes('PRIVATE_CANARY')); return true; });
  }
  assert.throws(() => eventCommunityRelayConfig(settings('http://127.0.0.1:3984', { L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES: 'yes' })), /true or false/);
  assert.throws(() => eventCommunityRelayConfig(settings('http://127.0.0.1:81')), /1024 to 65535/);
});

test('Relay launch uses only the existing offline CLI and validated repository team link', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'l2t-event-launch-'));
  try {
    mkdirSync(path.join(root, '.vercel')); const npmExecPath = path.join(root, 'npm-cli.js'); writeFileSync(npmExecPath, '// fixture; never executed');
    const projectFile = path.join(root, '.vercel/project.json');
    writeFileSync(projectFile, JSON.stringify({ projectName: 'letsgo2travel', orgId: 'team_testonly', projectId: 'prj_testonly' }));
    const command = eventCommunityRelayLaunch(eventCommunityRelayConfig(settings('http://127.0.0.1:3984')), { root, npmExecPath });
    assert.equal(command.file, npmExecPath);
    assert.deepEqual(command.args, ['exec', '--offline', '--no', '--', 'vercel', 'env', 'run', '--environment', 'development', '--scope', 'team_testonly', '--', process.execPath, path.join(root, 'scripts/event-community-preview-relay.mjs')]);
    assert.equal(command.env.L2T_EVENT_COMMUNITY_PREVIEW_URL, previewOrigin); assert.equal(command.env.L2T_EVENT_COMMUNITY_PROXY_PORT, '3984'); assert.equal(command.env.L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES, 'true');
    assert.throws(() => eventCommunityRelayLaunch(eventCommunityRelayConfig(settings('http://127.0.0.1:3984')), { root, npmExecPath: path.join(root, 'missing-npm-cli.js') }), /npm run dev:mobile/);
    writeFileSync(projectFile, JSON.stringify({ projectName: 'another-project', orgId: 'team_testonly', projectId: 'prj_testonly' }));
    assert.throws(() => eventCommunityRelayLaunch(eventCommunityRelayConfig(settings('http://127.0.0.1:3984')), { root, npmExecPath }), /existing letsgo2travel Vercel team link/);
  } finally {
    rmSync(path.join(root, '.vercel/project.json'), { force: true }); rmSync(path.join(root, 'npm-cli.js'), { force: true });
    rmdirSync(path.join(root, '.vercel')); rmdirSync(root);
  }
});

test('A healthy existing event relay is verified without borrowing user credentials or taking ownership', async () => {
  const api = await server(ready);
  try {
    const stop = await ensureEventCommunityRelay(settings(api.origin), () => assert.fail('must not replace an existing relay'));
    stop(); assert.equal(api.http.listening, true);
  } finally { await api.close(); }
});

test('An unrelated service, unhealthy protected session or mismatched mode cannot appear ready', async () => {
  for (const [status, body, expected] of [
    [200, { healthy: true }, /unexpected server/],
    [401, { error: 'Oturum gerekli.' }, /unexpected server/],
    [503, { code: 'preview_backend_unavailable' }, /Restart that relay to refresh/],
    [200, { service: 'event-community-preview', status: 'ready', writesEnabled: false }, /different read\/write setting/],
  ]) {
    const api = await server((_req, res) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); });
    try {
      await assert.rejects(ensureEventCommunityRelay(settings(api.origin), () => assert.fail('must not replace another server')), expected);
      assert.equal(api.http.listening, true);
    } finally { await api.close(); }
  }
});

test('A closed relay port starts once and waits for the real protected health result before proceeding', async () => {
  const reserved = await server(ready), origin = reserved.origin; await reserved.close();
  let started = 0, stopped = 0, http, checks = 0;
  const stop = await ensureEventCommunityRelay(settings(origin), ({ host, port }) => {
    started++; http = createServer((req, res) => {
      checks++;
      if (checks === 1) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"code":"preview_backend_unavailable"}'); }
      else ready(req, res);
    });
    setTimeout(() => http.listen(port, host), 40);
    return () => { stopped++; http.close(); };
  }, { timeoutMs: 3000 });
  assert.equal(started, 1); assert.equal(stopped, 0); assert.ok(checks >= 2); assert.equal(http.listening, true);
  stop(); assert.equal(stopped, 1);
});

test('Failed or cancelled relay startup cleans up its own child and never silently uses production', async () => {
  const reserved = await server(ready), origin = reserved.origin; await reserved.close(); let stopped = 0;
  await assert.rejects(ensureEventCommunityRelay(settings(origin), () => () => { stopped++; }, { timeoutMs: 80 }), /did not become ready/);
  assert.equal(stopped, 1);
  const shutdown = new AbortController(); const cancellation = new Error('test cancellation');
  const timer = setTimeout(() => shutdown.abort(cancellation), 40);
  try { await assert.rejects(ensureEventCommunityRelay(settings(origin), () => () => { stopped++; }, { timeoutMs: 1000, signal: shutdown.signal }), error => error === cancellation || error.name === 'AbortError'); }
  finally { clearTimeout(timer); }
  assert.equal(stopped, 2);
});
