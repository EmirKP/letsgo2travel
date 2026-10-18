import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
