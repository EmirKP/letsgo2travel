import assert from "node:assert/strict";
import { estimateCost, quoteComparison } from "../../lib/country-intelligence/cost-model";
import { readMonthlyIndex, getRates } from "../../lib/country-intelligence/economy";
import { advisoryLevel } from "../../lib/country-intelligence/advisories";
import { localDateForCountry, normalizeNews, newsTopic, upcomingCalendar } from "../../lib/country-intelligence/brief";
import { publicJson, publicLink } from "../../lib/country-intelligence/fetch";
import type { CostData } from "../../lib/country-intelligence/types";
import { lastVerifiedAdvice, VERIFIED_MONTHLY_INDICES } from "../../lib/country-intelligence/last-verified";

const now = new Date("2026-09-08T12:00:00Z");
const fixture: CostData = {
  baseline: { code: "IT", city: { tr: "Roma", en: "Rome" }, currency: "EUR", daily: 100, referenceMonth: "2025-08", source: null, quality: "user-quote" },
  fx: { base: "EUR", quote: "TRY", rate: 50, date: "2026-09-07", sourceUrl: "https://frankfurter.dev/" },
  inflation: { provider: "Eurostat", sourceUrl: "https://ec.europa.eu/", period: "2026-08", annualPercent: 20, index: 120, referenceIndex: 100, referenceMonth: "2025-08", checkedAt: now.toISOString() },
};
let count = 0;
function test(name: string, run: () => void) { run(); count++; console.log(`PASS ${name}`); }
test("local CPI ratio before FX conversion", () => assert.equal(estimateCost(fixture, "average", now).converted, 6000));
test("unknown baseline month is never inflated", () => assert.equal(estimateCost({ ...fixture, baseline: { ...fixture.baseline, referenceMonth: null } }, "average", now).converted, 5000));
test("annual inflation is context, not a price multiplier", () => assert.equal(estimateCost({ ...fixture, inflation: { ...fixture.inflation!, provider: "World Bank", period: "2024", index: null } }, "average", now).converted, 5000));
test("future, stale and mismatched currency rates are rejected", () => {
  for (const fx of [{ ...fixture.fx!, date: "2026-09-09" }, { ...fixture.fx!, date: "2026-08-20" }, { ...fixture.fx!, base: "USD" }, { ...fixture.fx!, rate: 0 }]) assert.equal(estimateCost({ ...fixture, fx }, "average", now).converted, null);
});
test("outside-centre transport can cancel hotel savings", () => assert.deepEqual(quoteComparison(100, 80, 30, 3, 4, 2), { centre: 300, outside: 480, saving: -180 }));
test("room cost is not multiplied by traveller count", () => assert.deepEqual(quoteComparison(100, 80, 0, 3, 4, 2), { centre: 300, outside: 240, saving: 60 }));
test("invalid quote inputs produce no total", () => {
  assert.equal(quoteComparison(-1, 80, 0, 3, 4, 2), null);
  assert.equal(quoteComparison(100, 80, 0, 3, 2, 2), null);
  assert.equal(quoteComparison(100, 80, 0, 3, 4, 1.5), null);
});
test("monthly index uses the latest non-future period and exact reference month", () => {
  const raw = { id: ["geo", "time"], size: [1, 3], dimension: { time: { category: { index: { "2025-08": 0, "2026-08": 1, "2027-01": 2 } } } }, value: { "0": 100, "1": 120, "2": 200 } };
  const result = readMonthlyIndex(raw, "2025-08", now)!;
  assert.equal(result.period, "2026-08"); assert.equal(result.referenceIndex, 100); assert.ok(Math.abs(result.annualPercent! - 20) < 1e-9);
});
test("countrywide and regional warnings remain distinct", () => {
  assert.equal(advisoryLevel(["avoid_all_travel_to_whole_country"]).scope, "whole-country");
  assert.equal(advisoryLevel(["avoid_all_travel_to_parts"]).level, "regional");
  assert.equal(advisoryLevel(["new_unknown_provider_code"]).level, "unavailable");
});
test("offline warnings explicitly retain their verification date", () => {
  const advice = lastVerifiedAdvice("UA")!;
  assert.equal(advice.freshness, "last-known"); assert.equal(advice.scope, "regional");
  assert.equal(advice.source.checkedAt, "2026-09-08T00:00:00Z"); assert.equal(lastVerifiedAdvice("XX"), null);
  assert.equal(VERIFIED_MONTHLY_INDICES.TR.points["2025-08"], undefined);
});
test("Turkey remembrance uses the local date across midnight", () => assert.equal(localDateForCountry("TR", new Date("2026-11-09T22:30:00Z")).today, "2026-11-10"));
test("10 November is an observance, not a public holiday", () => {
  const items = upcomingCalendar([], "TR", "2026-11-10");
  assert.equal(items.length, 1); assert.equal(items[0].type, "observance"); assert.equal(items[0].date, "2026-11-10");
  assert.equal(upcomingCalendar([], "TR", "2026-09-08").length, 0);
  assert.equal(upcomingCalendar([], "MD", "2026-11-10").length, 0);
});
test("regional holidays keep their coverage and future year", () => {
  const item = { date: "2027-01-01", name: "Test holiday", localName: "Test", countryCode: "MD", global: false, counties: ["MD-CU"], types: ["Public"] };
  const results = upcomingCalendar([item, { ...item, date: "2026-12-01" }], "MD", "2026-12-20");
  assert.equal(results.length, 1); assert.equal(results[0].countryWide, false); assert.deepEqual(results[0].regions, ["MD-CU"]);
});
test("news rejects future/stale stories, duplicates and unsafe links", () => {
  const article = { title: "Test elections coverage", url: "https://example.org/article", seendate: "20260908T090000Z", language: "English" };
  const rows = normalizeNews({ articles: [article, { ...article, url: "https://example.net/duplicate" }, { ...article, title: "future", seendate: "20260909T000000Z" }, { ...article, title: "old", seendate: "20250101T000000Z" }, { ...article, title: "bad", url: "javascript:alert(1)" }] }, now);
  assert.equal(rows.length, 1); assert.equal(rows[0].publishedAt, null); assert.equal(rows[0].eventDate, null); assert.equal(rows[0].topic, "elections");
});
test("Turkish and English travel topics are recognized", () => {
  assert.equal(newsTopic("Uçuş iptal edildi"), "transport"); assert.equal(newsTopic("Flights cancelled"), "transport"); assert.equal(newsTopic("Seçimler ertelendi"), "elections"); assert.equal(newsTopic("Savaş uyarısı"), "security");
});
test("external links reject local networks and credentials", () => {
  assert.equal(publicLink("https://127.0.0.1/news"), null); assert.equal(publicLink("https://user:password@example.org/news"), null); assert.equal(publicLink("https://example.org/news"), "https://example.org/news");
});

async function networkContracts() {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify([{ base: "TRY", quote: "EUR", rate: 0.02, date: "2026-09-08" }])); };
    const rates = await getRates(["EUR"]);
    test("provider TRY-to-local FX is correctly inverted", () => assert.equal(rates.EUR.rate, 50));
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("", { status: 429, headers: { "retry-after": "600" } }); };
    const url = "https://api.gdeltproject.org/api/v2/doc/doc?query=isolated-test";
    await assert.rejects(publicJson(url, 10)); await assert.rejects(publicJson(url, 10));
    test("429 respects cooldown instead of retrying the provider", () => assert.equal(calls, 1));
    await assert.rejects(publicJson("http://127.0.0.1/", 10));
    test("server only fetches allowlisted HTTPS sources", () => assert.equal(calls, 1));
  } finally { globalThis.fetch = original; }
  console.log(`PASS ${count} country-intelligence checks`);
}
void networkContracts().catch(error => { console.error(error); process.exitCode = 1; });
