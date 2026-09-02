import ISO_3166_RAW from "./iso3166.json";
import type { Country, VisaStatus } from "../types";

type IsoRow = { alpha2: string; alpha3: string; numeric: string; name: string; flag: string };
export const ISO_3166: IsoRow[] = ISO_3166_RAW as IsoRow[];

export const VISA_DATA: Record<string, VisaStatus> = {
  GEO: "id_card", AZE: "id_card", MDA: "id_card", UKR: "id_card",
  ALB: "free", ATG: "free", ARG: "free", BHS: "free", BRB: "free", BLR: "free",
  BLZ: "free", BOL: "free", BIH: "free", BWA: "free", BRA: "free", BRN: "free",
  CHL: "free", COL: "free", CRI: "free", DOM: "free", ECU: "free", SLV: "free",
  SWZ: "free", GMB: "free", GTM: "free", HTI: "free", HND: "free", HKG: "free",
  IRN: "free", JAM: "free", JPN: "free", JOR: "free", KAZ: "free", XKK: "free",
  KGZ: "free", MAC: "free", MYS: "free", MUS: "free", MNG: "free", MNE: "free",
  MAR: "free", NIC: "free", MKD: "free", PSE: "free", PAN: "free", PRY: "free",
  PER: "free", PHL: "free", KNA: "free", LCA: "free", VCT: "free", SRB: "free",
  SYC: "free", SGP: "free", ZAF: "free", SYR: "free", THA: "free", TTO: "free",
  TUN: "free", URY: "free", UZB: "free", VEN: "free", FJI: "free", VUT: "free",
  ARM: "on_arrival", BGD: "on_arrival", BFA: "on_arrival", BDI: "on_arrival",
  KHM: "on_arrival", CPV: "on_arrival", COM: "on_arrival", DJI: "on_arrival",
  EGY: "on_arrival", ETH: "on_arrival", GHA: "on_arrival", GNB: "on_arrival",
  IDN: "on_arrival", KWT: "on_arrival", LAO: "on_arrival", LBN: "on_arrival",
  MDG: "on_arrival", MDV: "on_arrival", MHL: "on_arrival", MRT: "on_arrival",
  MOZ: "on_arrival", NAM: "on_arrival", NPL: "on_arrival", OMN: "on_arrival",
  PLW: "on_arrival", QAT: "on_arrival", RWA: "on_arrival", WSM: "on_arrival",
  STP: "on_arrival", SAU: "on_arrival", SEN: "on_arrival", SLE: "on_arrival",
  SOM: "on_arrival", LKA: "on_arrival", SDN: "on_arrival", TWN: "on_arrival",
  TZA: "on_arrival", TLS: "on_arrival", TON: "on_arrival", TUV: "on_arrival",
  ZMB: "on_arrival", ZWE: "on_arrival",
  AUS: "evisa", BHR: "evisa", BEN: "evisa", BTN: "evisa", CMR: "evisa",
  COD: "evisa", CUB: "evisa", GAB: "evisa", GIN: "evisa", IRQ: "evisa",
  LSO: "evisa", LBY: "evisa", MWI: "evisa", MMR: "evisa", NGA: "evisa",
  PNG: "evisa", RUS: "evisa", SSD: "evisa", TJK: "evisa", TGO: "evisa",
  UGA: "evisa", ARE: "evisa", VNM: "evisa", CIV: "evisa", KEN: "evisa",
  MEX: "evisa", PAK: "evisa", KOR: "evisa",
  DZA: "required", AND: "required", AUT: "required", BEL: "required", BGR: "required",
  CAN: "required", CAF: "required", TCD: "required", CHN: "required", COG: "required",
  HRV: "required", CYP: "required", CZE: "required", DNK: "required", ERI: "required",
  EST: "required", FIN: "required", FRA: "required", DEU: "required", GRC: "required",
  GRD: "required", GUY: "required", HUN: "required", ISL: "required", IND: "required",
  IRL: "required", ISR: "required", ITA: "required", KIR: "required", LVA: "required",
  LBR: "required", LIE: "required", LTU: "required", LUX: "required", MLI: "required",
  MLT: "required", MCO: "required", NRU: "required", NLD: "required", NZL: "required",
  NER: "required", PRK: "required", NOR: "required", POL: "required", PRT: "required",
  ROU: "required", SMR: "required", SVK: "required", SVN: "required", SLB: "required",
  ESP: "required", SUR: "required", SWE: "required", CHE: "required", TKM: "required",
  GBR: "required", USA: "required", YEM: "required", AFG: "required", AGO: "required",
  GNQ: "required",
};

// TEK ortak ISO 3166-1 kaynağından TAM liste (250 ülke/bölge; üreteç:
// scripts/generate-countries.mjs). Vize sınıfı DOĞRULANMAMIŞ ülkeler
// "unknown" (Bilinmiyor) gösterilir — bilgi uydurulmaz.
export const COUNTRY_LIST: Country[] = ISO_3166.map((row) => ({ name: row.name, alpha3: row.alpha3 }));

export const STATUS_LABEL: Record<VisaStatus, string> = {
  id_card: "Kimlikle",
  free: "Vizesiz",
  evisa: "e-Vize",
  on_arrival: "Kapıda Vize",
  required: "Vize Gerekli",
  unknown: "Bilinmiyor",
};

export const STATUS_ORDER: Record<VisaStatus, number> = {
  id_card: 1,
  free: 2,
  evisa: 3,
  on_arrival: 4,
  required: 5,
  unknown: 6,
};
