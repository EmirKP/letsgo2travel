import { geoBounds, geoContains } from "d3-geo";
import { locateForTravel } from "./travelAssistant";
import type { Coordinates } from "../../../lib/travel-assistant/types";
import { distanceKm } from "../../../lib/travel-assistant/places";
import { TRAVEL_CENTRES } from "./travelAreas";

export type DeviceArea = { center: Coordinates; country: string; city: string };
let shapes: Promise<Array<{ feature: unknown; code: string; bounds: [[number, number], [number, number]] }>> | null = null;
function countryShapes() {
  return shapes ||= import("../data/locationCountries.json").then(({ default: countries }) => countries.map(feature => ({ feature, code: feature.properties.code, bounds: geoBounds(feature) })));
}
export async function countryAt(center: Coordinates): Promise<string> {
  if (!Number.isFinite(center.latitude) || !Number.isFinite(center.longitude) || Math.abs(center.latitude)>90 || Math.abs(center.longitude)>180) return "";
  const countries = await countryShapes();
  const latitudeMargin = 2.5 / 111.2;
  const longitudeMargin = latitudeMargin / Math.max(0.01, Math.cos(center.latitude * Math.PI / 180));
  const candidates = countries.filter(({ bounds: [[west, south], [east, north]] }) => {
    const nearLatitude = center.latitude >= south - latitudeMargin && center.latitude <= north + latitudeMargin;
    const nearLongitude = west <= east ? center.longitude >= west - longitudeMargin && center.longitude <= east + longitudeMargin
      : center.longitude >= west - longitudeMargin || center.longitude <= east + longitudeMargin;
    return nearLatitude && nearLongitude;
  });
  const exact = candidates.filter(item => geoContains(item.feature, [center.longitude, center.latitude]));
  if (exact.length === 1) return exact[0].code;
  if (exact.length > 1) return "";
  // Coarse device coordinates and simplified shorelines can put a city such
  // as İstanbul just offshore. Infer only when nearby land belongs to ONE
  // country; international borders and open water stay a manual choice.
  const nearby = new Set<string>();
  for (let angle = 0; angle < 16; angle++) {
    const radians = angle * Math.PI / 8;
    const point: [number, number] = [center.longitude + longitudeMargin * Math.cos(radians), center.latitude + latitudeMargin * Math.sin(radians)];
    for (const item of candidates) if (geoContains(item.feature, point)) nearby.add(item.code);
  }
  return nearby.size === 1 ? [...nearby][0] : "";
}
/** Coordinates and boundary lookup stay on this device; no location history. */
export async function locateDeviceArea(): Promise<DeviceArea> {
  const center = await locateForTravel();
  const country = await countryAt(center);
  const nearest = TRAVEL_CENTRES.filter(city => distanceKm(center, city) < 20)
    .sort((a,b)=>distanceKm(center,a)-distanceKm(center,b))[0];
  return { center, country, city: nearest?.name || "" };
}
