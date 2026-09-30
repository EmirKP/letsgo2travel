import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', esModuleInterop: true } });
const { buildStartPayload, activityArrivalAtMs } = require('../lib/live-activity-cron.ts');
const { liveActivityAps } = require('../lib/push/apns.ts');
const departureAt = '2026-10-10T10:00:00.000Z';
const arrivalAt = '2026-10-10T13:00:00.000Z';
const trip = { id: 'trip', userId: 'user', title: 'London', originIata: 'IST', destinationIata: 'LHR', departureAtMs: Date.parse(departureAt), language: 'en' };

function mobileFixture() {
  const starts = [], ends = [];
  const source = ts.transpileModule(readFileSync('mobile/src/lib/liveActivity.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  const bridge = {
    isNativePlatform: () => true, isIOSNative: () => true,
    plugin: (name) => name === 'FlightLiveActivity'
      ? { isAvailable: async () => ({ available: true }), startFlightActivity: async value => { starts.push(value); }, endFlightActivity: async value => { ends.push(value); } }
      : { checkPermissions: async () => ({ display: 'denied' }) },
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date })(() => bridge, testModule, testModule.exports);
  return { ...testModule.exports, starts, ends };
}

const provider = {
  status: 'EnRoute', updatedAt: '2026-10-10T13:50:00Z', freshUntil: '2026-10-10T14:05:00Z',
  expiresAt: '2026-10-12T14:00:00Z', revisedDepartureAt: '2026-10-10T12:30:00Z',
  revisedArrivalAt: '2026-10-10T15:30:00Z', departureKind: 'actual', arrivalKind: 'estimated',
};
const managed = { id: 'managed', title: 'Flight', departureAt, arrivalAt, status: 'active', provider };

test('An authorized airborne flight stays active until its revised arrival, even after its old schedule ended', async () => {
  const app = mobileFixture();
  const now = new Date('2026-10-10T14:00:00Z');
  assert.equal(app.activitySyncAction(managed, now), 'start');
  await app.syncFlightReminders([managed], now);
  assert.equal(app.starts.length, 1);
  assert.equal(app.starts[0].departureAt, departureAt, 'Original schedule remains distinguishable');
  assert.equal(app.starts[0].revisedArrivalAt, provider.revisedArrivalAt);
  assert.equal(app.starts[0].providerFreshUntil, provider.freshUntil);
  assert.equal(app.plannedReminders([managed], new Date('2026-10-09T14:00:00Z')).length, 0, 'Provider text is never persisted as a scheduled local notification');
});

test('Expired or terminal provider data ends an existing Island; stale revisions cannot prolong its lifetime', async () => {
  const app = mobileFixture();
  const now = new Date('2026-10-10T14:00:00Z');
  for (const change of [{ expiresAt: '2026-10-10T13:59:59Z' }, { expiresAt: 'bad' }, { status: 'Arrived' }, { status: 'Canceled' }, { status: 'Diverted' }, { freshUntil: '2026-10-10T13:59:59Z' }]) {
    const flight = { ...managed, provider: { ...provider, ...change } };
    assert.equal(app.activitySyncAction(flight, now), 'end');
    await app.syncFlightReminders([flight], now);
  }
  assert.equal(app.starts.length, 0);
  assert.equal(app.ends.length, 6);
});

test('Provider admission leaves a 13-hour buffer around the documented 12-hour visible OS lifecycle', async () => {
  const now = new Date('2026-10-10T14:00:00Z');
  for (const [remainingMinutes, expected] of [[779, 'end'], [780, 'start'], [781, 'start']]) {
    const app = mobileFixture();
    const flight = { ...managed, provider: { ...provider, expiresAt: new Date(now.getTime() + remainingMinutes * 60000).toISOString() } };
    assert.equal(app.activitySyncAction(flight, now), expected);
    await app.syncFlightReminders([flight], now);
    assert.equal(app.starts.length, expected === 'start' ? 1 : 0);
    assert.equal(app.ends.length, expected === 'end' ? 1 : 0);
    if (remainingMinutes === 780) assert.equal(app.activitySyncAction(flight, new Date(now.getTime() + 1)), 'end', 'Recheck admission after a delayed call');
  }
  const app = mobileFixture();
  assert.equal(app.activitySyncAction({ ...managed, provider: undefined, arrivalAt: provider.revisedArrivalAt }, now), 'start', 'User-owned ticket data does not require provider retention metadata');
});

