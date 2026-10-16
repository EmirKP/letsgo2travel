import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, moduleTypes: { '**': 'cjs' }, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const model = require('../mobile/src/lib/mapJourney.ts');
const build72 = require('./fixtures/map-journey-build72.ts');
function place(number = 1, overrides = {}) {
  return { id: `node/${number}`, name: `Rome place ${number}`, category: 'boutique', group: 'shopping', kind: 'boutique',
    latitude: 41.9 + number / 10000, longitude: 12.5 + number / 10000, hours: null, address: 'Rome', website: null,
    free: null, accessible: null, description: null, representedCountry: null,
    sourceUrl: `https://www.openstreetmap.org/node/${number}`, fetchedAt: new Date().toISOString(), ...overrides };
}
function create(overrides = {}) { return model.createMapJourney({ city: 'Roma', center: { latitude: 41.9028, longitude: 12.4964 }, dayCount: 3, startDate: '2026-10-13', ...overrides }); }
function expandedJourney() {
  let journey = create({ dayCount: 2, firstDayStartTime: '14:30', interests: ['city', 'sea', 'adventure', 'food'] });
  journey = model.addJourneyStop(journey, place(91, { name: 'Actual beach', category: 'beach', kind: 'beach', group: 'nature' }), 1, { fixedTime: '15:30', note: 'Keep my note' });
  journey = model.addJourneyStop(journey, place(92, { name: 'Actual trail', category: 'hiking', kind: 'hiking', group: 'nature' }), 2);
  journey.planning = { preferences: { party: 'solo', budget: 'moderate', pace: 'balanced', walking: 'standard', interests: [...journey.interests], notes: 'Coast and trails' },
    locale: 'en', summary: 'A coastal itinerary', limitations: [], fetchedAt: journey.createdAt, attribution: 'OpenStreetMap', generatedBy: 'ai',
    days: [{ day: 1, theme: 'Coast', explanation: 'Sea views' }, { day: 2, theme: 'Nature', explanation: 'Walking outdoors' }] };
  assert.equal(model.validateMapJourney(journey), true);
  return journey;
}
function leg(from, to, overrides = {}) { return { fromId: from.id, toId: to.id, mode: 'walking', durationMinutes: 12, sourceUrl: 'https://openrouteservice.org/', fetchedAt: new Date().toISOString(), ...overrides }; }
function harness() {
  const data = new Map(); let failRead = false, failWrite = false;
  const localStorage = { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null,
    getItem: key => { if (failRead) throw new Error('disabled'); return data.get(key) ?? null; },
    setItem: (key, value) => { if (failWrite) throw new Error('quota'); data.set(key, String(value)); },
    removeItem: key => { if (failWrite) throw new Error('quota'); data.delete(key); } };
  const window = new EventTarget(); Object.assign(window, { localStorage, setTimeout });
  globalThis.window = window; globalThis.localStorage = localStorage;
  const storage = require('../mobile/src/lib/mapJourneyStorage.ts');
  return { storage, data, localStorage, failRead: () => { failRead = true; }, failWrite: () => { failWrite = true; } };
}

test('Rome three-day itinerary adds a genuine shop on day two, moves, undoes, saves and reopens with all source fields', () => {
  const h = harness();
  const initial = create({ accommodation: { latitude: 41.9, longitude: 12.49, name: 'Chosen hotel' }, budgetNote: '€60 / day' });
  const added = model.addJourneyStop(initial, place(), 2, { note: 'Gift for home', durationMinutes: 45, sourceUrl: 'https://example.org/my-guide', fixedTime: '15:30', priority: 'high' });
  const moved = model.moveJourneyStop(added, added.stops[0].id, 3);
  assert.equal(moved.stops[0].day, 3);
  assert.equal(added.stops[0].day, 2);
  assert.equal(initial.stops.length, 0);
  const undo = added;
  assert.equal(h.storage.saveMapJourney(undo).status, 'device');
  const reopened = h.storage.readMapJourneys();
  assert.equal(reopened.error, null);
  assert.deepEqual(reopened.items, [undo]);
  assert.equal(reopened.items[0].stops[0].sourceUrl, 'https://example.org/my-guide');
  assert.equal(reopened.items[0].stops[0].place.address, 'Rome');
  assert.equal(reopened.items[0].stops[0].fixedTime, '15:30');
});

