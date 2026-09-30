import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function modules(overrides = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({ URL, URLSearchParams, Request, Response, Headers, AbortSignal, Date, Intl, console, setTimeout, clearTimeout,
    process: { env: { TICKETMASTER_API_KEY: "test-ticketmaster", PREDICTHQ_ACCESS_TOKEN: "test-predicthq" } }, ...globals });
  const load = filename => {
    let full = path.resolve(filename);
    if (!existsSync(full)) full += ".ts";
    if (cache.has(full)) return cache.get(full).exports;
    const loaded = { exports: {} }; cache.set(full, loaded);
    const source = ts.transpileModule(readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const resolve = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith("@/") ? load(name.slice(2)) : name.startsWith(".") ? load(path.resolve(path.dirname(full), name)) : require(name);
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context, { filename: full })(resolve, loaded, loaded.exports);
    return loaded.exports;
  };
  return load;
}
const search = { countryCode: "TR", startDate: "2026-09-29", endDate: "2027-03-28", category: "concert", featured: true, limit: 6 };
const concert = (id, day, extra = {}) => ({ id, name: `Concert ${id}`, url: `https://ticketmaster.com/event/${id}`, classifications: [{ segment: { name: "Music" } }], dates: { start: { localDate: day } }, _embedded: { venues: [{ city: { name: "Istanbul" }, country: { countryCode: "TR" } }] }, ...extra });
function service(fetch, env) {
  return modules({ "@/lib/supabaseAdmin": { getSupabaseAdmin: () => null } }, { fetch, ...(env ? { process: { env } } : {}) })("lib/travel-events.ts");
}
test("PredictHQ failure falls back to real Ticketmaster concerts without fabricating rank or reordering relevance", async () => {
  const calls = [];
  const api = service(async input => {
    const url = new URL(input); calls.push(url);
    if (url.hostname === "api.predicthq.com") return new Response("unavailable", { status: 403 });
    return Response.json({ _embedded: { events: [concert("important", "2027-01-10"), concert("nearby", "2026-10-02")] } });
  });
  const result = await api.searchTravelEvents(search);
  assert.deepEqual(Array.from(result.events, event => event.id), ["ticketmaster:important", "ticketmaster:nearby"]);
  assert.equal(result.events[0].impactRank, undefined);
  assert.equal(result.events[0].featured, true);
  assert.equal(result.events[0].timePrecision, "date");
  assert.equal(calls[0].searchParams.get("sort"), "rank,start");
  assert.equal(calls[1].searchParams.get("sort"), "relevance,desc");
  assert.equal(calls[1].searchParams.get("classificationName"), "music");
  assert.equal(calls[1].searchParams.get("countryCode"), "TR");
  assert.equal(result.coverageStatus, "live");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.partial, true);
  assert.equal(result.providers.predicthq.succeeded, false);
  assert.equal(result.providers.ticketmaster.succeeded, true);
});
test("Ticketmaster-only configuration still supplies concert highlights", async () => {
  const api = service(async url => { assert.match(url, /ticketmaster/); return Response.json({ _embedded: { events: [concert("real", "2026-10-02")] } }); }, { TICKETMASTER_API_KEY: "test" });
  const result = await api.searchTravelEvents(search);
  assert.equal(result.events.length, 1);
  assert.equal(result.coverageLimited, false);
  assert.equal(result.partial, false);
});
test("Empty impact results use fallback, filtering other categories and canceled or postponed shows", async () => {
  const api = service(async url => url.includes("predicthq") ? Response.json({ results: [] }) : Response.json({ _embedded: { events: [
    concert("live", "2026-10-02"),
    concert("canceled", "2026-10-02", { dates: { start: { localDate: "2026-10-02" }, status: { code: "canceled" } } }),
    concert("cancelled", "2026-10-02", { dates: { start: { localDate: "2026-10-02" }, status: { code: "cancelled" } } }),
    concert("postponed", "2026-10-02", { dates: { start: { localDate: "2026-10-02" }, status: { code: "postponed" } } }),
    concert("rescheduled", "2026-10-02", { dates: { start: { localDate: "2026-10-02" }, status: { code: "rescheduled" } } }),
    concert("sports", "2026-10-02", { classifications: [{ segment: { name: "Sports" } }] }),
  ] } }));
  const result = await api.searchTravelEvents(search);
  assert.deepEqual(Array.from(result.events, event => event.id), ["ticketmaster:live"]);
  assert.equal(result.partial, false);
});
test("Successful impact feed is retained without an unnecessary second provider request", async () => {
  let calls = 0;
  const api = service(async url => { calls++; assert.match(url, /predicthq/); return Response.json({ results: [{ id: "ranked", title: "Ranked concert", start: "2026-10-02T18:00:00Z", category: "concerts", rank: 80, country: "TR" }] }); });
  const result = await api.searchTravelEvents(search);
  assert.equal(calls, 1);
  assert.equal(result.events[0].impactRank, 80);
  assert.equal(result.fallbackUsed, false);
});
test("Complete provider failure stays distinguishable from an empty successful response", async () => {
  const failed = await service(async () => new Response(null, { status: 503 })).searchTravelEvents(search);
  assert.equal(failed.coverageStatus, "provider_unavailable");
  assert.equal(failed.events.length, 0);
  const empty = await service(async url => Response.json(url.includes("predicthq") ? { results: [] } : {})).searchTravelEvents(search);
  assert.equal(empty.coverageStatus, "no_results");
  assert.equal(empty.partial, false);
});
test("No configured provider returns an explicit unavailable setup state without making network calls", async () => {
  const result = await service(async () => { assert.fail("No provider should be called"); }, {}).searchTravelEvents(search);
  assert.equal(result.coverageStatus, "not_configured");
  assert.equal(result.providerConfigured, false);
  assert.equal(result.events.length, 0);
});
test("Ordinary event search keeps its chronological Ticketmaster request", async () => {
  const api = service(async url => { assert.equal(new URL(url).searchParams.get("sort"), "date,asc"); return Response.json({ _embedded: { events: [concert("real", "2026-10-02")] } }); });
  const result = await api.searchTravelEvents({ ...search, featured: false });
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.events[0].featured, false);
});

