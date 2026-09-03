import { ApiError, requestJson } from "./api";
import { addPluginListener, isIOSNative, plugin } from "./capacitor";
import { createId } from "./id";
import {
  createRetryScheduler,
  createTokenSyncEngine,
  type SyncSendResult,
  type SyncTokenEntry,
} from "./liveActivityTokenSync";
import { getInstallationId, nextLiveActivitySessionGeneration } from "./storage";

// Live Activity push tokenlarının sunucuya kaydı — GERÇEK bağlantılar.
// Akış mantığı liveActivityTokenSync.ts motorundadır (saf, birim testli):
// - Native gözlemci tamponlar + EN SON push-to-start tokenı kalıcı tutar.
// - Başarılı kayıt native tamponu ack'ler; 503'te ACK EDİLMEZ.
// - HER giriş kalıcı monoton generation + yeni epoch açar ve önce sunucu
//   session'ını etkinleştirir. Logout isteği kaybolsa bile sonraki login
//   eski hesabın gecikmiş kayıtlarını sunucuda 409 ile reddettirir.
// - Bekleyen kayıtlar ağ dönüşü / foreground / sınırlı geri çekilme ile
//   yeniden denenir; scheduler lifecycle-generation'lıdır (cleanup sonrası
//   geç callback yeni timer KURAMAZ).
// - Token değerleri loglanmaz; kalıcı JS deposuna yazılmaz.

type PluginSurface = {
  ackToken?: (options: { tokenType: string; tripId: string; token: string }) => Promise<void>;
  getLatestPushToStartToken?: () => Promise<{ token?: string }>;
  getBufferedTokens?: () => Promise<{ tokens?: Array<Record<string, string>> }>;
};

type PendingLiveActivityLogout = {
  installationId: string;
  sessionEpoch: string;
  generation: number;
  ownerId: string;
  createdAt: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PENDING_LOGOUT_KEY = "l2t_live_activity_pending_logout_v1";
const MAX_LOGOUT_RETRIES = 5;
let logoutRetryTimer: number | null = null;
let logoutRetryAttempt = 0;

let accessTokenGetter: (() => string) | null = null;
let loginSessionActive = false;
let loginSessionOwner = "";
let loginLifecycleGeneration = 0;

function parsePendingLogout(value: unknown): PendingLiveActivityLogout | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PendingLiveActivityLogout>;
  if (!UUID.test(String(candidate.installationId || ""))) return null;
  if (!UUID.test(String(candidate.sessionEpoch || ""))) return null;
  if (!UUID.test(String(candidate.ownerId || ""))) return null;
  if (!Number.isInteger(candidate.generation) || Number(candidate.generation) < 1) return null;
  if (!Number.isFinite(candidate.createdAt) || Number(candidate.createdAt) <= 0) return null;
  return {
    installationId: String(candidate.installationId),
    sessionEpoch: String(candidate.sessionEpoch),
    generation: Number(candidate.generation),
    ownerId: String(candidate.ownerId),
    createdAt: Number(candidate.createdAt),
  };
}

function readPendingLogout(): PendingLiveActivityLogout | null {
  try {
    const pending = parsePendingLogout(JSON.parse(window.localStorage.getItem(PENDING_LOGOUT_KEY) || "null"));
    if (!pending) window.localStorage.removeItem(PENDING_LOGOUT_KEY);
    return pending;
  } catch {
    return null;
  }
}

function savePendingLogout(value: PendingLiveActivityLogout | null) {
  try {
    if (value) window.localStorage.setItem(PENDING_LOGOUT_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(PENDING_LOGOUT_KEY);
  } catch {
    // Sunucu generation fencing'i depolama hatasında da hesap sızıntısını keser.
  }
}

function clearPendingLogout(expected?: PendingLiveActivityLogout) {
  const pending = readPendingLogout();
  if (!pending || !expected || (
    pending.installationId === expected.installationId
    && pending.sessionEpoch === expected.sessionEpoch
    && pending.generation === expected.generation
  )) savePendingLogout(null);
  if (logoutRetryTimer !== null) window.clearTimeout(logoutRetryTimer);
  logoutRetryTimer = null;
  logoutRetryAttempt = 0;
}

async function sendPendingLogout(pending: PendingLiveActivityLogout, accessToken: string) {
  try {
    await requestJson("/api/live-activity/tokens", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        installationId: pending.installationId,
        sessionEpoch: pending.sessionEpoch,
        generation: pending.generation,
      },
    });
    clearPendingLogout(pending);
    return true;
  } catch {
    return false;
  }
}

function schedulePendingLogoutRetry(pending: PendingLiveActivityLogout, accessToken: string) {
  if (!accessToken || logoutRetryTimer !== null || logoutRetryAttempt >= MAX_LOGOUT_RETRIES) return;
  const delay = Math.min(5_000 * 2 ** logoutRetryAttempt, 60_000);
  logoutRetryTimer = window.setTimeout(() => {
    logoutRetryTimer = null;
    logoutRetryAttempt += 1;
    void sendPendingLogout(pending, accessToken).then((ok) => {
      if (!ok) schedulePendingLogoutRetry(pending, accessToken);
    });
  }, delay);
}

