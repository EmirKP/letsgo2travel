import { alpha3ToGeoId, profileIdToAlpha3 } from "../data/countryCodes";
import type { SavedRoutePlan } from "../types";
import {
  getFavoriteDestinations,
  getPendingGuestDataSync,
  getProfileDestinationsForPendingSync,
  getSavedRoutePlans,
  getVisitedCountries,
  savePendingGuestDataSync,
} from "./storage";
import {
  getSupabaseDataErrorMessage,
  mergeUserProfileCountries,
  upsertUserTrip,
  type UserTripUpsertInput,
} from "./supabaseData";
import {
  guestSyncOverallStatus,
  mergeProfileCountryIds,
  pendingGuestSyncAfterAttempt,
  routesAddedByGuestImport,
  runGuestSyncQueue,
} from "./guestDataSyncCore";

export type GuestRouteSyncFailure = {
  id: string;
  message: string;
};

export type GuestRouteSyncReport = {
  status: "unchanged" | "synced" | "partial" | "failed";
  attempted: number;
  synced: number;
  failed: number;
  failures: GuestRouteSyncFailure[];
};

export type GuestProfileSyncReport = {
  status: "unchanged" | "synced" | "failed";
  favoritesAdded: number;
  visitedCountriesAdded: number;
  message?: string;
};

export type ImportedGuestDataSyncReport = {
  status: "unchanged" | "synced" | "partial" | "failed";
  ok: boolean;
  routes: GuestRouteSyncReport;
  profile: GuestProfileSyncReport;
};

export type SyncImportedGuestDataInput = {
  ownerId: string;
  accessToken: string;
  /** Aktarım çağrısından hemen önce alınan yerel rota kimlikleri. */
  routeIdsBeforeImport?: ReadonlySet<string> | readonly string[];
  /** Kalıcı kuyruktan yeniden denenecek kesin rota kimlikleri. */
  routeIdsToSync?: ReadonlySet<string> | readonly string[];
  /** Yalnız rota kuyruğu yeniden deneniyorsa gereksiz profil isteğini atla. */
  syncProfileData?: boolean;
  /** Kalıcı kuyrukta parse hatasını sessiz boş liste sayma. */
  strictProfileRead?: boolean;
};

type PendingFlush = {
  accessToken: string;
  operation: Promise<ImportedGuestDataSyncReport | null>;
};

const pendingFlushes = new Map<string, PendingFlush>();

function safeOwnerId(ownerId: string) {
  const value = String(ownerId || "").trim();
  if (!value || value.length > 80 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Geçerli hesap kimliği gerekli.");
  }
  return value;
}

function routeUpsertInput(saved: SavedRoutePlan): UserTripUpsertInput {
  const routes = Array.isArray(saved?.plan?.routes) ? saved.plan.routes : [];
  const routeNames = routes.map((route) => String(route?.name || "").trim()).filter(Boolean);
  const countries = routes.map((route) => String(route?.country || "").trim()).filter(Boolean);
  if (!routeNames.length || !countries.length) throw new Error("Rota içeriği eksik olduğu için eşitlenemedi.");

  return {
    title: routeNames.join(" · ").slice(0, 160),
    destination: countries.join(" · ").slice(0, 160),
    mobileKind: "route_plan",
    clientKey: String(saved.id || "").trim(),
    tripData: {
      input: saved.input,
      plan: saved.plan,
      source: "guest_import",
      saved_at: saved.createdAt,
    },
  };
}

async function syncRoutes(
  ownerId: string,
  accessToken: string,
  routeIdsBeforeImport?: Iterable<string>,
  routeIdsToSync?: Iterable<string>,
): Promise<GuestRouteSyncReport> {
  const accountRoutes = getSavedRoutePlans(ownerId);
  const accountRouteIds = new Set(accountRoutes.map((route) => route.id));
  // Yerel hesap listesi kapasiteye ulaştıysa aktarım için özgün misafir
  // kopyasına geri dön. Bu kopya silinmez ve yalnız bekleyen kesin kimlikler
  // seçildiğinden kullanıcının ayrı tutmayı seçtiği başka rota karışmaz.
  const savedRoutes = [
    ...accountRoutes,
    ...getSavedRoutePlans().filter((route) => !accountRouteIds.has(route.id)),
  ];
  const exactIds = routeIdsToSync ? new Set(Array.from(routeIdsToSync, (id) => String(id || "").trim())) : null;
  const importedRoutes = exactIds
    ? savedRoutes.filter((route) => exactIds.has(route.id))
    : routesAddedByGuestImport(savedRoutes, routeIdsBeforeImport);
  const matchedIds = new Set(importedRoutes.map((route) => route.id));
  const missingIds = exactIds ? Array.from(exactIds).filter((id) => !matchedIds.has(id)) : [];
  const outcomes = await runGuestSyncQueue(
    importedRoutes,
    (route) => route.id,
    (route) => upsertUserTrip(ownerId, routeUpsertInput(route), accessToken),
    (error) => getSupabaseDataErrorMessage(error, error instanceof Error ? error.message : "Rota web hesabına eşitlenemedi."),
  );
  const failures = [
    ...outcomes.flatMap((outcome) => outcome.ok ? [] : [{ id: outcome.id, message: outcome.error || "Rota web hesabına eşitlenemedi." }]),
    ...missingIds.map((id) => ({ id, message: "Bekleyen rota cihazda okunamadı; kayıt güvenliği için kuyrukta tutuluyor." })),
  ];
  const synced = outcomes.filter((outcome) => outcome.ok).length;
  const attempted = outcomes.length + missingIds.length;
  const status = attempted === 0
    ? "unchanged"
    : failures.length === 0
      ? "synced"
      : synced > 0
        ? "partial"
        : "failed";
  return { status, attempted, synced, failed: failures.length, failures };
}

