import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { AffiliateProvider } from "@/lib/affiliate";

const PROVIDER_HOSTS: Record<AffiliateProvider, string[]> = {
  aviasales: ["aviasales.com", "www.aviasales.com", "travelpayouts.com", "www.travelpayouts.com"],
  booking: ["booking.com", "www.booking.com"],
  airalo: ["airalo.com", "www.airalo.com"],
  getyourguide: ["getyourguide.com", "www.getyourguide.com"],
  other: [],
};

function normalizeProvider(provider: string): AffiliateProvider | null {
  if (["aviasales", "booking", "airalo", "getyourguide", "other"].includes(provider)) {
    return provider as AffiliateProvider;
  }
  return null;
}

function isAllowedTarget(provider: AffiliateProvider, rawUrl: string) {
  try {
    const target = new URL(rawUrl);
    if (!["https:", "http:"].includes(target.protocol)) return false;
    if (target.protocol !== "https:" && process.env.NODE_ENV === "production") return false;

    const hostname = target.hostname.toLowerCase();
    const allowedHosts = PROVIDER_HOSTS[provider];
    if (provider === "other") return false;

    return allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function hashIp(ip: string | null) {
  if (!ip) return null;
  const salt = process.env.ANALYTICS_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 24) || "letsgo2travel";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await params;
  const provider = normalizeProvider(rawProvider);
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url") || "";

  if (!provider || !isAllowedTarget(provider, targetUrl)) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const realIp = request.headers.get("x-real-ip") || forwardedFor;
    const destination = searchParams.get("destination");
    const sourcePage = searchParams.get("source");
    const campaign = searchParams.get("campaign") || "site_cta";

    await supabase.from("affiliate_clicks").insert({
      provider,
      source_page: sourcePage,
      destination,
      affiliate_url: targetUrl,
      utm_source: "letsgo2travel",
      utm_campaign: campaign,
      user_agent: request.headers.get("user-agent"),
      ip_hash: hashIp(realIp),
    });
  }

  return NextResponse.redirect(targetUrl, 302);
}
