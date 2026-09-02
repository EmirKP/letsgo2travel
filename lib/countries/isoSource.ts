// TEK ortak ISO 3166-1 ülke/bölge kaynağı (üreteç: scripts/generate-countries.mjs).
// Türkçe ad + ISO2 + ISO3 + sayısal kod + bayrak. 250 kayıt.
import raw from "./iso3166.json";

export type IsoCountry = {
  alpha2: string;
  alpha3: string;
  numeric: string;
  name: string;
  flag: string;
};

export const ISO_COUNTRIES: IsoCountry[] = raw as IsoCountry[];

const byAlpha2 = new Map(ISO_COUNTRIES.map((country) => [country.alpha2, country]));
const byAlpha3 = new Map(ISO_COUNTRIES.map((country) => [country.alpha3, country]));

export function isoCountryByAlpha2(code: string): IsoCountry | null {
  return byAlpha2.get(String(code || "").toUpperCase()) || null;
}

export function isoCountryByAlpha3(code: string): IsoCountry | null {
  return byAlpha3.get(String(code || "").toUpperCase()) || null;
}
