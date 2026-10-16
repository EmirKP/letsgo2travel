import type { JourneyPlanInterest, JourneyPlanLocale } from "./journey-plan-types";

const labels: Record<JourneyPlanInterest, Record<JourneyPlanLocale, string>> = {
  city: { tr: "şehir keşfi", en: "city exploration", sq: "eksplorimi i qytetit" },
  culture: { tr: "kültür", en: "culture", sq: "kultura" },
  food: { tr: "yeme içme", en: "food and drink", sq: "ushqimi dhe pijet" },
  shopping: { tr: "alışveriş", en: "shopping", sq: "blerjet" },
  nature: { tr: "doğa", en: "nature", sq: "natyra" },
  sea: { tr: "deniz", en: "seaside", sq: "bregdeti" },
  adventure: { tr: "macera", en: "adventure", sq: "aventura" },
};

export function journeyInterestLabel(interest: JourneyPlanInterest, locale: JourneyPlanLocale) {
  return labels[interest][locale];
}

/** Old generated prose sometimes quoted internal keys. Only exact, quoted
 * lowercase keys are display-normalized; ordinary words/place names stay intact. */
export function localizeQuotedJourneyInterests(text: string, locale: JourneyPlanLocale) {
  return text.replace(/(['"`])(city|culture|food|shopping|nature|sea|adventure)\1/g,
    (_match, _quote: string, interest: JourneyPlanInterest) => journeyInterestLabel(interest, locale));
}
