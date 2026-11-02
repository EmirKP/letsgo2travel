import { BUDGET_CITY_LABELS } from "./budgetCityLabels";
import type { AppLocale } from "../lib/locale";
import type { CityDestination } from "./cityDestinations";
import { BUDGET_CITY_PHOTOS } from "./budgetCityPhotos";

type Labels = Record<AppLocale, string>;
export type CityDestinationExtra = Omit<CityDestination, "name" | "country" | "route" | "highlights"> & {
  name: Labels;
  country: Labels;
  highlights: [];
};
const labels = (tr: string, en: string, sq: string, ro: string): Labels => ({ tr, en, sq, ro });
const COUNTRIES: Record<string, { alpha3: string; names: Labels }> = {
  BA: { alpha3: "BIH", names: labels("Bosna Hersek", "Bosnia and Herzegovina", "Bosnjë dhe Hercegovinë", "Bosnia și Herțegovina") },
  RO: { alpha3: "ROU", names: labels("Romanya", "Romania", "Rumani", "România") },
  AL: { alpha3: "ALB", names: labels("Arnavutluk", "Albania", "Shqipëri", "Albania") },
  RS: { alpha3: "SRB", names: labels("Sırbistan", "Serbia", "Serbi", "Serbia") },
  LV: { alpha3: "LVA", names: labels("Letonya", "Latvia", "Letoni", "Letonia") },
  LT: { alpha3: "LTU", names: labels("Litvanya", "Lithuania", "Lituani", "Lituania") },
  FR: { alpha3: "FRA", names: labels("Fransa", "France", "Francë", "Franța") },
  ME: { alpha3: "MNE", names: labels("Karadağ", "Montenegro", "Mali i Zi", "Muntenegru") },
  EE: { alpha3: "EST", names: labels("Estonya", "Estonia", "Estoni", "Estonia") },
  PL: { alpha3: "POL", names: labels("Polonya", "Poland", "Poloni", "Polonia") },
  SK: { alpha3: "SVK", names: labels("Slovakya", "Slovakia", "Sllovaki", "Slovacia") },
  PT: { alpha3: "PRT", names: labels("Portekiz", "Portugal", "Portugali", "Portugalia") },
  HU: { alpha3: "HUN", names: labels("Macaristan", "Hungary", "Hungari", "Ungaria") },
  HR: { alpha3: "HRV", names: labels("Hırvatistan", "Croatia", "Kroaci", "Croația") },
  GR: { alpha3: "GRC", names: labels("Yunanistan", "Greece", "Greqi", "Grecia") },
  GB: { alpha3: "GBR", names: labels("Birleşik Krallık", "United Kingdom", "Mbretëria e Bashkuar", "Regatul Unit") },
  CZ: { alpha3: "CZE", names: labels("Çekya", "Czechia", "Çeki", "Cehia") },
  DE: { alpha3: "DEU", names: labels("Almanya", "Germany", "Gjermani", "Germania") },
  BE: { alpha3: "BEL", names: labels("Belçika", "Belgium", "Belgjikë", "Belgia") },
  AT: { alpha3: "AUT", names: labels("Avusturya", "Austria", "Austri", "Austria") },
  LU: { alpha3: "LUX", names: labels("Lüksemburg", "Luxembourg", "Luksemburg", "Luxemburg") },
  SE: { alpha3: "SWE", names: labels("İsveç", "Sweden", "Suedi", "Suedia") },
  SI: { alpha3: "SVN", names: labels("Slovenya", "Slovenia", "Slloveni", "Slovenia") },
  IT: { alpha3: "ITA", names: labels("İtalya", "Italy", "Itali", "Italia") },
  FI: { alpha3: "FIN", names: labels("Finlandiya", "Finland", "Finlandë", "Finlanda") },
  ES: { alpha3: "ESP", names: labels("İspanya", "Spain", "Spanjë", "Spania") },
  IE: { alpha3: "IRL", names: labels("İrlanda", "Ireland", "Irlandë", "Irlanda") },
  NL: { alpha3: "NLD", names: labels("Hollanda", "Netherlands", "Holandë", "Țările de Jos") },
  CH: { alpha3: "CHE", names: labels("İsviçre", "Switzerland", "Zvicër", "Elveția") },
  DK: { alpha3: "DNK", names: labels("Danimarka", "Denmark", "Danimarkë", "Danemarca") },
  NO: { alpha3: "NOR", names: labels("Norveç", "Norway", "Norvegji", "Norvegia") },
};

