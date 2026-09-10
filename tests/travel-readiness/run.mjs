import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

// Run production modules. Only OS, storage, native plugin and network boundaries
// are substituted; assertions cover their inputs and the persisted results.
const nodeRequire = createRequire(import.meta.url);
const now = Date.parse("2026-09-10T12:00:00Z");
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
function modules(overrides = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({ URL, URLSearchParams, Request, Response, Headers, AbortSignal, Date: Clock, Intl, console, setTimeout, clearTimeout, Event, EventTarget, CustomEvent,
    process: { env: { TICKETMASTER_API_KEY: "test-key", PREDICTHQ_ACCESS_TOKEN: "test-key" } }, ...globals });
  const load = filename => {
    let full = path.resolve(filename);
    if (!existsSync(full)) full = [".ts", ".tsx", ".json"].map(ext => full + ext).find(existsSync) || full;
    if (cache.has(full)) return cache.get(full).exports;
    const module = { exports: {} }; cache.set(full, module);
    if (full.endsWith(".json")) return (module.exports = JSON.parse(readFileSync(full, "utf8")));
    const source = ts.transpileModule(readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const require = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith(".") ? load(path.resolve(path.dirname(full), name)) : name.startsWith("@/") ? load(name.slice(2)) : nodeRequire(name);
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context, { filename: full })(require, module, module.exports);
    return module.exports;
  };
  return load;
}
function browser() {
  const data = new Map(), timers = new Map(); let timerId = 0;
  const localStorage = { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
  const window = new EventTarget(), document = new EventTarget(); document.visibilityState = "visible";
  const setTimeout = (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; };
  const clearTimeout = id => timers.delete(id);
  Object.assign(window, { localStorage, setTimeout, clearTimeout });
  return { window, document, localStorage, timers, setTimeout, clearTimeout };
}
const plain = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let passed = 0, failed = 0;
async function test(name, run) { try { await run(); passed++; console.log(`PASS ${name}`); } catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); } }

