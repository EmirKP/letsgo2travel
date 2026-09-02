import { requestJson } from "./api";

// Havalimanı arama istemcisi: web ile AYNI ortak kaynak olan
// /api/airports ucunu kullanır (OurAirports veri seti, sunucu tarafı
// arama). Büyük liste cihaza indirilmez; sorgu başına en iyi 12 sonuç
// gelir ve bellek içinde cache'lenir.

export type AirportOption = {
  iata: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
};

const cache = new Map<string, AirportOption[]>();
const CACHE_LIMIT = 80;

export async function searchAirports(query: string): Promise<AirportOption[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const key = term.toLocaleLowerCase("tr-TR");
  const cached = cache.get(key);
  if (cached) return cached;
  const rows = await requestJson<AirportOption[]>(`/api/airports?q=${encodeURIComponent(term)}`, { timeoutMs: 10_000 });
  const list = Array.isArray(rows) ? rows.filter((row) => /^[A-Z]{3}$/.test(String(row?.iata || ""))) : [];
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, list);
  return list;
}

export function airportTitle(option: AirportOption) {
  return option.city && option.city !== option.name ? option.city : option.name;
}
