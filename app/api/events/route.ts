import { NextResponse } from "next/server";
import { searchTravelEvents, type TravelEventCategory } from "@/lib/travel-events";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set<TravelEventCategory>(["concert", "festival", "sport", "culture", "food", "family", "other"]);

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const after = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
  const rawStartDate = url.searchParams.get("startDate");
  const rawEndDate = url.searchParams.get("endDate");
  if ((rawStartDate && !validIsoDate(rawStartDate)) || (rawEndDate && !validIsoDate(rawEndDate))) {
    return NextResponse.json({ error: "Geçersiz etkinlik tarihi." }, { status: 400 });
  }
  const startDate = rawStartDate || now.toISOString().slice(0, 10);
  const endDate = rawEndDate || after.toISOString().slice(0, 10);
  const rangeMs = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  if (rangeMs < 0 || rangeMs > 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Geçersiz etkinlik tarih aralığı." }, { status: 400 });
  }
  const rawCountry = (url.searchParams.get("countryCode") || "").trim().toUpperCase();
  if (rawCountry && !/^([A-Z]{2}|XK)$/.test(rawCountry)) {
    return NextResponse.json({ error: "Geçersiz ülke kodu." }, { status: 400 });
  }
  const countryCode = /^[A-Z]{2}$/.test(rawCountry) || rawCountry === "XK" ? rawCountry : undefined;
  const city = (url.searchParams.get("city") || "").trim().slice(0, 120) || undefined;
  const rawCategory = url.searchParams.get("category") as TravelEventCategory | null;
  if (rawCategory && !CATEGORIES.has(rawCategory)) {
    return NextResponse.json({ error: "Geçersiz etkinlik kategorisi." }, { status: 400 });
  }
  const category = rawCategory && CATEGORIES.has(rawCategory) ? rawCategory : undefined;
  const limit = Math.max(1, Math.min(Math.floor(Number(url.searchParams.get("limit")) || 24), 50));

  try {
    const result = await searchTravelEvents({
      countryCode,
      city,
      startDate,
      endDate,
      category,
      featured: url.searchParams.get("featured") === "true",
      limit,
    });
    return NextResponse.json({ data: result.events, meta: { providerConfigured: result.providerConfigured, partial: result.partial, updatedAt: new Date().toISOString() } }, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=900, stale-while-revalidate=1800" },
    });
  } catch {
    return NextResponse.json({ error: "Etkinlikler şu anda alınamadı." }, { status: 503 });
  }
}
