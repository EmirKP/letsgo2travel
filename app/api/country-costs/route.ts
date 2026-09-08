import { NextResponse } from "next/server";
import { getInflation, getRates, listCosts } from "@/lib/country-intelligence/economy";
import { isoCountryByAlpha2 } from "@/lib/countries/isoSource";
import { COST_CURRENCIES } from "@/lib/country-intelligence/currencies";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("country");
  const month = params.get("referenceMonth");
  const currency = params.get("currency");
  if (!code && (month || currency)) return NextResponse.json({ error: "Önce ülke seç." }, { status: 400 });
  if (code) {
    if (!isoCountryByAlpha2(code) || !currency || COST_CURRENCIES[code] !== currency
      || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > new Date().toISOString().slice(0, 7)
      || Number(month.slice(0, 4)) < new Date().getUTCFullYear() - 4) return NextResponse.json({ error: "Geçersiz ülke, para birimi veya fiyat tarihi." }, { status: 400 });
    const [inflation, rates] = await Promise.all([getInflation(code, month), getRates([currency])]);
    return NextResponse.json({ inflation, fx: rates[currency] || null }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } });
  }
  return NextResponse.json({ data: await listCosts(), checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } });
}
