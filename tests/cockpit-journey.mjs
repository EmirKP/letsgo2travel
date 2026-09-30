import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const owner = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002', tripId = '20000000-0000-4000-8000-000000000001';
class ApiError extends Error { constructor(message, status, code = "") { super(message); this.status = status; this.code = code; } }
function harness() {
  const calls = [], cache = new Map(); let rows = [], failure = null;
  const load = filename => {
    let file = path.resolve(filename);
    if (!existsSync(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const fixtureModule = { exports: {} }; cache.set(file, fixtureModule);
    if (file.endsWith('.json')) return fixtureModule.exports = JSON.parse(readFileSync(file, 'utf8'));
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { URL, URLSearchParams, Date, Intl, console })(name => {
      if (name === './api') return { ApiError, requestJson: async (url, options) => { calls.push({ url, options }); if (failure) throw failure; return structuredClone(rows); } };
      if (name === './config') return { config: { supabaseUrl: 'https://fixture.supabase.co', supabaseAnonKey: 'PUBLIC_KEY' } };
      return name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
    }, fixtureModule, fixtureModule.exports);
    return fixtureModule.exports;
  };
  return { calls, load, reply: value => { rows = value; }, fail: value => { failure = value; } };
}
const intent = () => ({ kind: 'saved-route', ownerId: owner, sourceRouteId: 'saved-route-1', sourceSavedAt: '2026-10-01T00:00:00Z', routeIndex: 0, input: null, dates: { startDate: '2026-10-01', endDate: '2026-10-04' },
  route: { name: 'Istanbul to Bodrum', country: 'Türkiye', destinationCode: 'TR', cityOrRegion: 'Bodrum', why: 'A coastal trip', dailyPlan: ['Old town', 'Coast'] } });
const row = () => ({ trip_id: tripId, owner_id: owner, route_snapshot: intent(), budget_snapshot: null, updated_at: '2026-10-01T10:00:00Z' });

test('Journey writes are owner bound, preserve selected snapshot and use optimistic concurrency', async () => {
  const h = harness(), api = h.load('mobile/src/lib/cockpitJourney.ts');
  h.reply([row()]);
  const saved = await api.saveCockpitJourney(owner, tripId, 'SESSION', intent(), null);
  assert.equal(h.calls[0].options.method, 'POST'); assert.equal(h.calls[0].options.body.route_snapshot.route.dailyPlan.length, 2);
  assert.equal(h.calls[0].options.body.budget_snapshot, undefined);
  await api.saveCockpitJourney(owner, tripId, 'SESSION', intent(), saved);
  assert.equal(h.calls[1].options.method, 'PATCH'); assert.equal(new URL(h.calls[1].url).searchParams.get('updated_at'), `eq.${saved.updatedAt}`);
  await assert.rejects(() => api.saveCockpitJourney(other, tripId, 'SESSION', intent(), saved), error => error.status === 400);
  assert.equal(h.calls.length, 2);
  h.reply([]); await assert.rejects(() => api.saveCockpitJourney(owner, tripId, 'SESSION', intent(), saved), error => error.status === 409);
});

test('Invalid or cross-account saved snapshots fail visibly rather than being shown or overwritten', async () => {
  const h = harness(), api = h.load('mobile/src/lib/cockpitJourney.ts');
  h.reply([{ ...row(), owner_id: other }]);
  await assert.rejects(() => api.readCockpitJourney(owner, tripId, 'SESSION'), error => error.status === 502);
  h.reply([{ ...row(), route_snapshot: { ...intent(), route: { dailyPlan: [] } } }]);
  await assert.rejects(() => api.readCockpitJourney(owner, tripId, 'SESSION'), error => error.status === 502);
});

test('Manual trip edits preserve airport-local times and managed edits cannot alter provider identity', () => {
  const h = harness(), api = h.load('mobile/src/lib/cockpitEdit.ts');
  const trip = { id: tripId, destinationCountry: 'Türkiye', destinationCode: 'TR', destinationCity: 'Bodrum', startDate: '2026-09-01', endDate: '2026-09-05',
    originIata: 'IST', destinationIata: 'BJV', departureAt: '2026-09-01T07:00:00Z', arrivalAt: '2026-09-01T08:20:00Z', flightPnr: 'OLD123', flightNumber: 'TK2500', airline: 'Airline' };
  const form = api.cockpitEditForm(trip);
  assert.equal(form.departureTime, '10:00'); assert.equal(form.arrivalTime, '11:20');
  form.flightPnr = 'NEW123';
  const result = api.cockpitEditInput(trip, form, 'en', new Date('2026-10-01'));
  assert.equal(result.error, ''); assert.equal(result.update.departureAt, '2026-09-01T07:00:00.000Z');
  assert.equal(result.update.checklistItems, undefined);
  const managed = api.cockpitEditInput({ ...trip, flightLookupManaged: true }, form, 'en');
  assert.deepEqual(Object.keys(managed.update).sort(), ['endDate', 'flightPnr']);
  form.endDate = '2026-08-31'; assert.ok(api.cockpitEditInput(trip, form, 'en').error);
});

test('Journey storage enforces ownership, protects concurrent changes, and cascades only with its trip', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;
      create table public.trips(id uuid primary key,user_id uuid not null references auth.users(id),start_date date not null default '2026-10-01',end_date date not null default '2026-10-04'); grant select,update on public.trips to authenticated;`);
    await db.exec(readFileSync('supabase/migrations/20261001090000_cockpit_journey_details.sql', 'utf8'));
    await db.query('insert into auth.users values($1),($2)', [owner, other]);
    await db.query('insert into trips(id,user_id) values($1,$2)', [tripId, owner]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]); await db.exec('set role authenticated');
    await db.query('insert into trip_journey_details(trip_id,owner_id,route_snapshot) values($1,$2,$3)', [tripId, owner, JSON.stringify(intent())]);
    const initial = (await db.query('select * from trip_journey_details')).rows[0];
    await db.query("update trip_journey_details set route_snapshot=jsonb_set(route_snapshot,'{route,name}','\"Changed copy\"') where trip_id=$1 and updated_at=$2", [tripId, initial.updated_at]);
    const stale = await db.query('update trip_journey_details set route_snapshot=null where trip_id=$1 and updated_at=$2 returning *', [tripId, initial.updated_at]);
    assert.equal(stale.rows.length, 0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    assert.equal((await db.query('select * from trip_journey_details')).rows.length, 0);
    await assert.rejects(() => db.query('insert into trip_journey_details(trip_id,owner_id) values($1,$2)', [tripId, other]), /row-level security/);
    await db.exec('reset role');
    const saved = (await db.query('select route_snapshot from trip_journey_details')).rows[0].route_snapshot;
    assert.equal(saved.route.name, 'Changed copy');
    await db.query('delete from trips where id=$1', [tripId]);
    assert.equal((await db.query('select * from trip_journey_details')).rows.length, 0);
  } finally { await db.close(); }
});

test('Stale parent dates and concurrent first writes normalize to a reloadable409 without masking auth or service errors',async()=>{
 const h=harness(),api=h.load('mobile/src/lib/cockpitJourney.ts');
 for(const [status,code] of [[500,'40001'],[500,'40P01'],[409,'23505']]){
  h.fail(new ApiError('database conflict',status,code));
  await assert.rejects(()=>api.saveCockpitJourney(owner,tripId,'SESSION',intent(),null),error=>error.status===409&&error.code==='journey_conflict');
 }
 h.fail(new ApiError('Permission denied',403,'42501'));
 await assert.rejects(()=>api.saveCockpitJourney(owner,tripId,'SESSION',intent(),null),error=>error.status===403);
 h.fail(new ApiError('Missing migration',404,'42P01'));
 await assert.rejects(()=>api.saveCockpitJourney(owner,tripId,'SESSION',intent(),null),error=>error.status===404);
});
test('Saving a route requires explicit target dates and a previous attachment requires its valid CAS version',async()=>{
 const h=harness(),api=h.load('mobile/src/lib/cockpitJourney.ts');
 await assert.rejects(()=>api.saveCockpitJourney(owner,tripId,'SESSION',{...intent(),dates:undefined},null),error=>error.status===400);
 await assert.rejects(()=>api.saveCockpitJourney(owner,tripId,'SESSION',intent(),{ownerId:owner,tripId,updatedAt:''}),error=>error.status===400);
 await assert.rejects(()=>api.saveCockpitJourney(owner,tripId,'',intent(),null),error=>error.status===401);
 assert.equal(h.calls.length,0);
});
test('Database rejects a route attached after parent dates change and preserves later day-based copies without blocking budget edits',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated;
    create table public.trips(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,start_date date not null,end_date date not null);
    alter table trips enable row level security;create policy own_trip on trips for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
    grant select,insert,update,delete on trips to authenticated;
    insert into auth.users values('${owner}'),('${other}');insert into trips values('${tripId}','${owner}','2026-10-01','2026-10-04');`);
  await db.exec(readFileSync('supabase/migrations/20261001090000_cockpit_journey_details.sql','utf8'));
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';`);
  await db.query('update trips set end_date=$1 where id=$2',['2026-10-01',tripId]);
  await assert.rejects(()=>db.query('insert into trip_journey_details(trip_id,owner_id,route_snapshot) values($1,$2,$3)',[tripId,owner,JSON.stringify(intent())]),error=>error.code==='40001');
  assert.equal((await db.query('select * from trip_journey_details')).rows.length,0);
  const dated={...intent(),dates:{startDate:'2026-10-01',endDate:'2026-10-01'}};
  await assert.rejects(()=>db.query('insert into trip_journey_details(trip_id,owner_id,route_snapshot) values($1,$2,$3)',[tripId,owner,JSON.stringify(dated)]),error=>error.code==='40001','Updated dates alone cannot fit two days into a one-day trip');
  const valid={...dated,route:{...dated.route,dailyPlan:['Old town']}};
  await db.query('insert into trip_journey_details(trip_id,owner_id,route_snapshot) values($1,$2,$3)',[tripId,owner,JSON.stringify(valid)]);
  await assert.rejects(()=>db.query('insert into trip_journey_details(trip_id,owner_id,route_snapshot) values($1,$2,$3)',[tripId,owner,JSON.stringify(valid)]),error=>error.code==='23505');
  await db.query('update trips set start_date=$1,end_date=$1 where id=$2',['2026-10-02',tripId]);
  await assert.rejects(()=>db.query('update trip_journey_details set route_snapshot=$1 where trip_id=$2',[JSON.stringify(valid),tripId]),error=>error.code==='40001','Even an identical route UPDATE must revalidate target dates');
  await db.query('update trip_journey_details set budget_snapshot=$1 where trip_id=$2',[JSON.stringify({kind:'city-budget',ownerId:owner}),tripId]);
  const saved=(await db.query('select * from trip_journey_details')).rows[0];
  assert.equal(saved.route_snapshot.route.dailyPlan[0],'Old town');assert.equal(saved.route_snapshot.dates.startDate,'2026-10-01','Later date edits preserve the original snapshot for the UI warning');
  assert.equal(saved.budget_snapshot.kind,'city-budget');
  await db.exec('reset role');await db.exec(readFileSync('supabase/migrations/20261001090000_cockpit_journey_details.sql','utf8'));
  assert.equal((await db.query('select * from trip_journey_details')).rows[0].route_snapshot.dates.startDate,'2026-10-01','Reapplying migration is non-destructive');
  await db.query('delete from auth.users where id=$1',[owner]);assert.equal((await db.query('select * from trip_journey_details')).rows.length,0);
 }finally{await db.close();}
});
