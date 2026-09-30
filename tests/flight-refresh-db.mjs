import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const owner = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
const sql = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
async function role(db, role = 'service_role', user = '') {
  assert.ok(['service_role','authenticated','anon'].includes(role));
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); await db.exec(`set role ${role}`);
}
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const name of ['20260722000100_smart_travel_cockpit.sql','20260902100000_cockpit_flight_fields.sql','20260903200000_cockpit_arrival_time.sql','20260927110000_flight_lookup_retention.sql','20260928120000_flight_lookup_refresh.sql','20260930130000_albanian_trip_language.sql']) await db.exec(sql(name).replace('create extension if not exists pgcrypto;', ''));
  for (const id of [owner,other]) await db.query('insert into auth.users values($1)',[id]);
  await role(db);
  const date = new Date().toISOString().slice(0,10), fetchedAt = new Date(Date.now()-6*60000).toISOString();
  const flight = { flightNumber:'TK1985',source:'AeroDataBox',departureDate:date,fetchedAt,origin:{iata:'IST'},destination:{iata:'LHR'},nativeDisplayAllowed:false,
    progress:{phase:'en-route',status:'EnRoute',sourceUpdatedAt:fetchedAt} };
  const input = [owner,randomUUID(),'TK1985',date,date,'ABC123',JSON.stringify([{label:'Personal note'}]),'tr',JSON.stringify(flight),fetchedAt,new Date(Date.parse(fetchedAt)+5*86400000).toISOString()];
  const create = value => db.query('select public.create_flight_lookup_trip_v3($1::uuid,$2::uuid,$3::text,$4::date,$5::date,$6::text,$7::jsonb,$8::text,$9::jsonb,$10::timestamptz,$11::timestamptz) as result',value).then(r=>r.rows[0].result);
  const saved = await create(input), id=saved.trip.id;
  const reserve = (requestId,user=owner,trip=id) => db.query('select public.reserve_flight_lookup_refresh($1,$2,$3) as result',[user,trip,requestId]).then(r=>r.rows[0].result);
  const updated = fields => { const timestamp=new Date().toISOString(); return {...flight,fetchedAt:timestamp,progress:{phase:'en-route',status:'EnRoute',sourceUpdatedAt:timestamp},...fields}; };
  const finish = (requestId,value=updated(),outcome='updated',user=owner) => db.query('select public.finish_flight_lookup_refresh($1,$2,$3,$4::jsonb,$5::timestamptz,$6::timestamptz,$7) as result',
    [user,id,requestId,value && JSON.stringify(value),value?.fetchedAt ?? null,value?new Date(Date.parse(value.fetchedAt)+5*86400000).toISOString():null,outcome]).then(r=>r.rows[0].result);
  return {db,id,flight,input,create,saved,reserve,finish,updated};
}

test('V3 managed creation accepts Albanian through its existing base RPC and preserves receipt expiry',async()=>{
  const h=await fixture(); try {
    const input=[...h.input]; input[1]=randomUUID(); input[7]='sq';
    const saved=await h.create(input);
    assert.equal(saved.trip.app_language,'sq');
    assert.equal(Date.parse(saved.expiresAt),Date.parse(input[10]));
    assert.equal(saved.trip.destination_city,null);
    assert.equal((await h.create(input)).trip.id,saved.trip.id,'The same receipt remains idempotent');
  } finally {await h.db.close();}
});

test('Refresh reservation is private, owner-bound, single-flight and replay-safe before provider work',async()=>{
  const h=await fixture(); try {
    for(const actor of ['anon','authenticated']) {
      await role(h.db,actor,owner);
      await assert.rejects(()=>h.db.query('select * from public.flight_lookup_refresh_requests'),/permission denied/);
      await assert.rejects(()=>h.reserve(randomUUID()),/permission denied/);
      await assert.rejects(()=>h.finish(randomUUID()),/permission denied/);
      await assert.rejects(()=>h.create(h.input),/permission denied/);
    }
    await role(h.db); const request=randomUUID();
    assert.equal((await h.reserve(request,other)).kind,'unavailable');
    assert.equal((await h.reserve(request)).kind,'reserved');
    assert.equal((await h.reserve(request)).kind,'busy');
    assert.equal((await h.reserve(randomUUID())).kind,'busy');
    assert.equal((await h.finish(request,null,'failed',other)).kind,'unavailable');
    assert.equal((await h.finish(request,null,'failed')).kind,'failed');
    assert.equal((await h.reserve(request)).kind,'failed');
    assert.equal((await h.reserve(randomUUID())).kind,'cached','Changing request UUID must not bypass the five-minute cost guard');
  } finally {await h.db.close();}
});

