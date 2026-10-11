import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
function load(path,imports={}){
 const loaded={exports:{}};const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Request,Response,URL,Buffer,Uint8Array,Map,Set,Date,console})(name=>{if(name in imports)return imports[name];throw Error(`Missing import ${name}`);},loaded,loaded.exports);return loaded.exports;
}
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000001';
const copy=value=>JSON.parse(JSON.stringify(value));
const safety=load('lib/community/safety.ts');
const avatars=load('lib/profile-photo.ts');
const profiles=load('lib/community/profiles.ts',{'@/lib/profile-photo':avatars,'./safety':safety,'./forum-sync':{countryCodeFromForumSlug:()=>null}});
const contract=load('lib/community/social-contract.ts');
const social=load('lib/community/social.ts',{'./safety':safety,'./profiles':profiles,'./social-contract':contract});
const moderation=load('lib/community/moderation.ts');
const body=input=>new Request('https://example.com/api/country-community/social',{method:'POST',body:JSON.stringify(input)});

test('social parser validates precise positions, privacy, Unicode lengths, comment/report ownership inputs and bounded actual streams',async()=>{
 const valid={requestId:id,caption:'Trip',visibility:'followers',photo:'ignored',userId:b,place:{name:'Oslo',countryCode:'NO',lat:59.91,lng:10.75}};
 assert.deepEqual(copy(social.parseSocialCreate(valid)),{requestId:id,caption:'Trip',visibility:'followers',place:{name:'Oslo',countryCode:'NO',lat:59.91,lng:10.75}});
 for(const patch of [{visibility:'all'},{requestId:'../x'},{caption:'a'.repeat(2201)},{caption:'bad\0'},{place:{name:'Here',lat:91,lng:0}},{place:{name:'Here',lat:0}},{place:{name:'Here',countryCode:'TUR'}}])assert.equal(social.parseSocialCreate({...valid,...patch}),null);
 assert.equal(social.parseSocialCreate({...valid,caption:'😀'.repeat(2200)}).caption.length,4400);
 assert.equal(social.parseSocialAction({action:'like',postId:id,active:'false'}),null);
 assert.deepEqual(copy(social.parseSocialAction({action:'like',postId:id,active:true,userId:b,status:'published'})),{postId:id,active:true});
 assert.equal(social.parseSocialAction({action:'comment',postId:id,requestId:a,body:'Hello',parentId:'bad'}),null);
 assert.equal(social.parseSocialAction({action:'report',postId:id,reason:'other',details:'no'}),null);
 assert.equal(social.parseSocialPreferences({comments:false,user_id:b}),null);
 assert.deepEqual(copy(social.parseSocialPreferences({comments:false,price_alert_email:false})),{comments:false,price_alert_email:false});
 assert.equal(await social.readSocialJson(new Request('https://example.com',{method:'POST',body:'{broken'})),null);
 assert.equal(await social.readSocialJson(body({caption:'a'.repeat(1000)}),50),null);
});

test('avatar hydration strips storage paths and signs only consented owned paths',async()=>{
 const paths=[];const db={storage:{from:bucket=>({createSignedUrls:async input=>{assert.equal(bucket,'profile-avatars');paths.push(...input);return{data:input.map(path=>({path,signedUrl:'https://example.com/valid.jpg'}))};}})}};
 const input={items:[{author:{key:`user:${a}`,userId:a,username:'alice',avatarPath:`${a}/${id}.jpg`}},{author:{key:`user:${b}`,userId:b,username:'bob',avatarPath:`${a}/${id}.jpg`}}]};
 const data=await social.hydrateSocialData(db,input);assert.equal(data.items[0].author.avatarUrl,'https://example.com/valid.jpg');assert.equal(data.items[1].author.avatarUrl,null);
 assert.ok(!JSON.stringify(data).includes('avatarPath'));assert.deepEqual(paths,[`${a}/${id}.jpg`]);
});

