import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function harness(){
 let signedIn=true,allowed=true,action='visible',rpcError=null;
 const calls=[],directWrites=[];
 const db={from(table){
  if(table==='forum_topics')return{select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:id(1),author_id:id(3),country_slug:null,status:'published'}})})})};
  return{insert(row){directWrites.push({table,row});return{select:async()=>({data:[{id:id(8)}]})};}};
 },rpc:async(name,input)=>{calls.push({name,input});return rpcError?{error:rpcError}:{data:{id:id(9),status:input.p_status}};}};
 const imports={
  'next/server':{NextResponse:{json:(data,options)=>Response.json(data,options)}},
  '@/lib/community/safety':{canCommunityUsersInteract:async()=>allowed},
  '@/lib/community/moderation':{moderateUserText:()=>({action})},
  '@/lib/community/permissions':{getCountryPermission:async()=>({canAnswer:false})},
  '@/lib/community/forum-sync':{countryCodeFromForumSlug:()=> 'ZZ',forumStatusFromModeration:value=>value==='visible'?'published':'pending',GENERAL_FORUM_COUNTRY_CODE:'ZZ'},
  '@/lib/authenticated-user':{requireAuthenticatedUser:async()=>signedIn?{ok:true,supabase:db,user:{id:id(2),user_metadata:{username:'Traveller'}}}:{ok:false,response:Response.json({}, {status:401})}},
  '@/lib/community/starter-topic':{isOpenStarterDiscussion:()=>false},
 };
 const code=ts.transpileModule(readFileSync('app/api/country-community/answers/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Response})(name=>{assert.ok(imports[name],name);return imports[name];},mod,mod.exports);
 return{calls,directWrites,set(values){if('signedIn'in values)signedIn=values.signedIn;if('allowed'in values)allowed=values.allowed;if('action'in values)action=values.action;if('rpcError'in values)rpcError=values.rpcError;},post(patch={}){return mod.exports.POST(new Request('https://test/api/country-community/answers',{method:'POST',body:JSON.stringify({countryCode:'ZZ',questionId:id(1),body:'An original useful answer',requestId:id(4),...patch})}));}};
}

test('answer retries use the atomic operation RPC and never fall back to a duplicate insert on uncertain errors',async()=>{
 const h=harness();const first=await h.post(),retry=await h.post();assert.equal(first.status,200);assert.equal(retry.status,200);
 assert.equal(h.calls.length,2);assert.equal(h.calls[0].name,'create_community_answer_once');assert.equal(h.calls[0].input.p_request,id(4));assert.deepEqual(h.calls[0].input,h.calls[1].input);assert.equal(h.directWrites.length,0);
 h.set({rpcError:{code:'08006'}});assert.equal((await h.post()).status,500);assert.equal(h.directWrites.length,0);
 h.set({rpcError:{code:'23505'}});assert.equal((await h.post()).status,409);
 h.set({rpcError:{code:'P0002'}});assert.equal((await h.post()).status,410);
});

test('new operation IDs preserve authentication, blocking, validation and moderation; legacy clients remain compatible',async()=>{
 const h=harness();h.set({signedIn:false});assert.equal((await h.post()).status,401);assert.equal(h.calls.length,0);
 h.set({signedIn:true,allowed:false});assert.equal((await h.post()).status,403);assert.equal(h.calls.length,0);
 h.set({allowed:true});assert.equal((await h.post({requestId:'bad'})).status,400);assert.equal(h.calls.length,0);
 h.set({action:'pending_review'});const response=await h.post();assert.equal(response.status,200);assert.equal(h.calls[0].input.p_status,'pending');assert.equal((await response.json()).moderation.action,'pending_review');
 h.set({action:'visible'});assert.equal((await h.post({requestId:undefined})).status,200);assert.ok(h.directWrites.some(item=>item.table==='forum_replies'));assert.equal(h.calls.length,1);
});
