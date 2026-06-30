import { getFlightDeals } from "@/lib/data";
import { CACHE_TIMES, cachedJson } from "@/lib/http-cache";

export async function GET() {
  const deals = await getFlightDeals();
  return cachedJson({ data: deals }, CACHE_TIMES.CONTENT_LIST);
}