function harness({user=a,result={items:[],nextOffset:null},rpcError=null,admissionError=null,cleanupIds=[],cleanupError=null,removeError=null,finishError=null,existing=null,uploadError=null,bucketPublic=false,storedPhoto='jpeg'}={}){
 const calls=[],downloads=[],uploads=[],removed=[];
 const db={rpc:async(name,input)=>{calls.push({name,input});return name==='prepare_travel_social_upload_cleanup'?{data:{requestIds:cleanupIds},error:cleanupError}:name==='finish_travel_social_upload_cleanup'?{data:{success:true},error:finishError}:name==='reserve_travel_social_upload'?{data:{admitted:true},error:admissionError}:{data:result,error:rpcError};},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:existing,error:null})})})}),storage:{getBucket:async()=>({data:{public:bucketPublic},error:null}),from:()=>({createSignedUrls:async()=>({data:[]}),download:async path=>{downloads.push(path);return{data:new Blob([storedPhoto]),error:null};},upload:async(path,_bytes,options)=>{uploads.push({path,options});return{error:uploadError};},remove:async paths=>{removed.push(...paths);return{error:removeError};}})}};
 const imports={'node:crypto':{createHash},'@/lib/authenticated-user':{requireAuthenticatedUser:async()=>user?{ok:true,user:{id:user},supabase:db}:{ok:false,response:Response.json({error:'Sign in'},{status:401})}},'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db},'@/lib/community/viewer':{communityViewer:async()=>({ok:true,userId:user,hiddenUserIds:[]})},'@/lib/community/safety':safety,'@/lib/community/photos':{prepareCommunityPhoto:async value=>value==='valid-photo'?Buffer.from('safe-jpeg'):null},'@/lib/community/moderation':moderation,'@/lib/community/profiles':profiles,'@/lib/community/social-contract':contract,'@/lib/community/social':social};
 return{calls,uploads,removed,downloads,db,route:load('app/api/country-community/social/route.ts',imports),photo:load('app/api/country-community/social/[id]/photo/route.ts',imports),preferences:load('app/api/country-community/social/preferences/route.ts',imports)};
}

test('feed/detail/collections API rejects malformed filters and uses verified viewer; guests cannot read private inbox or mutate',async()=>{
 const h=harness();
 for(const query of ['section=photo&postId='+id,'offset=-1','offset=10001','feed=unknown','collectionId=no','authorRef=bad'])assert.equal((await h.route.GET(new Request('https://example.com?'+query))).status,400);
 assert.equal(h.calls.length,0);
 const response=await h.route.GET(new Request('https://example.com?feed=following&offset=20&viewer='+b));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(copy(h.calls[0]),{name:'read_travel_social',input:{p_viewer:a,p_input:{offset:20,feed:'following'}}});
 const guest=harness({user:null});assert.equal((await guest.route.GET(new Request('https://example.com?section=notifications'))).status,401);assert.equal((await guest.route.GET(new Request('https://example.com?feed=following'))).status,401);
 assert.equal((await guest.route.POST(body({action:'delete',postId:id}))).status,401);assert.equal(guest.calls.length,0);
 assert.equal((await guest.route.GET(new Request('https://example.com'))).status,200);
});

test('writes strip actor/status spoofing, apply actual moderation, and persist partial notification preferences',async()=>{
 const h=harness({result:{id}});
 assert.equal((await h.route.POST(body({action:'comment',postId:id,requestId:b,body:'You are an asshole',status:'published',userId:b}))).status,200);
 assert.equal(h.calls[0].input.p_viewer,a);assert.equal(h.calls[0].input.p_input.status,'pending');assert.ok(!('userId' in h.calls[0].input.p_input));
 assert.equal((await h.route.POST(body({action:'like',postId:id,active:true,userId:b}))).status,200);assert.deepEqual(copy(h.calls[1].input.p_input),{postId:id,active:true});
 const patch=await h.preferences.PATCH(new Request('https://example.com',{method:'PATCH',body:JSON.stringify({comments:false,price_alert_push:false})}));assert.equal(patch.status,200);
 assert.deepEqual(copy(h.calls[2].input),{p_viewer:a,p_action:'preferences',p_input:{comments:false,price_alert_push:false}});
 assert.equal((await h.preferences.PATCH(new Request('https://example.com',{method:'PATCH',body:JSON.stringify({user_id:b,follows:false})}))).status,400);
});

test('blocking is authenticated and canonical-content scoped; caller-supplied target identity cannot select a victim',async()=>{
 const h=harness({result:{success:true,userId:b}});
 const response=await h.route.POST(body({action:'block',postId:id,userId:b,authorId:b,targetKey:`user:${b}`}));assert.equal(response.status,200);
 assert.deepEqual(copy(h.calls[0].input),{p_viewer:a,p_action:'block',p_input:{postId:id}});
 assert.equal((await h.route.POST(body({action:'block',postId:id,commentId:'../other'}))).status,400);
 const guest=harness({user:null});assert.equal((await guest.route.POST(body({action:'block',postId:id}))).status,401);assert.equal(guest.calls.length,0);
});

