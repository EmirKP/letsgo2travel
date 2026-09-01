import { disablePushDevice, registerPushDevice } from "./api";
import { addPluginListener, isNativePlatform, nativePlatform, plugin } from "./capacitor";

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
    const token = await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      };
      const timer = window.setTimeout(() => finish(null), REGISTRATION_TIMEOUT_MS);

      void addPluginListener("PushNotifications", "registration", (payload) => {
        const value = typeof payload.value === "string" ? payload.value : "";
        finish(value || null);
      }).then((handle) => { handles.registration = handle; });

      void addPluginListener("PushNotifications", "registrationError", () => {
        // Hata ayrıntısı belirteç içerebileceğinden hiçbir şey loglanmaz.
        finish(null);
      }).then((handle) => { handles.error = handle; });

      void Promise.resolve()
        .then(() => push.register?.())
        .catch(() => finish(null));
    });
    return token;
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
    if (!token) return { ok: false, reason: "error" };
    lastToken = token;

    const accessToken = getAccessToken();
    if (!accessToken) return { ok: false, reason: "no_session" };
    const registered = await registerPushDevice({ platform: nativePlatform(), token }, accessToken);
    // Sunucu yalniz OPAK cihaz kayit ID'si dondurur; yerelde token degil
    // yalniz bu ID saklanir (logout'ta tek cihaz kapatmak icin).
    storeDeviceId(registered?.deviceId || null);
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// YALNIZ MEVCUT cihazın sunucu kaydını kapatır (opak cihaz ID'siyle);
// kullanıcının diğer cihazları (ör. iPad/Android) etkilenmez. Hata
// durumunda sessizce false döner. Yerel cihaz ID'si her durumda temizlenir.
export async function disablePush(getAccessToken: () => string): Promise<boolean> {
  let serverDisabled = false;
  const deviceId = readStoredDeviceId();
  try {
    const accessToken = getAccessToken();
    if (accessToken && deviceId) {
      await disablePushDevice({ id: deviceId }, accessToken);
      serverDisabled = true;
    }
  } catch {
    serverDisabled = false;
  }
  try {
    await pushPlugin()?.unregister?.();
  } catch {
    // Yerel kayıt kapatılamasa da akış devam eder.
  }
  storeDeviceId(null);
  lastToken = null;
  return serverDisabled;
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
