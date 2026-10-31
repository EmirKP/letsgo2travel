import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const migration = 'supabase/migrations/20261018120000_account_ai_route_allowance.sql';
const cutoverMigration = 'supabase/migrations/20261018120100_ai_route_allowance_cutover.sql';
const threeRouteMigration = 'supabase/migrations/20261020120000_three_daily_ai_routes.sql';
const migrations = ['20261014150000_journey_plan_quota', '20261014170000_journey_plan_reservations', '20261015100000_journey_plan_recovery'];
const hash = 'a'.repeat(64);
const require = createRequire(import.meta.url);
async function database({ latest = true } = {}) {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
  for (const name of migrations) await db.exec(readFileSync(`supabase/migrations/${name}.sql`, 'utf8'));
  const user = randomUUID(), other = randomUUID();
  await db.query('insert into auth.users values($1),($2)', [user, other]);
  await db.exec(readFileSync(migration, 'utf8')); await db.exec(readFileSync(migration, 'utf8'));
  if (latest) {
    await db.exec(readFileSync(cutoverMigration, 'utf8'));
    await db.exec(readFileSync(threeRouteMigration, 'utf8')); await db.exec(readFileSync(threeRouteMigration, 'utf8'));
  }
  const rpc = async (name, args) => (await db.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key} => $${i + 1}`).join(',')}) as result`, Object.values(args))).rows[0].result;
  return { db, user, other, rpc,
    begin: (owner = user, operation = randomUUID(), attempt = randomUUID(), kind = 'journey', requestHash = hash) => rpc('begin_ai_route_operation', { p_owner: owner, p_operation: operation, p_hash: requestHash, p_kind: kind, p_attempt: attempt }),
    finish: (owner, operation, attempt, result) => rpc('complete_ai_route_operation', { p_owner: owner, p_operation: operation, p_attempt: attempt, p_result: result }),
    quota: (owner = user) => rpc('get_ai_route_quota', { p_owner: owner }),
    minutes: () => db.exec("update public.ai_route_account_attempts set minute=now()-interval '2 minutes'") };
}

test('Real SQL shares three successful daily routes across both endpoints, retries failures and replays without charging twice', async () => {
  const x = await database();
  try {
    assert.deepEqual(await x.quota(), { limit: 3, used: 0, remaining: 3, pending: false, resetAt: `${new Date(Date.now()+86400000).toISOString().slice(0,10)}T00:00:00Z`, timeZone: 'UTC' });
    const op = randomUUID(), first = randomUUID(), rival = randomUUID(), result = { generatedBy: 'ai', summary: 'Real complete plan' };
    const pair = await Promise.all([x.begin(x.user, op, first), x.begin(x.user, randomUUID(), rival, 'suggestions')]);
    assert.deepEqual(pair.map(row => row.state), ['acquired', 'pending']);
    assert.equal(pair[0].quota.remaining, 0); assert.equal(pair[0].quota.used, 0);
    assert.equal((await x.finish(x.user, op, first, null)).ok, true);
    assert.equal((await x.quota()).remaining, 3);
    const second = randomUUID(); assert.equal((await x.begin(x.user, op, second)).state, 'acquired');
    assert.equal((await x.finish(x.user, op, first, result)).ok, false, 'Old failed worker cannot commit a newer attempt');
    assert.equal((await x.finish(x.user, op, second, result)).ok, true);
    assert.equal((await x.quota()).remaining, 2);
    assert.equal((await x.finish(x.user, op, second, result)).ok, true);
    assert.equal((await x.finish(x.user, op, second, null)).ok, false);
    assert.equal((await x.finish(x.user, op, second, { summary: 'changed' })).ok, false);
    await x.minutes();
    const secondOp = randomUUID(), secondAttempt = randomUUID(), secondResult = { suggestions: ['Real complete alternative'] };
    assert.equal((await x.begin(x.user, secondOp, secondAttempt, 'suggestions')).state, 'acquired');
    assert.equal((await x.finish(x.user, secondOp, secondAttempt, secondResult)).ok, true);
    assert.equal((await x.quota()).remaining, 1);
    await x.minutes();
    const thirdOp = randomUUID(), thirdAttempt = randomUUID();
    const failedThird = randomUUID();
    assert.equal((await x.begin(x.user, thirdOp, failedThird)).state, 'acquired');
    assert.equal((await x.finish(x.user, thirdOp, failedThird, null)).ok, true);
    assert.equal((await x.finish(x.user, thirdOp, failedThird, null)).ok, true);
    assert.equal((await x.quota()).remaining, 1, 'A failed attempt and its repeated release preserve the final daily route');
    const lastSlot = await Promise.all([x.begin(x.user, thirdOp, thirdAttempt), x.begin(x.user, randomUUID(), randomUUID(), 'suggestions')]);
    assert.deepEqual(lastSlot.map(row => row.state), ['acquired', 'pending'], 'The final daily slot still has only one live worker');
    assert.equal(lastSlot[0].quota.used, 2); assert.equal(lastSlot[0].quota.remaining, 0);
    const commits = await Promise.all([x.finish(x.user, thirdOp, thirdAttempt, result), x.finish(x.user, thirdOp, thirdAttempt, result)]);
    assert.deepEqual(commits.map(row => row.ok), [true, true]);
    assert.equal((await x.quota()).used, 3); assert.equal((await x.quota()).remaining, 0);
    assert.equal((await x.begin(x.user, randomUUID(), randomUUID(), 'suggestions')).state, 'limit', 'A fourth successful route is not admitted');
    const replay = await x.begin(x.user, op); assert.equal(replay.state, 'succeeded'); assert.deepEqual(replay.result, result);
    assert.deepEqual((await x.begin(x.user, secondOp, randomUUID(), 'suggestions')).result, secondResult);
    assert.equal((await x.quota()).used, 3, 'Replaying different successful endpoint receipts does not spend another allowance');
    assert.equal((await x.begin(x.user, op, randomUUID(), 'journey', 'b'.repeat(64))).state, 'conflict');
    assert.equal((await x.begin(x.user, op, randomUUID(), 'suggestions')).state, 'conflict');
    assert.equal((await x.begin(x.other, op)).state, 'acquired', 'Other account has its own allowance and cannot read result');
    assert.equal((await x.finish(x.other, op, second, result)).ok, false);
    assert.equal((await x.db.query('select count(*)::int as n from public.ai_route_daily_usage')).rows[0].n, 1);
    assert.equal((await x.db.query('select sum(used)::int as n from public.ai_route_daily_usage')).rows[0].n, 3);
  } finally { await x.db.close(); }
});

