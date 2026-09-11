import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build, resolveConfig } from "../mobile/node_modules/vite/dist/node/index.js";
import { resolveMobilePublicConfig } from "../scripts/mobile-public-config.mjs";

// Deliberately nonfunctional fixtures. No real project credential is used.
const jwt = (role, alg = "HS256") => [
  Buffer.from(JSON.stringify({ alg, typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ role, iss: "unit-test-only" })).toString("base64url"),
  Buffer.from("not-a-real-signature").toString("base64url"),
].join(".");
const publicKey = "sb_publishable_NONFUNCTIONAL_TEST_ONLY";
const fixture = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
};

test("public config: only explicit public fields are returned", () => {
  const config = resolveMobilePublicConfig({ ...fixture, SUPABASE_SERVICE_ROLE_KEY: "PRIVATE_CANARY", VITE_UNEXPECTED_TOKEN: "PRIVATE_CANARY" });
  assert.deepEqual(Object.keys(config).sort(), ["apiBaseUrl", "appleAuthEnabled", "supabaseAnonKey", "supabaseUrl", "supportEmail"].sort());
  assert.equal(config.apiBaseUrl, "https://www.letsgo2travel.com.tr");
  assert.equal(config.supportEmail, "hello@letsgo2travel.com.tr");
  assert.equal(config.appleAuthEnabled, true);
  assert.equal(JSON.stringify(config).includes("PRIVATE_CANARY"), false);
});

test("public config: legacy anon JWT and publishable key are accepted", () => {
  for (const key of [jwt("anon"), publicKey]) {
    assert.equal(resolveMobilePublicConfig({ ...fixture, NEXT_PUBLIC_SUPABASE_ANON_KEY: key }).supabaseAnonKey, key);
  }
});

test("public config: privileged, session and malformed keys are rejected without logging values", () => {
  for (const key of ["sb_secret_NONFUNCTIONAL_TEST_ONLY", jwt("service_role"), jwt("authenticated"), jwt("anon", "none"), "malformed-private-canary", "e30.e30.c2ln", '"' + publicKey + '"', "Bearer " + jwt("anon")]) {
    assert.throws(() => resolveMobilePublicConfig({ ...fixture, NEXT_PUBLIC_SUPABASE_ANON_KEY: key }), (error) => {
      assert.match(error.message, /SUPABASE_ANON_KEY/);
      assert.equal(error.message.includes(key), false);
      return true;
    });
  }
});

test("public config: bad VITE override cannot hide behind a valid NEXT_PUBLIC key", () => {
  assert.throws(() => resolveMobilePublicConfig({ ...fixture, VITE_SUPABASE_ANON_KEY: jwt("service_role") }), /SUPABASE_ANON_KEY/);
});

test("public config: public aliases keep their precedence and trim whitespace", () => {
  const config = resolveMobilePublicConfig({ ...fixture, VITE_SUPABASE_URL: " https://override.supabase.co/ ", VITE_SUPABASE_ANON_KEY: " " + jwt("anon") + " ", VITE_SUPPORT_EMAIL: " support@example.com ", VITE_APPLE_AUTH_ENABLED: " FALSE " });
  assert.equal(config.supabaseUrl, "https://override.supabase.co");
  assert.equal(config.supabaseAnonKey, jwt("anon"));
  assert.equal(config.supportEmail, "support@example.com");
  assert.equal(config.appleAuthEnabled, false);
});

test("public config: build fails when either public Supabase field is missing", () => {
  for (const env of [{}, { NEXT_PUBLIC_SUPABASE_URL: fixture.NEXT_PUBLIC_SUPABASE_URL }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey }]) {
    assert.throws(() => resolveMobilePublicConfig(env), /yayın derlemesinde/);
  }
});

test("public config: credential-free dev preview remains usable", () => {
  const config = resolveMobilePublicConfig({}, { production: false });
  assert.equal(config.supabaseUrl, "");
  assert.equal(config.supabaseAnonKey, "");
});

test("public config: even development refuses privileged keys", () => {
  assert.throws(() => resolveMobilePublicConfig({ ...fixture, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("service_role") }, { production: false }), /SUPABASE_ANON_KEY/);
});

test("public config: release APIs and Supabase must use HTTPS", () => {
  for (const key of ["VITE_API_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    for (const value of ["http://localhost:54321", "http://example.com", "file:///tmp/config", "javascript:alert(1)"]) {
      assert.throws(() => resolveMobilePublicConfig({ ...fixture, [key]: value }), /HTTPS/);
    }
  }
});

test("public config: HTTP is limited to loopback development", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const config = resolveMobilePublicConfig({ ...fixture, VITE_API_BASE_URL: `http://${host}:3000` }, { production: false });
    assert.equal(config.apiBaseUrl, `http://${host}:3000`);
  }
  assert.throws(() => resolveMobilePublicConfig({ ...fixture, VITE_API_BASE_URL: "http://localhost.evil.example" }, { production: false }), /HTTPS/);
});

