import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const owner='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
const sql=name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
async function fixture() {
  const db=new PGlite();
  try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for(const name of ['20260722000100_smart_travel_cockpit.sql','20260902100000_cockpit_flight_fields.sql','20260903200000_cockpit_arrival_time.sql','20260902120000_live_activity_push_tokens.sql','20260927110000_flight_lookup_retention.sql','20260928120000_flight_lookup_refresh.sql','20260928130000_flight_native_refresh_queue.sql']) await db.exec(sql(name).replace('create extension if not exists pgcrypto;',''));
  await db.query('insert into auth.users values($1),($2)',[owner,other]);
  const installation=randomUUID(),epoch=randomUUID(),receipt=randomUUID(),date=new Date().toISOString().slice(0,10),fetched=new Date(Date.now()-6*60000).toISOString();
  await db.query('insert into public.live_activity_installation_sessions(installation_id,user_id,session_epoch,generation) values($1,$2,$3,1)',[installation,owner,epoch]);
  const provider={flightNumber:'TK1985',source:'AeroDataBox',fetchedAt:fetched,departureDate:date,departureAt:fetched,nativeDisplayAllowed:true,origin:{iata:'IST'},destination:{iata:'LHR'},progress:{phase:'en-route'}};
  const trip=(await db.query(`select public.create_flight_lookup_trip($1,$2,'TK1985',$3::date,$3::date,'ABC123','[]','en',$4::jsonb,$5::timestamptz,$5::timestamptz+interval '5 days') as trip`,[owner,receipt,date,JSON.stringify(provider),fetched])).rows[0].trip;
  const token=(await db.query(`insert into public.live_activity_tokens(user_id,token_type,trip_id,token,installation_id,session_epoch,session_generation)
    values($1,'activity_update',$2,'NONFUNCTIONAL_TOKEN_FIXTURE',$3,$4,1) returning id`,[owner,trip.id,installation,epoch])).rows[0].id;
  const claim=()=>db.query('select * from public.claim_flight_native_refresh_batch(1000)').then(r=>r.rows);
  const envelope=job=>db.query('select public.read_flight_native_refresh($1,$2) as result',[job.trip_id,job.lease_id]).then(r=>r.rows[0].result);
  const delivery=(job,generation,tokenId=token,claimId=randomUUID())=>db.query('select public.claim_flight_native_delivery($1,$2,$3,$4,$5) as token',[job.trip_id,job.lease_id,generation,tokenId,claimId]).then(r=>({token:r.rows[0].token,claimId}));
  const settle=(claimId,sent=true,disable=false)=>db.query('select public.settle_flight_native_delivery($1,$2,$3,$4,$5) as result',[trip.id,token,claimId,sent,disable]).then(r=>r.rows[0].result);
  return {db,trip,token,installation,epoch,claim,envelope,delivery,settle};
  } catch (error) { await db.close(); throw error; }
}

test('Background queue is private; leases bound parallel batches and only current owner sessions receive tokens',async()=>{
  const h=await fixture();try {
    for(const actor of ['anon','authenticated']) {
      await h.db.exec(`set role ${actor}`);await assert.rejects(h.claim,/permission denied/);
      for(const table of ['flight_native_refresh_queue','flight_native_refresh_deliveries']) await assert.rejects(()=>h.db.query(`select * from public.${table}`),/permission denied/);
      await h.db.exec('reset role');
    }
    const [job]=await h.claim();assert.ok(job);assert.deepEqual(await h.claim(),[]);
    const before=await h.envelope(job);assert.equal(before.tokens.length,1);
    await h.db.query('update public.live_activity_installation_sessions set user_id=$1,generation=2 where installation_id=$2',[other,h.installation]);
    assert.equal((await h.envelope(job)).tokens.length,0);
    assert.equal((await h.delivery(job,before.generation)).token,null);
  }finally{await h.db.close();}
});