test('Expired leases, cancellation-before-admission and UTC resets never consume or resurrect the wrong allowance', async () => {
  const x = await database();
  try {
    const op = randomUUID(), cancelled = randomUUID(), old = randomUUID(), fresh = randomUUID();
    assert.equal((await x.finish(x.user, op, cancelled, null)).ok, true);
    assert.equal((await x.begin(x.user, op, cancelled)).state, 'cancelled');
    assert.equal((await x.begin(x.user, op, old)).state, 'acquired');
    await x.db.query("update public.ai_route_operations set lease_until=now()-interval '1 second' where owner_id=$1", [x.user]);
    assert.equal((await x.quota()).remaining, 3);
    assert.equal((await x.begin(x.user, op, fresh)).state, 'acquired');
    assert.equal((await x.finish(x.user, op, old, { old: true })).ok, false);
    assert.equal((await x.finish(x.user, op, fresh, { new: true })).ok, true);
    await x.db.exec('update public.ai_route_daily_usage set used=3');
    assert.equal((await x.quota()).remaining, 0);
    await x.db.exec("update public.ai_route_daily_usage set day=day-1");
    assert.equal((await x.quota()).remaining, 3);
    await x.minutes(); const today = randomUUID(), attempt = randomUUID();
    assert.equal((await x.begin(x.user, today, attempt, 'suggestions')).state, 'acquired');
    assert.equal((await x.finish(x.user, today, attempt, { success: true })).ok, true);
    assert.equal((await x.quota()).used, 1);
    assert.equal((await x.begin(x.user, op)).state, 'succeeded', 'Yesterday result replays without spending again');
    assert.equal((await x.quota()).remaining, 2);
    await x.db.query("update public.ai_route_operations set expires_at=now()-interval '1 second' where operation_id=$1", [op]);
    assert.equal((await x.begin(x.user, op)).state, 'expired');
    const resetAt = (await x.quota()).resetAt;
    await x.db.exec("set timezone='Pacific/Honolulu'");
    assert.equal((await x.quota()).resetAt, resetAt, 'Session time zone cannot change the UTC reset');
    const ledger = (await x.db.query('select day::text,used from public.ai_route_daily_usage order by day')).rows;
    assert.deepEqual(ledger, [{ day: new Date(Date.now()-86400000).toISOString().slice(0,10), used: 3 }, { day: new Date().toISOString().slice(0,10), used: 1 }], 'Yesterday remains spent and the new UTC day has its independent counter');
  } finally { await x.db.close(); }
});

