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
import fallbackArtwork from "../assets/launch-travel-poster.webp";

const DESTINATION_ARTWORK: Record<string, string> = {
  BEG: belgradeArtwork,
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
  // Bu görseller uygulama paketindedir: Keşfet ekranı ilk açılışta
  // tam boy web JPEG'lerini indirmez ve bağlantısızken de anlamlı bir
  // görsel kalır. Bilinmeyen bir kod başka bir şehir (eski sürümde
  // Tokyo) gibi gösterilmez; markalı genel seyahat görseline döner.
  return (code && DESTINATION_ARTWORK[code.toUpperCase()]) || fallbackArtwork;
}
