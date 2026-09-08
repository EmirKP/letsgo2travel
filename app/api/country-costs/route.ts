import { NextResponse } from "next/server";
import { getInflation, getRates, listCosts, getReferenceRate } from "@/lib/country-intelligence/economy";
import { CITY_BENCHMARKS, CITY_PRICE_MONTH } from "@/lib/country-intelligence/city-benchmarks";
import { isoCountryByAlpha2 } from "@/lib/countries/isoSource";
import { COST_CURRENCIES } from "@/lib/country-intelligence/currencies";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const benchmark = params.get("benchmark");
  if (benchmark) {
    const city = CITY_BENCHMARKS.find(row => row.id === benchmark);
    if (!city) return NextResponse.json({ error: "Şehir bulunamadı." }, { status: 400 });
    const currency = COST_CURRENCIES[city.code];
    const [inflation, rates, referenceFx] = await Promise.all([getInflation(city.code, CITY_PRICE_MONTH), getRates([currency]), getReferenceRate(currency)]);
    return NextResponse.json({ currency, inflation, fx: rates[currency] || null, referenceFx }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } });
  }
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
