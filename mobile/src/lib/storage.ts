import { createId } from "./id";
import { nextSessionGenerationValue } from "./liveActivityGeneration";
import type {
  FavoriteDestination,
  MobilePreferences,
  SavedRoutePlan,
  TravelEvent,
} from "../types";
import {
  guestDataCounts,
  guestDataSignature,
  mergeGuestData,
  type GuestDataCollections,
  type GuestDataCounts,
} from "./guestData";

const ROUTES_KEY = "l2t.mobile.saved-routes.v1";
const FAVORITES_KEY = "l2t.mobile.favorite-destinations.v1";
const VISITED_KEY = "l2t.mobile.visited-countries.v1";
const RECENT_KEY = "l2t.mobile.recent-destinations.v1";
const READ_NOTIFICATIONS_KEY = "l2t.mobile.read-notifications.v1";
const PREFERENCES_KEY = "l2t.mobile.preferences.v1";
const SAVED_EVENTS_KEY = "l2t.mobile.saved-events.v1";
const ONBOARDING_KEY = "l2t.mobile.onboarding.v2";
const INSTALLATION_KEY = "l2t.mobile.installation-id.v1";
const LIVE_ACTIVITY_SESSION_GENERATION_KEY = "l2t.mobile.live-activity-session-generation.v1";
const RELEASE_KEY = "l2t.mobile.release-seen";
const GUEST_DATA_DECISION_KEY = "l2t.mobile.guest-data-decision.v1";
const GUEST_DATA_SYNC_KEY = "l2t.mobile.guest-data-web-sync.v1";
const ROUTES_LIMIT = 100;
// ISO ülke kümesi 250'nin altındadır; favori/ziyaret aktarımında iki yerel
// koleksiyon birleşse bile gerçek bir ülke sessizce kırpılmasın.
const COUNTRY_COLLECTION_LIMIT = 250;

export type GuestDataImportDecision = "imported" | "keep_separate";

export type GuestDataImportDecisionRecord = {
  decision: GuestDataImportDecision;
  decidedAt: string;
  guestSignature: string;
};

export type GuestDataImportResult = {
  guest: GuestDataCounts;
  added: GuestDataCounts;
  accountAfter: GuestDataCounts;
};

export type PendingGuestDataSync = {
  routeIds: string[];
  profile: boolean;
  revision: number;
  updatedAt: string;
};

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

function emitStorageError() {
  // Kaydet çağrısının hemen ardından gösterilen başarı mesajını ezebilmesi
  // için hatayı sonraki görevde yayınla. Böylece kullanıcı hiçbir zaman
  // cihazda saklanmamış bir kaydı saklanmış sanmaz.
  window.setTimeout(() => window.dispatchEvent(new CustomEvent("l2t:storage-error")), 0);
}

