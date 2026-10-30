import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002', c='10000000-0000-4000-8000-000000000003';
const key='ticketmaster:real-event', other='ticketmaster:another-event';
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
create table auth.users(id uuid primary key,deleted_at timestamptz);
insert into auth.users(id) values('${a}'),('${b}'),('${c}');
create table profiles(id uuid primary key,username text);
insert into profiles values('${a}','alice'),('${b}','bob'),('${c}','cara');
create table community_user_blocks(user_id uuid references auth.users(id) on delete cascade,blocked_user_id uuid references auth.users(id) on delete cascade,blocked_name text,primary key(user_id,blocked_user_id));
create function community_users_blocked(a uuid,b uuid) returns boolean language sql stable as $$select exists(select 1 from public.community_user_blocks where user_id=a and blocked_user_id=b or user_id=b and blocked_user_id=a)$$;
create function community_profile_identity(k text,v uuid) returns table(profile_key text,user_id uuid,username text,avatar_path text) language sql stable as $$select 'user:'||p.id::text,p.id,p.username,null::text from public.profiles p join auth.users u on u.id=p.id where 'user:'||p.id::text=k and nullif(trim(p.username),'') is not null and u.deleted_at is null and not public.community_users_blocked(v,p.id)$$;
grant usage on schema auth,public to anon,authenticated,service_role;
set request.jwt.claim.role='service_role';`);
const migration=readFileSync('supabase/migrations/20261024213000_event_community.sql','utf8');
await db.exec(migration);
await db.exec(readFileSync('supabase/migrations/20261024214500_event_meetup_owner_recovery.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261030130000_event_attendee_directory.sql','utf8'));
const value=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const act=(user,action,input={},event=key)=>value('select event_community_action($1,$2,$3,$4)',[user,event,action,JSON.stringify(input)]);
const read=(user,event=key)=>value('select event_community_read($1,$2)',[user,event]);
const snapshot={id:key,title:'Real provider event',startsAt:new Date(Date.now()+86400000).toISOString(),timeZone:'Europe/Istanbul',timePrecision:'exact',city:'Istanbul',venue:'Public Hall',countryCode:'TR',status:'scheduled',sourceUrl:'https://official.example/event'};
await db.query('select event_community_sync($1,$2)',[key,JSON.stringify(snapshot)]);
await db.query('select event_community_sync($1,$2)',[other,JSON.stringify({...snapshot,id:other})]);
let passed=0;
async function check(name,fn){await fn(); passed++; console.log('PASS',name);}
await check('there is no automatic RSVP or chat access; joining and leaving are durable and idempotent',async()=>{
 assert.deepEqual(await value('select event_community_list($1)',[a]),[]);
 assert.equal((await read(a)).joined,false); assert.equal((await read(a)).memberCount,0);
 await assert.rejects(act(a,'message',{requestId:c,body:'No access'}),/Join required/);
 await act(a,'join'); await act(a,'join'); await act(b,'join');
 assert.equal((await read(a)).memberCount,2); assert.equal((await value('select event_community_list($1)',[a])).length,1);
 await act(a,'mute',{muted:true}); assert.equal((await read(a)).muted,true);
 await act(a,'leave'); await act(a,'leave'); assert.equal((await read(a)).joined,false);
 await act(a,'join'); assert.equal((await read(a)).muted,false);
});
let messageId;
await check('message retries are idempotent, conflict is rejected, nonmembers cannot read bodies and rate/length bounds hold',async()=>{
 messageId=(await act(b,'message',{requestId:a,body:'See you at the entrance'})).id;
 assert.equal((await act(b,'message',{requestId:a,body:'See you at the entrance'})).id,messageId);
 await assert.rejects(act(b,'message',{requestId:a,body:'Edited retry'}),/Request conflict/);
 await assert.rejects(act(b,'message',{requestId:b,body:'Too fast'}),/Rate limit/);
 await assert.rejects(act(a,'message',{requestId:b,body:'x'.repeat(1001)}),/Invalid message/);
 assert.equal((await read(c)).messages.length,0); assert.equal((await read(a)).messages.length,1);
 assert.equal((await read(a,other)).messages.length,0);
});
let meetupId;
await check('meetup pin is owner protected, explicit attendance is unique, outsiders cannot join and changed-place consent resets',async()=>{
 const startsAt=new Date(Date.now()+3600000).toISOString();
 meetupId=(await act(a,'meetup',{startsAt,publicPlace:'Public hall main entrance'})).id;
 await act(b,'meetup-join',{meetupId}); await act(b,'meetup-join',{meetupId});
 assert.equal((await read(b)).meetup.attendeeCount,2);
 await assert.rejects(act(c,'meetup-join',{meetupId}),/Join required/);
 await assert.rejects(act(b,'meetup',{startsAt,publicPlace:'Different public entrance'}),/Meetup owner required/);
 await assert.rejects(act(a,'meetup',{startsAt:new Date(Date.now()+9*86400000).toISOString(),publicPlace:'Main door'}),/Invalid meetup/);
 await db.query("update event_community_meetups set updated_at=now()-interval '1 minute'");
 await act(a,'meetup',{startsAt,publicPlace:'Public hall east entrance'});
 assert.equal((await read(b)).meetup.joined,false); assert.equal((await read(a)).meetup.attendeeCount,1);
});
await check('reports deduplicate, reject self/fake/cross-event targets, and blocking reuses forum safety in both directions',async()=>{
 const first=await act(a,'report',{targetType:'message',targetId:messageId,reason:'spam'});
 assert.equal((await act(a,'report',{targetType:'message',targetId:messageId,reason:'spam'})).id,first.id);
 await assert.rejects(act(b,'report',{targetType:'message',targetId:messageId,reason:'spam'}),/Invalid target/);
 await assert.rejects(act(a,'report',{targetType:'message',targetId:messageId,reason:'bogus'}),/Invalid reason/);
 await assert.rejects(act(a,'report',{targetType:'message',targetId:messageId,reason:'spam'},other),/Join required/);
 await act(a,'block',{targetType:'message',targetId:messageId});
 assert.equal((await read(a)).messages.length,0); assert.equal((await read(a)).memberCount,1); assert.equal((await read(b)).memberCount,1);
 assert.equal((await read(b)).meetup,null);
 await assert.rejects(act(b,'meetup-join',{meetupId}),/Meetup unavailable/);
 assert.equal(await value('select count(*) from community_user_blocks'),1);
 await db.query('delete from community_user_blocks');
 assert.equal((await read(a)).messages.length,1);
 assert.equal(await value("select event_community_moderate($1,'resolved',true)",[first.id]),true);
 assert.equal((await read(a)).messages.length,0);
});
await check('event banners require a changed verified snapshot, equal source checks do not invent changes',async()=>{
 assert.equal((await read(a)).change,null);
 await db.query('select event_community_sync($1,$2)',[key,JSON.stringify(snapshot)]); assert.equal((await read(a)).version,1);
 await db.query('select event_community_sync($1,$2)',[key,JSON.stringify({...snapshot,status:'cancelled'})]);
 const state=await read(a); assert.equal(state.version,2); assert.equal(state.change.previous.status,'scheduled');
 await assert.rejects(act(c,'join'),/Event closed/);
 await assert.rejects(act(b,'meetup-join',{meetupId}),/Meetup closed/);
 await act(b,'leave'); assert.equal((await read(b)).messages.length,0);
});
await check('keyset paging returns unique earlier messages even when timestamps tie',async()=>{
 await db.query("insert into event_community_messages(event_key,user_id,request_id,body,created_at) select $1,$2,gen_random_uuid(),'history '||g,now()-interval '2 hours' from generate_series(1,60) g",[key,a]);
 const latest=await read(a); assert.equal(latest.messages.length,50); assert.ok(latest.nextBefore);
 const earlier=await value('select event_community_read($1,$2,$3,$4)',[a,key,latest.nextBefore.createdAt,latest.nextBefore.id]);
 assert.equal(earlier.messages.length,10); assert.equal(new Set([...latest.messages,...earlier.messages].map(m=>m.id)).size,60);
});
await check('anon and authenticated SQL cannot access tables, forge actors, sync facts or run moderation',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec(`set request.jwt.claim.role='${role}';set role ${role}`);
  for(const table of ['event_community_events','event_community_members','event_community_messages','event_community_meetups','event_community_meetup_attendees','event_community_reports']) await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
  await assert.rejects(act(a,'join'),/permission denied/);
  await assert.rejects(read(a),/permission denied/);
  await assert.rejects(db.query('select event_community_sync($1,$2)',[key,JSON.stringify(snapshot)]),/permission denied/);
  await assert.rejects(db.query("select event_community_moderate($1,'resolved',true)",[a]),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec("set request.jwt.claim.role='service_role'");
});
await check('attendee directory reaches beyond forty with stable cursors and filters blocked/incomplete profiles before paging',async()=>{
 const directory='ticketmaster:directory';await db.query('select event_community_sync($1,$2)',[directory,JSON.stringify({...snapshot,id:directory})]);
 const ids=Array.from({length:55},(_,i)=>`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 for(let i=0;i<ids.length;i++){
  await db.query('insert into auth.users(id) values($1)',[ids[i]]);await db.query('insert into profiles values($1,$2)',[ids[i],i===2?'':`person_${String(i+1).padStart(2,'0')}`]);
  await db.query("insert into event_community_members(event_key,user_id,joined_at) values($1,$2,'2026-10-30T10:00:00Z')",[directory,ids[i]]);
 }
 await db.query('insert into community_user_blocks(user_id,blocked_user_id) values($1,$2)',[a,ids[4]]);
 const page=(query='',cursor=null)=>value('select event_community_attendees($1,$2,$3,$4,$5)',[a,directory,query,cursor?.joinedAt||null,cursor?.userId||null]);
 const first=await page();assert.equal(first.attendees.length,40);assert.ok(first.nextAfter);
 const second=await page('',first.nextAfter);assert.equal(second.attendees.length,13);assert.equal(second.nextAfter,null);
 const people=[...first.attendees,...second.attendees];assert.equal(new Set(people.map(p=>p.userId)).size,53);assert.equal(people.some(p=>[ids[2],ids[4]].includes(p.userId)),false);
 assert.equal((await page('person_50')).attendees[0].userId,ids[49]);assert.equal((await page('%')).attendees.length,0,'Search is literal, not a SQL wildcard');
 await db.query('insert into community_user_blocks(user_id,blocked_user_id) values($1,$2)',[ids[49],a]);assert.equal((await page('person_50')).attendees.length,0,'Reverse block also hides identity');
 assert.equal(await value('select event_community_attendees($1,$2)',[a,'ticketmaster:missing']),null);
 await assert.rejects(value('select event_community_attendees($1,$2,$3,$4,$5)',[a,directory,'','2026-10-30',null]),/Invalid page/);
});
await check('attendee directory RPC is unavailable to direct anonymous or authenticated callers',async()=>{
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}; set request.jwt.claim.role='${role}'`);await assert.rejects(value('select public.event_community_attendees($1,$2)',[a,key]),/permission denied/);await db.exec("reset role;set request.jwt.claim.role='service_role'");}
});
await check('account deletion removes membership and attendance and anonymizes chat bodies',async()=>{
 await act(a,'join',{},other); await act(b,'join',{},other);
 await act(a,'meetup',{startsAt:new Date(Date.now()+3600000).toISOString(),publicPlace:'Public main hall entrance'},other);
 await db.query('delete from auth.users where id=$1',[a]);
 assert.equal(await value('select count(*) from event_community_members where user_id=$1',[a]),0);
 assert.equal(await value('select count(*) from event_community_meetup_attendees where user_id=$1',[a]),0);
 assert.equal(await value('select count(*) from event_community_messages where user_id=$1',[a]),0);
 assert.equal((await read(c)).attendees.some(person=>person.userId===a),false);
 await assert.rejects(act(a,'leave'),/Not authorized/);
 await act(b,'meetup',{startsAt:new Date(Date.now()+3600000).toISOString(),publicPlace:'Public north hall entrance'},other);
 assert.equal((await read(b,other)).meetup.creator.userId,b,'A deleted creator cannot reserve the unique meetup pin forever');
});
await check('soft-deleted meetup creators can be replaced while blocking an active owner never grants takeover',async()=>{
 await act(c,'join',{},other);
 await db.query("update auth.users set deleted_at=now() where id=$1",[b]);
 await act(c,'meetup',{startsAt:new Date(Date.now()+3600000).toISOString(),publicPlace:'Public station meeting point'},other);
 assert.equal((await read(c,other)).meetup.creator.userId,c);
 await db.query('update auth.users set deleted_at=null where id=$1',[b]);
 const meetup=(await read(b,other)).meetup;
 await act(b,'block',{targetType:'meetup',targetId:meetup.id},other);
 await assert.rejects(act(b,'meetup',{startsAt:new Date(Date.now()+3600000).toISOString(),publicPlace:'Attempted stolen meetup pin'},other),/Meetup owner required/);
});
await db.close(); console.log(`${passed} event community database checks passed`);
