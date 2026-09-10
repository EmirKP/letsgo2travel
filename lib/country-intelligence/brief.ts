import { getAdvisory } from "./advisories";
import { plainText, publicJson, publicLink, publicText } from "./fetch";
import { COUNTRY_TIME_ZONES } from "./time-zones";
import { parseNewsRss } from "./rss";
import { countryNewsTerms } from "./news-countries";
import { verifiedElections } from "./elections";
import type { CalendarItem, CountryBrief, NewsItem } from "./types";

const ZONES: Record<string, string> = {
  TR: "Europe/Istanbul", MD: "Europe/Chisinau", RU: "Europe/Moscow", IR: "Asia/Tehran", UA: "Europe/Kyiv",
  IL: "Asia/Jerusalem", PS: "Asia/Hebron", AE: "Asia/Dubai", AZ: "Asia/Baku", GE: "Asia/Tbilisi",
  BA: "Europe/Sarajevo", RS: "Europe/Belgrade", IT: "Europe/Rome", GR: "Europe/Athens", GB: "Europe/London",
  US: "America/New_York", JP: "Asia/Tokyo", TH: "Asia/Bangkok", ID: "Asia/Jakarta", AU: "Australia/Sydney",
  FR: "Europe/Paris", DE: "Europe/Berlin", ES: "Europe/Madrid", CN: "Asia/Shanghai", CA: "America/Toronto",
};
export function localDateForCountry(code: string, now = new Date()) {
  const timeZone = ZONES[code] || COUNTRY_TIME_ZONES[code] || "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return { timeZone, today: `${part("year")}-${part("month")}-${part("day")}` };
}

export function newsTopic(title: string): NewsItem["topic"] {
  const has = (terms: string) => new RegExp(`(^|[^\\p{L}])(${terms})([^\\p{L}]|$)`, "iu").test(title);
  if (has("elections?|ballots?|polling|seçim\\p{L}*|sandık\\p{L}*")) return "elections";
  if (has("airports?|airspace|flights?|rail|strikes?|uçuş\\p{L}*|havaliman\\p{L}*|havaalan\\p{L}*|hava sahası|grev\\p{L}*")) return "transport";
  if (has("floods?|flooding|storms?|earthquakes?|wildfires?|sel|deprem\\p{L}*|fırtına\\p{L}*|yangın\\p{L}*")) return "weather";
  if (has("conflicts?|attacks?|wars?|protests?|savaş\\p{L}*|saldırı\\p{L}*|çatışma\\p{L}*|protesto\\p{L}*")) return "security";
  return "general";
}

type Article = { title?: string; url?: string; domain?: string; language?: string; seendate?: string };
export function normalizeNews(raw: { articles?: Article[] }, now = new Date()): NewsItem[] {
  if (!Array.isArray(raw.articles)) return [];
  const seen = new Set<string>();
  const result: NewsItem[] = [];
  for (const row of raw.articles) {
    const url = publicLink(row.url);
    const title = plainText(row.title, 200);
    const timestamp = (row.seendate || "").replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
    const age = now.getTime() - Date.parse(timestamp);
    const dedupe = title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (!url || !title || !Number.isFinite(age) || age < 0 || age > 7 * 86_400_000 || seen.has(dedupe)) continue;
    seen.add(dedupe);
    result.push({ title, url, publisher: new URL(url).hostname.replace(/^www\./, ""), language: plainText(row.language, 30),
      firstSeenAt: new Date(timestamp).toISOString(), topic: newsTopic(title), publishedAt: null, eventDate: null, provider: "GDELT" });
    if (result.length === 8) break;
  }
  return result;
}