test('Stop identity deduplicates across days; immutable reorder, move and removal preserve independent snapshots', () => {
  let original = create();
  for (let i = 1; i <= 3; i++) original = model.addJourneyStop(original, place(i), 1);
  assert.equal(model.addJourneyStop(original, place(1, { name: 'Changed' }), 2), original);
  const reordered = model.reorderJourneyStop(original, original.stops[2].id, -1);
  assert.deepEqual(model.journeyDayStops(reordered, 1).map(stop => stop.place.id), ['node/1', 'node/3', 'node/2']);
  assert.deepEqual(model.journeyDayStops(original, 1).map(stop => stop.place.id), ['node/1', 'node/2', 'node/3']);
  const moved = model.moveJourneyStop(reordered, original.stops[2].id, 2);
  assert.equal(model.journeyDayStops(moved, 2)[0].order, 0);
  assert.deepEqual(model.journeyDayStops(moved, 1).map(stop => stop.order), [0, 1]);
  const removed = model.removeJourneyStop(moved, original.stops[0].id);
  assert.equal(removed.stops.length, 2);
  assert.equal(moved.stops.length, 3);
  assert.throws(() => model.moveJourneyStop(original, original.stops[0].id, 0), /invalid/);
  assert.throws(() => model.updateJourneyStop(original, original.stops[0].id, { fixedTime: '25:00' }), /invalid/);
});

test('Optimisation uses real comparable legs and preserves reservation and high-priority anchors exactly', () => {
  let j = create({ center: { latitude: 41.9001, longitude: 12.5001 } });
  j = model.addJourneyStop(j, place(1), 1, { fixedTime: '09:30' });
  j = model.addJourneyStop(j, place(2), 1);
  j = model.addJourneyStop(j, place(3), 1);
  j = model.addJourneyStop(j, place(4), 1, { priority: 'high' });
  const result = model.optimizeJourney(j, 1, [leg(j.stops[0], j.stops[1], { durationMinutes: 40 }), leg(j.stops[0], j.stops[2], { durationMinutes: 5 })]);
  const ordered = model.journeyDayStops(result, 1);
  assert.deepEqual(ordered.map(stop => stop.place.id), ['node/1', 'node/3', 'node/2', 'node/4']);
  assert.equal(ordered[0].fixedTime, '09:30');
  assert.equal(ordered[3].priority, 'high');
  assert.equal(j.stops[1].place.id, 'node/2');
});

test('Optimisation retains an existing feasible order when geographic sorting would miss opening hours', () => {
  let j = create({ center: { latitude: 41.9, longitude: 12.5 } });
  j = model.addJourneyStop(j, place(50, { hours: 'Tu 09:00-10:00' }), 1, { durationMinutes: 60 });
  j = model.addJourneyStop(j, place(1, { hours: '24/7' }), 1, { durationMinutes: 120 });
  assert.deepEqual(model.journeyDayStops(model.optimizeJourney(j, 1), 1).map(stop => stop.place.id), ['node/50', 'node/1']);
});

test('Scheduler uses provider legs, flags unknown/stale travel, and never manufactures a walking duration', () => {
  let j = model.addJourneyStop(create(), place(1, { hours: '24/7' }), 1);
  j = model.addJourneyStop(j, place(2, { hours: '24/7' }), 1);
  const unknown = model.scheduleJourneyDay(j, 1);
  assert.equal(unknown.stops[1].travelMinutes, null);
  assert.equal(unknown.stops[1].timing, 'provisional');
  assert.ok(unknown.stops[1].issues.includes('travel-unknown'));
  const known = model.scheduleJourneyDay(j, 1, [leg(j.stops[0], j.stops[1], { durationMinutes: 12.4 })]);
  assert.equal(known.stops[1].startMinutes, 9 * 60 + 60 + 13);
  assert.equal(known.stops[1].timing, 'confirmed');
  for (const bad of [{ mode: 'driving' }, { durationMinutes: -1 }, { fetchedAt: '2020-01-01T00:00:00.000Z' }, { sourceUrl: 'javascript:alert(1)' }]) {
    assert.equal(model.scheduleJourneyDay(j, 1, [leg(j.stops[0], j.stops[1], bad)]).stops[1].travelMinutes, null);
  }
});

