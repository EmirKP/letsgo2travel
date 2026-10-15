import type { Coordinates, Place } from './types';

export type JourneyDiscoveryGroup = 'food' | 'shopping' | 'culture' | 'nature' | 'essentials';
export type JourneyPhoto = {
  imageUrl: string; imageSourceUrl: string; imageAttribution: string; imageLicenseLabel: string; imageLicenseUrl: string;
};
export type JourneyDiscoveryPlace = Place & Partial<JourneyPhoto> & { group: JourneyDiscoveryGroup; kind: string; address: string | null };
export type JourneyDiscoveryResult = {
  places: JourneyDiscoveryPlace[]; center: Coordinates; radius: number; fetchedAt: string;
  limited: boolean; stale?: boolean; attribution: string;
};
export type JourneyWalkingResult = {
  profile: 'foot-walking';
  // Apple returns independent adjacent-stop paths; keep snapping gaps separate.
  geometry: { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'MultiLineString'; coordinates: [number, number][][] };
  distanceMeters: number; durationSeconds: number;
  legs: { distanceMeters: number; durationSeconds: number }[];
  fetchedAt: string; sourceUrl: string; attribution: string;
};
export type JourneySearchPlace = Coordinates & { id: string; name: string; address: string | null; sourceUrl: string };
export type JourneySearchResult = { places: JourneySearchPlace[]; fetchedAt: string; attribution: string };