const flight = (extra = {}) => ({ mode: "flight", originAirport: { iata: "IST" }, airport: { iata: "LHR" }, countryAlpha3: "GBR", destinationCountry: "United Kingdom", destinationCode: "GB", destinationCity: "London", startDate: "2026-09-20", endDate: "2026-09-24", departureTime: "12:00", arrivalDate: "2026-09-20", arrivalTime: "13:00", airline: "THY", flightNumber: "TK123", flightPnr: "ABC123", ...extra });
await test("flight: Istanbul–London duration is three hours in every device time zone", () => {
  const original = process.env.TZ;
  try {
    for (const deviceZone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = deviceZone;
      const form = modules()("mobile/src/lib/cockpitForm.ts"), times = form.flightTimes(flight());
      assert.equal(form.tripFormError(flight()), "");
      assert.equal(times.departure.iso, "2026-09-20T09:00:00.000Z");
      assert.equal(times.arrival.iso, "2026-09-20T12:00:00.000Z");
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
await test("flight: nonexistent DST times and invalid dates cannot become bookings", () => {
  const { wallTimeToUtc: convert } = modules()("lib/zoned-time.ts");
  assert.equal(convert("2027-03-14", "02:30", "America/New_York").reason, "nonexistent");
  assert.equal(convert("2026-10-04", "02:15", "Australia/Lord_Howe").reason, "nonexistent");
  for (const [date, time] of [["2027-02-29", "10:00"], ["2026-04-31", "10:00"], ["2026-09-20", "24:00"]]) assert.equal(convert(date, time, "Europe/Istanbul").reason, "invalid");
  assert.equal(convert("2026-09-20", "12:00", "Unknown/Airport").reason, "timezone");
});
await test("flight: repeated DST time requires one of the two actual UTC instants", () => {
  const load = modules(), convert = load("lib/zoned-time.ts").wallTimeToUtc;
  const repeated = convert("2026-11-01", "01:30", "America/New_York");
  assert.deepEqual(plain(repeated.candidates), ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
  const form = load("mobile/src/lib/cockpitForm.ts");
  const input = flight({ originAirport: { iata: "JFK" }, startDate: "2026-11-01", endDate: "2026-11-05", departureTime: "01:30", arrivalDate: "2026-11-01", arrivalTime: "15:00" });
  assert.match(form.tripFormError(input), /iki kez/);
  assert.equal(form.tripFormError({ ...input, departureUtc: repeated.candidates[1] }), "");
  assert.equal(form.flightTimes({ ...input, departureUtc: "2026-11-01T07:30:00Z" }).departure.ok, false);
  assert.equal(convert("2027-04-04", "01:45", "Australia/Lord_Howe").candidates.length, 2);
});
await test("flight: date-line travel accepts an earlier local arrival date with a later UTC instant", () => {
  const form = modules()("mobile/src/lib/cockpitForm.ts");
  const input = flight({ originAirport: { iata: "NRT" }, airport: { iata: "HNL" }, departureTime: "00:30", arrivalDate: "2026-09-19", arrivalTime: "13:00" });
  assert.equal(form.tripFormError(input), "");
  const times = form.flightTimes(input);
  assert.ok(Date.parse(times.arrival.iso) > Date.parse(times.departure.iso));
  assert.match(form.tripFormError({ ...input, originAirport: { iata: "ZZZ" } }), /saat dilimini/);
  assert.equal(form.tripFormError({ ...input, originAirport: { iata: "ZZZ", timeZone: "Asia/Tokyo" } }), "");
});
await test("flight: an airport's today can be tomorrow on the phone; past UTC departures stay rejected", () => {
  const form = modules()("mobile/src/lib/cockpitForm.ts");
  const input = flight({ originAirport: { iata: "LAX" }, startDate: "2026-09-10", departureTime: "10:00", arrivalDate: "2026-09-11", arrivalTime: "09:00" });
  assert.equal(form.tripFormError(input, new Date("2026-09-10T16:59:00Z")), "");
  assert.match(form.tripFormError(input, new Date("2026-09-10T17:00:00Z")), /geçmiş/);
});

const route = (id = "r1") => ({ id, createdAt: "2026-09-10T12:00:00Z", input: { origin: "İstanbul", days: "4 gün", vibe: ["Culture"] }, plan: { routes: [{ name: "Roma", country: "İtalya", visaNote: "Source retained", visaSourceUrl: "https://example.test/source" }] } });
function routeFixture(sharedBrowser = browser(), overrides = {}) {
  const remote = new Map(), calls = [];
  const api = {
    upsertUserTrip: async (owner, input, token) => { calls.push(["save", owner, plain(input), token]); const row = { id: `db-${input.clientKey}`, clientKey: input.clientKey, tripData: input.tripData }; remote.set(input.clientKey, row); return row; },
    deleteUserRouteByClientKey: async (owner, id, token) => { calls.push(["delete-key", owner, id, token]); remote.delete(id); },
    deleteUserTrip: async (owner, id, token) => { calls.push(["delete-id", owner, id, token]); for (const [key, row] of remote) if (row.id === id) remote.delete(key); },
    listUserTrips: async () => [...remote.values()],
    ...overrides,
  };
  const load = modules({ "./supabaseData": api }, sharedBrowser);
  return { ...sharedBrowser, load, remote, calls, api, store: load("mobile/src/lib/storage.ts"), box: load("mobile/src/lib/routeOutbox.ts"), sync: load("mobile/src/lib/routeSync.ts") };
}
await test("route: offline save survives restart and uses the original plan snapshot", async () => {
  const io = browser(), fixture = routeFixture(io, { upsertUserTrip: async () => { throw new Error("offline"); } });
  const input = route(); fixture.store.saveRoutePlan(input, "A"); input.input.origin = "Changed form";
  await assert.rejects(fixture.sync.syncSavedRoutes("A", "token"));
  assert.equal(fixture.box.readRouteOutbox("A").r1.pending, true);
  const restart = routeFixture(io); await restart.sync.syncSavedRoutes("A", "token");
  assert.equal(restart.calls.filter(call => call[0] === "save").length, 1);
  assert.equal(restart.calls[0][2].tripData.input.origin, "İstanbul");
  assert.equal(restart.calls[0][2].tripData.plan.routes[0].visaNote, "Source retained");
  assert.equal(restart.box.readRouteOutbox("A").r1.pending, false);
  await restart.sync.syncSavedRoutes("A", "token"); assert.equal(restart.calls.length, 1);
});
await test("route: delete needs no successful cloud list and remains durable across failures", async () => {
  const f = routeFixture(browser(), { listUserTrips: async () => { throw new Error("list offline"); } });
  f.store.saveRoutePlan(route(), "A"); f.store.deleteRoutePlan("r1", "A");
  await assert.rejects(f.sync.syncSavedRoutes("A", "token"));
  assert.deepEqual(f.calls, [["delete-key", "A", "r1", "token"]]);
  assert.equal(f.store.getSavedRoutePlans("A").length, 0);
  assert.equal(f.box.readRouteOutbox("A").r1.kind, "delete");
});
await test("route: a delayed upload cannot undo a delete or a repeated guest import", async () => {
  const held = deferred(), f = routeFixture();
  const original = f.api.upsertUserTrip; f.api.upsertUserTrip = async (...args) => { await held.promise; return original(...args); };
  f.store.saveRoutePlan(route(), "A"); const syncing = f.sync.syncSavedRoutes("A", "token"); await settle();
  f.store.deleteRoutePlan("r1", "A"); held.resolve(); await syncing;
  assert.equal(f.remote.size, 0); assert.equal(f.store.getSavedRoutePlans("A").length, 0);
  await f.sync.syncRoutePlan("A", "token", route());
  assert.equal(f.calls.filter(call => call[0] === "save").length, 1);
});
await test("route: a late server write after a timeout is removed on the next reconciliation", async () => {
  const f = routeFixture(); f.store.saveRoutePlan(route(), "A"); f.store.deleteRoutePlan("r1", "A");
  await f.sync.syncSavedRoutes("A", "token");
  f.remote.set("r1", { id: "late-db", clientKey: "r1", tripData: { input: route().input, plan: route().plan } });
  await f.sync.syncSavedRoutes("A", "token");
  assert.equal(f.remote.size, 0); assert.equal(f.store.getSavedRoutePlans("A").length, 0);
});
await test("route: account switch fences late responses and stops retry timers", async () => {
  const held = deferred(), f = routeFixture(browser(), { upsertUserTrip: () => held.promise });
  f.store.saveRoutePlan(route(), "A"); const stop = f.sync.startRouteSync("A", "token-A"); await settle(); stop();
  held.resolve({ id: "db-r1" }); await settle();
  assert.equal(f.box.readRouteOutbox("A").r1.pending, true);
  assert.deepEqual(plain(f.box.readRouteOutbox("B")), {}); assert.equal(f.timers.size, 0);
});
await test("route: offline retry works while Plans is closed and uses one bounded timer", async () => {
  const f = routeFixture(), original = f.api.upsertUserTrip; let attempts = 0;
  f.api.upsertUserTrip = async (...args) => { if (++attempts === 1) throw new Error("offline"); return original(...args); };
  f.store.saveRoutePlan(route(), "A"); const stop = f.sync.startRouteSync("A", "token"); await settle();
  assert.equal(f.timers.size, 1); const [id, timer] = [...f.timers][0]; assert.equal(timer.delay, 5000); f.timers.delete(id); timer.fn(); await settle();
  assert.equal(attempts, 2); assert.equal(f.box.readRouteOutbox("A").r1.pending, false); stop(); assert.equal(f.timers.size, 0);
});
await test("route: remote deletion is reflected, but a save made during the fetch is preserved", async () => {
  const f = routeFixture(); f.store.saveRoutePlan(route(), "A"); await f.sync.syncSavedRoutes("A", "token"); f.remote.clear();
  await f.sync.syncSavedRoutes("A", "token"); assert.equal(f.store.getSavedRoutePlans("A").length, 0);
  const held = deferred(); f.api.listUserTrips = () => held.promise;
  const syncing = f.sync.syncSavedRoutes("A", "token"); await settle(); f.store.saveRoutePlan(route("new"), "A"); held.resolve([]); await syncing;
  assert.equal(f.remote.has("new"), true); assert.equal(f.store.getSavedRoutePlans("A")[0].id, "new");
});
await test("route: storage failure and corruption never silently discard pending operations", () => {
  const f = routeFixture(); f.store.saveRoutePlan(route(), "A");
  const before = f.localStorage.getItem("l2t.mobile.route-outbox.v1.A"); f.localStorage.setItem = () => { throw new Error("quota"); };
  assert.throws(() => f.store.deleteRoutePlan("r1", "A"), /quota/); assert.equal(f.localStorage.getItem("l2t.mobile.route-outbox.v1.A"), before);
  const broken = routeFixture(); broken.localStorage.setItem("l2t.mobile.route-outbox.v1.A", "{broken");
  assert.throws(() => broken.store.saveRoutePlan(route(), "A"));
  assert.equal(broken.localStorage.getItem("l2t.mobile.route-outbox.v1.A"), "{broken");
});
await test("route: more than 100 offline routes remain available after reload and deletion", () => {
  const f = routeFixture(); for (let i = 0; i < 105; i++) f.store.saveRoutePlan(route(`r${i}`), "A");
  f.store.deleteRoutePlan("r0", "A");
  assert.equal(routeFixture(f).store.getSavedRoutePlans("A").length, 104);
});
await test("route API: deletion always filters owner, kind and client key, with the signed-in token", async () => {
  const calls = [], owner = "11111111-1111-4111-8111-111111111111";
  const load = modules({ "./api": { ApiError: class extends Error {}, requestJson: async (url, options) => { calls.push({ url, options }); return []; } }, "./config": { config: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "public-test-key" }, isSupabaseConfigured: () => true }, "./i18n": { localeFromStorage: () => "tr" } });
  const data = load("mobile/src/lib/supabaseData.ts"); await data.deleteUserRouteByClientKey(owner, "route:test.1", "user-token");
  const query = new URL(calls[0].url).searchParams;
  assert.equal(query.get("user_id"), `eq.${owner}`); assert.equal(query.get("trip_data->>mobile_kind"), "eq.route_plan"); assert.equal(query.get("trip_data->>client_key"), "eq.route:test.1");
  assert.equal(calls[0].options.method, "DELETE"); assert.equal(calls[0].options.headers.Authorization, "Bearer user-token");
  await assert.rejects(data.deleteUserRouteByClientKey(owner, "or=(id.gt.0)", "user-token")); assert.equal(calls.length, 1);
});
await test("passport: country and type persist; unknown visa status is never visa-free", () => {
  const io = browser(), passport = modules({}, io)("mobile/src/lib/passportPreference.ts");
  assert.equal(passport.preferredEntry({ country: "TR", type: "ordinary" }, "DE", "tr").visaFree, false);
  passport.savePassportPreference("US", "ordinary");
  assert.equal(passport.preferredEntry(passport.readPassportPreference(), "DE", "en").visaFree, true);
  passport.savePassportPreference("TR", "special");
  const restored = modules({}, io)("mobile/src/lib/passportPreference.ts");
  assert.deepEqual(plain(restored.readPassportPreference()), { country: "TR", type: "special" });
  assert.equal(restored.preferredEntry({ country: "ZZ", type: "ordinary" }, "DE", "tr").visaFree, false);
  passport.savePassportPreference("INVALID", "bad"); assert.equal(passport.readPassportPreference().type, "special");
});

const event = (extra = {}) => ({ id: "event1", title: "Concert", city: "New York", startsAt: "2026-09-12T02:00:00Z", localDate: "2026-09-11", timeZone: "America/New_York", timePrecision: "exact", status: "scheduled", updatedAt: "2026-09-10T10:00:00Z", ...extra });
const search = { countryCode: "US", startDate: "2026-09-10", endDate: "2026-09-30", limit: 20 };
await test("events: refreshing old saved entries preserves the newly confirmed time metadata", () => {
  const io = browser(), store = modules({}, io)("mobile/src/lib/storage.ts");
  store.toggleSavedTravelEvent(event({ localDate: undefined, timeZone: undefined, timePrecision: undefined }), "A");
  store.mergeSavedTravelEvents([event()], "A"); assert.equal(store.getSavedTravelEvents("A")[0].timePrecision, "exact");
  const before = io.localStorage.getItem("l2t.mobile.saved-events.v1.user-A"); io.localStorage.setItem = () => { throw new Error("quota"); };
  assert.throws(() => store.removeSavedTravelEvent("event1", "A"), /quota/); assert.equal(io.localStorage.getItem("l2t.mobile.saved-events.v1.user-A"), before);
});
await test("events: Ticketmaster unknown time stays date-only and an unknown date is omitted", async () => {
  const base = { id: "1", name: "Concert", url: "https://ticketmaster.com/event/1", dates: { timezone: "America/New_York", start: { localDate: "2026-09-11", dateTime: "2026-09-12T02:00:00Z" } } };
  const load = modules({ "@/lib/supabaseAdmin": { getSupabaseAdmin: () => null } }, { fetch: async () => Response.json({ _embedded: { events: [base, { ...base, id: "2", dates: { ...base.dates, start: { ...base.dates.start, timeTBA: true } } }, { ...base, id: "3", dates: { start: { localDate: "2026-09-11", dateTBD: true } } }] } }) });
  const events = await load("lib/travel-events.ts").ticketmasterEvents(search), times = load("lib/event-time.ts");
  assert.equal(events.length, 2); assert.equal(times.hasEventTime(events[0]), true);
  assert.equal(events[1].startsAt, "2026-09-11"); assert.equal(times.hasEventTime(events[1]), false);
  assert.equal(times.eventTimeLabel(events[1], "tr-TR"), "Saat açıklanmadı");
  assert.equal(times.eventDateLabel(events[0], "en-US"), "Sep 11, 2026");
  assert.match(times.eventTimeLabel(events[0], "en-US"), /10:00 PM/);
});
await test("events: PredictHQ timezone-agnostic and predicted starts never schedule guessed times", async () => {
  const base = { id: "1", title: "Concert", category: "concerts", start: "2026-09-12T02:00:00Z", start_local: "2026-09-11T22:00:00", timezone: "America/New_York", state: "active", country: "US" };
  const load = modules({ "@/lib/supabaseAdmin": { getSupabaseAdmin: () => null } }, { fetch: async () => Response.json({ results: [base, { ...base, id: "2", timezone: null }, { ...base, id: "3", state: "predicted" }] }) });
  const events = await load("lib/travel-events.ts").predictHqEvents(search);
  assert.deepEqual(plain(events.map(item => item.timePrecision)), ["exact", "date", "date"]);
});
function reminderFixture() {
  const io = browser(), calls = []; let listener, failCancel = false, permissions = 0;
  const native = { checkPermissions: async () => { permissions++; return { display: "granted" }; }, schedule: async value => calls.push(["schedule", value]), cancel: async value => { calls.push(["cancel", value]); if (failCancel) throw new Error("native unavailable"); } };
  const load = modules({ "./capacitor": { isNativePlatform: () => true, plugin: () => native, addPluginListener: async (_plugin, _event, fn) => { listener = fn; return { remove: async () => { listener = null; } }; } } }, io);
  return { ...io, calls, native, reminders: load("mobile/src/lib/eventReminders.ts"), registry: () => JSON.parse(io.localStorage.getItem("l2t.mobile.event-reminders.v1") || "[]"), setFail: value => { failCancel = value; }, permissions: () => permissions, tap: value => listener?.(value) };
}
await test("reminder: unknown, postponed and past events make no permission or native calls", async () => {
  const f = reminderFixture();
  for (const invalid of [event({ timePrecision: "date" }), event({ timePrecision: undefined }), event({ status: "postponed" }), event({ startsAt: "2026-01-01T00:00:00Z" })]) assert.equal((await f.reminders.scheduleEventReminder(invalid, "tr", "A")).ok, false);
  assert.equal(f.calls.length, 0); assert.equal(f.permissions(), 0);
});
await test("reminder: actual scheduled instant and tap identity match the saved event and account", async () => {
  const f = reminderFixture(), result = await f.reminders.scheduleEventReminder(event(), "en", "A");
  assert.equal(result.ok, true); assert.equal(result.at.toISOString(), "2026-09-11T02:00:00.000Z");
  const notification = f.calls[0][1].notifications[0]; assert.equal(notification.schedule.at.toISOString(), result.at.toISOString());
  assert.deepEqual(plain(notification.extra), { screen: "events", eventId: "event1", ownerId: "A" });
  const opened = []; const stop = f.reminders.initEventReminderTapListener((...args) => opened.push(args)); await settle();
  f.tap({ notification }); assert.deepEqual(opened, [["event1", "A"]]); stop(); await settle(); f.tap({ notification }); assert.equal(opened.length, 1);
});
await test("reminder: failed cancellation remains durable and maintenance retries while screen is closed", async () => {
  const f = reminderFixture(); await f.reminders.scheduleEventReminder(event(), "tr", "A"); f.setFail(true);
  assert.equal(await f.reminders.cancelEventReminder("event1", "A"), false); assert.equal(f.registry()[0].pendingCancel, true);
  const stop = f.reminders.startEventReminderMaintenance("A"); await settle(); assert.equal(f.timers.size, 1);
  f.setFail(false); const [id, timer] = [...f.timers][0]; f.timers.delete(id); timer.fn(); await settle(); stop();
  assert.equal(f.registry().length, 0); assert.equal(f.timers.size, 0);
});
await test("reminder: switching accounts cancels the previous owner's notification; ids never collide", async () => {
  const f = reminderFixture(); await f.reminders.scheduleEventReminder(event(), "tr", "A"); await f.reminders.scheduleEventReminder(event(), "tr", "B");
  assert.notEqual(f.registry()[0].id, f.registry()[1].id);
  const stop = f.reminders.startEventReminderMaintenance("B"); await settle(); stop();
  assert.deepEqual(f.registry().map(item => item.ownerId), ["B"]);
});
await test("reminder: unknown time and cancellation updates remove the existing native reminder", async () => {
  for (const update of [{ timePrecision: "date" }, { status: "cancelled" }]) {
    const f = reminderFixture(); await f.reminders.scheduleEventReminder(event(), "tr", "A");
    await f.reminders.reconcileEventReminders([event(update)], "tr", "A");
    assert.equal(f.registry().length, 0); assert.equal(f.calls.filter(call => call[0] === "schedule").length, 1);
  }
});
await test("reminder: failure to persist prevents any untracked native notification", async () => {
  const f = reminderFixture(); f.localStorage.setItem = () => { throw new Error("quota"); };
  await assert.rejects(f.reminders.scheduleEventReminder(event(), "tr", "A"), /quota/); assert.equal(f.calls.length, 0);
});

await test("visa: only a recent running or idle heartbeat enables tracking", () => {
  const { workerHealth } = modules({ "../supabaseAdmin": {} })("lib/visa-appointments/worker-health.ts");
  assert.equal(workerHealth(null).state, "unknown");
  for (const status of ["running", "idle"]) assert.equal(workerHealth({ status, last_seen_at: new Date(now - 300_000).toISOString(), poll_interval_ms: 300_000 }).state, "online");
  for (const date of ["2026-08-27T20:57:39Z", "2026-09-11T12:00:00Z", "bad"]) assert.equal(workerHealth({ status: "running", last_seen_at: date }).state, "offline");
  assert.equal(workerHealth({ status: "error", last_seen_at: new Date(now).toISOString() }).state, "degraded");
});
function visaFixture(state) {
  const writes = []; let action = "pause";
  const chain = { select() { return this; }, eq() { return this; }, update(value) { writes.push(value); return this; }, maybeSingle: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111", status: action === "retry" ? "verification_required" : "paused", provider_code: "idata", access_expires_at: "2027-01-01T00:00:00Z" } }), then(resolve) { resolve({ error: null }); } };
  const load = modules({ "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } }, "@/lib/visa-appointments/worker-health": { getWorkerHealth: async () => ({ state }) }, "@/lib/authenticated-user": { requireAuthenticatedUser: async () => ({ ok: true, user: { id: "A" }, supabase: { from: () => chain } }) } });
  return { load, writes, setAction: value => { action = value; } };
}
await test("visa: offline create returns 503 before writing tracks or entitlements", async () => {
  for (const state of ["offline", "unknown", "degraded"]) {
    const f = visaFixture(state), handler = f.load("app/api/visa-appointments/route.ts");
    const response = await handler.POST(new Request("https://example.test/api/visa-appointments", { method: "POST", body: JSON.stringify({ countryCode: "DE", applicationCity: "İstanbul", visaCategory: "tourism", applicantsCount: 1, earliestDate: "2026-09-20", latestDate: "2026-10-20", notifyInApp: true }) }));
    assert.equal(response.status, 503); assert.equal((await response.json()).code, "worker_unavailable"); assert.equal(f.writes.length, 0);
  }
});
await test("visa: offline pause remains available but resume and retry cannot claim success", async () => {
  for (const action of ["pause", "resume", "retry"]) {
    const f = visaFixture("offline"); f.setAction(action);
    const response = await f.load("app/api/visa-appointments/[id]/route.ts").PATCH(new Request("https://example.test", { method: "PATCH", body: JSON.stringify({ action }) }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    assert.equal(response.status, action === "pause" ? 200 : 503); assert.equal(f.writes.length, action === "pause" ? 1 : 0);
  }
});
console.log(`${passed}/${passed + failed} travel readiness behavior checks passed.`);
if (failed) process.exit(1);
