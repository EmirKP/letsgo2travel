import { aviasalesUrl } from "@/lib/affiliate";
import { CACHE_TIMES, cachedJson } from "@/lib/http-cache";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin") || "IST";
  const destination = searchParams.get("destination") || "DXB";

  return cachedJson({
    mode: process.env.TRAVELPAYOUTS_TOKEN ? "api-ready" : "affiliate-fallback",
    url: aviasalesUrl({ origin, destination }),
    message: "Travelpayouts token eklenirse burada gerçek fiyat API entegrasyonu yapılabilir.",
  }, CACHE_TIMES.AFFILIATE_SHORT);
}
