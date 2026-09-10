import { NextResponse } from "next/server";
import { isoCountryByAlpha2 } from "@/lib/countries/isoSource";
import { getCountryBrief } from "@/lib/country-intelligence/brief";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  const code = (new URL(request.url).searchParams.get("country") || "").toUpperCase();
  if (!isoCountryByAlpha2(code)) return NextResponse.json({ error: "Geçersiz ülke." }, { status: 400 });
  const brief = await getCountryBrief(code);
  return NextResponse.json(brief, { headers: { "Cache-Control": brief.newsState === "unavailable" ? "no-store" : "public, max-age=120, s-maxage=600" } });
}
