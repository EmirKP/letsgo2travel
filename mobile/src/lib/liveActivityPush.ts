import { ApiError, requestJson } from "./api";
import { addPluginListener, isIOSNative, plugin } from "./capacitor";
import { createTokenSyncEngine, type SyncSendResult, type SyncTokenEntry } from "./liveActivityTokenSync";
import { getInstallationId } from "./storage";

// Live Activity push tokenlarının sunucuya kaydı — GERÇEK bağlantılar.
// Akış mantığı liveActivityTokenSync.ts motorundadır (saf, birim testli):
// - Native gözlemci tamponlar + EN SON push-to-start tokenı kalıcı tutar.
// - Başarılı kayıt native tamponu ack'ler; 503'te ACK EDİLMEZ (migration
//   uygulanınca retry).
// - HER giriş geçişinde (accessToken boş → dolu) en son token GÜNCEL
//   kullanıcı adına yeniden kaydedilir (A logout → B login senaryosu).
// - Token değerleri loglanmaz; kalıcı JS deposuna yazılmaz.

type PluginSurface = {
  ackToken?: (options: { tokenType: string; tripId: string; token: string }) => Promise<void>;
  getLatestPushToStartToken?: () => Promise<{ token?: string }>;
};

let accessTokenGetter: (() => string) | null = null;

function surface(): PluginSurface | undefined {
  return plugin("FlightLiveActivity") as PluginSurface | undefined;
}

async function sendEntry(entry: SyncTokenEntry, accessToken: string, installationId: string): Promise<SyncSendResult> {
  try {
    await requestJson("/api/live-activity/tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        tokenType: entry.tokenType,
        token: entry.token,
        ...(entry.tripId ? { tripId: entry.tripId } : {}),
        ...(installationId ? { installationId } : {}),
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

/** Bekleyen tokenları gönderir. */
export function flushLiveActivityTokens() {
  engine.flush();
}

/**
 * GİRİŞ geçişinde çağrılır (accessToken boş → dolu): native'deki en son
 * push-to-start tokenı GÜNCEL kullanıcı adına yeniden kaydedilir ve
 * bekleyenler gönderilir. Hesap değişiminde (A→B) cihaz tokenının B'ye
 * bağlanmasını sağlayan adım budur.
 */
export function syncTokensAfterLogin() {
  if (!isIOSNative()) return;
  void engine.onLogin();
}

/**
 * ÇIKIŞ temizliği: BU kurulumun (fiziksel cihaz) tüm Live Activity
 * tokenlarını sunucuda kapatır; bekleyen kuyruk temizlenir. Native'deki
 * "en son token" kaydı KORUNUR (sonraki giriş replay eder). Oturum
 * silinmeden ÖNCE çağrılmalıdır; diğer cihazlar (iPad) etkilenmez.
 */
export async function disableLiveActivityTokensForLogout(accessToken: string): Promise<void> {
  engine.onLogout();
  const installationId = getInstallationId();
  if (!accessToken || !installationId) return;
  try {
    await requestJson("/api/live-activity/tokens", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { installationId },
    });
  } catch {
    // Başarısızlık çıkışı ENGELLEMEZ; sunucudaki rotasyon + tek-hesap
    // garantisi (register RPC'si) ikinci savunma hattıdır.
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
  }).then((listener) => {
    if (!listener) return;
    if (!active) { void listener.remove().catch(() => undefined); return; }
    handle = listener;
  });

  return () => {
    active = false;
    void handle?.remove().catch(() => undefined);
  };
}