test('Reservations retain their exact time with conflict, hours and day-overflow warnings; breaks reserve real space', () => {
  let j = model.addJourneyStop(create({ pace: 'relaxed' }), place(1, { hours: 'Tu 10:00-13:00' }), 1, { durationMinutes: 180 });
  j = model.addJourneyStop(j, place(2, { hours: 'Mo 09:00-17:00; Tu off' }), 1, { fixedTime: '12:00', durationMinutes: 360 });
  j = model.addJourneyStop(j, place(3, { hours: 'PH off; sunrise-sunset' }), 1, { durationMinutes: 60 });
  const result = model.scheduleJourneyDay(j, 1, [leg(j.stops[0], j.stops[1]), leg(j.stops[1], j.stops[2])]);
  assert.equal(result.stops[0].startMinutes, 600);
  assert.equal(result.stops[1].startMinutes, 720);
  assert.ok(result.stops[1].issues.includes('reservation-conflict'));
  assert.ok(result.stops[1].issues.includes('closed'));
  assert.ok(result.stops[1].issues.includes('outside-day'));
  assert.ok(result.stops[2].issues.includes('hours-unknown'));
  assert.ok(result.breaks.some(item => item.kind === 'meal' && item.durationMinutes === 45));
});

test('Generation groups actual places across three days, deduplicates, respects pace, and retains existing reservations', () => {
  const original = model.addJourneyStop(create({ pace: 'relaxed' }), place(10), 3, { fixedTime: '11:00' });
  const result = model.generateJourneyDays(original, [1, 2, 3, 4, 5, 6, 1].map(n => place(n)));
  assert.equal(result.stops.length, 7);
  assert.deepEqual([1, 2, 3].map(day => model.journeyDayStops(result, day).length), [2, 2, 3]);
  assert.equal(result.stops.find(stop => stop.place.id === 'node/10').fixedTime, '11:00');
  assert.equal(result.stops.find(stop => stop.place.id === 'node/10').day, 3);
  assert.equal(result.stops.find(stop => stop.place.id === 'node/1').durationMinutes, 75);
});

test('Generation moves a closed-day suggestion to a feasible day and considers actual travel time when known', () => {
  const j = create({ dayCount: 2, startDate: '2026-10-13' });
  const generated = model.generateJourneyDays(j, [place(1, { hours: 'Tu off; We 09:00-17:00' })]);
  assert.equal(generated.stops[0].day, 2);
  let base = model.addJourneyStop(create({ dayCount: 2, pace: 'relaxed' }), place(2, { hours: '24/7' }), 1, { durationMinutes: 390 });
  const real = { fromId: 'node/2', toId: 'node/3', mode: 'walking', durationMinutes: 60, sourceUrl: 'https://openrouteservice.org/', fetchedAt: new Date().toISOString() };
  base = model.generateJourneyDays(base, [place(3, { hours: '24/7' })], [real]);
  assert.equal(base.stops.find(stop => stop.place.id === 'node/3').day, 2);
});

test('Accommodation actually seeds geographic grouping and day order, including across the date line', () => {
  const west = place(1, { latitude: 41.9, longitude: 12.4 });
  const east = place(2, { latitude: 41.9, longitude: 12.6 });
  const base = create({ dayCount: 2, center: { latitude: 41.9, longitude: 12.4 } });
  const hotel = create({ dayCount: 2, center: { latitude: 41.9, longitude: 12.4 }, accommodation: { name: 'Chosen stay', latitude: 41.9, longitude: 12.6 } });
  assert.equal(model.journeyDayStops(model.generateJourneyDays(base, [west, east]), 1)[0].place.id, west.id);
  assert.equal(model.journeyDayStops(model.generateJourneyDays(hotel, [west, east]), 1)[0].place.id, east.id);
  const island = create({ city: 'Island', dayCount: 1, center: { latitude: -16, longitude: 179.9 } });
  const nearAcrossDateLine = place(3, { latitude: -16, longitude: -179.9 });
  const fartherSameSide = place(4, { latitude: -16, longitude: 178 });
  const generated = model.generateJourneyDays(island, [fartherSameSide, nearAcrossDateLine]);
  assert.equal(model.journeyDayStops(generated, 1)[0].place.id, nearAcrossDateLine.id);
  assert.equal(model.scheduleJourneyDay(generated, 1).stops[1].travelMinutes, null, 'Geographic proximity must never invent a walking time');
});

