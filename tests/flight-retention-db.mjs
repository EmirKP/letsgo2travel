import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const sql = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const users = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
const personalChecklist = [{ id: 'pack', label: 'My independently written note', done: true }];
const createSql = `select public.create_flight_lookup_trip(
  $1::uuid,$2::uuid,$3::text,$4::date,$5::date,$6::text,$7::jsonb,$8::text,$9::jsonb,$10::timestamptz,$11::timestamptz
) as trip`;
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
  `);
  // gen_random_uuid is built into PostgreSQL; PGlite does not need pgcrypto.
  await db.exec(sql('20260722000100_smart_travel_cockpit.sql').replace('create extension if not exists pgcrypto;', ''));
  await db.exec(sql('20260902100000_cockpit_flight_fields.sql'));
  await db.exec(sql('20260903200000_cockpit_arrival_time.sql'));
  await db.exec(sql('20260927110000_flight_lookup_retention.sql'));
  await db.exec(sql('20260930130000_albanian_trip_language.sql'));
  for (const user of users) await db.query('insert into auth.users(id) values($1)', [user]);
  return db;
}
async function actor(db, role = 'service_role', user = '') {
  assert.ok(['service_role', 'authenticated', 'anon'].includes(role));
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [user, role]);
  await db.exec(`set role ${role}`);
}
function input(overrides = {}) {
  const now = new Date();
  const startDate = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  return {
    user: users[0], receipt: randomUUID(), number: 'TK1979', startDate, endDate: startDate,
    pnr: 'ABC123', checklist: personalChecklist, language: 'tr',
    data: { flightNumber: 'TK1979', origin: { iata: 'IST' }, destination: { iata: 'LHR', city: 'London', country: 'United Kingdom' }, airline: 'Provider airline', departureTime: '12:00' },
    fetched: now.toISOString(), expires: new Date(now.getTime() + 4 * 86_400_000).toISOString(), ...overrides,
  };
}
async function create(db, value = input()) {
  return (await db.query(createSql, [value.user, value.receipt, value.number, value.startDate, value.endDate, value.pnr,
    JSON.stringify(value.checklist), value.language, JSON.stringify(value.data), value.fetched, value.expires])).rows[0].trip;
}
async function details(db, ids) {
  return (await db.query('select * from public.read_cockpit_flight_details($1::uuid[])', [ids])).rows;
}
async function ready(db) { return (await db.query('select public.flight_lookup_retention_ready() as ready')).rows[0].ready; }
async function purge(db) { return (await db.query('select public.purge_expired_trip_flight_data() as removed')).rows[0].removed; }
async function count(db, table) {
  assert.ok(['trips', 'trip_flight_provider_data'].includes(table));
  return Number((await db.query(`select count(*) from public.${table}`)).rows[0].count);
}
async function expiredFixture(db) {
  const value = input({ fetched: new Date(Date.now() - 3 * 86_400_000).toISOString(), expires: new Date(Date.now() - 86_400_000).toISOString() });
  // Install an already-aged row, without changing the DB clock or disabling guards.
  const trip = (await db.query(`insert into public.trips(user_id,start_date,end_date,flight_number,flight_pnr,checklist_items,
    flight_lookup_managed,flight_lookup_receipt_id,flight_lookup_expires_at)
    values($1,$2,$3,$4,$5,$6::jsonb,true,$7,$8) returning *`,
  [value.user, value.startDate, value.endDate, value.number, value.pnr, JSON.stringify(value.checklist), value.receipt, value.expires])).rows[0];
  await db.query('insert into public.trip_flight_provider_data values($1,$2,$3,$4,$5,$6::jsonb)',
    [trip.id, value.user, value.receipt, value.fetched, value.expires, JSON.stringify(value.data)]);
  return { trip, value };
}

test('Albanian migration preserves all existing RPC guards and accepts only supported trip languages', async () => {
  const source = sql('20260927110000_flight_lookup_retention.sql');
  const migration = sql('20260930130000_albanian_trip_language.sql');
  const rpc = text => text.replace(/\r\n/g, '\n').match(/create or replace function public\.create_flight_lookup_trip\([\s\S]+?grant execute on function public\.create_flight_lookup_trip\([^;]+to service_role;/)[0];
  assert.equal(rpc(migration).replace("('tr', 'en', 'sq')", "('tr', 'en')"), rpc(source), 'The language allowlist is the only RPC change');
  const db = await fixture();
  try {
    await actor(db);
    for (const language of ['tr', 'en', 'sq']) {
      const value = input({ language });
      const trip = await create(db, value);
      assert.equal(trip.app_language, language);
      assert.equal(Date.parse(trip.flight_lookup_expires_at), Date.parse(value.expires));
      assert.equal(trip.destination_city, null, 'Provider contents remain in the private sidecar');
      await actor(db, 'authenticated', users[0]);
      await db.query("update public.trips set app_language='sq' where id=$1", [trip.id]);
      assert.equal((await db.query('select app_language from public.trips where id=$1', [trip.id])).rows[0].app_language, 'sq');
      for (const invalid of ['de', 'SQ', '', null]) {
        await assert.rejects(() => db.query('update public.trips set app_language=$2 where id=$1', [trip.id, invalid]), /check constraint|not-null constraint/);
      }
      await actor(db);
    }
    for (const language of ['de', 'SQ', '', null]) await assert.rejects(() => create(db, input({ language })), /invalid_input/);
    assert.equal(await count(db, 'trips'), 3);
  } finally { await db.close(); }
});

test('Provider contents and heartbeat are private; privileged RPCs cannot be invoked by clients', async () => {
  const db = await fixture();
  try {
    for (const role of ['anon', 'authenticated']) {
      await actor(db, role, users[0]);
      for (const table of ['trip_flight_provider_data', 'flight_lookup_retention_health']) {
        await assert.rejects(() => db.query(`select * from public.${table}`), /permission denied/);
        await assert.rejects(() => db.query(`delete from public.${table}`), /permission denied/);
      }
      await assert.rejects(() => ready(db), /permission denied/);
      await assert.rejects(() => purge(db), /permission denied/);
      await assert.rejects(() => create(db), /permission denied/);
      if (role === 'anon') await assert.rejects(() => details(db, []), /permission denied/);
    }
    await actor(db); assert.equal(await ready(db), true);
    assert.deepEqual(await details(db, []), []);
    await db.exec('reset role');
    assert.deepEqual((await db.query("select relrowsecurity from pg_class where oid in ('public.trip_flight_provider_data'::regclass,'public.flight_lookup_retention_health'::regclass)")).rows.map(row => row.relrowsecurity), [true, true]);
  } finally { await db.close(); }
});

test('Managed trip creation keeps base contents empty and reads only the authenticated owner’s unexpired details', async () => {
  const db = await fixture();
  try {
    await actor(db); const value = input(), trip = await create(db, value);
    assert.equal(trip.flight_lookup_managed, true);
    assert.equal(trip.flight_lookup_receipt_id, value.receipt);
    assert.equal(Date.parse(trip.flight_lookup_expires_at), Date.parse(value.expires));
    for (const field of ['destination_country', 'destination_code', 'destination_city', 'departure_at', 'arrival_at', 'origin_iata', 'destination_iata', 'airline']) assert.equal(trip[field], null, field);
    assert.equal(trip.flight_number, value.number); assert.equal(trip.start_date, value.startDate);
    await actor(db, 'authenticated', users[0]);
    assert.deepEqual((await details(db, [trip.id]))[0].data, value.data);
    assert.equal((await db.query('select * from public.trips where id=$1', [trip.id])).rows[0].destination_city, null);
    await assert.rejects(() => details(db, Array(101).fill(trip.id)), /too_many_ids/);
    assert.deepEqual(await details(db, null), []);
    await actor(db, 'authenticated', users[1]);
    assert.deepEqual(await details(db, [trip.id, randomUUID()]), []);
    assert.equal((await db.query('select * from public.trips where id=$1', [trip.id])).rows.length, 0);
    await actor(db, 'authenticated'); assert.deepEqual(await details(db, [trip.id]), []);
  } finally { await db.close(); }
});

test('Client cannot forge management metadata, extend retention, rewrite the original query, or copy provider fields into the base', async () => {
  const db = await fixture();
  try {
    await actor(db); const trip = await create(db);
    await actor(db, 'authenticated', users[0]);
    // A forged JWT claim setting alone must not pass the SQL role check.
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    await assert.rejects(() => db.query(`insert into public.trips(user_id,start_date,end_date,flight_number,flight_lookup_managed,flight_lookup_receipt_id,flight_lookup_expires_at)
      values($1,current_date,current_date,'TK1979',true,$2,now()+interval '1 day')`, [users[0], randomUUID()]), /server_write_required/);
    const prohibited = [
      "flight_lookup_managed=false", "flight_lookup_receipt_id=gen_random_uuid()", "flight_lookup_expires_at=flight_lookup_expires_at+interval '1 day'",
      "id=gen_random_uuid()", `user_id='${users[1]}'`, "flight_number='TK1980'", "start_date=start_date+1",
      "destination_country='United Kingdom'", "destination_code='GB'", "destination_city='London'", "departure_at=now()", "arrival_at=now()+interval '1 hour'",
      "origin_iata='IST'", "destination_iata='LHR'", "airline='Provider airline'",
    ];
    for (const change of prohibited) await assert.rejects(() => db.query(`update public.trips set ${change} where id=$1`, [trip.id]), /server_write_required|identity_immutable|check constraint/);
    await db.query(`update public.trips set flight_pnr='MYPNR', checklist_items=$2::jsonb, status='active',end_date=end_date+1,app_language='en' where id=$1`, [trip.id, JSON.stringify([{ id: 'mine', label: 'My new note', done: false }])]);
    const own = (await db.query('select * from public.trips where id=$1', [trip.id])).rows[0];
    assert.equal(own.flight_pnr, 'MYPNR'); assert.equal(own.status, 'active'); assert.equal(own.app_language, 'en');
    assert.equal(own.checklist_items[0].label, 'My new note');
    assert.equal((await details(db, [trip.id])).length, 1);
  } finally { await db.close(); }
});

test('Expired contents are masked before purge; purge keeps personal fields and receipt sentinel and cannot be undone by replay', async () => {
  const db = await fixture();
  try {
    await actor(db); const { trip, value } = await expiredFixture(db);
    await actor(db, 'authenticated', users[0]);
    assert.deepEqual(await details(db, [trip.id]), []);
    const personal = (await db.query('select * from public.trips where id=$1', [trip.id])).rows[0];
    assert.equal(personal.flight_pnr, value.pnr); assert.deepEqual(personal.checklist_items, value.checklist);
    await actor(db); assert.equal(await purge(db), 1); assert.equal(await purge(db), 0);
    assert.equal(await count(db, 'trips'), 1); assert.equal(await count(db, 'trip_flight_provider_data'), 0);
    const retained = (await db.query('select * from public.trips where id=$1', [trip.id])).rows[0];
    assert.deepEqual(retained, personal);
    await assert.rejects(() => create(db, input({ receipt: value.receipt })), /receipt_expired/);
    assert.equal(await count(db, 'trip_flight_provider_data'), 0);
  } finally { await db.close(); }
});

test('Receipt retries are idempotent, owner-bound and cannot replace the signed query or provider snapshot', async () => {
  const db = await fixture();
  try {
    await actor(db); const value = input();
    const [first, again] = await Promise.all([create(db, value), create(db, value)]);
    assert.equal(first.id, again.id); assert.equal(await count(db, 'trips'), 1); assert.equal(await count(db, 'trip_flight_provider_data'), 1);
    await assert.rejects(() => create(db, { ...value, user: users[1] }), /receipt_unavailable/);
    for (const replacement of [{ number: 'TK1980' }, { data: { ...value.data, airline: 'Rewritten' } }, { expires: new Date(Date.parse(value.expires) + 1000).toISOString() }]) {
      await assert.rejects(() => create(db, { ...value, ...replacement }), /receipt_mismatch/);
    }
    assert.equal((await create(db, { ...value, pnr: 'IGNORED' })).flight_pnr, value.pnr, 'retry must not overwrite personal edits');
  } finally { await db.close(); }
});

test('Completing or cancelling a trip deletes only its provider contents immediately; reactivation does not resurrect them', async () => {
  const db = await fixture();
  try {
    await actor(db); const firstValue = input(), secondValue = input();
    const first = await create(db, firstValue), second = await create(db, secondValue);
    await actor(db, 'authenticated', users[0]);
    await db.query("update public.trips set status='completed' where id=$1", [first.id]);
    await db.query("update public.trips set status='cancelled' where id=$1", [second.id]);
    assert.deepEqual(await details(db, [first.id, second.id]), []);
    await db.query("update public.trips set status='active' where id=$1", [first.id]);
    await actor(db); assert.equal(await count(db, 'trip_flight_provider_data'), 0); assert.equal(await count(db, 'trips'), 2);
    await assert.rejects(() => create(db, firstValue), /receipt_expired/);
    assert.deepEqual((await db.query('select checklist_items from public.trips where id=$1', [first.id])).rows[0].checklist_items, personalChecklist);
  } finally { await db.close(); }
});

test('Manual trip validation and updates remain unchanged; deleting a trip or user cascades only their own provider contents', async () => {
  const db = await fixture();
  try {
    await actor(db, 'authenticated', users[0]);
    await assert.rejects(() => db.query('insert into public.trips(user_id,start_date,end_date) values($1,current_date,current_date)', [users[0]]), /check constraint/);
    const manual = (await db.query(`insert into public.trips(user_id,destination_country,destination_code,start_date,end_date,departure_at,origin_iata,destination_iata,airline)
      values($1,'Türkiye','TR',current_date,current_date,now()+interval '1 hour','IST','ADB','My ticket airline') returning *`, [users[0]])).rows[0];
    assert.equal(manual.flight_lookup_managed, false); assert.equal(manual.flight_lookup_expires_at, null);
    await db.query("update public.trips set destination_city='İzmir',flight_number='TK999',start_date=start_date-1 where id=$1", [manual.id]);
    await actor(db); const first = await create(db), second = await create(db, input({ user: users[1] }));
    await actor(db, 'authenticated', users[0]); await db.query('delete from public.trips where id=$1', [first.id]);
    await actor(db); assert.equal(await count(db, 'trip_flight_provider_data'), 1);
    await db.exec('reset role'); await db.query('delete from auth.users where id=$1', [users[1]]);
    assert.equal(await count(db, 'trip_flight_provider_data'), 0);
    assert.equal((await db.query('select id from public.trips where id=$1', [second.id])).rows.length, 0);
    assert.equal((await db.query('select destination_city from public.trips where id=$1', [manual.id])).rows[0].destination_city, 'İzmir');
  } finally { await db.close(); }
});

test('Invalid payloads, retention bounds and sidecar mismatches fail atomically; live sidecars have a per-owner cap', async () => {
  const db = await fixture();
  try {
    await actor(db);
    for (const changes of [
      { data: [] }, { data: { tooLarge: 'x'.repeat(17000) } }, { fetched: new Date(Date.now() + 120_000).toISOString() },
      { expires: new Date(Date.now() + 6 * 86_400_000).toISOString() }, { expires: new Date(Date.now() - 1000).toISOString() },
      { number: 'not a flight' }, { checklist: Array.from({ length: 51 }, (_, i) => ({ id: String(i) })) },
      { language: 'xx' }, { user: randomUUID() },
    ]) {
      await assert.rejects(() => create(db, input(changes)), /invalid_input|check constraint|foreign key/);
      assert.equal(await count(db, 'trips'), 0); assert.equal(await count(db, 'trip_flight_provider_data'), 0);
    }
    const trip = await create(db);
    await assert.rejects(() => db.query('update public.trip_flight_provider_data set user_id=$2 where trip_id=$1', [trip.id, users[1]]), /sidecar_mismatch/);
    await assert.rejects(() => db.query("update public.trip_flight_provider_data set expires_at=expires_at+interval '1 hour' where trip_id=$1", [trip.id]), /sidecar_mismatch|check constraint/);
    for (let i = 1; i < 100; i++) await create(db);
    await assert.rejects(() => create(db), /trip_limit/);
    assert.equal(await count(db, 'trips'), 100);
    await create(db, input({ user: users[1] })); assert.equal(await count(db, 'trips'), 101);
  } finally { await db.close(); }
});

test('Stale or missing purge heartbeat closes readiness and creation; a successful purge restores both without leaking expired contents', async () => {
  const db = await fixture();
  try {
    await actor(db); const { trip } = await expiredFixture(db);
    const before = await count(db, 'trip_flight_provider_data');
    assert.equal(await ready(db), true); assert.equal(await count(db, 'trip_flight_provider_data'), before, 'readiness must be read-only');
    await db.exec("update public.flight_lookup_retention_health set last_purged_at=now()-interval '27 hours'");
    assert.equal(await ready(db), false);
    await assert.rejects(() => create(db), /retention_unavailable/);
    await actor(db, 'authenticated', users[0]); assert.deepEqual(await details(db, [trip.id]), []);
    await actor(db); assert.equal(await purge(db), 1); assert.equal(await ready(db), true);
    await create(db);
    await db.exec('delete from public.flight_lookup_retention_health'); assert.equal(await ready(db), false);
    await assert.rejects(() => create(db), /retention_unavailable/);
    assert.equal(await purge(db), 0); assert.equal(await ready(db), true);
  } finally { await db.close(); }
});
