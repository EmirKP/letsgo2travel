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
await test("Albanian deletion requires FSHI and does not accept another locale's confirmation", async () => {
  assert.equal(helpers.deletionConfirmationMatches(" fshi ", "sq"), true);
  for (const word of ["", "po", "DELETE", "SİL", "fshi tani"]) assert.equal(helpers.deletionConfirmationMatches(word, "sq"), false);
  await assert.rejects(() => helpers.submitAccountDeletionRequest("test-token", "sq", "DELETE"));
  assert.equal(calls.length, 0);
  response = { success: true, request: fixture };
  assert.equal((await helpers.submitAccountDeletionRequest("test-token", "sq", "FSHI")).id, fixture.id);
  assert.equal(calls[0].options.body.confirmed, true);
  assert.equal(calls[0].options.body.locale, "en", "Server notifications keep their supported language contract");
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
  "../lib/personalTravelCards": {},
  "../lib/communityPreferences": {},
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
const jsx = (type, props) => ({ type, props });
const nodes = value => value && typeof value === 'object' ? [value,...[value.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : typeof value === 'string' ? value : value?.props ? text(value.props.children) : '';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deletionPanel({ failRequest=false, failCleanup=false, failFollows=false, responseStatus='pending' }={}) {
  const slots=[];let cursor=0,dirty=false,effects=[],submitted=0;const cleared=[],followsCleared=[];
  const changed=(left,right)=>!left||!right||right.some((value,i)=>!Object.is(value,left[i]));
  const memo=(fn,deps)=>{const index=cursor++;if(!slots[index]||changed(slots[index].deps,deps))slots[index]={deps,value:fn()};return slots[index].value;};
  const hooks={
    useState(initial){const index=cursor++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,next=>{const value=typeof next==='function'?next(slots[index].value):next;if(!Object.is(value,slots[index].value)){slots[index].value=value;dirty=true;}}];},
    useRef(initial){const index=cursor++;if(!slots[index])slots[index]={current:initial};return slots[index];},useId:()=> 'fixture-confirmation',useCallback:(fn,deps)=>memo(()=>fn,deps),
    useEffect(fn,deps){const index=cursor++,old=slots[index];if(!old||changed(old.deps,deps)){slots[index]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[index].cleanup=fn();});}},
  };
  const i18n={copy:(_tr,en)=>en,locale:'en',dateLocale:'en-GB'};
  const {AccountDeletionPanel}=loadSource('mobile/src/components/AccountDeletionPanel.tsx',{
    react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/api':api,
    '../lib/accountDeletion':{...helpers,getAccountDeletionRequest:async()=>null,getAppleDeletionStatus:async()=>({required:false,status:'not_required'}),submitAccountDeletionRequest:async()=>{submitted++;if(failRequest)throw Error('offline');return {...fixture,status:responseStatus};}},
    '../lib/i18n':{useI18n:()=>i18n},'../lib/personalTravelCards':{clearPersonalTravelCards:owner=>{cleared.push(owner);return !failCleanup;}},
    '../lib/communityPreferences':{clearCommunityFollows:owner=>{followsCleared.push(owner);return !failFollows;}},
    '../lib/native':{},'./Icon':{Icon:'Icon'},'./SupportSheet':{SupportSheet:'SupportSheet'},'./account-deletion.css':{},
  });
  const props={ownerId:'owner-a',accessToken:'test-token',email:'fixture@example.com',onBusyChange(){}};
  const render=()=>{for(let i=0;i<15;i++){cursor=0;dirty=false;effects=[];const tree=AccountDeletionPanel(props);effects.forEach(fn=>fn());if(!dirty)return tree;}throw Error('Unstable hooks');};
  const button=label=>nodes(render()).find(node=>node.type==='button'&&text(node.props.children).trim()===label);
  return {render,cleared,followsCleared,button,submitted:()=>submitted,recoverCleanup:()=>{failCleanup=false;failFollows=false;},dispose:()=>slots.forEach(slot=>slot?.cleanup?.()),async confirm(){render();await tick();button('Request account deletion')?.props.onClick();nodes(render()).find(node=>node.type==='input').props.onChange({target:{value:'DELETE'}});button('Submit permanent account deletion request').props.onClick();await tick();}};
}
await test('accepted account deletion clears the confirmed owner device cards only after explicit confirmation',async()=>{
  const panel=deletionPanel();try{panel.render();await tick();assert.equal(panel.cleared.length,0);assert.equal(panel.followsCleared.length,0);panel.button('Request account deletion').props.onClick();assert.match(text(panel.render()),/country-group follows are also immediately deleted from this device/);assert.equal(panel.cleared.length,0);assert.equal(panel.followsCleared.length,0);await panel.confirm();assert.deepEqual(panel.cleared,['owner-a']);assert.deepEqual(panel.followsCleared,['owner-a']);assert.match(text(panel.render()),/deletion request was received/);}finally{panel.dispose();}
});
await test('failed account deletion request preserves personal device cards',async()=>{
  const panel=deletionPanel({failRequest:true});try{await panel.confirm();assert.equal(panel.cleared.length,0);assert.equal(panel.followsCleared.length,0);assert.match(text(panel.render()),/request could not be sent/);}finally{panel.dispose();}
});
await test('device cleanup failure keeps server success and offers a separate local retry',async()=>{
  const panel=deletionPanel({failCleanup:true});try{await panel.confirm();assert.deepEqual(panel.cleared,['owner-a']);assert.deepEqual(panel.followsCleared,['owner-a'],'A failed card cleanup must not skip follows cleanup');const view=text(panel.render());assert.match(view,/deletion request was received/);assert.match(view,/could not be cleared/);assert.doesNotMatch(view,/request could not be sent/);assert.ok(panel.button('Retry clearing device data'));}finally{panel.dispose();}
});
await test('failed follows cleanup offers a local retry without resubmitting account deletion',async()=>{
  const panel=deletionPanel({failFollows:true});try{await panel.confirm();assert.deepEqual(panel.cleared,['owner-a']);assert.deepEqual(panel.followsCleared,['owner-a']);assert.match(text(panel.render()),/could not be cleared completely/);panel.recoverCleanup();panel.button('Retry clearing device data').props.onClick();assert.deepEqual(panel.cleared,['owner-a','owner-a']);assert.deepEqual(panel.followsCleared,['owner-a','owner-a']);assert.equal(panel.submitted(),1);assert.match(text(panel.render()),/country-group follows were cleared from this device/);assert.doesNotMatch(text(panel.render()),/could not be cleared/);}finally{panel.dispose();}
});
await test('a rejected deletion response leaves device cards and followed countries unchanged',async()=>{
  const panel=deletionPanel({responseStatus:'rejected'});try{await panel.confirm();assert.deepEqual(panel.cleared,[]);assert.deepEqual(panel.followsCleared,[]);}finally{panel.dispose();}
});
console.log(`PASS ${passed} account deletion UI checks`);