test("public config: URL userinfo, paths and query secrets are rejected without echo", () => {
  for (const url of ["https://user:PRIVATE_CANARY@example.com", "https://example.com?token=PRIVATE_CANARY", "https://example.com#PRIVATE_CANARY", "https://example.com/api", "PRIVATE_CANARY"]) {
    assert.throws(() => resolveMobilePublicConfig({ ...fixture, VITE_API_BASE_URL: url }), (error) => {
      assert.equal(error.message.includes("PRIVATE_CANARY"), false);
      return true;
    });
  }
});

test("public config: malformed support and feature flag values fail early", () => {
  assert.throws(() => resolveMobilePublicConfig({ ...fixture, VITE_SUPPORT_EMAIL: "not-an-email" }), /SUPPORT_EMAIL/);
  assert.throws(() => resolveMobilePublicConfig({ ...fixture, VITE_APPLE_AUTH_ENABLED: "fasle" }), /VITE_APPLE_AUTH_ENABLED/);
});

const root = fileURLToPath(new URL("../", import.meta.url));
const configFile = fileURLToPath(new URL("../mobile/vite.config.ts", import.meta.url));
const controlled = {
  NODE_ENV: "production",
  VITE_API_BASE_URL: "https://www.letsgo2travel.com.tr",
  VITE_SUPABASE_URL: fixture.NEXT_PUBLIC_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: publicKey,
  VITE_SUPPORT_EMAIL: "hello@letsgo2travel.com.tr",
  VITE_APPLE_AUTH_ENABLED: "true",
  ...fixture,
  NEXT_PUBLIC_SUPPORT_EMAIL: "hello@letsgo2travel.com.tr",
  SUPPORT_EMAIL: "hello@letsgo2travel.com.tr",
  VITE_UNEXPECTED_TOKEN: "VITE_PRIVATE_CANARY_NOT_FOR_CLIENTS",
  SUPABASE_SERVICE_ROLE_KEY: "SERVER_PRIVATE_CANARY_NOT_FOR_CLIENTS",
};

// Top-level node:test cases run serially. Keep all changes scoped to this
// process and restore CI's public values even when a check fails.
async function withEnv(overrides, run) {
  const changes = { ...controlled, ...overrides };
  const before = Object.fromEntries(Object.keys(changes).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, changes);
    return await run();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("actual Vite config: undeclared VITE variables are not exposed, builtins remain", async () => {
  await withEnv({}, async () => {
    const config = await resolveConfig({ configFile, logLevel: "silent" }, "build", "production");
    assert.equal("VITE_UNEXPECTED_TOKEN" in config.env, false);
    assert.equal("VITE_SUPABASE_ANON_KEY" in config.env, false);
    assert.equal(config.env.PROD, true);
    assert.equal(JSON.parse(config.define.__L2T_CONFIG__).supabaseAnonKey, publicKey);
  });
});

test("actual Vite config: alternate build mode cannot bypass release validation", async () => {
  await withEnv({ VITE_SUPABASE_ANON_KEY: jwt("service_role") }, async () => {
    await assert.rejects(resolveConfig({ configFile, logLevel: "silent" }, "build", "development"), /SUPABASE_ANON_KEY/);
  });
});

test("actual Vite bundle: private env canaries absent, public config still works", async () => {
  await withEnv({}, async () => {
    const result = await build({
      configFile,
      logLevel: "silent",
      plugins: [{
        name: "security-fixture",
        resolveId(id) { if (id === "virtual:security-fixture") return id; },
        load(id) {
          if (id === "virtual:security-fixture") return "console.log(JSON.stringify({config:__L2T_CONFIG__,env:import.meta.env}));";
        },
      }],
      build: { write: false, rolldownOptions: { input: "virtual:security-fixture" } },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
    const source = outputs.map((item) => item.type === "chunk" ? item.code : String(item.source)).join("\n");
    assert.ok(source.includes(publicKey));
    assert.ok(source.includes("https://www.letsgo2travel.com.tr"));
    assert.equal(source.includes(controlled.VITE_UNEXPECTED_TOKEN), false);
    assert.equal(source.includes(controlled.SUPABASE_SERVICE_ROLE_KEY), false);
  });
});

test("CI config check: accepts public fixtures, rejects secret fixtures without printing them", () => {
  const cli = fileURLToPath(new URL("../scripts/check-mobile-public-config.mjs", import.meta.url));
  const pass = spawnSync(process.execPath, [cli], { cwd: root, encoding: "utf8", env: { ...process.env, ...controlled } });
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(pass.stdout.includes(publicKey), false);
  const secret = "sb_secret_NONFUNCTIONAL_LOG_CANARY";
  const fail = spawnSync(process.execPath, [cli], { cwd: root, encoding: "utf8", env: { ...process.env, ...controlled, VITE_SUPABASE_ANON_KEY: secret } });
  assert.equal(fail.status, 1);
  assert.match(fail.stderr, /SUPABASE_ANON_KEY/);
  assert.equal((fail.stdout + fail.stderr).includes(secret), false);
});
