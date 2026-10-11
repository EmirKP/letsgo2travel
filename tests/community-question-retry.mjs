import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const bytes=Buffer.from('a prepared, metadata-free jpeg');
function harness(){
 const state={authenticated:true,reserveError:null,completeError:null,committed:false,status:'pending',uploadFailure:false,download:null,storageReady:true};
 const calls=[],writes=[],objects=new Map();
 const db={rpc:async(name,input)=>{
  calls.push({name,input});if(name==='reserve_community_question')return state.reserveError?{error:state.reserveError}:{data:{id:id(8),committed:state.committed,status:state.status}};
  assert.equal(name,'complete_community_question');return state.completeError?{error:state.completeError}:{data:{id:id(8),status:input.p_status}};
 },from:table=>({insert:async row=>{writes.push({table,row});return{};}}),storage:{from:()=>({
  upload:async(path,data,options)=>{calls.push({name:'upload',path,options});if(state.uploadFailure||objects.has(path))return{error:{status:409}};objects.set(path,data);return{};},
  download:async path=>{calls.push({name:'download',path});const data=state.download??objects.get(path);return{data:data?new Blob([data]):null};},
  remove:async paths=>{calls.push({name:'remove',paths});return{};}
 })}};
 const imports={
  'node:crypto':crypto,'next/server':{NextResponse:Response},
  '@/lib/community/moderation':{moderateUserText:()=>({action:'visible'})},
  '@/lib/community/forum-sync':{createForumTopicSlug:(_title,id)=>`topic-${id}`,forumCategoryFromCommunityCategory:()=> 'General',forumCountrySlugFromCode:()=>null,forumStatusFromModeration:action=>action==='visible'?'published':'pending'},
  '@/lib/authenticated-user':{requireAuthenticatedUser:async()=>state.authenticated?{ok:true,supabase:db,user:{id:id(1),user_metadata:{username:'Traveller'}}}:{ok:false,response:Response.json({}, {status:401})}},
  '@/lib/community/photos':{COMMUNITY_PHOTO_BUCKET:'community-post-photos',MAX_COMMUNITY_PHOTO_BYTES:300000,MAX_COMMUNITY_POST_REQUEST_BYTES:450000,communityPhotoStorageReady:async()=>state.storageReady,prepareCommunityPhoto:async photo=>photo==='photo'?bytes:null},
  '@/lib/community/safety':{COMMUNITY_PRIVATE_HEADERS:{'Cache-Control':'private, no-store'},COMMUNITY_UUID:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i},
 };
 const code=ts.transpileModule(readFileSync('app/api/country-community/questions/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Buffer,Uint8Array,Response,console})(name=>{assert.ok(imports[name],name);return imports[name];},mod,mod.exports);
 return{state,calls,writes,objects,post(patch={}){return mod.exports.POST(new Request('https://test/api/country-community/questions',{method:'POST',body:JSON.stringify({countryCode:'ZZ',title:'An original trip',body:'A useful original travel story',requestId:id(2),...patch})}));}};
}
test('question API binds the authenticated identity and canonical payload, returns committed state without writes',async()=>{
 const h=harness();const first=await h.post();assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'private, no-store');
 assert.equal(h.calls[0].input.p_user,id(1));assert.equal(h.calls[0].input.p_request,id(2));assert.equal(h.calls[1].input.p_country_slug,null);assert.equal(h.writes.length,0);
 const original=h.calls[0].input.p_payload_hash;await h.post({title:'Different intent'});assert.notEqual(h.calls[2].input.p_payload_hash,original);
 h.state.committed=true;h.state.status='rejected';const before=h.calls.length;const retry=await h.post();assert.equal((await retry.json()).data.status,'rejected');assert.equal(h.calls.length,before+1);
 h.state.status=undefined;assert.equal((await h.post()).status,503,'Malformed canonical results cannot claim success');
});
test('photo retry reuses and verifies existing bytes after uncertain completion, never compensates a possibly committed object',async()=>{
 const h=harness();h.state.completeError={code:'08006'};assert.equal((await h.post({photo:'photo'})).status,503);assert.equal(h.objects.size,1);assert.ok(!h.calls.some(c=>c.name==='remove'));
 h.state.completeError=null;const retry=await h.post({photo:'photo'});assert.equal(retry.status,200);assert.equal((await retry.json()).data.status,'pending');assert.equal(h.objects.size,1);assert.ok(h.calls.some(c=>c.name==='download'));
 const reserved=h.calls.filter(c=>c.name==='reserve_community_question');assert.equal(reserved[0].input.p_payload_hash,reserved[1].input.p_payload_hash);assert.equal(reserved[0].input.p_photo_hash,crypto.createHash('sha256').update(bytes).digest('hex'));
 h.state.download=Buffer.from('unexpected object');assert.equal((await h.post({photo:'photo'})).status,409);
 assert.ok(!h.calls.some(c=>c.name==='remove'));assert.equal(h.writes.length,0);
});
test('missing storage or failed resume cannot claim success, and committed retries do not reupload',async()=>{
 const h=harness();h.state.uploadFailure=true;assert.equal((await h.post({photo:'photo'})).status,503);assert.ok(!h.calls.some(c=>c.name==='complete_community_question'));
 h.state.uploadFailure=false;h.state.storageReady=false;assert.equal((await h.post({photo:'photo'})).status,503);
 h.state.committed=true;h.state.status='published';const before=h.calls.length;assert.equal((await h.post({photo:'photo'})).status,200);assert.equal(h.calls.length,before+1);
});
test('new request validation and uncertain RPC errors never downgrade into legacy duplicate writes; legacy no-ID clients still work',async()=>{
 const h=harness();h.state.authenticated=false;assert.equal((await h.post()).status,401);assert.equal(h.calls.length,0);
 h.state.authenticated=true;assert.equal((await h.post({requestId:'bad'})).status,400);assert.equal((await h.post({photo:'invalid'})).status,400);assert.equal(h.calls.length,0);
 for(const [code,status]of[['08006',503],['23505',409],['P0002',410]]){h.state.reserveError={code};assert.equal((await h.post()).status,status);}
 assert.equal(h.writes.length,0);assert.equal((await h.post({requestId:undefined})).status,200);assert.equal(h.writes.length,1);
});
