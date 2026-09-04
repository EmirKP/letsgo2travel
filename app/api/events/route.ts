import { NextResponse } from "next/server";
import { searchTravelEvents, type TravelEventCategory } from "@/lib/travel-events";
import { listEventCities } from "@/lib/airport-search";
import { isValidTimeZone, isoDateAfterDays, sanitizeTimeZone, todayIsoInTimeZone } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set<TravelEventCategory>(["concert", "festival", "sport", "culture", "food", "family", "other"]);

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawTimeZone = url.searchParams.get("timeZone");
  if (rawTimeZone && !isValidTimeZone(rawTimeZone.trim())) {
    return NextResponse.json({ error: "Geçersiz saat dilimi.", code: "EVENT_TIME_ZONE_INVALID" }, { status: 400 });
  }
  const timeZone = sanitizeTimeZone(rawTimeZone);
  const today = todayIsoInTimeZone(timeZone);
  const maxDate = isoDateAfterDays(366, timeZone);
  const rawStartDate = url.searchParams.get("startDate");
  const rawEndDate = url.searchParams.get("endDate");
  if ((rawStartDate && !validIsoDate(rawStartDate)) || (rawEndDate && !validIsoDate(rawEndDate))) {
    return NextResponse.json({ error: "Geçersiz etkinlik tarihi.", code: "EVENT_DATE_INVALID" }, { status: 400 });
  }
  const startDate = rawStartDate || today;
  const endDate = rawEndDate || isoDateAfterDays(120, timeZone);
  if (startDate < today) {
    return NextResponse.json({ error: "Etkinlik başlangıcı geçmiş bir tarih olamaz.", code: "EVENT_DATE_PAST" }, { status: 400 });
  }
  if (startDate > maxDate || endDate > maxDate) {
    return NextResponse.json({ error: "Etkinlikler bugünden itibaren en fazla bir yıl için aranabilir.", code: "EVENT_DATE_TOO_FAR" }, { status: 400 });
  }
  const rangeMs = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  if (rangeMs < 0 || rangeMs > 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Geçersiz etkinlik tarih aralığı.", code: "EVENT_DATE_RANGE_INVALID" }, { status: 400 });
  }
  const rawCountry = (url.searchParams.get("countryCode") || "").trim().toUpperCase();
  if (rawCountry && !/^([A-Z]{2}|XK)$/.test(rawCountry)) {
    return NextResponse.json({ error: "Geçersiz ülke kodu." }, { status: 400 });
  }
  const countryCode = /^[A-Z]{2}$/.test(rawCountry) || rawCountry === "XK" ? rawCountry : undefined;
  const rawPlaceCode = (url.searchParams.get("placeCode") || "").trim().toUpperCase();
  if (rawPlaceCode && !/^[A-Z]{3}$/.test(rawPlaceCode)) {
    return NextResponse.json({ error: "Geçersiz şehir kodu." }, { status: 400 });
  }
  const cityOption = rawPlaceCode && countryCode
    ? listEventCities(countryCode).find((option) => option.placeCode === rawPlaceCode)
    : undefined;
  if (rawPlaceCode && !cityOption) {
    return NextResponse.json({ error: "Şehir seçilen ülkeyle eşleşmiyor." }, { status: 400 });
  }
  // Kodlu seçimde şehir adı istemciden güvenilmez; ortak veri kaynağındaki
  // kanonik ad kullanılır. Kodsuz city eski istemcilerle uyumluluk içindir.
  const city = cityOption?.name || (url.searchParams.get("city") || "").trim().slice(0, 120) || undefined;
  const placeCode = cityOption?.placeCode;
  const featured = url.searchParams.get("featured") === "true";
  const rawCategory = url.searchParams.get("category") as TravelEventCategory | null;
  if (rawCategory && !CATEGORIES.has(rawCategory)) {
    return NextResponse.json({ error: "Geçersiz etkinlik kategorisi." }, { status: 400 });
  }
  const category = featured ? "concert" : rawCategory && CATEGORIES.has(rawCategory) ? rawCategory : undefined;
  const limit = Math.max(1, Math.min(Math.floor(Number(url.searchParams.get("limit")) || 24), 50));

  try {
    const result = await searchTravelEvents({
      countryCode,
      city,
      placeCode,
      startDate,
      endDate,
      category,
      featured,
      limit,
    });
    return NextResponse.json({
      data: result.events,
      meta: {
        providerConfigured: result.providerConfigured,
        providers: result.providers,
        fallbackUsed: result.fallbackUsed,
        coverageLimited: result.coverageLimited,
        coverageStatus: result.coverageStatus,
        partial: result.partial,
        updatedAt: new Date().toISOString(),
      },
    }, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=900, stale-while-revalidate=1800" },
    });
  } catch {
    return NextResponse.json({ error: "Etkinlikler şu anda alınamadı." }, { status: 503 });
  }
}
