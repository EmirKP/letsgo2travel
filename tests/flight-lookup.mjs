import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node', resolveJsonModule: true, esModuleInterop: true } });
const flight = require('../lib/flight-lookup.ts');
const provider = require('../lib/flight-provider.ts');
const access = require('../lib/flight-lookup-access.ts');
const receipts = require('../lib/flight-selection-receipt.ts');
const { boundedWait } = require('../lib/bounded-wait.ts');
const { boundedJson } = require('../lib/travel-assistant/http.ts');
const now = new Date('2026-09-27T00:00:00.000Z');
const query = { flightNumber: 'TK1985', date: '2026-09-28' };
const tick = () => new Promise(resolve => setImmediate(resolve));
function leg() {
  return {
    number: 'TK 1985', status: 'Expected', isCargo: false, airline: { name: 'Turkish Airlines' },
    departure: { airport: { iata: 'IST', timeZone: 'Europe/Istanbul' }, scheduledTime: { utc: '2026-09-28 09:00Z', local: '2026-09-28 12:00+03:00' } },
    arrival: { airport: { iata: 'LHR', timeZone: 'Europe/London' }, scheduledTime: { utc: '2026-09-28 13:00Z', local: '2026-09-28 14:00+01:00' } },
  };
}

test('Provider channels keep legacy Direct defaults and reject incomplete or invalid server configuration', () => {
  const apiKey = 'NONFUNCTIONAL_PROVIDER_FIXTURE';
  assert.deepEqual(provider.getFlightProviderConfig({ AERODATABOX_API_KEY: ` ${apiKey} ` }), { channel: 'direct', apiKey });
  for (const channel of ['direct', 'rapidapi']) assert.deepEqual(provider.getFlightProviderConfig({ AERODATABOX_API_CHANNEL: channel, AERODATABOX_API_KEY: apiKey }), { channel, apiKey });
  for (const env of [{}, { AERODATABOX_API_KEY: ' ' }, { AERODATABOX_API_KEY: 'bad\nkey' }, { AERODATABOX_API_KEY: apiKey, AERODATABOX_API_CHANNEL: '' }, { AERODATABOX_API_KEY: apiKey, AERODATABOX_API_CHANNEL: 'https://attacker.example' }]) {
    assert.equal(provider.getFlightProviderConfig(env), null);
  }
});

