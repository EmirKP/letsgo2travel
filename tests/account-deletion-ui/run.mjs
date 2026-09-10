import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadSource(path, imports) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const sourceModule = { exports: {} };
  vm.runInNewContext(compiled, { module: sourceModule, exports: sourceModule.exports, require: (name) => imports[name] ?? require(name), URL }, { filename: path });
  return sourceModule.exports;
}
const fixture = { id: "request-fixture", status: "pending", createdAt: "2026-09-10T12:00:00.000Z", targetCompletionAt: "2026-10-10T12:00:00.000Z", completedAt: null, notificationStatus: null };
const calls = [];
let response = { request: fixture };
const api = { requestJson: async (path, options) => { calls.push({ path, options }); return response; }, ApiError: class ApiError extends Error {} };
const helpers = loadSource("mobile/src/lib/accountDeletion.ts", { "./api": api });
let passed = 0;
async function test(name, run) { calls.length = 0; await run(); passed += 1; console.log(`PASS ${name}`); }

await test("deletion requires an exact Turkish or English destructive confirmation", async () => {
  assert.equal(helpers.deletionConfirmationMatches(" sil ", "tr"), true);
  assert.equal(helpers.deletionConfirmationMatches(" delete ", "en"), true);
  for (const word of ["", "yes", "SİLME", "DELETE", "sil please"]) assert.equal(helpers.deletionConfirmationMatches(word, "tr"), false);
  await assert.rejects(() => helpers.submitAccountDeletionRequest("test-token", "tr", ""));
  assert.equal(calls.length, 0);
});
await test("deletion submits verified bearer, explicit confirmation and locale without account identity overrides", async () => {
  response = { success: true, request: fixture };
  const result = await helpers.submitAccountDeletionRequest("test-token", "tr", "SİL");
  assert.equal(result.id, fixture.id);
  assert.equal(calls[0].path, "/api/kvkk-requests");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.body)), { requestType: "Hesabımı kapatmak istiyorum", confirmed: true, locale: "tr" });
});
await test("empty request is distinct from malformed success or stale API responses", async () => {
  response = { request: null };
  assert.equal(await helpers.getAccountDeletionRequest("test-token"), null);
  response = { success: true };
  await assert.rejects(() => helpers.getAccountDeletionRequest("test-token"));
  await assert.rejects(() => helpers.submitAccountDeletionRequest("test-token", "en", "DELETE"));
  assert.throws(() => helpers.readDeletionRequest({ ...fixture, status: "deleted-maybe" }));
  assert.throws(() => helpers.readDeletionRequest({ ...fixture, createdAt: "not-a-date" }));
});
await test("pending and reviewing requests block duplicate submissions; terminal states remain distinct", () => {
  for (const status of ["pending", "reviewing"]) assert.equal(helpers.hasPendingDeletion({ ...fixture, status }), true);
  for (const status of ["processed", "resolved", "rejected"]) assert.equal(helpers.hasPendingDeletion({ ...fixture, status }), false);
  assert.equal(helpers.hasPendingDeletion(null), false);
});
await test("Apple verification URLs must be the exact official authorization endpoint", async () => {
  const valid = "https://appleid.apple.com/auth/authorize?client_id=app.example&state=opaque";
  assert.equal(helpers.validAppleDeletionUrl(valid), true);
  for (const url of ["https://appleid.apple.com.evil.test/auth/authorize", "http://appleid.apple.com/auth/authorize", "https://user@appleid.apple.com/auth/authorize", "https://appleid.apple.com/other", "javascript:alert(1)"]) assert.equal(helpers.validAppleDeletionUrl(url), false);
  response = { ok: true, authorizationUrl: valid };
  assert.equal(await helpers.startAppleDeletionAuthorization("test-token"), valid);
  assert.equal(calls[0].path, "/api/account/apple-deletion/start");
  assert.equal(calls[0].options.body.confirmed, true);
  response = { ok: true, authorizationUrl: "https://untrusted.example/" };
  await assert.rejects(() => helpers.startAppleDeletionAuthorization("test-token"));
});

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { AccountDeletionRequestSummary } = loadSource("mobile/src/components/AccountDeletionPanel.tsx", {
  "../lib/api": api,
  "../lib/accountDeletion": helpers,
  "../lib/i18n": { useI18n: () => ({ copy: (_tr, en) => en, dateLocale: "en-US", locale: "en" }) },
  "../lib/native": {}, "./Icon": {}, "./SupportSheet": {}, "./account-deletion.css": {},
});
const summary = (request) => renderToStaticMarkup(React.createElement(AccountDeletionRequestSummary, { request, email: "fixture@example.com" }));
await test("pending summary shows server submission, 30-day deadline and result email", () => {
  const html = summary(fixture);
  assert.match(html, /Request received/);
  assert.match(html, /Sep 10, 2026/);
  assert.match(html, /Oct 10, 2026/);
  assert.match(html, /Resolution due by/);
  assert.match(html, /fixture@example.com/);
  assert.doesNotMatch(html, /Completed/);
});
await test("completed summary separates deletion completion from email delivery", () => {
  const html = summary({ ...fixture, status: "processed", completedAt: "2026-09-14T12:00:00.000Z", notificationStatus: "pending" });
  assert.match(html, /Completed/);
  assert.match(html, /Sep 14, 2026/);
  assert.match(html, /waiting to be sent by email/);
  assert.doesNotMatch(html, /Resolution due by/);
  const sent = summary({ ...fixture, status: "processed", notificationStatus: "sent" });
  assert.match(sent, /passed to the email delivery service/);
  assert.doesNotMatch(sent, /delivered to your inbox/);
});
await test("a rejected request never reports that the account was deleted", () => {
  const html = summary({ ...fixture, status: "rejected" });
  assert.match(html, /Request reviewed/);
  assert.match(html, /Check your email for the outcome or contact support/);
  assert.doesNotMatch(html, /Completed|account was deleted/);
});
console.log(`PASS ${passed} account deletion UI checks`);
