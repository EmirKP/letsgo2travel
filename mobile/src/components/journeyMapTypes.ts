import type { PointCategory } from '../../../lib/travel-assistant/types';

export interface JourneyMapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Provider category; missing legacy categories use a neutral place pin. */
  category?: PointCategory;
  /** A source-verified photo of this exact place, when available. */
  imageUrl?: string;
}

export interface JourneyMapStop extends JourneyMapPoint {
  day: number;
  order: number;
}

export interface JourneyMapRoute {
  id: string;
  day: number;
  /** Actual provider geometry in latitude/longitude order; never a stop-to-stop estimate. */
  coordinates: Array<[latitude: number, longitude: number]>;
}

export interface JourneyMapViewport {
  center: { latitude: number; longitude: number };
  bounds: { north: number; south: number; east: number; west: number };
  zoom: number;
}

export interface JourneyMapLabels {
  map: string;
  zoomIn: string;
  zoomOut: string;
  tilesUnavailable: string;
  retryTiles: string;
  stop: (order: number, day: number, name: string) => string;
  place: (name: string) => string;
  cluster: (count: number) => string;
}

export interface JourneyMapProps {
  ownerId?: string | null;
  onSearchArea?: () => void;
  searchAreaLabel?: string;
  searchEnabled?: boolean;
  contentInsets?: { top:number; right:number; bottom:number; left:number };
  center: { latitude: number; longitude: number };
  stops: JourneyMapStop[];
  discoveredPlaces?: JourneyMapPoint[];
  routes?: JourneyMapRoute[];
  activeDay?: number | null;
  selectedPlaceId?: string | null;
  onSelectPlace: (point: JourneyMapPoint, kind: 'stop' | 'discovered') => void;
  onViewportChange?: (viewport: JourneyMapViewport) => void;
  labels: JourneyMapLabels;
}
