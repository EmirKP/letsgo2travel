import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { build, resolveConfig } from "../mobile/node_modules/vite/dist/node/index.js";
import { resolveMobilePublicConfig } from "../scripts/mobile-public-config.mjs";
import { resolveMobileSourceIdentity } from "../scripts/mobile-source-identity.mjs";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function sourceFixture(t, repository = false) {
  const directory = mkdtempSync(path.join(tmpdir(), "l2t-source-identity-"));
  t.after(() => {
    const resolved = path.resolve(directory), parent = path.resolve(tmpdir());
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith("l2t-source-identity-"));
    rmSync(resolved, { recursive: true, force: true });
  });
  let head;
  if (repository) {
    const git = args => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
    git(["init"]);
    git(["-c", "user.name=Source Identity Test", "-c", "user.email=source-identity@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "local test fixture"]);
    head = git(["rev-parse", "HEAD"]);
  }
  return { directory, head };
}

test("source identity: clean archive accepts explicit full SHA and otherwise stays unknown", t => {
  const { directory } = sourceFixture(t), sha = "ABCDEF123456" + "A".repeat(28);
  assert.equal(resolveMobileSourceIdentity(directory, {}), "unknown");
  assert.equal(resolveMobileSourceIdentity(directory, { L2T_SOURCE_COMMIT: sha }), "abcdef123456");
  assert.equal(resolveMobileSourceIdentity(directory, { CM_COMMIT: sha }), "abcdef123456");
  assert.equal(resolveMobileSourceIdentity(directory, { L2T_SOURCE_COMMIT: sha, CM_COMMIT: sha.toLowerCase() }), "abcdef123456");
});

test("source identity: rejects malformed or conflicting supplied values without echoing them", t => {
  const { directory } = sourceFixture(t);
  for (const name of ["L2T_SOURCE_COMMIT", "CM_COMMIT"]) for (const value of ["abc123", "g".repeat(40), "private-canary", "a".repeat(41)]) {
    assert.throws(() => resolveMobileSourceIdentity(directory, { [name]: value }), error => error.message.includes(name) && !error.message.includes(value));
  }
  assert.throws(() => resolveMobileSourceIdentity(directory, { L2T_SOURCE_COMMIT: "a".repeat(40), CM_COMMIT: "b".repeat(40) }), /uyuşmuyor/);
});

test("source identity: actual checkout HEAD must match supplied commit", t => {
  const { directory, head } = sourceFixture(t, true);
  assert.equal(resolveMobileSourceIdentity(directory, {}), head.slice(0, 12));
  assert.equal(resolveMobileSourceIdentity(directory, { L2T_SOURCE_COMMIT: head.toUpperCase() }), head.slice(0, 12));
  assert.equal(resolveMobileSourceIdentity(directory, { CM_COMMIT: head }), head.slice(0, 12));
  assert.throws(() => resolveMobileSourceIdentity(directory, { L2T_SOURCE_COMMIT: "a".repeat(40) }), /HEAD/);
  assert.throws(() => resolveMobileSourceIdentity(directory, { CM_COMMIT: "b".repeat(40) }), /HEAD/);
});

test("source identity: archive under another checkout never inherits the ancestor HEAD", t => {
  const { directory } = sourceFixture(t, true), archive = path.join(directory, "archive");
  mkdirSync(archive);
  assert.equal(resolveMobileSourceIdentity(archive, {}), "unknown");
  assert.equal(resolveMobileSourceIdentity(archive, { L2T_SOURCE_COMMIT: "c".repeat(40) }), "c".repeat(12));
});

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
  const config = resolveMobilePublicConfig({ ...fixture, SUPABASE_SERVICE_ROLE_KEY: "PRIVATE_CANARY", VITE_UNEXPECTED_TOKEN: "PRIVATE_CANARY",
    APPLE_MAPS_TEAM_ID: "PRIVATE_CANARY", APPLE_MAPS_KEY_ID: "PRIVATE_CANARY", APPLE_MAPS_PRIVATE_KEY: "PRIVATE_CANARY", APPLE_MAPS_ALLOWED_ORIGINS: "PRIVATE_CANARY" });
  assert.deepEqual(Object.keys(config).sort(), ["apiBaseUrl", "travelAssistantApiBaseUrl", "appleAuthEnabled", "appleMapsToken", "supabaseAnonKey", "supabaseUrl", "supportEmail"].sort());
  assert.equal(config.apiBaseUrl, "https://www.letsgo2travel.com.tr");
  assert.equal(config.travelAssistantApiBaseUrl, "");
  assert.equal(config.supportEmail, "hello@letsgo2travel.com.tr");
  assert.equal(config.appleAuthEnabled, true);
  assert.equal(JSON.stringify(config).includes("PRIVATE_CANARY"), false);
});

