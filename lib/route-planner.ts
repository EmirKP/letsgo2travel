/** Shared, provider-independent rules for a traveller's fixed destination. */
import { starterPreferenceNote, type PlannerPreferences } from "./planner-preferences";
export type PlanDestination = { code: string; name: string; country: string; countryCode: string };
export type PlanLocale = "tr" | "en" | "sq";
export type FixedPlanInput = PlannerPreferences & { destination?: PlanDestination; origin: string; dayCount?: number; budget: string; vibe: string[]; who: string; tempo: string };

export function validPlanDays(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 14 ? value : null;
}

export function routeMatchesDestination(route: { name?: unknown; cityOrRegion?: unknown; destinationCode?: unknown }, destination: PlanDestination) {
  const clean = (value: unknown) => typeof value === "string" ? value.toLocaleLowerCase("tr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^\p{L}\p{N}]/gu, "") : "";
  // A model cannot make an unrelated city valid simply by echoing an airport code.
  // An explicit city takes precedence over a title that could echo the request.
  const city = typeof route.cityOrRegion === "string" && route.cityOrRegion.trim() ? route.cityOrRegion : route.name;
  const expected = clean(destination.name);
  return Boolean(expected) && clean(city) === expected;
}

export function fixedDestinationStarter(input: FixedPlanInput, locale: PlanLocale = "tr") {
  const destination = input.destination;
  if (!destination) throw new Error("A fixed plan needs a destination");
  const copy = (tr: string, en: string, sq: string) => locale === "tr" ? tr : locale === "sq" ? sq : en;
  const days = validPlanDays(input.dayCount) || 3;
  const interests = input.vibe.join(" ");
  const middle = /Deniz|Doğa/.test(interests)
    ? copy("Yakındaki sahil veya doğa alanlarından birini seç; ulaşımını ve hava durumunu doğrula, dinlenme molası bırak.", "Choose a nearby coast or nature area; check transport and weather, and leave time to rest.", "Zgjidh një bregdet ose zonë natyrore pranë; kontrollo transportin dhe motin dhe lër kohë për pushim.")
    : copy("İlgi alanına uygun bir müze, mahalle veya yerel pazarı seç; açılış saatlerini kontrol ederek yakın durakları birleştir.", "Choose a museum, neighbourhood or local market matching your interests; check opening hours and group nearby stops.", "Zgjidh një muze, lagje ose treg lokal sipas interesave të tua; kontrollo oraret dhe bashko ndalesat e afërta.");
  const dailyPlan = Array.from({ length: days }, (_, index) => {
    const prefix = copy(`${index + 1}. Gün`, `Day ${index + 1}`, `Dita ${index + 1}`);
    const activity = days === 1
      ? copy("Merkezde kısa bir yürüyüş ve yerel yemek molası planla; dönüş ulaşımı için zaman ayır.", "Plan a short central walk and a local meal; leave time for the return journey.", "Planifiko një shëtitje të shkurtër në qendër dhe një vakt lokal; lër kohë për kthimin.")
      : index === 0
        ? copy("Varış, konaklamaya ulaşım ve çevreyi tanıma. İlk gün için kısa bir yürüyüş ve yemek molası bırak.", "Arrive, reach your accommodation and get your bearings. Keep the first day to a short walk and a meal.", "Mbërrit, shko te akomodimi dhe njih zonën. Ditën e parë bëj një shëtitje të shkurtër dhe një pushim për ushqim.")
        : index === days - 1
          ? copy("Son keşifler ve dönüş hazırlığı. Bagaj, çıkış saati ve dönüş ulaşımı için yeterli pay bırak.", "Finish exploring and prepare to return. Allow enough time for luggage, checkout and return transport.", "Përfundo vizitat dhe përgatitu për kthim. Lër kohë për bagazhet, largimin nga hoteli dhe transportin.")
          : middle;
    return `${prefix}: ${destination.name} — ${activity} ${starterPreferenceNote(input, locale)}`;
  });
  const caution = copy("Bu düzenlenebilir bir başlangıç taslağıdır; canlı fiyat, rezervasyon veya doğrulanmış mekân programı içermez. Ayrıntılı plan için bağlantıyla tekrar dene.", "This is an editable starter outline, without live prices, bookings or a verified venue schedule. Retry online for a detailed plan.", "Ky është një plan fillestar i redaktueshëm, pa çmime të drejtpërdrejta, rezervime ose orare të verifikuara. Provo sërish në internet për një plan të detajuar.");
  return {
    summary: copy(`${input.origin} → ${destination.name}: seçtiğin hedef için ${days} günlük başlangıç taslağı.`, `${input.origin} → ${destination.name}: a ${days}-day starter outline for your chosen destination.`, `${input.origin} → ${destination.name}: një plan fillestar ${days}-ditor për destinacionin tënd.`),
    routes: [{
      name: destination.name, country: destination.country, cityOrRegion: destination.name, destinationCode: destination.code,
      why: caution,
      visaStatus: copy("Giriş koşullarını doğrula", "Verify entry conditions", "Verifiko kushtet e hyrjes"),
      verifiedEntryStatus: "unknown" as const,
      estimatedBudget: copy("Tarihlerine göre ayrıca hesapla", "Estimate separately for your dates", "Llogarite veçmas për datat e tua"),
      idealDuration: copy(`${days} gün`, `${days} days`, `${days} ditë`),
      bestFor: copy("Seçtiğin seyahat tarzına göre düzenle", "Adapt to your chosen travel style", "Përshtate me stilin tënd të udhëtimit"),
      difficulty: copy("Planlama taslağı", "Planning outline", "Plan fillestar"), firstTimeFriendly: true,
      transportEase: copy("Yerel bağlantıları kontrol et", "Check local connections", "Kontrollo lidhjet lokale"),
      safetyNote: copy("Güncel resmî seyahat bilgilerini kontrol et.", "Check current official travel information.", "Kontrollo informacionin zyrtar aktual të udhëtimit."),
      scores: { budget: 0, visaEase: 0, firstTime: 0, transport: 0, overall: 0 }, dailyPlan, warnings: [caution],
    }],
  };
}

export function editPlanStops(stops: string[], action: { type: "edit"; index: number; text: string } | { type: "remove"; index: number } | { type: "move"; index: number; delta: -1 | 1 } | { type: "add"; text: string }) {
  const next = [...stops];
  if (action.type === "add") {
    if (next.length < 30 && action.text.trim()) next.push(action.text.trim().slice(0, 600));
    return next;
  }
  if (!Number.isInteger(action.index) || action.index < 0 || action.index >= next.length) return next;
  if (action.type === "edit") next[action.index] = action.text.slice(0, 600);
  if (action.type === "remove" && next.length > 1) next.splice(action.index, 1);
  if (action.type === "move") {
    const target = action.index + action.delta;
    if (target >= 0 && target < next.length) [next[action.index], next[target]] = [next[target], next[action.index]];
  }
  return next;
}
