import { NextResponse } from "next/server";
import { COUNTRIES } from "@/lib/countries/countryData";
import { CACHE_TIMES } from "@/lib/http-cache";

// Belgeli Gezgin başvurusuna açık ülkeler (web ve mobil ORTAK kaynak;
// mobil bu listeyi çoğaltmaz). Yalnız güvenli görüntü alanları döner.
export async function GET() {
  return NextResponse.json({
    data: COUNTRIES.map((country) => ({
      code: country.code,
      name: country.nameTR,
      flag: country.flagEmoji,
    })),
  }, { headers: { "Cache-Control": CACHE_TIMES.STATIC_REFERENCE } });
}
