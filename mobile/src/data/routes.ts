import type { PlannerInput, RoutePlan, RouteSuggestion } from "../types";

type CatalogRoute = RouteSuggestion & {
  budgetTier: 1 | 2 | 3;
  tags: string[];
  visaEase: "easy" | "visa";
  months: string[];
};

const ROUTE_CATALOG: CatalogRoute[] = [
  {
    name: "Bakü",
    country: "Azerbaycan",
    cityOrRegion: "Bakü",
    destinationCode: "GYD",
    why: "Kimlikle giriş, kısa uçuş ve yürünebilir merkez sayesinde ilk yurt dışı seyahatinde rahat bir başlangıç sunar.",
    visaStatus: "Kimlikle",
    estimatedBudget: "Ekonomik–orta",
    idealDuration: "3–4 gün",
    bestFor: "İlk kez yurt dışına çıkanlar ve şehir keşfi sevenler",
    difficulty: "Kolay",
    firstTimeFriendly: true,
    transportEase: "Kolay",
    safetyNote: "Merkez bölgelerde standart şehir güvenliği önlemleri yeterlidir.",
    scores: { budget: 9, visaEase: 10, firstTime: 10, transport: 8, overall: 92 },
    dailyPlan: [
      "1. Gün: İçerişehir, Kız Kulesi ve sahil yürüyüşü.",
      "2. Gün: Haydar Aliyev Merkezi, Ateşgah ve Yanardağ.",
      "3. Gün: Nizami Caddesi, yerel mutfak ve serbest zaman.",
    ],
    warnings: ["Kimlikle giriş koşullarını seyahat öncesinde resmî kaynaklardan doğrula."],
    budgetTier: 1,
    tags: ["şehir", "kültür", "yeme-içme", "ilk seyahat"],
    visaEase: "easy",
    months: ["Mart", "Nisan", "Mayıs", "Eylül", "Ekim", "Kasım"],
  },
  {
    name: "Tiflis",
    country: "Gürcistan",
    cityOrRegion: "Tiflis",
    destinationCode: "TBS",
    why: "Kimlikle giriş, güçlü mutfak kültürü ve uygun şehir içi maliyetleriyle kısa kaçamaklar için dengeli bir seçenektir.",
    visaStatus: "Kimlikle",
    estimatedBudget: "Ekonomik",
    idealDuration: "3–5 gün",
    bestFor: "Yeme-içme, kültür ve ekonomik seyahat",
    difficulty: "Kolay",
    firstTimeFriendly: true,
    transportEase: "Kolay",
    safetyNote: "Turistik merkezlerde gece geç saatlerde tenha sokaklarda dikkatli ol.",
    scores: { budget: 10, visaEase: 10, firstTime: 9, transport: 8, overall: 93 },
    dailyPlan: [
      "1. Gün: Eski Tiflis, Barış Köprüsü ve Narikala.",
      "2. Gün: Rustaveli, müzeler ve Gürcü mutfağı.",
      "3. Gün: Mtskheta veya Kazbegi günübirlik turu.",
    ],
    warnings: ["Dağ rotalarında hava hızlı değişebilir; katmanlı giyin."],
    budgetTier: 1,
    tags: ["yeme-içme", "kültür", "doğa", "şehir"],
    visaEase: "easy",
    months: ["Nisan", "Mayıs", "Haziran", "Eylül", "Ekim"],
  },
  {
    name: "Saraybosna",
    country: "Bosna Hersek",
    cityOrRegion: "Saraybosna",
    destinationCode: "SJJ",
    why: "Vizesiz giriş, tanıdık mutfak ve tarih–doğa dengesiyle bütçe dostu bir Balkan rotasıdır.",
    visaStatus: "Vizesiz",
    estimatedBudget: "Ekonomik–orta",
    idealDuration: "4–5 gün",
    bestFor: "Tarih, doğa ve Balkan mutfağı",
    difficulty: "Kolay",
    firstTimeFriendly: true,
    transportEase: "Orta",
    safetyNote: "Şehir merkezi güvenlidir; kırsal alanlarda işaretli rotalardan ayrılma.",
    scores: { budget: 9, visaEase: 10, firstTime: 9, transport: 7, overall: 90 },
    dailyPlan: [
      "1. Gün: Başçarşı, Sebil ve Latin Köprüsü.",
      "2. Gün: Umut Tüneli ve şehir manzarası.",
      "3. Gün: Mostar ve Blagaj günübirlik rota.",
      "4. Gün: Yerel pazar ve sakin kapanış.",
    ],
    warnings: ["Mostar günübirlik rotasında ulaşım saatlerini önceden kontrol et."],
    budgetTier: 1,
    tags: ["tarih", "kültür", "doğa", "yeme-içme"],
    visaEase: "easy",
    months: ["Nisan", "Mayıs", "Haziran", "Eylül", "Ekim"],
  },
  {
    name: "Belgrad",
    country: "Sırbistan",
    cityOrRegion: "Belgrad",
    destinationCode: "BEG",
    why: "Vizesiz giriş, hareketli şehir hayatı ve kolay ulaşım seçenekleriyle arkadaş grupları için güçlü bir rotadır.",
    visaStatus: "Vizesiz",
    estimatedBudget: "Orta",
    idealDuration: "3–4 gün",
    bestFor: "Gece hayatı, şehir gezisi ve arkadaş grupları",
    difficulty: "Kolay",
    firstTimeFriendly: true,
    transportEase: "Kolay",
    safetyNote: "Kalabalık alanlarda kişisel eşyalarını gözetim altında tut.",
    scores: { budget: 8, visaEase: 10, firstTime: 9, transport: 9, overall: 89 },
    dailyPlan: [
      "1. Gün: Kalemegdan ve Knez Mihailova.",
      "2. Gün: Aziz Sava, Zemun ve nehir kıyısı.",
      "3. Gün: Nikola Tesla Müzesi ve yerel restoranlar.",
    ],
    warnings: ["Gece ulaşımında lisanslı taksi veya uygulama kullan."],
    budgetTier: 2,
    tags: ["şehir", "gece hayatı", "kültür", "yeme-içme"],
    visaEase: "easy",
    months: ["Nisan", "Mayıs", "Haziran", "Eylül", "Ekim"],
  },
  {
    name: "Tiran & Ksamil",
    country: "Arnavutluk",
    cityOrRegion: "Tiran",
    destinationCode: "TIA",
    why: "Vizesiz giriş ve uygun sahil seçenekleriyle yaz tatilini şehir keşfiyle birleştirmek isteyenlere uygundur.",
    visaStatus: "Vizesiz",
    estimatedBudget: "Ekonomik–orta",
    idealDuration: "5–7 gün",
    bestFor: "Deniz, doğa ve ekonomik yaz tatili",
    difficulty: "Orta",
    firstTimeFriendly: true,
    transportEase: "Orta",
    safetyNote: "Sahil rotalarında transferleri önceden ayarla ve resmî taksi kullan.",
    scores: { budget: 9, visaEase: 10, firstTime: 8, transport: 6, overall: 86 },
    dailyPlan: [
      "1. Gün: Tiran merkez ve Bunk'Art.",
      "2. Gün: Berat veya Gjirokastër.",
      "3–5. Gün: Saranda ve Ksamil sahilleri.",
    ],
    warnings: ["Yaz sezonunda sahil konaklamaları hızlı dolar; erken rezervasyon yap."],
    budgetTier: 1,
    tags: ["deniz", "doğa", "şehir", "fotoğraf"],
    visaEase: "easy",
    months: ["Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül"],
  },
  {
    name: "Roma",
    country: "İtalya",
    cityOrRegion: "Roma",
    destinationCode: "FCO",
    why: "Sanat, tarih ve gastronomiyi yoğun bir şehir programında birleştirmek isteyenler için klasik fakat güçlü bir tercihtir.",
    visaStatus: "Schengen vizesi",
    estimatedBudget: "Orta–yüksek",
    idealDuration: "4–5 gün",
    bestFor: "Tarih, sanat ve gastronomi",
    difficulty: "Orta",
    firstTimeFriendly: true,
    transportEase: "Kolay",
    safetyNote: "Turistik alanlarda yankesiciliğe karşı dikkatli ol.",
    scores: { budget: 5, visaEase: 4, firstTime: 8, transport: 9, overall: 77 },
    dailyPlan: [
      "1. Gün: Kolezyum, Roma Forumu ve Monti.",
      "2. Gün: Vatikan, Castel Sant'Angelo ve Prati.",
      "3. Gün: Trevi, Pantheon, Navona ve Trastevere.",
      "4. Gün: Villa Borghese ve serbest keşif.",
    ],
    warnings: ["Schengen başvurusu ve yoğun sezon rezervasyonları için erken plan yap."],
    budgetTier: 3,
    tags: ["tarih", "sanat", "yeme-içme", "şehir"],
    visaEase: "visa",
    months: ["Mart", "Nisan", "Mayıs", "Eylül", "Ekim", "Kasım"],
  },
  {
    name: "Dubai",
    country: "Birleşik Arap Emirlikleri",
    cityOrRegion: "Dubai",
    destinationCode: "DXB",
    why: "Modern şehir deneyimi, alışveriş ve kontrollü ulaşım altyapısıyla konfor odaklı seyahat isteyenlere uygundur.",
    visaStatus: "Vize/e-Vize koşulu",
    estimatedBudget: "Yüksek",
    idealDuration: "4–6 gün",
    bestFor: "Konfor, alışveriş ve modern şehir deneyimi",
    difficulty: "Kolay",
    firstTimeFriendly: true,
    transportEase: "Kolay",
    safetyNote: "Yerel kurallara ve kamusal alan davranışlarına dikkat et.",
    scores: { budget: 4, visaEase: 6, firstTime: 9, transport: 9, overall: 76 },
    dailyPlan: [
      "1. Gün: Downtown, Dubai Mall ve Burj Khalifa çevresi.",
      "2. Gün: Marina, JBR ve Palm Jumeirah.",
      "3. Gün: Eski Dubai, Deira ve çöl safarisi.",
      "4. Gün: Müze, plaj veya Abu Dhabi günübirlik rota.",
    ],
    warnings: ["Yaz aylarında gündüz sıcaklıkları çok yüksek olabilir."],
    budgetTier: 3,
    tags: ["alışveriş", "şehir", "lüks", "deniz"],
    visaEase: "visa",
    months: ["Kasım", "Aralık", "Ocak", "Şubat", "Mart"],
  },
  {
    name: "Bangkok",
    country: "Tayland",
    cityOrRegion: "Bangkok",
    destinationCode: "BKK",
    why: "Uzak rota deneyimi, sokak lezzetleri ve şehir–ada kombinasyonu arayanlar için yüksek çeşitlilik sunar.",
    visaStatus: "Güncel muafiyet koşullarını kontrol et",
    estimatedBudget: "Orta",
    idealDuration: "7–10 gün",
    bestFor: "Uzak rota, yeme-içme ve kültür",
    difficulty: "Orta",
    firstTimeFriendly: false,
    transportEase: "Orta",
    safetyNote: "Taksi ve tur rezervasyonlarında resmî uygulama/acenteleri tercih et.",
    scores: { budget: 8, visaEase: 7, firstTime: 6, transport: 7, overall: 80 },
    dailyPlan: [
      "1–2. Gün: Bangkok tapınakları, nehir ve gece pazarları.",
      "3. Gün: Ayutthaya günübirlik gezi.",
      "4–7. Gün: Phuket, Krabi veya Koh Samui sahil uzatması.",
    ],
    warnings: ["Yağış sezonu ve iç hat bagaj kurallarını kontrol et."],
    budgetTier: 2,
    tags: ["yeme-içme", "kültür", "deniz", "macera"],
    visaEase: "easy",
    months: ["Kasım", "Aralık", "Ocak", "Şubat", "Mart"],
  },
];

