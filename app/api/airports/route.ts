import { NextResponse } from "next/server";
import { searchAirports } from "@/lib/airport-search";
import { CACHE_TIMES } from "@/lib/http-cache";

// Dünya çapında havalimanı arama ucu (web + mobil ortak kaynak).
// Veri: lib/airports-dataset.json (OurAirports, kamu malı; ~3.2k tarifeli
// havalimanı). Arama sunucuda yapılır; istemciye yalnız en iyi 12 sonuç
// iner ve yanıt cache'lenir — büyük liste her tuşta indirilmez.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = String(searchParams.get("q") || "").trim().slice(0, 80);

  if (rawQuery.length < 2) {
    return NextResponse.json([], {
      headers: { "Cache-Control": CACHE_TIMES.STATIC_REFERENCE },
    });
  }

  const rows = searchAirports(rawQuery, 12).map((airport) => ({
    iata: airport.iata,
    name: airport.name,
    city: airport.city,
    country: airport.country,
    countryCode: airport.countryCode,
    // Geriye dönük alanlar (önceki yanıt sözleşmesiyle uyum):
    id: airport.iata,
    code: airport.iata,
    type: "city" as const,
    countryName: airport.country,
  }));

  return NextResponse.json(rows, {
    headers: { "Cache-Control": CACHE_TIMES.STATIC_REFERENCE },
  });
}
