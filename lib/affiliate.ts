import type { SiteSettings } from "./types";

export type AffiliateProvider = "booking" | "airalo" | "getyourguide" | "other";

export const siteSettings: SiteSettings = {
  bookingAffiliateUrl:
    process.env.NEXT_PUBLIC_BOOKING_AFFILIATE_URL || "https://www.booking.com/index.tr.html",
  airaloAffiliateUrl:
    process.env.NEXT_PUBLIC_AIRALO_AFFILIATE_URL || "https://www.airalo.com/",
  getYourGuideAffiliateUrl:
    process.env.NEXT_PUBLIC_GYG_AFFILIATE_URL || "https://www.getyourguide.com/",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "info@letsgo2travel.com.tr",
};

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
    default:
      return "https://www.letsgo2travel.com.tr";
  }
}