test('photo creation strips private storage details, retries never reupload, and uncertain failed commits retain immutable bytes for recovery',async()=>{
 const input={action:'create',requestId:id,caption:'Trip',visibility:'public',photo:'valid-photo'};
 const h=harness({result:{id,status:'pending',author:{key:`user:${a}`,userId:a,username:'Alice',avatarPath:null}}});
 const response=await h.route.POST(body(input));assert.equal(response.status,201);assert.equal(h.uploads[0].path,`${a}/${id}.jpg`);assert.equal(h.uploads[0].options.upsert,false);
 assert.deepEqual(h.calls.map(call=>call.name),['prepare_travel_social_upload_cleanup','reserve_travel_social_upload','write_travel_social']);
 assert.equal(h.calls[1].input.p_input.photoHash,createHash('sha256').update('safe-jpeg').digest('hex'));assert.ok(!('photo' in h.calls[1].input.p_input));
 const retry=harness({existing:{id},result:{id}});assert.equal((await retry.route.POST(body(input))).status,200);assert.equal(retry.uploads.length,0);
 const failed=harness({rpcError:{code:'54000'}});assert.equal((await failed.route.POST(body(input))).status,429);assert.deepEqual(failed.removed,[]);
 const publicBucket=harness({bucketPublic:true});assert.equal((await publicBucket.route.POST(body(input))).status,503);assert.equal(publicBucket.uploads.length,0);
});

test('media proxy rechecks visibility, owner path and private bucket before downloading; responses cannot be cached',async()=>{
 const denied=harness({result:null});assert.equal((await denied.photo.GET(new Request('https://example.com'),{params:Promise.resolve({id})})).status,404);assert.equal(denied.downloads.length,0);
 const wrong=harness({result:{userId:a,storagePath:`${b}/${id}.jpg`}});assert.equal((await wrong.photo.GET(new Request('https://example.com'),{params:Promise.resolve({id})})).status,404);
 const good=harness({result:{userId:a,storagePath:`${a}/${id}.jpg`}});const response=await good.photo.GET(new Request('https://example.com'),{params:Promise.resolve({id})});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Authorization');assert.equal(response.headers.get('content-type'),'image/jpeg');assert.deepEqual(good.downloads,[`${a}/${id}.jpg`]);
});

function cleanupHarness({count=1,lookupError=null,listError=null,removeError=null,invalidName=null}={}) {
 const names=Array.from({length:count},(_,i)=>`30000000-0000-4000-8000-${String(i).padStart(12,'0')}.jpg`);
 if(invalidName)names.push(invalidName);
 const otherPath=`${b}/${id}.jpg`;
 const objects=new Set([...names.map(name=>`${a}/${name}`),otherPath]);
 const calls=[],removed=[],pages=[];
 const db={from(table) {
   assert.equal(table,'travel_social_posts','No later personal data cleanup is allowed after private media failure');
   calls.push(table);
   return {select(columns) {assert.equal(columns,'id');return {eq(column,owner) {
     assert.equal(column,'user_id');assert.equal(owner,a);return {limit:async limit=>{
       assert.equal(limit,1);
       // Storage may contain orphan uploads even when there are no committed posts.
       return {data:[],error:lookupError};
     }};
   }};}};},storage:{from(bucket) {
     assert.equal(bucket,contract.SOCIAL_PHOTO_BUCKET);
     return {list:async (owner,options)=>{
       assert.equal(owner,a);assert.equal(options.limit,100);pages.push(owner);
       const data=[...objects].filter(path=>path.startsWith(`${owner}/`)).slice(0,options.limit).map(path=>({name:path.slice(owner.length+1)}));
       return {data:listError?null:data,error:listError};
     },remove:async paths=>{
       removed.push(...paths);
       if(!removeError)for(const path of paths)objects.delete(path);
       return {error:removeError};
     }};
   }}};
 return {db,objects,otherPath,names,calls,removed,pages};
}