test('Failure retry throttling is separate from daily success; missing accounts and direct browser roles fail closed', async () => {
  const x = await database();
  try {
    for (let i=0;i<2;i++) { const op=randomUUID(), attempt=randomUUID(); assert.equal((await x.begin(x.user,op,attempt)).state,'acquired'); await x.finish(x.user,op,attempt,null); }
    assert.equal((await x.begin()).state,'busy'); assert.equal((await x.quota()).remaining,3);
    await x.minutes(); assert.equal((await x.begin()).state,'acquired');
    assert.equal((await x.begin(randomUUID())).state,'invalid'); assert.equal(await x.quota(randomUUID()),null);
    const grants=(await x.db.query("select has_function_privilege('authenticated','public.begin_ai_route_operation(uuid,uuid,text,text,uuid)','execute') as begin,has_function_privilege('anon','public.get_ai_route_quota(uuid)','execute') as status,has_function_privilege('authenticated','public.complete_ai_route_operation(uuid,uuid,uuid,jsonb)','execute') as finish,has_function_privilege('anon','public.reserve_ai_route_provider_attempt(uuid,integer)','execute') as provider,has_function_privilege('authenticated','public.settle_ai_route_provider_attempt(uuid,integer)','execute') as settle,has_table_privilege('authenticated','public.ai_route_operations','select') as read,has_table_privilege('authenticated','public.ai_route_daily_usage','insert') as write")).rows[0];
    assert.deepEqual(grants,{begin:false,status:false,finish:false,provider:false,settle:false,read:false,write:false});
    await x.db.query('delete from auth.users where id=$1',[x.user]);
    for(const table of ['ai_route_operations','ai_route_daily_usage','ai_route_cancelled_attempts','ai_route_account_attempts']) assert.equal((await x.db.query(`select count(*)::int as n from public.${table} where owner_id=$1`,[x.user])).rows[0].n,0);
  } finally { await x.db.close(); }
});

test('Three-route migration retains current usage, live attempts, replay receipts and provider spend without resetting on reapply', async () => {
  const x = await database({ latest: false });
  try {
    const op = randomUUID(), attempt = randomUUID(), result = { summary: 'Committed before the allowance upgrade' };
    assert.equal((await x.begin(x.user, op, attempt)).state, 'acquired');
    assert.equal((await x.finish(x.user, op, attempt, result)).ok, true);
    assert.equal((await x.begin()).state, 'limit', 'The installed 20261018 schema starts with one daily allowance');
    const cancelledOp = randomUUID(), cancelledAttempt = randomUUID(), pendingOp = randomUUID(), pendingAttempt = randomUUID(), provider = randomUUID();
    assert.equal((await x.begin(x.other, cancelledOp, cancelledAttempt)).state, 'acquired');
    assert.equal((await x.finish(x.other, cancelledOp, cancelledAttempt, null)).ok, true);
    assert.equal((await x.begin(x.other, pendingOp, pendingAttempt, 'suggestions')).state, 'acquired');
    assert.equal((await x.rpc('reserve_ai_route_provider_attempt', { p_request: provider, p_tokens: 6000 })).allowed, true);
    const receiptsBefore = (await x.db.query('select * from public.ai_route_operations order by owner_id,operation_id')).rows;
    await x.db.exec(readFileSync(cutoverMigration, 'utf8'));
    await x.db.exec(readFileSync(threeRouteMigration, 'utf8')); await x.db.exec(readFileSync(threeRouteMigration, 'utf8'));
    assert.deepEqual((await x.db.query('select * from public.ai_route_operations order by owner_id,operation_id')).rows, receiptsBefore, 'Migration preserves receipt results, identities and lease deadlines');
    assert.equal((await x.quota()).limit, 3); assert.equal((await x.quota()).used, 1); assert.equal((await x.quota()).remaining, 2);
    assert.equal((await x.quota(x.other)).pending, true); assert.equal((await x.quota(x.other)).remaining, 0);
    assert.equal((await x.begin(x.other)).state, 'pending', 'An in-flight old request still holds the sole account reservation');
    assert.equal((await x.finish(x.other, pendingOp, pendingAttempt, null)).ok, true);
    assert.equal((await x.quota(x.other)).remaining, 3, 'Failure after migration leaves all three successes available');
    assert.equal((await x.begin(x.other, cancelledOp, cancelledAttempt)).state, 'cancelled', 'Cancelled-attempt tombstones survive');
    assert.deepEqual((await x.begin(x.user, op)).result, result);
    const providerRow = (await x.db.query('select tokens,reserved_tokens,settled from public.ai_route_provider_attempts where request_id=$1', [provider])).rows[0];
    assert.deepEqual(providerRow, { tokens: 6000, reserved_tokens: 6000, settled: false }, 'Raising the account limit never resets the free-provider budget');
    for (let used = 2; used <= 3; used++) {
      await x.minutes(); const nextOp = randomUUID(), nextAttempt = randomUUID();
      assert.equal((await x.begin(x.user, nextOp, nextAttempt, used === 2 ? 'suggestions' : 'journey')).state, 'acquired');
      assert.equal((await x.finish(x.user, nextOp, nextAttempt, { summary: `Success ${used}` })).ok, true);
      await x.db.exec(readFileSync(threeRouteMigration, 'utf8'));
      assert.equal((await x.quota()).used, used, 'Rerunning the migration retains accumulated successes');
      assert.equal((await x.quota()).remaining, 3 - used);
    }
    assert.equal((await x.begin()).state, 'limit');
    for (const used of [0, 4]) await assert.rejects(() => x.db.query('update public.ai_route_daily_usage set used=$1 where owner_id=$2', [used, x.user]), /ai_route_daily_usage_used_check/);
    assert.equal((await x.quota()).used, 3, 'Invalid counter writes cannot expand or erase the allowance');
    for (const signature of ['get_ai_route_quota(uuid)', 'begin_ai_route_operation(uuid,uuid,text,text,uuid)', 'complete_ai_route_operation(uuid,uuid,uuid,jsonb)']) {
      const grants = (await x.db.query("select has_function_privilege('service_role',$1,'execute') as service,has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as authenticated", [`public.${signature}`])).rows[0];
      assert.deepEqual(grants, { service: true, anon: false, authenticated: false });
    }
  } finally { await x.db.close(); }
});

