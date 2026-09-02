import { isNativePlatform, plugin } from "./capacitor";
import { config } from "./config";
import type {
  FlightAlert,
  PlannerInput,
  RoutePlan,
  VerifiedVisaRule,
  VisaAppointmentNotification,
  TravelVerification,
  WeatherSummary,
} from "../types";

export class ApiError extends Error {
  status: number;
  code: string;
  payload: unknown;
  constructor(message: string, status = 0, code = "", payload: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${config.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function errorMessage(data: unknown, fallback: string) {
  if (typeof data === "string" && data.trim()) return data.trim().slice(0, 300);
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.error_description === "string") return record.error_description;
    if (typeof record.msg === "string") return record.msg;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
    if (record.data && typeof record.data === "object") {
      const nested = record.data as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
    }
  }
  return fallback;
}

function errorCode(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const nested = record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : null;
  const code = record.code ?? nested?.code;
  return typeof code === "string" ? code.slice(0, 100) : "";
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = absoluteUrl(path);
  const method = options.method || "GET";
  const headers = { Accept: "application/json", ...options.headers };
  const timeoutMs = options.timeoutMs ?? 18_000;

  if (isNativePlatform()) {
    const http = plugin("CapacitorHttp");
    if (!http?.request) throw new ApiError("Yerel HTTP köprüsü bulunamadı.");
    const nativeOptions = {
      url,
      method,
      headers: options.body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      data: options.body,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: "json",
    };
    try {
      const response = await http.request(nativeOptions) as { status: number; data: unknown };
      let data = response.data;
      if (typeof data === "string" && data.trim()) {
        try { data = JSON.parse(data); } catch { /* Metin yanıtı olduğu gibi bırak. */ }
      }
      if (response.status < 200 || response.status >= 300) {
        throw new ApiError(errorMessage(data, `Sunucu hatası (${response.status})`), response.status, errorCode(data), data);
      }
      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error instanceof Error ? error.message : "Sunucuya bağlanılamadı.");
    }
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: options.body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) throw new ApiError(errorMessage(data, `Sunucu hatası (${response.status})`), response.status, errorCode(data), data);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("İstek zaman aşımına uğradı. Bağlantını kontrol edip tekrar dene.");
    }
    throw new ApiError(error instanceof Error ? error.message : "Bağlantı kurulamadı.");
  } finally {
    window.clearTimeout(timer);
  }
}

export type CreateAlertInput = {
  originCode: string;
  originLabel: string;
  destinationCode: string;
  destinationLabel: string;
  departureDate: string;
  targetPrice?: number | null;
  notifyEmail: boolean;
  notifyPush: boolean;
};

export async function listAlerts(accessToken: string) {
  const result = await requestJson<{ data: FlightAlert[] }>("/api/flight-alerts", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return Array.isArray(result.data) ? result.data : [];
}

export async function createAlert(input: CreateAlertInput, accessToken: string) {
  return requestJson<{ success: boolean; id?: string; message: string }>("/api/flight-alerts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      originCode: input.originCode,
      originLabel: input.originLabel,
      destinationCode: input.destinationCode,
      destinationLabel: input.destinationLabel,
      departureDate: input.departureDate,
      targetPrice: input.targetPrice || null,
      tripType: "one_way",
      adults: 1,
      cabinClass: "economy",
      notifyEmail: input.notifyEmail,
      notifyPush: input.notifyPush,
      // Tarih doğrulaması kullanıcının KENDİ takvim gününe göre yapılır.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
}

export async function updateAlert(
  id: string,
  body: Partial<{ is_active: boolean; target_price: number | null; notify_email: boolean; notify_push: boolean }>,
  accessToken: string,
) {
  return requestJson<{ success: boolean; message: string }>(`/api/flight-alerts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
}

export async function deleteAlert(id: string, accessToken: string) {
  return requestJson<{ success: boolean; message: string }>(`/api/flight-alerts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function registerPushDevice(params: { platform: string; token: string }, accessToken: string) {
  // Yanit token ICERMEZ; yalniz opak cihaz kayit ID'si (uuid) doner.
  return requestJson<{ success: boolean; deviceId?: string }>("/api/push-devices", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { platform: params.platform, token: params.token },
  });
}

// Girisli kullanicinin YALNIZ kendi cihazlarina, sunucu tarafinda rate
// limit'li test bildirimi gonderir. Yanit token icermez.
export async function sendTestPushNotification(accessToken: string) {
  return requestJson<{ success: boolean; message?: string; error?: string }>("/api/push-devices/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {},
  });
}

// Normal logout yalniz MEVCUT cihazin kayit ID'sini kapatir. { all: true }
// yalniz kullanicinin ACIKCA "tum cihazlarda bildirimleri kapat" islemi
// icin kullanilabilir. Push token'i bu istekte yer almaz.
export async function disablePushDevice(params: { id?: string; all?: boolean }, accessToken: string) {
  return requestJson<{ success: boolean; disabled?: number }>("/api/push-devices", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: params.all ? { all: true } : { id: params.id || "" },
  });
}

export async function requestAccountDeletion(params: {
  accessToken: string;
  name: string;
  email: string;
  username?: string;
}) {
  return requestJson<{ success: boolean; message: string }>("/api/kvkk-requests", {
    method: "POST",
    headers: { Authorization: `Bearer ${params.accessToken}` },
    body: {
      name: params.name,
      email: params.email,
      username: params.username || "",
      requestType: "Hesabımı kapatmak istiyorum",
      description: "Mobil uygulama içinden hesap ve ilişkili kişisel veriler için silme talebi oluşturuldu.",
      confirmed: true,
    },
  });
}



function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 600) : fallback;
}

