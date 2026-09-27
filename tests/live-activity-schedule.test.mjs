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
  const starts = [];
  const source = ts.transpileModule(readFileSync('mobile/src/lib/liveActivity.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  const bridge = {
    isNativePlatform: () => true, isIOSNative: () => true,
    plugin: (name) => name === 'FlightLiveActivity'
      ? { isAvailable: async () => ({ available: true }), startFlightActivity: async value => { starts.push(value); } }
      : { checkPermissions: async () => ({ display: 'denied' }) },
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date })(() => bridge, testModule, testModule.exports);
  return { ...testModule.exports, starts };
}

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
  assert.ok(widget.includes('"Device time" : "Cihaz saati"'));
  assert.ok(!widget.includes('"Flying"') && !widget.includes('"Arrived"') && !widget.includes('checkmark.circle.fill'));
});
