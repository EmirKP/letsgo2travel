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

let accessTokenGetter: (() => string) | null = null;

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
async function drainBufferedTokens() {
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
  } finally {
    retryScheduler.poke();
  }
}

/**
 * GİRİŞ geçişinde çağrılır (accessToken boş → dolu): monoton generation
 * + yeni epoch sunucuda açılır; ardından native tokenlar güncel kullanıcı
 * adına kaydedilir ve tampon drain edilir.
 */
export function syncTokensAfterLogin() {
  if (!isIOSNative()) return;
  void engine.onLogin().finally(() => {
    retryScheduler.poke();
    void drainBufferedTokens();
  });
}

/**
 * ÇIKIŞ temizliği: BU kurulumun (fiziksel cihaz) tüm Live Activity
 * tokenlarını sunucuda kapatır ve generation+epoch'u sonlandırır.
 * Bekleyen kuyruk temizlenir; native'deki "en son token" kaydı KORUNUR.
 * Oturum silinmeden ÖNCE çağrılmalıdır; diğer cihazlar etkilenmez.
 */
export async function disableLiveActivityTokensForLogout(accessToken: string): Promise<void> {
  const sessionEpoch = engine.sessionEpochId();
  const generation = engine.sessionGeneration();
  engine.onLogout();
  retryScheduler.poke();
  const installationId = getInstallationId();
  if (!accessToken || !installationId) return;
  try {
    await requestJson("/api/live-activity/tokens", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { installationId, sessionEpoch, generation },
    });
  } catch {
    // Başarısızlık çıkışı ENGELLEMEZ. Sonraki login'in daha yüksek kalıcı
    // generation'ı, logout/bar kaybolsa bile eski yazımları geçersiz kılar.
  }
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