test('Unsupported or overlapping hours stay unknown even after a closed-day rule, while separate weekdays remain useful', () => {
  for (const hours of ['Tu off; PH 10:00-17:00', 'Mo-Su 09:00-17:00; Tu 12:00-16:00', 'Tu off; Tu 12:00-16:00']) {
    const j = model.addJourneyStop(create({ startDate: '2026-10-13' }), place(1, { hours }), 1);
    const schedule = model.scheduleJourneyDay(j, 1);
    assert.ok(schedule.stops[0].issues.includes('hours-unknown'));
    assert.equal(schedule.stops[0].issues.includes('closed'), false);
  }
  const j = model.addJourneyStop(create(), place(1, { hours: 'Mo 09:00-17:00; Tu 10:00-12:00,13:00-16:00; We off' }), 1);
  assert.equal(model.scheduleJourneyDay(j, 1).stops[0].startMinutes, 600);
  assert.throws(() => model.scheduleJourneyDay(j, 0), /invalid/);
});

test('Saved route integration preserves legacy records; account writes are queued only for the exact owner', () => {
  const h = harness(); const j = model.addJourneyStop(create(), place(), 2);
  const legacy = { id: 'route-legacy', createdAt: '2026-10-01T00:00:00.000Z', input: {}, plan: { summary: 'Old', routes: [{ name: 'Old route', dailyPlan: ['Old notes'] }] } };
  h.data.set('l2t.mobile.saved-routes.v1.guest', JSON.stringify([legacy]));
  h.storage.saveMapJourney(j);
  assert.deepEqual(JSON.parse(h.data.get('l2t.mobile.saved-routes.v1.guest'))[1], legacy);
  assert.equal(model.mapJourneyFromSavedRoute(legacy), null);
  assert.equal(h.storage.saveMapJourney(j, 'account-a').status, 'queued');
  assert.equal(h.storage.readMapJourneys('account-a').items.length, 1);
  assert.equal(h.storage.readMapJourneys('account-b').items.length, 0);
  const box = JSON.parse(h.data.get('l2t.mobile.route-outbox.v1.account-a'));
  assert.equal(box[j.id].pending, true);
  assert.deepEqual(box[j.id].route.plan.routes[0].mapJourney, j);
  assert.throws(() => h.storage.saveMapJourney(j, 'account/a'), /invalid_owner/);
  assert.equal(h.storage.readMapJourneys('accounta').items.length, 0);
});

test('New coastal plans remain readable beside existing plans in the frozen build72 library, without changing account scope', () => {
  const h = harness(), owner = 'account-a';
  const existing = model.addJourneyStop(create(), place(), 2), expanded = expandedJourney(), original = structuredClone(expanded);
  const rawIncompatible = model.mapJourneyToSavedRoute(expanded);
  rawIncompatible.plan.routes[0].mapJourney = expanded;
  assert.equal(build72.validateMapJourney(expanded), false);
  assert.throws(() => build72.inspectSavedRoutes([model.mapJourneyToSavedRoute(existing), rawIncompatible]), /corrupt/,
    'One incompatible map really does reject the old reader’s whole map library');
  h.storage.saveMapJourney(existing, owner);
  h.storage.saveMapJourney(expanded, owner);
  const stored = JSON.parse(h.data.get(`l2t.mobile.saved-routes.v1.user-${owner}`));
  const queued = JSON.parse(h.data.get(`l2t.mobile.route-outbox.v1.${owner}`));
  assert.doesNotThrow(() => build72.inspectSavedRoutes(stored));
  assert.doesNotThrow(() => build72.inspectSavedRoutes(Object.values(queued).map(entry => entry.route)));
  assert.equal(stored.length, 2);
  assert.equal(stored[0].id, expanded.id);
  assert.equal(stored[0].createdAt, expanded.createdAt);
  assert.equal(stored[0].plan.routes[0].mapJourney.firstDayStartTime, '14:30');
  assert.deepEqual(h.storage.readMapJourneys(owner).items, [expanded, existing]);
  assert.deepEqual(h.storage.readMapJourneys('account-b'), { items: [], error: null });
  assert.deepEqual(expanded, original, 'Serialization cannot alter the current editor');
  assert.deepEqual(model.encodeStoredMapJourney(stored[0].plan.routes[0].mapJourney), stored[0].plan.routes[0].mapJourney, 'Repeated storage boundaries preserve exact optional detail');
});

