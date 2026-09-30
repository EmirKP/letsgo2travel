import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const now = Date.parse('2026-09-27T08:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const owner = '10000000-0000-4000-8000-000000000001';
const managedId = '20000000-0000-4000-8000-000000000001';
const manualId = '20000000-0000-4000-8000-000000000002';
const otherId = '20000000-0000-4000-8000-000000000003';
const accessToken = 'UNIT_TEST_SESSION';
const receipt = 'NONFUNCTIONAL_SIGNED_SELECTION_FIXTURE';
const expiresAt = '2026-10-02T08:00:00.000Z';
const plain = value => JSON.parse(JSON.stringify(value));
class ApiError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
}

// Production data/parser modules run in a fresh context for each case. Only
// network, public configuration and locale/ID boundaries are replaced.
function harness() {
  const calls = [];
  const state = { baseRows: [tripRow()], details: [detailRow()], createResponse: { trip: tripRow(), flight: flight(), expiresAt }, refreshResponse: { protocol: 3, trip: tripRow(), flight: flight(), expiresAt, refreshAfterSeconds: 300 }, refreshError: null, createError: null, detailError: null };
  const cache = new Map();
  const overrides = {
    './api': { ApiError, requestJson: async (url, options = {}) => {
      calls.push({ url, options: plain(options) });
      const endpoint = new URL(url, 'https://app.example').pathname;
      if (endpoint === '/api/cockpit/flight-trips/refresh') {
        if (state.refreshError) throw state.refreshError;
        return structuredClone(state.refreshResponse);
      }
      if (endpoint === '/api/cockpit/flight-trips') {
        if (state.createError) throw state.createError;
        return structuredClone(state.createResponse);
      }
      if (endpoint === '/rest/v1/rpc/read_cockpit_flight_details') {
        if (state.detailError) throw state.detailError;
        return structuredClone(state.details);
      }
      if (endpoint === '/rest/v1/trips' && (!options.method || options.method === 'GET')) return structuredClone(state.baseRows);
      throw new Error(`Unexpected data request: ${options.method || 'GET'} ${endpoint}`);
    } },
    './config': { config: { apiBaseUrl: 'https://app.example', supabaseUrl: 'https://unit-test.supabase.co', supabaseAnonKey: 'PUBLIC_FIXTURE_KEY' }, isSupabaseConfigured: true },
    './i18n': { localeFromStorage: () => 'en' }, './id': { createId: () => otherId },
  };
  const context = vm.createContext({ URL, URLSearchParams, Date: Clock, Intl, console, setTimeout, clearTimeout });
  const load = filename => {
    let full = path.resolve(filename);
    if (!existsSync(full)) full = ['.ts', '.tsx', '.json'].map(extension => full + extension).find(existsSync) || full;
    if (cache.has(full)) return cache.get(full).exports;
    const output = { exports: {} }; cache.set(full, output);
    if (full.endsWith('.json')) return (output.exports = JSON.parse(readFileSync(full, 'utf8')));
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: full })(name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      return name.startsWith('.') ? load(path.resolve(path.dirname(full), name)) : require(name);
    }, output, output.exports);
    return output.exports;
  };
  return { calls, state, api: load('mobile/src/lib/supabaseData.ts') };
}
function flight() {
  return {
    id: 'TK1985:IST:LHR:2026-09-28T09:00:00.000Z', flightNumber: 'TK1985', airline: 'Fixture Airline', source: 'AeroDataBox', fetchedAt: new Date(now).toISOString(),
    origin: { iata: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Türkiye', countryCode: 'TR', timeZone: 'Europe/Istanbul' },
    destination: { iata: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'United Kingdom', countryCode: 'GB', timeZone: 'Europe/London' },
    departureAt: '2026-09-28T09:00:00.000Z', arrivalAt: '2026-09-28T13:00:00.000Z', departureDate: '2026-09-28', departureTime: '12:00', arrivalDate: '2026-09-28', arrivalTime: '14:00',
  };
}
function tripRow(extra = {}) {
  return {
    id: managedId, user_id: owner, destination_country: '', destination_code: '', destination_city: null,
    start_date: '2026-09-28', end_date: '2026-10-02', departure_at: null, arrival_at: null,
    app_language: 'en', flight_pnr: 'USER123', origin_iata: null, destination_iata: null, airline: null, flight_number: null,
    checklist_items: [{ id: otherId, label: 'Pack charger', completed: false, category: 'technology', kind: 'checklist', createdAt: new Date(now).toISOString() }],
    status: 'upcoming', created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(),
    flight_lookup_managed: true, flight_lookup_expires_at: expiresAt, ...extra,
  };
}
function detailRow(extra = {}) {
  return { trip_id: managedId, data: flight(), fetched_at: new Date(now).toISOString(), expires_at: expiresAt, ...extra };
}
function receiptInput(extra = {}) {
  return {
    flightSelectionReceipt: receipt, destinationCountry: '', destinationCode: '', startDate: '', endDate: '2026-10-02',
    flightPnr: 'USER123', appLanguage: 'en', checklistItems: tripRow().checklist_items, ...extra,
  };
}
function assertBaseIsolated(trip) {
  assert.equal(trip.destinationCountry, ''); assert.equal(trip.destinationCode, ''); assert.equal(trip.destinationCity, null);
  assert.equal(trip.startDate, '2026-09-28', 'The original trip date is retained');
  for (const field of ['departureAt', 'arrivalAt', 'originIata', 'destinationIata', 'airline', 'flightNumber']) assert.equal(trip[field], null, `Provider ${field} stays out of the base record`);
  assert.equal(trip.flightPnr, 'USER123'); assert.equal(trip.checklistItems[0].label, 'Pack charger');
}

test('Receipt creates send only the user-owned fields to the managed API, without requiring provider base fields', async () => {
  const h = harness();
  const saved = await h.api.createCockpitTrip(owner, receiptInput({ flightNumber: 'UNTRUSTED_FLIGHT', originIata: 'EVL', destinationIata: 'BAD', departureAt: '2099-01-01T00:00:00Z', airline: 'UNTRUSTED_AIRLINE' }), accessToken);
  assert.equal(h.calls.length, 1);
  const { url, options } = h.calls[0];
  assert.equal(new URL(url, 'https://app.example').pathname, '/api/cockpit/flight-trips');
  assert.equal(options.method, 'POST'); assert.equal(options.headers.Authorization, `Bearer ${accessToken}`);
  assert.equal(options.headers['X-Flight-Lookup-Version'], '3');
  assert.deepEqual(options.body, { receipt, endDate: '2026-10-02', flightPnr: 'USER123', checklistItems: tripRow().checklist_items, appLanguage: 'en' });
  assert.doesNotMatch(JSON.stringify(options.body), /UNTRUSTED|originIata|destinationIata|departureAt|user_id/);
  assert.equal(saved.flightLookupManaged, true); assert.equal(saved.providerFlight.flightNumber, 'TK1985');
  assertBaseIsolated(saved);
});

test('Albanian trip creation and saved rows preserve sq across the mobile API boundary', async () => {
  const h = harness();
  h.state.createResponse.trip.app_language = 'sq';
  const saved = await h.api.createCockpitTrip(owner, receiptInput({ appLanguage: 'sq' }), accessToken);
  assert.equal(h.calls[0].options.body.appLanguage, 'sq');
  assert.equal(saved.appLanguage, 'sq');
  h.state.baseRows[0].app_language = 'sq';
  assert.equal((await h.api.listCockpitTrips(owner, accessToken, true))[0].appLanguage, 'sq');
});

test('Managed create failures never fall back to a direct Supabase insert, including missing-column errors', async () => {
  for (const [status, code] of [[401, ''], [410, 'receipt-expired'], [503, 'unavailable'], [400, '42703']]) {
    const h = harness(); h.state.createError = new ApiError('Fixture failure', status, code);
    await assert.rejects(h.api.createCockpitTrip(owner, receiptInput(), accessToken));
    assert.equal(h.calls.length, 1, `${status}/${code} makes exactly one request`);
    assert.equal(new URL(h.calls[0].url, 'https://app.example').pathname, '/api/cockpit/flight-trips');
    assert.equal(h.calls.some(call => call.url.includes('/rest/v1/trips')), false);
  }
});

test('Default lists keep managed empty-country records without reading provider details or relaxing manual records', async () => {
  for (const includeDetails of [undefined, false]) {
    const h = harness();
    h.state.baseRows = [tripRow(), tripRow({ id: manualId, flight_lookup_managed: false, destination_country: 'France', destination_code: 'FR', destination_city: 'Paris', flight_lookup_expires_at: null }), tripRow({ id: otherId, flight_lookup_managed: false })];
    const trips = await h.api.listCockpitTrips(owner, accessToken, true, includeDetails);
    assert.equal(h.calls.length, 1); assert.equal(trips.length, 2);
    const params = new URL(h.calls[0].url).searchParams;
    assert.equal(params.get('user_id'), `eq.${owner}`); assert.equal(params.has('status'), false);
    assert.equal(h.calls[0].options.headers.Authorization, `Bearer ${accessToken}`);
    const managed = trips.find(trip => trip.id === managedId);
    assert.equal(managed.flightLookupManaged, true); assert.equal(managed.providerFlight, undefined); assertBaseIsolated(managed);
    assert.equal(trips.find(trip => trip.id === manualId).destinationCity, 'Paris');
  }
});

test('Opt-in details enrich only listed managed trips and never copy licensed fields into the base record', async () => {
  const h = harness();
  h.state.baseRows.push(tripRow({ id: manualId, flight_lookup_managed: false, destination_country: 'France', destination_code: 'FR' }));
  h.state.details = [detailRow({ data: { ...flight(), unknownPrivateField: 'DO_NOT_RETAIN' } }), detailRow({ trip_id: manualId }), detailRow({ trip_id: otherId })];
  const trips = await h.api.listCockpitTrips(owner, accessToken, true, true);
  assert.equal(h.calls.length, 2);
  const call = h.calls[1];
  assert.equal(new URL(call.url).pathname, '/rest/v1/rpc/read_cockpit_flight_details');
  assert.equal(call.options.method, 'POST'); assert.equal(call.options.headers.Authorization, `Bearer ${accessToken}`);
  assert.deepEqual(call.options.body, { p_trip_ids: [managedId] });
  const managed = trips.find(trip => trip.id === managedId);
  assert.equal(managed.providerFlight.flightNumber, 'TK1985'); assert.equal(managed.flightLookupExpiresAt, expiresAt);
  assertBaseIsolated(managed);
  assert.equal(trips.find(trip => trip.id === manualId).providerFlight, undefined);
  assert.equal(trips.some(trip => trip.id === otherId), false);
  assert.doesNotMatch(JSON.stringify(trips), /DO_NOT_RETAIN|unknownPrivateField/);
});

test('Missing, expired, malformed or unavailable details preserve user data and cannot reuse an earlier response', async () => {
  const variants = [
    { details: [] },
    { details: [detailRow({ expires_at: '2026-09-27T07:59:59Z' })] },
    { details: [detailRow({ expires_at: '2026-10-10T08:00:00Z' })] },
    { details: [detailRow({ data: { ...flight(), origin: null } })] },
    { details: [detailRow({ data: { ...flight(), departureTime: '11:00' } })] },
    { detailError: new ApiError('Fixture RPC missing', 404, 'PGRST202') },
    { detailError: new ApiError('Fixture service unavailable', 503) },
  ];
  for (const variant of variants) {
    const h = harness();
    assert.ok((await h.api.listCockpitTrips(owner, accessToken, true, true))[0].providerFlight);
    Object.assign(h.state, variant);
    const refreshed = await h.api.listCockpitTrips(owner, accessToken, true, true);
    assert.equal(refreshed.length, 1); assert.equal(refreshed[0].providerFlight, undefined);
    assertBaseIsolated(refreshed[0]);
    assert.equal(refreshed[0].flightLookupManaged, true);
  }
});

test('Managed refresh sends only trip/request identities, validates the overlay and leaves personal base fields untouched', async () => {
  const h = harness();
  const result = await h.api.refreshCockpitFlight(owner, managedId, accessToken);
  assert.equal(h.calls.length, 1); const { url, options } = h.calls[0];
  assert.equal(new URL(url).pathname, '/api/cockpit/flight-trips/refresh'); assert.equal(options.method, 'POST');
  assert.deepEqual(options.body, { tripId: managedId, requestId: otherId });
  assert.equal(options.headers.Authorization, `Bearer ${accessToken}`); assert.equal(options.headers['X-Flight-Lookup-Version'], '3');
  assert.equal(result.trip.providerFlight.flightNumber, 'TK1985'); assert.equal(result.refreshAfterSeconds, 300); assertBaseIsolated(result.trip);
});

test('Terminal refresh explicitly removes provider overlay without losing user notes or reviving data on the next read', async () => {
  const h = harness();
  assert.ok((await h.api.listCockpitTrips(owner, accessToken, true, true))[0].providerFlight);
  h.state.refreshResponse = { protocol: 3, trip: tripRow(), flight: null, expiresAt: null, terminal: true };
  const result = await h.api.refreshCockpitFlight(owner, managedId, accessToken);
  assert.equal(result.trip.providerFlight, undefined); assertBaseIsolated(result.trip);
  h.state.details = [];
  assert.equal((await h.api.listCockpitTrips(owner, accessToken, true, true))[0].providerFlight, undefined);
});

test('Refresh failure or forged owner/date/expiry never falls back to direct writes or accepts stale provider details', async () => {
  for (const variant of [
    { refreshError: new ApiError('Expired session', 401) },
    { refreshError: new ApiError('Quota', 429, 'limit') },
    { refreshError: new ApiError('Missing column', 400, '42703') },
    { refreshResponse: { protocol: 2, trip: tripRow(), flight: flight(), expiresAt } },
    { refreshResponse: { protocol: 3, trip: tripRow({ user_id: otherId }), flight: flight(), expiresAt } },
    { refreshResponse: { protocol: 3, trip: tripRow({ id: otherId }), flight: flight(), expiresAt } },
    { refreshResponse: { protocol: 3, trip: tripRow(), flight: { ...flight(), departureDate: '2026-09-29' }, expiresAt } },
    { refreshResponse: { protocol: 3, trip: tripRow(), flight: flight(), expiresAt: '2026-09-27T07:00:00Z' } },
  ]) {
    const h = harness(); Object.assign(h.state, variant);
    await assert.rejects(h.api.refreshCockpitFlight(owner, managedId, accessToken));
    assert.equal(h.calls.length, 1); assert.equal(new URL(h.calls[0].url).pathname, '/api/cockpit/flight-trips/refresh');
    assert.equal(h.calls.some(call => call.url.includes('/rest/v1/trips')), false);
  }
});
