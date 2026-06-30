import { affiliateRedirectUrl, aviasalesUrl } from "@/lib/affiliate";
import { CACHE_TIMES, cachedJson } from "@/lib/http-cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin") || "IST";
  const destination = searchParams.get("destination") || "DXB";

  const rawUrl = aviasalesUrl({ origin, destination });

  return cachedJson({
    mode: process.env.TRAVELPAYOUTS_TOKEN ? "api-ready" : "affiliate-fallback",
    url: affiliateRedirectUrl({
      provider: "aviasales",
      url: rawUrl,
      destination,
      sourcePage: "travelpayouts_search_api",
      campaign: "api_search",
    }),
    message: "Travelpayouts token eklenirse burada gerçek fiyat API entegrasyonu yapılabilir.",
  }, CACHE_TIMES.AFFILIATE_SHORT);
}
