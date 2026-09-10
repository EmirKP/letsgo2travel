import {
  createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey,
  randomBytes, sign, verify, type JsonWebKey,
} from "node:crypto";
import type { User } from "@supabase/supabase-js";

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_DELETION_CALLBACK_PATH = "/api/account/apple-deletion/callback";

export type AppleDeletionConfig = {
  clientId: string; teamId: string; keyId: string; privateKey: string;
  redirectUri: string; encryptionKey: Buffer;
};

/** These are server credentials, never NEXT_PUBLIC or user metadata. */
export function appleDeletionConfig(env: NodeJS.ProcessEnv = process.env): AppleDeletionConfig | null {
  try {
    const clientId = env.APPLE_SIGN_IN_CLIENT_ID?.trim();
    const teamId = env.APPLE_SIGN_IN_TEAM_ID?.trim();
    const keyId = env.APPLE_SIGN_IN_KEY_ID?.trim();
    const privateKey = env.APPLE_SIGN_IN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
    const redirectUri = env.APPLE_DELETION_REDIRECT_URI?.trim();
    const encryptionKey = env.APPLE_DELETION_ENCRYPTION_KEY?.trim();
    if (!clientId || !/^[a-zA-Z0-9.-]{3,255}$/.test(clientId)
      || !teamId || !/^[A-Z0-9]{10}$/.test(teamId)
      || !keyId || !/^[A-Z0-9]{10}$/.test(keyId)
      || !privateKey || !redirectUri || !encryptionKey || !/^[a-fA-F0-9]{64}$/.test(encryptionKey)) return null;
    const callback = new URL(redirectUri);
    if (callback.protocol !== "https:" || callback.username || callback.password || callback.port
      || callback.search || callback.hash || callback.pathname !== APPLE_DELETION_CALLBACK_PATH) return null;
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return null;
    return { clientId, teamId, keyId, privateKey, redirectUri, encryptionKey: Buffer.from(encryptionKey, "hex") };
  } catch { return null; }
}

export function appleSubject(user: User): string | null {
  const identity = user.identities?.find((item) => item.provider === "apple");
  if (!identity) return null;
  const subject: unknown = identity.identity_data?.sub ?? identity.id;
  return typeof subject === "string" && subject.length > 0 && subject.length < 256 ? subject : null;
}

export function requiresAppleRevocation(user: User): boolean {
  return user.identities?.some((item) => item.provider === "apple") === true
    || user.app_metadata?.provider === "apple"
    || (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes("apple"));
}

export function appleIdentitySignedInAt(user: User): number {
  const value = user.identities?.find((item) => item.provider === "apple")?.last_sign_in_at;
  return value ? Date.parse(value) || 0 : 0;
}

export function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function appleDeletionRandom(): string { return randomBytes(32).toString("base64url"); }

/** Call only after getUser(bearer) has verified this Supabase token. */
export function verifiedSessionId(bearer: string): string | null {
  try {
    const claims = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString());
    return typeof claims.session_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id)
      ? claims.session_id : null;
  } catch { return null; }
}

export function appleClientSecret(config: AppleDeletionConfig, now = Date.now()): string {
  const seconds = Math.floor(now / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: config.keyId })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ iss: config.teamId, sub: config.clientId, aud: APPLE_ISSUER, iat: seconds, exp: seconds + 300 })).toString("base64url");
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${sign("sha256", Buffer.from(unsigned), { key: config.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

export type AppleJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

/** Verifies Apple's signature before trusting any claim, including the subject. */
export function verifyAppleDeletionIdToken(
  token: string, keys: AppleJwk[], expected: { clientId: string; nonce: string; subject: string }, now = Date.now(),
): void {
  if (!token || token.length > 16_384) throw new Error("invalid_id_token");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("invalid_id_token");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("invalid_id_token");
  const key = keys.find((item) => item.kid === header.kid && item.kty === "RSA" && item.alg === "RS256" && item.use === "sig");
  if (!key || !verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: "jwk" }), Buffer.from(parts[2], "base64url"))) {
    throw new Error("invalid_id_token");
  }
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  const seconds = Math.floor(now / 1000);
  if (claims.iss !== APPLE_ISSUER || claims.aud !== expected.clientId || claims.sub !== expected.subject
    || claims.nonce !== expected.nonce || !Number.isFinite(claims.exp) || claims.exp <= seconds
    || !Number.isFinite(claims.iat) || claims.iat > seconds + 60 || claims.iat < seconds - 900) throw new Error("invalid_id_token");
}

/** AES-GCM also authenticates the owner/client/subject, preventing row swaps. */
export function encryptAppleRefreshToken(token: string, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptAppleRefreshToken(envelope: string, key: Buffer, context: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("invalid_envelope");
  const iv = Buffer.from(parts[1], "base64url"), tag = Buffer.from(parts[2], "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("invalid_envelope");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
}