test('Old-client edits retain precise new categories while stale metadata cannot restore removed stops or replaced preferences', () => {
  const original = expandedJourney(), stored = model.encodeStoredMapJourney(original);
  stored.stops[0].note = 'Edited by the older app';
  stored.updatedAt = '2026-10-16T12:00:00.000Z';
  const reopened = model.decodeStoredMapJourney(stored);
  assert.equal(reopened.stops[0].place.category, 'beach');
  assert.equal(reopened.stops[0].note, 'Edited by the older app');
  assert.equal(reopened.updatedAt, stored.updatedAt);
  assert.equal(reopened.id, original.id);
  assert.equal(reopened.createdAt, original.createdAt);
  assert.deepEqual(reopened.planning.preferences.interests, original.planning.preferences.interests);
  stored.stops.splice(1, 1);
  stored.stops[0].place = place(99, { category: 'attraction', kind: 'attraction', group: 'culture' });
  stored.planning.preferences.interests = ['food'];
  assert.equal(build72.validateMapJourney(stored), true);
  const afterOldEdit = model.decodeStoredMapJourney(stored);
  assert.equal(afterOldEdit.stops.length, 1);
  assert.equal(afterOldEdit.stops[0].place.id, 'node/99');
  assert.equal(afterOldEdit.stops[0].place.category, 'attraction');
  assert.deepEqual(afterOldEdit.planning.preferences.interests, ['food']);
  assert.equal(model.decodeStoredMapJourney({ ...stored, stops: [{ ...stored.stops[0], place: { ...stored.stops[0].place, category: 'museum' } }] }).stops[0].place.category, 'museum');
  assert.deepEqual(model.decodeStoredMapJourney(model.encodeStoredMapJourney(afterOldEdit)), afterOldEdit);
});

test('Malformed optional saved detail cannot invent categories, preferences, or bypass source and coordinate validation', () => {
  const original = model.encodeStoredMapJourney(expandedJourney());
  const base = structuredClone(original); delete base.storageDetails;
  const edits = [
    detail => { detail.version = 99; },
    detail => { detail.places[0].category = 'invented'; },
    detail => { detail.places[0].fallback = 'park'; },
    detail => { detail.places.push({ ...detail.places[0] }); },
    detail => { detail.interests.selected = ['sea', 'unknown']; },
    detail => { detail.interests.fallback = ['food']; },
  ];
  for (const edit of edits) {
    const malformed = structuredClone(original); edit(malformed.storageDetails);
    assert.equal(build72.validateMapJourney(malformed), true, 'Optional metadata is ignored by the installed build');
    assert.deepEqual(model.decodeStoredMapJourney(malformed), base, 'Invalid metadata leaves the valid canonical plan readable');
  }
  for (const mutation of [j => { j.stops[0].place.sourceUrl = 'javascript:alert(1)'; }, j => { j.stops[0].place.latitude = 100; }, j => { j.version = 2; }]) {
    const invalid = structuredClone(original); mutation(invalid);
    assert.equal(model.decodeStoredMapJourney(invalid), null);
  }
});

