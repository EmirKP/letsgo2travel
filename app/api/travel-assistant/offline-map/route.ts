import { unstable_cache } from "next/cache";
import { coordinates, coarseLocation } from "@/lib/travel-assistant/places";
import {
  normalizeOfflineMap,
  offlineMapQuery,
} from "@/lib/travel-assistant/offline-map";
import { queryOverpass } from "@/lib/travel-assistant/overpass";
import { boundedJson } from "@/lib/travel-assistant/http";
import { createMapResultCache } from "@/lib/travel-assistant/result-cache";
export const runtime = "nodejs";
export const maxDuration = 30;
const cached = unstable_cache(
  async (lat: number, lon: number) => {
    const c = { latitude: lat, longitude: lon };
    return normalizeOfflineMap(
      await queryOverpass(offlineMapQuery(c), 26000),
      c,
    );
  },
  ["travel-offline-streets-v2"],
  { revalidate: 3600 },
);
const downloads = new Map<string, Promise<ReturnType<typeof normalizeOfflineMap>>>();
const lastPacks = createMapResultCache<ReturnType<typeof normalizeOfflineMap>>(pack => pack.downloadedAt);
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
    const key = `${c.latitude}:${c.longitude}`;
    const fresh = lastPacks.read(key, true);
    if (fresh) return Response.json(fresh, { headers: { "Cache-Control": "private, no-store" } });
    let download = downloads.get(key);
    if (!download) {
      if (downloads.size >= 8) throw new Error('busy');
      download = cached(c.latitude, c.longitude)
        .then(pack => {
          lastPacks.remember(key, pack);
          return lastPacks.read(key, true) ? pack : { ...pack, stale: true };
        })
        .catch(error => {
          const previous = lastPacks.read(key);
          if (previous) return { ...previous, stale: true };
          throw error;
        }).finally(() => downloads.delete(key));
      downloads.set(key, download);
    }
    return Response.json(await download, {
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