test('The successful commit itself is bounded to three even when another service-created pending receipt exists', async () => {
  const x = await database();
  try {
    await x.db.query("insert into public.ai_route_daily_usage(owner_id,day,used) values($1,(clock_timestamp() at time zone 'UTC')::date,2)", [x.user]);
    const op = randomUUID(), attempt = randomUUID(), extraOp = randomUUID(), extraAttempt = randomUUID();
    assert.equal((await x.begin(x.user, op, attempt)).state, 'acquired');
    // Simulate a stale service worker bypassing admission. Completion must still
    // enforce the durable account bound rather than trusting the caller.
    await x.db.query("insert into public.ai_route_operations(owner_id,operation_id,request_hash,kind,attempt_id,state,lease_until,expires_at) values($1,$2,$3,'suggestions',$4,'pending',clock_timestamp()+interval '90 seconds',clock_timestamp()+interval '24 hours')", [x.user, extraOp, hash, extraAttempt]);
    const completions = await Promise.all([x.finish(x.user, op, attempt, { summary: 'Third success' }), x.finish(x.user, extraOp, extraAttempt, { summary: 'Denied fourth success' })]);
    assert.deepEqual(completions.map(value => value.ok), [true, false]);
    assert.equal((await x.quota()).used, 3);
    assert.equal((await x.finish(x.user, extraOp, extraAttempt, null)).ok, true);
    assert.equal((await x.quota()).remaining, 0, 'Releasing a denied result never refunds another committed route');
    assert.equal((await x.begin()).state, 'limit');
    assert.equal((await x.begin(x.user, extraOp, randomUUID(), 'suggestions')).state, 'limit');
  } finally { await x.db.close(); }
});

test('Upgrade preserves legacy successes and result recovery, and old deployed RPC entry points cannot bypass the new allowance', async () => {
  const x=await database({ latest: false });
  try {
    const op=randomUUID(),attempt=randomUUID(),actor='b'.repeat(64),result={generatedBy:'ai',summary:'Previously committed'};
    await x.rpc('begin_journey_plan_operation',{p_actor:actor,p_operation:op,p_hash:hash,p_owner:x.user,p_guest:false,p_attempt:attempt});
    await x.rpc('complete_journey_plan_operation',{p_actor:actor,p_operation:op,p_attempt:attempt,p_result:result});
    // Additive schema shipped before this old-deployment success. Cutover must
    // reconcile it even if the additive migration is not run again.
    await x.db.exec(readFileSync(cutoverMigration,'utf8')); await x.db.exec(readFileSync(cutoverMigration,'utf8'));
    assert.equal((await x.quota()).used,1);
    await x.db.exec(readFileSync(migration,'utf8')); await x.db.exec(readFileSync(migration,'utf8'));
    await x.db.exec(readFileSync(cutoverMigration,'utf8')); await x.db.exec(readFileSync(cutoverMigration,'utf8'));
    assert.equal((await x.quota()).used,1);
    await x.db.exec(readFileSync(threeRouteMigration,'utf8')); await x.db.exec(readFileSync(threeRouteMigration,'utf8'));
    assert.equal((await x.quota()).used,1); assert.equal((await x.quota()).remaining,2);
    assert.deepEqual((await x.begin(x.user,op)).result,result);
    const next = randomUUID(), nextAttempt = randomUUID();
    assert.equal((await x.begin(x.user,next,nextAttempt,'suggestions')).state,'acquired');
    assert.equal((await x.finish(x.user,next,nextAttempt,{summary:'After cutover'})).ok,true);
    assert.equal((await x.quota()).remaining,1);
    for(const signature of ['consume_journey_plan_quota(text,boolean)','reserve_journey_plan_quota(text,boolean,uuid)','finish_journey_plan_quota(text,uuid,boolean)','begin_journey_plan_operation(text,uuid,text,uuid,boolean,uuid)','complete_journey_plan_operation(text,uuid,uuid,jsonb)']) {
      assert.equal((await x.db.query("select has_function_privilege('service_role',$1,'execute') as allowed",[`public.${signature}`])).rows[0].allowed,false,signature);
    }
    await x.db.exec('set role service_role');
    await assert.rejects(()=>x.db.query('select public.consume_journey_plan_quota($1,false)',[actor]),/permission denied/);
    await x.db.exec('reset role');
  }finally{await x.db.close();}
});