function authenticatedOwnerId(ownerId: string) {
  const value = String(ownerId || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) {
    throw new Error("Misafir kayıtları için geçerli bir hesap kimliği gerekli.");
  }
  return value;
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

function readRequired<T>(key: string): T[] {
  const raw = window.localStorage.getItem(key);
  if (raw === null) throw new Error("Bekleyen yerel kayıt bulunamadı.");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Bekleyen yerel kayıt okunamadı.");
  return parsed as T[];
}

function write<T>(key: string, data: T[], limit = 40) {
  try {
    window.localStorage.setItem(key, JSON.stringify(data.slice(0, limit)));
    emitChange();
  } catch {
    emitStorageError();
  }
}

function readScoped<T>(base: string, ownerId?: string | null) {
  const key = scopedKey(base, ownerId);
  if (ownerId) return read<T>(key);
  // Boş bir dizi de bilinçli ve geçerli bir kayıttır. Yalnız anahtar gerçekten
  // hiç oluşmadıysa eski kapsamlandırılmamış misafir verisini taşı. Aksi halde
  // kullanıcı son öğeyi sildikten sonra eski kayıt yeniden dirilebilirdi.
  let scopedRaw: string | null;
  try {
    scopedRaw = window.localStorage.getItem(key);
  } catch {
    return [];
  }
  if (scopedRaw !== null) return read<T>(key);

  // Eski sürümde misafir kayıtları kapsamlandırılmamıştı. Yalnızca misafir
  // alanına bir kez taşı; bir hesaba aitmiş gibi varsayarak aktarma yapma.
  const legacy = read<T>(base);
  const limit = base === ROUTES_KEY
    ? ROUTES_LIMIT
    : base === FAVORITES_KEY || base === VISITED_KEY
      ? COUNTRY_COLLECTION_LIMIT
      : 40;
  try {
    // Boş sonucu da yazarak bu anahtar için taşımanın tamamlandığını kaydet.
    // Başarıdan sonra eski anahtarı kaldır; sonraki silme/aktarma işlemleri onu
    // yanlışlıkla tekrar kaynak olarak göremez.
    window.localStorage.setItem(key, JSON.stringify(legacy.slice(0, limit)));
    window.localStorage.removeItem(base);
  } catch {
    // Depolama salt okunursa özgün veriyi kaybetmeden bu okumada kullan.
  }
  return legacy;
}

export function getSavedRoutePlans(ownerId?: string | null) {
  return readScoped<SavedRoutePlan>(ROUTES_KEY, ownerId);
}

export function saveRoutePlan(plan: SavedRoutePlan, ownerId?: string | null) {
  const next = [plan, ...getSavedRoutePlans(ownerId).filter((item) => item.id !== plan.id)];
  write(scopedKey(ROUTES_KEY, ownerId), next, ROUTES_LIMIT);
  return next;
}

export function deleteRoutePlan(id: string, ownerId?: string | null) {
  const next = getSavedRoutePlans(ownerId).filter((item) => item.id !== id);
  write(scopedKey(ROUTES_KEY, ownerId), next, ROUTES_LIMIT);
  // Kullanıcı, web aktarımı bekleyen bir rotayı silerse artık var olmayan
  // kaydı sonsuza kadar yeniden deneme. Yalnız yerel silme gerçekten başarılı
  // olduysa ilgili kuyruk girdisini de kaldır.
  if (ownerId && !getSavedRoutePlans(ownerId).some((item) => item.id === id)) {
    const pending = getPendingGuestDataSync(ownerId);
    if (pending?.routeIds.includes(id)) {
      savePendingGuestDataSync(ownerId, {
        ...pending,
        routeIds: pending.routeIds.filter((routeId) => routeId !== id),
        revision: pending.revision + 1,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return next;
}

export function getFavoriteDestinations(ownerId?: string | null) {
  return readScoped<FavoriteDestination>(FAVORITES_KEY, ownerId);
}

export function setFavoriteDestinations(destinations: FavoriteDestination[], ownerId?: string | null) {
  write(scopedKey(FAVORITES_KEY, ownerId), destinations, COUNTRY_COLLECTION_LIMIT);
  return destinations;
}

export function toggleFavoriteDestination(destination: Omit<FavoriteDestination, "createdAt">, ownerId?: string | null) {
  const current = getFavoriteDestinations(ownerId);
  const exists = current.some((item) => item.alpha3 === destination.alpha3);
  const next = exists
    ? current.filter((item) => item.alpha3 !== destination.alpha3)
    : [{ ...destination, createdAt: new Date().toISOString() }, ...current];
  write(scopedKey(FAVORITES_KEY, ownerId), next, COUNTRY_COLLECTION_LIMIT);
  return next;
}

export function getVisitedCountries(ownerId?: string | null) {
  return readScoped<FavoriteDestination>(VISITED_KEY, ownerId);
}

/**
 * Kalıcı web kuyruğu işlenirken parse/depolama hatasını boş koleksiyon gibi
 * göstermeyen katı okuma. Hata fırlarsa kuyruk korunur ve sonraki açılışta
 * tekrar denenir.
 */
export function getProfileDestinationsForPendingSync(ownerId: string) {
  const accountId = authenticatedOwnerId(ownerId);
  return {
    favorites: readRequired<FavoriteDestination>(scopedKey(FAVORITES_KEY, accountId)),
    visitedCountries: readRequired<FavoriteDestination>(scopedKey(VISITED_KEY, accountId)),
  };
}

export function setVisitedCountries(countries: FavoriteDestination[], ownerId?: string | null) {
  write(scopedKey(VISITED_KEY, ownerId), countries, COUNTRY_COLLECTION_LIMIT);
  return countries;
}

export function toggleVisitedCountry(country: Omit<FavoriteDestination, "createdAt">, ownerId?: string | null) {
  const current = getVisitedCountries(ownerId);
  const exists = current.some((item) => item.alpha3 === country.alpha3);
  const next = exists
    ? current.filter((item) => item.alpha3 !== country.alpha3)
    : [{ ...country, createdAt: new Date().toISOString() }, ...current];
  write(scopedKey(VISITED_KEY, ownerId), next, COUNTRY_COLLECTION_LIMIT);
  return next;
}

function guestCollections(): GuestDataCollections<SavedRoutePlan, FavoriteDestination> {
  return {
    routes: getSavedRoutePlans(),
    favorites: getFavoriteDestinations(),
    visitedCountries: getVisitedCountries(),
  };
}

function accountCollections(ownerId: string): GuestDataCollections<SavedRoutePlan, FavoriteDestination> {
  return {
    routes: getSavedRoutePlans(ownerId),
    favorites: getFavoriteDestinations(ownerId),
    visitedCountries: getVisitedCountries(ownerId),
  };
}

function storedRouteKey(item: SavedRoutePlan) {
  return String(item?.id || "").trim();
}

function storedDestinationKey(item: FavoriteDestination) {
  return String(item?.alpha3 || "").trim().toLocaleUpperCase("en-US");
}

/** Giriş yapılmadan bu cihazda üretilen ve aktarılabilecek kayıtların özeti. */
export function getGuestDataSummary(): GuestDataCounts {
  return guestDataCounts(guestCollections());
}

/**
 * Belirli hesabın son misafir veri kümesi için verdiği kararı döndürür.
 * Kayıt bozuksa karar yok kabul edilir; hiçbir kullanıcı verisi silinmez.
 */
export function getGuestDataImportDecision(ownerId: string): GuestDataImportDecisionRecord | null {
  const accountId = authenticatedOwnerId(ownerId);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(scopedKey(GUEST_DATA_DECISION_KEY, accountId)) || "null") as Partial<GuestDataImportDecisionRecord> | null;
    if (!parsed || (parsed.decision !== "imported" && parsed.decision !== "keep_separate")) return null;
    if (typeof parsed.decidedAt !== "string" || typeof parsed.guestSignature !== "string") return null;
    return {
      decision: parsed.decision,
      decidedAt: parsed.decidedAt,
      guestSignature: parsed.guestSignature,
    };
  } catch {
    return null;
  }
}

/**
 * Aynı hesaba aynı misafir kayıtları için tekrar tekrar soru sormayı önler.
 * Misafir tarafında sonradan yeni veri oluşursa imza değişir ve teklif yenilenir.
 */
export function shouldOfferGuestDataImport(ownerId: string) {
  const accountId = authenticatedOwnerId(ownerId);
  const guest = guestCollections();
  if (guestDataCounts(guest).total === 0) return false;
  const signature = guestDataSignature(guest);
  const decision = getGuestDataImportDecision(accountId);
  if (decision?.guestSignature === signature) return false;
  // Yerel kayıtlar hesap alanında zaten bulunsa bile eski bir sürüm web
  // eşitleme kuyruğunu oluşturamamış olabilir. İşlenmemiş her yeni imzayı bir
  // kez teklif et; onay, kopya üretmeden eksik web aktarımını tamamlar.
  return true;
}

export function markGuestDataImportDecision(ownerId: string, decision: GuestDataImportDecision) {
  const accountId = authenticatedOwnerId(ownerId);
  if (decision !== "imported" && decision !== "keep_separate") {
    throw new Error("Geçersiz misafir veri kararı.");
  }
  const record: GuestDataImportDecisionRecord = {
    decision,
    decidedAt: new Date().toISOString(),
    guestSignature: guestDataSignature(guestCollections()),
  };
  window.localStorage.setItem(scopedKey(GUEST_DATA_DECISION_KEY, accountId), JSON.stringify(record));
  emitChange();
  return record;
}

export function getPendingGuestDataSync(ownerId: string): PendingGuestDataSync | null {
  const accountId = authenticatedOwnerId(ownerId);
  try {
    const value = JSON.parse(window.localStorage.getItem(scopedKey(GUEST_DATA_SYNC_KEY, accountId)) || "null") as Partial<PendingGuestDataSync> | null;
    if (!value || !Array.isArray(value.routeIds) || typeof value.profile !== "boolean") return null;
    const routeIds = Array.from(new Set(value.routeIds
      .map((id) => String(id || "").trim())
      .filter((id) => /^[A-Za-z0-9._:-]{8,160}$/.test(id))))
      .slice(0, ROUTES_LIMIT);
    if (!routeIds.length && !value.profile) return null;
    return {
      routeIds,
      profile: value.profile,
      revision: Number.isSafeInteger(value.revision) && Number(value.revision) > 0 ? Number(value.revision) : 1,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function savePendingGuestDataSync(ownerId: string, pending: PendingGuestDataSync | null) {
  const accountId = authenticatedOwnerId(ownerId);
  try {
    const key = scopedKey(GUEST_DATA_SYNC_KEY, accountId);
    if (pending && (pending.routeIds.length || pending.profile)) {
      window.localStorage.setItem(key, JSON.stringify(pending));
    } else {
      window.localStorage.removeItem(key);
    }
    return true;
  } catch {
    emitStorageError();
    return false;
  }
}

export function queuePendingGuestDataSync(ownerId: string, routeIds: Iterable<string>, profile: boolean) {
  const current = getPendingGuestDataSync(ownerId);
  const mergedRouteIds = Array.from(new Set([
    ...(current?.routeIds || []),
    ...Array.from(routeIds, (id) => String(id || "").trim()),
  ].filter((id) => /^[A-Za-z0-9._:-]{8,160}$/.test(id)))).slice(0, ROUTES_LIMIT);
  const pending: PendingGuestDataSync = {
    routeIds: mergedRouteIds,
    profile: Boolean(current?.profile || profile),
    revision: (current?.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  if (!pending.routeIds.length && !pending.profile) return null;
  if (!savePendingGuestDataSync(ownerId, pending)) {
    throw new Error("Web eşitleme kuyruğu bu cihazda saklanamadı.");
  }
  return pending;
}

/**
 * Misafir rotalarını, favorilerini ve ziyaretlerini hedef hesaba ekler.
 *
 * - Misafir anahtarlarına asla yazmaz; cihazdaki özgün misafir kayıtları kalır.
 * - Hesap kaydı çakışmada önceliklidir.
 * - Aynı aktarım tekrar çalıştırıldığında yeni kopya üretmez.
 * - Yazma yarıda kesilirse karar işaretlenmez; güvenli biçimde tekrar denenebilir.
 */
export function importGuestDataForUser(ownerId: string): GuestDataImportResult {
  const accountId = authenticatedOwnerId(ownerId);
  const guest = guestCollections();
  const accountBefore = accountCollections(accountId);
  const merged = mergeGuestData(accountBefore, guest);

  // Mevcut saklama sınırlarıyla uyumlu kal. Hesabın eski kayıtları dizinin
  // başında olduğundan aktarım onları düşürmez.
  let wroteAccountData = false;
  try {
    window.localStorage.setItem(scopedKey(ROUTES_KEY, accountId), JSON.stringify(merged.merged.routes.slice(0, ROUTES_LIMIT)));
    wroteAccountData = true;
    window.localStorage.setItem(scopedKey(FAVORITES_KEY, accountId), JSON.stringify(merged.merged.favorites.slice(0, COUNTRY_COLLECTION_LIMIT)));
    window.localStorage.setItem(scopedKey(VISITED_KEY, accountId), JSON.stringify(merged.merged.visitedCountries.slice(0, COUNTRY_COLLECTION_LIMIT)));
  } catch (error) {
    // Bir yazma kısmen gerçekleştiyse ekranların yerel durumu da gerçeği
    // yeniden okusun. Karar kaydı oluşmadığı için aktarım güvenle yinelenebilir.
    if (wroteAccountData) emitChange();
    throw error;
  }

  const accountAfter = accountCollections(accountId);
  const beforeKeys = {
    routes: new Set(accountBefore.routes.map(storedRouteKey).filter(Boolean)),
    favorites: new Set(accountBefore.favorites.map(storedDestinationKey).filter(Boolean)),
    visitedCountries: new Set(accountBefore.visitedCountries.map(storedDestinationKey).filter(Boolean)),
  };
  const accountAfterKeys = {
    routes: new Set(accountAfter.routes.map(storedRouteKey).filter(Boolean)),
    favorites: new Set(accountAfter.favorites.map(storedDestinationKey).filter(Boolean)),
    visitedCountries: new Set(accountAfter.visitedCountries.map(storedDestinationKey).filter(Boolean)),
  };
  const added = {
    routes: new Set(guest.routes.map(storedRouteKey).filter((key) => key && !beforeKeys.routes.has(key) && accountAfterKeys.routes.has(key))).size,
    favorites: new Set(guest.favorites.map(storedDestinationKey).filter((key) => key && !beforeKeys.favorites.has(key) && accountAfterKeys.favorites.has(key))).size,
    visitedCountries: new Set(guest.visitedCountries.map(storedDestinationKey).filter((key) => key && !beforeKeys.visitedCountries.has(key) && accountAfterKeys.visitedCountries.has(key))).size,
    total: 0,
  };
  added.total = added.routes + added.favorites + added.visitedCountries;

  // Web aktarım niyetini, kullanıcı kararından ÖNCE kalıcılaştır. Uygulama bu
  // satırdan sonra kapansa veya ağ kesilse bile sonraki açılış/öne geliş kalan
  // işleri tamamlar. Yalnız gerçekten hesap alanında bulunan misafir rotaları
  // kuyruğa eklenir; profil bayrağı favori/ziyaret verisini kapsar.
  // Kuyruğa yalnız hesaba yeni eklenenleri değil bütün misafir rota
  // kimliklerini koy. Hesap yerel kapasitesine ulaşsa bile özgün misafir
  // kopyasından web hesabına aktarım tamamlanabilir.
  const routeIdsToSync = guest.routes.map((route) => route.id);
  queuePendingGuestDataSync(
    accountId,
    routeIdsToSync,
    guest.favorites.length > 0 || guest.visitedCountries.length > 0,
  );
  markGuestDataImportDecision(accountId, "imported");

  return {
    guest: guestDataCounts(guest),
    added,
    accountAfter: guestDataCounts(accountAfter),
  };
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

export function getSavedTravelEvents(ownerId?: string | null) {
  return readScoped<TravelEvent>(SAVED_EVENTS_KEY, ownerId)
    .filter((event) => event && typeof event.id === "string" && Number.isFinite(Date.parse(event.startsAt)))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function toggleSavedTravelEvent(event: TravelEvent, ownerId?: string | null) {
  const current = getSavedTravelEvents(ownerId);
  const exists = current.some((item) => item.id === event.id);
  const next = exists ? current.filter((item) => item.id !== event.id) : [event, ...current];
  write(scopedKey(SAVED_EVENTS_KEY, ownerId), next, 80);
  return { saved: !exists, events: next };
}

export function removeSavedTravelEvent(id: string, ownerId?: string | null) {
  const next = getSavedTravelEvents(ownerId).filter((event) => event.id !== id);
  write(scopedKey(SAVED_EVENTS_KEY, ownerId), next, 80);
  return next;
}

/** Refreshes saved event facts without changing the user's saved selection. */
export function mergeSavedTravelEvents(events: TravelEvent[], ownerId?: string | null) {
  const current = getSavedTravelEvents(ownerId);
  const incoming = new Map(events.map((event) => [event.id, event]));
  let changed = false;
  const next = current.map((event) => {
    const update = incoming.get(event.id);
    if (!update || ["updatedAt", "startsAt", "endsAt", "status", "title", "city", "venue", "sourceUrl", "ticketUrl"]
      .every((key) => update[key as keyof TravelEvent] === event[key as keyof TravelEvent])) return event;
    changed = true;
    return update;
  });
  if (changed) write(scopedKey(SAVED_EVENTS_KEY, ownerId), next, 80);
  return { events: next, changed };
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
    emitStorageError();
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

/**
 * Kalıcı KURULUM (cihaz) kimliği. Push-to-start token rotasyonu için
 * sunucuya gönderilir: Apple tokenı zamanla değiştirdiğinde aynı fiziksel
 * cihazın eski tokenı bu kimlikle atomik kapatılır (diğer cihazlar
 * etkilenmez). Kimlik cihazda üretilir, kişisel veri içermez.
 */
export function getInstallationId(): string {
  try {
    const existing = window.localStorage.getItem(INSTALLATION_KEY) || "";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
      return existing;
    }
    const generated = createId();
    window.localStorage.setItem(INSTALLATION_KEY, generated);
    return generated;
  } catch {
    return ""; // depolama yoksa kimliksiz kayıt (rotasyonsuz eski yol)
  }
}

/**
 * Bu kurulumdaki her yeni giriş için kalıcı ve monoton bir generation.
 * Sunucu yalnız en yüksek generation'ı güncel kabul eder; böylece logout
 * isteği ağa hiç ulaşmasa bile eski hesabın gecikmiş token isteği sonraki
 * hesabın oturumunu geri alamaz. Depolama yazılamıyorsa 0 döner ve güvenli
 * biçimde Live Activity kaydı yapılmaz.
 */
export function nextLiveActivitySessionGeneration(): number {
  try {
    const raw = window.localStorage.getItem(LIVE_ACTIVITY_SESSION_GENERATION_KEY) || "0";
    const next = nextSessionGenerationValue(raw);
    if (!next) return 0;
    window.localStorage.setItem(LIVE_ACTIVITY_SESSION_GENERATION_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}
