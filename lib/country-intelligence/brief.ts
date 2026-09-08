import { getAdvisory } from "./advisories";
import { plainText, publicJson, publicLink, publicText } from "./fetch";
import { COUNTRY_TIME_ZONES } from "./time-zones";
import { parseNewsRss } from "./rss";
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
  if (has("elections?|ballots?|polling|seçim|seçimler|sandık")) return "elections";
  if (has("airports?|airspace|flights?|rail|strikes?|uçuş|uçuşlar|havalimanı|grev")) return "transport";
  if (has("floods?|storms?|earthquakes?|wildfires?|sel|deprem|fırtına|yangın")) return "weather";
  if (has("conflicts?|attacks?|wars?|protests?|savaş|saldırı|çatışma|protesto")) return "security";
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

async function getNews(code: string): Promise<{ news: NewsItem[]; newsState: CountryBrief["newsState"] }> {
  const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  const countryQuery = code === "GE" ? '"Georgia" "Tbilisi"' : code === "TR" ? '("Turkey" OR "Türkiye")' : `"${name.replace(/["\\]/g, "")}"`;
  const query = `${countryQuery} (election OR tourism OR airport OR airspace OR conflict OR protest OR flood OR strike)`;
  const params = new URLSearchParams({ query, mode: "artlist", format: "json", maxrecords: "12", timespan: "7d", sort: "datedesc" });
  const results = await Promise.allSettled([
    publicJson<{ articles?: Article[] }>(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, 1800, 8000).then(raw => { if (!Array.isArray(raw.articles)) throw new Error("Invalid news response"); return normalizeNews(raw); }),
    publicText("https://www.aa.com.tr/tr/rss/default?cat=guncel", 900, 6000).then(xml => { if (!/<rss/i.test(xml)) throw new Error("Invalid feed"); return parseNewsRss(xml, code, "Anadolu Ajansı"); }),
    publicText("https://feeds.bbci.co.uk/news/world/rss.xml", 900, 6000).then(xml => { if (!/<rss/i.test(xml)) throw new Error("Invalid feed"); return parseNewsRss(xml, code, "BBC"); }),
  ]);
  const rows = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const unique = [...new Map(rows.map(row => [row.url, { ...row, topic: newsTopic(row.title) }])).values()];
  unique.sort((a,b) => (b.publishedAt || b.firstSeenAt).localeCompare(a.publishedAt || a.firstSeenAt));
  return { news: unique.slice(0,12), newsState: results.some(row => row.status === "fulfilled") ? "ok" : "unavailable" };
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
  const [advisory, news, calendar] = await Promise.all([getAdvisory(code), getNews(code), getCalendar(code, today)]);
  return { code, today, timeZone, checkedAt: new Date().toISOString(), advisory, ...news, ...calendar };
}