function surface(): PluginSurface | undefined {
  return plugin("FlightLiveActivity") as PluginSurface | undefined;
}

async function beginSession(accessToken: string, installationId: string, sessionEpochId: string, generation: number): Promise<SyncSendResult> {
  try {
    await requestJson("/api/live-activity/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { installationId, sessionEpoch: sessionEpochId, generation },
    });
    const pending = readPendingLogout();
    // Daha yüksek generation atomik olarak kurulumun bütün eski tokenlarını
    // kapatır; eski DELETE ulaşmamış olsa dahi kalıcı temizlik tamamlanmıştır.
    if (pending && pending.installationId === installationId && generation > pending.generation) {
      clearPendingLogout(pending);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, status: error instanceof ApiError ? error.status : 0 };
  }
}

async function sendEntry(entry: SyncTokenEntry, accessToken: string, installationId: string, sessionEpochId: string, generation: number): Promise<SyncSendResult> {
  try {
    await requestJson("/api/live-activity/tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        tokenType: entry.tokenType,
        token: entry.token,
        ...(entry.tripId ? { tripId: entry.tripId } : {}),
        installationId,
        sessionEpoch: sessionEpochId,
        generation,
      },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, status: error instanceof ApiError ? error.status : 0 };
  }
}

const engine = createTokenSyncEngine({
  getAccessToken: () => accessTokenGetter?.() || "",
  getInstallationId: () => getInstallationId(),
  makeEpochId: () => createId(),
  nextGeneration: () => nextLiveActivitySessionGeneration(),
  beginSession,
  send: sendEntry,
  ack: async (entry) => {
    await surface()?.ackToken?.({
      tokenType: entry.tokenType,
      tripId: entry.tripId || "",
      token: entry.token,
    }).catch(() => undefined);
  },
  getLatestPushToStartToken: async () => {
    const result = await surface()?.getLatestPushToStartToken?.();
    return typeof result?.token === "string" ? result.token : "";
  },
});

// Retry zamanlayıcısı: tek timer, sınırlı geri çekilme, lifecycle
// generation'lı (stop sonrası geç callback yeni timer kuramaz).
const retryScheduler = createRetryScheduler({
  pendingCount: () => engine.pendingCount(),
  flush: () => engine.flush(),
});

/** Bekleyen tokenları gönderir ve gerekiyorsa geri çekilmeli retry kurar. */
export function flushLiveActivityTokens() {
  engine.flush();
  retryScheduler.poke();
}

/**
 * Bekleyen token kayıtlarının uygulama yeniden başlatılmadan denenmesini
 * sağlar: ağ bağlantısı geri geldiğinde ve uygulama öne (foreground)
 * geldiğinde flush + sınırlı geri çekilmeli zamanlayıcı. Not: paralel
 * aynı-token POST'u motorun in-flight dedup'ı engeller.
 */
export function initLiveActivityRetry(): () => void {
  if (!isIOSNative()) return () => undefined;
  let active = true;
  const handles: Array<{ remove: () => Promise<void> }> = [];
  const keep = (promise: Promise<{ remove: () => Promise<void> } | null>) => {
    void promise.then((handle) => {
      if (!handle) return;
      if (!active) { void handle.remove().catch(() => undefined); return; }
      handles.push(handle);
    });
  };
  keep(addPluginListener("Network", "networkStatusChange", (payload) => {
    if (payload.connected === true) flushLiveActivityTokens();
  }));
  keep(addPluginListener("App", "appStateChange", (payload) => {
    if (payload.isActive === true) flushLiveActivityTokens();
  }));
  return () => {
    active = false;
    retryScheduler.stop();
    for (const handle of handles) void handle.remove().catch(() => undefined);
  };
}

/**
 * Native tamponda birikmiş TÜM token girişlerini sync motoruna sıralar
 * (pull/replay yolu): listener kurulmadan gelen activity_update / PTS
 * event'leri kaybolmaz. Tekrarlar tokenType+tripId+token anahtarıyla ve
 * in-flight dedup ile idempotenttir; girişler yalnız sunucu başarısında
 * ack ile silinir.
 */
async function drainBufferedTokens(): Promise<boolean> {
  let bufferRead = true;
  try {
    const result = await surface()?.getBufferedTokens?.();
    for (const raw of result?.tokens || []) {
      const tokenType = raw.tokenType === "activity_update" ? "activity_update" : raw.tokenType === "push_to_start" ? "push_to_start" : null;
      const token = typeof raw.token === "string" ? raw.token : "";
      const tripId = typeof raw.tripId === "string" && raw.tripId ? raw.tripId : undefined;
      if (!tokenType || !token) continue;
      if (tokenType === "activity_update" && !tripId) continue;
      engine.queue({ tokenType, token, ...(tripId ? { tripId } : {}) });
    }
  } catch {
    // Yüzey yoksa sessiz; retained event'ler ikinci güvence olarak kalır.
    bufferRead = false;
  } finally {
    retryScheduler.poke();
  }
  const synced = await engine.flushAndWait();
  return bufferRead && synced;
}

