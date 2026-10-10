import { ISO_3166 } from "../data/countries";
import { DISCOVERY_DESTINATIONS, localizedDiscovery } from "../data/discovery";
import { homeSearchDestinations } from "../data/homeDestinations";
import { appRegionName, formatAppDate } from "./localeFormatting";
import { normalizeSearchText } from "./searchText";
import { appTools, type TravelAssistantTool } from "./appTools";
import type { AppLocale } from "./locale";
import type { SavedRoutePlan, ViewId } from "../types";
import type { TravelToolArtworkKind } from "../components/TravelToolArtwork";
import type { CockpitTrip } from "./supabaseData";

export type SearchableTrip = Pick<CockpitTrip, "id" | "userId" | "destinationCountry" | "destinationCode" | "destinationCity" | "startDate" | "endDate">;

type BaseResult = { id: string; title: string; subtitle: string };
export type GlobalSearchResult = BaseResult & (
  | { kind: "country"; countryCode: string }
  | { kind: "city"; query: string }
  | { kind: "tool"; view: ViewId; tool?: TravelAssistantTool; icon: TravelToolArtworkKind }
  | { kind: "saved-route"; routeId: string }
  | { kind: "saved-trip"; tripId: string }
);
export type GlobalSearchKind = GlobalSearchResult["kind"];
type Entry = { result: GlobalSearchResult; terms: string };
const locales: AppLocale[] = ["tr", "en", "sq"];
const catalogs = new Map<AppLocale, Entry[]>();
const clean = (value: unknown) => typeof value === "string" ? value : "";

function catalog(locale: AppLocale): Entry[] {
  const cached = catalogs.get(locale);
  if (cached) return cached;
  const countries: Entry[] = ISO_3166.map(country => ({
    result: { kind: "country", id: `country:${country.alpha3}`, countryCode: country.alpha3, title: appRegionName(country.alpha2, locale, country.name), subtitle: country.alpha2 },
    terms: [country.name, country.alpha2, country.alpha3, ...locales.map(language => appRegionName(country.alpha2, language, country.name))].join(" "),
  }));
  const cities = new Map<string, Entry>();
  for (const destination of DISCOVERY_DESTINATIONS) {
    const local = localizedDiscovery(destination, locale);
    cities.set(destination.code, {
      result: { kind: "city", id: `city:${destination.code}`, title: local.name, subtitle: local.country, query: local.name },
      terms: [destination.code, ...locales.flatMap(language => { const item = localizedDiscovery(destination, language); return [item.name, item.country]; })].join(" "),
    });
  }
  for (const route of homeSearchDestinations(locale)) {
    if (!route.destinationCode) continue;
    const aliases = locales.flatMap(language => homeSearchDestinations(language).filter(item => item.destinationCode === route.destinationCode).flatMap(item => [item.cityOrRegion, item.name, item.country]));
    const existing = cities.get(route.destinationCode);
    if (existing) { existing.terms += ` ${aliases.join(" ")}`; continue; }
    cities.set(route.destinationCode, {
      result: { kind: "city", id: `city:${route.destinationCode}`, title: route.cityOrRegion, subtitle: route.country, query: route.cityOrRegion },
      terms: [route.destinationCode, ...aliases].join(" "),
    });
  }
  const tools: Entry[] = appTools(locale).map(tool => ({
    result: { kind: "tool", id: `tool:${tool.id}`, title: tool.label, subtitle: tool.text, view: tool.view, tool: tool.tool, icon: tool.icon },
    terms: [...tool.title, ...tool.caption, tool.keywords].join(" "),
  }));
  const entries = [...tools, ...countries, ...cities.values()].map(entry => ({ ...entry, terms: normalizeSearchText(entry.terms) }));
  catalogs.set(locale, entries);
  return entries;
}

/** Search only the caller's scoped routes and trip summaries; no account reads. */
export function searchApp(query: string, locale: AppLocale, savedRoutes: readonly SavedRoutePlan[] = [], kind?: GlobalSearchKind, savedTrips: readonly SearchableTrip[] = []): GlobalSearchResult[] {
  const term = normalizeSearchText(query.slice(0, 120));
  if (!term) return [];
  const saved = new Map<string, Entry>();
  for (const item of savedRoutes) {
    if (!item || typeof item.id !== "string" || !item.id || !Array.isArray(item.plan?.routes)) continue;
    const routes = item.plan.routes.filter(route => route && (clean(route.cityOrRegion) || clean(route.name)));
    if (!routes.length) continue;
    const title = clean(routes[0].cityOrRegion) || clean(routes[0].name);
    const subtitle = routes.map(route => clean(route.country)).filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(" · ");
    saved.set(item.id, {
      result: { kind: "saved-route", id: `saved:${item.id}`, routeId: item.id, title, subtitle },
      terms: normalizeSearchText([clean(item.plan.summary), ...routes.flatMap(route => [clean(route.name), clean(route.cityOrRegion), clean(route.country), clean(route.destinationCode)])].join(" ")),
    });
  }
  const trips = new Map<string, Entry>();
  const dateLabel = (value: string) => {
    const date = new Date(`${value}T12:00:00`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime())
      ? formatAppDate(date, locale, { day: "numeric", month: "short", year: "numeric" }) : "";
  };
  for (const item of savedTrips) {
    if (!item || typeof item.id !== "string" || !item.id) continue;
    const code = clean(item.destinationCode).toUpperCase();
    const countryNames = /^[A-Z]{2}$/.test(code) ? locales.map(language => appRegionName(code, language, clean(item.destinationCountry))) : [];
    const country = countryNames[locales.indexOf(locale)] || clean(item.destinationCountry);
    const dates = [clean(item.startDate), clean(item.endDate)];
    const title = clean(item.destinationCity) || country || ({ tr: "Seyahat", en: "Trip", sq: "Udhëtim" }[locale]);
    const subtitle = [country, dates.map(dateLabel).filter(Boolean).join(" – ")].filter(Boolean).join(" · ");
    trips.set(item.id, {
      result: { kind: "saved-trip", id: `trip:${item.id}`, tripId: item.id, title, subtitle },
      terms: normalizeSearchText([title, clean(item.destinationCountry), code, ...countryNames, ...dates, subtitle].join(" ")),
    });
  }
  const words = term.split(" ");
  const score = (entry: Entry) => {
    const title = normalizeSearchText(entry.result.title);
    return title === term ? 0 : title.startsWith(term) ? 1 : title.includes(term) ? 2 : 3;
  };
  const matches = [...catalog(locale), ...saved.values(), ...trips.values()]
    .filter(entry => (!kind || entry.result.kind === kind) && words.every(word => entry.terms.includes(word)))
    .sort((a, b) => score(a) - score(b) || a.result.title.localeCompare(b.result.title, locale));
  // Each category retains space even for common queries such as a country name.
  const counts = new Map<GlobalSearchKind, number>();
  return matches.filter(entry => {
    const count = counts.get(entry.result.kind) || 0;
    counts.set(entry.result.kind, count + 1);
    return count < (kind ? 20 : 6);
  }).map(entry => entry.result);
}