test('Fresh retrieval atomically renews only the sidecar lifetime; retries preserve notes and return current contents',async()=>{
  const h=await fixture(); try {
    const request=randomUUID(); await h.reserve(request); const next=h.updated(); const result=await h.finish(request,next);
    assert.equal(result.kind,'updated'); assert.equal(result.flight.fetchedAt,next.fetchedAt);
    assert.equal(Date.parse(result.expiresAt),Date.parse(next.fetchedAt)+5*86400000);
    for(const key of ['destination_country','destination_city','departure_at','arrival_at','origin_iata','destination_iata','airline']) assert.equal(result.trip[key],null,key);
    assert.equal(result.trip.flight_pnr,'ABC123'); assert.deepEqual(result.trip.checklist_items,[{label:'Personal note'}]);
    const replay=await h.reserve(request); assert.equal(replay.kind,'cached'); assert.equal(replay.flight.fetchedAt,next.fetchedAt);
    const retrySave=await h.create(h.input); assert.equal(retrySave.trip.id,h.id); assert.equal(retrySave.flight.fetchedAt,next.fetchedAt,'Old signed data must not overwrite a refreshed overlay');
    assert.equal((await h.finish(request,h.updated())).kind,'conflict');
    await role(h.db,'authenticated',owner);
    await assert.rejects(()=>h.db.query("update public.trips set flight_lookup_expires_at=now()+interval '6 days' where id=$1",[h.id]),/flight_lookup_server_write_required/);
    const rows=(await h.db.query('select * from public.read_cockpit_flight_details($1)',[[h.id]])).rows;
    assert.equal(rows.length,1); assert.equal(rows[0].data.fetchedAt,next.fetchedAt);
  } finally {await h.db.close();}
});

test('Refresh rejects route substitution, older source data and late responses',async()=>{
  const h=await fixture(); try {
    const request=randomUUID(); await h.reserve(request);
    await assert.rejects(()=>h.finish(request,h.updated({destination:{iata:'CDG'}})),/flight_lookup_invalid_refresh/);
    const stale=h.updated({progress:{phase:'en-route',sourceUpdatedAt:new Date(Date.parse(h.flight.fetchedAt)-1000).toISOString()}});
    assert.equal((await h.finish(request,stale)).kind,'conflict');
    await h.db.query("update public.flight_lookup_refresh_requests set created_at=now()-interval '31 seconds' where request_id=$1",[request]);
    assert.equal((await h.finish(request,h.updated())).kind,'conflict');
    assert.equal((await h.reserve(request)).kind,'failed');
    const stored=(await h.db.query('select data from public.trip_flight_provider_data where trip_id=$1',[h.id])).rows[0].data;
    assert.equal(stored.fetchedAt,h.flight.fetchedAt);
  } finally {await h.db.close();}
});

test('Only fresh terminal status purges contents; personal trip and replay sentinel survive and cannot restart',async()=>{
  const h=await fixture(); try {
    const request=randomUUID(); await h.reserve(request);
    const terminal=h.updated({progress:{phase:'arrived',status:'Arrived',sourceUpdatedAt:new Date().toISOString()}});
    assert.equal((await h.finish(request,terminal,'terminal')).kind,'terminal');
    assert.equal((await h.db.query('select count(*) from public.trip_flight_provider_data')).rows[0].count,0);
    const replay=await h.reserve(request); assert.equal(replay.kind,'terminal'); assert.equal(replay.flight,null);
    assert.equal((await h.reserve(randomUUID())).kind,'unavailable');
    assert.equal(replay.trip.flight_pnr,'ABC123'); assert.equal(replay.trip.flight_lookup_receipt_id,h.input[1]);
    assert.deepEqual(replay.trip.checklist_items,[{label:'Personal note'}]);
    await assert.rejects(()=>h.create(h.input),/flight_lookup_receipt_expired/);
    assert.equal((await h.finish(request,h.updated())).kind,'conflict');
  } finally {await h.db.close();}
});

test('Completed trips, missing retention heartbeat and expired details fail closed; purge removes request metadata',async()=>{
  const h=await fixture(); try {
    const request=randomUUID(); await h.reserve(request);
    await h.db.query("update public.trips set status='completed' where id=$1",[h.id]);
    assert.equal((await h.finish(request,h.updated())).kind,'unavailable');
    assert.equal((await h.reserve(randomUUID())).kind,'unavailable');
    await h.db.query("update public.flight_lookup_refresh_requests set created_at=now()-interval '6 days'");
    await h.db.query("update public.flight_lookup_retention_health set last_purged_at=now()-interval '27 hours'");
    assert.equal((await h.db.query('select public.flight_lookup_refresh_ready() as ready')).rows[0].ready,false);
    await h.db.query('select public.purge_expired_trip_flight_data()');
    assert.equal((await h.db.query('select count(*) from public.flight_lookup_refresh_requests')).rows[0].count,0);
    assert.equal((await h.db.query('select public.flight_lookup_refresh_ready() as ready')).rows[0].ready,true);
  } finally {await h.db.close();}
});
