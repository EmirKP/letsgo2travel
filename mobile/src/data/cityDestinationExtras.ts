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
  destination("BA-sarajevo", "SJJ", labels("Saraybosna", "Sarajevo", "Sarajevë", "Sarajevo"), 43.8563, 18.4131),
  destination("RO-bucharest", "OTP", labels("Bükreş", "Bucharest", "Bukuresht", "București"), 44.4268, 26.1025),
  destination("AL-tirana", "TIA", labels("Tiran", "Tirana", "Tiranë", "Tirana"), 41.3275, 19.8187),
  destination("RS-belgrade", "BEG", labels("Belgrad", "Belgrade", "Beograd", "Belgrad"), 44.7866, 20.4489),
  destination("LV-riga", "RIX", labels("Riga", "Riga", "Rigë", "Riga"), 56.9496, 24.1052),
  destination("LT-vilnius", "VNO", labels("Vilnius", "Vilnius", "Vilnius", "Vilnius"), 54.6872, 25.2797),
  destination("FR-strasbourg", "SXB", labels("Strazburg", "Strasbourg", "Strasburg", "Strasbourg"), 48.5734, 7.7521),
  destination("ME-podgorica", "TGD", labels("Podgorica", "Podgorica", "Podgoricë", "Podgorica"), 42.4304, 19.2594),
  destination("EE-tallinn", "TLL", labels("Tallinn", "Tallinn", "Talin", "Tallinn"), 59.437, 24.7536),
  destination("PL-warsaw", "WAW", labels("Varşova", "Warsaw", "Varshavë", "Varșovia"), 52.2297, 21.0122),
  destination("PL-krakow", "KRK", labels("Krakov", "Krakow", "Krakov", "Cracovia"), 50.0647, 19.945),
  destination("SK-bratislava", "BTS", labels("Bratislava", "Bratislava", "Bratislavë", "Bratislava"), 48.1486, 17.1077),
  destination("PL-gdansk", "GDN", labels("Gdansk", "Gdansk", "Gdansk", "Gdańsk"), 54.352, 18.6466),
  destination("PT-lisbon", "LIS", labels("Lizbon", "Lisbon", "Lisbonë", "Lisabona"), 38.7223, -9.1393),
  destination("HU-budapest", "BUD", labels("Budapeşte", "Budapest", "Budapest", "Budapesta"), 47.4979, 19.0402),
  destination("HR-zagreb", "ZAG", labels("Zagreb", "Zagreb", "Zagreb", "Zagreb"), 45.815, 15.9819),
  destination("GR-athens", "ATH", labels("Atina", "Athens", "Athinë", "Atena"), 37.9838, 23.7275),
  destination("PT-porto", "OPO", labels("Porto", "Porto", "Porto", "Porto"), 41.1579, -8.6291),
  destination("GB-cardiff", "CWL", labels("Cardiff", "Cardiff", "Kardif", "Cardiff"), 51.4816, -3.1791),
  destination("FR-lyon", "LYS", labels("Lyon", "Lyon", "Lion", "Lyon"), 45.764, 4.8357),
  destination("CZ-prague", "PRG", labels("Prag", "Prague", "Pragë", "Praga"), 50.0755, 14.4378),
  destination("DE-berlin", "BER", labels("Berlin", "Berlin", "Berlin", "Berlin"), 52.52, 13.405),
  destination("BE-brussels", "BRU", labels("Brüksel", "Brussels", "Bruksel", "Bruxelles"), 50.8503, 4.3517),
  destination("AT-salzburg", "SZG", labels("Salzburg", "Salzburg", "Salzburg", "Salzburg"), 47.8095, 13.055),
  destination("LU-luxembourg", "LUX", labels("Lüksemburg", "Luxembourg", "Luksemburg", "Luxemburg"), 49.6116, 6.1319),
  destination("HR-dubrovnik", "DBV", labels("Dubrovnik", "Dubrovnik", "Dubrovnik", "Dubrovnik"), 42.6507, 18.0944),
  destination("SE-stockholm", "ARN", labels("Stockholm", "Stockholm", "Stokholm", "Stockholm"), 59.3293, 18.0686),
  destination("SI-ljubljana", "LJU", labels("Ljubljana", "Ljubljana", "Lubjanë", "Ljubljana"), 46.0569, 14.5058),
  destination("FR-nice", "NCE", labels("Nice", "Nice", "Nicë", "Nisa"), 43.7102, 7.262),
  destination("GB-belfast", "BFS", labels("Belfast", "Belfast", "Belfast", "Belfast"), 54.5973, -5.9301),
  destination("GB-london", "LHR", labels("Londra", "London", "Londër", "Londra"), 51.5074, -0.1278),
  destination("DE-hamburg", "HAM", labels("Hamburg", "Hamburg", "Hamburg", "Hamburg"), 53.5511, 9.9937),
  destination("IT-florence", "FLR", labels("Floransa", "Florence", "Firence", "Florența"), 43.7696, 11.2558),
  destination("AT-vienna", "VIE", labels("Viyana", "Vienna", "Vjenë", "Viena"), 48.2082, 16.3738),
  destination("BE-bruges", "OST", labels("Brugge", "Bruges", "Bruges", "Bruges"), 51.2093, 3.2247),
  destination("FI-helsinki", "HEL", labels("Helsinki", "Helsinki", "Helsinki", "Helsinki"), 60.1699, 24.9384),
  destination("ES-madrid", "MAD", labels("Madrid", "Madrid", "Madrid", "Madrid"), 40.4168, -3.7038),
  destination("IT-venice", "VCE", labels("Venedik", "Venice", "Venedik", "Veneția"), 45.4408, 12.3155),
  destination("IE-cork", "ORK", labels("Cork", "Cork", "Kork", "Cork"), 51.8985, -8.4756),
  destination("NL-amsterdam", "AMS", labels("Amsterdam", "Amsterdam", "Amsterdam", "Amsterdam"), 52.3676, 4.9041),
  destination("IE-dublin", "DUB", labels("Dublin", "Dublin", "Dublin", "Dublin"), 53.3498, -6.2603),
  destination("ES-barcelona", "BCN", labels("Barselona", "Barcelona", "Barcelonë", "Barcelona"), 41.3851, 2.1734),
  destination("CH-geneva", "GVA", labels("Cenevre", "Geneva", "Gjenevë", "Geneva"), 46.2044, 6.1432),
  destination("GB-edinburgh", "EDI", labels("Edinburgh", "Edinburgh", "Edinburg", "Edinburgh"), 55.9533, -3.1883),
  destination("DK-copenhagen", "CPH", labels("Kopenhag", "Copenhagen", "Kopenhagë", "Copenhaga"), 55.6761, 12.5683),
  destination("NO-oslo", "OSL", labels("Oslo", "Oslo", "Oslo", "Oslo"), 59.9139, 10.7522),
];
