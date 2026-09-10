import { isoCountryByAlpha2 } from "../countries/isoSource";
import { plainText, publicJson } from "./fetch";
import type { Advisory, AdvisoryLevel } from "./types";
import { lastVerifiedAdvice } from "./last-verified";
import destinations from "./advisory-destinations.json";
import { getCanadaAdvisory } from "./canada-advisories";
import { getTurkishNotices } from "./turkish-notices";

type AdviceContent = {
  public_updated_at?: string; withdrawn_notice?: unknown;
  details?: { alert_status?: string[]; parts?: Array<{ slug: string; body: string }>;
    change_history?: Array<{ note: string; public_timestamp: string }> };
};

export function advisoryLevel(alerts: string[]): { level: AdvisoryLevel; scope: Advisory["scope"] } {
  if (alerts.includes("avoid_all_travel_to_whole_country")) return { level: "avoid-all", scope: "whole-country" };
  if (alerts.includes("avoid_all_but_essential_travel_to_whole_country")) return { level: "essential-only", scope: "whole-country" };
  if (alerts.some(value => value === "avoid_all_travel_to_parts" || value === "avoid_all_but_essential_travel_to_parts" || value.includes("parts_of_country"))) return { level: "regional", scope: "regional" };
  // An unfamiliar provider code is not an assurance of safety.
  return { level: alerts.length ? "unavailable" : "no-specific-warning", scope: "unspecified" };
}

// Destination URLs verified against the official UK/Canada indexes on 2026-09-10.
// Static routing avoids a second network dependency and country-name mismatches.
// No risk levels or advice dates are stored in this mapping.
const paths: Record<string, { fcdo?: string; canada?: string }> = destinations;

async function getFcdoAdvisory(code: string): Promise<Advisory> {
  const checkedAt = new Date().toISOString();
  const empty: Advisory = { code, level: "unavailable", scope: "unspecified", updatedAt: null, topics: [], updates: [],
    source: { name: "FCDO · GOV.UK", url: "https://www.gov.uk/foreign-travel-advice", checkedAt } };
  const fallback = lastVerifiedAdvice(code) || empty;
  if (!isoCountryByAlpha2(code)) return empty;
  try {
    const slug = paths[code]?.fcdo;
    if (!slug) return fallback;
    const url = `https://www.gov.uk/foreign-travel-advice/${slug}`;
    empty.source.url = url;
    const data = await publicJson<AdviceContent>(`https://www.gov.uk/api/content/foreign-travel-advice/${slug}`, 900);
    if (data.withdrawn_notice || !Array.isArray(data.details?.alert_status)) return fallback;
    const status = advisoryLevel(data.details.alert_status);
    const warnings = data.details.parts?.find(part => part.slug === "warnings-and-insurance")?.body || "";
    const topics: Advisory["topics"] = [];
    // Topics describe the scope of official advice, not our own geopolitical
    // classification. Never derive "at war" from a country code or a headline.
    if (status.level !== "no-specific-warning" && /\b(conflict|armed attacks?|regional tensions|military action)\b/i.test(warnings)) topics.push("conflict");
    if (status.level !== "no-specific-warning" && /\b(limited consular|cannot provide consular|no consular|embassy.{0,30}(closed|suspended)|diplomatic relations|sanctions)\b/i.test(warnings)) topics.push("diplomatic");
    if (status.level !== "no-specific-warning") topics.push("security");
    const updates = (data.details.change_history || [])
      .filter(row => Number.isFinite(Date.parse(row.public_timestamp)) && Date.parse(row.public_timestamp) <= Date.now())
      .slice(0, 4).map(row => ({ text: plainText(row.note, 400), date: row.public_timestamp }));
    return { ...empty, ...status, freshness: "live", topics, updates,
      updatedAt: data.public_updated_at && Number.isFinite(Date.parse(data.public_updated_at)) && Date.parse(data.public_updated_at) <= Date.now() ? data.public_updated_at : null };
  } catch { return fallback; }
}

export async function getAdvisory(code: string): Promise<Advisory> {
  code = code.toUpperCase();
  const [fcdo, canada, turkishNotices] = await Promise.all([getFcdoAdvisory(code), getCanadaAdvisory(code), getTurkishNotices(code)]);
  return { ...fcdo, reports: [fcdo, canada], turkishNotices };
}
