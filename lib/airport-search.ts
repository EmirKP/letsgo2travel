// =====================================================================
// Dünya çapında havalimanı arama (tek ortak kaynak).
// - Veri: lib/airports-dataset.json — OurAirports (kamu malı) verisinden
//   scripts/generate-airports.mjs ile üretilir (yalnız IATA kodlu,
//   tarifeli orta/büyük havalimanları; ülke adları Türkçe).
// - Türkçe şehir adları (Roma, Venedik, Münih...) lib/airports.ts içindeki
//   küratörlü listeden ALIAS olarak eklenir; kullanıcı IATA bilmek
//   zorunda kalmaz.
// - Arama sunucu tarafında çalışır (/api/airports); istemciye tüm liste
//   inmez. Fonksiyonlar saf olduğu için birim testlenebilir.
// =====================================================================

import dataset from "./airports-dataset.json";
import { GLOBAL_LOCATIONS } from "./airports";

export type AirportEntry = {
  iata: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  /** 0 büyük, 1 tarifeli orta, 2 diğer orta/büyük, 3 tamamlayıcı küçük. */
  priority: number;
};

export type EventCityOption = {
  name: string;
  placeCode: string;
};

export function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ")
    .trim();
}

type PreparedAirport = {
  entry: AirportEntry;
  iata: string;
  name: string;
  city: string;
  country: string;
  alias: string;
};

// Küratörlü Türkçe adlar → dataset'teki gerçek havalimanına alias.
const aliasByIata = new Map<string, string[]>();
for (const location of GLOBAL_LOCATIONS) {
  if (location.type !== "city" || !/^[A-Z]{3}$/.test(location.code)) continue;
  const list = aliasByIata.get(location.code) || [];
  list.push(normalizeSearchText(location.name));
  aliasByIata.set(location.code, list);
}

const PREPARED: PreparedAirport[] = (dataset as AirportEntry[]).map((entry) => ({
  entry,
  iata: normalizeSearchText(entry.iata),
  name: normalizeSearchText(entry.name),
  city: normalizeSearchText(entry.city),
  country: normalizeSearchText(entry.country),
  alias: (aliasByIata.get(entry.iata) || []).join(" | "),
}));

// OurAirports belediye alanı bazı büyük havalimanlarında ilçeyi taşır
// (IST=Arnavutköy, SAW=Pendik gibi). Etkinlik filtresi şehir beklediği için
// yalnız bu açıkça bilinen metropol sapmalarını kanonik şehir adına çevir.
const EVENT_CITY_OVERRIDES: Record<string, string> = {
  ADA: "Adana",
  CIA: "Rome",
  ECN: "Nicosia",
  EWR: "New York",
  FCO: "Rome",
  IST: "Istanbul",
  LGW: "London",
  LHR: "London",
  LIN: "Milan",
  MXP: "Milan",
  NRT: "Tokyo",
  SAW: "Istanbul",
  STN: "London",
};

function eventCityName(entry: AirportEntry) {
  const override = EVENT_CITY_OVERRIDES[entry.iata];
  if (override) return override;
  // "Bakırköy, Istanbul" ve "Cincinnati / Covington" gibi belediye
  // değerlerini etkinlik sağlayıcılarının anlayacağı ana şehre indirger.
  const commaParts = entry.city.split(",").map((part) => part.trim()).filter(Boolean);
  const city = commaParts.length > 1 ? commaParts[commaParts.length - 1] : entry.city;
  return city.split("/")[0].trim().slice(0, 120);
}

function scoreAirport(query: string, airport: PreparedAirport) {
  if (airport.iata === query) return 0;
  if (airport.alias.split(" | ").some((alias) => alias === query)) return 1;
  if (airport.city === query || airport.name === query) return 2;
  if (airport.iata.startsWith(query)) return 3;
  if (airport.alias.split(" | ").some((alias) => alias.startsWith(query))) return 4;
  if (airport.city.startsWith(query)) return 5;
  if (airport.name.startsWith(query)) return 6;
  if (airport.country.startsWith(query)) return 7;
  if (airport.city.includes(query) || airport.name.includes(query) || airport.alias.includes(query)) return 8;
  if (airport.country.includes(query)) return 9;
  return Number.POSITIVE_INFINITY;
}

/**
 * Şehir, ülke, havalimanı adı veya IATA koduyla arar.
 * Eşit skorda Türkiye havalimanları öne gelir (ürünün ana pazarı).
 */
export function searchAirports(rawQuery: string, limit = 12): AirportEntry[] {
  const query = normalizeSearchText(String(rawQuery || "").slice(0, 80));
  if (query.length < 2) return [];

  return PREPARED
    .map((airport) => ({ airport, score: scoreAirport(query, airport) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) =>
      left.score - right.score
      || left.airport.entry.priority - right.airport.entry.priority
      || Number(right.airport.entry.countryCode === "TR") - Number(left.airport.entry.countryCode === "TR")
      || left.airport.entry.city.localeCompare(right.airport.entry.city, "tr")
      || left.airport.entry.name.localeCompare(right.airport.entry.name, "tr"))
    .slice(0, Math.min(Math.max(limit, 1), 20))
    .map((item) => item.airport.entry);
}

/** IATA kodundan havalimanı kaydını döndürür (yoksa null). */
export function findAirportByIata(code: string): AirportEntry | null {
  const iata = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) return null;
  const found = (dataset as AirportEntry[]).find((entry) => entry.iata === iata);
  return found || null;
}

/**
 * Ülkeye bağlı etkinlik şehirlerini, PredictHQ'nun place.scope filtresinde
 * kullanılabilecek temsilî bir IATA koduyla döndürür. Aynı şehrin birden
 * fazla havalimanı varsa büyük/tarifeli olan tek seçenek olarak kalır.
 */
export function listEventCities(countryCode: string, limit = 120): EventCityOption[] {
  const country = String(countryCode || "").trim().toUpperCase();
  if (!/^([A-Z]{2}|XK)$/.test(country)) return [];

  const byCity = new Map<string, { option: EventCityOption; priority: number }>();
  for (const entry of dataset as AirportEntry[]) {
    if (entry.countryCode !== country || !entry.city.trim()) continue;
    const name = eventCityName(entry);
    const normalized = normalizeSearchText(name);
    if (!normalized) continue;
    const current = byCity.get(normalized);
    if (!current || entry.priority < current.priority) {
      byCity.set(normalized, {
        option: { name, placeCode: entry.iata },
        priority: entry.priority,
      });
    }
  }

  return [...byCity.values()]
    .sort((left, right) => left.priority - right.priority
      || left.option.name.localeCompare(right.option.name, "tr"))
    .slice(0, Math.min(Math.max(Math.floor(limit) || 1, 1), 160))
    .map((item) => item.option);
}

export function airportCount() {
  return (dataset as AirportEntry[]).length;
}
