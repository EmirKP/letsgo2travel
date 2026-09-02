import { NextResponse } from "next/server";
import { ISO_COUNTRIES } from "@/lib/countries/isoSource";
import { CACHE_TIMES } from "@/lib/http-cache";

// Belgeli Gezgin başvurusuna açık ülkeler (web ve mobil ORTAK kaynak;
// mobil bu listeyi çoğaltmaz). Yalnız güvenli görüntü alanları döner.
export async function GET() {
  return NextResponse.json({
    data: ISO_COUNTRIES.map((country) => ({
      code: country.alpha2,
      name: country.name,
      flag: country.flag,
    })),
  }, { headers: { "Cache-Control": CACHE_TIMES.STATIC_REFERENCE } });
}