test("public config: legacy anon JWT and publishable key are accepted", () => {
  for (const key of [jwt("anon"), publicKey]) {
    assert.equal(resolveMobilePublicConfig({ ...fixture, NEXT_PUBLIC_SUPABASE_ANON_KEY: key }).supabaseAnonKey, key);
  }
});

test("public config: assistant override preserves existing API and account configuration", () => {
  const config = resolveMobilePublicConfig({ ...fixture, VITE_TRAVEL_ASSISTANT_API_BASE_URL: " https://assistant.example.com/ " });
  assert.equal(config.travelAssistantApiBaseUrl, "https://assistant.example.com");
  assert.equal(config.apiBaseUrl, "https://www.letsgo2travel.com.tr");
  assert.equal(config.supabaseUrl, fixture.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(config.supabaseAnonKey, publicKey);
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
  for (const key of ["VITE_API_BASE_URL", "VITE_TRAVEL_ASSISTANT_API_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    for (const value of ["http://localhost:54321", "http://example.com", "file:///tmp/config", "javascript:alert(1)"]) {
      assert.throws(() => resolveMobilePublicConfig({ ...fixture, [key]: value }), /HTTPS/);
    }
  }
});

test("public config: HTTP is limited to loopback development", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const config = resolveMobilePublicConfig({ ...fixture, VITE_API_BASE_URL: `http://${host}:3000`, VITE_TRAVEL_ASSISTANT_API_BASE_URL: `http://${host}:3001` }, { production: false });
    assert.equal(config.apiBaseUrl, `http://${host}:3000`);
    assert.equal(config.travelAssistantApiBaseUrl, `http://${host}:3001`);
  }
  assert.throws(() => resolveMobilePublicConfig({ ...fixture, VITE_API_BASE_URL: "http://localhost.evil.example" }, { production: false }), /HTTPS/);
  assert.throws(() => resolveMobilePublicConfig({ ...fixture, VITE_TRAVEL_ASSISTANT_API_BASE_URL: "http://localhost.evil.example" }, { production: false }), /HTTPS/);
});

test("public config: URL userinfo, paths and query secrets are rejected without echo", () => {
  for (const url of ["https://user:PRIVATE_CANARY@example.com", "https://example.com?token=PRIVATE_CANARY", "https://example.com#PRIVATE_CANARY", "https://example.com/api", "PRIVATE_CANARY"]) {
    for (const key of ["VITE_API_BASE_URL", "VITE_TRAVEL_ASSISTANT_API_BASE_URL"]) {
      assert.throws(() => resolveMobilePublicConfig({ ...fixture, [key]: url }), (error) => {
        assert.equal(error.message.includes("PRIVATE_CANARY"), false);
        return true;
      });
    }
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
  VITE_TRAVEL_ASSISTANT_API_BASE_URL: "",
  L2T_MAPS_DEV_API_URL: "",
  L2T_EVENTS_DEV_API_URL: "",
  L2T_EVENT_COMMUNITY_DEV_API_URL: "",
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
    assert.equal(JSON.parse(config.define.__L2T_CONFIG__).sourceCommit, resolveMobileSourceIdentity(root));
  });
});