test('Direct and RapidAPI requests use their fixed gateway and only the matching authentication headers', () => {
  const apiKey = 'NONFUNCTIONAL_PROVIDER_FIXTURE';
  for (const channel of ['direct', 'rapidapi']) {
    const built = provider.buildFlightProviderRequest({ ...query, host: 'https://attacker.example', pnr: 'PRIVATE_PNR', token: 'PRIVATE_USER_TOKEN' }, { channel, apiKey, host: 'https://attacker.example' });
    const url = new URL(built.url);
    const host = channel === 'direct' ? 'api.aerodatabox.com' : 'aerodatabox.p.rapidapi.com';
    assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, host);
    assert.equal(url.pathname, '/flights/number/TK1985/2026-09-28');
    assert.deepEqual(Object.fromEntries(url.searchParams), { dateLocalRole: 'Departure', withAircraftImage: 'false', withLocation: 'false', withFlightPlan: 'false' });
    assert.deepEqual(built.headers, channel === 'direct' ? { Accept: 'application/json', 'X-Api-Key': apiKey } : { Accept: 'application/json', 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': host });
    assert.doesNotMatch(JSON.stringify(built), /PRIVATE_|attacker/);
    assert.equal(url.username, ''); assert.equal(url.password, '');
  }
  assert.throws(() => provider.buildFlightProviderRequest(query, { channel: 'unconfigured', apiKey }), /invalid-provider-channel/);
});

test('Flight input normalises supported airline numbers and bounds exact calendar dates', () => {
  for (const number of ['tk 1985', 'TK1985A', '6E123', 'U2123', 'THY1234']) assert.ok(flight.flightLookupInput(number, query.date, now));
  assert.equal(flight.flightLookupInput('tk 1985', query.date, now).flightNumber, query.flightNumber);
  for (const number of ['', 'TK', '12345', 'TK12345', 'A1', 'TK1985/../../', 'https://bad.test', {}, null]) assert.equal(flight.flightLookupInput(number, query.date, now), null);
  for (const date of ['2026-02-30', '2026-09-25', '2029-09-01', '2026-9-28', '2026-09-28T00:00', {}, null]) assert.equal(flight.flightLookupInput('TK1985', date, now), null);
  assert.ok(flight.flightLookupInput('TK1985', '2026-09-26', now));
});

test('Complete scheduled flights use each airport time zone and expose only the selected projection', () => {
  const raw = leg(); raw.pnr = 'PRIVATE_PNR'; raw.apiKey = 'PRIVATE_KEY'; raw.departure.gate = 'GATE_NOT_VERIFIED';
  const [match] = flight.normalizeFlightMatches([raw], query, now);
  assert.equal(match.origin.iata, 'IST'); assert.equal(match.destination.iata, 'LHR');
  assert.equal(match.departureAt, '2026-09-28T09:00:00.000Z'); assert.equal(match.arrivalAt, '2026-09-28T13:00:00.000Z');
  assert.equal(match.departureTime, '12:00'); assert.equal(match.arrivalTime, '14:00');
  assert.equal(match.source, 'AeroDataBox'); assert.equal(match.fetchedAt, now.toISOString());
  assert.doesNotMatch(JSON.stringify(match), /PRIVATE_|GATE_NOT_VERIFIED/);
  const missingZone = leg(); delete missingZone.departure.airport.timeZone;
  assert.equal(flight.normalizeFlightMatches([missingZone], query, now).length, 1);
});

test('Unknown, incomplete, canceled, cargo, departed and wrong-date legs cannot populate a journey', () => {
  const rejected = [];
  for (const status of ['Canceled', 'Cancelled', 'CanceledUncertain', 'Arrived', 'EnRoute', 'Diverted']) { const f = leg(); f.status = status; rejected.push(f); }
  const cargo = leg(); cargo.isCargo = true; rejected.push(cargo);
  const wrong = leg(); wrong.number = 'TK1986'; rejected.push(wrong);
  const unknown = leg(); unknown.arrival.airport.iata = 'ZZZ'; rejected.push(unknown);
  const incomplete = leg(); delete incomplete.arrival.scheduledTime; rejected.push(incomplete);
  const estimated = leg(); estimated.departure.revisedTime = estimated.departure.scheduledTime; delete estimated.departure.scheduledTime; rejected.push(estimated);
  const missingLocal = leg(); delete missingLocal.departure.scheduledTime.local; rejected.push(missingLocal);
  const sameAirport = leg(); sameAirport.arrival.airport = sameAirport.departure.airport; rejected.push(sameAirport);
  assert.equal(flight.normalizeFlightMatches(rejected, query, now).length, 0);
  assert.equal(flight.normalizeFlightMatches([leg()], { ...query, date: '2026-09-29' }, now).length, 0);
  assert.equal(flight.normalizeFlightMatches([leg()], query, new Date('2026-09-28T09:00:00Z')).length, 0);
  const backwards = leg(); backwards.arrival.scheduledTime = { utc: '2026-09-28 08:00Z', local: '2026-09-28 09:00+01:00' };
  assert.equal(flight.normalizeFlightMatches([backwards], query, now).length, 0);
  assert.throws(() => flight.normalizeFlightMatches({ flights: [leg()] }, query, now), /invalid-provider-response/);
});

test('Provider time conflicts, malformed timestamps and impossible UTC calendar values are rejected', () => {
  for (const local of ['2026-09-28 12:00+09:00', '2026-09-28 12:00garbage', '2026-09-28 11:00+03:00', '2026-09-28 12:00:59+03:00']) {
    const f = leg(); f.departure.scheduledTime.local = local;
    assert.equal(flight.normalizeFlightMatches([f], query, now).length, 0, local);
  }
  for (const timeZone of ['Not/AZone', 'Asia/Tokyo', 'UTC']) {
    const f = leg(); f.departure.airport.timeZone = timeZone;
    assert.equal(flight.normalizeFlightMatches([f], query, now).length, 0, timeZone);
  }
  for (const utc of ['2026-09-27 24:00Z', '2026-09-28 09:60Z', '2026-09-28 09:00+03:00']) {
    const f = leg(); f.departure.scheduledTime.utc = utc;
    assert.equal(flight.normalizeFlightMatches([f], query, now).length, 0, utc);
  }
  const invalidDate = leg();
  invalidDate.departure.scheduledTime = { utc: '2027-02-30 09:00Z', local: '2027-03-02 12:00+03:00' };
  invalidDate.arrival.scheduledTime = { utc: '2027-03-02 13:00Z', local: '2027-03-02 13:00Z' };
  assert.equal(flight.normalizeFlightMatches([invalidDate], { ...query, date: '2027-03-02' }, now).length, 0);
});

test('Multi-leg numbers stay separate, duplicate legs collapse, and local dates may cross midnight', () => {
  const first = leg(), second = leg();
  second.departure.airport = { iata: 'LHR', timeZone: 'Europe/London' };
  second.arrival.airport = { iata: 'JFK', timeZone: 'America/New_York' };
  second.departure.scheduledTime = { utc: '2026-09-28 16:00Z', local: '2026-09-28 17:00+01:00' };
  second.arrival.scheduledTime = { utc: '2026-09-29 00:30Z', local: '2026-09-28 20:30-04:00' };
  const matches = flight.normalizeFlightMatches([second, first, structuredClone(first)], query, now);
  assert.equal(matches.length, 2); assert.notEqual(matches[0].id, matches[1].id);
  assert.equal(matches[0].origin.iata, 'IST'); assert.equal(matches[1].origin.iata, 'LHR');
  assert.equal(matches[1].arrivalDate, '2026-09-28'); assert.equal(matches[1].arrivalAt.slice(0, 10), '2026-09-29');
});

test('Past-departure requires a complete, exact-number and exact-local-date match', () => {
  const afterDeparture = new Date('2026-09-28T09:00:00Z');
  assert.deepEqual(flight.inspectFlightMatches([leg()], query, afterDeparture), { flights: [], reason: 'past-departure' });
  const departed = leg(); departed.status = 'Departed';
  assert.equal(flight.inspectFlightMatches([departed], query, afterDeparture).reason, 'past-departure');
  assert.equal(flight.inspectFlightMatches([leg()], { ...query, flightNumber: 'TK9999' }, afterDeparture).reason, 'not-found');
  assert.equal(flight.inspectFlightMatches([leg()], { ...query, date: '2026-09-29' }, afterDeparture).reason, 'not-found');
  const missing = leg(); delete missing.arrival.scheduledTime;
  assert.equal(flight.inspectFlightMatches([missing], query, afterDeparture).reason, 'incomplete');
  const inconsistent = leg(); inconsistent.departure.scheduledTime.local = '2026-09-28 11:00+03:00';
  assert.equal(flight.inspectFlightMatches([inconsistent], query, afterDeparture).reason, 'incomplete');
  const wrongDateIncomplete = leg(); delete wrongDateIncomplete.arrival;
  assert.equal(flight.inspectFlightMatches([wrongDateIncomplete], { ...query, date: '2026-09-29' }, afterDeparture).reason, 'not-found');
});

test('Empty, incomplete and unusable-status matches have distinct reasons and never expose provider fields', () => {
  assert.deepEqual(flight.inspectFlightMatches([], query, now), { flights: [], reason: 'not-found' });
  for (const status of ['Canceled', 'Cancelled', 'CanceledUncertain', 'Diverted', 'EnRoute']) {
    const raw = leg(); raw.status = status; raw.apiKey = 'NONFUNCTIONAL_SECRET_FIXTURE';
    assert.deepEqual(flight.inspectFlightMatches([raw], query, now), { flights: [], reason: 'status-unavailable' });
  }
  const cargo = leg(); cargo.isCargo = true;
  assert.equal(flight.inspectFlightMatches([cargo], query, new Date('2026-09-29T00:00:00Z')).reason, 'status-unavailable');
  const canceledPast = leg(); canceledPast.status = 'Canceled';
  assert.equal(flight.inspectFlightMatches([canceledPast], query, new Date('2026-09-29T00:00:00Z')).reason, 'status-unavailable');
  const incomplete = leg(); incomplete.arrival.airport.iata = 'ZZZ';
  assert.deepEqual(flight.inspectFlightMatches([incomplete], query, now), { flights: [], reason: 'incomplete' });
});

test('Usable alternatives win over an older leg, and an incomplete alternative never becomes a past-flight claim', () => {
  const current = new Date('2026-09-28T09:30:00Z');
  const upcoming = leg();
  upcoming.departure.scheduledTime = { utc: '2026-09-28 10:00Z', local: '2026-09-28 13:00+03:00' };
  const result = flight.inspectFlightMatches([leg(), upcoming], query, current);
  assert.equal(result.reason, null); assert.equal(result.flights.length, 1);
  assert.equal(result.flights[0].departureAt, '2026-09-28T10:00:00.000Z');
  assert.deepEqual(flight.normalizeFlightMatches([leg(), upcoming], query, current), result.flights, 'Legacy array callers keep identical selectable results');
  const incomplete = structuredClone(upcoming); delete incomplete.arrival.scheduledTime;
  assert.equal(flight.inspectFlightMatches([leg(), incomplete], query, current).reason, 'incomplete');
});

const routeSource = ts.transpileModule(readFileSync(new URL('../app/api/cockpit/flight-lookup/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function routeHarness(overrides = {}) {
  const userId = '10000000-0000-4000-8000-000000000001';
  const env = { FLIGHT_LOOKUP_ENABLED: 'true', FLIGHT_LOOKUP_MONTHLY_LIMIT: '100', AERODATABOX_API_KEY: 'NONFUNCTIONAL_SECRET_FIXTURE', FLIGHT_LOOKUP_MODE: 'commercial', FLIGHT_LOOKUP_RECEIPT_SECRET: 'NONFUNCTIONAL_RECEIPT_SECRET_32_CHARACTERS', ...overrides };
  const calls = { auth: 0, quota: [], provider: [], probes: [], retention: [], signals: [] };
  const state = { auth: 'yes', userId, quota: 'yes', probe: 'yes', retention: 'yes', response: () => Response.json([leg()]), resolveAuth: null, resolveQuota: null };
  const timeout = ms => { const controller = new AbortController(); calls.signals.push({ ms, controller }); return controller.signal; };
  const supabase = { rpc: (name, args) => {
    if (name === 'flight_lookup_retention_ready') {
      calls.retention.push({ name, args });
      return { abortSignal: async () => ({ data: state.retention === 'yes', error: state.retention === 'error' ? { message: 'missing retention' } : null }) };
    }
    assert.equal(name, 'consume_flight_lookup_quota');
    if (args.p_user === null) {
      calls.probes.push({ name, args });
      return { abortSignal: async () => ({ data: state.probe === 'yes' ? false : null, error: state.probe === 'yes' ? null : { message: 'missing migration' } }) };
    }
    calls.quota.push({ name, args });
    return { abortSignal: () => state.quota === 'pending' ? new Promise(resolve => { state.resolveQuota = resolve; }) : Promise.resolve({ data: state.quota === 'yes', error: state.quota === 'error' ? { message: env.AERODATABOX_API_KEY } : null }) };
  } };
  const authenticated = () => ({ ok: true, user: { id: state.userId }, supabase });
  const imports = {
    '@/lib/authenticated-user': { requireAuthenticatedUser: async () => {
      calls.auth++;
      if (state.auth === 'pending') return new Promise(resolve => { state.resolveAuth = () => resolve(authenticated()); });
      return state.auth === 'yes' ? authenticated() : { ok: false, response: Response.json({ error: 'login' }, { status: 401 }) };
    } },
    '@/lib/bounded-wait': { boundedWait }, '@/lib/travel-assistant/http': { boundedJson },
    '@/lib/flight-provider': { ...provider, getFlightProviderConfig: () => provider.getFlightProviderConfig(env) },
    '@/lib/flight-lookup-access': { ...access, flightLookupSettings: () => access.flightLookupSettings(env) },
    '@/lib/flight-selection-receipt': { ...receipts, issueFlightReceipt: (user, input, value, secret) => receipts.issueFlightReceipt(user, input, value, secret, now) },
    '@/lib/flight-lookup': {
      flightLookupInput: (number, date) => flight.flightLookupInput(number, date, now),
      normalizeFlightMatches: (payload, input) => flight.normalizeFlightMatches(payload, input, now),
      inspectFlightMatches: (payload, input) => flight.inspectFlightMatches(payload, input, now),
    },
  };
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${routeSource}\n})`, {
    Response, Date, AbortSignal: { timeout }, process: { env },
    fetch: async (url, options) => { calls.provider.push({ url, options }); return state.response(options); },
  })(name => imports[name], output, output.exports);
  const headers = (version = '2') => ({ Authorization: 'Bearer PRIVATE_USER_TOKEN', ...(version === null ? {} : { 'X-Flight-Lookup-Version': version }) });
  const request = (body = query, version = '2') => new Request('https://our-app.example/api/cockpit/flight-lookup', {
    method: 'POST', headers: headers(version), body: JSON.stringify(body),
  });
  const getRequest = (version = '2') => new Request('https://our-app.example/api/cockpit/flight-lookup', { headers: headers(version) });
  return { api: output.exports, calls, state, env, request, getRequest };
}

test('Lookup stays disabled with no flag, key or bounded monthly allowance and does not call dependencies', async () => {
  for (const env of [{ FLIGHT_LOOKUP_ENABLED: 'false' }, { AERODATABOX_API_KEY: '' }, { AERODATABOX_API_CHANNEL: 'invalid' }, { FLIGHT_LOOKUP_MONTHLY_LIMIT: '' }, { FLIGHT_LOOKUP_MONTHLY_LIMIT: '10001' }, { FLIGHT_LOOKUP_MONTHLY_LIMIT: '2.5' }, { FLIGHT_LOOKUP_MODE: undefined }, { FLIGHT_LOOKUP_MODE: 'trial', FLIGHT_LOOKUP_TRIAL_USER_IDS: '' }, { FLIGHT_LOOKUP_MODE: 'trial', FLIGHT_LOOKUP_TRIAL_USER_IDS: 'not-a-user-id' }, { FLIGHT_LOOKUP_RECEIPT_SECRET: 'short' }]) {
    const h = routeHarness(env);
    assert.deepEqual(await (await h.api.GET(h.getRequest())).json(), { protocol: 2, available: false });
    assert.equal((await h.api.POST(h.request())).status, 503);
    assert.equal(h.calls.auth, 0); assert.equal(h.calls.quota.length, 0); assert.equal(h.calls.provider.length, 0);
  }
});

test('Readiness verifies each authenticated request with read-only quota and retention probes', async () => {
  const h = routeHarness();
  for (let i = 0; i < 2; i++) { const response = await h.api.GET(h.getRequest()); assert.deepEqual(await response.json(), { protocol: 2, available: true, mode: 'commercial', maySave: true }); assert.equal(response.headers.get('cache-control'), 'private, no-store'); }
  assert.equal(h.calls.auth, 2); assert.equal(h.calls.probes.length, 2); assert.equal(h.calls.retention.length, 2);
  assert.ok(h.calls.probes.every(probe => probe.args.p_user === null)); assert.equal(h.calls.quota.length, 0);
  assert.equal(h.calls.provider.length, 0);
  for (const change of [{ auth: 'no' }, { probe: 'error' }, { retention: 'no' }, { retention: 'error' }]) {
    const unavailable = routeHarness(); Object.assign(unavailable.state, change);
    assert.deepEqual(await (await unavailable.api.GET(unavailable.getRequest())).json(), { protocol: 2, available: false });
    assert.equal(unavailable.calls.quota.length, 0); assert.equal(unavailable.calls.provider.length, 0);
  }
});

test('Old clients and trial users outside the allowlist cannot reach provider or quota work', async () => {
  for (const version of [null, '1', '3']) {
    const h = routeHarness();
    assert.deepEqual(await (await h.api.GET(h.getRequest(version))).json(), { protocol: 2, available: false });
    const response = await h.api.POST(h.request(query, version));
    assert.equal(response.status, 426); assert.deepEqual(await response.json(), { protocol: 2, code: 'update-required' });
    assert.equal(h.calls.auth, 0); assert.equal(h.calls.quota.length, 0); assert.equal(h.calls.provider.length, 0);
  }
  const h = routeHarness({ FLIGHT_LOOKUP_MODE: 'trial', FLIGHT_LOOKUP_TRIAL_USER_IDS: '10000000-0000-4000-8000-000000000002' });
  assert.deepEqual(await (await h.api.GET(h.getRequest())).json(), { protocol: 2, available: false });
  assert.equal((await h.api.POST(h.request())).status, 403);
  assert.equal(h.calls.probes.length, 0); assert.equal(h.calls.quota.length, 0); assert.equal(h.calls.provider.length, 0);
});

test('Allowlisted trials use RapidAPI without a save receipt; commercial results bind signed owner and lifetime', async () => {
  const user = '10000000-0000-4000-8000-000000000001';
  const trial = routeHarness({ FLIGHT_LOOKUP_MODE: 'trial', FLIGHT_LOOKUP_TRIAL_USER_IDS: user, AERODATABOX_API_CHANNEL: 'rapidapi', FLIGHT_LOOKUP_RECEIPT_SECRET: undefined });
  assert.deepEqual(await (await trial.api.GET(trial.getRequest())).json(), { protocol: 2, available: true, mode: 'trial', maySave: false });
  const response = await trial.api.POST(trial.request()); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.protocol, 2); assert.equal(result.maySave, false);
  assert.equal(result.flights[0].maySave, false); assert.equal(result.flights[0].receipt, null);
  assert.equal(Date.parse(result.flights[0].expiresAt), now.getTime() + access.FLIGHT_DATA_LIFETIME_MS);
  assert.equal(trial.calls.retention.length, 0);
  const { url, options } = trial.calls.provider[0]; assert.equal(new URL(url).hostname, 'aerodatabox.p.rapidapi.com');
  assert.equal(options.headers['X-RapidAPI-Key'], trial.env.AERODATABOX_API_KEY); assert.equal(options.headers['X-RapidAPI-Host'], 'aerodatabox.p.rapidapi.com');
  assert.equal(options.headers['X-Api-Key'], undefined); assert.equal(options.headers.Authorization, undefined);
  const commercial = routeHarness(); const saved = await (await commercial.api.POST(commercial.request())).json();
  assert.equal(saved.maySave, true); assert.equal(saved.flights[0].maySave, true);
  const verified = receipts.verifyFlightReceipt(saved.flights[0].receipt, user, commercial.env.FLIGHT_LOOKUP_RECEIPT_SECRET, now);
  assert.equal(verified.query.flightNumber, query.flightNumber); assert.equal(verified.expiresAt, saved.flights[0].expiresAt);
  assert.equal(receipts.verifyFlightReceipt(saved.flights[0].receipt, '10000000-0000-4000-8000-000000000002', commercial.env.FLIGHT_LOOKUP_RECEIPT_SECRET, now), null);
});

test('Authentication and bounded validated input run before quota or paid provider requests', async () => {
  const h = routeHarness(); h.state.auth = 'no';
  const denied = await h.api.POST(h.request()); assert.equal(denied.status, 401); assert.equal(denied.headers.get('cache-control'), 'private, no-store');
  h.state.auth = 'yes';
  for (const body of [null, {}, { ...query, flightNumber: 'TK1/../../../etc' }, { ...query, date: '2026-02-30' }, { ...query, padding: 'x'.repeat(1025) }]) assert.equal((await h.api.POST(h.request(body))).status, 400);
  assert.equal(h.calls.quota.length, 0); assert.equal(h.calls.provider.length, 0);
});

test('Quota denial and missing migrations fail closed without exposing provider credentials', async () => {
  for (const quota of ['no', 'error']) {
    const h = routeHarness(); h.state.quota = quota;
    const response = await h.api.POST(h.request()); assert.equal(response.status, quota === 'no' ? 429 : 503);
    assert.doesNotMatch(await response.text(), /NONFUNCTIONAL_SECRET_FIXTURE/);
    assert.equal(h.calls.provider.length, 0);
  }
  const h = routeHarness(); h.state.retention = 'error';
  assert.equal((await h.api.POST(h.request())).status, 503);
  assert.equal(h.calls.quota.length, 0); assert.equal(h.calls.provider.length, 0);
});

test('A successful lookup uses one fixed provider host and only the provider key leaves the server', async () => {
  const h = routeHarness();
  const response = await h.api.POST(h.request({ ...query, host: 'https://attacker.example', pnr: 'PRIVATE_PNR', user_id: 'attacker' }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const result = await response.text(); assert.doesNotMatch(result, /PRIVATE_|NONFUNCTIONAL_SECRET_FIXTURE/);
  assert.equal(JSON.parse(result).flights.length, 1);
  assert.equal(h.calls.provider.length, 1);
  const { url, options } = h.calls.provider[0];
  assert.equal(new URL(url).hostname, 'api.aerodatabox.com'); assert.equal(new URL(url).pathname, '/flights/number/TK1985/2026-09-28');
  assert.equal(new URL(url).searchParams.get('dateLocalRole'), 'Departure');
  assert.equal(options.headers['X-Api-Key'], h.env.AERODATABOX_API_KEY); assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  assert.doesNotMatch(JSON.stringify(h.calls.provider), /PRIVATE_USER_TOKEN|PRIVATE_PNR|attacker/);
  assert.equal(h.calls.quota[0].args.p_user, '10000000-0000-4000-8000-000000000001');
});

test('Empty, throttled, oversized and invalid provider responses have bounded public errors', async () => {
  const variants = [
    [() => new Response(null, { status: 204 }), 200, { flights: [], reason: 'not-found', maySave: true }],
    [() => new Response('NONFUNCTIONAL_SECRET_FIXTURE', { status: 429 }), 429, { code: 'limit' }],
    [() => new Response('NONFUNCTIONAL_SECRET_FIXTURE', { status: 502 }), 503, { code: 'unavailable' }],
    [() => Response.json({ error: 'NONFUNCTIONAL_SECRET_FIXTURE' }), 503, { code: 'unavailable' }],
    [() => new Response('x'.repeat(300001)), 503, { code: 'unavailable' }],
  ];
  for (const [factory, status, body] of variants) {
    const h = routeHarness(); h.state.response = factory;
    const response = await h.api.POST(h.request()); assert.equal(response.status, status); assert.deepEqual(await response.json(), { protocol: 2, ...body });
  }
});

test('Lookup returns distinct empty-result reasons without creating receipts for unusable flights', async () => {
  const incomplete = leg(); delete incomplete.arrival.scheduledTime;
  const canceled = leg(); canceled.status = 'Canceled';
  const past = leg();
  past.departure.scheduledTime = { utc: '2026-09-26 09:00Z', local: '2026-09-26 12:00+03:00' };
  past.arrival.scheduledTime = { utc: '2026-09-26 13:00Z', local: '2026-09-26 14:00+01:00' };
  for (const [payload, input, reason] of [[[], query, 'not-found'], [[incomplete], query, 'incomplete'], [[canceled], query, 'status-unavailable'], [[past], { ...query, date: '2026-09-26' }, 'past-departure']]) {
    const h = routeHarness(); h.state.response = () => Response.json(payload);
    const response = await h.api.POST(h.request(input));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { protocol: 2, flights: [], reason, maySave: true });
  }
});

test('Auth, quota and provider timeouts terminate the request and late completion cannot advance billing', async () => {
  for (const stage of ['auth', 'quota', 'provider']) {
    const h = routeHarness();
    if (stage !== 'provider') h.state[stage] = 'pending';
    else h.state.response = options => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('NONFUNCTIONAL_SECRET_FIXTURE')), { once: true }));
    const pending = h.api.POST(h.request()); await tick();
    const duration = stage === 'auth' ? 4000 : stage === 'quota' ? 3000 : 8000;
    const signal = h.calls.signals.filter(entry => entry.ms === duration).at(-1); assert.ok(signal);
    signal.controller.abort();
    const response = await pending; assert.equal(response.status, 503); assert.deepEqual(await response.json(), { protocol: 2, code: 'unavailable' });
    h.state.resolveAuth?.(); h.state.resolveQuota?.({ data: true, error: null }); await tick();
    assert.equal(h.calls.provider.length, stage === 'provider' ? 1 : 0);
    if (stage === 'auth') assert.equal(h.calls.quota.length, 0);
  }
});

test('Timed-out request bodies cannot consume quota after their stream later completes', async () => {
  const h = routeHarness(); let stream;
  const request = new Request('https://our-app.example', { method: 'POST', headers: { 'X-Flight-Lookup-Version': '2' }, body: new ReadableStream({ start(controller) { stream = controller; } }), duplex: 'half' });
  const pending = h.api.POST(request); await tick();
  h.calls.signals.find(entry => entry.ms === 3000).controller.abort();
  assert.equal((await pending).status, 400);
  stream.enqueue(new TextEncoder().encode(JSON.stringify(query))); stream.close(); await tick();
  assert.equal(h.calls.quota.length, 0); assert.equal(h.calls.provider.length, 0);
});

test('boundedWait handles already-aborted rejected work and releases completed dependencies', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(boundedWait(Promise.reject(Error('late dependency failure')), controller.signal), /dependency-timeout/);
  const running = new AbortController();
  assert.equal(await boundedWait(Promise.resolve('ready'), running.signal), 'ready');
  running.abort(); await tick();
});
