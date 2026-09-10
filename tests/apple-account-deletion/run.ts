import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign, verify, createPublicKey } from "node:crypto";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import {
  APPLE_ISSUER, appleClientSecret, appleDeletionConfig, appleSubject, decryptAppleRefreshToken,
  encryptAppleRefreshToken, requiresAppleRevocation, sha256, verifiedSessionId, verifyAppleDeletionIdToken,
} from "../../lib/apple-account-deletion-crypto";
import { finishAppleDeletionAuthorization, getAppleDeletionStatus, revokeAppleBeforeDeletion, startAppleDeletionAuthorization } from "../../lib/apple-account-deletion";

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = { ...rsa.publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
const key = randomBytes(32);
const testEnv: NodeJS.ProcessEnv = {
  APPLE_SIGN_IN_CLIENT_ID: "com.example.test.web", APPLE_SIGN_IN_TEAM_ID: "0123456789", APPLE_SIGN_IN_KEY_ID: "ABCDEFGHIJ",
  APPLE_SIGN_IN_PRIVATE_KEY: ec.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  APPLE_DELETION_REDIRECT_URI: "https://example.com/api/account/apple-deletion/callback",
  APPLE_DELETION_ENCRYPTION_KEY: key.toString("hex"),
};
const user = { id: "00000000-0000-4000-8000-000000000001", app_metadata: { provider: "apple" }, identities: [
  { provider: "apple", id: "apple-subject", identity_data: { sub: "apple-subject" }, last_sign_in_at: "2026-09-01T00:00:00Z" },
] } as unknown as User;
const config = appleDeletionConfig(testEnv)!;
const baseNow = new Date("2026-09-10T12:00:00Z").getTime();
const expected = { clientId: config.clientId, nonce: "test-nonce", subject: "apple-subject" };
function idToken(overrides: Record<string, unknown> = {}, headerOverrides: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key", ...headerOverrides })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: APPLE_ISSUER, aud: expected.clientId, sub: expected.subject, nonce: expected.nonce,
    iat: Math.floor(baseNow / 1000), exp: Math.floor(baseNow / 1000) + 300, ...overrides })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), rsa.privateKey).toString("base64url")}`;
}

let count = 0;
async function test(name: string, run: () => void | Promise<void>) { await run(); count++; console.log(`PASS ${name}`); }

type Grant = { id: string; user_id: string; client_id: string; subject_hash: string; encrypted_refresh_token: string | null; authorized_at: string; revoked_at: string | null };
function mockSupabase(initial: Grant | null, options: { storageError?: boolean; saved?: boolean; claimed?: boolean; user?: User; begin?: boolean } = {}) {
  let grant = initial;
  let updates = 0;
  const rpcCalls: string[] = [];
  const client = {
    from() {
      let updating = false, values: Partial<Grant> | null = null;
      const query = {
        select() { return query; }, eq() { return query; }, is() { return query; },
        update(update: Partial<Grant>) { updating = true; values = update; return query; },
        async maybeSingle() {
          if (options.storageError) return { data: null, error: { code: "TEST" } };
          if (updating) { updates++; grant = { ...grant!, ...values }; return { data: { id: grant.id }, error: null }; }
          return { data: grant, error: null };
        },
      };
      return query;
    },
    auth: { admin: { async getUserById() { return { data: { user: options.user || user }, error: null }; } } },
    async rpc(name: string) {
      rpcCalls.push(name);
      if (name === "begin_apple_deletion_authorization") return { data: options.begin !== false, error: null };
      if (name === "claim_apple_deletion_authorization") return { data: options.claimed === false ? null : { user_id: user.id, nonce: "test-nonce", state_hash: "a".repeat(64) }, error: null };
      if (name === "save_apple_deletion_grant") return { data: options.saved !== false, error: null };
      throw new Error("unexpected rpc");
    },
  } as unknown as SupabaseClient;
  return { client, updates: () => updates, grant: () => grant, rpcCalls };
}

async function main() {
  await test("Apple configuration rejects missing keys, HTTP, custom callback paths and non-P256 keys", () => {
    assert(config);
    for (const change of [{ APPLE_DELETION_ENCRYPTION_KEY: "short" }, { APPLE_DELETION_REDIRECT_URI: "http://example.com/api/account/apple-deletion/callback" },
      { APPLE_DELETION_REDIRECT_URI: "https://example.com/other" }, { APPLE_SIGN_IN_PRIVATE_KEY: rsa.privateKey.export({ format: "pem", type: "pkcs8" }).toString() }]) {
      assert.equal(appleDeletionConfig({ ...testEnv, ...change }), null);
    }
  });
  await test("client secret has ES256 signature and a five-minute expiry with exact Apple audience/client", () => {
    const token = appleClientSecret(config, baseNow).split(".");
    assert(verify("sha256", Buffer.from(`${token[0]}.${token[1]}`), { key: createPublicKey(config.privateKey), dsaEncoding: "ieee-p1363" }, Buffer.from(token[2], "base64url")));
    const claims = JSON.parse(Buffer.from(token[1], "base64url").toString());
    assert.equal(claims.exp - claims.iat, 300); assert.equal(claims.aud, APPLE_ISSUER); assert.equal(claims.sub, config.clientId);
  });
  await test("valid Apple identity is accepted only after signature and claim verification", () => verifyAppleDeletionIdToken(idToken(), [jwk], expected, baseNow));
  await test("wrong Apple account, nonce, client, issuer, expiration, algorithm and forged signature are rejected", () => {
    for (const claims of [{ sub: "other-account" }, { nonce: "other-transaction" }, { aud: "other-client" }, { iss: "https://attacker.test" },
      { exp: baseNow / 1000 }, { iat: baseNow / 1000 + 120 }, { iat: baseNow / 1000 - 1000 }]) {
      assert.throws(() => verifyAppleDeletionIdToken(idToken(claims), [jwk], expected, baseNow));
    }
    assert.throws(() => verifyAppleDeletionIdToken(idToken({}, { alg: "HS256" }), [jwk], expected, baseNow));
    const token = idToken().split("."); token[2] = randomBytes(256).toString("base64url");
    assert.throws(() => verifyAppleDeletionIdToken(token.join("."), [jwk], expected, baseNow));
  });
  await test("encrypted token rejects a different owner, different key and ciphertext tampering", () => {
    const encrypted = encryptAppleRefreshToken("private-provider-refresh", key, "user-a");
    assert.equal(decryptAppleRefreshToken(encrypted, key, "user-a"), "private-provider-refresh");
    assert(!encrypted.includes("private-provider-refresh"));
    assert.throws(() => decryptAppleRefreshToken(encrypted, key, "user-b"));
    assert.throws(() => decryptAppleRefreshToken(encrypted, randomBytes(32), "user-a"));
    const parts = encrypted.split("."); const bytes = Buffer.from(parts[3], "base64url"); bytes[0] ^= 1; parts[3] = bytes.toString("base64url");
    assert.throws(() => decryptAppleRefreshToken(parts.join("."), key, "user-a"));
  });
  await test("editable user metadata cannot invent or remove the Apple ownership identity", () => {
    assert.equal(appleSubject(user), "apple-subject");
    assert(requiresAppleRevocation({ ...user, identities: [] }));
    assert(!requiresAppleRevocation({ id: user.id, identities: [], app_metadata: {}, user_metadata: { provider: "apple" } } as unknown as User));
    assert.equal(verifiedSessionId("bad-token"), null);
  });

  const originalEnv = { ...process.env };
  Object.assign(process.env, testEnv);
  const originalFetch = globalThis.fetch;
  let networkCalls: { url: string; body: URLSearchParams }[] = [];
  let networkStatus = 200;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    networkCalls.push({ url: String(url), body: new URLSearchParams(String(init?.body || "")) });
    if (String(url).endsWith("/auth/keys")) return new Response(JSON.stringify({ keys: [jwk] }));
    if (String(url).endsWith("/auth/token")) return new Response(JSON.stringify({ refresh_token: "private-provider-refresh", id_token: idToken({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 }) }), { status: networkStatus });
    return new Response("", { status: networkStatus });
  }) as typeof fetch;
  const subjectHash = sha256("apple-subject");
  const context = `apple-deletion:v1:${user.id}:${config.clientId}:${subjectHash}`;
  const grant: Grant = { id: "grant-one", user_id: user.id, client_id: config.clientId, subject_hash: subjectHash,
    encrypted_refresh_token: encryptAppleRefreshToken("private-provider-refresh", key, context), authorized_at: "2026-09-10T12:00:00Z", revoked_at: null };
  try {
    await test("existing Apple users without captured credentials have a usable authorization URL", async () => {
      const db = mockSupabase(null);
      assert.equal((await getAppleDeletionStatus(db.client, user)).status, "authorization_required");
      const started = await startAppleDeletionAuthorization(db.client, user, "verified-session");
      assert(started.ok);
      const url = new URL(started.authorizationUrl);
      assert.equal(url.origin, APPLE_ISSUER); assert.equal(url.searchParams.get("response_mode"), "form_post");
      assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri); assert.equal(url.searchParams.get("state")!.length, 43);
      assert(!url.toString().includes(user.id)); assert(!url.toString().includes("private-provider-refresh"));
    });
    await test("consumed or expired authorization cannot trigger Apple code exchange", async () => {
      networkCalls = [];
      const result = await finishAppleDeletionAuthorization(mockSupabase(null, { claimed: false }).client, "a".repeat(43), "one-use-code");
      assert(!result.ok); assert.equal(networkCalls.length, 0);
    });
    await test("callback acquires and validates credentials without revoking before actual deletion", async () => {
      networkCalls = [];
      const db = mockSupabase(null);
      const result = await finishAppleDeletionAuthorization(db.client, "a".repeat(43), "one-use-code");
      assert(result.ok); assert(db.rpcCalls.includes("save_apple_deletion_grant"));
      assert.equal(networkCalls.filter((call) => call.url.endsWith("/auth/revoke")).length, 0);
      assert(!JSON.stringify(result).includes("private-provider-refresh"));
    });
    await test("callback cannot attach another Apple's account to the authenticated deletion owner", async () => {
      networkCalls = [];
      const db = mockSupabase(null, { user: { ...user, identities: [{ provider: "apple", identity_data: { sub: "different-subject" } }] } as unknown as User });
      assert(!(await finishAppleDeletionAuthorization(db.client, "a".repeat(43), "one-use-code")).ok);
      assert(!db.rpcCalls.includes("save_apple_deletion_grant"));
      assert.equal(networkCalls.filter((call) => call.url.endsWith("/auth/revoke")).length, 0);
    });
    await test("revocation uses provider refresh token (never a Supabase JWT) and clears credential after success", async () => {
      networkCalls = [];
      const db = mockSupabase({ ...grant });
      assert.equal((await getAppleDeletionStatus(db.client, user)).status, "ready");
      assert((await revokeAppleBeforeDeletion(db.client, user)).ok);
      assert.equal(networkCalls[0].url, `${APPLE_ISSUER}/auth/revoke`);
      assert.equal(networkCalls[0].body.get("token"), "private-provider-refresh");
      assert.equal(networkCalls[0].body.get("token_type_hint"), "refresh_token");
      assert.equal(db.grant()!.encrypted_refresh_token, null);
      assert.equal((await getAppleDeletionStatus(db.client, user)).status, "revoked");
      assert((await revokeAppleBeforeDeletion(db.client, user)).ok); assert.equal(networkCalls.length, 1);
    });
    await test("Apple rejection preserves encrypted credential and does not report deletion-ready revocation", async () => {
      networkStatus = 400;
      const db = mockSupabase({ ...grant });
      const result = await revokeAppleBeforeDeletion(db.client, user);
      assert(!result.ok); assert.equal(result.code, "apple_revocation_failed"); assert.equal(db.updates(), 0);
      networkStatus = 200;
      assert((await revokeAppleBeforeDeletion(db.client, user)).ok);
    });
    await test("unexpected 202 response is not treated as completed Apple revocation", async () => {
      networkStatus = 202;
      const db = mockSupabase({ ...grant });
      assert(!(await revokeAppleBeforeDeletion(db.client, user)).ok); assert.equal(db.updates(), 0);
      networkStatus = 200;
    });
    await test("later Apple sign-in cannot reuse an older unrevoked token that Apple settings may have invalidated", async () => {
      networkCalls = [];
      const laterUser = { ...user, identities: [{ ...user.identities![0], last_sign_in_at: "2026-09-11T00:00:00Z" }] };
      const db = mockSupabase({ ...grant });
      assert.equal((await getAppleDeletionStatus(db.client, laterUser)).status, "authorization_required");
      assert(!(await revokeAppleBeforeDeletion(db.client, laterUser)).ok); assert.equal(networkCalls.length, 0);
      assert((await startAppleDeletionAuthorization(db.client, laterUser, "verified-session")).ok);
    });
    await test("Apple sign-in after a previous revocation requires fresh authorization", async () => {
      const laterUser = { ...user, identities: [{ ...user.identities![0], last_sign_in_at: "2026-09-11T00:00:00Z" }] };
      const db = mockSupabase({ ...grant, encrypted_refresh_token: null, revoked_at: "2026-09-10T12:00:00Z" });
      assert.equal((await getAppleDeletionStatus(db.client, laterUser)).status, "authorization_required");
      assert(!(await revokeAppleBeforeDeletion(db.client, laterUser)).ok);
    });
    await test("missing config and database failure are separate from non-Apple accounts", async () => {
      delete process.env.APPLE_DELETION_ENCRYPTION_KEY;
      const db = mockSupabase(null);
      assert.equal((await getAppleDeletionStatus(db.client, user)).status, "configuration_missing");
      const emailUser = { id: user.id, app_metadata: { provider: "email" }, identities: [] } as unknown as User;
      assert.equal((await getAppleDeletionStatus(db.client, emailUser)).status, "not_required");
      assert((await revokeAppleBeforeDeletion(db.client, emailUser)).ok);
      Object.assign(process.env, testEnv);
      assert.equal((await getAppleDeletionStatus(mockSupabase(null, { storageError: true }).client, user)).status, "unavailable");
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(testEnv)) {
      if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name];
    }
  }
  console.log(`PASS ${count} Apple account deletion checks (mock provider only)`);
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
