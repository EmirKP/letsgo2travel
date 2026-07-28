import type { SavedFlightSearch, SavedRoutePlan } from "../types";

const ROUTES_KEY = "l2t.mobile.saved-routes.v1";
const SEARCHES_KEY = "l2t.mobile.saved-flight-searches.v1";

function read<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, data: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(data.slice(0, 40)));
  } catch {
    // Depolama kısıtlıysa uygulamanın geri kalanı çalışmaya devam etsin.
  }
}

export function getSavedRoutePlans() {
  return read<SavedRoutePlan>(ROUTES_KEY);
}

export function saveRoutePlan(plan: SavedRoutePlan) {
  const next = [plan, ...getSavedRoutePlans().filter((item) => item.id !== plan.id)];
  write(ROUTES_KEY, next);
  return next;
}

export function deleteRoutePlan(id: string) {
  const next = getSavedRoutePlans().filter((item) => item.id !== id);
  write(ROUTES_KEY, next);
  return next;
}

export function getSavedFlightSearches() {
  return read<SavedFlightSearch>(SEARCHES_KEY);
}

export function saveFlightSearch(search: SavedFlightSearch) {
  const next = [search, ...getSavedFlightSearches().filter((item) => item.id !== search.id)];
  write(SEARCHES_KEY, next);
  return next;
}

export function deleteFlightSearch(id: string) {
  const next = getSavedFlightSearches().filter((item) => item.id !== id);
  write(SEARCHES_KEY, next);
  return next;
}
