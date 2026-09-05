import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

process.on("uncaughtException",error=>{ console.error("Integrity test failed:",error.message,"position:",error.position || "",error.where || ""); process.exit(1); });
let passed=0;
async function test(name,run) { await run(); passed++; console.log(`✓ ${name}`); }
const read = file => readFileSync(file,"utf8");
// Execute the actual TypeScript modules, substituting only browser IO/network.
function modules(overrides={},globals={}) {
  const cache=new Map();
  const context=vm.createContext({URL,URLSearchParams,Date,Intl,Set,Map,Event,EventTarget,CustomEvent,Request,Response,console,setTimeout,clearTimeout,...globals});
  const load = file => {
    const full=path.resolve(file);
    if(cache.has(full)) return cache.get(full).exports;
    const loaded={exports:{}}; cache.set(full,loaded);
    const source=ts.transpileModule(read(full),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const require=name => Object.hasOwn(overrides,name) ? overrides[name] : load(path.resolve(path.dirname(full),`${name}.ts`));
    vm.runInContext(`(function(require,module,exports){${source}\n})`,context,{filename:full})(require,loaded,loaded.exports);
    return loaded.exports;
  };
  return load;
}
function storage() {
  const data=new Map();
  return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const microtasks=async()=>{for(let i=0;i<200;i++) await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

await test("raw codes, HTTPS links and app links resolve to the same invitation",()=>{
  const {parseTripInvite}=modules()("lib/trip-invite.ts");const token="A_valid-invite-token_123456789";
  for(const input of [token,`https://www.letsgo2travel.com.tr/davet/${token}`,`https://letsgo2travel.com.tr/davet/${token}/?utm_source=share`,`tr.com.letsgo2travel.app://open?tripInvite=${token}`]) assert.equal(parseTripInvite(input),token);
  for(const input of ["", "broken",`https://evil.test/davet/${token}`,"javascript:alert(1)","https://letsgo2travel.com.tr/davet/%ZZ"]) assert.equal(parseTripInvite(input),"");
});
await test("login/signup returns to the invite without allowing external redirects",()=>{
  const {safeAuthNext}=modules()("lib/auth-next.ts");
  assert.equal(safeAuthNext("?next=%2Fdavet%2Fmy-token","https://example.test"),"/davet/my-token");
  for(const next of ["//evil.test","/\\evil.test","https://evil.test"]) assert.equal(safeAuthNext(`?next=${encodeURIComponent(next)}`,"https://example.test"),"/profil");
});
await test("a pending invite survives restart, expires, and clears after acceptance",()=>{
  const localStorage=storage();const load=modules({"./api":{}},{localStorage});
  const invites=load("mobile/src/lib/tripCollaboration.ts");const token="A_valid-invite-token_123456789";
  invites.rememberTripInvite(token);assert.equal(invites.pendingTripInvite("capacitor://localhost"),token);
  invites.rememberTripInvite("");assert.equal(invites.pendingTripInvite("capacitor://localhost"),"");
  localStorage.setItem("l2t:pending-trip-invite:v1",JSON.stringify({code:token,expires:0}));assert.equal(invites.pendingTripInvite("capacitor://localhost"),"");
});
await test("portrait and landscape map drags move the SVG by exactly 100 screen pixels",()=>{
  const map=modules()("mobile/src/lib/mapGeometry.ts");
  for(const [width,height] of [[390,844],[844,390],[320,360]]) {
    const unit=map.mapPixelsPerUnit(width,height);const next=map.boundedMapTransform({scale:10,x:100,y:100},width,height);
    assert.equal(next.y/unit*unit,100);assert.equal(next.x/unit*unit,100);
    const bounded=map.boundedMapTransform({scale:500,x:1e9,y:1e9},width,height);assert.equal(bounded.scale,20);
    assert.ok(bounded.y <= Math.max(0,(400*unit*20-height)/2));
  }
});
await test("recap excludes future/cancelled trips and counts overlapping cross-year days once",()=>{
  const {travelRecap}=modules()("mobile/src/lib/journeyTools.ts");
  const recap=travelRecap([
    {startDate:"2025-12-29",endDate:"2026-01-04",status:"completed"},
    {startDate:"2026-01-03",endDate:"2026-01-07",status:"completed"},
    {startDate:"2026-09-01",endDate:"2026-09-10",status:"active"},
    {startDate:"2026-12-01",endDate:"2026-12-05",status:"upcoming"},
    {startDate:"2026-01-01",endDate:"2026-09-10",status:"cancelled"},
    {startDate:"",endDate:"2026-02-31",status:"completed"}
  ],2026,"2026-09-05");
  assert.equal(recap.trips.length,3);assert.equal(recap.days,12);assert.equal(recap.daysForTrip(recap.trips[0]),4);
});
await test("safety trips remain available offline without caching booking secrets",()=>{
  const localStorage=storage();const tools=modules({},{localStorage})("mobile/src/lib/journeyTools.ts");
  tools.saveSafetyTrips("a",[{id:"one",destinationCode:"XK",flightPnr:"SECRET",startDate:"2026-09-01"}]);
  assert.equal(tools.readSafetyTrips("a")[0].destinationCode,"XK");assert.equal(tools.readSafetyTrips("a")[0].flightPnr,undefined);assert.equal(tools.readSafetyTrips("b").length,0);
});
const entry=(id,remoteId)=>({id,remoteId,title:`Memory ${id}`,note:"A memory",entryDate:"2026-01-01",mood:"✨",place:"Tirana",countryCode:"AL"});
await test("journal rejects empty/impossible/future dates and preserves more than 150 memories",()=>{
  const localStorage=storage(),window=new EventTarget();const journal=modules({},{localStorage,window})("mobile/src/lib/travelJournal.ts");
  for(const date of ["","2026-02-31","2027-01-01"]) assert.equal(journal.validJournalDraft("Title","Note",date,"2026-09-05"),false);
  assert.equal(journal.validJournalDraft("Title","Note","2026-01-01","2026-09-05"),true);
  journal.writeJournal("owner",{entries:Array.from({length:170},(_,i)=>entry(String(i))),deleted:[]});assert.equal(journal.readJournal("owner").entries.length,170);
  localStorage.setItem("l2t.mobile.travel-journal.v1:old",JSON.stringify([{...entry("old"),entryDate:""}]));assert.equal(journal.readJournal("old").entries[0].entryDate,"");
  const original=localStorage.getItem("l2t.mobile.travel-journal.v2:owner");localStorage.setItem=()=>{throw new Error("quota");};
  assert.throws(()=>journal.writeJournal("owner",{entries:[],deleted:[]}));assert.equal(localStorage.getItem("l2t.mobile.travel-journal.v2:owner"),original);
});
await test("journal reconciles remote deletions without resurrecting local tombstones",()=>{
  const {reconcileJournal}=modules()("mobile/src/lib/travelJournal.ts");
  const result=reconcileJournal({entries:[entry("pending"),entry("removed remotely",1),entry("new since fetch",2)],deleted:[{id:"deleted here",remoteId:3}]},[entry("deleted here",3),entry("remote",4)],new Set(["pending","removed remotely"]));
  assert.deepEqual(plain(result.entries.map(item=>item.id).sort()),["new since fetch","pending","remote"]);
});
await test("journal queue syncs all 30 offline entries while its screen is closed",async()=>{
  const localStorage=storage(),window=new EventTarget(),document=new EventTarget();document.visibilityState="visible";
  let saved=0;const api={listUserTrips:async()=>[],upsertUserTrip:async()=>({id:++saved}),deleteUserTrip:async()=>{}};
  const load=modules({"./supabaseData":api},{localStorage,window,document});const journal=load("mobile/src/lib/travelJournal.ts");
  journal.writeJournal("u",{entries:Array.from({length:30},(_,i)=>entry(String(i))),deleted:[]});
  const stop=load("mobile/src/lib/journalSync.ts").startJournalSync("u","token");await microtasks();stop();
  assert.equal(saved,30);assert.ok(journal.readJournal("u").entries.every(item=>item.remoteId!==undefined));
});
await test("failed journal sync retries and a late save cannot undo an in-flight delete",async()=>{
  const localStorage=storage(),window=new EventTarget(),document=new EventTarget();document.visibilityState="visible";
  const response=deferred(),timers=[];let deleted=0,calls=0;
  const api={listUserTrips:async()=>[],upsertUserTrip:async()=>{calls++;if(calls===1)throw new Error("offline");return response.promise;},deleteUserTrip:async()=>{deleted++;}};
  const load=modules({"./supabaseData":api},{localStorage,window,document,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}});
  const journal=load("mobile/src/lib/travelJournal.ts");journal.writeJournal("u",{entries:[entry("one")],deleted:[]});
  const stop=load("mobile/src/lib/journalSync.ts").startJournalSync("u","token");await microtasks();assert.equal(timers.length,1);
  timers.shift()();await microtasks();journal.writeJournal("u",{entries:[],deleted:[{id:"one"}]});response.resolve({id:99});await microtasks();
  while(timers.length) {timers.shift()();await microtasks();}stop();
  assert.equal(deleted,1);assert.equal(journal.readJournal("u").entries.length,0);assert.equal(journal.readJournal("u").deleted[0].remoteId,undefined);
});
await test("stopping sync at sign-out blocks an earlier account response from rewriting storage",async()=>{
  const localStorage=storage(),window=new EventTarget(),document=new EventTarget(),response=deferred();
  const load=modules({"./supabaseData":{listUserTrips:()=>response.promise}},{localStorage,window,document});
  const journal=load("mobile/src/lib/travelJournal.ts");journal.writeJournal("u",{entries:[entry("one")],deleted:[]});
  const stop=load("mobile/src/lib/journalSync.ts").startJournalSync("u","token");stop();response.resolve([]);await microtasks();
  assert.equal(journal.readJournal("u").entries.length,1);
});

function reviewFixture({rpcFailure=false,removeFailure=false,missing=false}={}) {
  const calls=[];
  const chain={select(){return this;},eq(){return this;},in(){return this;},update(){calls.push("clear-path");return this;},maybeSingle:async()=>({data:{id:"55555555-5555-4555-8555-555555555555",status:"pending",evidence_path:"proof.jpg"},error:null}),then(resolve){resolve({error:null});}};
  const client={from:()=>chain,storage:{from:()=>({createSignedUrl:async()=>({error:missing?{message:"not found"}:null}),remove:async()=>{calls.push("remove");return {error:removeFailure?{message:"unavailable",status:503}:null};}})},rpc:async()=>{calls.push("commit");return rpcFailure?{error:{message:"DB failure"}}:{data:{id:"55555555-5555-4555-8555-555555555555",status:"approved",evidencePath:"proof.jpg"}};}};
  const helper=modules({"next/server":{NextResponse:{json:(data,options)=>Response.json(data,options)}},"./supabaseAdmin":{getSupabaseAdmin:()=>client},"./admin-auth":{adminPrincipalFromRequest:async()=>({subject:"11111111-1111-4111-8111-111111111111",role:"admin"})}})("lib/verification-review.ts");
  const run=(action="approve")=>helper.reviewVerification(new Request("https://example.test/review",{method:"POST",body:JSON.stringify({adminNote:"Reviewed"})}),"55555555-5555-4555-8555-555555555555",action);
  return {calls,helper,client,run};
}
await test("API never deletes proof when the approval transaction fails",async()=>{
  const fixture=reviewFixture({rpcFailure:true});assert.equal((await fixture.run()).status,500);assert.deepEqual(fixture.calls,["commit"]);
});
await test("API commits before deleting evidence; failed storage cleanup remains retryable",async()=>{
  const fixture=reviewFixture();assert.equal((await fixture.run()).status,200);assert.deepEqual(fixture.calls,["commit","remove","clear-path"]);
  const failed=reviewFixture({removeFailure:true});const result=await failed.run();assert.equal(result.status,200);assert.equal((await result.json()).cleanupPending,true);assert.deepEqual(failed.calls,["commit","remove"]);
  assert.equal(await failed.helper.cleanupReviewedEvidence(failed.client,{status:"pending",evidencePath:"proof.jpg"}),false);assert.equal(failed.calls.length,2);
});
await test("missing evidence blocks approval but does not prevent rejection",async()=>{
  const missing=reviewFixture({missing:true});assert.equal((await missing.run()).status,422);assert.equal(missing.calls.length,0);
  assert.equal((await missing.run("reject")).status,200);
});

// Real PostgreSQL execution (WASM), not SQL text matching. Use the actual
// table definitions and migrations; only Supabase auth is supplied by a fixture.
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create table auth.users(id uuid primary key);
create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
set "request.jwt.claim.role"='service_role';
create table public.profiles(id uuid primary key references auth.users(id),role text);
create table public.trips(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now());`);
const updates=read("supabase_updates.sql");
await db.exec(updates.slice(updates.indexOf("CREATE TABLE IF NOT EXISTS public.travel_verifications"),updates.indexOf("-- Tablo zaten var")));
await db.exec(read("supabase_belgeli_gezgin.sql").split("-- country_questions")[0]);
await db.exec(read("supabase/migrations/20260905000100_trip_collaboration.sql").replace("create extension if not exists pgcrypto;",""));
const migration=read("supabase/migrations/20260905000200_build24_integrity.sql");
await test("Build 24 migration applies and can be safely rerun",async()=>{await db.exec(migration);await db.exec(migration);});
const owner="11111111-1111-4111-8111-111111111111",editor="22222222-2222-4222-8222-222222222222",viewer="33333333-3333-4333-8333-333333333333",trip="44444444-4444-4444-8444-444444444444",proof="55555555-5555-4555-8555-555555555555",expense="66666666-6666-4666-8666-666666666666";
await db.query("insert into auth.users values($1),($2),($3)",[owner,editor,viewer]);
await db.query("insert into profiles values($1,'admin'),($2,'user'),($3,'user')",[owner,editor,viewer]);
await db.query("insert into trips(id,user_id) values($1,$2)",[trip,owner]);
await db.query("insert into trip_members(trip_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')",[trip,editor,viewer]);
await db.query("insert into travel_verifications(id,user_id,country_code,country_name,verification_method,evidence_path) values($1,$2,'AL','Arnavutluk','document','user/proof.jpg')",[proof,editor]);
const review=()=>db.query("select review_travel_verification($1,$2,'approve','checked','user/proof.jpg')",[proof,owner]);
const add=(actor=owner,id=expense,participants=[owner,editor,viewer])=>db.query("select add_shared_trip_expense($1,$2,$3,'Dinner',100,$2,'2026-01-01',$4,'TRY')",[trip,actor,id,participants]);
await test("a DB failure rolls back approval, unlocks, awards and audit; proof remains",async()=>{
  await db.exec("alter table admin_audit_logs add constraint fail_review check(false)");await assert.rejects(review,/fail_review/);
  assert.equal((await db.query("select status,evidence_path from travel_verifications where id=$1",[proof])).rows[0].status,"pending");
  assert.equal((await db.query("select evidence_path from travel_verifications where id=$1",[proof])).rows[0].evidence_path,"user/proof.jpg");
  for(const table of ["user_country_unlocks","user_points_log","user_badges","country_experience_permissions"]) assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,0);
  await db.exec("alter table admin_audit_logs drop constraint fail_review");
});
await test("approval retry is idempotent and preserves the proof until post-commit cleanup",async()=>{
  await review();await review();assert.equal((await db.query("select count(*)::int as n from user_points_log")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int as n from admin_audit_logs")).rows[0].n,1);
  assert.equal((await db.query("select evidence_path from travel_verifications where id=$1",[proof])).rows[0].evidence_path,"user/proof.jpg");
});
await test("expense and shares roll back together if a share insert fails",async()=>{
  await db.exec("alter table trip_expense_shares add constraint fail_share check(false)");await assert.rejects(add,/fail_share/);
  for(const table of ["trip_expenses","trip_expense_shares","trip_budgets"]) assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,0);
  await db.exec("alter table trip_expense_shares drop constraint fail_share");
});
await test("first expense fixes the currency; retry adds one expense and exact cent shares",async()=>{
  await add();await add();assert.equal((await db.query("select count(*)::int as n from trip_expenses")).rows[0].n,1);
  const shares=(await db.query("select amount from trip_expense_shares order by user_id")).rows.map(row=>Number(row.amount));assert.deepEqual(shares,[33.34,33.33,33.33]);
  assert.equal((await db.query("select currency from trip_budgets where trip_id=$1",[trip])).rows[0].currency,"TRY");
  await assert.rejects(()=>db.query("select set_shared_trip_budget($1,$2,500,'EUR')",[trip,owner]),/currency_locked/);
  await db.query("select set_shared_trip_budget($1,$2,500,'TRY')",[trip,editor]);
});
await test("viewer, foreign payer and nonmember shares cannot create expenses",async()=>{
  const id="77777777-7777-4777-8777-777777777777";
  await assert.rejects(()=>add(viewer,id),/trip_forbidden/);
  await assert.rejects(()=>add(owner,id,[owner,id]),/expense_invalid/);
  await assert.rejects(()=>db.query("select set_shared_trip_budget($1,$2,1,'TRY')",[trip,viewer]),/trip_forbidden/);
});
await test("membership changes cannot remove a participant with expense history",async()=>{
  await assert.rejects(()=>db.query("select change_shared_trip_member($1,$2,$3,'remove_member',null)",[trip,owner,editor]),/financial_history/);
  await assert.rejects(()=>db.query("select change_shared_trip_member($1,$2,$2,'leave_trip',null)",[trip,viewer]),/financial_history/);
  await db.query("select change_shared_trip_member($1,$2,$3,'set_role','viewer')",[trip,owner,editor]);
  assert.equal((await db.query("select role from trip_members where trip_id=$1 and user_id=$2",[trip,editor])).rows[0].role,"viewer");
});
await test("RPC authorization also rejects an authenticated role before doing any work",async()=>{
  await db.exec("set \"request.jwt.claim.role\"='authenticated'");await assert.rejects(add,/service_role_required/);await assert.rejects(review,/service_role_required/);
});
await db.close();
console.log(`\n${passed} integrity regressions passed.`);
