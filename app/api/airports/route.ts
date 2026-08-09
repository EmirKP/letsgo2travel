import { NextResponse } from "next/server";
import { GLOBAL_LOCATIONS } from "@/lib/airports";
import { CACHE_TIMES } from "@/lib/http-cache";

function normalizedText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
}

const FLIGHT_LOCATIONS = GLOBAL_LOCATIONS
  .filter((location) => location.type === "city" && /^[A-Z0-9]{3}$/.test(location.code))
  .filter((location, index, rows) => rows.findIndex((candidate) => candidate.code === location.code) === index);

function scoreLocation(query: string, location: (typeof FLIGHT_LOCATIONS)[number]) {
  const code = normalizedText(location.code);
  const name = normalizedText(location.name);
  const country = normalizedText(location.countryName || "");
  if (code === query) return 0;
  if (name === query) return 1;
  if (code.startsWith(query)) return 2;
  if (name.startsWith(query)) return 3;
  if (country.startsWith(query)) return 4;
  if (name.includes(query)) return 5;
  if (country.includes(query)) return 6;
  return Number.POSITIVE_INFINITY;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = String(searchParams.get("q") || "").trim().slice(0, 80);
  const query = normalizedText(rawQuery);

  if (query.length < 2) {
    return NextResponse.json([], {
      headers: { "Cache-Control": CACHE_TIMES.STATIC_REFERENCE },
    });
  }

  const rows = FLIGHT_LOCATIONS
    .map((location) => ({ location, score: scoreLocation(query, location) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => left.score - right.score || left.location.name.localeCompare(right.location.name, "tr"))
    .slice(0, 12)
    .map(({ location }) => ({
      id: location.id,
      name: location.name,
      type: "city" as const,
      countryName: location.countryName || "",
      code: location.code,
    }));

  return NextResponse.json(rows, {
    headers: { "Cache-Control": CACHE_TIMES.STATIC_REFERENCE },
  });
}
