import { NextResponse } from "next/server";
import { CACHE_TIMES, cachedJson } from "@/lib/http-cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return cachedJson([], CACHE_TIMES.AFFILIATE_SHORT);
  }

  try {
    const res = await fetch(`https://autocomplete.travelpayouts.com/places2?locale=tr&types[]=airport&types[]=city&term=${encodeURIComponent(q)}`, {
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!res.ok) return cachedJson([], CACHE_TIMES.AFFILIATE_SHORT);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];

    const formatted = rows
      .filter((item: any) => typeof item?.name === "string" && /^[A-Z0-9]{3}$/.test(String(item?.code || "").toUpperCase()))
      .slice(0, 12)
      .map((item: any) => ({
        id: String(item.id || item.code),
        name: String(item.name),
        type: item.type === "airport" ? "airport" : "city",
        countryName: typeof item.country_name === "string" ? item.country_name : "",
        code: String(item.code).toUpperCase(),
      }));

    return cachedJson(formatted, CACHE_TIMES.STATIC_REFERENCE);
  } catch {
    return NextResponse.json([], { status: 200, headers: { "Cache-Control": CACHE_TIMES.AFFILIATE_SHORT } });
  }
}
