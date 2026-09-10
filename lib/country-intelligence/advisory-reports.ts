import type { Advisory, AdvisoryReport } from "./types";

export function advisoryReports(advisory: Advisory): AdvisoryReport[] {
  return advisory.reports?.length ? advisory.reports : [advisory];
}

export function prominentAdvisory(advisory: Advisory): AdvisoryReport {
  const score = (row: AdvisoryReport) => ({ "avoid-all": 5, "essential-only": 4, regional: 3,
    "no-specific-warning": row.precaution === "heightened" ? 2 : 1, unavailable: 0 })[row.level];
  return [...advisoryReports(advisory)].sort((a, b) => score(b) - score(a)
    || Number(b.freshness === "live") - Number(a.freshness === "live"))[0];
}
