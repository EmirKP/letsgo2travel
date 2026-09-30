import {
  coarseLocation,
  coordinates,
  distanceKm,
  normalizePlaces,
  NEEDS,
  TOURING,
  safeWebsite,
} from "./places";
import type { Coordinates, Place } from "./types";
export type OfflineRoad = { name: string; points: [number, number][] };
export type OfflineMapPack = {
  version: 1;
  id: string;
  center: Coordinates;
  downloadedAt: string;
  roads: OfflineRoad[];
  places: Place[];
  limited: boolean;
  stale?: boolean;
};
export function offlineMapQuery(center: Coordinates) {
  const valid = coordinates(center);
  if (!valid) throw new Error("Invalid center");
  const c = coarseLocation(valid);
  return `[out:json][timeout:18][maxsize:16000000];(way(around:1500,${c.latitude},${c.longitude})[highway~"^(primary|secondary|tertiary|residential|pedestrian|footway|service|unclassified|living_street)$"];nwr(around:1500,${c.latitude},${c.longitude})[amenity~"^(hospital|pharmacy|police|atm|toilets)$"];nwr(around:1500,${c.latitude},${c.longitude})[tourism~"^(museum|attraction|viewpoint)$"];);out geom 700;`;
}
export function normalizeOfflineMap(
  raw: unknown,
  center: Coordinates,
  now = new Date(),
): OfflineMapPack {
  const r = raw as { elements?: unknown[]; remark?: unknown };
  if (!r || r.remark || !Array.isArray(r.elements))
    throw new Error("Incomplete map");
  const c = coarseLocation(center);
  let pointCount = 0;
  let limited = r.elements.length >= 700;
  const roads: OfflineRoad[] = [];
  for (const value of r.elements.slice(0, 700)) {
    const e = value as {
      type?: string;
      tags?: Record<string, string>;
      geometry?: { lat: number; lon: number }[];
    };
    if (e?.type !== "way" || !e.tags?.highway || !Array.isArray(e.geometry))
      continue;
    const points = e.geometry.map((p) =>
      coordinates({ latitude: p?.lat, longitude: p?.lon }),
    );
    if (points.some((p) => !p) || points.length < 2) continue;
    if (points.length > 500 || pointCount + points.length > 30000) {
      limited = true;
      continue;
    }
    // Entire road is omitted if it escapes the bounded pack; no misleading connecting lines.
    if (points.some((p) => distanceKm(c, p!) > 3)) {
      limited = true;
      continue;
    }
    pointCount += points.length;
    roads.push({
      name: typeof e.tags.name === "string" ? e.tags.name.slice(0, 100) : "",
      points: points.map((p) => [p!.latitude, p!.longitude]),
    });
  }
  if (!roads.length) throw new Error("No street data");
  const pois = {
    elements: r.elements.slice(0, 700).filter((e) => {
      const t = (e as { tags?: Record<string, string> })?.tags;
      return t?.amenity || t?.tourism;
    }).map((element) => {
      // `out geom` supplies outlines instead of `center` for buildings. Without
      // this conversion every way-based hospital/museum silently disappeared.
      const e = element as { center?: unknown; geometry?: {lat: number; lon: number}[] };
      if (e.center || !Array.isArray(e.geometry) || !e.geometry.length) return element;
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const p of e.geometry) {
        if (!coordinates({ latitude: p?.lat, longitude: p?.lon })) continue;
        minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
      }
      if (!Number.isFinite(minLat)) return element;
      return { ...e, center: { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 } };
    }),
  };
  const stamp = now.toISOString();
  const needs = normalizePlaces(pois, "needs", stamp).filter(p => distanceKm(c, p) <= 3);
  const touring = normalizePlaces(pois, "explore", stamp).filter(p => distanceKm(c, p) <= 3);
  if (pois.elements.length > 250 || needs.length > 50 || touring.length > 50) limited = true;
  const places = [...needs.slice(0, 50), ...touring.slice(0, 50)];
  return {
    version: 1,
    id: `${c.latitude}:${c.longitude}`,
    center: c,
    downloadedAt: stamp,
    roads,
    places,
    limited,
  };
}
export function validateOfflinePack(value: unknown): OfflineMapPack | null {
  if (!value || typeof value !== "object") return null;
  const p = value as OfflineMapPack;
  const c = coordinates(p.center);
  if (
    p.version !== 1 ||
    !c ||
    p.id !== `${c.latitude}:${c.longitude}` ||
    typeof p.downloadedAt !== "string" ||
    !Number.isFinite(Date.parse(p.downloadedAt)) ||
    Date.parse(p.downloadedAt) > Date.now() + 60000 ||
    !Array.isArray(p.roads) ||
    p.roads.length < 1 ||
    p.roads.length > 700 ||
    !Array.isArray(p.places) ||
    p.places.length > 100 ||
    typeof p.limited !== "boolean" ||
    (p.stale !== undefined && typeof p.stale !== "boolean")
  )
    return null;
  let count = 0;
  for (const road of p.roads) {
    if (
      !road || typeof road !== "object" ||
      typeof road.name !== "string" ||
      road.name.length > 100 ||
      !Array.isArray(road.points) ||
      road.points.length < 2 ||
      road.points.length > 500
    )
      return null;
    for (const point of road.points) {
      if (!Array.isArray(point) || point.length !== 2) return null;
      const v = coordinates({ latitude: point[0], longitude: point[1] });
      if (!v || distanceKm(c, v) > 3) return null;
      count++;
    }
  }
  if (count > 30000) return null;
  const ids = new Set<string>();
  for (const place of p.places) {
    const v = coordinates(place);
    if (
      !v ||
      distanceKm(c, v) > 3 ||
      typeof place.name !== "string" ||
      place.name.length > 180 ||
      ![...NEEDS, ...TOURING].includes(place.category) ||
      typeof place.id !== "string" ||
      ids.has(place.id) ||
      place.sourceUrl !== `https://www.openstreetmap.org/${place.id}` ||
      place.fetchedAt !== p.downloadedAt ||
      !(place.website === null || safeWebsite(place.website)) ||
      !(place.hours === null || typeof place.hours === 'string' && place.hours.length <= 180) ||
      !(place.description === null || typeof place.description === 'string' && place.description.length <= 500) ||
      !/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/[1-9]\d*$/.test(
        place.sourceUrl,
      )
    )
      return null;
    ids.add(place.id);
  }
  return p;
}