test('Cutover preserves history and payloads until the next admission cleans expired legacy receipts while active recovery survives', async () => {
  const x=await database({ latest: false });
  try {
    const active=randomUUID(),activeAttempt=randomUUID(),expired=randomUUID(),expiredAttempt=randomUUID(),guest=randomUUID();
    const actor='c'.repeat(64),otherActor='d'.repeat(64),result={summary:'Private legacy itinerary'};
    await x.rpc('begin_journey_plan_operation',{p_actor:actor,p_operation:active,p_hash:hash,p_owner:x.user,p_guest:false,p_attempt:activeAttempt});
    await x.rpc('complete_journey_plan_operation',{p_actor:actor,p_operation:active,p_attempt:activeAttempt,p_result:result});
    await x.rpc('begin_journey_plan_operation',{p_actor:otherActor,p_operation:expired,p_hash:hash,p_owner:x.other,p_guest:false,p_attempt:expiredAttempt});
    await x.rpc('complete_journey_plan_operation',{p_actor:otherActor,p_operation:expired,p_attempt:expiredAttempt,p_result:result});
    await x.db.query("update public.journey_plan_operations set expires_at=now()-interval '1 second' where operation_id=$1",[expired]);
    await x.db.query("insert into public.journey_plan_operations(actor,operation_id,request_hash,attempt_id,state,result,lease_until,expires_at) values($1,$2,$3,$4,'succeeded',$5,now(),now()-interval '1 second')",['e'.repeat(64),guest,hash,randomUUID(),result]);
    await x.db.exec(readFileSync(cutoverMigration,'utf8'));
    await x.db.exec(readFileSync(threeRouteMigration,'utf8'));
    assert.equal((await x.quota(x.other)).used,1,'Expired private result does not erase its historical successful charge');
    assert.equal((await x.db.query('select count(*)::int as n from public.journey_plan_operations')).rows[0].n,3,'Cutover itself does not purge old data');
    assert.deepEqual((await x.begin(x.user,active)).result,result,'An active copied result stays recoverable');
    const nextUser=randomUUID();await x.db.query('insert into auth.users values($1)',[nextUser]);
    assert.equal((await x.begin(nextUser)).state,'acquired');
    assert.deepEqual((await x.db.query('select operation_id from public.journey_plan_operations')).rows.map(row=>row.operation_id),[active],'Only expired account/guest payloads are cleared');
    await x.db.query("update public.journey_plan_operations set expires_at=now()-interval '1 second' where operation_id=$1",[active]);
    const finalUser=randomUUID();await x.db.query('insert into auth.users values($1)',[finalUser]);
    assert.equal((await x.begin(finalUser)).state,'acquired');
    assert.equal((await x.db.query('select count(*)::int as n from public.journey_plan_operations')).rows[0].n,0);
    assert.deepEqual((await x.begin(x.user,active)).result,result,'Legacy cleanup does not delete the independently valid new receipt');
    assert.equal((await x.db.query("select has_function_privilege('service_role','public.cleanup_legacy_ai_route_receipts()','execute') as allowed")).rows[0].allowed,false);
    await x.db.exec(readFileSync(cutoverMigration,'utf8'));
  }finally{await x.db.close();}
});

