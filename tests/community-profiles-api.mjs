import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}) {
 const loaded={exports:{}};
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Request,Response,URL,Buffer,Uint8Array,Map,Set,Date})(name=>{if(name in imports)return imports[name];throw Error(`Missing import ${name}`);},loaded,loaded.exports);
 return loaded.exports;
}
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const safety=load('lib/community/safety.ts');
const avatars=load('lib/profile-photo.ts');
const profiles=load('lib/community/profiles.ts',{'@/lib/profile-photo':avatars,'./safety':safety,'./forum-sync':{countryCodeFromForumSlug:slug=>slug==='fransa'?'FR':'ZZ'}});
const serializers=load('lib/community/serializers.ts');
const moderation=load('lib/community/moderation.ts');
const copy=value=>JSON.parse(JSON.stringify(value));

test('profile keys resolve only exact seeded records or actual author UUIDs',()=>{
 assert.equal(profiles.validCommunityProfileKey(`user:${a}`),true);assert.equal(profiles.validCommunityProfileKey('starter:dila.aydin'),true);
 for(const key of ['starter:x','starter:../secret',`user:${a},status.eq.hidden`,'user:email@example.com','starter:long'.repeat(30)])assert.equal(profiles.validCommunityProfileKey(key),false);
 const row={id:'f09a2026-0930-4000-8000-000000000001',authorId:null,seed_key:'starter-20260930-01',status:'published',category:'Ülke Bazlı Sorunlar',is_paywalled:false};
 assert.equal(serializers.communityProfileKey(row,'deniz.aydin','question'),'starter:deniz.aydin');
 for(const patch of [{id:a},{seed_key:null},{status:'hidden'},{is_paywalled:true},{category:'Other'}])assert.equal(serializers.communityProfileKey({...row,...patch},'deniz.aydin','question'),null);
 assert.equal(serializers.communityProfileKey({...row,authorId:a},'alice','question'),`user:${a}`);
 assert.equal(serializers.communityProfileKey({id:'f09a2026-1010-4000-8000-000000000101',authorId:null,seed_key:'starter-reply-20261010-01-01',topic_id:row.id,parentProfileKey:'starter:deniz.aydin'},'nil_aktas','answer'),'starter:nil_aktas');
 assert.equal(serializers.communityProfileKey({id:a,authorId:null},'deleted.account','answer'),null);
});

test('public profile response strips internal paths and all unrequested private metadata; avatar must be owner scoped',async()=>{
 let paths=[];const validPath=`${a}/${b}.jpg`;
 const db={storage:{from:bucket=>({createSignedUrls:async input=>{assert.equal(bucket,'profile-avatars');paths=input;return{data:input.map(path=>({path,signedUrl:`https://project.supabase.co/storage/v1/object/sign/profile-avatars/${path}?token=example`}))};}})}};
 const result=await profiles.publicCommunityProfile(db,{profile:{key:`user:${a}`,userId:a,username:'alice',avatarPath:validPath,bio:'Hi',isOwn:true,showAvatar:true,followerCount:2,email:'private',visited_countries:['FR'],raw_user_meta_data:{secret:true}},items:[{key:`user:${b}`,userId:b,username:'bob',avatarPath:validPath,email:'private'}],nextOffset:20},'followers');
 assert.deepEqual(copy(paths),[validPath]);assert.ok(result.profile.avatarUrl.includes('token='));assert.equal(result.items[0].avatarUrl,null);
 const json=JSON.stringify(result);for(const forbidden of ['avatarPath','avatar_path','email','visited_countries','raw_user_meta_data'])assert.ok(!json.includes(forbidden));
 assert.equal(result.nextOffset,20);assert.equal(result.profile.showAvatar,true);
 const posts=await profiles.publicCommunityProfile(db,{profile:{key:'starter:duru.kurt'},items:[{id:a,title:'Paris',body:'Rain',countrySlug:'fransa',createdAt:'2026-10-01',privateField:true}]},'posts');assert.equal(posts.items[0].countryCode,'FR');assert.ok(!('countrySlug' in posts.items[0]));
});

