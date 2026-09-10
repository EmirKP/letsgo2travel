import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
 grant usage on schema auth, public to anon, authenticated, service_role;
 grant execute on all functions in schema auth to anon, authenticated, service_role;
 create table auth.users (id uuid primary key);
 create table public.forum_topics (id uuid primary key, author_id uuid references auth.users(id), status text, country_slug text, is_paywalled boolean default false);
 create table public.forum_replies (id uuid primary key, topic_id uuid references forum_topics(id), user_id uuid references auth.users(id), author_name text, content text, created_at timestamptz default now(), status text);
 create table public.forum_reports (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), target_type text, target_id text, reason text, status text, created_at timestamptz default now());
 alter table forum_topics enable row level security; alter table forum_replies enable row level security;
 create policy topics_read on forum_topics for select to anon, authenticated using (status = 'published');
 create policy replies_read on forum_replies for select to anon, authenticated using (status = 'published');
 create policy replies_insert on forum_replies for insert to authenticated with check (auth.uid() = user_id and status='pending');
 grant select on forum_topics, forum_replies to anon, authenticated;
 grant insert on forum_replies to authenticated;
 grant all on forum_topics, forum_replies, forum_reports to service_role;
 create function public.is_forum_topic_paywalled(p_id uuid) returns boolean language sql as $$ select is_paywalled from public.forum_topics where id = p_id $$;
 create function public.is_public_forum_preview_reply(p_reply uuid,p_topic uuid) returns boolean language sql as $$ select exists (select 1 from (select id from public.forum_replies where topic_id = p_topic and status = 'published' order by created_at,id limit 2) r where id = p_reply) $$;
 create function public.has_forum_topic_unlock(uuid,uuid) returns boolean language sql as $$ select true $$;
