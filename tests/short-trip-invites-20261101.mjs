import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync('supabase/migrations/20261101090000_short_trip_invites.sql','utf8');
const owner='10000000-0000-4000-8000-000000000001', editor='10000000-0000-4000-8000-000000000002', guest='10000000-0000-4000-8000-000000000003';
const trip='20000000-0000-4000-8000-000000000001', second='20000000-0000-4000-8000-000000000002';
const hash=code=>createHash('sha256').update(code).digest('hex');
function load(file, imports) {
  const mod={exports:{}};
  const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{URL,Date,Request})(name=>{
    if(Object.hasOwn(imports,name))return imports[name];
    throw Error(`Missing ${name}`);
  },mod,mod.exports);
  return mod.exports;
}
const parseTripInvite=load('lib/trip-invite.ts',{}).parseTripInvite;
test('Six digit codes preserve leading zeros and trusted deep links without accepting malformed/foreign links',()=>{
  for(const value of ['000042','123456','https://www.letsgo2travel.com.tr/davet/000042','tr.com.letsgo2travel.app://davet/000042','tr.com.letsgo2travel.app://open?tripInvite=000042'])assert.match(parseTripInvite(value),/^\d{6}$/);
  assert.equal(parseTripInvite(' oldLegacyInviteToken12345 '),'oldLegacyInviteToken12345');
  for(const value of ['12345','1234567','123 456','https://evil.test/davet/000042','https://user@www.letsgo2travel.com.tr/davet/000042','https://www.letsgo2travel.com.tr:8443/davet/000042','https://www.letsgo2travel.com.tr/davet/000042/extra'])assert.equal(parseTripInvite(value),'');
});

