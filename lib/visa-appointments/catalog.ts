export type SchengenCountry = {
  code: string;
  name: string;
  flag: string;
  providerMode: "verification_required" | "configured";
  providerCode?: string;
  providerName?: string;
};

// 29 Schengen ülkesi. Sağlayıcı eşleştirmesi, şehir ve kategori bazında
// yönetim panelinden doğrulandıktan sonra etkinleştirilir.
export const SCHENGEN_COUNTRIES: SchengenCountry[] = [
  { code: "AT", name: "Avusturya", flag: "🇦🇹", providerMode: "verification_required" },
  { code: "BE", name: "Belçika", flag: "🇧🇪", providerMode: "verification_required" },
  { code: "BG", name: "Bulgaristan", flag: "🇧🇬", providerMode: "verification_required" },
  { code: "HR", name: "Hırvatistan", flag: "🇭🇷", providerMode: "verification_required" },
  { code: "CZ", name: "Çekya", flag: "🇨🇿", providerMode: "verification_required" },
  { code: "DK", name: "Danimarka", flag: "🇩🇰", providerMode: "verification_required" },
  { code: "EE", name: "Estonya", flag: "🇪🇪", providerMode: "verification_required" },
  { code: "FI", name: "Finlandiya", flag: "🇫🇮", providerMode: "verification_required" },
  { code: "FR", name: "Fransa", flag: "🇫🇷", providerMode: "verification_required" },
  { code: "DE", name: "Almanya", flag: "🇩🇪", providerMode: "verification_required" },
  { code: "GR", name: "Yunanistan", flag: "🇬🇷", providerMode: "verification_required" },
  { code: "HU", name: "Macaristan", flag: "🇭🇺", providerMode: "verification_required" },
  { code: "IS", name: "İzlanda", flag: "🇮🇸", providerMode: "verification_required" },
  { code: "IT", name: "İtalya", flag: "🇮🇹", providerMode: "verification_required" },
  { code: "LV", name: "Letonya", flag: "🇱🇻", providerMode: "verification_required" },
  { code: "LI", name: "Lihtenştayn", flag: "🇱🇮", providerMode: "verification_required" },
  { code: "LT", name: "Litvanya", flag: "🇱🇹", providerMode: "verification_required" },
  { code: "LU", name: "Lüksemburg", flag: "🇱🇺", providerMode: "verification_required" },
  { code: "MT", name: "Malta", flag: "🇲🇹", providerMode: "verification_required" },
  { code: "NL", name: "Hollanda", flag: "🇳🇱", providerMode: "verification_required" },
  { code: "NO", name: "Norveç", flag: "🇳🇴", providerMode: "verification_required" },
  { code: "PL", name: "Polonya", flag: "🇵🇱", providerMode: "verification_required" },
  { code: "PT", name: "Portekiz", flag: "🇵🇹", providerMode: "verification_required" },
  { code: "RO", name: "Romanya", flag: "🇷🇴", providerMode: "verification_required" },
  { code: "SK", name: "Slovakya", flag: "🇸🇰", providerMode: "verification_required" },
  { code: "SI", name: "Slovenya", flag: "🇸🇮", providerMode: "verification_required" },
  { code: "ES", name: "İspanya", flag: "🇪🇸", providerMode: "verification_required" },
  { code: "SE", name: "İsveç", flag: "🇸🇪", providerMode: "verification_required" },
  { code: "CH", name: "İsviçre", flag: "🇨🇭", providerMode: "verification_required" },
];

export function getSchengenCountry(code: string) {
  return SCHENGEN_COUNTRIES.find((country) => country.code === code.toUpperCase()) || null;
}