`);
await db.exec(readFileSync('supabase/migrations/20260910160000_community_safety.sql','utf8'));
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002', c='10000000-0000-4000-8000-000000000003';
const topic='20000000-0000-4000-8000-000000000001', reply='30000000-0000-4000-8000-000000000001';
await db.query('insert into auth.users values ($1),($2),($3)',[a,b,c]);
await db.query("insert into forum_topics (id,author_id,status) values ($1,$2,'published')",[topic,b]);
await db.query("insert into forum_replies (id,topic_id,user_id,author_name,content,status) values ($1,$2,$3,'C','Hello','published')",[reply,topic,c]);
async function actor(id,role='service_role') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false)",[id,role]); await db.exec(`set role ${role}`); }
const scalar=async(sql,params=[]) => Object.values((await db.query(sql,params)).rows[0])[0];
let passed=0;
async function check(name,fn){ await fn(); passed++; console.log('PASS',name); }
await actor(a);
await check('canonical report resolves live reply and deduplicates repeated submission',async()=>{
 const first=await scalar("select submit_forum_report($1,'reply',$2,'spam','')",[a,reply]);
 const second=await scalar("select submit_forum_report($1,'reply',$2,'spam','')",[a,reply]);
 assert.equal(first,second); assert.equal(await scalar('select count(*) from forum_reports'),1);
});
await check('self, missing target, invalid reason and unqualified other reason rejected',async()=>{
 for(const [owner,targetType,targetId,reason,note] of [[b,'topic',topic,'spam',''],[a,'topic',reply,'spam',''],[a,'topic',topic,'bogus',''],[a,'topic',topic,'other','']]){
  await assert.rejects(db.query('select submit_forum_report($1,$2,$3,$4,$5)',[owner,targetType,targetId,reason,note]));
 }
});
await check('blocked topic and reply are hidden symmetrically and reply writes denied',async()=>{
 await db.query('insert into community_user_blocks (user_id,blocked_user_id) values ($1,$2)',[a,b]);
 assert.equal(await scalar('select community_users_blocked($1,$2)',[a,b]),true);
 assert.equal(await scalar('select community_users_blocked($1,$2)',[b,a]),true);
 await actor(a,'authenticated');
 assert.deepEqual((await db.query('select * from forum_topics')).rows,[]);
 assert.deepEqual((await db.query('select * from forum_replies')).rows,[]);
 await assert.rejects(db.query("insert into forum_replies (id,topic_id,user_id,status) values (gen_random_uuid(),$1,$2,'pending')",[topic,a]));
 assert.deepEqual((await db.query('select * from get_unlocked_forum_replies($1)',[topic])).rows,[]);
});
await check('block ownership cannot be read, removed, forged or inspected for unrelated users',async()=>{
 await actor(c,'authenticated');
 assert.deepEqual((await db.query('select * from community_user_blocks')).rows,[]);
 await db.query('delete from community_user_blocks where user_id=$1',[a]);
 await assert.rejects(db.query('insert into community_user_blocks (user_id,blocked_user_id) values ($1,$2)',[a,c]));
 await assert.rejects(db.query('select community_users_blocked($1,$2)',[a,b]));
 await assert.rejects(db.query('select community_hidden_user_ids($1)',[a]));
 await actor(a); assert.equal(await scalar('select count(*) from community_user_blocks'),1);
});
await check('helpful vote checks blocked parent even when reply author is unblocked',async()=>{
 await assert.rejects(db.query('select add_forum_helpful_vote($1,$2)',[a,reply]));
 await db.query('delete from community_user_blocks where user_id=$1',[a]);
 assert.equal(await scalar('select add_forum_helpful_vote($1,$2)',[a,reply]),true);
 assert.equal(await scalar('select add_forum_helpful_vote($1,$2)',[a,reply]),false);
 await assert.rejects(db.query('select add_forum_helpful_vote($1,$2)',[c,reply]));
});
await check('blocked reply author is omitted from counts and unlocked replies without skipping visible replies',async()=>{
 await actor(a);
 const second='30000000-0000-4000-8000-000000000002', third='30000000-0000-4000-8000-000000000003';
 await db.query("insert into forum_replies (id,topic_id,user_id,author_name,content,status) values ($1,$3,$4,'B','Second','published'),($2,$3,$4,'B','Third','published')",[second,third,topic,b]);
 await db.query('update forum_topics set is_paywalled=true where id=$1',[topic]);
 await db.query('insert into community_user_blocks (user_id,blocked_user_id) values ($1,$2)',[a,c]);
 const counts=(await db.query('select * from get_forum_visible_reply_counts($1::uuid[],$2)',[[topic],a])).rows;
 assert.equal(Number(counts[0].reply_count),2);
 await actor(a,'authenticated');
 assert.deepEqual((await db.query('select id from forum_replies order by id')).rows.map(row=>row.id),[second,third]);
 assert.deepEqual((await db.query('select id from get_unlocked_forum_replies($1)',[topic])).rows.map(row=>row.id),[third]);
 await actor(a);
 await db.query('delete from community_user_blocks where user_id=$1',[a]);
});
await check('moderation hides actual canonical content and resolves report atomically',async()=>{
 const id=await scalar('select id from forum_reports limit 1');
 assert.equal(await scalar('select hide_reported_forum_content($1::uuid[])',[[id]]),1);
 assert.equal(await scalar('select status from forum_replies where id=$1',[reply]),'hidden');
 assert.equal(await scalar('select status from forum_reports where id=$1',[id]),'resolved');
 await assert.rejects(db.query("select submit_forum_report($1,'reply',$2,'spam','')",[a,reply]));
});
await check('missing moderation target leaves report open instead of false success',async()=>{
 const id=await scalar("insert into forum_reports (user_id,target_type,target_id,reason,status) values ($1,'topic',$2,'spam','open') returning id",[a,reply]);
 await assert.rejects(db.query('select hide_reported_forum_content($1::uuid[])',[[id]]));
 assert.equal(await scalar('select status from forum_reports where id=$1',[id]),'open');
});
await check('authenticated clients cannot call admin moderation/report/vote service functions',async()=>{
 await actor(a,'authenticated');
 await assert.rejects(db.query("select submit_forum_report($1,'topic',$2,'spam','')",[a,topic]));
 await assert.rejects(db.query('select hide_reported_forum_content($1::uuid[])',[[reply]]));
 await assert.rejects(db.query('select add_forum_helpful_vote($1,$2)',[a,reply]));
});
await db.close(); console.log(`${passed} community database checks passed`);
