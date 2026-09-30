import { AIRPORT_PICKS } from "../data/airportPicks";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, alpha3FromAlpha2 } from "../data/countryIso";
import { SQ_REGIONS } from "./locales/sq-regions";
import type { Country } from "../types";
import type { CockpitJourneyIntent } from "./cockpitJourney";

const exactName = (value: unknown) => typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase().replace(/\u0307/g, "").replace(/\s+/g, " ") : "";
const code = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase() : "";
function byCountryCode(value: unknown): Country | null {
  const raw = code(value);
  const alpha3 = raw.length === 2 ? alpha3FromAlpha2(raw) : raw;
  return COUNTRY_LIST.find(country => country.alpha3 === alpha3) || null;
}
let names: Map<string, Country | null> | undefined;
function byCountryName(value: unknown): Country | null {
  const wanted = exactName(value);
  if (!wanted) return null;
  if (!names) {
    names = new Map();
    const localized = ["tr", "en"].flatMap(locale => {
      try { return [new Intl.DisplayNames(locale, { type: "region" })]; } catch { return []; }
    });
    for (const country of COUNTRY_LIST) {
      const alpha2 = alpha2FromAlpha3(country.alpha3);
      const labels = [country.name, SQ_REGIONS[alpha2], ...localized.map(formatter => formatter.of(alpha2))];
      // Historical English country names still occur in existing saved routes.
      if (alpha2 === "TR") labels.push("Turkey");
      if (alpha2 === "CZ") labels.push("Czech Republic");
      for (const label of labels) {
        const key = exactName(label);
        if (!key) continue;
        const previous = names.get(key);
        names.set(key, previous === undefined || previous?.alpha3 === country.alpha3 ? country : null);
      }
    }
  }
  return names.get(wanted) || null;
}

/** Resolve trusted destination metadata; unknowns require the user's country selection. */
export function journeyCountry(intent: CockpitJourneyIntent): Country | null {
  if (intent.kind === "city-budget") return byCountryCode(intent.countryCode);
  const routeCode = code(intent.route.destinationCode);
  const destination = intent.input?.mode === "fixed" ? intent.input.destination : undefined;
  // A saved input can describe a different alternative. Only use it for the
  // chosen destination, never for another route from the same planner result.
  const destinationMatches = destination && (routeCode && code(destination.code)
    ? routeCode === code(destination.code)
    : !!exactName(destination.name) && exactName(destination.name) === exactName(intent.route.cityOrRegion));
  if (destinationMatches) {
    const explicit = byCountryCode(destination.countryCode);
    if (explicit) return explicit;
  }
  const airport = AIRPORT_PICKS.find(item => item.iata === routeCode);
  if (airport) return byCountryCode(airport.countryCode);
  // Three-letter route destination codes are IATA, not ISO alpha-3 (CAN is
  // Guangzhou airport, for example). Never guess a country from those letters.
  if (/^[A-Z]{2}$/.test(routeCode)) {
    const explicit = byCountryCode(routeCode);
    if (explicit) return explicit;
  }
  return byCountryName(intent.route.country);
}