test("actual Vite config: alternate build mode cannot bypass release validation", async () => {
  await withEnv({ VITE_SUPABASE_ANON_KEY: jwt("service_role") }, async () => {
    await assert.rejects(resolveConfig({ configFile, logLevel: "silent" }, "build", "development"), /SUPABASE_ANON_KEY/);
  });
});

test("actual Vite config: assistant host uses a dedicated dev proxy without moving account APIs", async () => {
  await withEnv({ VITE_TRAVEL_ASSISTANT_API_BASE_URL: "https://assistant.example.com" }, async () => {
    const serve = await resolveConfig({ configFile, logLevel: "silent" }, "serve", "development");
    const injected = JSON.parse(serve.define.__L2T_CONFIG__);
    assert.equal(injected.travelAssistantApiBaseUrl, "/__travel-assistant");
    assert.equal(injected.apiBaseUrl, "");
    assert.equal(serve.server.proxy["/__travel-assistant"].target, "https://assistant.example.com");
    assert.equal(serve.server.proxy["/__travel-assistant"].rewrite("/__travel-assistant/api/travel-assistant/rates?base=EUR&quote=TRY"), "/api/travel-assistant/rates?base=EUR&quote=TRY");
    assert.equal(serve.server.proxy["/api"].target, controlled.VITE_API_BASE_URL);
    const release = await resolveConfig({ configFile, logLevel: "silent" }, "build", "production");
    assert.equal(JSON.parse(release.define.__L2T_CONFIG__).travelAssistantApiBaseUrl, "https://assistant.example.com");
    assert.equal(JSON.parse(release.define.__L2T_CONFIG__).apiBaseUrl, controlled.VITE_API_BASE_URL);
  });
  await withEnv({}, async () => {
    const serve = await resolveConfig({ configFile, logLevel: "silent" }, "serve", "development");
    assert.equal(JSON.parse(serve.define.__L2T_CONFIG__).travelAssistantApiBaseUrl, "");
    assert.equal("/__travel-assistant" in serve.server.proxy, false);
  });
});

