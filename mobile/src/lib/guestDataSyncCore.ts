export type ProfileCountryIdMerge = {
  ids: string[];
  added: number;
};

export type SyncQueueOutcome = {
  id: string;
  ok: boolean;
  error?: string;
};

export type GuestSyncOverallStatus = "unchanged" | "synced" | "partial" | "failed";

export type PendingGuestSyncState = {
  routeIds: string[];
  profile: boolean;
  revision: number;
  updatedAt: string;
};

function normalized(value: unknown) {
  return String(value || "").trim();
}

/**
 * Profildeki bütün mevcut kimlikleri aynı sıra ve yazımla korur; yalnızca
 * profilde karşılığı olmayan ISO-3 kodlarını sona ekler.
 */
export function mergeProfileCountryIds(
  originalIds: string[],
  alpha3Codes: string[],
  profileIdToAlpha3: (profileId: string) => string | null | undefined,
  alpha3ToProfileId: (alpha3: string) => string | null | undefined,
): ProfileCountryIdMerge {
  const ids = [...originalIds];
  const exactIds = new Set(originalIds.map(normalized).filter(Boolean));
  const knownCodes = new Set(originalIds.flatMap((id) => {
    const code = profileIdToAlpha3(id);
    return code ? [normalized(code).toLocaleUpperCase("en-US")] : [];
  }));
  let added = 0;

  for (const rawCode of alpha3Codes) {
    const code = normalized(rawCode).toLocaleUpperCase("en-US");
    if (!code || knownCodes.has(code)) continue;
    const profileId = normalized(alpha3ToProfileId(code));
    if (!profileId) continue;
    knownCodes.add(code);
    if (exactIds.has(profileId)) continue;
    exactIds.add(profileId);
    ids.push(profileId);
    added += 1;
  }

  return { ids, added };
}

/** Aktarım öncesinde hesapta bulunmayan rotaları kimliğe göre tekilleştirir. */
export function routesAddedByGuestImport<T extends { id: string }>(
  routesAfterImport: T[],
  routeIdsBeforeImport?: Iterable<string>,
) {
  const before = new Set(Array.from(routeIdsBeforeImport || [], normalized).filter(Boolean));
  const selected = new Set<string>();
  const result: T[] = [];
  for (const route of routesAfterImport) {
    const id = normalized(route?.id);
    if (!id || before.has(id) || selected.has(id)) continue;
    selected.add(id);
    result.push(route);
  }
  return result;
}

/**
 * Çok sayıda rotayı sunucuya aynı anda yığmadan eşitler. Her kayıt kendi hata
 * sonucunu üretir; tek bir hata diğer kayıtların eşitlenmesini durdurmaz.
 */
export async function runGuestSyncQueue<T>(
  items: T[],
  idOf: (item: T) => string,
  sync: (item: T) => Promise<unknown>,
  messageForError: (error: unknown) => string,
  concurrency = 3,
): Promise<SyncQueueOutcome[]> {
  if (!items.length) return [];
  const outcomes = new Array<SyncQueueOutcome>(items.length);
  const workerCount = Math.max(1, Math.min(items.length, Math.trunc(concurrency) || 1, 4));
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      let id = `route-${index + 1}`;
      try {
        id = normalized(idOf(item)) || id;
        await sync(item);
        outcomes[index] = { id, ok: true };
      } catch (error) {
        let message = "Eşitleme tamamlanamadı.";
        try { message = messageForError(error) || message; } catch { /* Yapılandırılmış sonuç yine dönsün. */ }
        outcomes[index] = { id, ok: false, error: message };
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return outcomes;
}

export function guestSyncOverallStatus(
  routesSynced: number,
  routesFailed: number,
  profileStatus: "unchanged" | "synced" | "failed",
): GuestSyncOverallStatus {
  const hasFailure = routesFailed > 0 || profileStatus === "failed";
  const hasSuccess = routesSynced > 0 || profileStatus === "synced";
  if (!hasFailure) return hasSuccess ? "synced" : "unchanged";
  return hasSuccess ? "partial" : "failed";
}

/**
 * Bir eşitleme turundan sonra yalnız başarısız veya tur sırasında yeni eklenen
 * işi bırakır. Saf fonksiyon olduğu için ağ/React olmadan yarış senaryoları
 * doğrudan test edilebilir.
 */
export function pendingGuestSyncAfterAttempt(
  pending: PendingGuestSyncState,
  current: PendingGuestSyncState,
  failedRouteIds: Iterable<string>,
  profileFailed: boolean,
  updatedAt = new Date().toISOString(),
): PendingGuestSyncState | null {
  const pendingIds = new Set(pending.routeIds.map(normalized).filter(Boolean));
  const failedIds = Array.from(new Set(Array.from(failedRouteIds, normalized).filter(Boolean)));
  const changedDuringSync = current.revision !== pending.revision;
  const addedDuringSync = changedDuringSync
    ? current.routeIds.map(normalized).filter((id) => id && !pendingIds.has(id))
    : [];
  const routeIds = Array.from(new Set([...failedIds, ...addedDuringSync]));
  const profile = (pending.profile && profileFailed) || (changedDuringSync && current.profile);
  if (!routeIds.length && !profile) return null;
  return {
    routeIds,
    profile,
    revision: current.revision,
    updatedAt,
  };
}
