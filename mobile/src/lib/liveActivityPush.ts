import { requestJson } from "./api";
import { addPluginListener, isIOSNative, plugin } from "./capacitor";

// Live Activity push tokenlarının sunucuya kaydı.
// - Token gözlemi NATIVE tarafta, uygulama açılışında başlar
//   (LiveActivityTokenObserver): push-to-start arka plan uyanışında
//   yakalanan token UserDefaults tamponuna yazılır. Plugin, JS hazır
//   olunca tampondaki + yeni token'ları "liveActivityToken" event'iyle
//   iletir; burada Bearer oturumla /api/live-activity/tokens'a kaydedilir
//   ve BAŞARILI kayıt native tampondan ack ile silinir.
// - Token değerleri loglanmaz; JS tarafında yalnız bellekte bekletilir
//   (oturum yokken gelirse girişten sonra flushLiveActivityTokens dener).
// - Her hata sessiz geçilir: kayıt başarısız olsa da uygulama içi
//   başlatma + yerel bildirim fallback'i aynen çalışır.

type PendingToken = {
  tokenType: "push_to_start" | "activity_update";
  token: string;
  tripId?: string;
};

const pendingTokens = new Map<string, PendingToken>();
let accessTokenGetter: (() => string) | null = null;

type AckSurface = {
  ackToken?: (options: { tokenType: string; tripId: string; token: string }) => Promise<void>;
};

async function sendToken(entry: PendingToken, key: string) {
  const accessToken = accessTokenGetter?.() || "";
  if (!accessToken) return; // Giriş yapılınca flush ile tekrar denenir.
  try {
    await requestJson("/api/live-activity/tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { tokenType: entry.tokenType, token: entry.token, ...(entry.tripId ? { tripId: entry.tripId } : {}) },
    });
    pendingTokens.delete(key);
    // Native tampondan da silinir; sonraki açılışta yeniden gönderilmez.
    const surface = plugin("FlightLiveActivity") as AckSurface | undefined;
    await surface?.ackToken?.({
      tokenType: entry.tokenType,
      tripId: entry.tripId || "",
      token: entry.token,
    }).catch(() => undefined);
  } catch {
    // Sessiz: sunucu hazır değilse (503) veya ağ yoksa sonraki flush dener.
  }
}

/** Bekleyen tokenları gönderir (girişten sonra çağrılır). */
export function flushLiveActivityTokens() {
  for (const [key, entry] of pendingTokens) void sendToken(entry, key);
}

function queueToken(entry: PendingToken) {
  if (!entry.token || entry.token.length < 16 || entry.token.length > 512) return;
  const key = `${entry.tokenType}:${entry.tripId || "-"}:${entry.token}`;
  pendingTokens.set(key, entry);
  void sendToken(entry, key);
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
    if (tokenType === "activity_update" && !tripId) return;
    queueToken({ tokenType, token, tripId });
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
