import { config } from './config';
import { AppleMapKitError } from './appleMapKit';

const REFRESH_MARGIN_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 12_000;
type TokenClaims = { exp?: number; iat: number };
let cached: { key: string; token: string; expiresAt: number } | undefined;
let pending: { key: string; promise: Promise<string> } | undefined;

/** An explicit retry obtains fresh credentials; late abandoned fetches cannot repopulate this cache. */
export function invalidateJourneyMapAuthorization() {
  cached = undefined;
  pending = undefined;
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function decode(part: string): unknown {
  return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
}

function matchesOrigin(restriction: string, origin: string) {
  const browser = new URL(origin);
  return restriction.split(',').some(value => {
    const allowed = value.trim();
    if (/^https?:\/\//.test(allowed)) return allowed === origin;
    // Dashboard tokens describe domains; developer JWTs use the exact origin.
    // Do not stretch a bare domain restriction to custom ports or a suffix match.
    if (browser.port || !/^(?:\*\.)?[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(allowed)) return false;
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1).toLowerCase();
      return browser.hostname.toLowerCase().endsWith(suffix) && browser.hostname.length > suffix.length;
    }
    return allowed.toLowerCase() === browser.hostname.toLowerCase();
  });
}

function validateToken(token: unknown, origin: string, renewable: boolean): TokenClaims | null {
  if (typeof token !== 'string' || token.length > 8192 || token.includes('PRIVATE KEY')) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z\d_-]+$/.test(part))) return null;
  try {
    const header = decode(parts[0]), claims = decode(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (!object(header) || header.alg !== 'ES256' || header.typ !== 'JWT' || typeof header.kid !== 'string' || !/^[A-Z\d]{10}$/i.test(header.kid)
      || !object(claims) || claims.scope !== 'mapkit_js' || typeof claims.iss !== 'string' || !/^[A-Z\d]{10}$/i.test(claims.iss)
      || typeof claims.origin !== 'string' || !matchesOrigin(claims.origin, origin)
      || typeof claims.iat !== 'number' || !Number.isSafeInteger(claims.iat) || claims.iat < 0 || claims.iat > now + 60
      || atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')).length !== 64) return null;
    if (claims.exp !== undefined && (typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp)
      || claims.exp <= now + REFRESH_MARGIN_SECONDS || claims.exp <= claims.iat)) return null;
    if (renewable && (typeof claims.exp !== 'number' || claims.exp - claims.iat > 600 || claims.origin !== origin)) return null;
    return { iat: claims.iat, exp: claims.exp as number | undefined };
  } catch { return null; }
}

async function boundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new AppleMapKitError('unavailable');
  if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw new AppleMapKitError('unavailable');
  const reader = response.body.getReader();
  let bytes = 0;
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new AppleMapKitError('unavailable');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    // An oversized stream must be cancelled, without waiting for an uncooperative source.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function requestToken(endpoint: string, origin: string): Promise<{ token: string; expiresAt: number }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new AppleMapKitError('unavailable')); }, REQUEST_TIMEOUT_MS);
  });
  const work = (async () => {
    const response = await fetch(endpoint, { method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}', signal: controller.signal });
    const body = await boundedJson(response);
    if (!response.ok) {
      const code = object(body) ? body.code : null;
      if (response.status === 503 && code === 'map_token_unavailable') throw new AppleMapKitError('missing_configuration');
      throw new AppleMapKitError('unavailable');
    }
    if (!object(body) || typeof body.expiresAt !== 'string') throw new AppleMapKitError('unavailable');
    const claims = validateToken(body.token, origin, true);
    const expiresAt = Date.parse(body.expiresAt);
    if (!claims?.exp || !Number.isFinite(expiresAt) || expiresAt !== claims.exp * 1000) throw new AppleMapKitError('unavailable');
    return { token: body.token as string, expiresAt };
  })();
  try { return await Promise.race([work, deadline]); }
  catch (error) { throw error instanceof AppleMapKitError ? error : new AppleMapKitError('unavailable'); }
  finally { clearTimeout(timer); }
}

/** Stable MapKit callback: renews short-lived browser JWTs using server-only signing credentials. */
export async function getJourneyMapAuthorization(): Promise<string> {
  if (typeof window === 'undefined' || !/^https?:$/.test(window.location.protocol)) throw new AppleMapKitError('missing_configuration');
  const origin = window.location.origin;
  if (validateToken(config.appleMapsToken, origin, false)) return config.appleMapsToken;
  let endpoint: string;
  try {
    const url = new URL(`${config.apiBaseUrl.replace(/\/$/, '')}/api/maps/token`, origin);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('Invalid endpoint');
    endpoint = url.href;
  } catch { throw new AppleMapKitError('missing_configuration'); }
  const key = `${origin}\n${endpoint}`;
  if (cached?.key === key && cached.expiresAt - Date.now() > REFRESH_MARGIN_SECONDS * 1000) return cached.token;
  if (pending?.key === key) return pending.promise;
  const state = { key, promise: Promise.resolve('') };
  state.promise = requestToken(endpoint, origin).then(result => {
    // A late request for an old origin/configuration cannot replace the current cache.
    if (pending === state) cached = { key, ...result };
    return result.token;
  }).finally(() => { if (pending === state) pending = undefined; });
  pending = state;
  return state.promise;
}
