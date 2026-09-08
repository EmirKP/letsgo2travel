import { NextResponse } from "next/server";
import { isoCountryByAlpha2 } from "@/lib/countries/isoSource";
import { getAdvisory } from "@/lib/country-intelligence/advisories";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const codes = [...new Set((new URL(request.url).searchParams.get("countries") || "").toUpperCase().split(","))];
  if (!codes.length || codes.length > 8 || codes.some(code => !isoCountryByAlpha2(code))) return NextResponse.json({ error: "1–8 geçerli ülke seç." }, { status: 400 });
  return NextResponse.json({ data: await Promise.all(codes.map(getAdvisory)) }, { headers: { "Cache-Control": "public, max-age=120, s-maxage=600" } });
}
