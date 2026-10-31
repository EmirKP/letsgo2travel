import type { AppLocale } from "../lib/locale";
import type { RouteSuggestion } from "../types";
import { routeByDestinationCode } from "./routes";
import { homeSearchDestinations } from "./homeDestinations";
import { EXTRA_CITY_DESTINATIONS } from "./cityDestinationExtras";
import type { BudgetCityPhoto } from "./budgetCityPhotos";
import paris from "../assets/home-reference/paris-eiffel-v3.webp";
import bali from "../assets/home-reference/bali-beach-v5.webp";
import tokyo from "../assets/home-reference/tokyo-temple-v5.webp";
import rome from "../assets/destination-artwork/rome.webp";
import kelingking from "../assets/home-reference/bali.webp";
import shibuya from "../assets/destination-artwork/tokyo.webp";
import louvre from "../assets/city-destinations/louvre.webp";
import uluwatu from "../assets/city-destinations/uluwatu.webp";
import trevi from "../assets/city-destinations/trevi.webp";
import romeHero from "../assets/city-destinations/rome-hero.webp";
import pantheon from "../assets/city-destinations/rome-pantheon.webp";
import vaticanMuseums from "../assets/city-destinations/rome-vatican-museums.webp";
import trastevere from "../assets/city-destinations/rome-trastevere.webp";
import villaBorghese from "../assets/city-destinations/rome-villa-borghese.webp";
import romePhotoCredits from "../assets/city-destinations/rome-photo-credits.json";

export type CityDestination = {
  code: string;
  name: string;
  country: string;
  countryCode: string;
  alpha3: string;
  photo: string;
  heroPhoto?: string;
  photoCredit?: BudgetCityPhoto["credit"];
  budgetBenchmarkId?: string;
  center: { latitude: number; longitude: number };
  route: RouteSuggestion | null;
  highlights: Array<{
    id: string; name: string; photo: string; latitude: number; longitude: number;
    photoCredit?: BudgetCityPhoto["credit"];
  }>;
};

type Labels = Record<AppLocale, string>;
type Highlight = Omit<CityDestination["highlights"][number], "name"> & { name: Labels };
type Destination = Omit<CityDestination, "name" | "country" | "route" | "highlights"> & {
  name: Labels;
  country: Labels;
  highlights: Highlight[];
};