test('account erasure removes every private social photo page including orphan uploads, scoped to its owner',async()=>{
 const h=cleanupHarness({count:203});
 await social.removeSocialAccountPhotos(h.db,a);
 assert.equal(h.removed.length,203);assert.equal(new Set(h.removed).size,203);
 assert.equal(h.pages.length,4,'Three full/partial batches plus a final empty page');
 assert.deepEqual([...h.objects],[h.otherPath]);
 assert.deepEqual(h.removed,h.names.map(name=>`${a}/${name}`));
 await social.removeSocialAccountPhotos(h.db,a);
 assert.equal(h.removed.length,203,'A resumed cleanup is idempotent');
 assert.deepEqual([...h.objects],[h.otherPath]);
});

test('private social cleanup fails closed for unreadable storage and unsafe paths; only absent legacy schema is optional',async()=>{
 for(const options of [
   {lookupError:{code:'42501'}}, {listError:{status:403}}, {removeError:{status:500}},
   {invalidName:`../${b}/${id}.jpg`}, {invalidName:'unexpected.txt'},
 ]) {
   const h=cleanupHarness(options);
   await assert.rejects(social.removeSocialAccountPhotos(h.db,a),/social_cleanup/);
   assert.ok(h.objects.has(h.otherPath));assert.equal(h.objects.size,h.names.length+1);
   if(!options.removeError)assert.equal(h.removed.length,0);
 }
 for(const code of ['42P01','PGRST205']) {
   const h=cleanupHarness({lookupError:{code}});await social.removeSocialAccountPhotos(h.db,a);
   assert.equal(h.pages.length,0);assert.equal(h.removed.length,0);
 }
 const invalid=cleanupHarness();await assert.rejects(social.removeSocialAccountPhotos(invalid.db,'../other'),/invalid_social_owner/);
 assert.equal(invalid.calls.length,0);assert.equal(invalid.pages.length,0);
});

test('account cleanup propagates private social media failure before avatar or personal data erasure',async()=>{
 const h=cleanupHarness({removeError:{status:503}});const events=[];
 const cleanup=load('lib/account-deletion-cleanup.ts',{
   './profile-photo':{ownedAvatarPath:()=>{assert.fail('Avatar cleanup must not start after social storage fails');}},
   './community/photos':{removeCommunityAccountPhotos:async (db,owner)=>{assert.equal(db,h.db);assert.equal(owner,a);events.push('forum');}},
   './community/social':{removeSocialAccountPhotos:async (db,owner)=>{events.push('social');await social.removeSocialAccountPhotos(db,owner);}},
 });
 await assert.rejects(cleanup.cleanAccountData(h.db,{id:a,user_metadata:{}}),error=>{
   assert.ok(error instanceof cleanup.AccountCleanupError);assert.equal(error.status,500);assert.match(error.message,/Gönderi fotoğrafları/);return true;
 });
 assert.deepEqual(events,['forum','social']);assert.deepEqual(h.calls,['travel_social_posts']);
 assert.equal(h.objects.size,2);
});

