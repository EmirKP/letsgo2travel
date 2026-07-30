import { getProviderForCountry } from "./providers";

export type SchengenCountry = {
  code: string;
  name: string;
  flag: string;
  providerMode: "verification_required" | "configured";
  providerCode?: string;
  providerName?: string;
};

const COUNTRY_ROWS = [
  ["AT", "Avusturya", "🇦🇹"], ["BE", "Belçika", "🇧🇪"], ["BG", "Bulgaristan", "🇧🇬"],
  ["HR", "Hırvatistan", "🇭🇷"], ["CZ", "Çekya", "🇨🇿"], ["DK", "Danimarka", "🇩🇰"],
  ["EE", "Estonya", "🇪🇪"], ["FI", "Finlandiya", "🇫🇮"], ["FR", "Fransa", "🇫🇷"],
  ["DE", "Almanya", "🇩🇪"], ["GR", "Yunanistan", "🇬🇷"], ["HU", "Macaristan", "🇭🇺"],
  ["IS", "İzlanda", "🇮🇸"], ["IT", "İtalya", "🇮🇹"], ["LV", "Letonya", "🇱🇻"],
  ["LI", "Lihtenştayn", "🇱🇮"], ["LT", "Litvanya", "🇱🇹"], ["LU", "Lüksemburg", "🇱🇺"],
  ["MT", "Malta", "🇲🇹"], ["NL", "Hollanda", "🇳🇱"], ["NO", "Norveç", "🇳🇴"],
  ["PL", "Polonya", "🇵🇱"], ["PT", "Portekiz", "🇵🇹"], ["RO", "Romanya", "🇷🇴"],
  ["SK", "Slovakya", "🇸🇰"], ["SI", "Slovenya", "🇸🇮"], ["ES", "İspanya", "🇪🇸"],
  ["SE", "İsveç", "🇸🇪"], ["CH", "İsviçre", "🇨🇭"],
] as const;

export const SCHENGEN_COUNTRIES: SchengenCountry[] = COUNTRY_ROWS.map(([code, name, flag]) => {
  const provider = getProviderForCountry(code);
  return {
    code,
    name,
    flag,
    providerMode: provider ? "configured" : "verification_required",
    providerCode: provider?.providerCode,
    providerName: provider?.providerName,
  };
});

export function getSchengenCountry(code: string) {
  return SCHENGEN_COUNTRIES.find((country) => country.code === code.toUpperCase()) || null;
}