// The catalogue remains Turkish at rest so existing saved plans and matching
// rules stay backwards compatible. English presentation copies are applied at
// the boundary; user-created content is never translated or rewritten.
const ROUTE_EN: Record<string, Partial<RouteSuggestion>> = {
  GYD: {
    name: "Baku", country: "Azerbaijan", cityOrRegion: "Baku",
    why: "ID-card entry, a short flight and a walkable centre make this a comfortable first international trip.",
    visaStatus: "Entry with Turkish ID card", estimatedBudget: "Economy–mid-range", idealDuration: "3–4 days",
    bestFor: "First-time international travellers and city explorers", difficulty: "Easy", transportEase: "Easy",
    safetyNote: "Standard city precautions are generally appropriate in central areas.",
    dailyPlan: ["Day 1: Old City, Maiden Tower and the waterfront.", "Day 2: Heydar Aliyev Centre, Ateshgah and Yanar Dag.", "Day 3: Nizami Street, local food and free time."],
    warnings: ["Confirm current Turkish ID-card entry rules with official sources before travel."],
  },
  TBS: {
    name: "Tbilisi", country: "Georgia", cityOrRegion: "Tbilisi",
    why: "ID-card entry, a strong food culture and affordable local costs make it a balanced short break.",
    visaStatus: "Entry with Turkish ID card", estimatedBudget: "Economy", idealDuration: "3–5 days",
    bestFor: "Food, culture and affordable travel", difficulty: "Easy", transportEase: "Easy",
    safetyNote: "Use normal city precautions and take extra care in quiet streets late at night.",
    dailyPlan: ["Day 1: Old Tbilisi, Bridge of Peace and Narikala.", "Day 2: Rustaveli, museums and Georgian food.", "Day 3: Day trip to Mtskheta or Kazbegi."],
    warnings: ["Mountain weather can change quickly; pack layers."],
  },
  SJJ: {
    name: "Sarajevo", country: "Bosnia and Herzegovina", cityOrRegion: "Sarajevo",
    why: "Visa-free entry and a good balance of history, nature and familiar food make this an affordable Balkan route.",
    visaStatus: "Visa-free", estimatedBudget: "Economy–mid-range", idealDuration: "4–5 days",
    bestFor: "History, nature and Balkan food", difficulty: "Easy", transportEase: "Moderate",
    safetyNote: "The centre is generally easy to explore; stay on marked paths in rural areas.",
    dailyPlan: ["Day 1: Baščaršija, Sebilj and Latin Bridge.", "Day 2: Tunnel of Hope and city viewpoints.", "Day 3: Day trip to Mostar and Blagaj.", "Day 4: Local market and a relaxed finish."],
    warnings: ["Check transport times in advance for a Mostar day trip."],
  },
  BEG: {
    name: "Belgrade", country: "Serbia", cityOrRegion: "Belgrade",
    why: "Visa-free entry, lively city life and straightforward transport make it a strong choice for groups of friends.",
    visaStatus: "Visa-free", estimatedBudget: "Mid-range", idealDuration: "3–4 days",
    bestFor: "Nightlife, city breaks and groups of friends", difficulty: "Easy", transportEase: "Easy",
    safetyNote: "Keep an eye on personal belongings in crowded places.",
    dailyPlan: ["Day 1: Kalemegdan and Knez Mihailova.", "Day 2: Saint Sava, Zemun and the riverfront.", "Day 3: Nikola Tesla Museum and local restaurants."],
    warnings: ["Use licensed taxis or trusted apps for late-night transport."],
  },
  TIA: {
    name: "Tirana & Ksamil", country: "Albania", cityOrRegion: "Tirana",
    why: "Visa-free entry and affordable coastal options suit travellers who want to combine a summer break with city discovery.",
    visaStatus: "Visa-free", estimatedBudget: "Economy–mid-range", idealDuration: "5–7 days",
    bestFor: "Coast, nature and an affordable summer trip", difficulty: "Moderate", transportEase: "Moderate",
    safetyNote: "Arrange coastal transfers ahead and use licensed transport.",
    dailyPlan: ["Day 1: Central Tirana and Bunk'Art.", "Day 2: Berat or Gjirokastër.", "Days 3–5: Sarandë and the beaches of Ksamil."],
    warnings: ["Coastal accommodation fills quickly in summer; book early."],
  },
  FCO: {
    name: "Rome", country: "Italy", cityOrRegion: "Rome",
    why: "A classic but rewarding choice for travellers who want art, history and food in an energetic city itinerary.",
    visaStatus: "Schengen visa required", estimatedBudget: "Mid-range–premium", idealDuration: "4–5 days",
    bestFor: "History, art and food", difficulty: "Moderate", transportEase: "Easy",
    safetyNote: "Be alert to pickpocketing around busy tourist areas.",
    dailyPlan: ["Day 1: Colosseum, Roman Forum and Monti.", "Day 2: Vatican, Castel Sant'Angelo and Prati.", "Day 3: Trevi, Pantheon, Navona and Trastevere.", "Day 4: Villa Borghese and free exploration."],
    warnings: ["Plan Schengen applications and high-season bookings early."],
  },
  DXB: {
    name: "Dubai", country: "United Arab Emirates", cityOrRegion: "Dubai",
    why: "Modern city experiences, shopping and structured transport suit travellers who prioritise comfort.",
    visaStatus: "Check current visa/e-Visa rules", estimatedBudget: "Premium", idealDuration: "4–6 days",
    bestFor: "Comfort, shopping and a modern city break", difficulty: "Easy", transportEase: "Easy",
    safetyNote: "Respect local law and public-behaviour rules.",
    dailyPlan: ["Day 1: Downtown, Dubai Mall and the Burj Khalifa area.", "Day 2: Marina, JBR and Palm Jumeirah.", "Day 3: Old Dubai, Deira and a desert safari.", "Day 4: Museum, beach or an Abu Dhabi day trip."],
    warnings: ["Daytime temperatures can be extremely high in summer."],
  },
  BKK: {
    name: "Bangkok", country: "Thailand", cityOrRegion: "Bangkok",
    why: "A varied long-haul choice for travellers seeking street food, culture and a city-and-island combination.",
    visaStatus: "Check current visa-waiver rules", estimatedBudget: "Mid-range", idealDuration: "7–10 days",
    bestFor: "Long-haul travel, food and culture", difficulty: "Moderate", transportEase: "Moderate",
    safetyNote: "Use official apps or agencies for taxis and tour bookings.",
    dailyPlan: ["Days 1–2: Bangkok temples, river and night markets.", "Day 3: Day trip to Ayutthaya.", "Days 4–7: Add Phuket, Krabi or Koh Samui."],
    warnings: ["Check the rainy season and domestic-flight baggage rules."],
  },
};

