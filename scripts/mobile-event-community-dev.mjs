import net from 'node:net';
import path from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export function eventCommunityRelayConfig(env) {
  const raw = env.L2T_EVENT_COMMUNITY_DEV_API_URL?.trim();
  if (!raw) return null;
  let address;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.origin !== raw) throw Error();
    address = { origin: url.origin, host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 80) };
  } catch { throw new Error('L2T_EVENT_COMMUNITY_DEV_API_URL must be a canonical HTTP loopback origin.'); }
  const previewOrigin = env.L2T_EVENT_COMMUNITY_PREVIEW_URL?.trim();
  // The event route can intentionally use the normal local Next API instead.
  if (!previewOrigin && (raw === env.L2T_MAPS_DEV_API_URL?.trim() || address.port === 3000)) return null;
  if (!previewOrigin) throw new Error('A separate local event relay requires L2T_EVENT_COMMUNITY_PREVIEW_URL. Mobile preview was not started.');
  try {
    const upstream = new URL(previewOrigin);
    if (upstream.protocol !== 'https:' || upstream.origin !== previewOrigin
      || !/^letsgo2travel-[a-z0-9]+-emirkaanpolat34-9211s-projects\.vercel\.app$/.test(upstream.hostname)) throw Error();
  } catch { throw new Error('L2T_EVENT_COMMUNITY_PREVIEW_URL must be this project’s exact protected Preview origin.'); }
  if (!['127.0.0.1', 'localhost'].includes(address.host) || address.port < 1024 || address.port > 65535) throw new Error('The protected event relay requires an IPv4 loopback port from 1024 to 65535.');
  const writeSetting = env.L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES;
  if (writeSetting !== undefined && writeSetting !== 'true' && writeSetting !== 'false') throw new Error('L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES must be true or false.');
  return { ...address, previewOrigin, writesEnabled: writeSetting === 'true' };
}

/** Credentials stay in Vercel's child process; no token is read or persisted here. */
export function eventCommunityRelayLaunch(config, { root, npmExecPath = process.env.npm_execpath } = {}) {
  let project;
  try { project = JSON.parse(readFileSync(path.join(root, '.vercel/project.json'), 'utf8')); } catch { /* Report only the missing link, never file contents. */ }
  if (project?.projectName !== 'letsgo2travel' || !/^team_[A-Za-z0-9]+$/.test(project.orgId || '') || !/^prj_[A-Za-z0-9]+$/.test(project.projectId || '')) {
    throw new Error('The event relay requires this repository’s existing letsgo2travel Vercel team link.');
  }
  let validNpm = false;
  try { validNpm = typeof npmExecPath === 'string' && path.isAbsolute(npmExecPath) && path.basename(npmExecPath) === 'npm-cli.js' && statSync(npmExecPath).isFile(); } catch { /* No command or environment values are logged. */ }
  if (!validNpm) throw new Error('Start mobile preview with npm run dev:mobile so the existing Vercel CLI can refresh protected event access.');
  return {
    file: npmExecPath,
    args: ['exec', '--offline', '--no', '--', 'vercel', 'env', 'run', '--environment', 'development', '--scope', project.orgId, '--', process.execPath, path.join(root, 'scripts/event-community-preview-relay.mjs')],
    env: {
      ...process.env,
      L2T_EVENT_COMMUNITY_PREVIEW_URL: config.previewOrigin,
      L2T_EVENT_COMMUNITY_PROXY_PORT: String(config.port),
      L2T_EVENT_COMMUNITY_PREVIEW_ALLOW_WRITES: String(config.writesEnabled),
    },
  };
}

function listening({ host, port }) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(800, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function health(config, { signal, timeoutMs }) {
  const response = await fetch(`${config.origin}/__event-community-health`, {
    headers: { Accept: 'application/json' }, redirect: 'error',
    signal: AbortSignal.any([AbortSignal.timeout(Math.max(1, Math.min(10_000, timeoutMs))), ...(signal ? [signal] : [])]),
  });
  const body = (response.headers.get('content-type') || '').includes('application/json') ? await response.json().catch(() => null) : null;
  if (response.status === 200 && body?.service === 'event-community-preview' && body.status === 'ready') {
    if (body.writesEnabled !== config.writesEnabled) throw new Error('event-relay-mode-mismatch');
    return true;
  }
  if (response.status === 503 && ['preview_protection_unavailable', 'preview_backend_unavailable'].includes(body?.code)) return false;
  throw new Error('event-relay-incompatible');
}

export async function ensureEventCommunityRelay(env, start, { timeoutMs = 60_000, signal } = {}) {
  const config = eventCommunityRelayConfig(env);
  if (!config) return () => {};
  signal?.throwIfAborted();
  const existing = await listening(config);
  signal?.throwIfAborted();
  const stop = existing ? () => {} : start(config);
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      try {
        if (await health(config, { signal, timeoutMs: deadline - Date.now() })) return stop;
        if (existing) throw new Error('event-relay-existing-unavailable');
      } catch (error) {
        signal?.throwIfAborted();
        if (error.message === 'event-relay-mode-mismatch') throw new Error('The existing event relay uses a different read/write setting. Restart that relay before starting mobile preview.');
        if (error.message === 'event-relay-incompatible') throw new Error('The configured event relay port belongs to an unexpected server. Mobile preview was not started.');
        if (error.message === 'event-relay-existing-unavailable' || existing) throw new Error('The existing event relay cannot reach its protected Preview. Restart that relay to refresh development access.');
      }
      await delay(Math.min(250, Math.max(1, deadline - Date.now())), undefined, { signal });
    }
    throw new Error('Protected event access did not become ready. Mobile preview was not started; check the Vercel CLI sign-in and relay logs.');
  } catch (error) { stop(); throw error; }
}
