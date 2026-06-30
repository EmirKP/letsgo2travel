import { NextResponse } from "next/server";

export const CACHE_TIMES = {
  STATIC_REFERENCE: "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
  CONTENT_LIST: "public, max-age=120, s-maxage=3600, stale-while-revalidate=86400",
  AFFILIATE_SHORT: "public, max-age=30, s-maxage=300, stale-while-revalidate=1800",
  PRIVATE_NO_STORE: "private, no-store, max-age=0",
} as const;

export function cachedJson<T>(data: T, cacheControl = CACHE_TIMES.CONTENT_LIST, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", cacheControl);
  headers.set("CDN-Cache-Control", cacheControl);
  headers.set("Vercel-CDN-Cache-Control", cacheControl);
  headers.set("X-Content-Type-Options", "nosniff");

  return NextResponse.json(data, {
    ...init,
    headers,
  });
}
