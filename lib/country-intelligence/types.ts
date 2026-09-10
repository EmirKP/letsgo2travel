export type Bilingual = { tr: string; en: string };
export type Source = { name: string; url: string; checkedAt: string };
export type PriceBaseline = {
  code: string; city: Bilingual; currency: string; daily: number;
  referenceMonth: string | null; source: Source | null;
  quality: "traveller-average" | "legacy-example" | "user-quote";
};
export type InflationData = {
  freshness?: "live" | "last-known";
  provider: "Eurostat" | "World Bank";
  sourceUrl: string; period: string; annualPercent: number | null;
  index: number | null; referenceIndex: number | null;
  referenceMonth: string | null; checkedAt: string;
};
export type Rate = { base: string; quote: string; rate: number; date: string; sourceUrl: string };
export type CostData = { baseline: PriceBaseline; fx: Rate | null; inflation: InflationData | null };
export type AdvisoryLevel = "avoid-all" | "essential-only" | "regional" | "no-specific-warning" | "unavailable";
export type AdvisoryReport = {
  freshness?: "live" | "last-known";
  precaution?: "heightened";
  code: string; level: AdvisoryLevel; scope: "whole-country" | "regional" | "unspecified";
  source: Source; updatedAt: string | null;
  topics: Array<"conflict" | "diplomatic" | "security">;
  updates: Array<{ text: string; date: string }>;
};
// Keep the original FCDO fields for installed clients; newer clients read each
// provider separately. Their different warning systems are never averaged.
export type TurkishTravelNotice = { title: string; url: string; publishedAt: string };
export type TurkishTravelNotices = {
  code: string; state: "ok" | "unavailable"; source: Source;
  verifiedAt: string | null; notices: TurkishTravelNotice[];
};
export type Advisory = AdvisoryReport & { reports?: AdvisoryReport[]; turkishNotices?: TurkishTravelNotices };
export type NewsItem = {
  title: string; url: string; publisher: string; language: string;
  firstSeenAt: string; topic: "elections" | "transport" | "weather" | "security" | "general";
  // GDELT supplies indexing time, not a verified publication/event date.
  publishedAt: string | null; eventDate: string | null;
  provider?: "GDELT" | "Anadolu Ajansı" | "BBC";
};
export type CalendarItem = {
  id: string; date: string; name: Bilingual; type: "public-holiday" | "observance" | "election";
  countryWide: boolean; regions: string[]; sourceUrl: string;
  checkedAt?: string; verification?: "live" | "last-known";
};
export type CountryBrief = {
  code: string; checkedAt: string; timeZone: string; today: string;
  advisory: Advisory; news: NewsItem[]; calendar: CalendarItem[];
  newsState: "ok" | "unavailable";
  calendarState: "ok" | "unavailable";
};
