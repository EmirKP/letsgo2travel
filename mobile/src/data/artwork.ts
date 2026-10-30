import bakuArtwork from "../assets/destination-artwork/baku.webp";
import bangkokArtwork from "../assets/destination-artwork/bangkok.webp";
import belgradeArtwork from "../assets/destination-artwork/belgrade.webp";
import dubaiArtwork from "../assets/destination-artwork/dubai.webp";
import romeArtwork from "../assets/destination-artwork/rome.webp";
import sarajevoArtwork from "../assets/destination-artwork/sarajevo.webp";
import tbilisiArtwork from "../assets/destination-artwork/tbilisi.webp";
import tiranaArtwork from "../assets/destination-artwork/tirana.webp";
import tokyoArtwork from "../assets/destination-artwork/tokyo.webp";
import baliArtwork from "../assets/home-reference/bali.webp";
import cappadociaArtwork from "../assets/home-reference/cappadocia.webp";
import santoriniArtwork from "../assets/home-reference/santorini-hero.webp";
import parisArtwork from "../assets/home-reference/paris-eiffel-v3.webp";
import newYorkArtwork from "../assets/community-reference/region-americas.webp";
import istanbulArtwork from "../assets/destination-artwork/istanbul-bosphorus.jpg";
import { bundledImageSource, type BundledImage } from "../lib/bundledImageSource";

// Unknown destinations keep a neutral surface, never a logo or another city's photo.
const fallbackArtwork = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='400'%3E%3Crect width='640' height='400' fill='%231c3c60'/%3E%3C/svg%3E";

const DESTINATION_ARTWORK: Record<string, BundledImage> = {
  BEG: belgradeArtwork,
  CDG: parisArtwork,
  PAR: parisArtwork,
  JFK: newYorkArtwork,
  NYC: newYorkArtwork,
  IST: istanbulArtwork,
  SAW: istanbulArtwork,
  BKK: bangkokArtwork,
  DPS: baliArtwork,
  DXB: dubaiArtwork,
  FCO: romeArtwork,
  GYD: bakuArtwork,
  JTR: santoriniArtwork,
  NAV: cappadociaArtwork,
  SJJ: sarajevoArtwork,
  TBS: tbilisiArtwork,
  TIA: tiranaArtwork,
  TYO: tokyoArtwork,
};

export function destinationArtwork(code?: string) {
  // Packaged photos work offline. Each airport/city alias resolves to its own
  // destination; unmatched codes never borrow a misleading destination photo.
  return bundledImageSource((code && DESTINATION_ARTWORK[code.toUpperCase()]) || fallbackArtwork);
}
