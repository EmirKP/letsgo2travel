import { ISO_COUNTRIES } from "../countries/isoSource";

export const explorerCountryAliases: Record<string, string> = Object.fromEntries(ISO_COUNTRIES.flatMap(country => [
  [country.alpha2, country.alpha3], [country.alpha3, country.alpha3],
  [country.numeric, country.alpha3], [String(Number(country.numeric)), country.alpha3],
]));
explorerCountryAliases["-99"] = "XKK";
explorerCountryAliases["000"] = "XKK";
explorerCountryAliases["0"] = "XKK";
explorerCountryAliases["383"] = "XKK";
explorerCountryAliases.XKX = "XKK";

export function countExplorerCountries(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return new Set(value.flatMap(item => {
    const canonical = typeof item === "string" ? explorerCountryAliases[item.trim().toUpperCase()] : undefined;
    return canonical ? [canonical] : [];
  })).size;
}
