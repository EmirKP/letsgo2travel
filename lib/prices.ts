import { flightDeals } from "./sample-data";
import type { FlightDeal } from "./types";

export interface RoutePrice {
  label: string;
  destinationCode: string;
  fromPrice: number;
  currency: string;
  note: string;
}

const PRICE_NOTE = "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın.";

const fallbackDealByCode = new Map(flightDeals.map((deal) => [deal.destination_code, deal]));

function fallbackPrice(code: string, amount: number) {
  return fallbackDealByCode.get(code)?.price ?? amount;
}

// Fallback değerleri yalnızca canlı fırsat verisi bulunmayan sayfalarda kullanılır.
// Bir sayfa kendi fırsat listesini gönderirse, o listede olmayan rota için sahte fiyat
// üretmek yerine "Fiyatları gör" metni gösterilir.
export const routePrices: Record<string, RoutePrice> = {
  baku: { label: "Bakü", destinationCode: "GYD", fromPrice: fallbackPrice("GYD", 2990), currency: "TRY", note: PRICE_NOTE },
  tbilisi: { label: "Tiflis", destinationCode: "TBS", fromPrice: fallbackPrice("TBS", 2690), currency: "TRY", note: PRICE_NOTE },
  sarajevo: { label: "Saraybosna", destinationCode: "SJJ", fromPrice: fallbackPrice("SJJ", 3290), currency: "TRY", note: PRICE_NOTE },
  dubai: { label: "Dubai", destinationCode: "DXB", fromPrice: fallbackPrice("DXB", 5490), currency: "TRY", note: PRICE_NOTE },
  rome: { label: "Roma", destinationCode: "FCO", fromPrice: fallbackPrice("FCO", 3790), currency: "TRY", note: PRICE_NOTE },
  skopje: { label: "Üsküp", destinationCode: "SKP", fromPrice: 2890, currency: "TRY", note: PRICE_NOTE },
  belgrade: { label: "Belgrad", destinationCode: "BEG", fromPrice: 3190, currency: "TRY", note: PRICE_NOTE },
  pristine: { label: "Priştine", destinationCode: "PRN", fromPrice: 2990, currency: "TRY", note: PRICE_NOTE },
  budapest: { label: "Budapeşte", destinationCode: "BUD", fromPrice: 3890, currency: "TRY", note: PRICE_NOTE },
  prague: { label: "Prag", destinationCode: "PRG", fromPrice: 4290, currency: "TRY", note: PRICE_NOTE },
  abudhabi: { label: "Abu Dabi", destinationCode: "AUH", fromPrice: 4990, currency: "TRY", note: PRICE_NOTE },
};

export function getRoutePrice(slug: string, deals?: FlightDeal[]): RoutePrice | null {
  const route = routePrices[slug];
  if (!route) return null;

  const sourceDeals = deals ?? flightDeals;
  const deal = sourceDeals.find(
    (item) =>
      item.destination_code === route.destinationCode &&
      item.active !== false &&
      Number.isFinite(Number(item.price)) &&
      Number(item.price) > 0,
  );

  // Canlı/merkezî fırsat listesi özellikle gönderildiyse, listede olmayan rota için
  // eski veya tahmini bir fiyat göstermeyiz.
  if (!deal && deals) return null;

  return {
    ...route,
    fromPrice: deal?.price ?? route.fromPrice,
    currency: deal?.currency ?? route.currency,
  };
}

export function formatFromPrice(slug: string, deals?: FlightDeal[]): string {
  const price = getRoutePrice(slug, deals);
  if (!price) return "Fiyatları gör";

  const currency = price.currency === "TRY" ? "TL" : price.currency;
  return `${price.fromPrice.toLocaleString("tr-TR")} ${currency}+`;
}

export { PRICE_NOTE };
