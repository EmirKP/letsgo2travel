import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const read = path => readFileSync(path,'utf8');
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002', c='10000000-0000-4000-8000-000000000003';
const topic='20000000-0000-4000-8000-000000000001';
const migration=read('supabase/migrations/20261010190000_community_public_profiles.sql');
async function setup() {
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',deleted_at timestamptz);
 create table profiles(id uuid primary key references auth.users(id) on delete cascade,username text,email text,visited_countries text[]);
 insert into auth.users(id) values('${a}'),('${b}'),('${c}');
 insert into profiles values('${a}','alice','private@example.com',array['FR']),('${b}','bob','secret@example.com',array['DE']),('${c}','cara','other@example.com',array['TR']);
 create table forum_topics(id uuid primary key,slug text unique,title text,content text,author_id uuid references auth.users(id) on delete set null,author_name text,country_slug text,category text,status text,is_paywalled boolean default false,created_at timestamptz default now(),seed_key text);
 create unique index forum_topics_seed_key_unique on forum_topics(seed_key) where seed_key is not null;
 create table forum_replies(id uuid primary key,topic_id uuid references forum_topics(id),user_id uuid references auth.users(id) on delete set null,author_name text,content text,created_at timestamptz default now(),status text,seed_key text);
 create unique index forum_replies_seed_key_unique on forum_replies(seed_key) where seed_key is not null;
 create table community_user_blocks(user_id uuid references auth.users(id) on delete cascade,blocked_user_id uuid references auth.users(id) on delete cascade,primary key(user_id,blocked_user_id));
 create function public.community_users_blocked(a uuid,b uuid) returns boolean language sql as $$select exists(select 1 from public.community_user_blocks where user_id=a and blocked_user_id=b or user_id=b and blocked_user_id=a)$$;
 create table unlocks(viewer uuid,topic uuid);
 create function public.has_forum_topic_unlock(t uuid,u uuid) returns boolean language sql as $$select exists(select 1 from public.unlocks where viewer=u and topic=t)$$;
 create function public.is_forum_topic_paywalled(t uuid) returns boolean language sql as $$select is_paywalled from public.forum_topics where id=t$$;
 create function public.is_public_forum_preview_reply(r uuid,t uuid) returns boolean language sql as $$select exists(select 1 from (select id from public.forum_replies where topic_id=t and status='published' order by created_at,id limit 2) s where s.id=r)$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 grant all on all tables in schema public,auth to service_role;
 set request.jwt.claim.role='service_role';`);
 await db.exec(read('supabase/seeds/community-starters-20260930.sql'));
 await db.exec(read('supabase/seeds/community-starter-replies-20261010.sql'));
 await db.exec(read('supabase/seeds/community-starter-names-20261010.sql'));
 await db.exec(migration);
 await db.exec(`insert into forum_topics(id,author_id,author_name,title,content,status,country_slug) values('${topic}','${b}','bob','Real topic','Public body','published','almanya');
 insert into forum_replies(id,topic_id,user_id,author_name,content,status,created_at) values
 ('30000000-0000-4000-8000-000000000001','${topic}','${c}','cara','Reply 1','published','2026-09-01'),
 ('30000000-0000-4000-8000-000000000002','${topic}','${c}','cara','Reply 2','published','2026-09-02'),
 ('30000000-0000-4000-8000-000000000003','${topic}','${c}','cara','Reply 3','published','2026-09-03');`);
 return db;
}
const value=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const profile=(db,key,viewer=null,section='posts',offset=0)=>value(db,'select get_community_profile($1,$2,$3,$4)',[key,viewer,section,offset]);
const follow=(db,viewer,key,active=true)=>value(db,'select set_community_profile_follow($1,$2,$3)',[viewer,key,active]);

test('all 45 trusted starter personas have real content; deleted or forged identities are absent',async()=>{
 const db=await setup();try {
  const names=(await db.query('select distinct author_name from forum_topics where seed_key is not null union select distinct author_name from forum_replies where seed_key is not null')).rows.map(r=>r.author_name);
  assert.equal(names.length,45);
  for(const name of names) { const data=await profile(db,`starter:${name}`);assert.equal(data.profile.username,name);assert.ok(data.profile.postCount+data.profile.answerCount>0);assert.equal(data.profile.followerCount,0);assert.equal(data.profile.followingCount,0); }
  assert.equal(await profile(db,'starter:missing'),null);
  await db.exec("update forum_topics set seed_key=null where seed_key='starter-20260930-01'; insert into forum_topics(id,title,author_name,status,seed_key,is_paywalled,category) values(gen_random_uuid(),'Forged','pretend.name','published','starter-20260930-01',false,'Ülke Bazlı Sorunlar')");
  assert.equal(await profile(db,'starter:pretend.name'),null);
  await db.query('update forum_topics set author_id=null where id=$1',[topic]);
  assert.equal(await profile(db,'starter:bob'),null);
  assert.equal(await value(db,'select count(*) from auth.users'),3);
 } finally {await db.close();}
});

test('durable follows are idempotent, lists and following feed match, self/invalid targets rejected',async()=>{
 const db=await setup();try {
  assert.equal(await follow(db,a,`user:${b}`),true);assert.equal(await follow(db,a,`user:${b}`),true);
  await follow(db,a,'starter:duru.kurt');
  const bob=await profile(db,`user:${b}`,a,'followers');assert.equal(bob.profile.followerCount,1);assert.equal(bob.profile.isFollowing,true);assert.equal(bob.items[0].key,`user:${a}`);
  const own=await profile(db,`user:${a}`,a,'following');assert.equal(own.profile.followingCount,2);assert.equal(own.items.length,2);assert.equal(own.profile.isOwn,true);
  const feed=(await db.query('select * from get_community_following_feed($1)',[a])).rows;assert.equal(feed.length,2);assert.ok(feed.every(r=>r.author_id===b || r.author_name==='duru.kurt'));
  assert.equal((await db.query("select * from get_community_following_feed($1,0,array['almanya'],false,'Real','{}')",[a])).rows.length,1);
  await assert.rejects(follow(db,a,`user:${a}`));await assert.rejects(follow(db,a,'starter:missing'));
  await follow(db,a,`user:${b}`,false);await follow(db,a,`user:${b}`,false);assert.equal((await profile(db,`user:${b}`,a)).profile.followerCount,0);
 } finally {await db.close();}
});

test('symmetric blocking removes follows and hides identities, parent content and list members',async()=>{
 const db=await setup();try {
  await follow(db,a,`user:${b}`);await follow(db,b,`user:${a}`);await follow(db,c,`user:${b}`);
  await db.query('insert into community_user_blocks values($1,$2)',[a,b]);
  assert.equal(await profile(db,`user:${b}`,a),null);assert.equal(await profile(db,`user:${a}`,b),null);
  assert.equal((await db.query('select * from community_profile_follows where follower_id=$1 or target_user_id=$1',[a])).rows.length,0);
  assert.equal((await profile(db,`user:${c}`,a,'answers')).items.length,0,'Blocked parent hidden even if answer author is visible');
  await assert.rejects(follow(db,a,`user:${b}`));
  await db.query('delete from community_user_blocks');assert.equal((await profile(db,`user:${a}`,a)).profile.followingCount,0,'Unblocking does not resurrect relationships');
  await db.query('insert into community_user_blocks values($1,$2)',[a,c]);
  assert.equal((await profile(db,`user:${b}`,a,'followers')).items.length,0,'Blocked followers hidden');
 }finally {await db.close();}
});

test('profile answers honor paywall previews/unlocks and moderation; counts match visible bodies',async()=>{
 const db=await setup();try {
  await db.query('update forum_topics set is_paywalled=true where id=$1',[topic]);
  let data=await profile(db,`user:${c}`,a,'answers');assert.equal(data.items.length,2);assert.equal(data.profile.answerCount,2);assert.ok(!JSON.stringify(data).includes('Reply 3'));
  await db.query('insert into unlocks values($1,$2)',[a,topic]);data=await profile(db,`user:${c}`,a,'answers');assert.equal(data.items.length,3);
  await db.query("update forum_replies set status='hidden' where content='Reply 3'");assert.equal((await profile(db,`user:${c}`,a,'answers')).items.length,2);
  await db.query("update forum_topics set status='hidden' where id=$1",[topic]);assert.equal((await profile(db,`user:${c}`,a,'answers')).items.length,0);
 }finally {await db.close();}
});

test('avatars default private, bio updates preserve consent; profile keys never expose account private fields',async()=>{
 const db=await setup();try {
  const path=`${a}/90000000-0000-4000-8000-000000000001.jpg`;
  await db.query("update auth.users set raw_user_meta_data=jsonb_build_object('l2t_avatar_path',$1::text,'email','secret') where id=$2",[path,a]);
  let data=await profile(db,`user:${a}`,b);assert.equal(data.profile.avatarPath,null);assert.ok(!JSON.stringify(data).includes('private@example.com'));assert.ok(!JSON.stringify(data).includes('visited_countries'));
  assert.equal((await profile(db,`user:${a}`,a)).profile.avatarPath,path);
  await db.query('select update_community_profile($1,$2,true)',[a,'Hello']);
  await db.query('select update_community_profile($1,$2,null)',[a,'Edited']);
  data=await profile(db,`user:${a}`,b);assert.equal(data.profile.avatarPath,path);assert.equal(data.profile.bio,'Edited');
  await db.query('select update_community_profile($1,null,false)',[a]);data=await profile(db,`user:${a}`,b);assert.equal(data.profile.avatarPath,null);assert.equal(data.profile.bio,'Edited');
  await assert.rejects(db.query('select update_community_profile($1,$2,null)',[a,'x'.repeat(301)]));
 }finally{await db.close();}
});

test('service-only boundaries, account cascade cleanup, stable pagination and migration rerun',async()=>{
 const db=await setup();try {
  for(let i=4;i<=25;i++) {const id=`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into profiles(id,username) values($1,$2)',[id,`user${i}`]);await follow(db,id,`user:${b}`);}
  const first=await profile(db,`user:${b}`,a,'followers');const second=await profile(db,`user:${b}`,a,'followers',first.nextOffset);assert.equal(first.items.length,20);assert.equal(second.items.length,2);assert.equal(new Set([...first.items,...second.items].map(r=>r.key)).size,22);assert.equal(second.nextOffset,null);
  await follow(db,a,`user:${b}`);await db.query('select update_community_profile($1,$2,true)',[a,'Bio']);await db.query('delete from auth.users where id=$1',[a]);assert.equal(await profile(db,`user:${a}`),null);assert.equal(await value(db,'select count(*) from community_profile_bios where user_id=$1',[a]),0);assert.equal(await value(db,'select count(*) from community_profile_follows where follower_id=$1 or target_user_id=$1',[a]),0);
  await db.exec(migration);
  await db.exec("set role authenticated; set request.jwt.claim.role='authenticated'");
  await assert.rejects(db.query('select get_community_profile($1,null,\'posts\',0)',[`user:${b}`]));await assert.rejects(db.query('select set_community_profile_follow($1,$2,true)',[c,`user:${b}`]));await assert.rejects(db.query('select * from community_profile_follows'));await assert.rejects(db.query('select * from community_profile_bios'));
 }finally{await db.close();}
});