test("actual Vite config: exact local planner and event-community proxies stay out of release clients", async () => {
  const paths = ["/api/event-community", "/api/maps/token", "/api/travel-assistant/journey-route", "/api/travel-assistant/discover", "/api/travel-assistant/journey-search", "/api/travel-assistant/journey-plan"];
  const keys = paths.map(path => `^${path}(?:\\?|$)`);
  await withEnv({ L2T_MAPS_DEV_API_URL: "http://127.0.0.1:3000" }, async () => {
    const serve = await resolveConfig({ configFile, logLevel: "silent" }, "serve", "development");
    for (const [index, key] of keys.entries()) {
      assert.equal(serve.server.proxy[key].target, "http://127.0.0.1:3000");
      assert.ok(Object.keys(serve.server.proxy).indexOf(key) < Object.keys(serve.server.proxy).indexOf("/api"));
      const matches = new RegExp(key);
      assert.equal(matches.test(paths[index]), true);
      assert.equal(matches.test(`${paths[index]}?check=1`), true);
      for (const path of ["/api/profile", "/api/country-community", "/api/event-community/other", "/api/event-community-malicious", "/api/event-communities", "/api/travel-assistant/places", "/api/travel-assistant/emergency", "/api/travel-assistant/rates",
        "/api/maps/tokens", "/api/maps/token/other", "/api/maps/token-malicious", "/api/travel-assistant/journey-routes",
        "/api/travel-assistant/journey-route/other", "/api/travel-assistant/journey-route-malicious", "/__travel-assistant/api/travel-assistant/journey-route",
        "/api/travel-assistant/discovery", "/api/travel-assistant/discover/other", "/api/travel-assistant/journey-search/other",
        "/api/travel-assistant/journey-search-malicious", "/api/travel-assistant/journey-plans", "/api/travel-assistant/journey-plan/other",
        "/api/travel-assistant/journey-plan-malicious", "/__travel-assistant/api/travel-assistant/journey-plan", ...paths.filter(other => other !== paths[index])]) {
        assert.equal(matches.test(path), false, path);
      }
    }
    assert.equal(serve.server.proxy["/api"].target, controlled.VITE_API_BASE_URL);
    assert.equal(serve.env.L2T_MAPS_DEV_API_URL, undefined);
    assert.equal(serve.define.__L2T_CONFIG__.includes("127.0.0.1:3000"), false);
    const release = await resolveConfig({ configFile, logLevel: "silent" }, "build", "production");
    for (const key of keys) assert.equal(key in release.server.proxy, false);
    assert.equal(release.env.L2T_MAPS_DEV_API_URL, undefined);
    assert.equal(release.define.__L2T_CONFIG__.includes("127.0.0.1:3000"), false);
    assert.equal(JSON.parse(release.define.__L2T_CONFIG__).apiBaseUrl, controlled.VITE_API_BASE_URL);
  });
  await withEnv({}, async () => {
    const serve = await resolveConfig({ configFile, logLevel: "silent" }, "serve", "development");
    for (const key of keys) assert.equal(key in serve.server.proxy, false);
    assert.equal(serve.server.proxy["/api"].target, controlled.VITE_API_BASE_URL);
  });
  await withEnv({ L2T_MAPS_DEV_API_URL: "http://127.0.0.1:3000", VITE_TRAVEL_ASSISTANT_API_BASE_URL: "https://assistant.example.com" }, async () => {
    const serve = await resolveConfig({ configFile, logLevel: "silent" }, "serve", "development");
    for (const key of keys) assert.equal(serve.server.proxy[key].target, "http://127.0.0.1:3000");
    assert.equal(serve.server.proxy["/__travel-assistant"].target, "https://assistant.example.com");
    assert.equal(serve.server.proxy["/api"].target, controlled.VITE_API_BASE_URL);
  });
});

test("actual Vite config: protected event preview has its own loopback relay without moving other APIs or exposing its target", async () => {
  await withEnv({ L2T_MAPS_DEV_API_URL: "http://127.0.0.1:3000", L2T_EVENT_COMMUNITY_DEV_API_URL: "http://127.0.0.1:3984" }, async () => {
    const serve = await resolveConfig({ configFile, logLevel: "silent" }, "serve", "development");
    assert.equal(serve.server.proxy["^/api/event-community(?:\\?|$)"].target, "http://127.0.0.1:3984");
    assert.equal(serve.server.proxy["^/api/maps/token(?:\\?|$)"].target, "http://127.0.0.1:3000");
    assert.equal(serve.server.proxy["/api"].target, controlled.VITE_API_BASE_URL);
    assert.equal(serve.env.L2T_EVENT_COMMUNITY_DEV_API_URL, undefined);
    assert.equal(serve.define.__L2T_CONFIG__.includes("3984"), false);
    const release = await resolveConfig({ configFile, logLevel: "silent" }, "build", "production");
    assert.equal("^/api/event-community(?:\\?|$)" in release.server.proxy, false);
    assert.equal(release.define.__L2T_CONFIG__.includes("3984"), false);
  });
  await withEnv({ L2T_EVENT_COMMUNITY_DEV_API_URL: "https://private-preview.example" }, async () => {
    await assert.rejects(resolveConfig({ configFile, logLevel: "silent" }, "serve", "development"), /L2T_EVENT_COMMUNITY_DEV_API_URL/);
  });
});