function adminHarness({denied=false,failTable='',rpcError=null}={}) {
 const calls=[];
 const report='40000000-0000-4000-8000-000000000001',comment='30000000-0000-4000-8000-000000000001';
 const rows={
  travel_social_reports:[{id:report,user_id:b,post_id:id,comment_id:comment,reason:'harassment',details:'Reported details',resolved_at:null}],
  travel_social_posts:[{id,user_id:a,caption:'Private trip',visibility:'followers',status:'published',deleted_at:null,storage_path:'must-not-leak',photo_hash:'must-not-leak'}],
  travel_social_comments:[{id:comment,post_id:id,user_id:a,body:'Reported actual comment',status:'published'}],profiles:[{id:a,username:'author'},{id:b,username:'reporter'}],
 };
 const db={from(table){
  const query={then(resolve){return Promise.resolve(failTable===table?{data:null,error:{code:'08006'}}:{data:rows[table]||[],count:(rows[table]||[]).length,error:null}).then(resolve);}};
  for(const method of ['select','is','not','order','range','in','eq','update','maybeSingle'])query[method]=(...args)=>{calls.push({table,method,args});return query;};
  return query;
 },rpc:async(name,input)=>{calls.push({name,input});return{data:{success:true},error:rpcError};}};
 const imports={'@/lib/admin-auth':{requireAdmin:async(_request,roles)=>{assert.deepEqual(copy(roles),['moderator','admin','super_admin']);return denied?Response.json({error:'Denied'},{status:401}):null;}},'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db},'@/lib/community/safety':safety,'@/lib/community/social':social};
 return{calls,rows,report,comment,route:load('app/api/admin/social/route.ts',imports),photo:load('app/api/admin/social/[id]/photo/route.ts',imports)};
}

test('admin reports preview canonical text and protected post media; resolved filter and preview failures are explicit',async()=>{
 const h=adminHarness();const response=await h.route.GET(new Request('https://example.com?section=reports&status=resolved'));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 const item=(await response.json()).data.items[0];assert.equal(item.username,'reporter');assert.equal(item.target.username,'author');assert.equal(item.target.type,'comment');
 assert.equal(item.target.body,'Reported actual comment');assert.equal(item.target.caption,'Private trip');assert.equal(item.target.photoUrl,`/api/admin/social/${id}/photo`);assert.ok(!JSON.stringify(item).includes('must-not-leak'));
 assert.ok(h.calls.some(call=>call.table==='travel_social_reports'&&call.method==='not'&&call.args[0]==='resolved_at'));
 h.rows.travel_social_posts[0].deleted_at='2026-10-01';assert.equal((await(await h.route.GET(new Request('https://example.com?section=reports'))).json()).data.items[0].target,null);
 const failed=adminHarness({failTable:'travel_social_comments'});assert.equal((await failed.route.GET(new Request('https://example.com?section=reports'))).status,503);
 for(const query of ['section=reports&offset=0.5','section=posts&status=resolved'])assert.equal((await h.route.GET(new Request('https://example.com?'+query))).status,400);
});

test('admin report actions require current moderation auth; hide resolves canonical target atomically and cannot accept spoofed target IDs',async()=>{
 const h=adminHarness();const request=input=>new Request('https://example.com',{method:'PATCH',body:JSON.stringify(input)});
 assert.equal((await h.route.PATCH(request({section:'reports',id:h.report,action:'hide',postId:b,commentId:b,userId:b}))).status,200);
 assert.deepEqual(copy(h.calls),[{name:'moderate_travel_social_report',input:{p_report:h.report,p_hide:true}}]);
 assert.equal((await h.route.PATCH(request({section:'reports',id:h.report}))).status,200);assert.equal(h.calls[1].input.p_hide,false);
 assert.equal((await h.route.PATCH(request({section:'reports',id:h.report,action:'delete'}))).status,400);assert.equal(h.calls.length,2);
 const denied=adminHarness({denied:true});assert.equal((await denied.route.GET(new Request('https://example.com?section=reports'))).status,401);
 assert.equal((await denied.route.PATCH(request({section:'reports',id:h.report,action:'hide'}))).status,401);
 assert.equal((await denied.photo.GET(new Request('https://example.com'),{params:Promise.resolve({id})})).status,401);assert.equal(denied.calls.length,0);
 const failed=adminHarness({rpcError:{code:'P0002'}});assert.equal((await failed.route.PATCH(request({section:'reports',id:h.report,action:'hide'}))).status,404);
});


test('orphan upload retries resume only exact bytes and never overwrite another payload', async()=>{
 const input={action:'create',requestId:id,caption:'Trip',visibility:'public',photo:'valid-photo'};
 const recovered=harness({uploadError:{statusCode:'409'},storedPhoto:'safe-jpeg',result:{id}});
 assert.equal((await recovered.route.POST(body(input))).status,201);
 assert.equal(recovered.calls.length,3);assert.deepEqual(recovered.downloads,[`${a}/${id}.jpg`]);assert.deepEqual(recovered.removed,[]);
 const mismatch=harness({uploadError:{statusCode:'409'},storedPhoto:'other-jpeg'});
 assert.equal((await mismatch.route.POST(body(input))).status,409);assert.equal(mismatch.calls.length,2);assert.deepEqual(mismatch.removed,[]);
 const interrupted=harness();interrupted.db.rpc=async name=>{if(name==='prepare_travel_social_upload_cleanup')return{data:{requestIds:[]},error:null};if(name==='reserve_travel_social_upload')return{data:{admitted:true},error:null};throw Error('transport lost after upload');};
 assert.equal((await interrupted.route.POST(body(input))).status,503);assert.equal(interrupted.uploads.length,1);assert.deepEqual(interrupted.removed,[]);
});

test('upload admission rejects exhausted quota, missing profiles and uncertain admission before any storage write',async()=>{
 const input={action:'create',requestId:id,caption:'Trip',visibility:'public',photo:'valid-photo',userId:b};
 for(const [code,status] of [['54000',429],['22023',400],['23505',409]]) {
  const denied=harness({admissionError:{code}});
  for(let i=0;i<25;i++)assert.equal((await denied.route.POST(body({...input,requestId:`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`}))).status,status);
  assert.equal(denied.uploads.length,0);assert.equal(denied.downloads.length,0);
  assert.ok(denied.calls.every(call=>['prepare_travel_social_upload_cleanup','reserve_travel_social_upload'].includes(call.name)&&call.input.p_viewer===a));
 }
 const lost=harness();lost.db.rpc=async()=>{throw Error('admission response lost');};
 assert.equal((await lost.route.POST(body(input))).status,503);assert.equal(lost.uploads.length,0);
 const invalid=harness();invalid.db.rpc=async()=>({data:null,error:null});
 assert.equal((await invalid.route.POST(body(input))).status,503);assert.equal(invalid.uploads.length,0);
});

test('expired upload cleanup is bounded and owner-scoped; failures prevent admission until removal is confirmed',async()=>{
 const input={action:'create',requestId:id,caption:'Trip',visibility:'public',photo:'valid-photo'};
 const cleanupId='20000000-0000-4000-8000-000000000099';
 const failed=harness({cleanupIds:[cleanupId],removeError:{message:'storage unavailable'}});
 assert.equal((await failed.route.POST(body(input))).status,503);assert.equal(failed.uploads.length,0);
 assert.deepEqual(failed.calls.map(call=>call.name),['prepare_travel_social_upload_cleanup']);
 const ackLost=harness({cleanupIds:[cleanupId],finishError:{code:'08006'}});
 assert.equal((await ackLost.route.POST(body(input))).status,503);assert.equal(ackLost.uploads.length,0);
 assert.ok(!ackLost.calls.some(call=>call.name==='reserve_travel_social_upload'));
 const retried=harness({cleanupIds:[cleanupId]});assert.equal((await retried.route.POST(body(input))).status,201);
 assert.deepEqual(retried.removed,[`${a}/${cleanupId}.jpg`]);
 assert.deepEqual(retried.calls.map(call=>call.name),['prepare_travel_social_upload_cleanup','finish_travel_social_upload_cleanup','reserve_travel_social_upload','write_travel_social']);
 assert.deepEqual(copy(retried.calls[1].input),{p_viewer:a,p_request_ids:[cleanupId]});
 for(const ids of [['../foreign'],Array(11).fill(cleanupId)]){
  const invalid=harness({cleanupIds:ids});assert.equal((await invalid.route.POST(body(input))).status,503);assert.equal(invalid.removed.length,0);assert.equal(invalid.uploads.length,0);
 }
 const expired=harness({admissionError:{code:'P0010'}});const response=await expired.route.POST(body(input));
 assert.equal(response.status,409);assert.equal((await response.json()).code,'social_upload_expired');assert.equal(expired.uploads.length,0);
 const committed=harness({existing:{id},cleanupIds:[id]});assert.equal((await committed.route.POST(body(input))).status,200);
 assert.equal(committed.removed.length,0);assert.deepEqual(committed.calls.map(call=>call.name),['write_travel_social']);
 assert.equal(retried.route.maxDuration,60);
});

test('saved collection ignores following feed; comment actions validate and moderate the edited body',async()=>{
 const h=harness({result:{id}});
 await h.route.GET(new Request(`https://example.com?feed=following&collectionId=${id}`));
 assert.equal(h.calls[0].input.p_input.feed,undefined);
 assert.equal((await h.route.GET(new Request(`https://example.com?commentId=${id}`))).status,400);
 await h.route.GET(new Request(`https://example.com?postId=${id}&commentId=${b}`));
 assert.equal(h.calls[1].input.p_input.commentId,b);
 assert.equal((await h.route.POST(body({action:'comment-edit',postId:id,commentId:b,body:'You are an asshole',status:'published',userId:b}))).status,200);
 assert.equal(h.calls[2].input.p_input.status,'pending');assert.ok(!('userId' in h.calls[2].input.p_input));
 assert.equal((await h.route.POST(body({action:'comment-delete',postId:id,commentId:b}))).status,200);
 assert.equal((await h.route.POST(body({action:'comment-edit',postId:id,commentId:b,body:'   '}))).status,400);
});
