import type { RouteSuggestion } from "../types";
import { routeByDestinationCode } from "./routes";

type Locale = "tr" | "en";
type DestinationDraft = {
  code: string;
  country: [string, string];
  name: [string, string];
  why: [string, string];
  days: number;
  bestFor: [string, string];
  dailyPlan: [string[], string[]];
  visaSourceUrl: string;
};

// Editorial starting points, not live availability, personalised rankings or
// entry eligibility. Locations checked against the official tourism pages:
// https://www.visitgreece.gr/en/islands/cyclades/santorini
// https://goturkiye.com/cappadocia
// https://www.indonesia.travel/gb/en/destination/bali-nusa-tenggara/bali
const DRAFTS: DestinationDraft[] = [
  {
    code: "JTR", name: ["Santorini", "Santorini"], country: ["Yunanistan", "Greece"], days: 3,
    why: ["Kaldera manzarası, ada yerleşimleri ve sahil molaları etrafında şekillendirebileceğin bir başlangıç rotası.", "A starting route to shape around caldera views, island villages and time by the coast."],
    bestFor: ["Ada keşfi, manzara ve fotoğraf", "Island exploring, scenery and photography"],
    dailyPlan: [
      ["1. Gün: Fira çevresini keşfet; kaldera manzaralı bir yürüyüşe zaman ayır.", "2. Gün: Oia sokakları ve köy çevresinde sakin bir keşif planla.", "3. Gün: Hava ve ulaşım koşullarına göre bir sahil molası; dönüş için esnek zaman bırak."],
      ["Day 1: Explore Fira and allow time for a walk with caldera views.", "Day 2: Plan a relaxed visit to Oia's streets and surroundings.", "Day 3: Choose a coastal stop according to weather and transport; leave flexible time for your return."],
    ],
    visaSourceUrl: "https://www.mfa.gr/en/service-category/visas/",
  },
  {
    code: "NAV", name: ["Kapadokya", "Cappadocia"], country: ["Türkiye", "Türkiye"], days: 3,
    why: ["Göreme çevresinden başlayıp vadiler ve yerleşimler arasında kendi tempona göre düzenleyebileceğin bir rota.", "A route starting around Göreme that you can adapt to your pace across valleys and nearby towns."],
    bestFor: ["Doğa, yerel kültür ve fotoğraf", "Nature, local culture and photography"],
    dailyPlan: [
      ["1. Gün: Göreme çevresi ve açık hava müzesi için bir keşif günü ayır.", "2. Gün: Uçhisar ve seçtiğin bir vadide, koşullara uygun kısa bir yürüyüş planla.", "3. Gün: Avanos çevresini keşfet; dönüş transferini programına ekle."],
      ["Day 1: Allow a day for Göreme and its open-air museum.", "Day 2: Visit Uçhisar and choose a short valley walk suited to the conditions.", "Day 3: Explore Avanos and include time for your return transfer."],
    ],
    visaSourceUrl: "https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa",
  },
  {
    code: "DPS", name: ["Bali", "Bali"], country: ["Endonezya", "Indonesia"], days: 5,
    why: ["Ubud çevresi ve Sanur kıyısını ayrı günlere dağıtarak kişiselleştirebileceğin bir ada rotası.", "An island route you can personalise by giving the Ubud area and Sanur coast their own days."],
    bestFor: ["Ada yaşamı, kültür ve sahil", "Island life, culture and the coast"],
    dailyPlan: [
      ["1. Gün: Konaklamaya yerleş; transfer ve dinlenmeye zaman ayır.", "2. Gün: Ubud merkezini ve ilgini çeken kültür duraklarını keşfet.", "3. Gün: Ubud çevresindeki manzara ve yerleşimler için esnek bir gün planla.", "4. Gün: Sanur sahilinde kendi tempona göre zaman geçir.", "5. Gün: Serbest keşif ve dönüş; havaalanı transferine geniş zaman bırak."],
      ["Day 1: Settle in and allow time for your transfer and rest.", "Day 2: Explore central Ubud and cultural stops that interest you.", "Day 3: Keep a flexible day for scenery and villages around Ubud.", "Day 4: Spend time on the Sanur coast at your own pace.", "Day 5: Free time and departure; leave plenty of time for the airport transfer."],
    ],
    visaSourceUrl: "https://evisa.imigrasi.go.id/",
  },
];

