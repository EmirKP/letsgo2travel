import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,imports={}) {const output=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const loadedModule={exports:{}};vm.runInNewContext(output,{module:loadedModule,exports:loadedModule.exports,require:name=>imports[name]??require(name),Request,Response,URL,console,Date,AbortSignal},{filename:path});return loadedModule.exports;}
const NextResponse={json:(body,init)=>Response.json(body,init)};
const policy=load('lib/account-deletion-policy.ts');
const id='10000000-0000-4000-8000-000000000001', owner='20000000-0000-4000-8000-000000000001';
function harness(options={}) {
 const state={events:[], user:{id:owner,email:'person@example.com',user_metadata:{}},kvkk:{id,user_id:owner,request_type:policy.ACCOUNT_DELETION_TYPE,status:'reviewing',request_locale:'tr',created_at:'2026-09-10T12:00:00.000Z'},job:null,...options};
 const db={from(table){const query={table,action:'select',filters:[],values:null,single:false};const b={};for(const name of ['select','update','insert','upsert','eq','in','is','order','limit','maybeSingle','single','delete'])b[name]=(...args)=>{if(['update','insert','upsert','delete'].includes(name)){query.action=name;query.values=args[0];}if(name==='eq')query.filters.push(args);if(name==='maybeSingle'||name==='single')query.single=true;return b;};b.then=(resolve,reject)=>Promise.resolve().then(()=>{
   state.events.push(`${table}:${query.action}`);state.lastQuery=query;
   if(state.failTable===table)return {data:null,error:{code:'missing'}};
   if(table==='kvkk_requests'){if(query.action==='update')Object.assign(state.kvkk,query.values);return {data:query.single?state.kvkk:[state.kvkk],error:null};}
   if(table==='profiles')return{data:{role:state.role||'user'},error:state.roleError?{code:'failed'}:null};
   if(table==='account_deletion_jobs'){
     if(query.action==='upsert'&&!state.job)state.job={...query.values,recipient_email:null,phase:'prepared',completed_at:null};
     if(query.action==='update'){
       if(state.failPhase && query.values.phase===state.failPhase){state.failPhase=null;return {data:null,error:{code:'interrupted'}};}
       Object.assign(state.job,query.values);
     }
     return{data:state.job,error:null};
   }
   return{data:null,error:null};
 }).then(resolve,reject);return b;},
 rpc:async()=>{state.events.push('lease');if(state.busy)return{data:[],error:null};state.job.lease_token='lease';return{data:[{...state.job}],error:null};},
 auth:{admin:{getUserById:async()=>{state.events.push('get-user');return state.user?{data:{user:state.user},error:null}:{data:{user:null},error:{status:404}};},deleteUser:async()=>{state.events.push('delete-account');if(state.deleteFails)return{error:{status:500}};state.user=null;state.kvkk.user_id=null;return{error:null};}}}};
 const notification=load('lib/account-deletion-notification.ts',{'./mail':{sendMail:async(mail)=>{state.events.push('send-mail');state.mail=mail;return{success:!state.mailFails};}}});
 class CleanupError extends Error{}
 const route=load('app/api/admin/kvkk-requests/[id]/execute-account-deletion/route.ts',{'next/server':{NextResponse},'@/lib/admin-auth':{adminPrincipalFromRequest:async()=>state.unauthorized?null:{subject:state.self?owner:'admin'}},'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db},'@/lib/account-deletion-policy':policy,'@/lib/account-deletion-notification':notification,'@/lib/account-deletion-cleanup':{AccountCleanupError:CleanupError,cleanAccountData:async()=>{state.events.push('cleanup');if(state.cleanupFails)throw new Error('cleanup failed');}},'@/lib/apple-account-deletion':{revokeAppleBeforeDeletion:async()=>{state.events.push('apple-revoke');return state.appleFails?{ok:false,status:409,code:'apple_authorization_required',message:'Apple required'}:{ok:true};}}});
 const call=async(confirmation='HESABI KALICI SIL')=>{const response=await route.POST(new Request('https://example.com/api/delete',{method:'POST',body:JSON.stringify({confirmation})}),{params:Promise.resolve({id})});return{status:response.status,...await response.json()};};
 return{state,db,call,notification};
}
let passed=0;async function check(name,fn){await fn();passed++;console.log('PASS',name);}
await check('authorization and explicit deletion confirmation precede database access',async()=>{
 for(const opts of [{unauthorized:true},{}]){const h=harness(opts);const r=await h.call('DELETE');assert([401,400].includes(r.status));assert.deepEqual(h.state.events,[]);}
});
await check('privileged target and unavailable role lookup never delete',async()=>{
 for(const opts of [{role:'admin'},{roleError:true},{self:true}]){const h=harness(opts);assert((await h.call()).status>=400);assert(!h.state.events.includes('cleanup'));assert(!h.state.events.includes('send-mail'));}
});
await check('Apple prerequisite failure precedes every destructive cleanup and email',async()=>{
 const h=harness({appleFails:true});assert.equal((await h.call()).status,409);assert(!h.state.events.includes('cleanup'));assert(!h.state.events.includes('delete-account'));assert(!h.state.events.includes('send-mail'));assert.equal(h.state.job.lease_until,null);
});
await check('successful deletion orders Apple revoke, cleanup, account delete then email and erases recipient',async()=>{
 const h=harness();assert.equal((await h.call()).status,200);const e=h.state.events;assert(e.indexOf('apple-revoke')<e.indexOf('cleanup'));assert(e.indexOf('cleanup')<e.indexOf('delete-account'));assert(e.indexOf('delete-account')<e.indexOf('send-mail'));assert.equal(h.state.job.recipient_email,null);assert.equal(h.state.job.target_user_id,null);assert.equal(h.state.kvkk.completion_notification_status,'sent');
 assert.equal(h.state.mail.idempotencyKey,`account-deletion-completed/${id}`);assert.doesNotMatch(h.state.mail.html,/person@example|20000000/);
});
await check('provider deletion failure sends no completion mail and is resumable',async()=>{
 const h=harness({deleteFails:true});assert.equal((await h.call()).status,500);assert.equal(h.state.job.phase,'cleaned');assert(!h.state.events.includes('send-mail'));h.state.deleteFails=false;assert.equal((await h.call()).status,200);
});
await check('crash after provider deletion resumes with missing user from durable cleaned phase',async()=>{
 const h=harness({failPhase:'deleted'});assert.equal((await h.call()).status,503);assert.equal(h.state.user,null);assert.equal(h.state.job.phase,'cleaned');assert(!h.state.events.includes('send-mail'));assert.equal((await h.call()).status,200);assert.equal(h.state.events.filter(e=>e==='delete-account').length,1);
});
await check('mail outage retains transient recipient; retry only notifies and never deletes again',async()=>{
 const h=harness({mailFails:true});const result=await h.call();assert.equal(result.status,200);assert.equal(result.notificationPending,true);assert.equal(h.state.job.recipient_email,'person@example.com');assert.equal(h.state.kvkk.completion_notification_status,'pending');const count=h.state.events.filter(e=>e==='cleanup').length;h.state.mailFails=false;assert.equal((await h.call()).notificationPending,false);assert.equal(h.state.events.filter(e=>e==='cleanup').length,count);assert.equal(h.state.job.recipient_email,null);await h.call();assert.equal(h.state.events.filter(e=>e==='send-mail').length,2);
});
await check('lease contention and missing migration fail before destructive work',async()=>{
 for(const opts of [{busy:true},{failTable:'account_deletion_jobs'}]){const h=harness(opts);assert((await h.call()).status>=400);assert(!h.state.events.includes('cleanup'));assert(!h.state.events.includes('send-mail'));}
});
await check('request summary excludes notes, email and owner identity',()=>{
 const result=policy.deletionSummary({id,status:'pending',created_at:'2026-09-10T12:00:00.000Z',notes:'private',email:'private',user_id:owner});assert.deepEqual(Object.keys(result).sort(),['completedAt','createdAt','id','notificationStatus','status','targetCompletionAt']);assert.equal(result.targetCompletionAt,'2026-10-10T12:00:00.000Z');
});
await check('owner status query is scoped and non-boolean confirmation cannot create a request',async()=>{
 const h=harness();let called=0;h.db.rpc=async(name,args)=>{called++;assert.equal(name,'create_account_deletion_request');assert.equal(args.p_user_id,owner);return{data:[h.state.kvkk],error:null};};
 const api=load('app/api/kvkk-requests/route.ts',{'next/server':{NextResponse},'@/lib/authenticated-user':{requireAuthenticatedUser:async()=>({ok:true,supabase:h.db,user:h.state.user})},'@/lib/account-deletion-policy':policy});
 for(const confirmed of ['true',1,null]){const r=await api.POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({confirmed,requestType:policy.ACCOUNT_DELETION_TYPE})}));assert.equal(r.status,400);}
 assert.equal(called,0);
 const result=await api.POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({confirmed:true,requestType:policy.ACCOUNT_DELETION_TYPE,user_id:'attacker',locale:'en'})}));assert.equal(result.status,200);assert.equal(called,1);
 const response=await api.GET(new Request('https://example.com'));assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await response.json()).request.id,id);assert(h.state.lastQuery.filters.some(([column,value])=>column==='user_id'&&value===owner));
});
console.log(`${passed} account deletion lifecycle checks passed`);
