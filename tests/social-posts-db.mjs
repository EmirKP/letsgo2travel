import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const read = path => readFileSync(path, 'utf8');
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',c='10000000-0000-4000-8000-000000000003';
const post='20000000-0000-4000-8000-000000000001',post2='20000000-0000-4000-8000-000000000002';
const comment='30000000-0000-4000-8000-000000000001',reply='30000000-0000-4000-8000-000000000002';
const val=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const get=(db,user,input={})=>val(db,'select read_travel_social($1,$2)',[user,input]);
const put=(db,user,action,input)=>val(db,'select write_travel_social($1,$2,$3)',[user,action,input]);
const create=(db,user=a,id=post,extra={})=>put(db,user,'create',{requestId:id,caption:'A seaside walk',visibility:'public',photoHash:'a'.repeat(64),place:null,...extra});
const publish=(db,id=post)=>db.query("update travel_social_posts set status='published' where id=$1",[id]);
const follow=(db,user,target,active=true)=>val(db,'select set_community_profile_follow($1,$2,$3)',[user,`user:${target}`,active]);
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',deleted_at timestamptz);
 create table profiles(id uuid primary key references auth.users(id) on delete cascade,username text);
 insert into auth.users(id) values('${a}'),('${b}'),('${c}'); insert into profiles values('${a}','alice'),('${b}','bob'),('${c}','cara');
 create table forum_topics(id uuid primary key,slug text,title text,content text,author_id uuid,author_name text,country_slug text,category text,status text,is_paywalled boolean default false,created_at timestamptz default now(),seed_key text);
 create table forum_replies(id uuid primary key,topic_id uuid,user_id uuid,author_name text,content text,created_at timestamptz default now(),status text,seed_key text);
 create table community_user_blocks(user_id uuid references auth.users(id) on delete cascade,blocked_user_id uuid references auth.users(id) on delete cascade,blocked_name text,primary key(user_id,blocked_user_id));
 create function public.community_users_blocked(a uuid,b uuid) returns boolean language sql as $$select exists(select 1 from public.community_user_blocks where user_id=a and blocked_user_id=b or user_id=b and blocked_user_id=a)$$;
 create function public.has_forum_topic_unlock(t uuid,u uuid) returns boolean language sql as $$select false$$;
 create function public.is_forum_topic_paywalled(t uuid) returns boolean language sql as $$select false$$;
 create function public.is_public_forum_preview_reply(r uuid,t uuid) returns boolean language sql as $$select false$$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
 grant usage on schema auth,public,storage to anon,authenticated,service_role;
 grant all on all tables in schema public,auth,storage to service_role;
 grant all on storage.objects to anon,authenticated;
 create policy broad_existing_access on storage.objects for all to anon,authenticated using(true) with check(true);
 set request.jwt.claim.role='service_role';`);
 await db.exec(read('supabase/migrations/20261010190000_community_public_profiles.sql'));
 await db.exec(read('supabase/migrations/20261011120000_travel_social_posts.sql'));
 return db;
}

test('photos start pending, publish into real feeds; follower-only access revokes on unfollow and block, including media',async()=>{
 const db=await setup();try{
  const own=await create(db,a,post,{visibility:'followers'}); assert.equal(own.status,'pending');assert.equal(own.author.userId,a);
  assert.equal((await get(db,null)).items.length,0);assert.equal((await get(db,a)).items.length,1);
  await publish(db);assert.equal(await get(db,b,{postId:post}),null);assert.equal(await get(db,null,{postId:post,section:'photo'}),null);
  await follow(db,b,a);assert.equal((await get(db,b,{feed:'following'})).items[0].id,post);
  assert.equal((await get(db,b,{postId:post,section:'photo'})).storagePath,`${a}/${post}.jpg`);
  await follow(db,b,a,false);assert.equal(await get(db,b,{postId:post,section:'photo'}),null);
  await follow(db,b,a);await db.query('insert into community_user_blocks(user_id,blocked_user_id) values($1,$2)',[a,b]);
  assert.equal(await get(db,b,{postId:post}),null);assert.equal((await get(db,b,{feed:'following'})).items.length,0);
  await assert.rejects(put(db,b,'like',{postId:post,active:true}));await assert.rejects(put(db,b,'save',{postId:post,active:true,collectionId:post2}));
 }finally{await db.close();}
});

test('creation and comment retries are idempotent; identity theft, cross-post replies and hidden parents are rejected',async()=>{
 const db=await setup();try{
  await create(db);await create(db);assert.equal(await val(db,'select count(*) from travel_social_posts'),1);
  await assert.rejects(create(db,b));await assert.rejects(create(db,a,post,{caption:'different'}));
  await publish(db);const payload={postId:post,requestId:comment,body:'Great place',status:'published'};
  await put(db,b,'comment',payload);await put(db,b,'comment',payload);assert.equal(await val(db,'select count(*) from travel_social_comments'),1);
  await assert.rejects(put(db,c,'comment',payload));await assert.rejects(put(db,b,'comment',{...payload,body:'Changed'}));
  await create(db,a,post2);await publish(db,post2);
  await assert.rejects(put(db,c,'comment',{postId:post2,requestId:reply,parentId:comment,body:'Wrong parent',status:'published'}));
  await put(db,c,'comment',{postId:post,requestId:reply,parentId:comment,body:'Lovely',status:'published'});
  const detail=await get(db,a,{postId:post});assert.equal(detail.comments.items.length,2);assert.equal(detail.post.commentCount,2);
  await db.query("update travel_social_comments set status='hidden' where id=$1",[comment]);
  assert.equal((await get(db,a,{postId:post})).comments.items.length,0);
 }finally{await db.close();}
});

test('likes, private collections and undo persist across reads without resurrecting expired deletions',async()=>{
 const db=await setup();try{
  await create(db);await publish(db);
  await put(db,b,'like',{postId:post,active:true});await put(db,b,'like',{postId:post,active:true});
  let detail=await get(db,b,{postId:post});assert.equal(detail.post.likeCount,1);assert.equal(detail.post.liked,true);
  const collection=await put(db,b,'collection-create',{name:'Summer'});await put(db,b,'save',{postId:post,collectionId:collection.id,active:true});
  detail=await get(db,b,{postId:post});assert.deepEqual(detail.post.collectionIds,[collection.id]);assert.equal(detail.post.saved,true);
  assert.deepEqual((await get(db,c,{postId:post})).post.collectionIds,[]);assert.equal(await get(db,c,{collectionId:collection.id}),null);
  await assert.rejects(put(db,c,'save',{postId:post,collectionId:collection.id,active:true}));
  await assert.rejects(put(db,b,'delete',{postId:post}));
  const removed=await put(db,a,'delete',{postId:post});assert.ok(Date.parse(removed.undoUntil)>Date.now());
  assert.equal(await get(db,a,{postId:post}),null);assert.equal(await get(db,b,{postId:post,section:'photo'}),null);assert.equal((await get(db,b,{collectionId:collection.id})).items.length,0);
  await put(db,a,'restore',{postId:post});assert.equal((await get(db,b,{postId:post})).post.likeCount,1);
  await put(db,a,'delete',{postId:post});await db.query("update travel_social_posts set deleted_at=now()-interval '1 minute' where id=$1",[post]);
  await assert.rejects(put(db,a,'restore',{postId:post}));await assert.rejects(create(db));
  assert.equal((await get(db,a)).items.length,0);
 }finally{await db.close();}
});

test('notification preferences govern actual comment, reply and follow events; inbox remains owner scoped and blocks revoke',async()=>{
 const db=await setup();try{
  assert.deepEqual(await get(db,a,{section:'preferences'}),{comments:true,replies:true,follows:true,price_alert_email:true,price_alert_push:true});
  await put(db,a,'preferences',{comments:false,follows:false,price_alert_push:false});await follow(db,b,a);
  await create(db);await publish(db);await put(db,b,'comment',{postId:post,requestId:comment,body:'Hello',status:'published'});
  assert.equal((await get(db,a,{section:'notifications'})).items.length,0);
  await put(db,c,'comment',{postId:post,requestId:reply,parentId:comment,body:'Hi back',status:'published'});
  let inbox=await get(db,b,{section:'notifications'});assert.equal(inbox.items.length,1);assert.equal(inbox.items[0].kind,'reply');
  await put(db,c,'notifications-read',{id:inbox.items[0].id});assert.equal((await get(db,b,{section:'notifications'})).items[0].readAt,null);
  await put(db,b,'notifications-read',{id:inbox.items[0].id});assert.ok((await get(db,b,{section:'notifications'})).items[0].readAt);
  await db.query('insert into community_user_blocks(user_id,blocked_user_id) values($1,$2)',[b,c]);assert.equal((await get(db,b,{section:'notifications'})).items.length,0);
  assert.equal((await get(db,a,{section:'preferences'})).price_alert_push,false);
 }finally{await db.close();}
});

test('direct clients cannot spoof RPC viewer or bypass private tables/storage; account erasure cascades all social records',async()=>{
 const db=await setup();try{
  await create(db);await publish(db);await put(db,b,'report',{postId:post,reason:'spam',details:''});
  await put(db,b,'report',{postId:post,reason:'spam',details:''});assert.equal(await val(db,'select count(*) from travel_social_reports'),1);
  await db.exec("insert into storage.objects(bucket_id,name) values('travel-social-photos','private.jpg'),('other','visible.jpg')");
  for(const role of ['anon','authenticated']){
   await db.exec(`reset role; set role ${role}; set request.jwt.claim.role='${role}'`);
   await assert.rejects(get(db,a));await assert.rejects(put(db,a,'delete',{postId:post}));
   for(const table of ['travel_social_posts','travel_social_comments','travel_social_likes','travel_social_collections','travel_social_saves','travel_social_reports','community_notification_preferences','community_social_notifications'])await assert.rejects(db.query(`select * from ${table}`));
   assert.deepEqual((await db.query('select name from storage.objects')).rows,[{name:'visible.jpg'}]);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('travel-social-photos','stolen.jpg')"));
  }
  await db.exec("reset role; set request.jwt.claim.role='service_role'");
  await db.query('delete from auth.users where id=$1',[a]);assert.equal(await val(db,'select count(*) from travel_social_posts'),0);assert.equal(await val(db,'select count(*) from travel_social_reports'),0);
 }finally{await db.close();}
});

test('feed pagination keeps equal timestamps distinct; pending, hidden and private entries do not leak into counts',async()=>{
 const db=await setup();try{
  await db.query(`insert into travel_social_posts(id,user_id,caption,visibility,photo_hash,storage_path,status,created_at)
   select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1::uuid,'Trip '||i,'public',repeat('a',64),($1::uuid)::text||'/20000000-0000-4000-8000-'||lpad(i::text,12,'0')||'.jpg','published','2026-10-01' from generate_series(1,25) i`,[a]);
  const page1=await get(db,b),page2=await get(db,b,{offset:page1.nextOffset});assert.equal(page1.items.length,20);assert.equal(page2.items.length,5);assert.equal(new Set([...page1.items,...page2.items].map(p=>p.id)).size,25);
  assert.equal((await get(db,b,{authorRef:`starter:fictional`})).items.length,0);
  assert.equal((await get(db,b,{feed:'following'})).items.length,0);
 }finally{await db.close();}
});

test('social content can block its actual author without any forum topic; arbitrary targets and cross-post comments cannot be supplied',async()=>{
 const db=await setup();try{
  await create(db);await publish(db);await follow(db,b,a);
  await create(db,a,post2);await publish(db,post2);await put(db,c,'comment',{postId:post2,requestId:comment,body:'Other post',status:'published'});
  await assert.rejects(put(db,b,'block',{postId:post,commentId:comment}));
  await assert.rejects(put(db,a,'block',{postId:post}));
  const blocked=await put(db,b,'block',{postId:post,userId:c});assert.equal(blocked.userId,a);assert.equal(blocked.success,true);
  assert.equal((await get(db,b)).items.length,0);assert.equal(await val(db,'select count(*) from community_profile_follows where follower_id=$1',[b]),0);
  assert.equal(await val(db,'select count(*) from community_user_blocks where blocked_user_id=$1',[c]),0);
 }finally{await db.close();}
});

test('moderation hides only the canonical report target and resolves atomically; clients and failed writes cannot close a report',async()=>{
 const db=await setup();try{
  const moderate=(report,hide)=>val(db,'select moderate_travel_social_report($1,$2)',[report,hide]);
  await create(db);await publish(db);await put(db,b,'comment',{postId:post,requestId:comment,body:'Actual reported comment',status:'published'});
  await put(db,c,'report',{postId:post,commentId:comment,reason:'spam',details:''});
  let report=await val(db,'select id from travel_social_reports where comment_id=$1',[comment]);
  assert.equal((await moderate(report,true)).success,true);
  assert.equal(await val(db,'select status from travel_social_comments where id=$1',[comment]),'hidden');
  assert.equal(await val(db,'select status from travel_social_posts where id=$1',[post]),'published');
  assert.ok(await val(db,'select resolved_at from travel_social_reports where id=$1',[report]));
  await put(db,c,'report',{postId:post,reason:'inappropriate',details:''});report=await val(db,'select id from travel_social_reports where comment_id is null');
  await db.exec("create function fail_resolution() returns trigger language plpgsql as $$begin raise exception 'Database unavailable'; end$$; create trigger fail_resolution before update on travel_social_reports for each row execute function fail_resolution()");
  await assert.rejects(moderate(report,true));assert.equal(await val(db,'select status from travel_social_posts where id=$1',[post]),'published');
  assert.equal(await val(db,'select resolved_at from travel_social_reports where id=$1',[report]),null);
  await db.exec('drop trigger fail_resolution on travel_social_reports');
  for(const role of ['anon','authenticated']){
   await db.exec(`reset role; set role ${role}; set request.jwt.claim.role='${role}'`);await assert.rejects(moderate(report,true));
  }
  await db.exec("reset role; set request.jwt.claim.role='service_role'");
  await moderate(report,true);assert.equal(await val(db,'select status from travel_social_posts where id=$1',[post]),'hidden');
  const resolved=await val(db,'select resolved_at from travel_social_reports where id=$1',[report]);await moderate(report,false);assert.equal(await val(db,'select resolved_at::text from travel_social_reports where id=$1',[report]),(await db.query('select $1::timestamptz::text as value',[resolved])).rows[0].value);
 }finally{await db.close();}
});
