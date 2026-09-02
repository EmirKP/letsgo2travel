// TEK ortak ISO 3166-1 kaynağından kod eşlemeleri + bayrak.
// (Üreteç: scripts/generate-countries.mjs → iso3166.json)
import { ISO_3166 } from "./countries";

export const ALPHA3_TO_ALPHA2: Record<string, string> = Object.fromEntries(
  ISO_3166.map((row) => [row.alpha3, row.alpha2]),
);

const ALPHA2_TO_ALPHA3: Record<string, string> = Object.fromEntries(
  ISO_3166.map((row) => [row.alpha2, row.alpha3]),
);

const FLAG_BY_ALPHA2: Record<string, string> = Object.fromEntries(
  ISO_3166.map((row) => [row.alpha2, row.flag]),
);

export function alpha2FromAlpha3(alpha3: string): string {
  return ALPHA3_TO_ALPHA2[alpha3.toUpperCase()] || "";
}

export function alpha3FromAlpha2(alpha2: string): string {
  return ALPHA2_TO_ALPHA3[alpha2.toUpperCase()] || "";
}

/** ISO2 koddan bayrak (kaynakta yoksa 🏳️). */
export function flagEmoji(alpha2: string): string {
  return FLAG_BY_ALPHA2[alpha2.toUpperCase()] || "🏳️";
}