test('Map save passes the real account service validation and round-trips without dropping shop or reservation data', async () => {
  const h = harness(); let remote = []; const sent = [];
  const owner = '10000000-0000-4000-8000-000000000001';
  const other = '20000000-0000-4000-8000-000000000002';
  let j = model.addJourneyStop(create(), place(), 2, { fixedTime: '14:45', note: 'Keep this note' });
  for (let number = 2; number <= 11; number++) j = model.addJourneyStop(j, place(number), (number % 3) + 1);
  h.storage.saveMapJourney(j, owner);
  // Use the real validator, RPC serializer and response normalizer. Stubbing
  // upsertUserTrip itself previously concealed the empty-destination failure.
  const serviceSource = ts.transpileModule(readFileSync('mobile/src/lib/supabaseData.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const serviceModule = { exports: {} };
  const serviceImports = {
    './api': { ApiError: class extends Error {}, requestJson: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(options.headers.Authorization, 'Bearer session-token');
      if (parsed.pathname.endsWith('/rpc/upsert_mobile_user_trip')) {
        const body = options.body; sent.push(body);
        assert.equal(body.p_destination, 'Roma');
        assert.equal(body.p_trip_data.plan.routes[0].country, '', 'No country should be fabricated');
        assert.ok(Buffer.byteLength(JSON.stringify(body.p_trip_data)) < 100000);
        remote = [{ id: 1, user_id: owner, title: body.p_title, destination: body.p_destination, trip_data: body.p_trip_data, created_at: j.createdAt }];
        return remote;
      }
      assert.equal(parsed.pathname, '/rest/v1/user_trips');
      assert.equal(parsed.searchParams.get('trip_data->>mobile_kind'), 'eq.route_plan');
      return remote.filter(row => `eq.${row.user_id}` === parsed.searchParams.get('user_id'));
    } },
    './config': { config: { supabaseUrl: 'https://account.invalid', supabaseAnonKey: 'public-key' }, isSupabaseConfigured: () => true },
    './dates': {}, './i18n': { localeFromStorage: () => 'en' }, './id': {}, './flightSelection': {},
  };
  vm.runInNewContext(`(function(require,module,exports){${serviceSource}\n})`, { URLSearchParams })(name => {
    if (Object.hasOwn(serviceImports, name)) return serviceImports[name];
    throw Error(`Unexpected service import ${name}`);
  }, serviceModule, serviceModule.exports);
  const source = ts.transpileModule(readFileSync(new URL('../mobile/src/lib/routeSync.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fixtureModule = { exports: {} };
  const load = name => {
    if (name === './storage') return require('../mobile/src/lib/storage.ts');
    if (name === './routeOutbox') return require('../mobile/src/lib/routeOutbox.ts');
    if (name === './accountResume') return { onAccountResume: () => () => {} };
    if (name === './supabaseData') return serviceModule.exports;
    throw Error(`Unexpected import ${name}`);
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { window: globalThis.window, setTimeout, clearTimeout, console })(load, fixtureModule, fixtureModule.exports);
  await fixtureModule.exports.syncSavedRoutes(owner, 'session-token');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].p_trip_data.plan.routes[0].mapJourney, j);
  assert.equal(JSON.parse(h.data.get(`l2t.mobile.route-outbox.v1.${owner}`))[j.id].pending, false);
  h.data.delete(`l2t.mobile.saved-routes.v1.user-${owner}`); h.data.delete(`l2t.mobile.route-outbox.v1.${owner}`);
  await fixtureModule.exports.syncSavedRoutes(owner, 'session-token');
  assert.deepEqual(h.storage.readMapJourneys(owner).items, [j]);
  await fixtureModule.exports.syncSavedRoutes(other, 'session-token');
  assert.equal(h.storage.readMapJourneys(other).items.length, 0);
  assert.deepEqual(JSON.parse(h.data.get(`l2t.mobile.saved-routes.v1.user-${other}`) || '[]'), []);
  assert.deepEqual(h.storage.readMapJourneys(owner).items, [j]);
});

test('Corrupt/future documents and unavailable or full storage never overwrite old routes or announce success', () => {
  for (const raw of ['{oops', JSON.stringify({ version: 2 }), JSON.stringify([{ id: 'bad', plan: { routes: [{ mapJourney: { version: 2 } }] } }])]) {
    const h = harness(); h.data.set('l2t.mobile.saved-routes.v1.guest', raw);
    assert.equal(h.storage.readMapJourneys().error, 'corrupt');
    assert.throws(() => h.storage.saveMapJourney(create()), /corrupt/);
    assert.equal(h.data.get('l2t.mobile.saved-routes.v1.guest'), raw);
  }
  const h = harness(); const j = create(); h.storage.saveMapJourney(j);
  const before = h.data.get('l2t.mobile.saved-routes.v1.guest'); h.failWrite();
  assert.throws(() => h.storage.saveMapJourney(model.addJourneyStop(j, place(), 1)), /quota/);
  assert.equal(h.data.get('l2t.mobile.saved-routes.v1.guest'), before);
  h.failRead(); assert.equal(h.storage.readMapJourneys().error, 'unavailable');
});

test('Re-saving a deleted account journey creates a new nested identity without resurrecting its tombstone', () => {
  const h = harness(); const j = create(); h.storage.saveMapJourney(j, 'owner');
  require('../mobile/src/lib/storage.ts').deleteRoutePlan(j.id, 'owner');
  const result = h.storage.saveMapJourney(j, 'owner');
  assert.notEqual(result.journey.id, j.id);
  const box = JSON.parse(h.data.get('l2t.mobile.route-outbox.v1.owner'));
  assert.equal(box[j.id].kind, 'delete');
  assert.equal(box[result.journey.id].route.plan.routes[0].mapJourney.id, result.journey.id);
  assert.deepEqual(h.storage.readMapJourneys('owner').items, [result.journey]);
});

test('Discovery shops save in existing bookmarks with address and group; malformed optional metadata is rejected', () => {
  harness(); const api = require('../mobile/src/lib/savedPlaces.ts');
  api.saveTravelPlace(place(), 'owner');
  assert.equal(api.readSavedPlaces('owner').items[0].place.address, 'Rome');
  assert.equal(api.readSavedPlaces('owner').items[0].place.group, 'shopping');
  assert.equal(api.readSavedPlaces('owner').pending, 1);
  assert.equal(api.readSavedPlaces('other').items.length, 0);
  assert.throws(() => api.saveTravelPlace(place(2, { group: 'fake-local-favorite' }), 'owner'), /invalid/);
  assert.throws(() => api.saveTravelPlace(place(2, { address: 'x'.repeat(501) }), 'owner'), /invalid/);
  assert.equal(api.readSavedPlaces('owner').items.length, 1);
});

test('Verified photo and attribution survive journey editing, save/reopen and both bookmark stores without changing photo-free records', () => {
  const h = harness(), bookmarks = require('../mobile/src/lib/savedPlaces.ts');
  const photo = { imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Rome.jpg/160px-Rome.jpg',
    imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Rome.jpg', imageAttribution: 'Jane Doe',
    imageLicenseLabel: 'CC BY-SA 4.0', imageLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
  const photographed = place(1, photo), original = model.addJourneyStop(create(), photographed, 2);
  const moved = model.moveJourneyStop(original, original.stops[0].id, 3);
  h.storage.saveMapJourney(moved);
  assert.deepEqual(h.storage.readMapJourneys().items[0].stops[0].place, photographed);
  for (const owner of [undefined, 'photo-owner']) {
    bookmarks.saveTravelPlace(photographed, owner);
    assert.deepEqual(bookmarks.readSavedPlaces(owner).items[0].place, photographed);
    assert.throws(() => bookmarks.saveTravelPlace(place(2, { ...photo, imageAttribution: undefined }), owner), /invalid/);
    assert.equal(bookmarks.readSavedPlaces(owner).items.length, 1);
  }
  assert.equal(model.validateJourneyPlace(place(2)), true);
  for (const patch of [{ imageUrl: 'https://evil.test/a.jpg' }, { imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Other.jpg' },
    { imageLicenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/' }, { imageAttribution: undefined }, { imageLicenseLabel: 'Public domain' }]) {
    assert.equal(model.validateJourneyPlace(place(3, { ...photo, ...patch })), false);
  }
});

test('Unnamed essentials remain usable without inventing a business name', () => {
  const j = model.addJourneyStop(create(), place(1, { name: '', category: 'atm', group: 'essentials', kind: 'atm' }), 1);
  assert.equal(j.stops[0].place.name, '');
  assert.match(model.mapJourneyToSavedRoute(j, 'en').plan.routes[0].dailyPlan[0], /ATM/);
});

test('Unsafe URLs, invalid coordinates, duplicated identities and unsupported versions cannot enter saved journeys', () => {
  const j = model.addJourneyStop(create(), place(), 1);
  for (const mutate of [
    value => { value.version = 2; }, value => { value.stops.push(value.stops[0]); },
    value => { value.stops[0].place.latitude = '41.9'; }, value => { value.stops[0].sourceUrl = 'javascript:alert(1)'; },
    value => { value.stops[0].place.sourceUrl = 'https://phishing.invalid'; }, value => { value.stops[0].order = 2; },
    value => { value.startDate = '2026-02-31'; }, value => { value.dayCount = 0; },
  ]) { const broken = structuredClone(j); mutate(broken); assert.equal(model.validateMapJourney(broken), false); }
});


test('Restaurant and café visits already supply a meal or rest, without adjacent automatic breaks', () => {
  let journey = create({ firstDayStartTime: '11:00' });
  journey = model.addJourneyStop(journey, place(201), 1, { durationMinutes: 60 });
  journey = model.addJourneyStop(journey, place(202, { category: 'restaurant', group: 'food' }), 1, { durationMinutes: 90 });
  journey = model.addJourneyStop(journey, place(203), 1, { durationMinutes: 60 });
  const schedule = model.scheduleJourneyDay(journey, 1);
  assert.equal(schedule.breaks.length, 0, 'The restaurant supplies lunch; no extra break immediately before or after it');
  assert.equal(schedule.stops[2].startMinutes, 13 * 60 + 30);
  const cafe = model.updateJourneyStop(journey, journey.stops[1].id, { durationMinutes: 30 });
  cafe.stops[1].place.category = 'cafe';
  assert.equal(model.scheduleJourneyDay(cafe, 1).breaks.length, 0);
  let ordinary = create();
  for (let index = 1; index <= 4; index++) ordinary = model.addJourneyStop(ordinary, place(index), 1, { durationMinutes: 90 });
  assert.ok(model.scheduleJourneyDay(ordinary, 1).breaks.some(item => item.kind === 'meal'), 'Meals remain reserved when there is no actual food stop');
});

test('Chosen first-day time survives save/reopen, later days start at nine, and earlier reservations remain flagged', () => {
  const h = harness();
  let journey = create({ firstDayStartTime: '15:30' });
  journey = model.addJourneyStop(journey, place(211), 1);
  journey = model.addJourneyStop(journey, place(212), 2);
  assert.equal(model.scheduleJourneyDay(journey, 1).stops[0].startMinutes, 15 * 60 + 30);
  assert.equal(model.scheduleJourneyDay(journey, 2).stops[0].startMinutes, 9 * 60);
  h.storage.saveMapJourney(journey);
  assert.equal(h.storage.readMapJourneys().items[0].firstDayStartTime, '15:30');
  const conflict = model.updateJourneyStop(journey, journey.stops[0].id, { fixedTime: '10:00' });
  assert.ok(model.scheduleJourneyDay(conflict, 1).issues.includes('reservation-conflict'));
  assert.ok(model.scheduleJourneyDay(conflict, 1).issues.includes('outside-day'));
  for (const invalid of ['24:00', '22:01', '9:30', 930, true]) assert.throws(() => create({ firstDayStartTime: invalid }));
  assert.equal(model.scheduleJourneyDay(model.addJourneyStop(create(), place(213), 1), 1).stops[0].startMinutes, 540);
});

test('reorder, duration and day changes preserve exact AI note language across save/reopen without trusting manually edited notes', () => {
  const h = harness();
  let journey = expandedJourney();
  const id = journey.stops[0].id;
  journey = model.moveJourneyStop(journey, journey.stops[1].id, 1);
  journey = model.reorderJourneyStop(journey, id, 1);
  journey = model.updateJourneyStop(journey, id, { durationMinutes: 75, note: 'Keep my note' });
  assert.equal(journey.planning.edited, true);
  assert.equal(model.journeyStopNoteLocale(journey, journey.stops.find(stop => stop.id === id)), 'en');
  h.storage.saveMapJourney(journey);
  const reopened = h.storage.readMapJourneys().items[0];
  const savedStop = reopened.stops.find(stop => stop.id === id);
  assert.equal(model.journeyStopNoteLocale(reopened, savedStop), 'en');
  assert.equal(build72.validateMapJourney(model.encodeStoredMapJourney(reopened)), true, 'Optional metadata must remain readable by installed v1 builds');
  const edited = model.updateJourneyStop(reopened, id, { note: 'Artık Türkçe yazdığım kişisel not' });
  assert.equal(model.journeyStopNoteLocale(edited, edited.stops.find(stop => stop.id === id)), undefined);
  assert.equal(edited.stops.find(stop => stop.id === id).noteOrigin, undefined);
  const olderClient = structuredClone(reopened);
  olderClient.stops.find(stop => stop.id === id).note = 'Older client changed this text';
  assert.equal(model.journeyStopNoteLocale(olderClient, olderClient.stops.find(stop => stop.id === id)), undefined, 'Unchanged metadata cannot mislabel text edited by an older client');
  assert.equal(model.journeyStopNoteLocale(reopened, savedStop), 'en', 'Editing a copy never mutates the saved record');
});
