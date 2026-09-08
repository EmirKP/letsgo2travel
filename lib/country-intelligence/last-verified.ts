import type { Advisory } from "./types";

// Read from the official APIs on 2026-09-08. These are dated fallback records,
// never presented as a successful live refresh. Not a permanent war-country list.
const checkedAt = "2026-09-08T00:00:00Z";
const adviceRows: Array<[string, string, Advisory["level"], Advisory["scope"], string]> = [
  ["RU", "russia", "avoid-all", "whole-country", "2026-07-03T09:40:32+01:00"],
  ["IR", "iran", "avoid-all", "whole-country", "2026-08-13T16:37:44+01:00"],
  ["UA", "ukraine", "regional", "regional", "2026-08-14T15:37:09+01:00"],
  ["IL", "israel", "regional", "regional", "2026-07-22T13:45:00+01:00"],
];
export function lastVerifiedAdvice(code: string): Advisory | null {
  const row = adviceRows.find(row => row[0] === code);
  if (!row) return null;
  return { code, freshness: "last-known", level: row[2], scope: row[3], updatedAt: row[4], topics: ["security"], updates: [],
    source: { name: "FCDO · GOV.UK", url: `https://www.gov.uk/foreign-travel-advice/${row[1]}`, checkedAt } };
}

// HICP, 2025=100 (Eurostat prc_hicp_minr, I25, TOTAL). Only exact observed
// monthly points are included. Never interpolate a missing baseline month.
export const VERIFIED_MONTHLY_INDICES: Record<string, { checkedAt: string; points: Record<string, number> }> = {
  IT: { checkedAt, points: { "2025-08": 99.5, "2026-08": 102.7 } },
  RS: { checkedAt, points: { "2025-07": 101.17, "2026-07": 103.39 } },
  TR: { checkedAt, points: { "2025-07": 100.41, "2026-07": 132.31 } },
};