test('Monotonic source generations fence stale updates and terminal end contains no provider contents',async()=>{
  const h=await fixture();try {
    const [job]=await h.claim(),before=await h.envelope(job);
    await h.db.query("delete from public.trip_flight_provider_data where trip_id=$1",[h.trip.id]);
    const after=await h.envelope(job);assert.equal(after.terminal,true);assert.equal(after.flight,null);assert.equal(after.expiresAt,null);assert.ok(after.generation>before.generation);
    assert.equal((await h.delivery(job,before.generation)).token,null,'Old worker cannot update after terminal generation');
    const terminal=await h.delivery(job,after.generation);assert.equal(terminal.token,'NONFUNCTIONAL_TOKEN_FIXTURE');
    assert.equal(await h.settle(terminal.claimId),true);
    assert.equal((await h.delivery(job,after.generation)).token,null,'Delivered generation is deduplicated');
    await h.db.query("update public.flight_native_refresh_queue set lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second'");
    assert.deepEqual(await h.claim(),[],'Terminal delivered activities never restart');
    const queue=(await h.db.query('select * from public.flight_native_refresh_queue')).rows[0];
    assert.doesNotMatch(JSON.stringify(queue),/IST|LHR|AeroDataBox|departureAt|fetchedAt|flightNumber/);
  }finally{await h.db.close();}
});

test('Delivery claim expiry permits retry but fences old settlements and only disables the claimed token',async()=>{
  const h=await fixture();try {
    const [job]=await h.claim(),envelope=await h.envelope(job),first=await h.delivery(job,envelope.generation);
    assert.ok(first.token);assert.equal((await h.delivery(job,envelope.generation)).token,null);
    await h.db.query("update public.flight_native_refresh_deliveries set claimed_until=now()-interval '1 second'");
    const second=await h.delivery(job,envelope.generation);assert.ok(second.token);
    assert.equal(await h.settle(first.claimId,true,true),false);
    assert.equal((await h.db.query('select enabled from public.live_activity_tokens where id=$1',[h.token])).rows[0].enabled,true);
    assert.equal(await h.settle(second.claimId,false,true),true);
    assert.equal((await h.db.query('select enabled from public.live_activity_tokens where id=$1',[h.token])).rows[0].enabled,false);
  }finally{await h.db.close();}
});

test('Already delivered active activities remain eligible for later refresh; expired contents yield only an end envelope',async()=>{
  const h=await fixture();try {
    const [job]=await h.claim(),before=await h.envelope(job),first=await h.delivery(job,before.generation);
    await h.settle(first.claimId);
    await h.db.query("update public.flight_native_refresh_queue set lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second'");
    const [next]=await h.claim();assert.ok(next);assert.equal((await h.envelope(next)).tokens.length,1,'Existing activity still needs later provider refresh even if its previous generation was sent');
    await h.db.query("update public.trips set flight_lookup_expires_at=now()-interval '1 second' where id=$1",[h.trip.id]);
    await h.db.query("update public.trip_flight_provider_data set fetched_at=now()-interval '4 days',expires_at=(select flight_lookup_expires_at from public.trips where id=$1) where trip_id=$1",[h.trip.id]);
    const expired=await h.envelope(next);assert.equal(expired.terminal,true);assert.equal(expired.flight,null);assert.equal(expired.expiresAt,null);assert.ok(expired.generation>before.generation);
  }finally{await h.db.close();}
});

test('Expired lease, owner epoch bar and missing native entitlement prevent delivery; expired contents become end only',async()=>{
  const h=await fixture();try {
    const [job]=await h.claim(),before=await h.envelope(job);
    await h.db.query('insert into public.live_activity_epoch_bars(installation_id,epoch) values($1,$2)',[h.installation,h.epoch]);
    assert.equal((await h.delivery(job,before.generation)).token,null);
    await h.db.query('delete from public.live_activity_epoch_bars');
    await h.db.query("update public.trip_flight_provider_data set data=jsonb_set(data,'{nativeDisplayAllowed}','false') where trip_id=$1",[h.trip.id]);
    assert.equal(await h.envelope(job),null);
    await h.db.query("update public.trips set status='completed' where id=$1",[h.trip.id]);
    const ended=await h.envelope(job);assert.equal(ended.terminal,true);assert.equal(ended.flight,null);
    await h.db.query("update public.flight_native_refresh_queue set lease_until=now()-interval '1 second'");
    assert.equal(await h.envelope(job),null);assert.equal((await h.delivery(job,ended.generation)).token,null);
  }finally{await h.db.close();}
});
