import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema auth,public to anon,authenticated,service_role;
create table auth.users(id uuid primary key);
create table kvkk_requests(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete set null,request_type text,status text,notes text,created_at timestamptz default now(),processed_at timestamptz);
create table forum_reports(user_id uuid not null references auth.users(id));
grant all on kvkk_requests to service_role;`);
await db.exec(readFileSync('supabase/migrations/20260910180000_account_deletion_lifecycle.sql','utf8'));
const a='10000000-0000-4000-8000-000000000001', token='20000000-0000-4000-8000-000000000001';
await db.query('insert into auth.users values($1)',[a]);
async function role(name){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.role',$1,false)",[name]);await db.exec(`set role ${name}`);}
let passed=0;async function check(name,fn){await fn();passed++;console.log('PASS',name);}
await role('service_role');
let request;
await check('duplicate request is idempotent and keeps original deadline',async()=>{
 const rows=await Promise.all(Array.from({length:5},()=>db.query("select * from create_account_deletion_request($1,'en')",[a])));
 request=rows[0].rows[0];assert(rows.every(r=>r.rows[0].id===request.id));
 assert.equal(request.request_locale,'en');assert.equal(new Date(request.target_completion_at)-new Date(request.created_at),30*86400000);
});
await check('ordinary users cannot create service jobs or invoke service RPCs',async()=>{
 await role('authenticated');
 await assert.rejects(db.query('select * from account_deletion_jobs'));
 await assert.rejects(db.query('select * from create_account_deletion_request($1,$2)',[a,'tr']));
 await assert.rejects(db.query('select * from claim_account_deletion_job($1,$2)',[request.id,token]));
 await role('service_role');
});
await db.query('insert into account_deletion_jobs(request_id,target_user_id) values($1,$2)',[request.id,a]);
await check('pending requests cannot be claimed for permanent deletion',async()=>{
 assert.equal((await db.query('select * from claim_account_deletion_job($1,$2)',[request.id,token])).rows.length,0);
});
// Job creation is performed only after review in production; set up reviewing fixture as owner.
await db.exec('reset role; alter table kvkk_requests disable trigger protect_account_deletion_progress');
await db.query("update kvkk_requests set status='reviewing' where id=$1",[request.id]);
await db.exec('alter table kvkk_requests enable trigger protect_account_deletion_progress');await role('service_role');
await check('only one lease can execute and an expired lease can resume',async()=>{
 assert.equal((await db.query('select * from claim_account_deletion_job($1,$2)',[request.id,token])).rows.length,1);
 assert.equal((await db.query('select * from claim_account_deletion_job($1,$2)',[request.id,token])).rows.length,0);
 await db.query("update account_deletion_jobs set lease_until=now()-interval '1 second'");
 assert.equal((await db.query('select * from claim_account_deletion_job($1,$2)',[request.id,token])).rows.length,1);
});
await check('started deletion cannot be cancelled or falsely marked complete',async()=>{
 await assert.rejects(db.query("update kvkk_requests set status='rejected' where id=$1",[request.id]));
 await assert.rejects(db.query("update kvkk_requests set status='processed' where id=$1",[request.id]));
});
await check('an Apple callback in flight prevents acquiring a deletion lease',async()=>{
 await db.exec('reset role; create table apple_account_deletion_authorizations(user_id uuid,expires_at timestamptz);');
 await db.query("insert into apple_account_deletion_authorizations values($1,now()+interval '1 minute')",[a]);await role('service_role');
 await db.query('update account_deletion_jobs set lease_until=null');
 assert.equal((await db.query('select * from claim_account_deletion_job($1,$2)',[request.id,token])).rows.length,0);
});
await check('durable completion survives account deletion and is terminal',async()=>{
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[a]);await role('service_role');
 assert.equal((await db.query('select * from account_deletion_jobs')).rows[0].target_user_id,a);
 await db.query("update account_deletion_jobs set phase='deleted'");
 await db.query("update kvkk_requests set status='processed' where id=$1",[request.id]);
 await assert.rejects(db.query("update kvkk_requests set status='pending' where id=$1",[request.id]));
});
await db.close();console.log(`${passed} account deletion database checks passed`);
