// COUNTRY_LIST (alpha3) → ISO2 eşlemesi + bayrak emojisi.
// Kokpit formu ülkeyi SEÇİMDEN doldurur; kullanıcı ISO kodu yazmaz.

export const ALPHA3_TO_ALPHA2: Record<string, string> = {
  DEU: "DE", FRA: "FR", ESP: "ES", ITA: "IT", GRC: "GR", PRT: "PT", NLD: "NL", BEL: "BE",
  AUT: "AT", CHE: "CH", NOR: "NO", SWE: "SE", FIN: "FI", DNK: "DK", POL: "PL", CZE: "CZ",
  HUN: "HU", ROU: "RO", BGR: "BG", SRB: "RS", BIH: "BA", HRV: "HR", SVN: "SI", SVK: "SK",
  AZE: "AZ", GEO: "GE", ARM: "AM", UKR: "UA", MDA: "MD", BLR: "BY", RUS: "RU", KAZ: "KZ",
  UZB: "UZ", KGZ: "KG", TJK: "TJ", TKM: "TM", JPN: "JP", KOR: "KR", CHN: "CN", IND: "IN",
  THA: "TH", IDN: "ID", MYS: "MY", SGP: "SG", VNM: "VN", KHM: "KH", PHL: "PH", BGD: "BD",
  PAK: "PK", NPL: "NP", LKA: "LK", MDV: "MV", ARE: "AE", QAT: "QA", SAU: "SA", KWT: "KW",
  BHR: "BH", JOR: "JO", IRQ: "IQ", EGY: "EG", MAR: "MA", TUN: "TN", DZA: "DZ", NGA: "NG",
  ZAF: "ZA", KEN: "KE", TZA: "TZ", ETH: "ET", GHA: "GH", USA: "US", CAN: "CA", MEX: "MX",
  BRA: "BR", ARG: "AR", COL: "CO", CHL: "CL", PER: "PE", AUS: "AU", NZL: "NZ", GBR: "GB",
  IRL: "IE", MKD: "MK", MNE: "ME", XKX: "XK", ALB: "AL", CYP: "CY", ISL: "IS", LUX: "LU",
  LVA: "LV", LTU: "LT", EST: "EE", FJI: "FJ", TUR: "TR",
};

const ALPHA2_TO_ALPHA3 = Object.fromEntries(
  Object.entries(ALPHA3_TO_ALPHA2).map(([alpha3, alpha2]) => [alpha2, alpha3]),
);

export function alpha2FromAlpha3(alpha3: string): string {
  return ALPHA3_TO_ALPHA2[alpha3.toUpperCase()] || "";
}

export function alpha3FromAlpha2(alpha2: string): string {
  return ALPHA2_TO_ALPHA3[alpha2.toUpperCase()] || "";
}

/** ISO2 koddan bayrak emojisi (Kosova gibi resmî bayrak emojisi olmayanlar için 🏳️). */
export function flagEmoji(alpha2: string): string {
  const code = alpha2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XK") return "🏳️";
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
