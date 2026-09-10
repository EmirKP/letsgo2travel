import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadSource(path, imports = {}, globals = {}) {
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const sourceModule = { exports: {} };
  vm.runInNewContext(compiled, { module: sourceModule, exports: sourceModule.exports, require: (name) => imports[name] ?? require(name), URL, ...globals }, { filename: path });
  return sourceModule.exports;
}

const support = loadSource("mobile/src/lib/support.ts");
let passed = 0;
async function test(name, run) { await run(); passed += 1; console.log(`PASS ${name}`); }
function nativeHarness({ native = true, assign = () => {}, clipboard } = {}) {
  const calls = [];
  const api = loadSource("mobile/src/lib/native.ts", {
    "./capacitor": { isNativePlatform: () => native, plugin: (name) => ({ open: async (options) => { calls.push([name, options.url]); } }) },
    "./config": { config: { apiBaseUrl: "https://www.letsgo2travel.com.tr" } },
    "./storage": { getMobilePreferences: () => ({ haptics: false }) },
    "./support": support,
  }, { window: { location: { assign }, open: (...args) => { calls.push(["window.open", ...args]); return {}; } }, navigator: { clipboard } });
  return { api, calls };
}
const draft = support.createSupportDraft("hello@letsgo2travel.com.tr", "1.4.0", "29", "tr");

await test("support draft includes only user-reviewable version/build metadata", () => {
  assert.deepEqual(Object.keys(draft).sort(), ["body", "email", "subject"]);
  assert.match(draft.body, /Uygulama: 1\.4\.0\nBuild: 29$/);
  assert.doesNotMatch(draft.body, /token|pnr|location|session|Supabase|sourceCommit/i);
  const edited = { ...draft, subject: "A&B + destek", body: "Birinci satır\nİkinci & üçüncü + satır" };
  const mail = new URL(support.supportMailto(edited));
  assert.equal(mail.searchParams.get("subject"), edited.subject);
  assert.equal(mail.searchParams.get("body"), edited.body);
});
await test("mail URLs reject extra recipients and header injection", () => {
  for (const email of ["a@example.com?bcc=b@example.com", "a@example.com,b@example.com", "a@example.com\r\nBcc:b@example.com", "a@example.com%0abcc=b@example.com"]) {
    assert.equal(support.supportMailto({ ...draft, email }), "");
  }
  const mail = new URL(support.supportMailto({ ...draft, subject: "Support\r\nBcc: other@example.com" }));
  assert.equal(mail.searchParams.has("bcc"), false);
  assert.doesNotMatch(mail.searchParams.get("subject"), /[\r\n]/);
});
await test("native mail uses system navigation and never the unsupported Browser plugin", () => {
  let handedOff = "";
  const { api, calls } = nativeHarness({ assign: (url) => { handedOff = url; } });
  assert.equal(api.openMailDraft(draft), "handoff");
  assert.equal(new URL(handedOff).protocol, "mailto:");
  assert.deepEqual(calls, []);
});
await test("no mail client cannot produce an opened or sent claim; a rejected handoff is unavailable", () => {
  // iOS completionHandler is nil; Android catches ActivityNotFoundException.
  // Both can silently accept navigation without a mail app. The UI retains its fallback.
  assert.equal(nativeHarness({ assign: () => {} }).api.openMailDraft(draft), "handoff");
  assert.equal(nativeHarness({ assign: () => { throw new Error("unsupported"); } }).api.openMailDraft(draft), "unavailable");
});
await test("web mail handoff preserves editable body and does not open a blank browser tab", () => {
  let handedOff = "";
  const { api, calls } = nativeHarness({ native: false, assign: (url) => { handedOff = url; } });
  assert.equal(api.openMailDraft({ ...draft, body: "My reviewed message" }), "handoff");
  assert.equal(new URL(handedOff).searchParams.get("body"), "My reviewed message");
  assert.deepEqual(calls, []);
});
await test("HTTPS OAuth and advice links still use Browser on native and window.open on web", async () => {
  const native = nativeHarness();
  assert.equal(await native.api.openExternal("https://example.com/oauth?state=example"), true);
  assert.equal(native.calls[0][0], "Browser");
  assert.equal(await native.api.openExternal("mailto:hello@example.com"), false);
  assert.equal(await native.api.openExternal("javascript:alert(1)"), false);
  const web = nativeHarness({ native: false });
  assert.equal(await web.api.openExternal("/destek"), true);
  assert.equal(web.calls[0][0], "window.open");
});
await test("clipboard absent or denied returns a manual-copy fallback instead of throwing", async () => {
  assert.equal(await nativeHarness().api.copySupportText(draft.email), false);
  assert.equal(await nativeHarness({ clipboard: { writeText: async () => { throw new Error("denied"); } } }).api.copySupportText(draft.email), false);
  let copied = "";
  assert.equal(await nativeHarness({ clipboard: { writeText: async (value) => { copied = value; } } }).api.copySupportText(draft.email), true);
  assert.equal(copied, draft.email);
});
await test("the support screen exposes a permanent no-mail fallback and reviewable draft", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { SupportSheet } = loadSource("mobile/src/components/SupportSheet.tsx", {
    "../lib/config": { config: { supportEmail: draft.email, appVersion: "1.4.0", buildNumber: "29" } },
    "../lib/i18n": { useI18n: () => ({ locale: "tr", copy: (tr) => tr }) },
    "../lib/native": nativeHarness().api,
    "../lib/support": support,
    "./Sheet": { Sheet: ({ children }) => React.createElement("section", null, children) },
    "./support-sheet.css": {},
  });
  const html = renderToStaticMarkup(React.createElement(SupportSheet, { open: true, onClose: () => {} }));
  assert.match(html, /E-posta uygulaman yoksa/);
  assert.match(html, /Buradan otomatik mesaj gönderilmez/);
  assert.match(html, /Web destek sayfası/);
  assert.match(html, /Taslağı kopyala/);
  assert.match(html, /Build: 29/);
  assert.match(html, /hello@letsgo2travel.com.tr/);
});
console.log(`PASS ${passed} support checks`);
