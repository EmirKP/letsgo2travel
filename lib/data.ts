import { unstable_cache } from "next/cache";
import { blogPosts, countryGuides, flightDeals } from "./sample-data";
import type { BlogPost, CountryGuide, FlightDeal } from "./types";
import { supabase } from "./supabase-client";

const REMOTE_TIMEOUT_MS = 2200;
let remoteUnavailableUntil = 0;

function remoteDataConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return Boolean(
    url &&
      key &&
      !url.includes("dummy") &&
      !url.includes("BURAYA_") &&
      !key.includes("dummy") &&
      !key.includes("BURAYA_") &&
      Date.now() >= remoteUnavailableUntil,
  );
}

async function runRemoteQuery<T>(query: { abortSignal: (signal: AbortSignal) => PromiseLike<{ data: T[] | null; error: unknown }> }) {
  if (!remoteDataConfigured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const { data, error } = await query.abortSignal(controller.signal);
    if (error || !data?.length) return null;
    return data;
  } catch {
    // Keep the public site responsive when the optional content database is
    // unavailable. A later request retries automatically after the cooldown.
    remoteUnavailableUntil = Date.now() + 60_000;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeFlightDeals(deals: FlightDeal[]): FlightDeal[] {
  const byRoute = new Map<string, FlightDeal>();

  for (const deal of deals) {
    if (!deal?.slug || !deal.origin_code || !deal.destination_code) continue;

    const price = Number(deal.price);
    if (!Number.isFinite(price) || price <= 0 || deal.active === false) continue;

    const routeKey = `${deal.origin_code.toUpperCase()}-${deal.destination_code.toUpperCase()}`;

    // Sorgu en yeni kayıt önce gelecek şekilde sıralıdır. Aynı rota için yalnızca
    // ilk (en güncel) kayıt tutulur; böylece ana sayfa ve kampanyalar farklı
    // fiyatlı kopyalar göstermez.
    if (byRoute.has(routeKey)) continue;

    byRoute.set(routeKey, {
      ...deal,
      origin_code: deal.origin_code.toUpperCase(),
      destination_code: deal.destination_code.toUpperCase(),
      price,
      currency: deal.currency || "TRY",
      active: true,
    });
  }

  return Array.from(byRoute.values());
}

const getCachedRemoteFlightDeals = unstable_cache(
  async () =>
    runRemoteQuery<FlightDeal>(
      supabase.from("biletler").select("*").eq("active", true).order("created_at", { ascending: false }),
    ),
  ["public-flight-deals"],
  {
    revalidate: 900,
    tags: ["flight-deals"],
  },
);

export async function getFlightDeals(): Promise<FlightDeal[]> {
  const remoteDeals = await getCachedRemoteFlightDeals();
  const normalized = normalizeFlightDeals(remoteDeals || []);
  return normalized.length > 0 ? normalized : flightDeals;
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const data = await runRemoteQuery<BlogPost>(
    supabase.from("blog_posts").select("*").eq("status", "published").order("created_at", { ascending: false }),
  );
  return data || blogPosts;
}

export async function getCountryGuides(): Promise<CountryGuide[]> {
  const data = await runRemoteQuery<CountryGuide>(
    supabase.from("country_guides").select("*").eq("status", "published").order("created_at", { ascending: false }),
  );
  return data || countryGuides;
}

export async function getDealBySlug(slug: string) {
  const deals = await getFlightDeals();
  return deals.find((deal) => deal.slug === slug) || null;
}

export async function getBlogBySlug(slug: string) {
  const posts = await getBlogPosts();
  return posts.find((post) => post.slug === slug) || null;
}

export async function getCountryBySlug(slug: string) {
  const guides = await getCountryGuides();
  return guides.find((guide) => guide.slug === slug) || null;
}
