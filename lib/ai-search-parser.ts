const knownDestinations: Record<string, { destination: string; code: string; visa: string }> = {
  dubai: { destination: "Dubai", code: "DXB", visa: "e-vize" },
  baku: { destination: "Bakü", code: "GYD", visa: "kimlikle" },
  roma: { destination: "Roma", code: "FCO", visa: "schengen" },
  paris: { destination: "Paris", code: "CDG", visa: "schengen" },
  saraybosna: { destination: "Saraybosna", code: "SJJ", visa: "vizesiz" },
  belgrad: { destination: "Belgrad", code: "BEG", visa: "vizesiz" },
  tiran: { destination: "Tiran", code: "TIA", visa: "vizesiz" },
  tivat: { destination: "Tivat", code: "TIV", visa: "vizesiz" },
};

export type SearchIntent = {
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  budget?: number;
  visaPreference?: string;
  month?: string;
  raw: string;
};

export function parseTravelSearch(text: string): SearchIntent {
  const normalized = text.toLocaleLowerCase("tr-TR");
  const destinationKey = Object.keys(knownDestinations).find((key) => normalized.includes(key));
  const priceMatch = normalized.match(/(\d{3,6})\s*(tl|try|₺)?/i);
  const months = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
  const month = months.find((item) => normalized.includes(item));
  const destination = destinationKey ? knownDestinations[destinationKey] : knownDestinations.dubai;

  return {
    origin: normalized.includes("sabiha") || normalized.includes("saw") ? "Sabiha Gökçen" : "İstanbul",
    originCode: normalized.includes("sabiha") || normalized.includes("saw") ? "SAW" : "IST",
    destination: destination.destination,
    destinationCode: destination.code,
    budget: priceMatch ? Number(priceMatch[1]) : undefined,
    visaPreference: normalized.includes("vizesiz") ? "vizesiz" : destination.visa,
    month,
    raw: text,
  };
}

export function createSearchAnswer(intent: SearchIntent) {
  const budgetText = intent.budget ? `${intent.budget.toLocaleString("tr-TR")} TL bütçeye göre` : "Esnek bütçeyle";
  const visaText = intent.visaPreference ? `, vize durumu: ${intent.visaPreference}` : "";
  const monthText = intent.month ? `, dönem: ${intent.month}` : "";
  return `${budgetText} ${intent.origin} çıkışlı ${intent.destination} rotası için arama hazırladım${visaText}${monthText}. Fiyatlar değişebileceği için son adımda affiliate arama sayfasında canlı kontrol yapmalısın.`;
}
