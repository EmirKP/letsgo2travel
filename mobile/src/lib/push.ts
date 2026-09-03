import { disablePushDevice, registerPushDevice } from "./api";
import { addPluginListener, isNativePlatform, nativePlatform, plugin } from "./capacitor";
import {
  createPushOperationQueue,
  parsePendingPushDetach,
  resolvedPushPreference,
  shouldReplayPushRegistration,
  type PendingPushDetach,
  type StoredPushPreference,
} from "./pushSession";

// @capacitor/push-notifications köprü yüzeyi (yalnızca kullanılan kısım).
type PushPermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

type PushListenerHandle = { remove: () => Promise<void> };

type PushPluginSurface = {
  checkPermissions?: () => Promise<{ receive?: PushPermissionState }>;
  requestPermissions?: () => Promise<{ receive?: PushPermissionState }>;
  register?: () => Promise<void>;
  unregister?: () => Promise<void>;
  addListener?: (eventName: string, callback: (payload: Record<string, unknown>) => void) => Promise<PushListenerHandle>;
};

export type EnablePushResult = {
  ok: boolean;
  reason?: "unsupported" | "denied" | "no_session" | "error";
};

const REGISTRATION_TIMEOUT_MS = 20_000;

// Cihaz belirteci yalnızca bellekte tutulur; asla kaydedilmez veya loglanmaz.
let lastToken: string | null = null;

// Yerelde YALNIZ opak cihaz kayıt ID'si saklanır (sunucunun döndürdüğü
// rastgele uuid) — push token'ı asla yerel depoya yazılmaz. Logout bu ID
// ile yalnız MEVCUT cihazı kapatır; diğer cihazlar (ör. iPad) etkilenmez.
const DEVICE_ID_STORAGE_KEY = "l2t_push_device_id";
const PUSH_PREFERENCE_STORAGE_KEY = "l2t_push_preference_v1";
const PENDING_DETACH_STORAGE_KEY = "l2t_push_pending_detach_v1";
const enqueuePushOperation = createPushOperationQueue();
const MAX_IN_MEMORY_DETACH_RETRIES = 5;
let detachRetryTimer: number | null = null;
let detachRetryAttempt = 0;

function readStoredDeviceId(): string | null {
  try {
    const value = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    return value && value.length <= 64 ? value : null;
  } catch {
    return null;
  }
}

function storeDeviceId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    else window.localStorage.removeItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    // Depolama yoksa akış bozulmaz; logout'ta sunucu tarafı kapatma atlanır.
  }
}

function readStoredPushPreference(): StoredPushPreference {
  try {
    const value = window.localStorage.getItem(PUSH_PREFERENCE_STORAGE_KEY);
    return value === "enabled" || value === "disabled" ? value : null;
  } catch {
    return null;
  }
}

function storePushPreference(value: Exclude<StoredPushPreference, null>) {
  try {
    window.localStorage.setItem(PUSH_PREFERENCE_STORAGE_KEY, value);
  } catch {
    // Tercih saklanamasa da mevcut oturumdaki işlem tamamlanabilir.
  }
}

function readPendingDetach(): PendingPushDetach | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_DETACH_STORAGE_KEY) || "null");
    const pending = parsePendingPushDetach(parsed);
    if (!pending) window.localStorage.removeItem(PENDING_DETACH_STORAGE_KEY);
    return pending;
  } catch {
    return null;
  }
}

function storePendingDetach(pending: PendingPushDetach | null) {
  try {
    if (pending) window.localStorage.setItem(PENDING_DETACH_STORAGE_KEY, JSON.stringify(pending));
    else window.localStorage.removeItem(PENDING_DETACH_STORAGE_KEY);
  } catch {
    // Native kayıt yine kapatılır; kalıcı tekrar kuyruğu depolama varsa çalışır.
  }
}

function clearPendingDetach(deviceId?: string) {
  const pending = readPendingDetach();
  if (pending && deviceId && pending.deviceId !== deviceId) return;
  storePendingDetach(null);
  if (detachRetryTimer !== null) window.clearTimeout(detachRetryTimer);
  detachRetryTimer = null;
  detachRetryAttempt = 0;
}

