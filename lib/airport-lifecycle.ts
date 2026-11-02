import metadata from "./airport-lifecycle-data.json";

export type AirportLifecycle = {
  status: "closed";
  checkedAt: string;
  sourceUrl: string;
};

/** Reviewed reference annotation only; never filters or rewrites an airport. */
export function airportLifecycle(iata: unknown, countryCode?: unknown): AirportLifecycle | null {
  if (typeof iata !== "string" || countryCode !== undefined && typeof countryCode !== "string") return null;
  const code = iata.trim().toUpperCase(), country = typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(code) || country && !/^[A-Z]{2}$/.test(country) || !Object.hasOwn(metadata, code)) return null;
  const row = (metadata as Record<string, { countryCode: string; status: string; checkedAt: string; sourceUrl: string }>)[code];
  // Saved origins can contain only their exact IATA code. Resolve that reviewed
  // unique identity without inventing a country in the caller's airport object.
  if (country && row.countryCode !== country || row.status !== "closed") return null;
  // A fresh value prevents a caller from changing the shared reviewed reference.
  return { status: "closed", checkedAt: row.checkedAt, sourceUrl: row.sourceUrl };
}