test("Ordinary searches retain canceled events with the official Ticketmaster status mapped correctly", async () => {
  const api = service(async () => Response.json({ _embedded: { events: [
    concert("canceled", "2026-10-02", { dates: { start: { localDate: "2026-10-02" }, status: { code: "canceled" } } }),
  ] } }), { TICKETMASTER_API_KEY: "test" });
  const result = await api.searchTravelEvents({ ...search, featured: false });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].status, "cancelled");
});

const response = (data = [], status = "live", extra = {}) => ({ data, meta: { coverageStatus: status, providerConfigured: true, partial: false, ...extra } });
function mobile(loader) { return modules({ "./api": { listTravelEvents: loader } })("mobile/src/lib/featuredEvents.ts").loadFeaturedEvents; }
test("Unsupported country coverage can recover with a worldwide concert list", async () => {
  const calls = [];
  const result = await mobile(async query => { calls.push(query); return calls.length === 1 ? response([], "limited", { coverageLimited: true }) : response([{ id: "world" }]); })("XK", search);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].countryCode, undefined);
  assert.equal(result.global, true);
  assert.equal(result.events[0].id, "world");
  assert.equal(result.partial, true);
});
test("Network error also recovers worldwide; both errors remain unavailable", async () => {
  let calls = 0;
  const recovered = await mobile(async () => { if (++calls === 1) throw new Error("network"); return response([{ id: "world" }]); })("TR", search);
  assert.equal(recovered.unavailable, false);
  assert.equal(recovered.partial, true);
  const failed = await mobile(async () => { throw new Error("network"); })("TR", search);
  assert.equal(failed.unavailable, true);
  assert.equal(failed.events.length, 0);
});
test("Worldwide search and unconfigured provider do not repeat identical requests", async () => {
  let calls = 0;
  const fetch = async () => { calls++; return response([], "not_configured"); };
  const first = await mobile(fetch)("", search);
  assert.equal(calls, 1);
  assert.equal(first.notConfigured, true);
  await mobile(fetch)("TR", search);
  assert.equal(calls, 2);
});
test("Provider outages are not cached while successful live responses retain cache policy", async () => {
  let status = "provider_unavailable";
  const load = modules({ "next/server": { NextResponse: Response }, "@/lib/airport-search": { listEventCities: () => [] }, "@/lib/travel-events": { searchTravelEvents: async () => ({ events: [], coverageStatus: status }) } });
  const route = load("app/api/events/route.ts");
  const failed = await route.GET(new Request("https://example.test/api/events?featured=true"));
  assert.equal(failed.headers.get("cache-control"), "no-store");
  status = "live";
  const live = await route.GET(new Request("https://example.test/api/events?featured=true"));
  assert.match(live.headers.get("cache-control"), /s-maxage=900/);
});
