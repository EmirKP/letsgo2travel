// =====================================================================
// Push bildirim sunucu katmanı (fiyat alarmı hotfix)
// ---------------------------------------------------------------------
// - Harici ücretli servis YOK: iOS için doğrudan APNs (HTTP/2 + ES256 JWT),
//   Android için FCM HTTP v1 (service-account OAuth2). Yeni npm bağımlılığı yok.
// - Secret değerler yalnız env'den okunur; token/anahtar değerleri hiçbir
//   log, hata mesajı veya yanıtta yer almaz.
// - Geçersiz cihaz tokenları (APNs 410/BadDeviceToken, FCM UNREGISTERED)
//   push_devices.enabled=false yapılarak temizlenir.
// - Sağlayıcı yapılandırması PLATFORM BAZLI kontrol edilir: iOS cihaz için
//   APNs, Android cihaz için FCM. Sağlayıcısı yapılandırılmamış platformdaki
//   cihaza gönderim DENENMEZ; bu bir başarısızlık sayılmaz ve cihaz token'ı
//   devre dışı bırakılmaz.
// =====================================================================

import { sendApnsNotification } from "./apns";
import { sendFcmNotification } from "./fcm";
import { classifyPushFailure } from "../price-alerts";

export type PushMessage = {
  title: string;
  body: string;
  /** Bildirime dokunulduğunda uygulamanın açacağı ekran. */
  data?: Record<string, string>;
};

export type PushSendSummary = {
  attempted: number;
  sent: number;
  failed: number;
  disabledTokens: number;
  /**
   * Sağlayıcısı yapılandırılmamış platformdaki cihaz sayısı: gönderim
   * DENENMEDİ, başarısızlık sayılmadı, cihaz devre dışı bırakılmadı.
   */
  skippedUnconfigured: number;
  /** Token değeri içermez; yalnız platform + sınıflandırılmış hata. */
  errors: Array<{ platform: string; reason: string }>;
};

type DeviceRow = {
  id: string;
  platform: "ios" | "android";
  device_token: string;
};

export type PushTransport = (
  device: DeviceRow,
  message: PushMessage,
) => Promise<{ ok: boolean; shouldDisableToken: boolean; reason?: string }>;

export type PushSendOptions = {
  /**
   * Yalnız bu platformlardaki cihazlara gönder. Cron katmanı, sağlayıcı
   * yapılandırmasına göre uygun platform listesini geçirir. Verilmezse ve
   * varsayılan (gerçek) transport kullanılıyorsa, yapılandırılmış
   * platformlara göre otomatik filtrelenir; test transport'larında
   * filtre uygulanmaz.
   */
  platforms?: Array<"ios" | "android">;
  /** Cihaz başına gönderim zaman sınırı (ms). Varsayılan 10 sn. */
  deviceTimeoutMs?: number;
};

/** Cihaz başına gönderim zaman sınırı: tek cihazın takılması diğerlerini bekletmez. */
const DEVICE_SEND_TIMEOUT_MS = 10_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export function isPushConfigured() {
  const apns = Boolean(process.env.APNS_TEAM_ID && process.env.APNS_KEY_ID && process.env.APNS_PRIVATE_KEY);
  const fcm = Boolean(process.env.FCM_SERVICE_ACCOUNT_JSON);
  return { apns, fcm, any: apns || fcm };
}

/** Yapılandırılmış sağlayıcısı olan platformlar (iOS→APNs, Android→FCM). */
export function configuredPushPlatforms(): Array<"ios" | "android"> {
  const cfg = isPushConfigured();
  const platforms: Array<"ios" | "android"> = [];
  if (cfg.apns) platforms.push("ios");
  if (cfg.fcm) platforms.push("android");
  return platforms;
}

async function defaultTransport(device: DeviceRow, message: PushMessage) {
  if (device.platform === "ios") return sendApnsNotification(device.device_token, message);
  return sendFcmNotification(device.device_token, message);
}

/**
 * Kullanıcının aktif cihazlarına push gönderir. Supabase erişimi yalnız
 * service-role client ile yapılmalıdır. `transport` testlerde mock'lanır.
 */
