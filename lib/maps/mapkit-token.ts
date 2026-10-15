import { createHash, createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { isIP } from 'node:net';

// Apple's current dynamic-token contract requires scope=mapkit_js and origin.
// https://developer.apple.com/documentation/mapkitjs/creating-a-maps-token
// https://developer.apple.com/documentation/applemapsserverapi/creating-and-using-tokens-with-maps-server-api
const TOKEN_SECONDS = 600;
const RENEW_SECONDS = 60;
const MAX_ORIGINS = 8;
type Token = { token: string; expiresAt: string };
type CachedToken = Token & { issued: number; expires: number };
const tokens = new Map<string, CachedToken>();
let signer: { fingerprint: string; privateKey: KeyObject; teamId: string; keyId: string } | null = null;

export class MapKitTokenError extends Error {
  readonly status: 403 | 503;
  readonly code: 'map_origin_forbidden' | 'map_token_unavailable';
  constructor(status: 403 | 503) {
    super(status === 403 ? 'Map origin is not allowed' : 'Map authorization is unavailable');
    this.status = status;
    this.code = status === 403 ? 'map_origin_forbidden' : 'map_token_unavailable';
  }
}

function canonicalOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 300 || value.includes('*')
    || [...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password) return null;
    const host = url.hostname;
    const ip = isIP(host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host);
    const domain = host.length <= 253 && host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
    if (!ip && !domain) return null;
    const loopback = host === 'localhost' || host === '[::1]' || ip === 4 && host.startsWith('127.');
    if (url.protocol === 'http:' && (process.env.NODE_ENV === 'production' || !loopback)) return null;
    return url.origin;
  } catch { return null; }
}

/** Only an explicit canonical Origin may select a scope. Host/proxy headers are irrelevant. */
export function allowedMapKitOrigin(value: unknown): string {
  const origin = canonicalOrigin(value);
  if (!origin) throw new MapKitTokenError(403);
  const configured = process.env.APPLE_MAPS_ALLOWED_ORIGINS;
  if (!configured || configured.length > 2500) throw new MapKitTokenError(503);
  const list = configured.split(',').map(item => item.trim());
  if (!list.length || list.length > MAX_ORIGINS || new Set(list).size !== list.length
    || list.some(item => canonicalOrigin(item) !== item)) throw new MapKitTokenError(503);
  if (!list.includes(origin)) throw new MapKitTokenError(403);
  return origin;
}

function configuredSigner() {
  try {
    const teamId = process.env.APPLE_MAPS_TEAM_ID, keyId = process.env.APPLE_MAPS_KEY_ID;
    const raw = process.env.APPLE_MAPS_PRIVATE_KEY;
    if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId) || !keyId || !/^[A-Z0-9]{10}$/.test(keyId)
      || !raw || raw.length > 4096) throw new Error('Unavailable');
    const pem = raw.replace(/\\n/g, '\n').trim();
    if (!pem.startsWith('-----BEGIN PRIVATE KEY-----\n') && !pem.startsWith('-----BEGIN PRIVATE KEY-----\r\n')
      || !pem.endsWith('-----END PRIVATE KEY-----')) throw new Error('Unavailable');
    const fingerprint = createHash('sha256').update(`${teamId}\0${keyId}\0${pem}`).digest('hex');
    if (signer?.fingerprint === fingerprint) return signer;
    const privateKey = createPrivateKey(pem);
    if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ec'
      || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Unavailable');
    tokens.clear();
    signer = { fingerprint, privateKey, teamId, keyId };
    return signer;
  } catch {
    signer = null;
    tokens.clear();
    throw new MapKitTokenError(503);
  }
}

/** Server-only signing. Each returned JWT is origin-scoped and valid for ten minutes. */
export function createMapKitToken(requestOrigin: unknown): Token {
  const origin = allowedMapKitOrigin(requestOrigin);
  const configured = configuredSigner();
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) throw new MapKitTokenError(503);
  const hit = tokens.get(origin);
  if (hit && hit.issued <= now && hit.expires - now > RENEW_SECONDS) return { token: hit.token, expiresAt: hit.expiresAt };
  try {
    const expires = now + TOKEN_SECONDS;
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: configured.keyId, typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: configured.teamId, iat: now, exp: expires, scope: 'mapkit_js', origin })).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const signature = sign('sha256', Buffer.from(unsigned), { key: configured.privateKey, dsaEncoding: 'ieee-p1363' });
    if (signature.length !== 64) throw new Error('Unavailable');
    const value = { token: `${unsigned}.${signature.toString('base64url')}`, expiresAt: new Date(expires * 1000).toISOString() };
    if (tokens.size >= MAX_ORIGINS && !tokens.has(origin)) tokens.delete(tokens.keys().next().value!);
    tokens.set(origin, { ...value, issued: now, expires });
    return value;
  } catch { throw new MapKitTokenError(503); }
}
