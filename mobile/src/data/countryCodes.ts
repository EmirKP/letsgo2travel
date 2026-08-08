// Web seyahat haritası world-atlas sayısal ISO kodlarını kullanıyor. Mobil
// arayüzdeki ISO-3 kodları bu tablo üzerinden aynı kayıt alanına çevrilir.
export const ALPHA3_TO_GEO_ID: Record<string, string> = {
  DEU: "276", FRA: "250", ESP: "724", ITA: "380", GRC: "300", PRT: "620",
  NLD: "528", BEL: "056", AUT: "040", CHE: "756", NOR: "578", SWE: "752",
  FIN: "246", DNK: "208", POL: "616", CZE: "203", HUN: "348", ROU: "642",
  BGR: "100", SRB: "688", BIH: "070", HRV: "191", SVN: "705", SVK: "703",
  AZE: "031", GEO: "268", ARM: "051", UKR: "804", MDA: "498", BLR: "112",
  RUS: "643", KAZ: "398", UZB: "860", KGZ: "417", TJK: "762", TKM: "795",
  JPN: "392", KOR: "410", CHN: "156", IND: "356", THA: "764", IDN: "360",
  MYS: "458", SGP: "702", VNM: "704", KHM: "116", PHL: "608", BGD: "050",
  PAK: "586", NPL: "524", LKA: "144", MDV: "462", ARE: "784", QAT: "634",
  SAU: "682", KWT: "414", BHR: "048", JOR: "400", IRQ: "368", EGY: "818",
  MAR: "504", TUN: "788", DZA: "012", NGA: "566", ZAF: "710", KEN: "404",
  TZA: "834", ETH: "231", GHA: "288", USA: "840", CAN: "124", MEX: "484",
  BRA: "076", ARG: "032", COL: "170", CHL: "152", PER: "604", AUS: "036",
  NZL: "554", GBR: "826", IRL: "372", MKD: "807", MNE: "499", XKX: "383",
  ALB: "008", CYP: "196", ISL: "352", LUX: "442", LVA: "428", LTU: "440",
  EST: "233", FJI: "242",
};

export const GEO_ID_TO_ALPHA3 = Object.fromEntries(
  Object.entries(ALPHA3_TO_GEO_ID).map(([alpha3, geoId]) => [geoId, alpha3]),
) as Record<string, string>;

export function alpha3ToGeoId(alpha3: string) {
  return ALPHA3_TO_GEO_ID[alpha3.toUpperCase()] || null;
}

export function geoIdToAlpha3(geoId: string) {
  return GEO_ID_TO_ALPHA3[String(geoId).padStart(3, "0")] || null;
}

export function profileIdToAlpha3(value: string) {
  const normalized = value.trim().toUpperCase();
  if (ALPHA3_TO_GEO_ID[normalized]) return normalized;
  return geoIdToAlpha3(normalized);
}

export function profileIdsForAlpha3(original: string[], alpha3Codes: string[]) {
  const preserved = original.filter((id) => !profileIdToAlpha3(id));
  const mapped = alpha3Codes.flatMap((alpha3) => {
    const geoId = alpha3ToGeoId(alpha3);
    return geoId ? [geoId] : [];
  });
  return Array.from(new Set([...preserved, ...mapped]));
}