test('actual Vite config: unified map endpoints use only the exact development loopback relay',async()=>{
 const key='^/api/maps/(?:resource|places|directions|search)(?:\\?|$)';
 await withEnv({L2T_MAPS_DEV_API_URL:'http://127.0.0.1:3000'},async()=>{
  const serve=await resolveConfig({configFile,logLevel:'silent'},'serve','development');
  assert.equal(serve.server.proxy[key].target,'http://127.0.0.1:3000');
  for(const endpoint of ['resource','places','directions','search']){
   const pattern=new RegExp(key);assert.equal(pattern.test(`/api/maps/${endpoint}`),true);assert.equal(pattern.test(`/api/maps/${endpoint}?q=Paris`),true);
   assert.equal(pattern.test(`/api/maps/${endpoint}/private`),false);assert.equal(pattern.test(`/api/maps/${endpoint}-other`),false);
  }
  assert.equal(new RegExp(key).test('/api/maps/token'),false);assert.equal(new RegExp(key).test('/api/profile'),false);
  assert.equal(serve.define.__L2T_CONFIG__.includes('127.0.0.1:3000'),false);
  const release=await resolveConfig({configFile,logLevel:'silent'},'build','production');assert.equal(key in release.server.proxy,false);
 });
});

test('actual Vite config: Maps development never diverts live events from the configured public API',async()=>{
 await withEnv({L2T_MAPS_DEV_API_URL:'http://127.0.0.1:3000',VITE_API_BASE_URL:'https://configured-api.example.com'},async()=>{
  const serve=await resolveConfig({configFile,logLevel:'silent'},'serve','development');
  assert.equal('^/api/events(?:\\?|$)' in serve.server.proxy,false);
  assert.equal(serve.server.proxy['/api'].target,'https://configured-api.example.com');
  assert.equal(serve.server.proxy['^/api/maps/token(?:\\?|$)'].target,'http://127.0.0.1:3000');
 });
});

test('actual Vite config: Events source testing has an independent exact loopback override that never enters release clients',async()=>{
 const key='^/api/events(?:\\?|$)';
 await withEnv({L2T_MAPS_DEV_API_URL:'http://127.0.0.1:3000',L2T_EVENTS_DEV_API_URL:'http://127.0.0.1:3100',L2T_EVENT_COMMUNITY_DEV_API_URL:'http://127.0.0.1:3984'},async()=>{
  const serve=await resolveConfig({configFile,logLevel:'silent'},'serve','development');
  assert.equal(serve.server.proxy[key].target,'http://127.0.0.1:3100');
  assert.ok(Object.keys(serve.server.proxy).indexOf(key)<Object.keys(serve.server.proxy).indexOf('/api'));
  assert.equal(serve.server.proxy['^/api/maps/token(?:\\?|$)'].target,'http://127.0.0.1:3000');
  assert.equal(serve.server.proxy['^/api/event-community(?:\\?|$)'].target,'http://127.0.0.1:3984');
  assert.equal(serve.server.proxy['/api'].target,controlled.VITE_API_BASE_URL);
  const match=new RegExp(key);for(const input of ['/api/events','/api/events?countryCode=TR'])assert.equal(match.test(input),true);
  for(const input of ['/api/events/private','/api/events-other','/api/event-community','/api/event-cities','/api/profile'])assert.equal(match.test(input),false);
  assert.equal(serve.env.L2T_EVENTS_DEV_API_URL,undefined);assert.equal(serve.define.__L2T_CONFIG__.includes('127.0.0.1:3100'),false);
  const release=await resolveConfig({configFile,logLevel:'silent'},'build','production');
  assert.equal(key in release.server.proxy,false);assert.equal(release.env.L2T_EVENTS_DEV_API_URL,undefined);assert.equal(release.define.__L2T_CONFIG__.includes('127.0.0.1:3100'),false);
 });
});