test('Database invitation leases, throttling and delete ownership execute transactionally in isolated PostgreSQL',async t=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.auth_role',true),'') $$;
      create table public.trips(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now());`);
    await db.query('insert into auth.users values($1),($2),($3)',[owner,editor,guest]);
    await db.exec(readFileSync('supabase/migrations/20260905000100_trip_collaboration.sql','utf8').replace('create extension if not exists pgcrypto;',''));
    await db.query('insert into trips(id,user_id) values($1,$3),($2,$3)',[trip,second,owner]);
    await db.query("insert into trip_invites(trip_id,created_by,token_hash,expires_at) values($1,$2,$3,now()+interval '7 days')",[trip,owner,hash('legacyInvitationToken123456')]);
    await db.exec(migration); await db.exec(migration);
    await db.exec("select set_config('test.auth_role','service_role',false)");
    const issue=async(id,code,actor=owner)=>(await db.query('select * from create_short_trip_invite($1,$2,$3,$4,$5)',[id,actor,code,hash(code),'editor'])).rows[0];
    const accept=async(code,user=guest)=>(await db.query('select accept_shared_trip_invite($1,$2) as result',[hash(code),user])).rows[0].result;
    await t.test('Legacy seven-day links revoked, existing members retained; active code stable and exactly5minutes',async()=>{
      assert.equal((await db.query('select revoked_at is not null as revoked from trip_invites')).rows[0].revoked,true);
      assert.equal((await db.query('select count(*)::int as n from trip_members')).rows[0].n,2);
      const first=await issue(trip,'000042'),again=await issue(trip,'345678');
      assert.equal(first.invite_code,'000042'); assert.equal(again.invite_code,first.invite_code);
      assert.equal(new Date(first.expires_at)-new Date(first.server_now),300000);
      assert.equal(new Date(again.expires_at).getTime(),new Date(first.expires_at).getTime());
    });
    await t.test('Code collision cannot reassign another trip and editors cannot issue invites',async()=>{
      await assert.rejects(issue(second,'000042'),/invite_code_collision/);
      const lease=await issue(second,'111111');assert.equal(lease.invite_code,'111111');
      await db.query("insert into trip_members(trip_id,user_id,role,added_by) values($1,$2,'editor',$3)",[trip,editor,owner]);
      await assert.rejects(issue(trip,'222222',editor),/trip_forbidden/);
      assert.equal((await db.query('select invite_code from trip_short_invites where trip_id=$1',[trip])).rows[0].invite_code,'000042');
    });
    await t.test('Join uses server role, idempotence and unique membership with exact usage accounting',async()=>{
      assert.equal((await accept('000042')).tripId,trip);
      assert.equal((await accept('000042')).tripId,trip);
      assert.equal((await db.query('select use_count from trip_short_invites where trip_id=$1',[trip])).rows[0].use_count,1);
      assert.equal((await db.query('select count(*)::int as n from trip_members where trip_id=$1 and user_id=$2',[trip,guest])).rows[0].n,1);
      await db.exec("select set_config('test.auth_role','',false)");
      await assert.rejects(issue(trip,'222222'),/service role required/);
      await db.exec("select set_config('test.auth_role','service_role',false)");
    });
    await t.test('Expired code rejects before refresh; refresh invalidates old code and retains joined members',async()=>{
      await db.query("update trip_short_invites set created_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute' where trip_id=$1",[trip]);
      assert.equal((await accept('000042',editor)).status,'invalid');
      await assert.rejects(issue(trip,'000042'),/invite_code_collision/);
      const rotated=await issue(trip,'222222');assert.equal(rotated.invite_code,'222222');
      assert.equal((await accept('000042',editor)).status,'invalid');
      assert.equal((await accept('222222',editor)).tripId,trip);
      assert.equal((await db.query('select count(*)::int as n from trip_members where trip_id=$1',[trip])).rows[0].n,3);
      assert.equal((await accept('legacyInvitationToken123456',editor)).status,'invalid');
    });
    await t.test('Failed attempts persist and block the sixth guess across requests, then expire',async()=>{
      await db.query('delete from trip_invite_attempts where user_id=$1',[guest]);
      for(let i=0;i<5;i++)assert.equal((await accept('999999')).status,'invalid');
      const limited=await accept('222222');assert.equal(limited.status,'rate_limited');assert.ok(limited.retryAfter>0&&limited.retryAfter<=300);
      await db.query("update trip_invite_attempts set window_start=now()-interval '6 minutes' where user_id=$1",[guest]);
      assert.equal((await accept('222222')).status,'joined');
    });
    await t.test('Expired or deleted trip codes cannot redirect to another trip for seven days; valid leases remain unchanged',async()=>{
      const oldTrip='20000000-0000-4000-8000-000000000003',newTrip='20000000-0000-4000-8000-000000000004';
      await db.query('insert into trips(id,user_id) values($1,$3),($2,$3)',[oldTrip,newTrip,owner]);
      const current=(await db.query('select invite_code,expires_at from trip_short_invites where trip_id=$1',[trip])).rows[0];
      const oldLease=await issue(oldTrip,'700001');
      const reservation=(await db.query('select reserved_until from trip_invite_code_history where code_hash=$1',[hash('700001')])).rows[0];
      assert.equal(new Date(reservation.reserved_until)-new Date(oldLease.expires_at),7*24*60*60*1000);
      await db.query("update trip_short_invites set created_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute' where trip_id=$1",[oldTrip]);
      await assert.rejects(issue(newTrip,'700001'),/invite_code_collision/);
      const invalid=await accept('700001',editor);assert.equal(invalid.status,'invalid');
      await db.query('select delete_shared_trip($1,$2)',[oldTrip,owner]);
      await assert.rejects(issue(newTrip,'700001'),/invite_code_collision/);
      const stable=await issue(trip,'700001');assert.equal(stable.invite_code,current.invite_code);assert.equal(new Date(stable.expires_at).getTime(),new Date(current.expires_at).getTime());
      // Advance only this isolated reservation's clock past the full retention.
      await db.query("update trip_invite_code_history set reserved_until=now()-interval '1 second' where code_hash=$1",[hash('700001')]);
      assert.equal((await issue(newTrip,'700001')).invite_code,'700001');
      await db.query('select delete_shared_trip($1,$2)',[newTrip,owner]);
      assert.ok((await db.query('select reserved_until > now() as reserved from trip_invite_code_history where code_hash=$1',[hash('700001')])).rows[0].reserved);
    });
    await t.test('The twelve-member-use bound cannot be bypassed and issuing a replacement leaves members intact',async()=>{
      const newcomer='10000000-0000-4000-8000-000000000004';
      await db.query('insert into auth.users values($1)',[newcomer]);
      await db.query('update trip_short_invites set use_count=12 where trip_id=$1',[trip]);
      assert.equal((await accept('222222',newcomer)).status,'invalid');
      assert.equal((await db.query('select count(*)::int as n from trip_members where trip_id=$1 and user_id=$2',[trip,newcomer])).rows[0].n,0);
      const replacement=await issue(trip,'333333');assert.equal(replacement.invite_code,'333333');
      assert.equal((await accept('222222',newcomer)).status,'invalid');
      assert.equal((await accept('333333',newcomer)).tripId,trip);
      assert.equal((await db.query('select count(*)::int as n from trip_members where trip_id=$1',[trip])).rows[0].n,4);
    });
    await t.test('Authenticated clients cannot read codes/attempts or invoke service RPCs',async()=>{
      await db.exec('set role authenticated');
      for(const table of ['trip_short_invites','trip_invite_attempts','trip_invite_code_history'])await assert.rejects(db.query(`select * from ${table}`),e=>e.code==='42501');
      await assert.rejects(issue(trip,'222222'),e=>e.code==='42501');
      await db.exec('reset role');
    });
    await t.test('Delete rejects editor then removes only selected owned trip and all collaboration dependents',async()=>{
      await assert.rejects(db.query('select delete_shared_trip($1,$2)',[trip,editor]),/trip_forbidden/);
      const option=(await db.query("insert into trip_plan_options(trip_id,created_by,title) values($1,$2,'Museum') returning id",[trip,owner])).rows[0].id;
      await db.query('insert into trip_plan_votes(option_id,user_id) values($1,$2)',[option,guest]);
      const expense=(await db.query("insert into trip_expenses(trip_id,paid_by,created_by,title,amount,currency) values($1,$2,$2,'Tickets',10,'EUR') returning id",[trip,owner])).rows[0].id;
      await db.query('insert into trip_expense_shares(expense_id,user_id,amount) values($1,$2,10)',[expense,guest]);
      await db.query('select delete_shared_trip($1,$2)',[trip,owner]);
      assert.deepEqual((await db.query('select id from trips')).rows,[{id:second}]);
      for(const table of ['trip_plan_options','trip_plan_votes','trip_expenses','trip_expense_shares'])assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int as n from trip_members where trip_id=$1',[trip])).rows[0].n,0);
      assert.equal((await db.query('select invite_code from trip_short_invites')).rows[0].invite_code,'111111');
    });
  } finally {await db.close();}
});

function routeFixture({role='owner',rpcResult={data:null,error:null},rpcResults,authenticated=true}={}) {
  const calls=[]; let index=0;
  const query={select(){return this;},eq(){return this;},async order(){return {data:[],error:null};},async maybeSingle(){return {data:{role},error:null};}};
  const supabase={from(){return query;},async rpc(name,args){calls.push({name,args});return rpcResults?.[index++]||rpcResult;}};
  const route=load('app/api/trip-collaboration/route.ts',{
    '@/lib/trip-invite':{parseTripInvite},'node:crypto':{createHash,randomInt:()=>42,randomUUID:()=>trip},
    'next/server':{NextResponse:{json:(data,options={})=>({data,status:options.status||200,headers:options.headers||{}})}},
    '@/lib/authenticated-user':{requireAuthenticatedUser:async()=>authenticated?{ok:true,supabase,user:{id:owner}}:{ok:false,response:{status:401}}},
  });
  const post=body=>route.POST(new Request('https://www.letsgo2travel.com.tr/api/trip-collaboration',{method:'POST',body:JSON.stringify(body)}));
  return {calls,post,get:()=>route.GET(new Request('https://www.letsgo2travel.com.tr/api/trip-collaboration'))};
}
test('API returns numeric code without caching, retries collisions, uses DB clock and requires ownership',async()=>{
  const f=routeFixture({rpcResults:[{error:{message:'invite_code_collision'}},{data:[{invite_code:'000042',expires_at:'2026-11-01T12:05:00Z',server_now:'2026-11-01T12:00:00Z',invited_role:'editor'}]}]});
  const response=await f.post({action:'create_invite',tripId:trip});
  assert.equal(response.status,200);assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(response.data.data.inviteCode,'000042');assert.equal(response.data.data.serverNow,'2026-11-01T12:00:00Z');
  assert.equal(f.calls.length,2);assert.equal(f.calls[0].args.p_code_hash,hash('000042'));
  const forbidden=routeFixture({role:'editor'});assert.equal((await forbidden.post({action:'create_invite',tripId:trip})).status,403);assert.equal(forbidden.calls.length,0);
  assert.equal((await routeFixture({authenticated:false}).post({action:'accept_invite',inviteCode:'000042'})).status,401);
});
test('Private trip list and invitation acceptance responses cannot be cached',async()=>{
  const list=await routeFixture().get();assert.equal(list.status,200);assert.equal(list.headers['Cache-Control'],'no-store');assert.equal(list.data.data.length,0);
  for(const result of [{status:'joined',tripId:trip},{status:'invalid'},{status:'rate_limited',retryAfter:30}]){
    const response=await routeFixture({rpcResult:{data:result}}).post({action:'accept_invite',inviteCode:'000042'});
    assert.equal(response.headers['Cache-Control'],'no-store');
  }
});
test('API surfaces expiry, throttle, missing migration and owner-only deletion without unsafe fallback',async()=>{
  const invalid=routeFixture({rpcResult:{data:{status:'invalid'}}});assert.equal((await invalid.post({action:'accept_invite',inviteCode:'000042'})).status,410);
  const throttled=routeFixture({rpcResult:{data:{status:'rate_limited',retryAfter:120}}});const limited=await throttled.post({action:'accept_invite',inviteCode:'000042'});assert.equal(limited.status,429);assert.equal(limited.headers['Retry-After'],'120');
  const missing=routeFixture({rpcResult:{error:{code:'PGRST202'}}});assert.equal((await missing.post({action:'create_invite',tripId:trip})).status,503);
  const editorFixture=routeFixture({role:'editor'});assert.equal((await editorFixture.post({action:'delete_trip',tripId:trip})).status,403);assert.equal(editorFixture.calls.length,0);
  const owned=routeFixture();assert.equal((await owned.post({action:'delete_trip',tripId:trip})).status,200);assert.equal(owned.calls[0].name,'delete_shared_trip');
});
test('Exhausted or repeatedly colliding code space reports unavailability and never issues an unsafe fallback',async()=>{
  const busy=routeFixture({rpcResult:{error:{message:'invite_code_collision'}}});
  const response=await busy.post({action:'create_invite',tripId:trip});
  assert.equal(response.status,503);assert.equal(response.data.code,'INVITE_CODE_BUSY');assert.equal(busy.calls.length,8);assert.equal(response.data.data,undefined);
});