function cleanScore(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
}

function cleanStringList(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => cleanText(item)).filter(Boolean).slice(0, 14);
  return items.length ? items : fallback;
}

function sanitizeRoutePlan(value: unknown): RoutePlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.routes)) return null;

  const routes = record.routes.slice(0, 3).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const route = item as Record<string, unknown>;
    const name = cleanText(route.name);
    const country = cleanText(route.country);
    if (!name || !country) return [];
    const rawScores = route.scores && typeof route.scores === "object" ? route.scores as Record<string, unknown> : {};
    return [{
      name,
      country,
      cityOrRegion: cleanText(route.cityOrRegion, name),
      destinationCode: /^[A-Z0-9]{3}$/.test(cleanText(route.destinationCode).toUpperCase()) ? cleanText(route.destinationCode).toUpperCase() : undefined,
      why: cleanText(route.why, `${name}, seçtiğin seyahat tercihlerine uygun bir rota.`),
      visaStatus: cleanText(route.visaStatus, "Seyahat öncesi doğrula"),
      visaNote: cleanText(route.visaNote),
      visaSourceUrl: /^https:\/\//i.test(cleanText(route.visaSourceUrl)) ? cleanText(route.visaSourceUrl) : undefined,
      visaVerifiedAt: cleanText(route.visaVerifiedAt) || null,
      verifiedEntryStatus: ["identity_card", "visa_free", "e_visa", "visa_on_arrival", "visa_required", "unknown"].includes(cleanText(route.verifiedEntryStatus))
        ? cleanText(route.verifiedEntryStatus) as import("../types").RouteSuggestion["verifiedEntryStatus"]
        : "unknown",
      estimatedBudget: cleanText(route.estimatedBudget, "Tarihlere göre değişir"),
      idealDuration: cleanText(route.idealDuration, "3–5 gün"),
      bestFor: cleanText(route.bestFor, "Genel keşif"),
      difficulty: cleanText(route.difficulty, "Orta"),
      firstTimeFriendly: typeof route.firstTimeFriendly === "boolean" ? route.firstTimeFriendly : true,
      transportEase: cleanText(route.transportEase, "Orta"),
      safetyNote: cleanText(route.safetyNote, "Güncel yerel uyarıları seyahat öncesinde kontrol et."),
      scores: {
        budget: cleanScore(rawScores.budget, 75),
        visaEase: cleanScore(rawScores.visaEase, 70),
        firstTime: cleanScore(rawScores.firstTime, 75),
        transport: cleanScore(rawScores.transport, 75),
        overall: cleanScore(rawScores.overall, 80 - index * 3),
      },
      dailyPlan: cleanStringList(route.dailyPlan, ["1. Gün: Şehir merkezini ve ana noktaları keşfet."]),
      warnings: cleanStringList(route.warnings),
      cta: route.cta && typeof route.cta === "object" ? {
        guideText: cleanText((route.cta as Record<string, unknown>).guideText),
        forumText: cleanText((route.cta as Record<string, unknown>).forumText),
      } : undefined,
    } satisfies import("../types").RouteSuggestion];
  });

  if (!routes.length) return null;
  return {
    summary: cleanText(record.summary, "Seçimlerine uygun rota seçenekleri hazırlandı."),
    routes,
  };
}

