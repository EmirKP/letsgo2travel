import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const actor = 'a'.repeat(64), account = 'b'.repeat(64);
test('Reservation quota refunds only failed allowances, preserves attempts, fences late commits, and enforces all caps', async () => {
  const db = new PGlite();
  const reserve = async (id, guest = true, request = randomUUID()) => ({ request, allowed: (await db.query('select public.reserve_journey_plan_quota($1,$2,$3) as allowed', [id, guest, request])).rows[0].allowed });
  const finish = async (id, receipt, success) => (await db.query('select public.finish_journey_plan_quota($1,$2,$3) as ok', [id, receipt, success])).rows[0].ok;
  const minutes = () => db.exec("update public.journey_plan_usage set minute = now() - interval '2 minutes'");
  const count = async id => (await db.query('select daily_count from public.journey_plan_usage where scope=$1', [id])).rows[0].daily_count;
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(readFileSync('supabase/migrations/20261014150000_journey_plan_quota.sql', 'utf8'));
    const migration = readFileSync('supabase/migrations/20261014170000_journey_plan_reservations.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    // Today's three legacy failures remain attempts, but do not strand guests.
    await db.query("insert into public.journey_plan_usage values ($1,(now() at time zone 'UTC')::date,3,now()-interval '2 minutes',1),('global',(now() at time zone 'UTC')::date,3,now()-interval '2 minutes',1)", [actor]);
    const first = await reserve(actor); assert.equal(first.allowed, true);
    assert.equal((await reserve(actor, true, first.request)).allowed, true); assert.equal(await count(actor), 4);
    assert.equal(await finish(account, first.request, true), false);
    assert.equal(await finish(actor, first.request, false), true); assert.equal(await finish(actor, first.request, false), true);
    assert.equal(await finish(actor, first.request, true), false); assert.equal(await count(actor), 4); assert.equal(await count('global'), 4);
    assert.equal((await reserve(actor, true, first.request)).allowed, false);
    const second = await reserve(actor); assert.equal(second.allowed, true);
    assert.equal((await reserve(actor)).allowed, false); // Failed attempt did not refund minute budget.
    await minutes();
    const third = await reserve(actor), fourth = await reserve(actor);
    assert.equal(third.allowed, true); assert.equal(fourth.allowed, true);
    await minutes(); assert.equal((await reserve(actor)).allowed, false); // Three active plans.
    assert.equal(await finish(actor, second.request, true), true); assert.equal(await finish(actor, second.request, true), true);
    assert.equal(await finish(actor, second.request, false), false); // Cannot uncharge a completed plan.
    assert.equal(await finish(actor, third.request, false), true);
    const replacement = await reserve(actor); assert.equal(replacement.allowed, true);
    await db.query("update public.journey_plan_reservations set expires_at=now()-interval '1 second' where request_id=$1", [fourth.request]);
    assert.equal(await finish(actor, fourth.request, true), false); // A late completion cannot exceed allowance.
    await minutes();
    const afterExpiry = await reserve(actor); assert.equal(afterExpiry.allowed, true);
    assert.equal(await finish(actor, replacement.request, true), true); assert.equal(await finish(actor, afterExpiry.request, true), true);
    await minutes(); assert.equal((await reserve(actor)).allowed, false); // Three successes.

    const late = randomUUID(); assert.equal(await finish(account, late, false), true);
    assert.equal((await reserve(account, false, late)).allowed, false);
    assert.equal(await finish(account, randomUUID(), true), false);
    // Permanent actor attempt cap remains effective even if all generations fail.
    const failing = 'c'.repeat(64);
    for (let index = 0; index < 12; index++) { await minutes(); const attempt = await reserve(failing); assert.equal(attempt.allowed, true); assert.equal(await finish(failing, attempt.request, false), true); }
    await minutes(); assert.equal((await reserve(failing)).allowed, false); assert.equal(await count(failing), 12);
    for (let index = 0; index < 30; index++) { await minutes(); const attempt = await reserve(account, false); assert.equal(attempt.allowed, true); await finish(account, attempt.request, false); }
    await minutes(); assert.equal((await reserve(account, false)).allowed, false);
    const signed = 'd'.repeat(64);
    for (let index = 0; index < 10; index++) { await minutes(); const attempt = await reserve(signed, false); assert.equal(attempt.allowed, true); await finish(signed, attempt.request, true); }
    await minutes(); assert.equal((await reserve(signed, false)).allowed, false);
    await db.exec("update public.journey_plan_usage set minute=date_trunc('minute',now()), minute_count=10 where scope='global'");
    assert.equal((await reserve('e'.repeat(64))).allowed, false);
    await minutes(); await db.exec("update public.journey_plan_usage set daily_count=200 where scope='global'");
    assert.equal((await reserve('e'.repeat(64))).allowed, false);
    assert.equal((await reserve('invalid')).allowed, false);
    const grants = (await db.query("select has_function_privilege('anon','public.reserve_journey_plan_quota(text,boolean,uuid)','execute') as anon_reserve, has_function_privilege('authenticated','public.finish_journey_plan_quota(text,uuid,boolean)','execute') as user_finish, has_function_privilege('service_role','public.reserve_journey_plan_quota(text,boolean,uuid)','execute') as service_reserve, has_function_privilege('service_role','public.finish_journey_plan_quota(text,uuid,boolean)','execute') as service_finish, has_table_privilege('anon','public.journey_plan_reservations','select') as anon_read")).rows[0];
    assert.deepEqual(grants, { anon_reserve: false, user_finish: false, service_reserve: true, service_finish: true, anon_read: false });
  } finally { await db.close(); }
});