function rememberPendingDetach(deviceId: string, ownerId: string) {
  const pending = parsePendingPushDetach({ deviceId, ownerId, createdAt: Date.now() });
  if (pending) storePendingDetach(pending);
}

function schedulePendingDetachRetry(accessToken: string, ownerId: string) {
  if (!accessToken || !ownerId || detachRetryTimer !== null) return;
  if (detachRetryAttempt >= MAX_IN_MEMORY_DETACH_RETRIES) return;
  const delay = Math.min(5_000 * 2 ** detachRetryAttempt, 60_000);
  detachRetryTimer = window.setTimeout(() => {
    detachRetryTimer = null;
    detachRetryAttempt += 1;
    void retryPendingPushDetach(() => accessToken, ownerId).then((ok) => {
      if (!ok) schedulePendingDetachRetry(accessToken, ownerId);
    });
  }, delay);
}

export function isPushEnabledForDevice() {
  return resolvedPushPreference(readStoredPushPreference(), Boolean(readStoredDeviceId())) === "enabled";
}

function pushPlugin(): PushPluginSurface | undefined {
  return plugin("PushNotifications") as PushPluginSurface | undefined;
}

export function isPushAvailable() {
  return isNativePlatform() && Boolean(pushPlugin());
}

export type PushPermissionSummary = "unsupported" | "prompt" | "granted" | "denied";

