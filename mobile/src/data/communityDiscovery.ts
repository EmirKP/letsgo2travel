import { ISO_3166 } from "./countries";
import cappadociaImage from "../assets/home-reference/cappadocia.webp";
import parisImage from "../assets/community-reference/region-europe.webp";
import tokyoImage from "../assets/destination-artwork/tokyo.webp";
import dubaiImage from "../assets/destination-artwork/dubai.webp";
import americasImage from "../assets/community-reference/region-americas.webp";
import africaImage from "../assets/community-reference/region-africa.webp";
import oceaniaImage from "../assets/community-reference/region-oceania.webp";

export type CommunityRegionId = "all" | "turkey" | "europe" | "asia" | "americas" | "middle-east" | "africa" | "oceania";
type CountryRegionId = Exclude<CommunityRegionId, "all">;
type Locale = "tr" | "en";

export type CommunityRegion = {
  id: CommunityRegionId;
  label: string;
  /** Bundled artwork is decorative. An absent image means use an icon. */
  image?: string;
  /** The location represented by decorative artwork, never a user post. */
  imageLocation?: string;
};

const REGION_LABELS: ReadonlyArray<readonly [CommunityRegionId, string, string]> = [
  ["all", "Tümü", "All"],
  ["turkey", "Türkiye", "Turkey"],
  ["europe", "Avrupa", "Europe"],
  ["asia", "Asya", "Asia"],
  ["americas", "Amerika", "Americas"],
  ["middle-east", "Orta Doğu", "Middle East"],
  ["africa", "Afrika", "Africa"],
  ["oceania", "Okyanusya", "Oceania"],
];

const REGION_IMAGES: Partial<Record<CommunityRegionId, { image: string; location?: readonly [string, string] }>> = {
  turkey: { image: cappadociaImage, location: ["Kapadokya, Türkiye", "Cappadocia, Turkey"] },
  europe: { image: parisImage, location: ["Paris, Fransa", "Paris, France"] },
  asia: { image: tokyoImage, location: ["Tokyo, Japonya", "Tokyo, Japan"] },
  "middle-east": { image: dubaiImage, location: ["Dubai, Birleşik Arap Emirlikleri", "Dubai, United Arab Emirates"] },
  americas: { image: americasImage, location: ["Özgürlük Heykeli, New York", "Statue of Liberty, New York"] },
  africa: { image: africaImage, location: ["Baobab Yolu, Madagaskar", "Avenue of the Baobabs, Madagascar"] },
  oceania: { image: oceaniaImage, location: ["Sidney Opera Binası, Avustralya", "Sydney Opera House, Australia"] },
};

export function communityRegions(locale: Locale = "tr"): CommunityRegion[] {
  return REGION_LABELS.map(([id, tr, en]) => {
    const artwork = REGION_IMAGES[id];
    return {
      id,
      label: locale === "en" ? en : tr,
      ...(artwork ? { image: artwork.image } : {}),
      ...(artwork?.location ? { imageLocation: artwork.location[locale === "en" ? 1 : 0] } : {}),
    };
  });
}

const ISO_CODES = new Set(ISO_3166.map(country => country.alpha2));
const codeSet = (codes: string) => new Set(codes.split(" "));

// Geographic baseline: UN M49, checked 2026-09-28.
// https://unstats.un.org/unsd/methodology/m49/overview/
// These are navigation categories, not statements about sovereignty. Overseas
// territories follow their geographic region (e.g. GF Americas, PF Oceania).
// The app's existing ISO extension XK is Europe; its separate TW entry is Asia.
// Antarctica has no chip and is intentionally visible only in All.
const GEOGRAPHIC_REGIONS: ReadonlyArray<readonly [CountryRegionId, ReadonlySet<string>]> = [
  ["europe", codeSet("AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK")],
  ["asia", codeSet("AE AF AM AZ BD BH BN BT CN CY GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE")],
  ["americas", codeSet("AG AI AR AW BB BL BM BO BQ BR BS BV BZ CA CL CO CR CU CW DM DO EC FK GD GF GL GP GS GT GY HN HT JM KN KY LC MF MQ MS MX NI PA PE PM PR PY SR SV SX TC TT US UY VC VE VG VI")],
  ["africa", codeSet("AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW IO KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TF TG TN TZ UG YT ZA ZM ZW")],
  ["oceania", codeSet("AS AU CC CK CX FJ FM GU HM KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS")],
];

// A deliberately explicit travel category, applied before the Asian baseline.
// TR has its own chip. EG remains Africa, matching existing countryData;
// CY and the South Caucasus remain Asia under M49, rather than being guessed.
const MIDDLE_EAST = codeSet("AE BH IL IQ IR JO KW LB OM PS QA SA SY YE");

export function communityRegionForCountry(alpha2: string | null | undefined): CountryRegionId | null {
  if (typeof alpha2 !== "string") return null;
  const code = alpha2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || !ISO_CODES.has(code)) return null;
  if (code === "TR") return "turkey";
  if (MIDDLE_EAST.has(code)) return "middle-east";
  return GEOGRAPHIC_REGIONS.find(([, countries]) => countries.has(code))?.[0] ?? null;
}

/** Unknown/absent country codes remain in All; they never become another region. */
export function matchesCommunityRegion(alpha2: string | null | undefined, regionId: CommunityRegionId): boolean {
  return regionId === "all" || communityRegionForCountry(alpha2) === regionId;
}