// Search-chip starting routes. Landmark locations checked against the official
// tourist offices; no opening hours, admission prices or entry eligibility implied.
// https://parisjetaime.com/eng/discover-paris/paris-in-1-2-or-3-days-i126
// https://business.nyctourism.com/press-media/press-releases/nyc-company-invites-visitors-to-see-manhattan-like-a-new-yorker
const SEARCH_DRAFTS: DestinationDraft[] = [
  {
    code: "CDG", name: ["Paris", "Paris"], country: ["Fransa", "France"], days: 3,
    why: ["Seine kıyısı, müze çevresi ve Montmartre'ı ayrı günlere ayırarak düzenleyebileceğin bir şehir rotası.", "A city route you can adapt with separate days for the Seine, the museum district and Montmartre."],
    bestFor: ["Şehir yürüyüşleri, sanat ve mimari", "City walks, art and architecture"],
    dailyPlan: [
      ["1. Gün: Eyfel Kulesi çevresi ve Seine kıyısında kendi tempona göre bir yürüyüş planla.", "2. Gün: Louvre çevresine zaman ayır; müzeyi ziyaret edeceksen rezervasyon ve ziyaret koşullarını kontrol et.", "3. Gün: Montmartre sokaklarını keşfet; dönüş transferi için esnek zaman bırak."],
      ["Day 1: Plan a walk around the Eiffel Tower and along the Seine at your own pace.", "Day 2: Allow time for the Louvre area; check reservations and visitor requirements if entering the museum.", "Day 3: Explore the streets of Montmartre and leave flexible time for your return transfer."],
    ],
    visaSourceUrl: "https://france-visas.gouv.fr/en/",
  },
  {
    code: "JFK", name: ["New York", "New York"], country: ["Amerika Birleşik Devletleri", "United States"], days: 3,
    why: ["Midtown, Central Park ve Brooklyn Köprüsü çevresini kendi ilgi alanlarına göre birleştirebileceğin bir başlangıç planı.", "A starting plan to adapt around Midtown, Central Park and the Brooklyn Bridge area."],
    bestFor: ["Şehir keşfi, parklar ve mimari", "City exploring, parks and architecture"],
    dailyPlan: [
      ["1. Gün: Midtown çevresini ve Grand Central Terminal'i keşfet; ulaşım ve dinlenmeye zaman ayır.", "2. Gün: Central Park'ta koşullara uygun bir yürüyüş planla; kalan zamanı ilgini çeken bir mahalleye ayır.", "3. Gün: Lower Manhattan ve Brooklyn Köprüsü çevresini keşfet; dönüş transferine geniş zaman bırak."],
      ["Day 1: Explore Midtown and Grand Central Terminal; allow time for transport and rest.", "Day 2: Plan a walk in Central Park suited to the conditions, then explore a neighbourhood that interests you.", "Day 3: Explore Lower Manhattan and the Brooklyn Bridge area; leave plenty of time for your return transfer."],
    ],
    visaSourceUrl: "https://travel.state.gov/content/travel/en/us-visas/tourism-visit.html",
  },
];

function entryFields(locale: Locale, visaSourceUrl: string, domestic = false) {
  return {
    visaStatus: locale === "en" ? "Check entry rules" : "Giriş koşullarını kontrol et",
    verifiedEntryStatus: "unknown" as const,
    visaVerifiedAt: null,
    visaSourceUrl,
    visaNote: domestic
      ? locale === "en" ? "For travel within Türkiye, check your carrier's identity requirements. If arriving from abroad, confirm entry rules for your passport with the official source."
        : "Türkiye içi yolculukta taşıyıcının kimlik koşullarını kontrol et. Yurt dışından geliyorsan pasaportuna uygun giriş koşullarını resmî kaynaktan doğrula."
      : locale === "en" ? "Confirm entry requirements for your passport, nationality and travel dates with the official source before booking."
        : "Rezervasyon öncesinde pasaportuna, uyruğuna ve seyahat tarihine uygun giriş koşullarını resmî kaynaktan doğrula.",
  };
}

function draftMetadata(locale: Locale) {
  return {
    estimatedBudget: locale === "en" ? "Depends on dates and preferences" : "Tarihe ve tercihlere bağlı",
    scores: { budget: 0, visaEase: 0, firstTime: 0, transport: 0, overall: 0 },
    warnings: [locale === "en" ? "Starting itinerary: check opening times and transport for your travel dates." : "Başlangıç planı: ziyaret ve ulaşım saatlerini seyahat tarihin için kontrol et."],
  };
}

function buildDraft(draft: DestinationDraft, locale: Locale): RouteSuggestion {
  const index = locale === "en" ? 1 : 0;
  return {
    name: draft.name[index], country: draft.country[index], cityOrRegion: draft.name[index], destinationCode: draft.code,
    why: draft.why[index], ...entryFields(locale, draft.visaSourceUrl, draft.code === "NAV"),
    ...draftMetadata(locale), idealDuration: `${draft.days} ${locale === "en" ? "days" : "gün"}`,
    bestFor: draft.bestFor[index], difficulty: locale === "en" ? "Adapt to your pace" : "Tempona göre düzenle", firstTimeFriendly: false,
    transportEase: locale === "en" ? "Plan local transfers" : "Yerel transferleri planla",
    safetyNote: locale === "en" ? "Check local guidance and weather before outdoor activities." : "Açık hava etkinlikleri öncesinde yerel yönlendirmeleri ve hava durumunu kontrol et.",
    dailyPlan: [...draft.dailyPlan[index]],
  };
}

/** Stable card order and correct destination identity for onBuildRoute(route).
 * scores=0 denotes unscored editorial drafts; do not display it as a match %.
 * Every call returns independent objects so saved/user-edited plans stay isolated. */
export function homeDestinations(locale: Locale = "tr"): RouteSuggestion[] {
  const routes = DRAFTS.map(draft => buildDraft(draft, locale));
  const rome = routeByDestinationCode("FCO", locale);
  if (rome) routes.push({ ...rome, ...entryFields(locale, "https://vistoperitalia.esteri.it/"), ...draftMetadata(locale) });
  return routes;
}

/** Additional search destinations do not alter the four featured Home cards. */
export function homeSearchDestinations(locale: Locale = "tr"): RouteSuggestion[] {
  return [...homeDestinations(locale), ...SEARCH_DRAFTS.map(draft => buildDraft(draft, locale))];
}