async function syncProfile(ownerId: string, accessToken: string, strictRead = false): Promise<GuestProfileSyncReport> {
  let favoritesAdded = 0;
  let visitedCountriesAdded = 0;
  try {
    const local = strictRead
      ? getProfileDestinationsForPendingSync(ownerId)
      : {
          favorites: getFavoriteDestinations(ownerId),
          visitedCountries: getVisitedCountries(ownerId),
        };
    const favorites = mergeProfileCountryIds(
      [],
      local.favorites.map((item) => String(item?.alpha3 || "")),
      profileIdToAlpha3,
      alpha3ToGeoId,
    );
    const visited = mergeProfileCountryIds(
      [],
      local.visitedCountries.map((item) => String(item?.alpha3 || "")),
      profileIdToAlpha3,
      alpha3ToGeoId,
    );
    if (favorites.ids.length === 0 && visited.ids.length === 0) {
      return { status: "unchanged", favoritesAdded: 0, visitedCountriesAdded: 0 };
    }

    const merged = await mergeUserProfileCountries(ownerId, favorites.ids, visited.ids, accessToken);
    favoritesAdded = merged.wishlistAdded;
    visitedCountriesAdded = merged.visitedAdded;
    return {
      status: favoritesAdded || visitedCountriesAdded ? "synced" : "unchanged",
      favoritesAdded,
      visitedCountriesAdded,
    };
  } catch (error) {
    return {
      status: "failed",
      favoritesAdded,
      visitedCountriesAdded,
      message: getSupabaseDataErrorMessage(error, error instanceof Error ? error.message : "Favori ve ziyaretler web hesabına eşitlenemedi."),
    };
  }
}

/**
 * Yerel misafir aktarımından sonra web hesabını anında yaklaştırır. Bu yardımcı
 * localStorage'a yazmaz ve hiçbir yerel kaydı silmez. Rotalar birbirinden,
 * profil eşitlemesi de rotalardan bağımsız çalıştığı için kısmi ağ hataları
 * yapılandırılmış raporda görünür ve başarılı işler korunur.
 */
export async function syncImportedGuestData({
  ownerId,
  accessToken,
  routeIdsBeforeImport,
  routeIdsToSync,
  syncProfileData = true,
  strictProfileRead = false,
}: SyncImportedGuestDataInput): Promise<ImportedGuestDataSyncReport> {
  const beforeIds = routeIdsBeforeImport ? Array.from(routeIdsBeforeImport) : undefined;
  const exactIds = routeIdsToSync ? Array.from(routeIdsToSync) : undefined;
  const [routes, profile] = await Promise.all([
    syncRoutes(ownerId, accessToken, beforeIds, exactIds),
    syncProfileData
      ? syncProfile(ownerId, accessToken, strictProfileRead)
      : Promise.resolve<GuestProfileSyncReport>({ status: "unchanged", favoritesAdded: 0, visitedCountriesAdded: 0 }),
  ]);
  const status = guestSyncOverallStatus(routes.synced, routes.failed, profile.status);
  return { status, ok: status === "synced" || status === "unchanged", routes, profile };
}

async function performPendingGuestDataSync(ownerId: string, accessToken: string) {
  let latestReport: ImportedGuestDataSyncReport | null = null;

  // Aktarım sırasında yeni bir kayıt kuyruğa eklenirse aynı çağrıda bir kez daha
  // dön. Kalıcı ağ hatasında revision değişmediğinden istek fırtınası oluşmaz.
  for (let pass = 0; pass < 3; pass += 1) {
    const pending = getPendingGuestDataSync(ownerId);
    if (!pending) return latestReport;
    const report = await syncImportedGuestData({
      ownerId,
      accessToken,
      routeIdsToSync: pending.routeIds,
      syncProfileData: pending.profile,
      strictProfileRead: pending.profile,
    });
    latestReport = report;

    const current = getPendingGuestDataSync(ownerId);
    if (!current) return report;
    const changedDuringSync = current.revision !== pending.revision;
    const next = pendingGuestSyncAfterAttempt(
      pending,
      current,
      report.routes.failures.map((failure) => failure.id),
      report.profile.status === "failed",
    );
    savePendingGuestDataSync(ownerId, next);

    if (!next || !changedDuringSync) return report;
  }
  return latestReport;
}

/**
 * Bekleyen aktarımı hesap başına tek istek zincirinde çalıştırır. Başarısız
 * kayıtlar yerelde kalır ve uygulama yeniden açıldığında ya da ağ geldiğinde
 * tekrar denenir.
 */
export function flushPendingGuestDataSync(
  ownerId: string,
  accessToken: string,
): Promise<ImportedGuestDataSyncReport | null> {
  const accountId = safeOwnerId(ownerId);
  const existing = pendingFlushes.get(accountId);
  if (existing) {
    const revisionAtRequest = getPendingGuestDataSync(accountId)?.revision || 0;
    return existing.operation.then((report) => {
      const pending = getPendingGuestDataSync(accountId);
      return pending && (existing.accessToken !== accessToken || pending.revision !== revisionAtRequest)
        ? flushPendingGuestDataSync(accountId, accessToken)
        : report;
    });
  }
  const operation = performPendingGuestDataSync(accountId, accessToken)
    .finally(() => pendingFlushes.delete(accountId));
  pendingFlushes.set(accountId, { accessToken, operation });
  return operation;
}