export async function getPushPermissionState(): Promise<PushPermissionSummary> {
  const push = pushPlugin();
  if (!isNativePlatform() || !push?.checkPermissions) return "unsupported";
  try {
    const status = await push.checkPermissions();
    if (status.receive === "granted") return "granted";
    if (status.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unsupported";
  }
}

async function waitForRegistrationToken(push: PushPluginSurface): Promise<string | null> {
  if (!push.register) return null;
  const handles: { registration: PushListenerHandle | null; error: PushListenerHandle | null } = { registration: null, error: null };
  try {
    let settled = false;
    let finish: (value: string | null) => void = () => undefined;
    const tokenPromise = new Promise<string | null>((resolve) => {
      finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
    });

    // KRITIK SIRA: listener'lar register()'dan ONCE kurulup BEKLENIR.
    // Aksi halde 'registration' olayi listener bağlanmadan ateslenirse
    // token sonsuza dek kacirilir ve akis zaman asimina duser.
    handles.registration = await addPluginListener("PushNotifications", "registration", (payload) => {
      const value = typeof payload.value === "string" ? payload.value : "";
      finish(value || null);
    });
    handles.error = await addPluginListener("PushNotifications", "registrationError", () => {
      // Hata ayrıntısı belirteç içerebileceğinden hiçbir şey loglanmaz.
      finish(null);
    });
    if (!handles.registration) return null;

    const timer = window.setTimeout(() => finish(null), REGISTRATION_TIMEOUT_MS);
    try {
      await Promise.resolve().then(() => push.register?.()).catch(() => finish(null));
      return await tokenPromise;
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return null;
  } finally {
    void handles.registration?.remove().catch(() => undefined);
    void handles.error?.remove().catch(() => undefined);
  }
}

// Kullanıcı açıkça izin verdiğinde çağrılır; uygulama açılışında asla çağrılmaz.
export async function enablePushForUser(getAccessToken: () => string): Promise<EnablePushResult> {
  const push = pushPlugin();
  if (!isNativePlatform() || !push) return { ok: false, reason: "unsupported" };
  const accessToken = getAccessToken();
  if (!accessToken) return { ok: false, reason: "no_session" };

  return enqueuePushOperation(async () => {
    try {
      let permission: PushPermissionState = "prompt";
      if (push.checkPermissions) {
        permission = (await push.checkPermissions()).receive || "prompt";
      }
      if (permission === "prompt" || permission === "prompt-with-rationale") {
        permission = push.requestPermissions
          ? (await push.requestPermissions()).receive || "denied"
          : "denied";
      }
      if (permission !== "granted") return { ok: false, reason: "denied" };

      const token = await waitForRegistrationToken(push);
      if (!token) {
        if (readPendingDetach()) await push.unregister?.().catch(() => undefined);
        return { ok: false, reason: "error" };
      }
      const registered = await registerPushDevice({ platform: nativePlatform(), token }, accessToken);
      if (!registered?.deviceId) {
        if (readPendingDetach()) await push.unregister?.().catch(() => undefined);
        return { ok: false, reason: "error" };
      }
      lastToken = token;
      // Sunucu yalniz OPAK cihaz kayit ID'si dondurur; yerelde token degil
      // yalniz bu ID saklanir (logout'ta tek cihaz kapatmak icin).
      storeDeviceId(registered.deviceId);
      storePushPreference("enabled");
      // Aynı opak ID döndüyse upsert eski token sahipliğini atomik devretmiştir.
      // Token rotasyonunda farklı ID dönebilir; eski kayıt kuyruğu korunur.
      clearPendingDetach(registered.deviceId);
      return { ok: true };
    } catch {
      if (readPendingDetach()) await push.unregister?.().catch(() => undefined);
      return { ok: false, reason: "error" };
    }
  });
}

// İzin daha önce açık bırakıldıysa, hesap girişi sırasında kullanıcıya tekrar
// izin penceresi göstermeden mevcut APNs/FCM tokenını yeni hesaba bağlar.
// POST sunucuda unique(platform, device_token) upsert olduğu için sahiplik
// eski hesaptan yeni hesaba atomik geçer.
export async function syncPushAfterLogin(getAccessToken: () => string): Promise<boolean> {
  const push = pushPlugin();
  const accessToken = getAccessToken();
  if (!isNativePlatform() || !push || !accessToken) return false;

  return enqueuePushOperation(async () => {
    try {
      const permission = push.checkPermissions
        ? (await push.checkPermissions()).receive || "prompt"
        : "prompt";
      if (!shouldReplayPushRegistration(
        readStoredPushPreference(),
        Boolean(readStoredDeviceId()),
        permission,
      )) return false;

      const token = lastToken || await waitForRegistrationToken(push);
      if (!token) {
        if (readPendingDetach()) await push.unregister?.().catch(() => undefined);
        return false;
      }
      const registered = await registerPushDevice({ platform: nativePlatform(), token }, accessToken);
      if (!registered?.deviceId) {
        // Önceki logout sunucu temizliği bekliyorsa native kaydı açık bırakmak,
        // yeni hesap daha bağlanmadan eski hesaba bildirim sızdırabilir.
        if (readPendingDetach()) await push.unregister?.().catch(() => undefined);
        return false;
      }
      lastToken = token;
      storeDeviceId(registered.deviceId);
      storePushPreference("enabled");
      clearPendingDetach(registered.deviceId);
      return true;
    } catch {
      if (readPendingDetach()) {
        await push.unregister?.().catch(() => undefined);
        lastToken = null;
      }
      return false;
    }
  });
}

/**
 * Önceki logout/kapama isteği ağ yüzünden tamamlanamadıysa, aynı kullanıcı
 * yeniden giriş yaptığında opak cihaz kaydını tekrar kapatır. Farklı hesabın
 * bearer tokenıyla istek gönderilmez; başarılı token upsert'i kuyruğu ayrıca
 * temizler. Kalıcı kayıtta push veya erişim tokenı bulunmaz.
 */
export async function retryPendingPushDetach(
  getAccessToken: () => string,
  ownerId: string,
): Promise<boolean> {
  const pending = readPendingDetach();
  if (!pending) return true;
  const accessToken = getAccessToken();
  if (!accessToken || !ownerId || pending.ownerId !== ownerId) return false;
  return enqueuePushOperation(async () => {
    const current = readPendingDetach();
    if (!current) return true;
    if (current.ownerId !== ownerId) return false;
    try {
      await disablePushDevice({ id: current.deviceId }, accessToken);
      clearPendingDetach(current.deviceId);
      return true;
    } catch {
      return false;
    }
  });
}

export function hasPendingPushDetach() {
  return Boolean(readPendingDetach());
}

// YALNIZ MEVCUT cihazın sunucu kaydını kapatır (opak cihaz ID'siyle);
// kullanıcının diğer cihazları (ör. iPad/Android) etkilenmez. Hata
// durumunda sessizce false döner. Yerel cihaz ID'si her durumda temizlenir.
export async function disablePush(getAccessToken: () => string, ownerId = ""): Promise<boolean> {
  const accessToken = getAccessToken();
  const initialDeviceId = readStoredDeviceId();
  // Kuyrukta eski bir kayıt isteği olsa bile kullanıcı tercihi hemen kapanır.
  storePushPreference("disabled");
  storeDeviceId(null);

  return enqueuePushOperation(async () => {
    let serverDisabled = false;
    // Daha önce başlayan kayıt isteği kuyrukta tamamlanıp yeni ID yazdıysa
    // onu da yakala; bu işlem kuyrukta kayıttan sonra çalışır.
    const deviceId = initialDeviceId || readStoredDeviceId();
    if (deviceId && ownerId) rememberPendingDetach(deviceId, ownerId);
    storePushPreference("disabled");
    storeDeviceId(null);
    try {
      if (accessToken && deviceId) {
        await disablePushDevice({ id: deviceId }, accessToken);
        serverDisabled = true;
        clearPendingDetach(deviceId);
      }
    } catch {
      serverDisabled = false;
    }
    try {
      await pushPlugin()?.unregister?.();
    } catch {
      // Yerel kayıt kapatılamasa da akış devam eder.
    }
    lastToken = null;
    if (!serverDisabled && accessToken && ownerId) schedulePendingDetachRetry(accessToken, ownerId);
    return serverDisabled;
  });
}

// Logout bir bildirim tercihi değişikliği değildir. Eski hesabın sunucu
// sahipliğini kapatır ama OS iznini, native kaydı ve kullanıcının tercihini
// korur; böylece sonraki hesap aynı cihaz tokenını otomatik replay eder.
export async function detachPushForLogout(getAccessToken: () => string, ownerId = ""): Promise<boolean> {
  const accessToken = getAccessToken();
  const initialDeviceId = readStoredDeviceId();
  if (isPushEnabledForDevice()) storePushPreference("enabled");
  storeDeviceId(null);

  return enqueuePushOperation(async () => {
    const deviceId = initialDeviceId || readStoredDeviceId();
    if (deviceId && ownerId) rememberPendingDetach(deviceId, ownerId);
    storeDeviceId(null);
    if (!accessToken || !deviceId) {
      // Sunucu sahipliği doğrulanamıyorsa cihazı native tarafta kapat; eski
      // hesaba bildirim gösterilmez. Tercih korunur ve sonraki girişte replay olur.
      await pushPlugin()?.unregister?.().catch(() => undefined);
      lastToken = null;
      const pending = readPendingDetach();
      if (pending && pending.ownerId === ownerId) schedulePendingDetachRetry(accessToken, ownerId);
      return false;
    }
    try {
      await disablePushDevice({ id: deviceId }, accessToken);
      clearPendingDetach(deviceId);
      return true;
    } catch {
      await pushPlugin()?.unregister?.().catch(() => undefined);
      lastToken = null;
      if (ownerId) schedulePendingDetachRetry(accessToken, ownerId);
      return false;
    }
  });
}

export function hasInMemoryPushToken() {
  return Boolean(lastToken);
}

// Bildirime dokunulduğunda "Fiyat Alarmlarım" ekranını açar. Web'de sessiz no-op.
export function initPushTapListener(onOpenAlerts: () => void): () => void {
  let listener: PushListenerHandle | null = null;
  let active = true;
  if (isNativePlatform()) {
    void addPluginListener("PushNotifications", "pushNotificationActionPerformed", (payload) => {
      const notification = payload.notification && typeof payload.notification === "object"
        ? payload.notification as { data?: Record<string, unknown> }
        : null;
      const screen = typeof notification?.data?.screen === "string" ? notification.data.screen : "";
      if (!screen || screen === "price-alerts") onOpenAlerts();
    }).then((handle) => {
      if (!active) {
        void handle?.remove().catch(() => undefined);
        return;
      }
      listener = handle;
    });
  }
  return () => {
    active = false;
    void listener?.remove().catch(() => undefined);
  };
}