// Airport codes identify existing app destinations. Map centres identify the
// city/region itself, never its airport. Bali includes neighbouring Nusa Penida.
// These are editorial landmarks, with no live prices, ratings or entry claims.
const DESTINATIONS: Destination[] = [
  {
    code: "CDG", name: { tr: "Paris", en: "Paris", sq: "Parisi", ro: "Paris" },
    country: { tr: "Fransa", en: "France", sq: "Francë", ro: "Franța" },
    countryCode: "FR", alpha3: "FRA", photo: paris, budgetBenchmarkId: "FR-paris",
    center: { latitude: 48.8566, longitude: 2.3522 },
    highlights: [
      { id: "eiffel-tower", name: { tr: "Eyfel Kulesi", en: "Eiffel Tower", sq: "Kulla Eifel", ro: "Turnul Eiffel" }, photo: paris, latitude: 48.85837, longitude: 2.29448 },
      { id: "louvre", name: { tr: "Louvre Müzesi", en: "Louvre Museum", sq: "Muzeu i Luvrit", ro: "Muzeul Luvru" }, photo: louvre, latitude: 48.8606, longitude: 2.3376 },
    ],
  },
  {
    code: "DPS", name: { tr: "Bali", en: "Bali", sq: "Bali", ro: "Bali" },
    country: { tr: "Endonezya", en: "Indonesia", sq: "Indonezi", ro: "Indonezia" },
    countryCode: "ID", alpha3: "IDN", photo: bali,
    center: { latitude: -8.4095, longitude: 115.1889 },
    highlights: [
      { id: "kelingking-beach", name: { tr: "Kelingking Plajı", en: "Kelingking Beach", sq: "Plazhi Kelingking", ro: "Plaja Kelingking" }, photo: kelingking, latitude: -8.7506, longitude: 115.4739 },
      { id: "uluwatu-temple", name: { tr: "Uluwatu Tapınağı", en: "Uluwatu Temple", sq: "Tempulli Uluwatu", ro: "Templul Uluwatu" }, photo: uluwatu, latitude: -8.8291, longitude: 115.0849 },
    ],
  },
  {
    code: "HND", name: { tr: "Tokyo", en: "Tokyo", sq: "Tokio", ro: "Tokyo" },
    country: { tr: "Japonya", en: "Japan", sq: "Japoni", ro: "Japonia" },
    countryCode: "JP", alpha3: "JPN", photo: tokyo,
    center: { latitude: 35.6762, longitude: 139.6503 },
    highlights: [
      { id: "senso-ji", name: { tr: "Sensō-ji Tapınağı", en: "Sensō-ji Temple", sq: "Tempulli Sensō-ji", ro: "Templul Sensō-ji" }, photo: tokyo, latitude: 35.714765, longitude: 139.796655 },
      { id: "shibuya-crossing", name: { tr: "Shibuya Kavşağı", en: "Shibuya Crossing", sq: "Kryqëzimi Shibuya", ro: "Intersecția Shibuya" }, photo: shibuya, latitude: 35.6595, longitude: 139.7005 },
    ],
  },
  {
    code: "FCO", name: { tr: "Roma", en: "Rome", sq: "Romë", ro: "Roma" },
    country: { tr: "İtalya", en: "Italy", sq: "Itali", ro: "Italia" },
    countryCode: "IT", alpha3: "ITA", photo: rome, heroPhoto: romeHero, budgetBenchmarkId: "IT-rome",
    center: { latitude: 41.9028, longitude: 12.4964 },
    highlights: [
      { id: "colosseum", name: { tr: "Kolezyum", en: "Colosseum", sq: "Koloseu", ro: "Colosseum" }, photo: rome, latitude: 41.89021, longitude: 12.49223 },
      { id: "trevi-fountain", name: { tr: "Trevi Çeşmesi", en: "Trevi Fountain", sq: "Shatërvani i Trevit", ro: "Fontana di Trevi" }, photo: trevi, latitude: 41.90094, longitude: 12.48331 },
      { id: "pantheon", name: { tr: "Pantheon", en: "Pantheon", sq: "Panteoni", ro: "Panteonul" }, photo: pantheon,
        latitude: 41.898996, longitude: 12.476993, photoCredit: romePhotoCredits["rome-pantheon.webp"].credit },
      // The visitor entrance on Viale Vaticano, not the separate museum exit.
      { id: "vatican-museums", name: { tr: "Vatikan Müzeleri", en: "Vatican Museums", sq: "Muzetë e Vatikanit", ro: "Muzeele Vaticanului" }, photo: vaticanMuseums,
        latitude: 41.9068876, longitude: 12.4538569, photoCredit: romePhotoCredits["rome-vatican-museums.webp"].credit },
      // A named square in the neighbourhood and a point inside the park.
      { id: "trastevere", name: { tr: "Trastevere", en: "Trastevere", sq: "Trastevere", ro: "Trastevere" }, photo: trastevere,
        latitude: 41.8893784, longitude: 12.4701817, photoCredit: romePhotoCredits["rome-trastevere.webp"].credit },
      { id: "villa-borghese", name: { tr: "Villa Borghese", en: "Villa Borghese", sq: "Villa Borghese", ro: "Villa Borghese" }, photo: villaBorghese,
        latitude: 41.91369219970958, longitude: 12.48712778418498, photoCredit: romePhotoCredits["rome-villa-borghese.webp"].credit },
    ],
  },
  ...EXTRA_CITY_DESTINATIONS,
];

/** Each caller receives independent map/highlight data and the existing route. */
export function cityDestinations(locale: AppLocale): CityDestination[] {
  const startingRoutes = homeSearchDestinations(locale);
  return DESTINATIONS.map(destination => ({
    code: destination.code,
    name: destination.name[locale],
    country: destination.country[locale],
    countryCode: destination.countryCode,
    alpha3: destination.alpha3,
    photo: destination.photo,
    ...(destination.heroPhoto ? { heroPhoto: destination.heroPhoto } : {}),
    ...(destination.photoCredit ? { photoCredit: { ...destination.photoCredit } } : {}),
    ...(destination.budgetBenchmarkId ? { budgetBenchmarkId: destination.budgetBenchmarkId } : {}),
    center: { ...destination.center },
    route: routeByDestinationCode(destination.code, locale)
      || startingRoutes.find(route => route.destinationCode === destination.code) || null,
    highlights: destination.highlights.map(highlight => ({
      ...highlight, name: highlight.name[locale],
      ...(highlight.photoCredit ? { photoCredit: { ...highlight.photoCredit } } : {}),
    })),
  }));
}

/** Resolve only canonical destination codes; unknown links have no fallback city. */
export function cityDestination(code: string, locale: AppLocale): CityDestination | null {
  const canonical = code.trim().toUpperCase();
  return cityDestinations(locale).find(destination => destination.code === canonical) || null;
}
