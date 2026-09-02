import { requestJson } from "./api";
import { addPluginListener, isIOSNative } from "./capacitor";

// Live Activity push tokenlarının sunucuya kaydı.
// - Native eklenti "pushToStartToken" (iOS 17.2+) ve "activityUpdateToken"
//   event'leriyle token verir; burada Bearer oturumla /api/live-activity/
//   tokens'a kaydedilir. Böylece cron, uygulama KAPALIYKEN aktiviteyi
//   başlatabilir ve kalkış sonrası bitirebilir.
// - Token değerleri ASLA loglanmaz ve yerel kalıcı depoya yazılmaz;
//   yalnız bellekte bekletilir (oturum yokken gelirse, giriş sonrası
//   flushLiveActivityTokens ile gönderilir).
// - Her hata sessiz geçilir: kayıt başarısız olsa da uygulama içi
//   başlatma + yerel bildirim fallback'i aynen çalışır.

type PendingToken = {
  tokenType: "push_to_start" | "activity_update";
  token: string;
  tripId?: string;
};

const pendingTokens = new Map<string, PendingToken>();
let accessTokenGetter: (() => string) | null = null;

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
 * Token event dinleyicilerini kurar. accessToken bir getter'dır: oturum
 * değiştiğinde yeniden init gerekmez, gönderim anında güncel değer okunur.
 */
export function initLiveActivityTokenSync(getAccessToken: () => string): () => void {
  accessTokenGetter = getAccessToken;
  if (!isIOSNative()) return () => undefined;

  let active = true;
  const handles: Array<{ remove: () => Promise<void> }> = [];
  const listen = (event: string, map: (payload: Record<string, unknown>) => PendingToken | null) => {
    void addPluginListener("FlightLiveActivity", event, (payload) => {
      const entry = map(payload);
      if (entry) queueToken(entry);
    }).then((handle) => {
      if (!handle) return;
      if (!active) { void handle.remove().catch(() => undefined); return; }
      handles.push(handle);
    });
  };

  listen("pushToStartToken", (payload) => {
    const token = typeof payload.token === "string" ? payload.token : "";
    return token ? { tokenType: "push_to_start", token } : null;
  });
  listen("activityUpdateToken", (payload) => {
    const token = typeof payload.token === "string" ? payload.token : "";
    const tripId = typeof payload.tripId === "string" ? payload.tripId : "";
    return token && tripId ? { tokenType: "activity_update", token, tripId } : null;
  });

  return () => {
    active = false;
    for (const handle of handles) void handle.remove().catch(() => undefined);
  };
}
