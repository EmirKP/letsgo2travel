import { NextResponse } from "next/server";
import { listEventCities } from "@/lib/airport-search";
import { CACHE_TIMES, cachedJson } from "@/lib/http-cache";

export async function GET(request: Request) {
  const countryCode = new URL(request.url).searchParams.get("countryCode")?.trim().toUpperCase() || "";
  if (!/^([A-Z]{2}|XK)$/.test(countryCode)) {
    return NextResponse.json({ error: "Geçersiz ülke kodu." }, { status: 400 });
  }

  return cachedJson(
    { data: listEventCities(countryCode) },
    CACHE_TIMES.STATIC_REFERENCE,
  );
}
