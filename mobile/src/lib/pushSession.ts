export type StoredPushPreference = "enabled" | "disabled" | null;
export type PushPermissionForReplay = "prompt" | "prompt-with-rationale" | "granted" | "denied";

export type PendingPushDetach = {
  deviceId: string;
  ownerId: string;
  createdAt: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Logout temizliği için yalnız opak kayıt ve kullanıcı kimliği saklanır.
 * APNs/FCM belirteci veya bearer token hiçbir zaman kalıcı depoya girmez.
 */
export function parsePendingPushDetach(value: unknown): PendingPushDetach | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PendingPushDetach>;
  if (!UUID.test(String(candidate.deviceId || ""))) return null;
  if (!UUID.test(String(candidate.ownerId || ""))) return null;
  if (!Number.isFinite(candidate.createdAt) || Number(candidate.createdAt) <= 0) return null;
  return {
    deviceId: String(candidate.deviceId),
    ownerId: String(candidate.ownerId),
    createdAt: Number(candidate.createdAt),
  };
}

export function resolvedPushPreference(
  storedPreference: StoredPushPreference,
  hasLegacyDeviceId: boolean,
): Exclude<StoredPushPreference, null> {
  if (storedPreference) return storedPreference;
  return hasLegacyDeviceId ? "enabled" : "disabled";
}

export function shouldReplayPushRegistration(
  storedPreference: StoredPushPreference,
  hasLegacyDeviceId: boolean,
  permission: PushPermissionForReplay,
) {
  return permission === "granted"
    && resolvedPushPreference(storedPreference, hasLegacyDeviceId) === "enabled";
}

// Hesap A kaydı, çıkış kapatması ve hesap B replay'i aynı cihazda mutlaka
// çağrı sırasıyla tamamlanır. Böylece A'nın gecikmiş POST'u B'nin daha yeni
// cihaz sahipliğini sonradan geri alamaz. Hatalı bir iş kuyruğu kilitlemez.
export function createPushOperationQueue() {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
