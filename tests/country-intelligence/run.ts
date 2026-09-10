import assert from "node:assert/strict";
import { estimateCost, quoteComparison } from "../../lib/country-intelligence/cost-model";
import { readMonthlyIndex, getRates } from "../../lib/country-intelligence/economy";
import { advisoryLevel } from "../../lib/country-intelligence/advisories";
import { getCountryNews, localDateForCountry, normalizeNews, newsTopic, upcomingCalendar } from "../../lib/country-intelligence/brief";
import { publicJson, publicLink } from "../../lib/country-intelligence/fetch";
import type { CostData } from "../../lib/country-intelligence/types";
import { lastVerifiedAdvice, VERIFIED_MONTHLY_INDICES } from "../../lib/country-intelligence/last-verified";
import { parseNewsRss } from "../../lib/country-intelligence/rss";
import { matchesNewsCountry } from "../../lib/country-intelligence/news-countries";
import { CITY_BENCHMARKS, CITY_PRICE_MONTH } from "../../lib/country-intelligence/city-benchmarks";
import { COUNTRY_TIME_ZONES } from "../../lib/country-intelligence/time-zones";
import { COST_CURRENCIES } from "../../lib/country-intelligence/currencies";
import { PASSPORTS, DESTINATION_INDEX, passportStatus } from "../../lib/country-intelligence/passports";
import { decodeAvatar, ownedAvatarPath } from "../../lib/profile-photo";

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
    const recent = new Date(Date.now() - 60_000).toUTCString();
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes("gdeltproject")) {
        return url.includes("France") ? new Response('{"articles":[]}') : new Response("upstream failed", { status: 503 });
      }
      if (url.includes("news/uk/")) return new Response(rss("Rail strike disrupts travel", recent));
      if (url.includes("aa.com.tr")) return new Response(rss("Dubai airport announces flight changes", recent, "https://www.aa.com.tr/tr/dunya/dubai-update/123"));
      return new Response(rss("Dubai airport announces flight changes", recent));
    };
    const uae = await getCountryNews("AE");
    test("UAE gets Dubai headlines during a GDELT outage and deduplicates feeds", () => {
      assert.equal(uae.newsState, "ok"); assert.equal(uae.news.length, 1); assert.equal(uae.news[0].topic, "transport");
    });
    const uk = await getCountryNews("GB");
    test("UK national feed includes stories without the formal country name", () => {
      assert.equal(uk.newsState, "ok"); assert.equal(uk.news[0].title, "Rail strike disrupts travel");
    });
    const georgia = await getCountryNews("GE");
    test("unrelated successful world feeds do not mask a failed country search", () => {
      assert.equal(georgia.newsState, "unavailable"); assert.equal(georgia.news.length, 0);
    });
    const france = await getCountryNews("FR");
    test("an empty successful country search is distinct from an outage", () => {
      assert.equal(france.newsState, "ok"); assert.equal(france.news.length, 0);
    });
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
test("50 city benchmarks have distinct identities, nonnegative components and local currencies", () => {
  assert.equal(CITY_BENCHMARKS.length,50); assert.equal(new Set(CITY_BENCHMARKS.map(row=>row.id)).size,50);
  for(const row of CITY_BENCHMARKS) { assert.ok(COST_CURRENCIES[row.code]); assert.ok(row.basket > row.hotel); assert.ok(row.hotel > 0 && row.meal > 0 && row.travel >= 0); }
  assert.equal(CITY_PRICE_MONTH,"2026-05");
});
test("Rome and Florence do not collide under a shared country code", () => {
  const italy=CITY_BENCHMARKS.filter(row=>row.code==="IT");assert.equal(italy.length,3);assert.equal(new Set(italy.map(row=>row.id)).size,3);
});
test("reference FX to local, then CPI, then current FX avoids double conversion", () => {
  const data={...fixture,baseline:{...fixture.baseline,daily:100*1.2}};assert.equal(estimateCost(data,"average",now).converted,7200);
});
test("passport matrix has 199 complete rows and ETA is never labelled visa-free", () => {
  assert.equal(Object.keys(PASSPORTS).length,199);for(const row of Object.values(PASSPORTS))assert.equal(row.length,DESTINATION_INDEX.size);
  assert.equal(passportStatus("XX","ordinary","IT"),"unknown");assert.equal(passportStatus("DE","diplomatic","US"),"unknown");
  assert.equal(passportStatus("TR","invalid-type","IT"),"unknown");
  assert.equal(passportStatus("TR","special","IT"),"free");assert.equal(passportStatus("TR","special","GB"),"required");
  for(const [code,index] of DESTINATION_INDEX)if(PASSPORTS.GB[index]==="t")assert.equal(passportStatus("GB","ordinary",code),"unknown");
});
test("ID-card override is restricted to reviewed Turkish entries", () => {
  assert.equal(passportStatus("TR","ordinary","GE"),"id_card");assert.notEqual(passportStatus("US","ordinary","GE"),"id_card");assert.equal(passportStatus("TR","ordinary","AZ"),"id_card");
});
test("IANA reference zones cover 247 territories and remain valid", () => {
  assert.ok(Object.keys(COUNTRY_TIME_ZONES).length>=240);for(const zone of Object.values(COUNTRY_TIME_ZONES))assert.doesNotThrow(()=>new Intl.DateTimeFormat("en",{timeZone:zone}));
  assert.equal(localDateForCountry("NZ",new Date("2026-11-06T12:30:00Z")).today,"2026-11-07");
});
const rss=(title:string,date="Tue, 08 Sep 2026 09:00:00 GMT",url="https://www.bbc.com/news/example")=>`<rss><channel><item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate></item></channel></rss>`;
test("publisher RSS preserves publication date but never invents event date",()=>{
  const rows=parseNewsRss(rss("Sweden election update"),"SE","BBC",now);assert.equal(rows.length,1);assert.equal(rows[0].publishedAt,"2026-09-08T09:00:00.000Z");assert.equal(rows[0].eventDate,null);
});
test("RSS discards future, stale, unrelated and unsafe publisher stories",()=>{
  assert.equal(parseNewsRss(rss("Sweden election update","Tue, 08 Sep 2027 09:00:00 GMT"),"SE","BBC",now).length,0);
  assert.equal(parseNewsRss(rss("Sweden election update","Tue, 08 Aug 2026 09:00:00 GMT"),"SE","BBC",now).length,0);
  assert.equal(parseNewsRss(rss("Canada update"),"SE","BBC",now).length,0);
  assert.equal(parseNewsRss(rss("Sweden update",undefined,"https://example.com/a"),"SE","BBC",now).length,0);
  assert.equal(parseNewsRss('<!DOCTYPE x>'+rss("Sweden update"),"SE","BBC",now).length,0);
});
test("country aliases match common destinations without substring collisions", () => {
  for (const title of ["Dubai airport update", "UAE tourism news", "Abu Dhabi flights", "BAE'de grev"]) assert.equal(matchesNewsCountry(title, "AE"), true);
  for (const title of ["Britain rail strike", "British flights cancelled", "UK airport update", "Londra'da ulaşım"]) assert.equal(matchesNewsCountry(title, "GB"), true);
  assert.equal(matchesNewsCountry("Thai airport update", "TH"), true);
  assert.equal(matchesNewsCountry("Thailander unrelated substring", "TH"), false);
  assert.equal(matchesNewsCountry("Georgia governor visits Atlanta", "GE"), false);
  assert.equal(matchesNewsCountry("Georgian airports in Tbilisi", "GE"), true);
  assert.equal(matchesNewsCountry("Washington comments on world affairs", "US"), false);
});
test("a country-scoped feed cannot leak into another country", () => {
  assert.equal(parseNewsRss(rss("Rail strike disrupts travel"), "GB", "BBC", now, "GB").length, 1);
  assert.equal(parseNewsRss(rss("Rail strike disrupts travel"), "AE", "BBC", now, "GB").length, 0);
  assert.equal(parseNewsRss(rss("Sweden election update"), "SE", "Anadolu Ajansı", now).length, 0);
});
test("Turkish inflected headlines appear in the correct news filters", () => {
  assert.equal(newsTopic("Dubai havalimanındaki uçuşların bazıları iptal edildi"), "transport");
  assert.equal(newsTopic("İngiltere'de demiryolu grevinin etkileri"), "transport");
  assert.equal(newsTopic("Gazze'de saldırısında yaralananlar var"), "security");
  assert.equal(newsTopic("Yunanistan yangınları için uyarı"), "weather");
  assert.equal(newsTopic("İsveç seçimlerine hazırlanıyor"), "elections");
});
test("avatars reject active formats, external URLs and oversized data",()=>{
  assert.equal(decodeAvatar("https://example.com/x.jpg"),null);assert.equal(decodeAvatar("data:image/svg+xml;base64,PHN2Zz4="),null);assert.equal(decodeAvatar("data:image/jpeg;base64,"+"A".repeat(400000)),null);
});
test("avatar paths cannot reference another account or escape the user folder",()=>{
  const a="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  assert.equal(ownedAvatarPath(`${a}/${b}.jpg`,a),true);assert.equal(ownedAvatarPath(`${b}/${a}.jpg`,a),false);assert.equal(ownedAvatarPath(`${a}/../${b}.jpg`,a),false);assert.equal(ownedAvatarPath(`${a}/${b}.jpg`,".*"),false);
});
void networkContracts().catch(error => { console.error(error); process.exitCode = 1; });
