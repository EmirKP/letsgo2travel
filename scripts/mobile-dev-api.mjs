import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export function localApiAddress(raw) {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && url.origin === raw.trim()) return { origin: url.origin, host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 80) };
  } catch { /* Do not log environment values. */ }
  throw new Error('L2T_MAPS_DEV_API_URL must be a canonical HTTP loopback origin.');
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

/** An invalid request reaches validation only: no model call, quota or user data.
 * Do not accept a listening port as proof that the correct API is ready. */
export async function waitForJourneyApi(origin, { timeoutMs = 60_000, signal } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(`${origin}/api/travel-assistant/journey-plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(Math.min(10_000, Math.max(1, deadline - Date.now()))), ...(signal ? [signal] : [])]),
      });
      const body = await response.json().catch(() => null);
      if ((response.status === 400 && body?.code === 'plan_invalid')
        || (response.status === 401 && body?.code === 'plan_sign_in')) return;
      throw new Error('incompatible-local-api');
    } catch (error) {
      if (error.message === 'incompatible-local-api') throw new Error('Local journey API is not serving the expected route. Check the configured port and server logs.');
      signal?.throwIfAborted();
      await delay(Math.min(250, Math.max(1, deadline - Date.now())), undefined, { signal });
    }
  }
  throw new Error('Local journey API did not become ready. Mobile preview was not started; check the server logs.');
}

export async function ensureJourneyApi(raw, start, options = {}) {
  const address = localApiAddress(raw);
  if (!address) return () => {};
  const existing = await listening(address);
  const stop = existing ? () => {} : start(address);
  try { await waitForJourneyApi(address.origin, options); }
  catch (error) { stop(); throw error; }
  return stop;
}
