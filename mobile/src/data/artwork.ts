import bakuArtwork from "../assets/destination-artwork/baku.webp";
import bangkokArtwork from "../assets/destination-artwork/bangkok.webp";
import belgradeArtwork from "../assets/destination-artwork/belgrade.webp";
import dubaiArtwork from "../assets/destination-artwork/dubai.webp";
import romeArtwork from "../assets/destination-artwork/rome.webp";
import sarajevoArtwork from "../assets/destination-artwork/sarajevo.webp";
import tbilisiArtwork from "../assets/destination-artwork/tbilisi.webp";
import tiranaArtwork from "../assets/destination-artwork/tirana.webp";
import tokyoArtwork from "../assets/destination-artwork/tokyo.webp";

const DESTINATION_ARTWORK: Record<string, string> = {
  BEG: belgradeArtwork,
  BKK: bangkokArtwork,
  DXB: dubaiArtwork,
  FCO: romeArtwork,
  GYD: bakuArtwork,
  SJJ: sarajevoArtwork,
  TBS: tbilisiArtwork,
  TIA: tiranaArtwork,
  TYO: tokyoArtwork,
};

export function destinationArtwork(code?: string) {
  // Bu görseller uygulama paketindedir: Keşfet ekranı ilk açılışta
  // tam boy web JPEG'lerini indirmez ve bağlantısızken de anlamlı bir
  // görsel kalır. Bilinmeyen kodlar erişilebilir metin içeriğini
  // engellemeden genel keşif görseline döner.
  return (code && DESTINATION_ARTWORK[code.toUpperCase()]) || tokyoArtwork;
}
