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

export async function getFlightDeals(): Promise<FlightDeal[]> {
  const data = await runRemoteQuery<FlightDeal>(
    supabase.from("biletler").select("*").eq("active", true).order("created_at", { ascending: false }),
  );
  return data || flightDeals;
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