class PlanError extends Error { constructor(code) { super(code); this.code = code; } }
function routeFixture(options = {}) {
  const calls = [];
  const db = { rpc(name, args) { calls.push({ name, args }); const operation = Promise.resolve().then(() => options.rpc?.(name, args) ?? { error: null, data: true }); operation.abortSignal = () => operation; return operation; } };
  const imports = {
    'node:crypto': { createHmac, randomUUID }, 'node:net': { isIP },
    '@/lib/authenticated-user': { requireAuthenticatedUser: async () => ({ ok: true, user: { id: 'test' }, supabase: db }) },
    '@/lib/supabaseAdmin': { getSupabaseAdmin: () => db },
    '@/lib/travel-assistant/http': { boundedJson: request => request.json() },
    '@/lib/travel-assistant/journey-plan': { JourneyPlanError: PlanError, journeyPlanModel: () => ({}), parseJourneyPlanRequest: value => value,
      journeyPlanWait: async operation => operation, createJourneyPlan: async () => options.generate?.() ?? { generatedBy: 'ai' } },
  };
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync('app/api/travel-assistant/journey-plan/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Error, URL, Response, AbortSignal, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' } } })(name => imports[name], output, output.exports);
  return { calls, post: (key, body = {}) => output.exports.POST(new Request('http://local/plan', { method: 'POST', headers: key ? {'Idempotency-Key':key} : {}, body: JSON.stringify(body) })) };
}
test('Route finalizes success before replying and releases generation failure with the same receipt', async () => {
  for (const [generate, status, success] of [[undefined, 200, true], [() => { throw new PlanError('plan_timeout'); }, 504, false]]) {
    const app = routeFixture({ generate }); assert.equal((await app.post()).status, status);
    assert.equal(app.calls.length, 2); assert.equal(app.calls[0].name, 'reserve_journey_plan_quota'); assert.equal(app.calls[1].name, 'finish_journey_plan_quota');
    assert.equal(app.calls[1].args.p_success, success); assert.equal(app.calls[0].args.p_request, app.calls[1].args.p_request);
  }
});
test('Uncertain reservation is cancelled but uncertain success finalization is never refunded', async () => {
  const reserveFailure = routeFixture({ rpc: name => { if (name === 'reserve_journey_plan_quota') throw Error('offline'); } });
  assert.equal((await reserveFailure.post()).status, 503); assert.equal(reserveFailure.calls[1].args.p_success, false);
  for (const failure of [() => { throw Error('lost acknowledgement'); }, () => ({ error: { message: 'unavailable' }, data: null }), () => ({ error: null, data: false })]) {
    const app = routeFixture({ rpc: name => name === 'finish_journey_plan_quota' ? failure() : undefined });
    assert.equal((await app.post()).status, 503); assert.equal(app.calls.length, 2); assert.equal(app.calls[1].args.p_success, true);
  }
  const denied = routeFixture({ rpc: () => ({ error: null, data: false }) });
  assert.equal((await denied.post()).status, 429); assert.equal(denied.calls.length, 1);
});

test('Durable operation returns a committed plan after lost acknowledgement without another generation or quota charge', async () => {
  const key=randomUUID();let saved=null, generations=0, finishes=0;
  const app=routeFixture({generate:()=>{generations++;return {generatedBy:'ai',fetchedAt:'2026-10-15T10:00:00Z'};},rpc:(name,args)=>{
    if(name==='begin_journey_plan_operation')return {error:null,data:saved?{state:'succeeded',result:saved}:{state:'acquired'}};
    assert.equal(name,'complete_journey_plan_operation');assert.ok(args.p_result);finishes++;saved=args.p_result;throw Error('Acknowledgement lost after COMMIT');
  }});
  assert.equal((await app.post(key)).status,503);
  const retry=await app.post(key);assert.equal(retry.status,200);assert.deepEqual(await retry.json(),saved);
  assert.equal(generations,1);assert.equal(finishes,1);
});

