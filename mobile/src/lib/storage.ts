import type {
  FavoriteDestination,
  MobilePreferences,
  SavedRoutePlan,
} from "../types";

const ROUTES_KEY = "l2t.mobile.saved-routes.v1";
const FAVORITES_KEY = "l2t.mobile.favorite-destinations.v1";
const VISITED_KEY = "l2t.mobile.visited-countries.v1";
const RECENT_KEY = "l2t.mobile.recent-destinations.v1";
const READ_NOTIFICATIONS_KEY = "l2t.mobile.read-notifications.v1";
const PREFERENCES_KEY = "l2t.mobile.preferences.v1";
const ONBOARDING_KEY = "l2t.mobile.onboarding.v2";
const RELEASE_KEY = "l2t.mobile.release-seen";

// Uçuş arama özelliği kaldırıldı; eski cihaz kayıtları modül açılışında bir kez temizlenir.
const LEGACY_FLIGHT_SEARCHES_KEY = "l2t.mobile.saved-flight-searches.v1";
try {
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key === LEGACY_FLIGHT_SEARCHES_KEY || key?.startsWith(`${LEGACY_FLIGHT_SEARCHES_KEY}.`)) {
      window.localStorage.removeItem(key);
    }
  }
} catch {
  // Depolamaya erişilemiyorsa temizlik sonraki açılışta yeniden denenir.
}

function ownerScope(ownerId?: string | null) {
  if (!ownerId) return "guest";
  return `user-${ownerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`;
}

function scopedKey(base: string, ownerId?: string | null) {
  return `${base}.${ownerScope(ownerId)}`;
}

function emitChange() {
  window.dispatchEvent(new CustomEvent("l2t:storage-change"));
}

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

function write<T>(key: string, data: T[], limit = 40) {
  try {
    window.localStorage.setItem(key, JSON.stringify(data.slice(0, limit)));
    emitChange();
  } catch {
    // Depolama kısıtlıysa uygulamanın geri kalanı çalışmaya devam etsin.
  }
}

function readScoped<T>(base: string, ownerId?: string | null) {
  const key = scopedKey(base, ownerId);
  const scoped = read<T>(key);
  if (scoped.length || ownerId) return scoped;

  // Eski sürümde misafir kayıtları kapsamlandırılmamıştı. Yalnızca misafir
  // alanına bir kez taşı; bir hesaba aitmiş gibi varsayarak aktarma yapma.
  const legacy = read<T>(base);
  if (legacy.length) {
    try { window.localStorage.setItem(key, JSON.stringify(legacy.slice(0, 40))); } catch { /* Salt okunur geri dönüş. */ }
  }
  return legacy;
}

export function getSavedRoutePlans(ownerId?: string | null) {
  return readScoped<SavedRoutePlan>(ROUTES_KEY, ownerId);
}

export function saveRoutePlan(plan: SavedRoutePlan, ownerId?: string | null) {
  const next = [plan, ...getSavedRoutePlans(ownerId).filter((item) => item.id !== plan.id)];
  write(scopedKey(ROUTES_KEY, ownerId), next);
  return next;
}

export function deleteRoutePlan(id: string, ownerId?: string | null) {
  const next = getSavedRoutePlans(ownerId).filter((item) => item.id !== id);
  write(scopedKey(ROUTES_KEY, ownerId), next);
  return next;
}

export function getFavoriteDestinations(ownerId?: string | null) {
  return readScoped<FavoriteDestination>(FAVORITES_KEY, ownerId);
}

export function setFavoriteDestinations(destinations: FavoriteDestination[], ownerId?: string | null) {
  write(scopedKey(FAVORITES_KEY, ownerId), destinations, 80);
  return destinations;
}

export function toggleFavoriteDestination(destination: Omit<FavoriteDestination, "createdAt">, ownerId?: string | null) {
  const current = getFavoriteDestinations(ownerId);
  const exists = current.some((item) => item.alpha3 === destination.alpha3);
  const next = exists
    ? current.filter((item) => item.alpha3 !== destination.alpha3)
    : [{ ...destination, createdAt: new Date().toISOString() }, ...current];
  write(scopedKey(FAVORITES_KEY, ownerId), next, 80);
  return next;
}

export function getVisitedCountries(ownerId?: string | null) {
  return readScoped<FavoriteDestination>(VISITED_KEY, ownerId);
}

export function setVisitedCountries(countries: FavoriteDestination[], ownerId?: string | null) {
  write(scopedKey(VISITED_KEY, ownerId), countries, 200);
  return countries;
}

export function toggleVisitedCountry(country: Omit<FavoriteDestination, "createdAt">, ownerId?: string | null) {
  const current = getVisitedCountries(ownerId);
  const exists = current.some((item) => item.alpha3 === country.alpha3);
  const next = exists
    ? current.filter((item) => item.alpha3 !== country.alpha3)
    : [{ ...country, createdAt: new Date().toISOString() }, ...current];
  write(scopedKey(VISITED_KEY, ownerId), next, 200);
  return next;
}

export function getRecentDestinations(ownerId?: string | null) {
  return readScoped<FavoriteDestination>(RECENT_KEY, ownerId);
}

export function addRecentDestination(destination: Omit<FavoriteDestination, "createdAt">, ownerId?: string | null) {
  const next = [
    { ...destination, createdAt: new Date().toISOString() },
    ...getRecentDestinations(ownerId).filter((item) => item.alpha3 !== destination.alpha3),
  ];
  write(scopedKey(RECENT_KEY, ownerId), next, 8);
  return next;
}

export function getReadNotificationIds(ownerId?: string | null) {
  return readScoped<string>(READ_NOTIFICATIONS_KEY, ownerId);
}

export function markNotificationsRead(ids: string[], ownerId?: string | null) {
  const next = Array.from(new Set([...getReadNotificationIds(ownerId), ...ids]));
  write(scopedKey(READ_NOTIFICATIONS_KEY, ownerId), next, 120);
  return next;
}

export function getMobilePreferences(): MobilePreferences {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) || "null") as Partial<MobilePreferences> | null;
    return {
      inAppNotifications: parsed?.inAppNotifications !== false,
      haptics: parsed?.haptics !== false,
    };
  } catch {
    return { inAppNotifications: true, haptics: true };
  }
}

export function saveMobilePreferences(preferences: MobilePreferences) {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    emitChange();
  } catch {
    // Tercih kaydedilemese de uygulama çalışmaya devam etsin.
  }
}

export function hasCompletedOnboarding() {
  try { return window.localStorage.getItem(ONBOARDING_KEY) === "done"; } catch { return false; }
}

export function completeOnboarding() {
  try { window.localStorage.setItem(ONBOARDING_KEY, "done"); } catch { /* Onboarding yalnız bu oturumda kapanır. */ }
}

export function hasSeenRelease(version: string) {
  try { return window.localStorage.getItem(RELEASE_KEY) === version; } catch { return false; }
}

export function markReleaseSeen(version: string) {
  try {
    window.localStorage.setItem(RELEASE_KEY, version);
    emitChange();
  } catch {
    // Depolama kısıtlıysa sürüm notu yalnız bu oturumda kapanır.
  }
}
