import { aviasalesUrl, siteSettings, trackedAffiliateUrl } from "./affiliate";

export type AiTripDay = {
  day: string;
  title: string;
  text: string;
};

export type AiTripPlan = {
  title: string;
  summary: string;
  destination: string;
  destinationCode: string;
  originCode: string;
  score: number;
  visaStatus: string;
  estimatedBudget: string;
  budgetText: string;
  travelStyle: string;
  bestFor: string;
  days: string;
  tags: string[];
  itinerary: AiTripDay[];
  essentials: string[];
  smartTips: string[];
  warnings: string[];
  affiliateLinks: {
    flights: string;
    hotels: string;
    esim: string;
    tours: string;
  };
};

type DestinationProfile = {
  name: string;
  code: string;
  visa: string;
  avgBudget: number;
  flightTime: string;
  bestFor: string;
  mood: string[];
  highlights: string[];
  days: AiTripDay[];
};

const destinations: DestinationProfile[] = [
  {
    name: "Bakü",
    code: "GYD",
    visa: "Kimlikle giriş",
    avgBudget: 9500,
    flightTime: "2 saat 45 dakika",
    bestFor: "İlk yurt dışı, şehir turu, kısa tatil",
    mood: ["kimlik", "vizesiz", "ilk", "ekonomik", "kafkas", "bakü", "azerbaycan"],
    highlights: ["İçerişehir ve sahil yürüyüşü", "Ateşgah / Yanardağ günü", "Uygun şehir içi ulaşım"],
    days: [
      { day: "1. Gün", title: "Şehre hızlı alış", text: "Varıştan sonra sahil hattı, İçerişehir ve Nizami Caddesi ile yorulmadan başlangıç." },
      { day: "2. Gün", title: "Kültür + manzara", text: "Ateşgah, Yanardağ ve Haydar Aliyev Merkezi çevresiyle fotoğraf ağırlıklı rota." },
      { day: "3. Gün", title: "Kısa alışveriş ve dönüş", text: "Kahvaltı, son şehir yürüyüşü ve havalimanına rahat transfer." },
    ],
  },
  {
    name: "Saraybosna",
    code: "SJJ",
    visa: "Vizesiz",
    avgBudget: 11000,
    flightTime: "2 saat",
    bestFor: "Balkan kültürü, uygun yemek, hafta sonu kaçamağı",
    mood: ["vizesiz", "balkan", "hafta sonu", "uygun", "saraybosna", "bosna"],
    highlights: ["Başçarşı ve tarihi merkez", "Mostar günübirlik rota", "Uygun restoran ve kahve kültürü"],
    days: [
      { day: "1. Gün", title: "Başçarşı başlangıcı", text: "Sebil, Gazi Hüsrev Bey Camii, Latin Köprüsü ve yerel lezzetlerle merkez turu." },
      { day: "2. Gün", title: "Mostar veya doğa", text: "Günlük Mostar turu ya da Vrelo Bosne ile sakin doğa planı." },
      { day: "3. Gün", title: "Kahve + dönüş", text: "Son alışveriş, Boşnak kahvesi ve dönüş uçuşu için esnek zaman." },
    ],
  },
  {
    name: "Tiflis",
    code: "TBS",
    visa: "Kimlikle giriş",
    avgBudget: 9000,
    flightTime: "2 saat 15 dakika",
    bestFor: "Ekonomik şehir gezisi, gastronomi, ilk yurt dışı",
    mood: ["kimlik", "uygun", "ekonomik", "tiflis", "gürcistan", "gurcistan"],
    highlights: ["Eski Tiflis ve teleferik", "Kükürt hamamları", "Uygun yeme içme"],
    days: [
      { day: "1. Gün", title: "Eski Tiflis", text: "Özgürlük Meydanı, eski şehir ve Narikala manzarasıyla kolay başlangıç." },
      { day: "2. Gün", title: "Gastronomi günü", text: "Yerel restoranlar, kafe rotaları ve akşam Rustaveli çevresi." },
      { day: "3. Gün", title: "Sakin kapanış", text: "Pazar, hediyelik alışveriş ve havalimanına dönüş." },
    ],
  },
  {
    name: "Tiran",
    code: "TIA",
    visa: "Vizesiz",
    avgBudget: 12500,
    flightTime: "1 saat 45 dakika",
    bestFor: "Yaz tatili, sahil bağlantısı, Balkan keşfi",
    mood: ["vizesiz", "yaz", "deniz", "sahil", "arnavutluk", "tiran", "ksamil"],
    highlights: ["Tiran merkez", "Ksamil / Saranda bağlantısı", "Araç kiralama ile sahil planı"],
    days: [
      { day: "1. Gün", title: "Tiran merkez", text: "Skanderbeg Meydanı, Blloku ve şehir merkezinde hafif keşif." },
      { day: "2. Gün", title: "Sahil bağlantısı", text: "Süre uygunsa Ksamil/Saranda yönüne transfer veya günlük yakın rota." },
      { day: "3. Gün", title: "Esnek dönüş", text: "Uçuş saatine göre merkezde kahve ve dönüş hazırlığı." },
    ],
  },
  {
    name: "Roma",
    code: "FCO",
    visa: "Schengen gerekir",
    avgBudget: 18000,
    flightTime: "2 saat 40 dakika",
    bestFor: "Kültür, müze, romantik şehir tatili",
    mood: ["roma", "italya", "schengen", "müze", "kültür", "avrupa"],
    highlights: ["Kolezyum ve tarihi merkez", "Vatikan bölgesi", "Yeme içme rotaları"],
    days: [
      { day: "1. Gün", title: "Klasik Roma", text: "Kolezyum, Forum çevresi ve Trevi rotasıyla güçlü başlangıç." },
      { day: "2. Gün", title: "Vatikan + meydanlar", text: "Vatikan, Castel Sant’Angelo ve akşam Trastevere planı." },
      { day: "3. Gün", title: "Kafe ve dönüş", text: "Piazza Navona, Pantheon çevresi ve dönüş uçuşuna göre serbest zaman." },
    ],
  },
];