function presentRoute(route: RouteSuggestion, locale: "tr" | "en" = "tr"): RouteSuggestion {
  const translated = locale === "en" && route.destinationCode ? ROUTE_EN[route.destinationCode] : undefined;
  const value = translated ? { ...route, ...translated } : route;
  return {
    ...value,
    scores: { ...value.scores },
    dailyPlan: [...value.dailyPlan],
    warnings: [...value.warnings],
    cta: value.cta ? { ...value.cta } : undefined,
  };
}

function budgetTier(value: string): 1 | 2 | 3 {
  const normalized = value.toLocaleLowerCase("tr-TR");
  if (normalized.includes("ekonomik") || normalized.includes("düşük")) return 1;
  if (normalized.includes("yüksek") || normalized.includes("premium")) return 3;
  return 2;
}

function scoreRoute(route: CatalogRoute, input: PlannerInput) {
  let score = route.scores.overall;
  const requestedTier = budgetTier(input.budget);
  score -= Math.abs(route.budgetTier - requestedTier) * 12;

  const visaPreference = input.visa.toLocaleLowerCase("tr-TR");
  if ((visaPreference.includes("vizesiz") || visaPreference.includes("kolay")) && route.visaEase === "easy") {
    score += 15;
  }
  if ((visaPreference.includes("vizesiz") || visaPreference.includes("kolay")) && route.visaEase === "visa") {
    score -= 18;
  }

  for (const vibe of input.vibe) {
    const normalized = vibe.toLocaleLowerCase("tr-TR");
    if (route.tags.some((tag) => normalized.includes(tag) || tag.includes(normalized))) score += 7;
  }

  if (route.months.includes(input.month)) score += 6;
  if (input.who.toLocaleLowerCase("tr-TR").includes("ilk") && route.firstTimeFriendly) score += 8;
  return score;
}

