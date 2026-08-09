import type { SiteSettings } from "./types";
import { GLOBAL_LOCATIONS } from "./airports";

export type AffiliateProvider = "aviasales" | "booking" | "airalo" | "getyourguide" | "other";

export const siteSettings: SiteSettings = {
  bookingAffiliateUrl:
    process.env.NEXT_PUBLIC_BOOKING_AFFILIATE_URL || "https://www.booking.com/index.tr.html",
  airaloAffiliateUrl:
    process.env.NEXT_PUBLIC_AIRALO_AFFILIATE_URL || "https://www.airalo.com/",
  getYourGuideAffiliateUrl:
    process.env.NEXT_PUBLIC_GYG_AFFILIATE_URL || "https://www.getyourguide.com/",
  travelpayoutsMarker: process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER || process.env.TRAVELPAYOUTS_MARKER || "725223",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "info@letsgo2travel.com.tr",
};

const KNOWN_FLIGHT_CODES = new Set(
  GLOBAL_LOCATIONS
    .filter((location) => location.type === "city" && /^[A-Z0-9]{3}$/.test(location.code))
    .map((location) => location.code),
);

function iata(value: string | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  return KNOWN_FLIGHT_CODES.has(normalized) ? normalized : "";
}

function isoDate(value: string | undefined) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

export function internalFlightSearchUrl(params: {
  origin?: string;
  destination?: string;
  departDate?: string;
  returnDate?: string;
  currency?: string;
  language?: string;
}) {
  const origin = iata(params.origin);
  const destination = iata(params.destination);
  const departDate = isoDate(params.departDate);
  const returnDate = isoDate(params.returnDate);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.letsgo2travel.com.tr";
  const url = new URL("/ucak-bileti-ara", siteUrl);
  if (origin) url.searchParams.set("origin", origin);
  if (destination) url.searchParams.set("destination", destination);
  url.searchParams.set("tripType", returnDate ? "round_trip" : "one_way");
  if (departDate) url.searchParams.set("departureDate", departDate);
  if (returnDate) url.searchParams.set("returnDate", returnDate);
  url.searchParams.set("currency", /^[A-Z]{3}$/.test(params.currency || "") ? params.currency! : "TRY");
  return url.toString();
}

export function withUtm(url: string, source = "letsgo2travel", campaign = "site_cta") {
  try {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("utm_source", source);
    nextUrl.searchParams.set("utm_medium", "affiliate");
    nextUrl.searchParams.set("utm_campaign", campaign);
    return nextUrl.toString();
  } catch {
    return url;
  }
}

export function affiliateRedirectUrl(params: {
  provider: AffiliateProvider;
  url: string;
  destination?: string;
  sourcePage?: string;
  campaign?: string;
}) {
  const query = new URLSearchParams();
  query.set("url", params.url);
  if (params.destination) query.set("destination", params.destination);
  if (params.sourcePage) query.set("source", params.sourcePage);
  if (params.campaign) query.set("campaign", params.campaign);
  return `/go/${params.provider}?${query.toString()}`;
}

export function trackedAffiliateUrl(params: {
  provider: AffiliateProvider;
  url: string;
  source?: string;
  destination?: string;
  sourcePage?: string;
  campaign?: string;
}) {
  const source = params.source || "letsgo2travel";
  const campaign = params.campaign || "site_cta";
  const utmUrl = withUtm(params.url, source, campaign);
  return affiliateRedirectUrl({
    provider: params.provider,
    url: utmUrl,
    destination: params.destination,
    sourcePage: params.sourcePage,
    campaign,
  });
}

export function providerUrl(provider: AffiliateProvider) {
  switch (provider) {
    case "booking":
      return siteSettings.bookingAffiliateUrl;
    case "airalo":
      return siteSettings.airaloAffiliateUrl;
    case "getyourguide":
      return siteSettings.getYourGuideAffiliateUrl;
    case "aviasales":
      return internalFlightSearchUrl({});
    default:
      return "https://www.letsgo2travel.com.tr";
  }
}