test('actual Vite config: Events development accepts canonical loopback only and release ignores invalid dev settings',async()=>{
 const key='^/api/events(?:\\?|$)';
 for(const host of ['localhost','127.0.0.1','[::1]'])await withEnv({L2T_EVENTS_DEV_API_URL:`http://${host}:3100`},async()=>{
  const serve=await resolveConfig({configFile,logLevel:'silent'},'serve','development');assert.equal(serve.server.proxy[key].target,`http://${host}:3100`);
 });
 for(const value of ['https://127.0.0.1:3100','http://remote.example','http://user:PRIVATE_CANARY@localhost:3100','http://localhost:3100/path','http://localhost:3100/','http://localhost:3100?q=PRIVATE_CANARY'])await withEnv({L2T_EVENTS_DEV_API_URL:value},async()=>{
  await assert.rejects(resolveConfig({configFile,logLevel:'silent'},'serve','development'),error=>{
   assert.match(error.message,/L2T_EVENTS_DEV_API_URL/);assert.equal(error.message.includes(value),false);assert.equal(error.message.includes('PRIVATE_CANARY'),false);return true;
  });
 });
 await withEnv({L2T_EVENTS_DEV_API_URL:'INVALID_EVENTS_DEV_CANARY'},async()=>{
  const release=await resolveConfig({configFile,logLevel:'silent'},'build','production');assert.equal(key in release.server.proxy,false);assert.equal(release.define.__L2T_CONFIG__.includes('INVALID_EVENTS_DEV_CANARY'),false);
 });
});

test("actual Vite config: Maps dev target accepts canonical loopback only without disclosing invalid values", async () => {
  const key = "^/api/maps/token(?:\\?|$)";
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    await withEnv({ L2T_MAPS_DEV_API_URL: `http://${host}:3000` }, async () => {
      const serve = await resolveConfig({ configFile, logLevel: "silent" }, "serve", "development");
      assert.equal(serve.server.proxy[key].target, `http://${host}:3000`);
    });
  }
  for (const value of ["https://127.0.0.1:3000", "http://localhost.evil.example:3000", "http://example.com", "http://127.0.0.1:3000/", "http://user:PRIVATE_CANARY@localhost:3000", "http://localhost:3000/path", "http://localhost:3000?q=PRIVATE_CANARY", "http://localhost:3000#PRIVATE_CANARY", "http://2130706433:3000"]) {
    await withEnv({ L2T_MAPS_DEV_API_URL: value }, async () => {
      await assert.rejects(resolveConfig({ configFile, logLevel: "silent" }, "serve", "development"), error => {
        assert.match(error.message, /L2T_MAPS_DEV_API_URL/);
        assert.equal(error.message.includes(value), false);
        assert.equal(error.message.includes("PRIVATE_CANARY"), false);
        return true;
      });
    });
  }
  await withEnv({ L2T_MAPS_DEV_API_URL: "INVALID_DEV_ONLY_CANARY" }, async () => {
    const release = await resolveConfig({ configFile, logLevel: "silent" }, "build", "production");
    assert.equal(key in release.server.proxy, false);
    assert.equal(release.define.__L2T_CONFIG__.includes("INVALID_DEV_ONLY_CANARY"), false);
  });
});