/**
 * GİRİŞ geçişinde çağrılır (accessToken boş → dolu): monoton generation
 * + yeni epoch sunucuda açılır; ardından native tokenlar güncel kullanıcı
 * adına kaydedilir ve tampon drain edilir.
 */
export async function syncTokensAfterLogin(ownerId = ""): Promise<boolean> {
  if (!isIOSNative()) return false;
  const pending = readPendingLogout();
  const accessToken = accessTokenGetter?.() || "";
  // Aynı hesap yeniden girdiyse eski DELETE'i de dene. Farklı hesapta yeni
  // generation zaten atomik fencing yapar; yanlış bearer ile DELETE atılmaz.
  if (pending && pending.ownerId === ownerId && accessToken) {
    void sendPendingLogout(pending, accessToken);
  }
  if (!loginSessionActive || loginSessionOwner !== ownerId) {
    // Aynı oturumdaki ağ/foreground retry'ı generation artırmaz. Yeni hesap
    // veya gerçek logout sonrası ise mutlaka yeni sunucu kuşağı açılır.
    loginSessionActive = true;
    loginSessionOwner = ownerId;
    loginLifecycleGeneration += 1;
    const lifecycle = loginLifecycleGeneration;
    await engine.onLogin();
    if (lifecycle !== loginLifecycleGeneration) return false;
  } else {
    const lifecycle = loginLifecycleGeneration;
    await engine.flushAndWait();
    if (lifecycle !== loginLifecycleGeneration) return false;
  }
  const lifecycle = loginLifecycleGeneration;
  retryScheduler.poke();
  const synced = await drainBufferedTokens();
  return synced && loginSessionActive && lifecycle === loginLifecycleGeneration;
}

/**
 * ÇIKIŞ temizliği: BU kurulumun (fiziksel cihaz) tüm Live Activity
 * tokenlarını sunucuda kapatır ve generation+epoch'u sonlandırır.
 * Bekleyen kuyruk temizlenir; native'deki "en son token" kaydı KORUNUR.
 * Oturum silinmeden ÖNCE çağrılmalıdır; diğer cihazlar etkilenmez.
 */
export async function disableLiveActivityTokensForLogout(accessToken: string, ownerId = ""): Promise<boolean> {
  const sessionEpoch = engine.sessionEpochId();
  const generation = engine.sessionGeneration();
  const installationId = getInstallationId();
  const pending = parsePendingLogout({
    installationId,
    sessionEpoch,
    generation,
    ownerId,
    createdAt: Date.now(),
  });
  if (pending) savePendingLogout(pending);
  loginLifecycleGeneration += 1;
  loginSessionActive = false;
  loginSessionOwner = "";
  engine.onLogout();
  retryScheduler.poke();
  if (!accessToken || !pending) return false;
  const success = await sendPendingLogout(pending, accessToken);
  if (!success) {
    // Kalıcı kayıt yalnız opak oturum kimliklerini taşır. Bearer yalnız kısa
    // ömürlü bellek retry'ında tutulur; sonraki login generation'ı son emniyettir.
    schedulePendingLogoutRetry(pending, accessToken);
  }
  return success;
}

/**
 * Token event dinleyicisini kurar. accessToken bir getter'dır: oturum
 * değiştiğinde yeniden init gerekmez, gönderim anında güncel değer okunur.
 */
export function initLiveActivityTokenSync(getAccessToken: () => string): () => void {
  accessTokenGetter = getAccessToken;
  if (!isIOSNative()) return () => undefined;

  let active = true;
  let handle: { remove: () => Promise<void> } | null = null;
  void addPluginListener("FlightLiveActivity", "liveActivityToken", (payload) => {
    const tokenType = payload.tokenType === "activity_update" ? "activity_update" : payload.tokenType === "push_to_start" ? "push_to_start" : null;
    const token = typeof payload.token === "string" ? payload.token : "";
    const tripId = typeof payload.tripId === "string" && payload.tripId ? payload.tripId : undefined;
    if (!tokenType || !token) return;
    engine.queue({ tokenType, token, ...(tripId ? { tripId } : {}) });
    retryScheduler.poke();
  }).then((listener) => {
    if (!listener) return;
    if (!active) { void listener.remove().catch(() => undefined); return; }
    handle = listener;
    // Listener BAŞARIYLA kurulduktan sonra tampon çekilir: listener'dan
    // önce gelen PTS + activity_update token'ları da kaydedilir.
    void drainBufferedTokens();
  });

  return () => {
    active = false;
    void handle?.remove().catch(() => undefined);
  };
}
