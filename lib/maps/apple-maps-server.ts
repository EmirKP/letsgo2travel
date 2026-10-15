import { createHash, createPrivateKey, sign, type KeyObject } from 'node:crypto';

// Server API credentials never enter the browser-token endpoint or client config.
// https://developer.apple.com/documentation/applemapsserverapi/creating-and-using-tokens-with-maps-server-api
// https://developer.apple.com/documentation/applemapsserverapi/-v1-token
const BASE = 'https://maps-api.apple.com';
const unavailable = () => new Error('Apple Maps service unavailable');
type Signer = { fingerprint: string; key: KeyObject; team: string; id: string };
let signer: Signer | undefined;
let access: { fingerprint: string; token: string; issued: number; expires: number } | undefined;
let tokenPending: { fingerprint: string; promise: Promise<string> } | undefined;
let active = 0, windowStart = 0, requests = 0, cooldown = 0;
type SlotWaiter = { deadline: number; signal?: AbortSignal; resolve: (release: () => void) => void; reject: (error: Error) => void; cleanup: () => void };
const slotWaiters: SlotWaiter[] = [];

function checkTransportBudget(deadline: number, signal?: AbortSignal) {
  const now = Date.now();
  if (!Number.isFinite(deadline) || deadline <= now || signal?.aborted) throw unavailable();
  if (now - windowStart >= 60_000 || now < windowStart) { windowStart = now; requests = 0; }
  if (requests >= 60 || cooldown > now) throw unavailable();
}

function reserveSlot(): () => void {
  active++;
  let released = false;
  return () => {
    if (released) return;
    released = true; active--;
    drainSlots();
  };
}

function drainSlots() {
  while (slotWaiters.length) {
    const waiter = slotWaiters[0];
    try { checkTransportBudget(waiter.deadline, waiter.signal); }
    catch { slotWaiters.shift(); waiter.cleanup(); waiter.reject(unavailable()); continue; }
    if (active >= 2) return;
    slotWaiters.shift(); waiter.cleanup(); waiter.resolve(reserveSlot());
  }
}

function transportSlot(deadline: number, signal?: AbortSignal): Promise<() => void> {
  try { checkTransportBudget(deadline, signal); } catch { return Promise.reject(unavailable()); }
  if (active < 2 && !slotWaiters.length) return Promise.resolve(reserveSlot());
  // Two parallel itinerary days each use two leg workers. Queue their extra
  // work while retaining the existing two-connection provider ceiling.
  if (slotWaiters.length >= 4) return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const index = slotWaiters.indexOf(waiter);
      if (index < 0) return;
      slotWaiters.splice(index, 1); waiter.cleanup(); reject(unavailable());
    };
    const waiter: SlotWaiter = { deadline, signal, resolve, reject, cleanup() { clearTimeout(timer); signal?.removeEventListener('abort', cancel); } };
    slotWaiters.push(waiter);
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, deadline - Date.now());
    if (signal?.aborted) cancel();
  });
}

export function appleMapsServerConfigured(): boolean {
  return Boolean(process.env.APPLE_MAPS_TEAM_ID || process.env.APPLE_MAPS_KEY_ID || process.env.APPLE_MAPS_PRIVATE_KEY);
}

function configuredSigner(): Signer {
  try {
    const team = process.env.APPLE_MAPS_TEAM_ID, id = process.env.APPLE_MAPS_KEY_ID, raw = process.env.APPLE_MAPS_PRIVATE_KEY;
    if (!team || !/^[A-Z\d]{10}$/.test(team) || !id || !/^[A-Z\d]{10}$/.test(id) || !raw || raw.length > 4096) throw unavailable();
    const pem = raw.replace(/\\n/g, '\n').trim();
    if (!/^-----BEGIN PRIVATE KEY-----\r?\n/.test(pem) || !pem.endsWith('-----END PRIVATE KEY-----')) throw unavailable();
    const fingerprint = createHash('sha256').update(`${team}\0${id}\0${pem}`).digest('hex');
    if (signer?.fingerprint === fingerprint) return signer;
    const key = createPrivateKey(pem);
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw unavailable();
    signer = { fingerprint, key, team, id }; access = undefined;
    return signer;
  } catch { signer = undefined; access = undefined; throw unavailable(); }
}

/** An opaque cache boundary, used only inside server modules. */
export function appleMapsServerIdentity(): string { return configuredSigner().fingerprint; }

function authToken(value: Signer): string {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) throw unavailable();
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: value.id, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: value.team, iat: now, exp: now + 600, scope: 'server_api' })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key: value.key, dsaEncoding: 'ieee-p1363' });
  if (signature.length !== 64) throw unavailable();
  return `${unsigned}.${signature.toString('base64url')}`;
}