test('Clock phase describes a schedule and never treats missing, reversed or invalid arrival as arrived', () => {
  const { scheduledFlightPhase } = mobileFixture();
  assert.equal(scheduledFlightPhase(departureAt, arrivalAt, new Date('2026-10-10T09:59:59Z')), 'waiting');
  assert.equal(scheduledFlightPhase(departureAt, arrivalAt, new Date(departureAt)), 'scheduled-flight');
  assert.equal(scheduledFlightPhase(departureAt, arrivalAt, new Date(arrivalAt)), 'arrival-due');
  for (const arrival of [null, undefined, 'invalid', departureAt, '2026-10-10T09:00:00Z']) {
    assert.equal(scheduledFlightPhase(departureAt, arrival, new Date('2026-10-10T11:00:00Z')), 'arrival-unknown');
  }
});

test('Native reminder bridge preserves both airport zones, flight number and fractional ISO instants', async () => {
  const app = mobileFixture();
  await app.syncFlightReminders([{ id: 'trip', title: 'London', departureAt, arrivalAt, status: 'upcoming', originIata: 'IST', destinationIata: 'LHR', originTimeZone: 'Europe/Istanbul', destinationTimeZone: 'Europe/London', flightNumber: 'TK1979', language: 'en' }], new Date('2026-10-10T09:30:00Z'));
  assert.equal(app.starts.length, 1);
  assert.equal(app.starts[0].departureAt, departureAt);
  assert.equal(app.starts[0].originTimeZone, 'Europe/Istanbul');
  assert.equal(app.starts[0].destinationTimeZone, 'Europe/London');
  assert.equal(app.starts[0].flightNumber, 'TK1979');
  assert.equal(app.starts[0].deepLink, 'letsgo2travel://cockpit?tripId=trip');
});

test('Albanian reminders, native bridge and APNs retain the selected language and schedule', async () => {
  const app = mobileFixture();
  const flight = { id: 'trip', title: 'Tiranë', departureAt, arrivalAt, status: 'upcoming', language: 'sq' };
  const reminders = app.plannedReminders([flight], new Date('2026-10-09T14:00:00Z'));
  assert.equal(reminders[0].title, 'Fluturimi yt po afron');
  assert.ok(reminders[0].body.includes('Tiranë'));
  assert.equal(reminders[0].at.getTime(), Date.parse(departureAt) - 3 * 60 * 60 * 1000);
  await app.syncFlightReminders([flight], new Date('2026-10-10T09:30:00Z'));
  assert.equal(app.starts[0].language, 'sq');
  assert.equal(app.starts[0].arrivalAt, arrivalAt);
  const payload = buildStartPayload({ ...trip, language: 'sq', arrivalAtMs: Date.parse(arrivalAt) });
  assert.equal(payload.alert.title, 'Fluturimi yt po afron ✈️');
  const aps = liveActivityAps(payload, trip.departureAtMs - 60000);
  assert.equal(aps.attributes.language, 'sq');
  assert.equal(aps['stale-date'], (Date.parse(arrivalAt) + 1200000) / 1000);
});

test('Old trips retain bounded activity lifetime without an invented arrival time in APNs', () => {
  const payload = buildStartPayload(trip);
  assert.equal(payload.arrivalAtMs, undefined);
  assert.equal(activityArrivalAtMs(trip), trip.departureAtMs + 3600000);
  const aps = liveActivityAps(payload, trip.departureAtMs - 60000);
  assert.equal('arrivalAt' in aps['content-state'], false);
  assert.equal(aps['stale-date'], (trip.departureAtMs + 3600000) / 1000);
  assert.equal(aps['attributes-type'], 'FlightActivityAttributes');
  assert.equal(aps.attributes.language, 'en');
  assert.ok(!payload.alert.body.includes('3 hours'));
});

test('APNs retains Apple reference date encoding, zones and valid scheduled arrival', () => {
  const payload = buildStartPayload({ ...trip, arrivalAtMs: Date.parse(arrivalAt), originTimeZone: 'Europe/Istanbul', destinationTimeZone: 'Europe/London', flightNumber: 'TK1979' });
  const aps = liveActivityAps(payload, trip.departureAtMs - 60000);
  assert.equal(aps['content-state'].departureAt, (Date.parse(departureAt) - 978307200000) / 1000);
  assert.equal(aps['content-state'].arrivalAt, (Date.parse(arrivalAt) - 978307200000) / 1000);
  assert.equal(aps.attributes.originTimeZone, 'Europe/Istanbul');
  assert.equal(aps.attributes.destinationTimeZone, 'Europe/London');
  assert.equal(aps.attributes.flightNumber, 'TK1979');
  assert.equal(aps['stale-date'], (Date.parse(arrivalAt) + 1200000) / 1000);
});

