import { publicText, plainText } from "./fetch";
import type { CalendarItem } from "./types";

// Only primary-authority dates, never inferred from a news headline.
export const ELECTIONS = [
  { code: "SE", date: "2026-09-13", tr: "İsveç · Parlamento ve yerel seçimler", en: "Sweden · Parliamentary and local elections", url: "https://www.val.se/english/future-elections/2026-elections---the-riksdag-and-regional-and-municipal-councils", pattern: /13 September 2026/i },
  { code: "NZ", date: "2026-11-07", tr: "Yeni Zelanda · Genel seçim", en: "New Zealand · General election", url: "https://elections.nz/media-and-news/2026/key-dates-for-2026-general-election", pattern: /7 November 2026/i },
] as const;
export async function verifiedElections(code: string, today: string): Promise<CalendarItem[]> {
  const until = new Date(`${today}T12:00:00Z`); until.setUTCDate(until.getUTCDate()+30);
  const candidates = ELECTIONS.filter(row => row.code === code && row.date >= today && row.date <= until.toISOString().slice(0,10));
  const items = await Promise.all(candidates.map(async row => {
    let checkedAt = "2026-09-08T00:00:00Z"; let verification: "live" | "last-known" = "last-known";
    try {
      const text = plainText(await publicText(row.url, 3600, 6000), 100000);
      if (!row.pattern.test(text) || /\b(election (?:has been |is )?(?:postponed|cancelled)|election date (?:has )?changed)\b/i.test(text)) return null;
      checkedAt = new Date().toISOString(); verification = "live";
    } catch {
      // After a week, unconfirmed planned dates are removed, not shown as today.
      const age = Date.parse(`${today}T12:00:00Z`) - Date.parse(checkedAt);
      if (age < 0 || age > 7*86400000) return null;
    }
    return { id: `${code}:${row.date}:election`, date: row.date, name: { tr: row.tr, en: row.en }, type: "election", countryWide: true, regions: [], sourceUrl: row.url, checkedAt, verification } as CalendarItem;
  }));
  return items.filter((item): item is CalendarItem => item !== null);
}