test("assistant requests: classic maps use canonical discovery while FX preserves its optional public host without authentication", async () => {
  const assistantFile = fileURLToPath(new URL("../mobile/src/lib/travelAssistant.ts", import.meta.url)).replaceAll("\\", "/");
  const discoveryFile = fileURLToPath(new URL("../mobile/src/lib/mapJourneyClient.ts", import.meta.url)).replaceAll("\\", "/");
  for (const override of ["", "https://assistant.example.com"]) {
    await withEnv({ VITE_TRAVEL_ASSISTANT_API_BASE_URL: override }, async () => {
      const result = await build({
        configFile, logLevel: "silent",
        plugins: [{
          name: "assistant-routing-fixture", enforce: "pre",
          resolveId(id, importer) {
            if (id === "virtual:assistant-routing-fixture") return id;
            // Both real clients share the same HTTP boundary. Intercept that
            // boundary for each entry, retaining the discovery adapter and its
            // validator instead of bundling unrelated browser locale/CSS setup.
            if (id === "./api" && [assistantFile, discoveryFile].includes(importer?.replaceAll("\\", "/"))) return "virtual:assistant-request-spy";
          },
          load(id) {
            if (id === "virtual:assistant-request-spy") return `export async function requestJson(path, options) {
              globalThis.travelCalls.push({path, options});
              const fetchedAt = new Date().toISOString();
              if (path === '/api/travel-assistant/discover') return {places:[],center:{latitude:options.body.latitude,longitude:options.body.longitude},fetchedAt,limited:false,radius:3000,attribution:'Apple Maps'};
              if (!path.endsWith('/api/travel-assistant/rates?base=EUR&quote=TRY')) throw new Error('Unexpected public API request');
              return {base:'EUR',quote:'TRY',rate:1,date:fetchedAt.slice(0,10),previousRate:null,previousDate:null,changePercent:null,fetchedAt,sourceUrl:'https://frankfurter.dev/'};
            }`;
            if (id === "virtual:assistant-routing-fixture") return `import { loadPlaces, loadQuote } from ${JSON.stringify(assistantFile)}; globalThis.travelReady = (async () => { await loadPlaces({latitude:52.523,longitude:13.405},'needs'); await loadPlaces({latitude:52.523,longitude:13.405},'explore'); await loadQuote('EUR','TRY'); })();`;
          },
        }],
        build: { write: false, rolldownOptions: { input: "virtual:assistant-routing-fixture", output: { format: "iife" } } },
      });
      const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
      const entry = outputs.find(item => item.type === "chunk" && item.isEntry);
      assert.ok(entry);
      const sandbox = { travelCalls: [], URLSearchParams };
      runInNewContext(entry.code, sandbox);
      await sandbox.travelReady;
      assert.equal(sandbox.travelCalls.length, 3, 'Map discovery cannot issue an AI, allowance or legacy OSM-only request');
      for (const [index, category] of ['essentials', 'culture'].entries()) {
        const call = sandbox.travelCalls[index];
        assert.equal(call.path, '/api/travel-assistant/discover', 'Both map modes stay on the main API even when an optional assistant host is configured');
        assert.equal(call.options.method, 'POST');
        assert.deepEqual(JSON.parse(JSON.stringify(call.options.body)), { latitude: 52.52, longitude: 13.41, category, placeCategoryVersion: 3 });
      }
      assert.equal(sandbox.travelCalls[2].path, `${override}/api/travel-assistant/rates?base=EUR&quote=TRY`);
      for (const call of sandbox.travelCalls) {
        assert.equal(call.options.headers, undefined);
        assert.equal(call.options.credentials, undefined);
        assert.equal(call.options.accessToken, undefined);
      }
    });
  }
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
    const release = outputs.find(item => item.type === "asset" && item.fileName === "release.json");
    assert.ok(release, "Vite emits a provenance manifest");
    assert.equal(JSON.parse(String(release.source)).sourceCommit, resolveMobileSourceIdentity(root));
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


test("public config: only domain-bound MapKit JS tokens enter the client; private/server/unrestricted inputs fail without leaking", () => {
  const encode = claims => [Buffer.from(JSON.stringify({alg:'ES256',typ:'JWT'})).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url'), 'NONFUNCTIONAL_TEST'].join('.');
  const token = encode({scope:'mapkit_js',origin:'www.example.com'});
  assert.equal(resolveMobilePublicConfig({...fixture,VITE_APPLE_MAPS_TOKEN:token}).appleMapsToken, token);
  assert.equal(resolveMobilePublicConfig(fixture).appleMapsToken,'');
  for(const value of ['-----BEGIN PRIVATE KEY-----', encode({scope:'server_api',origin:'www.example.com'}), encode({scope:'mapkit_js server_api',origin:'www.example.com'}), encode({scope:'mapkit_js'}), encode({scope:'mapkit_js',origin:'*'})]) {
    assert.throws(()=>resolveMobilePublicConfig({...fixture,VITE_APPLE_MAPS_TOKEN:value}),error=>error.message.includes('VITE_APPLE_MAPS_TOKEN')&&!error.message.includes(value));
  }
});
