import { config } from "../lib/config";

const DESTINATION_ARTWORK: Record<string, string> = {
  BEG: "/destinations/serbia/belgrade-fortress.jpg",
  BKK: "/travel-images/route-summer.jpg",
  DXB: "/destinations/dubai-marina.jpg",
  FCO: "/destinations/rome-colosseum.jpg",
  GYD: "/destinations/baku-flame.jpg",
  SJJ: "/destinations/bosnia/sarajevo.jpg",
  TBS: "/destinations/georgia/tbilisi-hero-v26.jpg",
  TIA: "/travel-images/route-generic.jpg",
  TYO: "/travel-images/discover.jpg",
};

export function destinationArtwork(code?: string) {
  const path = code ? DESTINATION_ARTWORK[code.toUpperCase()] : undefined;
  return `${config.apiBaseUrl}${path || "/travel-images/discover.jpg"}`;
}
