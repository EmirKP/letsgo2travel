import { NextResponse } from "next/server";
import { CACHE_TIMES, cachedJson } from "@/lib/http-cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return cachedJson([], CACHE_TIMES.AFFILIATE_SHORT);
  }

  try {
    const res = await fetch(`https://autocomplete.travelpayouts.com/places2?locale=tr&types[]=airport&types[]=city&types[]=country&term=${encodeURIComponent(q)}`, {
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!res.ok) return cachedJson([], CACHE_TIMES.AFFILIATE_SHORT);
    const data = await res.json();

    const formatted = data.slice(0, 12).map((item: any) => ({
      id: item.id || item.code,
      name: item.name,
      type: item.type === "country" ? "country" : "city",
      countryName: item.country_name,
      code: item.code,
    }));

    return cachedJson(formatted, CACHE_TIMES.STATIC_REFERENCE);
  } catch (error) {
    return NextResponse.json([], { status: 200, headers: { "Cache-Control": CACHE_TIMES.AFFILIATE_SHORT } });
  }
}