test('Durable provider admission serializes conservative token budgets, settles confirmed usage once and never refunds unknown failures', async () => {
  const x=await database();
  const reserve=(id,tokens)=>x.rpc('reserve_ai_route_provider_attempt',{p_request:id,p_tokens:tokens});
  const settle=(id,tokens)=>x.rpc('settle_ai_route_provider_attempt',{p_request:id,p_tokens:tokens});
  try {
    const first=randomUUID(); assert.equal((await reserve(first,6000)).allowed,true);
    assert.equal((await reserve(first,6000)).allowed,true);
    assert.equal((await reserve(first,5000)).allowed,false);
    const parallel=await Promise.all([reserve(randomUUID(),1000),reserve(randomUUID(),1000)]);
    assert.deepEqual(parallel.map(row=>row.allowed),[true,false]); assert.equal(parallel[1].window,'minute');
    assert.equal(await settle(first,9000),false); assert.equal(await settle(first,0),false);
    assert.equal(await settle(first,2000),true); assert.equal(await settle(first,2000),true); assert.equal(await settle(first,1000),false);
    assert.equal((await reserve(randomUUID(),4500)).allowed,true);
    assert.equal((await reserve(randomUUID(),1)).allowed,false);
    assert.equal((await x.quota()).used,0,'Provider spend never changes user success allowance');
    await x.db.exec("update public.ai_route_provider_attempts set created_at=now()-interval '2 minutes'");
    assert.equal((await reserve(randomUUID(),7500)).allowed,true);
    // Persisted earlier spend, including failed/unknown attempts, exhausts day.
    for(let i=0;i<22;i++) await x.db.query("insert into public.ai_route_provider_attempts(request_id,tokens,reserved_tokens,created_at) values($1,7500,7500,now()-interval '2 minutes')",[randomUUID()]);
    const denied=await reserve(randomUUID(),1); assert.equal(denied.allowed,false); assert.equal(denied.window,'day'); assert.ok(denied.retryAfterSeconds>0);
    assert.equal((await reserve(randomUUID(),7501)).window,'invalid');
  } finally { await x.db.close(); }
});