test('avatar errors leave usable profiles; malformed and oversized PATCH bodies are rejected',async()=>{
 const db={storage:{from:()=>({createSignedUrls:async()=>({data:null,error:{message:'offline'}})})}};
 const result=await profiles.publicCommunityProfile(db,{profile:{key:`user:${a}`,userId:a,avatarPath:`${a}/${b}.jpg`},items:[]},'posts');assert.equal(result.profile.avatarUrl,null);
 const patch=body=>profiles.readCommunityProfilePatch(new Request('https://example.com',{method:'PATCH',body:JSON.stringify(body)}));
 assert.deepEqual(copy(await patch({bio:' Hello ',showAvatar:false})),{bio:'Hello',show_avatar:false});
 assert.equal(await patch({bio:'x'.repeat(301)}),null);assert.equal(await patch({showAvatar:'true'}),null);assert.equal(await patch({userId:b,bio:'Hijack'}),null);assert.equal(await patch({bio:'\u0000'}),null);
 assert.equal(await patch({bio:'x'.repeat(3000)}),null);assert.deepEqual(copy(await patch({showAvatar:true})),{show_avatar:true});
});

function routeHarness(path,{userId=a,data=null,rpcError=null}={}){
 const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return{data,error:rpcError};},storage:{from:()=>({createSignedUrls:async()=>({data:[]})})}};
 const route=load(path,{'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},'@/lib/community/viewer':{communityViewer:async()=>({ok:true,userId,hiddenUserIds:[]})},'@/lib/community/safety':safety,'@/lib/community/profiles':profiles,'@/lib/community/moderation':moderation,'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>db},'@/lib/authenticated-user':{requireAuthenticatedUser:async()=>userId?{ok:true,user:{id:userId},supabase:db}:{ok:false,response:Response.json({error:'Sign in'},{status:401})}}});
 return{route,calls};
}
test('GET validates keys and section before exposing data; viewer identity and offsets come from trusted request',async()=>{
 const {route,calls}=routeHarness('app/api/country-community/profiles/[key]/route.ts',{data:{profile:{key:`user:${b}`,userId:b,username:'bob'},items:[],nextOffset:null}});
 const get=(key,query='')=>route.GET(new Request(`https://example.com/api/profile?${query}`),{params:Promise.resolve({key})});
 assert.equal((await get('bad')).status,400);assert.equal((await get(`user:${b}`,'section=private')).status,400);assert.equal(calls.length,0);
 const response=await get(`user:${b}`,'section=answers&offset=20&viewer=hijack');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(copy(calls[0]),{name:'get_community_profile',args:{p_key:`user:${b}`,p_viewer:a,p_section:'answers',p_offset:20}});
 const missing=routeHarness('app/api/country-community/profiles/[key]/route.ts');assert.equal((await missing.route.GET(new Request('https://example.com'),{params:Promise.resolve({key:`user:${b}`})})).status,404);
});

test('PATCH binds own identity and partial fields, follow uses verified actor and idempotent RPC',async()=>{
 const {route,calls}=routeHarness('app/api/country-community/profiles/[key]/route.ts',{data:true});
 const patch=(key,body)=>route.PATCH(new Request('https://example.com',{method:'PATCH',body:JSON.stringify(body)}),{params:Promise.resolve({key})});
 assert.equal((await patch(`user:${b}`,{bio:'No'})).status,403);assert.equal(calls.length,0);
 assert.equal((await patch(`user:${a}`,{showAvatar:true})).status,200);assert.deepEqual(copy(calls[0].args),{p_viewer:a,p_bio:null,p_show_avatar:true});
 const follow=routeHarness('app/api/country-community/profiles/[key]/follow/route.ts',{data:true});
 const context={params:Promise.resolve({key:'starter:duru.kurt'})};assert.equal((await follow.route.POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({userId:b})}),context)).status,200);assert.equal(follow.calls[0].args.p_viewer,a);
 assert.equal((await follow.route.POST(new Request('https://example.com'),{params:Promise.resolve({key:`user:${a}`})})).status,400);
 const guest=routeHarness('app/api/country-community/profiles/[key]/follow/route.ts',{userId:null});assert.equal((await guest.route.POST(new Request('https://example.com'),context)).status,401);assert.equal(guest.calls.length,0);
});

test('public bio rejects illegal/profane text without mutation and accepts ordinary travel descriptions',async()=>{
 const {route,calls}=routeHarness('app/api/country-community/profiles/[key]/route.ts',{data:true});
 const patch=bio=>route.PATCH(new Request('https://example.com',{method:'PATCH',body:JSON.stringify({bio})}),{params:Promise.resolve({key:`user:${a}`})});
 for(const bio of ['Sahte belge hazırlıyorum','You are an asshole','AMK!'])assert.equal((await patch(bio)).status,400);
 assert.equal(calls.length,0);
 assert.equal((await patch('Vize süreçleri ve aquarium gezileri hakkında deneyim paylaşırım.')).status,200);
 assert.equal(calls.length,1);
});
