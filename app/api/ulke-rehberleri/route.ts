import { getCountryGuides } from "@/lib/data";
import { CACHE_TIMES, cachedJson } from "@/lib/http-cache";

export async function GET() {
  const countries = await getCountryGuides();
  return cachedJson({ data: countries }, CACHE_TIMES.STATIC_REFERENCE);
}