export function createFallbackPlan(input: PlannerInput, locale: "tr" | "en" = "tr"): RoutePlan {
  const routes = [...ROUTE_CATALOG]
    .sort((a, b) => scoreRoute(b, input) - scoreRoute(a, input))
    .slice(0, 3)
    .map(({ budgetTier: _budgetTier, tags: _tags, visaEase: _visaEase, months: _months, ...route }) => presentRoute(route, locale));

  return {
    summary: locale === "en"
      ? "We considered your budget, entry preference and travel style together. Check the latest official entry rules before deciding."
      : "Seçimlerine göre bütçe, giriş kolaylığı ve seyahat tarzını birlikte değerlendirdik. Karar vermeden önce güncel giriş koşullarını kontrol et.",
    routes,
  };
}

export function randomRoute(locale: "tr" | "en" = "tr"): RouteSuggestion {
  const route = ROUTE_CATALOG[Math.floor(Math.random() * ROUTE_CATALOG.length)];
  const { budgetTier: _budgetTier, tags: _tags, visaEase: _visaEase, months: _months, ...suggestion } = route;
  return presentRoute(suggestion, locale);
}

export function randomRouteFor(preferences: {
  budget: "economy" | "balanced" | "premium";
  entry: "easy" | "all";
  pace: "easy" | "balanced" | "adventure";
}, locale: "tr" | "en" = "tr"): RouteSuggestion {
  const budgetMap = { economy: 1, balanced: 2, premium: 3 } as const;
  const candidates = ROUTE_CATALOG.filter((route) => {
    if (preferences.entry === "easy" && route.visaEase !== "easy") return false;
    if (Math.abs(route.budgetTier - budgetMap[preferences.budget]) > 1) return false;
    if (preferences.pace === "easy" && route.difficulty !== "Kolay") return false;
    if (preferences.pace === "adventure" && route.firstTimeFriendly && route.difficulty === "Kolay") return false;
    return true;
  });
  const pool = candidates.length ? candidates : ROUTE_CATALOG;
  const route = pool[Math.floor(Math.random() * pool.length)];
  const { budgetTier: _budgetTier, tags: _tags, visaEase: _visaEase, months: _months, ...suggestion } = route;
  return presentRoute(suggestion, locale);
}

export function routeByDestinationCode(destinationCode: string, locale: "tr" | "en" = "tr"): RouteSuggestion | null {
  const route = ROUTE_CATALOG.find((item) => item.destinationCode === destinationCode.trim().toUpperCase());
  if (!route) return null;
  const { budgetTier: _budgetTier, tags: _tags, visaEase: _visaEase, months: _months, ...suggestion } = route;
  return presentRoute(suggestion, locale);
}