function normalize(text: string) {
  return text.toLocaleLowerCase("tr-TR").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

function parseBudget(text: string) {
  const normalized = normalize(text);
  const binMatch = normalized.match(/(\d{1,3})\s*bin/);
  if (binMatch) return Number(binMatch[1]) * 1000;
  const priceMatch = normalized.match(/(\d{3,6})\s*(tl|try|₺)?/i);
  return priceMatch ? Number(priceMatch[1]) : undefined;
}

function parseOrigin(text: string) {
  const normalized = normalize(text);
  if (normalized.includes("sabiha") || normalized.includes("saw")) return "SAW";
  if (normalized.includes("ankara") || normalized.includes("esenboğa") || normalized.includes("esb")) return "ESB";
  if (normalized.includes("izmir") || normalized.includes("adb")) return "ADB";
  return "IST";
}

function parseStyle(text: string) {
  const normalized = normalize(text);
  if (normalized.includes("deniz") || normalized.includes("yaz") || normalized.includes("sahil")) return "Deniz tatili";
  if (normalized.includes("ucuz") || normalized.includes("uygun") || normalized.includes("ekonomik")) return "Ekonomik keşif";
  if (normalized.includes("romantik") || normalized.includes("lüks") || normalized.includes("premium")) return "Premium şehir tatili";
  if (normalized.includes("ilk") || normalized.includes("kolay")) return "İlk yurt dışı";
  return "Akıllı şehir kaçamağı";
}

function chooseDestination(query: string) {
  const normalized = normalize(query);
  const direct = destinations.find((destination) => destination.mood.some((token) => normalized.includes(token)) || normalized.includes(destination.name.toLocaleLowerCase("tr-TR")));
  if (direct) return direct;

  const budget = parseBudget(query);
  if (normalized.includes("schengen")) return destinations.find((destination) => destination.name === "Roma") ?? destinations[0];
  if (normalized.includes("kimlik")) return destinations.find((destination) => destination.name === "Bakü") ?? destinations[0];
  if (normalized.includes("hafta sonu")) return destinations.find((destination) => destination.name === "Saraybosna") ?? destinations[0];
  if (budget && budget <= 10000) return destinations.find((destination) => destination.name === "Tiflis") ?? destinations[0];
  return destinations[1];
}

export function createTripPlan(query: string): AiTripPlan {
  const destination = chooseDestination(query || "vizesiz uygun rota");
  const budget = parseBudget(query);
  const originCode = parseOrigin(query);
  const style = parseStyle(query);
  const score = Math.max(82, Math.min(98, budget ? 100 - Math.abs(destination.avgBudget - budget) / 900 : 94));

  const budgetText = budget
    ? `${budget.toLocaleString("tr-TR")} TL hedef bütçeye göre önerildi`
    : `${destination.avgBudget.toLocaleString("tr-TR")} TL civarı başlangıç bütçesiyle planlanabilir`;

  return {
    title: `${originCode} çıkışlı ${destination.name} Seyahati`,
    summary: `${destination.name}, uçuş kolaylığı ve uygun fiyatlı seçenekleriyle özellikle ${destination.bestFor} planları için ideal bir rota sunuyor.`,
    destination: destination.name,
    destinationCode: destination.code,
    originCode: originCode,
    score: Math.round(score),
    visaStatus: destination.visa,
    estimatedBudget: `Yaklaşık ${destination.avgBudget} TL (Bilet/Otel hariç)`,
    budgetText: budgetText,
    travelStyle: style,
    bestFor: destination.bestFor,
    days: "3-4 Gün",
    tags: destination.mood,
    itinerary: destination.days,
    essentials: [
      "Uçuş fiyatını hem IST hem SAW alternatifleriyle kontrol et.",
      "Otel seçerken merkez + toplu taşıma dengesine bak.",
      "Varıştan önce eSIM veya roaming planını hazırla.",
      "Dönüş bileti ve konaklama adresini pasaport kontrolü için kolay erişilebilir tut.",
    ],
    smartTips: destination.highlights,
    warnings: ["Fiyatlar tahmini değerlerdir.", "Uçuş fiyatları anlık değişebilir."],
    affiliateLinks: {
      flights: trackedAffiliateUrl({
        provider: "aviasales",
        url: aviasalesUrl({ origin: originCode, destination: destination.code }),
        source: "letsgo2travel_ai",
        sourcePage: "ai_trip_planner",
        destination: destination.code,
        campaign: "ai_plan",
      }),
      hotels: trackedAffiliateUrl({
        provider: "booking",
        url: siteSettings.bookingAffiliateUrl,
        source: "letsgo2travel_ai",
        sourcePage: "ai_trip_planner",
        destination: destination.name,
        campaign: "ai_plan",
      }),
      esim: trackedAffiliateUrl({
        provider: "airalo",
        url: siteSettings.airaloAffiliateUrl,
        source: "letsgo2travel_ai",
        sourcePage: "ai_trip_planner",
        destination: destination.name,
        campaign: "ai_plan",
      }),
      tours: trackedAffiliateUrl({
        provider: "getyourguide",
        url: siteSettings.getYourGuideAffiliateUrl,
        source: "letsgo2travel_ai",
        sourcePage: "ai_trip_planner",
        destination: destination.name,
        campaign: "ai_plan",
      }),
    },
  };
}