test('Invalid APNs arrival is omitted for start and end, never converted to a false timestamp', () => {
  for (const arrivalAtMs of [NaN, trip.departureAtMs, trip.departureAtMs - 1]) {
    const aps = liveActivityAps({ event: 'end', tripId: 'trip', departureAtMs: trip.departureAtMs, arrivalAtMs }, trip.departureAtMs);
    assert.equal('arrivalAt' in aps['content-state'], false);
    assert.equal(aps['dismissal-date'], trip.departureAtMs / 1000);
  }
});

test('APNs updates keep source freshness, timestamp ordering and provider expiry separate from the schedule', () => {
  const now = Date.parse('2026-10-10T14:00:00Z');
  const generation = now - 120_000;
  const observation = { status: 'EnRoute', updatedAtMs: Date.parse(provider.updatedAt), freshUntilMs: Date.parse(provider.freshUntil), expiresAtMs: Date.parse(provider.expiresAt), revisedDepartureAtMs: Date.parse(provider.revisedDepartureAt), revisedArrivalAtMs: Date.parse(provider.revisedArrivalAt), departureKind: 'actual', arrivalKind: 'estimated' };
  const aps = liveActivityAps({ event: 'update', timestampMs: generation, departureAtMs: trip.departureAtMs, arrivalAtMs: Date.parse(arrivalAt), provider: observation }, now);
  assert.equal(aps.event, 'update');
  assert.equal(aps.timestamp, generation / 1000, 'A delayed worker does not get a new timestamp');
  assert.equal(aps['stale-date'], observation.freshUntilMs / 1000);
  assert.equal(aps['content-state'].revisedArrivalAt, (observation.revisedArrivalAtMs - 978307200000) / 1000);
  assert.equal(aps['content-state'].departureAt, (trip.departureAtMs - 978307200000) / 1000);
  assert.equal(aps['content-state'].providerStatus, 'EnRoute');
  assert.equal('attributes' in aps, false, 'Update cannot restart an ended activity');
  assert.equal('alert' in aps, false, 'Routine refresh has no distracting alert');
  const ended = liveActivityAps({ event: 'end', timestampMs: generation + 1000, departureAtMs: 0 }, now);
  assert.ok(ended.timestamp > aps.timestamp);
  assert.equal(ended['dismissal-date'], now / 1000);
  assert.equal('providerStatus' in ended['content-state'], false);
});

test('Native source preserves legacy decoding, fractional dates, safe countdowns and schedule updates', () => {
  const attributes = readFileSync('ios/App/FlightActivityWidget/FlightActivityAttributes.swift', 'utf8');
  const widget = readFileSync('ios/App/FlightActivityWidget/FlightActivityWidget.swift', 'utf8');
  const bridge = readFileSync('ios/App/App/FlightLiveActivityPlugin.swift', 'utf8');
  for (const field of ['originTimeZone', 'destinationTimeZone', 'flightNumber']) assert.ok(attributes.includes(`var ${field}: String?`));
  assert.ok(bridge.includes('.withFractionalSeconds'));
  assert.ok(bridge.includes('await existing.update(content)'));
  assert.ok(widget.includes('guard let arrivalAt, arrivalAt > departureAt else { return .arrivalUnknown }'));
  assert.ok(widget.includes('target > timeline.date'));
  assert.ok(widget.includes('TimeZone(identifier: $0)'));
  assert.ok(widget.includes('language.text("Cihaz saati", "Device time", "Ora e pajisjes")'));
  assert.ok(widget.includes('init(_ value: String?) { self = FlightLanguage(rawValue: value ?? "tr") ?? .tr }'), 'Old activities without a language still render in Turkish');
  assert.ok(widget.includes('Locale(identifier: text("tr_TR", "en_GB", "sq_AL"))'));
  assert.ok(widget.includes('formatter.locale = language.locale'));
  assert.ok(widget.includes('environment(\\.locale, readout.language.locale)'));
  assert.ok(bridge.includes('["tr", "en", "sq"].contains(call.getString("language") ?? "")'));
  for (const label of ['Nisja sipas orarit', 'Mbërritja sipas orarit', 'Statusi duhet përditësuar', 'Hap udhëtimin për ta rifreskuar', 'Fluturimi yt']) assert.ok(widget.includes(label), label);
  assert.ok(!widget.includes('"Flying"') && !widget.includes('"Arrived"') && !widget.includes('checkmark.circle.fill'));
});
