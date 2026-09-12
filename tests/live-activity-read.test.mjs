import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function modules(extra = {}) {
  const logs = [], cache = new Map();
  const context = vm.createContext({ AbortSignal, setTimeout, clearTimeout, Date, Map,
    console: { warn: (...args) => logs.push(args), info: (...args) => logs.push(args) }, ...extra });
  const load = file => {
    const full = path.resolve(file.endsWith(".ts") ? file : file + ".ts");
    if (cache.has(full)) return cache.get(full).exports;
    const loaded = { exports: {} }; cache.set(full, loaded);
    const source = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context)(name => load(path.resolve(path.dirname(full), name)), loaded, loaded.exports);
    return loaded.exports;
  };
  return { load, logs };
}
const noWait = async () => {};
const ok = { data: [], error: null, status: 200 };

test("transient read recovers; fresh abort signal per attempt and bounded backoff", async () => {
  const { load, logs } = modules(), signals = [], waits = [];
  const result = await load("lib/live-activity-read").readLiveActivityTrips(signal => {
    signals.push(signal); return Promise.resolve(signals.length < 3 ? { data: null, error: { code: "", message: "fetch failed" }, status: 0 } : ok);
  }, async ms => waits.push(ms));
  assert.equal(result, ok); assert.equal(new Set(signals).size, 3);
  assert.deepEqual(waits, [200, 400]); assert.equal(logs.at(-1)[0], "live_activity_trip_read_recovered");
});
test("persistent 503 remains a failure after three attempts", async () => {
  const { load } = modules(); let calls = 0;
  const api = load("lib/live-activity-read");
  const result = await api.readLiveActivityTrips(async () => { calls++; return { data: null, error: { message: "unavailable" }, status: 503 }; }, noWait);
  assert.equal(calls, 3); assert.ok(result.error); assert.match(api.tripReadFailure(result.error, result.status).message, /http_503:upstream/);
});
test("auth, SQL schema and permission errors do not retry", async () => {
  for (const [code, status] of [["42501",403],["42P01",500],["42703",400],["PGRST301",401],["23505",500]]) {
    const { load } = modules(); let calls = 0;
    await load("lib/live-activity-read").readLiveActivityTrips(async () => { calls++; return { data: null, error: { code }, status }; }, noWait);
    assert.equal(calls, 1, code);
  }
});
test("HTTP rate limiting and DB connection failures recover", async () => {
  for (const failure of [{ error: { message: "busy" }, status: 429 }, { error: { code: "08006" }, status: 500 }, { error: { code: "ECONNRESET" }, status: 0 }]) {
    const { load } = modules(); let calls = 0;
    await load("lib/live-activity-read").readLiveActivityTrips(async () => ++calls === 1 ? { data: null, ...failure } : ok, noWait);
    assert.equal(calls, 2);
  }
});
test("thrown transport errors retry, programming errors do not", async () => {
  for (const [message, expected] of [["fetch failed",3],["unexpected property",1]]) {
    const { load } = modules(); let calls = 0;
    const result = await load("lib/live-activity-read").readLiveActivityTrips(async () => { calls++; throw new TypeError(message); }, noWait);
    assert.equal(calls, expected); assert.ok(result.error);
  }
});
test("timeout cancels each pending read and eventually returns failure", async () => {
  const durations = [];
  const { load } = modules({ AbortSignal: { timeout(ms) { durations.push(ms); return AbortSignal.timeout(5); } } });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await load("lib/live-activity-read").readLiveActivityTrips(signal => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once:true })), noWait);
    assert.ok(result.error); assert.deepEqual(durations, [3000,3000,3000]);
  } finally { clearTimeout(keepAlive); }
});
test("logs and final error never expose provider messages, details or tokens", async () => {
  const { load, logs } = modules();
  const error = { code: "SECRET_CANARY:https://example.com", message: "fetch failed SECRET_CANARY", details: "user row SECRET_CANARY" };
  const api = load("lib/live-activity-read");
  await api.readLiveActivityTrips(async () => ({ error, data:null, status:0 }), noWait);
  assert.ok(!JSON.stringify(logs).includes("SECRET_CANARY"));
  assert.ok(!api.tripReadFailure(error,0).message.includes("SECRET_CANARY"));
});
test("actual store retries trip SELECT only and retains airport/arrival/language", async () => {
  const { load } = modules(); let calls = 0; const selections = [];
  const supabase = { from(table) {
    assert.equal(table,"trips");
    const query = { select(columns) { selections.push(columns); return this; }, gte() { return this; }, lt() { return this; }, in() { return this; }, order() { return this; }, limit() { return this; },
      abortSignal(signal) { assert.ok(signal instanceof AbortSignal); calls++;
        return Promise.resolve(calls === 1 ? { data:null,error:{message:"fetch failed"},status:0 } : { error:null,status:200,data:[{id:"trip",user_id:"user",departure_at:"2026-09-13T12:00:00Z",arrival_at:"2026-09-13T15:00:00Z",origin_iata:"IST",destination_iata:"LHR",app_language:"en"}] }); } };
    return query;
  } };
  const trips = await load("lib/live-activity-store").createSupabaseLiveActivityStore(supabase).tripsDepartingBetween(Date.now(),Date.now()+1000,40);
  assert.equal(calls,2); assert.equal(selections[0],selections[1]); assert.equal(trips[0].originIata,"IST"); assert.equal(trips[0].language,"en"); assert.ok(trips[0].arrivalAtMs > trips[0].departureAtMs);
});
test("actual store preserves missing-column compatibility without retrying SQL error", async () => {
  const { load } = modules(); let calls=0; const columns=[];
  const query = { select(value) { columns.push(value); return this; }, gte() { return this; }, lt() { return this; }, in() { return this; }, order() { return this; }, limit() { return this; }, abortSignal() { return Promise.resolve(++calls === 1 ? { data:null,error:{code:"42703"},status:400 } : ok); } };
  await load("lib/live-activity-store").createSupabaseLiveActivityStore({from:()=>query}).tripsDepartingBetween(0,1000,40);
  assert.equal(calls,2); assert.ok(columns[0].includes("arrival_at")); assert.ok(!columns[1].includes("arrival_at"));
});
