import type { RouteSuggestion } from "../types";
import type { AppLocale } from "./locale";
import { decodeStoredMapJourney, mapJourneyToSavedRoute } from "./mapJourney";

/** Rebuild structural labels from the saved data, without mutating or resaving it. */
export function savedRouteDisplay(route: RouteSuggestion, locale: AppLocale): RouteSuggestion {
  const journey = decodeStoredMapJourney(route.mapJourney);
  if (!journey) return route;
  const display = mapJourneyToSavedRoute(journey, locale).plan.routes[0];
  return { ...route, why: display.why, idealDuration: display.idealDuration, dailyPlan: display.dailyPlan };
}
