export interface RoutePrice {
  label: string;
  fromPrice: number;
  currency: string;
  note: string;
}

export const routePrices: Record<string, RoutePrice> = {
  baku: { label: "Bakü", fromPrice: 1800, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  tbilisi: { label: "Tiflis", fromPrice: 1600, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  sarajevo: { label: "Saraybosna", fromPrice: 1200, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  dubai: { label: "Dubai", fromPrice: 2400, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  rome: { label: "Roma", fromPrice: 2800, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  skopje: { label: "Üsküp", fromPrice: 900, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  belgrade: { label: "Belgrad", fromPrice: 1400, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  pristine: { label: "Priştine", fromPrice: 1100, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  budapest: { label: "Budapeşte", fromPrice: 2200, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  prague: { label: "Prag", fromPrice: 2600, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
  abudhabi: { label: "Abu Dabi", fromPrice: 2200, currency: "TL", note: "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın." },
};

export function formatFromPrice(slug: string): string {
  const p = routePrices[slug];
  if (!p) return "";
  return `${p.fromPrice.toLocaleString("tr-TR")} ${p.currency}+`;
}

export const PRICE_NOTE = "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın.";
