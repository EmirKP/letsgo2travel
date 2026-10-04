export type TravelTier = "economy" | "balanced" | "plus";
export type TravelParty = { adults: number; children: number; childAges: number[] };
export type PlannerPreferences = {
  tier?: TravelTier;
  party?: TravelParty;
  currency?: "TRY" | "EUR" | "USD" | "GBP";
  activityBudgetPerPersonDay?: number;
};

export function normalizePlannerPreferences(input: { budget?: unknown; who?: unknown; tier?: unknown; party?: unknown; currency?: unknown; activityBudgetPerPersonDay?: unknown }) {
  const tier: TravelTier = input.tier === "economy" || input.tier === "balanced" || input.tier === "plus" ? input.tier
    : input.budget === "Ekonomik" ? "economy" : /premium|plus|yüksek/i.test(String(input.budget)) ? "plus" : "balanced";
  const raw = input.party && typeof input.party === "object" ? input.party as Record<string, unknown> : {};
  const whole = (value: unknown, min: number, max: number, fallback: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  const adults = whole(raw.adults, 1, 20, input.who === "Tek başıma" || input.who === "İlk yurt dışı deneyimim" ? 1 : 2);
  const children = whole(raw.children, 0, 20 - adults, 0);
  const childAges = Array.isArray(raw.childAges) ? raw.childAges.slice(0, children).map(age => whole(age, 0, 17, -1)) : [];
  const party = { adults, children, childAges: Array.from({ length: children }, (_, index) => childAges[index] ?? -1) };
  const currency = input.currency === "EUR" || input.currency === "USD" || input.currency === "GBP" ? input.currency : "TRY";
  const activity = input.activityBudgetPerPersonDay;
  return { tier, budget: tier === "economy" ? "Ekonomik" : tier === "plus" ? "Plus" : "Orta", party, currency,
    ...(typeof activity === "number" && Number.isFinite(activity) && activity >= 0 && activity <= 100000 ? { activityBudgetPerPersonDay: activity } : {}) } as const;
}

/** Shared by the UI and API so a malformed party cannot silently become a different trip. */
export function validTravelParty(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const party = value as TravelParty;
  return Number.isInteger(party.adults) && party.adults >= 1 && Number.isInteger(party.children) && party.children >= 0
    && party.adults + party.children <= 20 && Array.isArray(party.childAges) && party.childAges.length === party.children
    && party.childAges.every(age => Number.isInteger(age) && age >= 0 && age <= 17);
}

export function plannerPreferenceInstructions(input: Parameters<typeof normalizePlannerPreferences>[0]) {
  const { tier, party } = normalizePlannerPreferences(input);
  const style = tier === "economy" ? "Economy: prioritise affordable stays, public transport, local inexpensive food and free activities."
    : tier === "plus" ? "Plus: prioritise comfortable stays, convenient transfers, quality dining and optional guided experiences. Do not promise luxury or availability."
      : "Balanced: mix comfortable mid-range stays, public transport, local dining and a small number of paid activities.";
  return `${style}\nParty: ${party.adults} adults, ${party.children} children${party.children ? `; child ages: ${party.childAges.join(", ")}. Plan short nearby stops, regular meal/rest breaks and age-appropriate activities; avoid nightlife for children and reduce pace for young children.` : "."}\nThe itinerary, accommodation and transport suggestions must reflect this tier and party. Do not invent monetary totals; the separate sourced cost analysis handles prices.`;
}

export function starterPreferenceNote(input: Parameters<typeof normalizePlannerPreferences>[0], locale: "tr" | "en" | "sq") {
  const { tier, party } = normalizePlannerPreferences(input);
  const copy = (tr: string, en: string, sq: string) => locale === "tr" ? tr : locale === "sq" ? sq : en;
  const style = tier === "economy" ? copy("Ücretsiz duraklar, yerel yemek ve toplu taşımayı önceliklendir.", "Prioritise free stops, local food and public transport.", "Jep përparësi ndalesave falas, ushqimit lokal dhe transportit publik.")
    : tier === "plus" ? copy("Konforlu transfer ve isteğe bağlı rehberli deneyim için rezervasyonları karşılaştır.", "Compare reservations for comfortable transfers and an optional guided experience.", "Krahaso rezervimet për transferta të rehatshme dhe një përvojë opsionale me udhërrëfyes.")
      : copy("Yakın durakları birleştir; ücretsiz keşif ve ücretli etkinliği dengele.", "Group nearby stops and balance free exploring with a paid activity.", "Bashko ndalesat pranë dhe balanco eksplorimin falas me një aktivitet me pagesë.");
  return party.children ? `${style} ${copy("Çocukların yaşlarına uygun kısa duraklar ve düzenli yemek/dinlenme molaları bırak; gece hayatını plana alma.", "Use short, age-appropriate stops with regular meal and rest breaks; omit nightlife.", "Përdor ndalesa të shkurtra sipas moshave me pushime të rregullta për ushqim e çlodhje; shmang jetën e natës.")}` : style;
}