async function jsonBody(response: Response, limit: number): Promise<unknown> {
  if (!response.body || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) {
    void response.body?.cancel().catch(() => {}); throw unavailable();
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    void response.body.cancel().catch(() => {}); throw unavailable();
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw unavailable();
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function quotaDelay(response: Response): number {
  const retry = response.headers.get('retry-after') || '';
  const millis = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
  return Math.min(86_400_000, Math.max(60_000, Number.isFinite(millis) ? millis : 60_000));
}

/** Fixed Apple host, no redirects or retries; every upstream call shares the same budget. */
async function request(path: '/v1/token' | '/v1/directions' | '/v1/search', token: string, params: URLSearchParams, deadline: number, limit: number, signal?: AbortSignal): Promise<unknown> {
  const identity = appleMapsServerIdentity();
  const release = await transportSlot(deadline, signal);
  try { checkTransportBudget(deadline, signal); if (appleMapsServerIdentity() !== identity) throw unavailable(); }
  catch { release(); throw unavailable(); }
  const remaining = Math.min(8000, deadline - Date.now());
  if (remaining <= 0) { release(); throw unavailable(); }
  requests++;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let aborted: (() => void) | undefined;
  const url = new URL(path, BASE); url.search = params.toString();
  const work = (async () => {
    try {
      const response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error', cache: 'no-store', signal: controller.signal });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw unavailable(); }
      if (!response.ok) {
        if (path !== '/v1/token' && (response.status === 401 || response.status === 403) && access?.token === token) {
          // The next explicit attempt after cooldown must exchange fresh access.
          // A late rejection of an older token cannot erase a rotated token.
          access = undefined;
        }
        const delay = response.status === 429 ? quotaDelay(response) : response.status === 401 || response.status === 403 ? 300_000 : 5000;
        cooldown = Math.max(cooldown, Date.now() + delay);
        void response.body?.cancel().catch(() => {}); throw unavailable();
      }
      const value = await jsonBody(response, limit);
      if (controller.signal.aborted) throw unavailable();
      return value;
    } catch {
      // Set cooldown before releasing the slot so queued calls cannot start
      // between a failed transport/body and the public promise's rejection.
      if (!signal?.aborted) cooldown = Math.max(cooldown, Date.now() + 5000);
      throw unavailable();
    } finally { release(); }
  })();
  const timed = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, remaining);
    aborted = () => { controller.abort(); reject(unavailable()); };
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
  try { return await Promise.race([work, timed]); }
  catch { if (!signal?.aborted) cooldown = Math.max(cooldown, Date.now() + 5000); drainSlots(); throw unavailable(); }
  finally { clearTimeout(timer); if (aborted) signal?.removeEventListener('abort', aborted); }
  // A fetch ignoring abort retains its active slot until work settles, preventing
  // timeouts from opening an unbounded number of hidden transport connections.
}

async function accessToken(deadline: number): Promise<string> {
  const configured = configuredSigner(), now = Date.now();
  if (access?.fingerprint === configured.fingerprint && access.issued <= now && access.expires - now > 60_000) return access.token;
  if (tokenPending?.fingerprint === configured.fingerprint) return tokenPending.promise;
  const operation = (async () => {
    const raw = await request('/v1/token', authToken(configured), new URLSearchParams(), deadline, 16_384);
    const value = raw as Record<string, unknown> | null;
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.accessToken !== 'string'
      || value.accessToken.length > 8192 || !/^[A-Za-z\d_-]+\.[A-Za-z\d_-]+\.[A-Za-z\d_-]+$/.test(value.accessToken)
      || typeof value.expiresInSeconds !== 'number' || !Number.isSafeInteger(value.expiresInSeconds)
      || value.expiresInSeconds <= 60 || value.expiresInSeconds > 3600 || configuredSigner().fingerprint !== configured.fingerprint) throw unavailable();
    access = { fingerprint: configured.fingerprint, token: value.accessToken, issued: Date.now(), expires: Date.now() + value.expiresInSeconds * 1000 };
    return value.accessToken;
  })();
  const pending = { fingerprint: configured.fingerprint, promise: operation }; tokenPending = pending;
  try { return await operation; }
  catch { cooldown = Math.max(cooldown, Date.now() + 5000); throw unavailable(); }
  finally { if (tokenPending === pending) tokenPending = undefined; }
}

/** Returns provider JSON only. Both authorization tokens remain private to this module. */
export async function appleMapsDirections(params: URLSearchParams, deadline: number, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw unavailable();
  const identity = appleMapsServerIdentity();
  const token = await accessToken(deadline);
  if (appleMapsServerIdentity() !== identity || Date.now() >= deadline || signal?.aborted) throw unavailable();
  return request('/v1/directions', token, params, deadline, 2_000_000, signal);
}

/** Bounded official place search; shares the Maps token, request budget and cooldown. */
export async function appleMapsSearch(params: URLSearchParams, deadline: number, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw unavailable();
  const identity = appleMapsServerIdentity();
  const token = await accessToken(deadline);
  if (appleMapsServerIdentity() !== identity || Date.now() >= deadline || signal?.aborted) throw unavailable();
  return request('/v1/search', token, params, deadline, 500_000, signal);
}