export async function getCountryNews(code: string): Promise<{ news: NewsItem[]; newsState: CountryBrief["newsState"] }> {
  const terms = countryNewsTerms(code).filter(name => code !== "GE" || name !== "Georgia");
  const countryQuery = `(${terms.map(name => `"${name.replace(/["\\]/g, "")}"`).join(" OR ")})`;
  const query = `${countryQuery} (election OR tourism OR airport OR airspace OR conflict OR protest OR flood OR strike)`;
  const params = new URLSearchParams({ query, mode: "artlist", format: "json", maxrecords: "12", timespan: "7d", sort: "datedesc" });
  const feeds = [
    { url: "https://www.aa.com.tr/tr/rss/default?cat=guncel", provider: "Anadolu Ajansı" as const },
    { url: "https://www.aa.com.tr/tr/rss/default?cat=dunya", provider: "Anadolu Ajansı" as const },
    { url: "https://feeds.bbci.co.uk/news/world/rss.xml", provider: "BBC" as const },
    ...(code === "GB" ? [{ url: "https://feeds.bbci.co.uk/news/uk/rss.xml", provider: "BBC" as const, countryScope: "GB" }] : []),
  ];
  const results = await Promise.allSettled([
    publicJson<{ articles?: Article[] }>(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, 1800, 8000).then(raw => { if (!Array.isArray(raw.articles)) throw new Error("Invalid news response"); return normalizeNews(raw); }),
    ...feeds.map(feed => publicText(feed.url, 900, 8000).then(xml => {
      if (!/<rss(?:\s|>)/i.test(xml) || !/<channel(?:\s|>)/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Invalid news feed");
      return parseNewsRss(xml, code, feed.provider, new Date(), "countryScope" in feed ? feed.countryScope : undefined);
    })),
  ]);
  const rows = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  rows.sort((a,b) => (b.publishedAt || b.firstSeenAt).localeCompare(a.publishedAt || a.firstSeenAt));
  const urls = new Set<string>(); const titles = new Set<string>();
  const unique = rows.filter(row => {
    const title = row.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (urls.has(row.url) || titles.has(title)) return false;
    urls.add(row.url); titles.add(title); return true;
  }).map(row => ({ ...row, topic: newsTopic(row.title) }));
  // A healthy world feed with no matching headlines does not establish that
  // this country's news search succeeded. Only a country query/scoped feed
  // can establish an empty result when no matching stories were returned.
  const countrySourceOk = results[0].status === "fulfilled" || feeds.some((feed, index) =>
    "countryScope" in feed && feed.countryScope === code && results[index + 1].status === "fulfilled");
  return { news: unique.slice(0,12), newsState: unique.length || countrySourceOk ? "ok" : "unavailable" };
}

type Holiday = { date: string; localName: string; name: string; countryCode: string; global: boolean; counties: string[] | null; types: string[] };
export function upcomingCalendar(raw: Holiday[], code: string, today: string): CalendarItem[] {
  const end = new Date(`${today}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 30);
  const until = end.toISOString().slice(0, 10);
  const items: CalendarItem[] = raw.filter(row => row.countryCode === code && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
    && Number.isFinite(Date.parse(`${row.date}T12:00:00Z`)) && new Date(`${row.date}T12:00:00Z`).toISOString().slice(0, 10) === row.date
    && row.date >= today && row.date <= until && Array.isArray(row.types) && row.types.includes("Public"))
    .map(row => ({ id: `${code}:${row.date}:${plainText(row.name, 100)}`, date: row.date,
      name: { tr: plainText(row.localName, 100), en: plainText(row.name, 100) }, type: "public-holiday" as const,
      countryWide: row.global === true, regions: Array.isArray(row.counties) ? row.counties.slice(0, 20) : [],
      sourceUrl: `https://date.nager.at/api/v3/PublicHolidays/${row.date.slice(0, 4)}/${code}` }));
  // Annual remembrance is not a statutory public holiday; never mark shops
  // closed or sirens an emergency. The year and "today" are resolved at runtime.
  const remembrance = `${today.slice(0, 4)}-11-10`;
  if (code === "TR" && remembrance >= today && remembrance <= until) items.push({ id: `${code}:${remembrance}:remembrance`, date: remembrance,
    name: { tr: "10 Kasım · Atatürk'ü Anma Günü", en: "10 November · Atatürk Remembrance Day" }, type: "observance", countryWide: true, regions: [],
    sourceUrl: "https://www.meb.gov.tr/okullara-10-kasim-ataturku-anma-etkinlikleri-yazisi-gonderildi/haber/35198/tr" });
  return [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function getCalendar(code: string, today: string) {
  const year = Number(today.slice(0, 4));
  const end = new Date(`${today}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 30);
  const years = end.getUTCFullYear() === year ? [year] : [year, year + 1];
  const results = await Promise.allSettled(years.map(y => publicJson<Holiday[]>(`https://date.nager.at/api/v3/PublicHolidays/${y}/${code}`, 86_400, 6000)));
  const values = results.flatMap(result => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
  const elections = await verifiedElections(code, today);
  return { calendar: [...upcomingCalendar(values, code, today), ...elections].sort((a,b)=>a.date.localeCompare(b.date)), calendarState: results.every(r => r.status === "fulfilled" && Array.isArray(r.value)) ? "ok" as const : "unavailable" as const };
}

export async function getCountryBrief(code: string): Promise<CountryBrief> {
  const { timeZone, today } = localDateForCountry(code);
  const [advisory, news, calendar] = await Promise.all([getAdvisory(code), getCountryNews(code), getCalendar(code, today)]);
  return { code, today, timeZone, checkedAt: new Date().toISOString(), advisory, ...news, ...calendar };
}