test('Operation admission rejects conflicting, expired and malformed keys and never starts another pending generation', async () => {
  for(const [state,status,code] of [['pending',409,'plan_pending'],['conflict',409,'plan_conflict'],['expired',409,'plan_expired'],['limit',429,'plan_limit']]) {
    const app=routeFixture({generate:()=>assert.fail('must not generate'),rpc:()=>({error:null,data:{state}})});
    const result=await app.post(randomUUID());assert.equal(result.status,status);assert.equal((await result.json()).code,code);assert.equal(app.calls.length,1);
  }
  const app=routeFixture();assert.equal((await app.post('not-a-uuid')).status,400);assert.equal(app.calls.length,0);
});

test('Real SQL atomically recovers results, fences concurrent and obsolete workers, preserves quotas and isolates owners', async () => {
  const db=new PGlite();const user=randomUUID();
  const begin=async(op,attempt,hash='c'.repeat(64),owner=null,id=actor)=>(await db.query('select public.begin_journey_plan_operation($1,$2,$3,$4,$5,$6) as value',[id,op,hash,owner,owner===null,attempt])).rows[0].value;
  const complete=async(op,attempt,result,id=actor)=>(await db.query('select public.complete_journey_plan_operation($1,$2,$3,$4) as value',[id,op,attempt,result])).rows[0].value;
  const minutes=()=>db.exec("update public.journey_plan_usage set minute=now()-interval '2 minutes'");
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
    await db.query('insert into auth.users values($1)',[user]);
    for(const path of ['20261014150000_journey_plan_quota','20261014170000_journey_plan_reservations','20261015100000_journey_plan_recovery','20261015100000_journey_plan_recovery'])await db.exec(readFileSync(`supabase/migrations/${path}.sql`,'utf8'));
    const op=randomUUID(),a=randomUUID(),b=randomUUID(),result={generatedBy:'ai',fetchedAt:'2026-10-15T10:00:00Z',summary:'Private result'};
    const both=await Promise.all([begin(op,a),begin(op,b)]);assert.deepEqual(both.map(x=>x.state),['acquired','pending']);
    assert.equal((await begin(op,b,'d'.repeat(64))).state,'conflict');
    assert.equal(await complete(op,b,result),false);assert.equal(await complete(op,a,result),true);assert.equal(await complete(op,a,null),false);
    assert.deepEqual(await begin(op,b),{state:'succeeded',result});
    assert.equal((await db.query('select daily_count from public.journey_plan_usage where scope=$1',[actor])).rows[0].daily_count,1);
    assert.equal(await complete(op,a,result,account),false);
    const failed=randomUUID(),first=randomUUID(),second=randomUUID();
    assert.equal((await begin(failed,first)).state,'acquired');assert.equal(await complete(failed,first,null),true);
    const cancelled=randomUUID();assert.equal(await complete(failed,cancelled,null),true);
    await minutes();assert.equal((await begin(failed,cancelled)).state,'limit');
    await minutes();assert.equal((await begin(failed,second)).state,'acquired');assert.equal(await complete(failed,first,result),false);assert.equal(await complete(failed,second,result),true);
    const leased=randomUUID(),old=randomUUID(),fresh=randomUUID();await minutes();assert.equal((await begin(leased,old)).state,'acquired');
    await db.query("update public.journey_plan_operations set lease_until=now()-interval '1 second' where operation_id=$1",[leased]);
    const cancelledLease=randomUUID();assert.equal(await complete(leased,cancelledLease,null),true);
    assert.equal((await begin(leased,cancelledLease)).state,'limit');
    assert.equal(await complete(leased,old,result),false);assert.equal((await begin(leased,fresh)).state,'acquired');assert.equal(await complete(leased,old,result),false);
    assert.equal(await complete(leased,fresh,result),true);
    assert.deepEqual(await begin(op,randomUUID()),{state:'succeeded',result}); // Even at the successful quota cap.
    await db.query("update public.journey_plan_operations set expires_at=now()-interval '1 second' where operation_id=$1",[op]);
    assert.equal((await begin(op,randomUUID())).state,'expired');
    await minutes();const own=randomUUID(),ownAttempt=randomUUID();assert.equal((await begin(own,ownAttempt,'c'.repeat(64),user,account)).state,'acquired');
    assert.equal(await complete(own,ownAttempt,result,account),true);
    await db.query('delete from auth.users where id=$1',[user]);assert.equal((await db.query('select count(*)::int as n from public.journey_plan_operations where owner_id=$1',[user])).rows[0].n,0);
    const grants=(await db.query("select has_table_privilege('anon','public.journey_plan_operations','select') as read, has_function_privilege('authenticated','public.begin_journey_plan_operation(text,uuid,text,uuid,boolean,uuid)','execute') as begin, has_function_privilege('anon','public.complete_journey_plan_operation(text,uuid,uuid,jsonb)','execute') as finish")).rows[0];
    assert.deepEqual(grants,{read:false,begin:false,finish:false});
  }finally{await db.close();}
});
