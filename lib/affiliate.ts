import type { SiteSettings } from "./types";

export const siteSettings: SiteSettings = {
  bookingAffiliateUrl:
    process.env.NEXT_PUBLIC_BOOKING_AFFILIATE_URL || "https://www.booking.com/index.tr.html?aid=letsgo2travel",
  airaloAffiliateUrl:
    process.env.NEXT_PUBLIC_AIRALO_AFFILIATE_URL || "https://www.airalo.com/",
  getYourGuideAffiliateUrl:
    process.env.NEXT_PUBLIC_GYG_AFFILIATE_URL || "https://www.getyourguide.com/",
  travelpayoutsMarker: process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER || process.env.TRAVELPAYOUTS_MARKER || "725223",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "info@letsgo2travel.com",
};

export function aviasalesUrl(params: {
  origin?: string;
  destination?: string;
  departDate?: string;
  returnDate?: string;
  marker?: string;
}) {
  const url = new URL("https://www.aviasales.com/search");
  const origin = params.origin || "IST";
  const destination = params.destination || "DXB";
  url.searchParams.set("origin_iata", origin);
  url.searchParams.set("destination_iata", destination);
  url.searchParams.set("depart_date", params.departDate || "");
  if (params.returnDate) url.searchParams.set("return_date", params.returnDate);
  url.searchParams.set("marker", params.marker || siteSettings.travelpayoutsMarker);
  return url.toString();
}

export function withUtm(url: string, source = "letsgo2travel") {
  try {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("utm_source", source);
    nextUrl.searchParams.set("utm_medium", "affiliate");
    nextUrl.searchParams.set("utm_campaign", "site_cta");
    return nextUrl.toString();
  } catch {
    return url;
  }
}
