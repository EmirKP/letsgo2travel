import { flightDeals } from "./sample-data";

export interface RoutePrice {
  label: string;
  fromPrice: number;
  currency: string;
  note: string;
}

const PRICE_NOTE = "Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın.";

const dealByCode = new Map(flightDeals.map((deal) => [deal.destination_code, deal]));

function dealPrice(code: string, fallback: number) {
  const deal = dealByCode.get(code);
  return deal?.price ?? fallback;
}

// Ana fırsatlarda kullanılan rotalar sample-data.ts ile aynı fiyat kaynağına bağlıdır.
export const routePrices: Record<string, RoutePrice> = {
  baku: { label: "Bakü", fromPrice: dealPrice("GYD", 2990), currency: "TL", note: PRICE_NOTE },
  tbilisi: { label: "Tiflis", fromPrice: dealPrice("TBS", 2690), currency: "TL", note: PRICE_NOTE },
  sarajevo: { label: "Saraybosna", fromPrice: dealPrice("SJJ", 3290), currency: "TL", note: PRICE_NOTE },
  dubai: { label: "Dubai", fromPrice: dealPrice("DXB", 5490), currency: "TL", note: PRICE_NOTE },
  rome: { label: "Roma", fromPrice: dealPrice("FCO", 3790), currency: "TL", note: PRICE_NOTE },
  skopje: { label: "Üsküp", fromPrice: 2890, currency: "TL", note: PRICE_NOTE },
  belgrade: { label: "Belgrad", fromPrice: 3190, currency: "TL", note: PRICE_NOTE },
  pristine: { label: "Priştine", fromPrice: 2990, currency: "TL", note: PRICE_NOTE },
  budapest: { label: "Budapeşte", fromPrice: 3890, currency: "TL", note: PRICE_NOTE },
  prague: { label: "Prag", fromPrice: 4290, currency: "TL", note: PRICE_NOTE },
  abudhabi: { label: "Abu Dabi", fromPrice: 4990, currency: "TL", note: PRICE_NOTE },
};

export function formatFromPrice(slug: string): string {
  const price = routePrices[slug];
  if (!price) return "";
  return `${price.fromPrice.toLocaleString("tr-TR")} ${price.currency}+`;
}

export { PRICE_NOTE };