function destination(benchmarkId: string, code: string, name: Labels, latitude: number, longitude: number): CityDestinationExtra {
  const countryCode = benchmarkId.split("-")[0];
  const country = COUNTRIES[countryCode];
  const photo = BUDGET_CITY_PHOTOS[benchmarkId];
  // A missing city image must never silently become an unrelated country photo.
  if (!country || !photo) throw new Error("Missing bundled discovery destination metadata.");
  return {
    code, name, country: country.names, countryCode, alpha3: country.alpha3,
    photo: photo.src, ...(photo.credit ? { photoCredit: photo.credit } : {}),
    budgetBenchmarkId: benchmarkId, center: { latitude, longitude }, highlights: [],
  };
}

// City-centre coordinates, never airport coordinates. Codes identify the serving
// airport; OST serves Bruges as well as Ostend. Existing city-photo provenance
// and attribution accompany each reused image. No new prices or landmarks.
export const EXTRA_CITY_DESTINATIONS: CityDestinationExtra[] = [
  destination("BA-sarajevo", "SJJ", BUDGET_CITY_LABELS["BA-sarajevo"], 43.8563, 18.4131),
  destination("RO-bucharest", "OTP", BUDGET_CITY_LABELS["RO-bucharest"], 44.4268, 26.1025),
  destination("AL-tirana", "TIA", BUDGET_CITY_LABELS["AL-tirana"], 41.3275, 19.8187),
  destination("RS-belgrade", "BEG", BUDGET_CITY_LABELS["RS-belgrade"], 44.7866, 20.4489),
  destination("LV-riga", "RIX", BUDGET_CITY_LABELS["LV-riga"], 56.9496, 24.1052),
  destination("LT-vilnius", "VNO", BUDGET_CITY_LABELS["LT-vilnius"], 54.6872, 25.2797),
  destination("FR-strasbourg", "SXB", BUDGET_CITY_LABELS["FR-strasbourg"], 48.5734, 7.7521),
  destination("ME-podgorica", "TGD", BUDGET_CITY_LABELS["ME-podgorica"], 42.4304, 19.2594),
  destination("EE-tallinn", "TLL", BUDGET_CITY_LABELS["EE-tallinn"], 59.437, 24.7536),
  destination("PL-warsaw", "WAW", BUDGET_CITY_LABELS["PL-warsaw"], 52.2297, 21.0122),
  destination("PL-krakow", "KRK", BUDGET_CITY_LABELS["PL-krakow"], 50.0647, 19.945),
  destination("SK-bratislava", "BTS", BUDGET_CITY_LABELS["SK-bratislava"], 48.1486, 17.1077),
  destination("PL-gdansk", "GDN", BUDGET_CITY_LABELS["PL-gdansk"], 54.352, 18.6466),
  destination("PT-lisbon", "LIS", BUDGET_CITY_LABELS["PT-lisbon"], 38.7223, -9.1393),
  destination("HU-budapest", "BUD", BUDGET_CITY_LABELS["HU-budapest"], 47.4979, 19.0402),
  destination("HR-zagreb", "ZAG", BUDGET_CITY_LABELS["HR-zagreb"], 45.815, 15.9819),
  destination("GR-athens", "ATH", BUDGET_CITY_LABELS["GR-athens"], 37.9838, 23.7275),
  destination("PT-porto", "OPO", BUDGET_CITY_LABELS["PT-porto"], 41.1579, -8.6291),
  destination("GB-cardiff", "CWL", BUDGET_CITY_LABELS["GB-cardiff"], 51.4816, -3.1791),
  destination("FR-lyon", "LYS", BUDGET_CITY_LABELS["FR-lyon"], 45.764, 4.8357),
  destination("CZ-prague", "PRG", BUDGET_CITY_LABELS["CZ-prague"], 50.0755, 14.4378),
  destination("DE-berlin", "BER", BUDGET_CITY_LABELS["DE-berlin"], 52.52, 13.405),
  destination("BE-brussels", "BRU", BUDGET_CITY_LABELS["BE-brussels"], 50.8503, 4.3517),
  destination("AT-salzburg", "SZG", BUDGET_CITY_LABELS["AT-salzburg"], 47.8095, 13.055),
  destination("LU-luxembourg", "LUX", BUDGET_CITY_LABELS["LU-luxembourg"], 49.6116, 6.1319),
  destination("HR-dubrovnik", "DBV", BUDGET_CITY_LABELS["HR-dubrovnik"], 42.6507, 18.0944),
  destination("SE-stockholm", "ARN", BUDGET_CITY_LABELS["SE-stockholm"], 59.3293, 18.0686),
  destination("SI-ljubljana", "LJU", BUDGET_CITY_LABELS["SI-ljubljana"], 46.0569, 14.5058),
  destination("FR-nice", "NCE", BUDGET_CITY_LABELS["FR-nice"], 43.7102, 7.262),
  destination("GB-belfast", "BFS", BUDGET_CITY_LABELS["GB-belfast"], 54.5973, -5.9301),
  destination("GB-london", "LHR", BUDGET_CITY_LABELS["GB-london"], 51.5074, -0.1278),
  destination("DE-hamburg", "HAM", BUDGET_CITY_LABELS["DE-hamburg"], 53.5511, 9.9937),
  destination("IT-florence", "FLR", BUDGET_CITY_LABELS["IT-florence"], 43.7696, 11.2558),
  destination("AT-vienna", "VIE", BUDGET_CITY_LABELS["AT-vienna"], 48.2082, 16.3738),
  destination("BE-bruges", "OST", BUDGET_CITY_LABELS["BE-bruges"], 51.2093, 3.2247),
  destination("FI-helsinki", "HEL", BUDGET_CITY_LABELS["FI-helsinki"], 60.1699, 24.9384),
  destination("ES-madrid", "MAD", BUDGET_CITY_LABELS["ES-madrid"], 40.4168, -3.7038),
  destination("IT-venice", "VCE", BUDGET_CITY_LABELS["IT-venice"], 45.4408, 12.3155),
  destination("IE-cork", "ORK", BUDGET_CITY_LABELS["IE-cork"], 51.8985, -8.4756),
  destination("NL-amsterdam", "AMS", BUDGET_CITY_LABELS["NL-amsterdam"], 52.3676, 4.9041),
  destination("IE-dublin", "DUB", BUDGET_CITY_LABELS["IE-dublin"], 53.3498, -6.2603),
  destination("ES-barcelona", "BCN", BUDGET_CITY_LABELS["ES-barcelona"], 41.3851, 2.1734),
  destination("CH-geneva", "GVA", BUDGET_CITY_LABELS["CH-geneva"], 46.2044, 6.1432),
  destination("GB-edinburgh", "EDI", BUDGET_CITY_LABELS["GB-edinburgh"], 55.9533, -3.1883),
  destination("DK-copenhagen", "CPH", BUDGET_CITY_LABELS["DK-copenhagen"], 55.6761, 12.5683),
  destination("NO-oslo", "OSL", BUDGET_CITY_LABELS["NO-oslo"], 59.9139, 10.7522),
];