export async function generateRoutePlan(input: PlannerInput) {
  const response = await requestJson<{ success: boolean; data: unknown; isFallback?: boolean }>("/api/ai-plan", {
    method: "POST",
    body: input,
    timeoutMs: 60_000,
  });
  return { ...response, data: sanitizeRoutePlan(response.data) };
}

export async function checkApiHealth() {
  return requestJson<{
    ok: boolean;
    checks: Record<string, boolean>;
    database: string;
    timestamp: string;
  }>("/api/health", { timeoutMs: 10_000 });
}

export async function getVisaEntryRule(country: string, destination = "") {
  const params = new URLSearchParams({ country });
  if (destination) params.set("destination", destination);
  const result = await requestJson<{ data: VerifiedVisaRule }>(`/api/visa-entry-rule?${params.toString()}`, { timeoutMs: 10_000 });
  return result.data;
}

export async function getVisaAppointmentNotifications(accessToken: string) {
  const result = await requestJson<{ notifications?: VisaAppointmentNotification[] }>("/api/visa-appointments", {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: 12_000,
  });
  return Array.isArray(result.notifications) ? result.notifications : [];
}

export async function markVisaAppointmentNotificationRead(id: string, accessToken: string) {
  return requestJson<{ success: boolean }>(`/api/visa-appointments/notifications/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function getTravelVerifications(accessToken: string) {
  const result = await requestJson<{ data?: TravelVerification[] }>("/api/travel-verifications", {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: 12_000,
  });
  return Array.isArray(result.data) ? result.data : [];
}

const WEATHER_CODES: Record<number, string> = {
  0: "Açık",
  1: "Çoğunlukla açık",
  2: "Parçalı bulutlu",
  3: "Kapalı",
  45: "Sisli",
  48: "Kırağılı sis",
  51: "Hafif çisenti",
  53: "Çisenti",
  55: "Yoğun çisenti",
  61: "Hafif yağmur",
  63: "Yağmurlu",
  65: "Kuvvetli yağmur",
  71: "Hafif kar",
  73: "Karlı",
  75: "Yoğun kar",
  80: "Sağanak",
  81: "Kuvvetli sağanak",
  82: "Şiddetli sağanak",
  95: "Gök gürültülü",
  96: "Dolu ihtimali",
  99: "Kuvvetli dolu ihtimali",
};

export async function getWeather(place: string): Promise<WeatherSummary> {
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=tr&format=json`;
  const geo = await requestJson<{ results?: Array<{ name: string; country?: string; latitude: number; longitude: number }> }>(geocodingUrl, { timeoutMs: 12_000 });
  const result = geo.results?.[0];
  if (!result) throw new ApiError("Bu konum için hava durumu bulunamadı.");

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${result.latitude}&longitude=${result.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
  const weather = await requestJson<{
    current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number };
    daily?: { temperature_2m_max: number[]; temperature_2m_min: number[] };
  }>(weatherUrl, { timeoutMs: 12_000 });

  if (!weather.current) throw new ApiError("Hava durumu verisi alınamadı.");
  return {
    place: [result.name, result.country].filter(Boolean).join(", "),
    temperature: Math.round(weather.current.temperature_2m),
    windSpeed: Math.round(weather.current.wind_speed_10m),
    weatherCode: weather.current.weather_code,
    description: WEATHER_CODES[weather.current.weather_code] || "Değişken hava",
    min: Math.round(weather.daily?.temperature_2m_min?.[0] ?? weather.current.temperature_2m),
    max: Math.round(weather.daily?.temperature_2m_max?.[0] ?? weather.current.temperature_2m),
  };
}
