import { plainText, publicText } from "./fetch";
import destinations from "./advisory-destinations.json";
import type { AdvisoryReport } from "./types";

const INDEX = "https://travel.gc.ca/travelling/advisories";
const paths: Record<string, { fcdo?: string; canada?: string }> = destinations;

// Only the published destination table is read, never keywords from articles.
// Unknown labels/schema changes fail closed. Regional restrictions remain regional.
export function parseCanadaAdvisory(html: string, code: string, now = new Date()): AdvisoryReport {
  const slug = paths[code]?.canada;
  const empty: AdvisoryReport = { code, level: "unavailable", scope: "unspecified", topics: [], updates: [], updatedAt: null,
    source: { name: "Canada · Travel.gc.ca", url: slug ? `https://travel.gc.ca/destinations/${slug}` : INDEX, checkedAt: now.toISOString() } };
  if (!slug) return empty;
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const row = rows.find(value => new RegExp(`href=["']/destinations/${slug}["']`, "i").test(value));
  if (!row) return empty;
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => plainText(match[1]));
  if (cells.length !== 4) return empty;
  const label = cells[2];
  // The table does not declare a time zone; preserve its date without inventing one.
  const date = cells[3].match(/^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}$/)?.[1];
  if (!date || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > now.toISOString().slice(0, 10)) return empty;
  const regional = label.endsWith(" (with regional advisories)");
  const national = label.replace(/ \(with regional advisories\)$/, "");
  let level: AdvisoryReport["level"];
  if (national === "Avoid all travel") level = "avoid-all";
  else if (national === "Avoid non-essential travel") level = "essential-only";
  else if (national === "Exercise a high degree of caution" || national === "Take normal security precautions") level = regional ? "regional" : "no-specific-warning";
  else return empty;
  return { ...empty, level, freshness: "live", updatedAt: date,
    precaution: national === "Exercise a high degree of caution" ? "heightened" : undefined,
    scope: level === "avoid-all" || level === "essential-only" ? "whole-country" : regional ? "regional" : "unspecified",
    topics: level !== "no-specific-warning" || national === "Exercise a high degree of caution" ? ["security"] : [] };
}

export async function getCanadaAdvisory(code: string): Promise<AdvisoryReport> {
  if (!paths[code]?.canada) return parseCanadaAdvisory("", code);
  try { return parseCanadaAdvisory(await publicText(INDEX, 900), code); }
  catch { return parseCanadaAdvisory("", code); }
}