export async function sendPushToUser(
  supabase: {
    from: (table: string) => any;
  },
  userId: string,
  message: PushMessage,
  transport: PushTransport = defaultTransport,
  options?: PushSendOptions,
): Promise<PushSendSummary> {
  const summary: PushSendSummary = { attempted: 0, sent: 0, failed: 0, disabledTokens: 0, skippedUnconfigured: 0, errors: [] };
  if (!userId) return summary;

  // Platform filtresi: iOS için APNs, Android için FCM ayrı ayrı kontrol
  // edilir. Yapılandırılmamış platformdaki cihaz deneme SAYILMAZ ve
  // devre dışı BIRAKILMAZ (geçici sağlayıcı eksikliği token'ı öldürmez).
  let allowedPlatforms: Array<"ios" | "android">;
  if (options?.platforms) {
    allowedPlatforms = options.platforms;
  } else if (transport === defaultTransport) {
    allowedPlatforms = configuredPushPlatforms();
  } else {
    allowedPlatforms = ["ios", "android"];
  }

  const { data: devices, error } = await supabase
    .from("push_devices")
    .select("id, platform, device_token")
    .eq("user_id", userId)
    .eq("enabled", true)
    .limit(10);

  if (error || !devices?.length) {
    if (error) summary.errors.push({ platform: "query", reason: "device_query_failed" });
    return summary;
  }

  const deviceTimeoutMs = options?.deviceTimeoutMs ?? DEVICE_SEND_TIMEOUT_MS;
  const targets: DeviceRow[] = [];
  for (const device of devices as DeviceRow[]) {
    if (!allowedPlatforms.includes(device.platform)) {
      summary.skippedUnconfigured += 1;
      continue;
    }
    targets.push(device);
  }

  // Cihazlara PARALEL gönderim (Promise.allSettled): tek cihazın yavaşlığı
  // veya timeout'u diğer cihazları BEKLETMEZ. Her cihazın kendi zaman
  // sınırı vardır; timeout GEÇİCİ hata sayılır ve token'ı devre dışı
  // BIRAKMAZ.
  await Promise.allSettled(targets.map(async (device) => {
    summary.attempted += 1;
    try {
      const result = await withTimeout(
        Promise.resolve(transport(device, message)),
        deviceTimeoutMs,
      );
      if (result.ok) {
        summary.sent += 1;
        await supabase
          .from("push_devices")
          .update({ last_seen_at: new Date().toISOString(), last_error: null })
          .eq("id", device.id);
      } else {
        summary.failed += 1;
        const reason = result.reason || "unknown";
        summary.errors.push({ platform: device.platform, reason });
        const disable = result.shouldDisableToken || classifyPushFailure(reason).shouldDisableToken;
        await supabase
          .from("push_devices")
          .update({
            enabled: disable ? false : true,
            last_error: reason.slice(0, 200),
            updated_at: new Date().toISOString(),
          })
          .eq("id", device.id);
        if (disable) summary.disabledTokens += 1;
      }
    } catch (err) {
      summary.failed += 1;
      const isTimeout = err instanceof Error && err.message === "timeout";
      summary.errors.push({ platform: device.platform, reason: isTimeout ? "transport_timeout" : "transport_exception" });
    }
  }));

  return summary;
}

/**
 * Kullanıcının push cihaz kayıtlarını kapatır (service-role katmanı).
 * - `deviceId` verilirse YALNIZ o cihaz kapatılır; sorgu HER ZAMAN hem
 *   `id` hem `user_id` ile filtrelenir — başka kullanıcının cihazı bu yolla
 *   asla kapatılamaz (0 satır etkilenir).
 * - `all: true` yalnız kullanıcının AÇIKÇA "tüm cihazlarda kapat" işlemi
 *   için kullanılmalıdır; normal logout tek cihaz kapatır.
 */
export async function disablePushDevices(
  supabase: { from: (table: string) => any },
  params: { userId: string; deviceId?: string | null; all?: boolean },
): Promise<{ ok: boolean; disabled: number }> {
  if (!params.userId) return { ok: false, disabled: 0 };
  if (!params.all && !params.deviceId) return { ok: false, disabled: 0 };

  let query = supabase
    .from("push_devices")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("user_id", params.userId);
  if (!params.all) {
    query = query.eq("id", params.deviceId);
  }
  const { data, error } = await query.select("id");
  if (error) return { ok: false, disabled: 0 };
  return { ok: true, disabled: Array.isArray(data) ? data.length : 0 };
}