class PlanError extends Error { constructor(code,providerCapacity) { super(code); this.code=code; this.providerCapacity=providerCapacity; } }
const quota=(used=0,pending=false)=>({limit:3,used,remaining:pending?0:3-used,pending,resetAt:'2026-10-19T00:00:00Z',timeZone:'UTC'});
function apiFixture(options={}) {
  const calls=[]; let generations=0;
  const db={rpc(name,args){calls.push({name,args});const promise=Promise.resolve().then(()=>options.rpc?.(name,args)??{error:null,data:name==='begin_ai_route_operation'?{state:'acquired',quota:quota(0,true)}:name==='complete_ai_route_operation'?{ok:true,quota:quota(args.p_result?1:0)}:name==='get_ai_route_quota'?quota():{allowed:true}});promise.abortSignal=()=>promise;return promise;},from(){return {select(){return {eq(){return {maybeSingle:async()=>({data:options.cached?{output_json:options.cached}:null,error:null})};}};},upsert:async()=>({error:null})};}};
  const provider={JourneyPlanError:PlanError,journeyPlanWait:async p=>p,journeyPlanModel:()=>options.model===false?null:{},parseJourneyPlanRequest:value=>options.invalid?null:value,journeyPlanProviderError:(e)=>e instanceof PlanError?e:new PlanError('plan_failed'),createJourneyPlan:async(input,signal,limits)=>{generations++;if(options.reserve)await limits.reserveProviderAttempt(6000,signal);return options.generate?.()??{generatedBy:'ai',summary:'Plan'};}};
  const overrides={
    '@/lib/travel-assistant/journey-plan':provider,'./travel-assistant/journey-plan':provider,
    './authenticated-user':{requireAuthenticatedUser:async ()=>options.auth===false?{ok:false,response:Response.json({}, {status:401})}:{ok:true,user:{id:options.owner??'verified-owner'},supabase:db}},
    '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db},
    '@/lib/travel-assistant/http':{boundedJson:r=>r.json()},
    '@/lib/travel-assistant/journey-plan-groq':{groqJourneyModel:()=>({}),generateBoundedGroqJourneyJson:async args=>{generations++;await args.reserveProviderAttempt(6000,args.signal);if(options.failLegacy)throw Error('provider down');return JSON.stringify(options.legacyResult);}},
    '@google/genai':{GoogleGenAI:class{constructor(){assert.fail('Groq request must not instantiate Gemini');}}},
  };
  const cache=new Map();const context=vm.createContext({Error,Date,URL,Request,Response,Headers,AbortSignal,AbortController,console:{warn() {},error() {}},setTimeout,clearTimeout,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-only',AI_PLAN_ENABLED:'true',JOURNEY_AI_PROVIDER:'groq',GROQ_API_KEY:'fixture'}}});
  function load(filename){let full=path.resolve(filename);if(!existsSync(full))full+='.ts';if(cache.has(full))return cache.get(full).exports;const output={exports:{}};cache.set(full,output);if(full.endsWith('.json')){output.exports=JSON.parse(readFileSync(full,'utf8'));return output.exports;}const source=ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInContext(`(function(require,module,exports){${source}\n})`,context)(name=>Object.hasOwn(overrides,name)?overrides[name]:name.startsWith('@/')?load(name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),output,output.exports);return output.exports;}
  const route=load('app/api/travel-assistant/journey-plan/route.ts');
  const request=(body={},key=randomUUID(),authenticated=true)=>new Request('http://local/plan?quotaVersion=2',{method:'POST',headers:{...(authenticated?{Authorization:'Bearer valid'}:{}),...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});
  return {calls,request,post:(key,body,auth)=>route.POST(request(body,key,auth)),get:authenticated=>route.GET(new Request('http://local/plan?quotaVersion=2',{headers:authenticated===false?{}:{Authorization:'Bearer valid'}})),legacy:()=>load('app/api/ai-plan/route.ts'),generations:()=>generations};
}

test('Route requires verified account before quota/provider and returns private authoritative status',async()=>{
  for(const options of [{},{auth:false}]){const a=apiFixture(options);const response=await a.post(undefined,{},false);assert.equal(response.status,401);assert.equal((await response.json()).code,'plan_sign_in');assert.equal(a.calls.length,0);}
  const a=apiFixture();const status=await a.get();assert.equal(status.headers.get('cache-control'),'private, no-store');assert.deepEqual(await status.json(),quota());assert.equal(a.calls[0].args.p_owner,'verified-owner');
  const invalid=apiFixture({invalid:true});assert.equal((await invalid.post()).status,400);assert.equal(invalid.calls.length,0);
});
test('Route status accepts every three-route counter and fails closed on inconsistent or out-of-range counters',async()=>{
  for(const used of [0,1,2,3]) for(const pending of [false,true]) {
    const expected=quota(used,pending);const a=apiFixture({rpc:()=>({error:null,data:expected})});
    const status=await a.get();assert.equal(status.status,200);assert.deepEqual(await status.json(),expected);
  }
  for(const value of [{...quota(),used:-1},{...quota(),used:4},{...quota(),used:1.5},{...quota(),used:'1'}, {...quota(2),remaining:2}, {...quota(1,true),remaining:2}, {...quota(),limit:4}]) {
    const a=apiFixture({rpc:()=>({error:null,data:value})});assert.equal((await a.get()).status,503);
  }
});
test('Route commits before delivery, refunds failures, and never refunds uncertain commits',async()=>{
  for(const [generate,status,success] of [[undefined,200,true],[()=>{throw new PlanError('plan_timeout');},504,false]]){const a=apiFixture({generate});assert.equal((await a.post()).status,status);assert.equal(a.calls[0].name,'begin_ai_route_operation');assert.equal(a.calls[1].name,'complete_ai_route_operation');assert.equal(a.calls[1].args.p_result!==null,success);assert.equal(a.calls[1].args.p_attempt,a.calls[0].args.p_attempt);}
  const uncertain=apiFixture({rpc:name=>{if(name==='begin_ai_route_operation')throw Error('lost reservation reply');}});assert.equal((await uncertain.post()).status,503);assert.equal(uncertain.calls[1].args.p_result,null);
  const key=randomUUID();let result;const recovery=apiFixture({rpc:(name,args)=>{if(name==='begin_ai_route_operation')return{error:null,data:result?{state:'succeeded',result,quota:quota(1)}:{state:'acquired',quota:quota(0,true)}};if(name==='complete_ai_route_operation'){result=args.p_result;throw Error('lost commit reply');}}});
  assert.equal((await recovery.post(key)).status,503);assert.equal(recovery.calls.length,2);const replay=await recovery.post(key);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),{...result,quota:quota(1)});assert.equal(recovery.generations(),1);
});
test('Admission denies conflicts, quota and pending without spending; malformed quota fails closed; replay works without a provider',async()=>{
  for(const [state,status,code]of[['limit',429,'plan_limit'],['pending',409,'plan_pending'],['conflict',409,'plan_conflict'],['expired',409,'plan_expired'],['busy',429,'plan_busy']]){const a=apiFixture({rpc:()=>({error:null,data:{state,quota:quota(state==='limit'?3:0,state==='pending'),retryAfterSeconds:20}})});const response=await a.post();assert.equal(response.status,status);assert.equal((await response.json()).code,code);assert.equal(a.generations(),0);assert.equal(a.calls.length,1);}
  const a=apiFixture({rpc:()=>({error:null,data:{state:'acquired',quota:{...quota(),remaining:4}}})});assert.equal((await a.post()).status,503);assert.equal(a.generations(),0);
  const replay=apiFixture({model:false,rpc:()=>({error:null,data:{state:'succeeded',result:{summary:'saved'},quota:quota(1)}})});assert.equal((await replay.post()).status,200);
  const malformed=apiFixture();assert.equal((await malformed.post('broken')).status,400);assert.equal(malformed.calls.length,0);
});
test('Global provider failure does not consume account success and forwards a bounded retry interval',async()=>{
  const a=apiFixture({reserve:true,rpc:name=>name==='reserve_ai_route_provider_attempt'?{error:null,data:{allowed:false,window:'minute',retryAfterSeconds:42}}:undefined});const response=await a.post();assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'42');assert.equal((await response.json()).code,'plan_busy');assert.equal(a.calls.at(-1).args.p_result,null);
});
const legacyInput={mode:'fixed',destination:{code:'BJV'},origin:'İstanbul',dayCount:2};
const legacyResult={summary:'A valid trip',routes:[{name:'Bodrum',country:'Türkiye',dailyPlan:['Day 1','Day 2'],scores:{overall:80}}]};
test('Both HTTP route handlers enforce the migrated database allowance: failures stay free, three successes pass and the fourth is denied',async()=>{
  const x=await database();
  try {
    let fail=true;
    const a=apiFixture({owner:x.user,cached:legacyResult,rpc:async(name,args)=>({error:null,data:await x.rpc(name,args)}),generate:()=>{if(fail)throw new PlanError('plan_timeout');return {generatedBy:'ai',summary:'Complete generated plan'};}});
    assert.equal((await a.post()).status,504);
    assert.equal((await x.quota()).used,0);assert.equal((await x.quota()).remaining,3);
    await x.minutes();fail=false;
    const firstKey=randomUUID(),secondKey=randomUUID(),thirdKey=randomUUID();
    const first=await a.post(firstKey);assert.equal(first.status,200);assert.equal((await first.json()).quota.remaining,2);
    assert.equal((await a.post(firstKey)).status,200);assert.equal(a.generations(),2,'A lost successful reply replays without another provider call');
    const second=await a.legacy().POST(a.request(legacyInput,secondKey));assert.equal(second.status,200);assert.equal((await second.json()).quota.remaining,1);
    await x.minutes();
    const third=await a.post(thirdKey);assert.equal(third.status,200);assert.equal((await third.json()).quota.used,3);
    for(const request of [()=>a.post(),()=>a.legacy().POST(a.request(legacyInput))]) {
      const denied=await request();assert.equal(denied.status,429);const data=await denied.json();assert.equal(data.code,'plan_limit');assert.equal(data.quota.remaining,0);
    }
    assert.equal((await a.post(firstKey)).status,200);assert.equal((await a.legacy().POST(a.request(legacyInput,secondKey))).status,200,'Both endpoints retain successful replay at the daily cap');
    assert.equal(a.generations(),3);assert.equal((await x.quota()).used,3);
    const status=await a.get();assert.equal(status.status,200);assert.equal((await status.json()).used,3);
    assert.equal((await x.quota(x.other)).remaining,3,'A different verified account keeps its separate daily allowance');
  } finally {await x.db.close();}
});
test('Legacy suggestions use same account admission for cached AI results, keep real fallback free and never call Gemini on Groq',async()=>{
  const cached=apiFixture({cached:legacyResult});const c=await cached.legacy().POST(cached.request(legacyInput));assert.equal(c.status,200);assert.equal((await c.json()).isFallback,false);assert.equal(cached.calls[0].args.p_kind,'suggestions');assert.ok(cached.calls.at(-1).args.p_result);assert.equal(cached.generations(),0);
  const fail=apiFixture({failLegacy:true});const f=await fail.legacy().POST(fail.request(legacyInput));assert.equal(f.status,200);assert.equal((await f.json()).isFallback,true);assert.equal(fail.calls.at(-1).args.p_result,null);
  const good=apiFixture({legacyResult});const result=await good.legacy().POST(good.request(legacyInput));assert.equal(result.status,200);assert.equal((await result.json()).isFallback,false);assert.ok(good.calls.some(call=>call.name==='reserve_ai_route_provider_attempt'));
  const guest=apiFixture();assert.equal((await guest.legacy().POST(guest.request(legacyInput,randomUUID(),false))).status,401);assert.equal(guest.calls.length,0);
});
test('Partial, duplicate and filtered legacy suggestions never spend an allowance by filling gaps with starter routes',async()=>{
  const body={...legacyInput,mode:'discover',destination:undefined,visa:'Sadece vizesiz',passportCountry:'TR',passportType:'ordinary'};
  for(const routes of [[],[legacyResult.routes[0]],Array(3).fill(legacyResult.routes[0]),Array(3).fill({name:'Paris',country:'France',dailyPlan:['one','two'],scores:{overall:80}})]) {
    for(const fromCache of [false,true]) {
      const a=apiFixture(fromCache?{cached:{routes}}:{legacyResult:{routes}});
      const response=await a.legacy().POST(a.request(body));assert.equal(response.status,200);assert.equal((await response.json()).isFallback,true);assert.equal(a.calls.at(-1).args.p_result,null);
    }
  }
});
