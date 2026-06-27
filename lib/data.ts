import { getSupabaseAdmin } from "./supabaseAdmin";
import { blogPosts, countryGuides, flightDeals } from "./sample-data";
import type { BlogPost, CountryGuide, FlightDeal } from "./types";

import { supabase } from "./supabase-client";

export async function getFlightDeals(): Promise<FlightDeal[]> {
  const { data, error } = await supabase
    .from("biletler")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) return flightDeals;
  return data as FlightDeal[];
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) return blogPosts;
  return data as BlogPost[];
}

export async function getCountryGuides(): Promise<CountryGuide[]> {
  const { data, error } = await supabase
    .from("country_guides")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) return countryGuides;
  return data as CountryGuide[];
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
