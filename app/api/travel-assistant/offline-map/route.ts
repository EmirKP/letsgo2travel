import { unstable_cache } from "next/cache";
import { coordinates, coarseLocation } from "@/lib/travel-assistant/places";
import {
  normalizeOfflineMap,
  offlineMapQuery,
} from "@/lib/travel-assistant/offline-map";
import { queryOverpass } from "@/lib/travel-assistant/overpass";
import { boundedJson } from "@/lib/travel-assistant/http";
export const runtime = "nodejs";
export const maxDuration = 30;
const cached = unstable_cache(
  async (lat: number, lon: number) => {
    const c = { latitude: lat, longitude: lon };
    return normalizeOfflineMap(
      await queryOverpass(offlineMapQuery(c), 23000),
      c,
    );
  },
  ["travel-offline-streets-v1"],
  { revalidate: 3600 },
);
export async function POST(request: Request) {
  let center;
  try {
    center = coordinates(await boundedJson(request, 1024));
  } catch {
    return Response.json({ code: "invalid" }, { status: 400 });
  }
  if (!center) return Response.json({ code: "invalid" }, { status: 400 });
  const c = coarseLocation(center);
  try {
    return Response.json(await cached(c.latitude, c.longitude), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { code: "map-unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      },
    );
  }
}
