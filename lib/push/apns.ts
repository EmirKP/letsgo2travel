// APNs (Apple Push Notification service) — token tabanlı (p8/ES256) gönderim.
// Yeni bağımlılık yok: node:crypto ile ES256 JWT, node:http2 ile HTTP/2.
// APNS_PRIVATE_KEY: .p8 dosyasının PEM içeriği (env'de; repoya yazılmaz).

import crypto from "node:crypto";
import http2 from "node:http2";
import type { PushMessage } from "./index";

let cachedJwt: { token: string; issuedAt: number } | null = null;

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function apnsJwt() {
  const teamId = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  const privateKey = process.env.APNS_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKey) return null;

  // Apple, JWT'nin 20-60 dk arasında yenilenmesini ister.
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 45 * 60) return cachedJwt.token;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: now }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto
    .createSign("SHA256")
    .update(unsigned)
    .sign({ key: privateKey.replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" });
  const token = `${unsigned}.${base64url(signature)}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

/**
 * Etkin APNs ortamı. Değer büyük/küçük harf ve boşluk toleranslı okunur:
 * "Production", " production " gibi girişler de production sayılır.
 * ÖNEMLİ: TestFlight/App Store build'leri PRODUCTION token üretir; env
 * sandbox'ta kalırsa Apple BadDeviceToken döner ve push hiç çıkmaz.
 */
export function apnsEnvironment(): "production" | "sandbox" {
  const raw = String(process.env.APNS_ENVIRONMENT || "").trim().toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

export function apnsHost() {
  return apnsEnvironment() === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
}

export type LiveActivityStartPayload = {
  event: "start";
  /** apns-collapse-id (≤64 bayt): aynı trip+event push'u cihazda tekilleşir. */
  collapseId?: string;
  attributes: {
    tripId: string;
    title: string;
    originIata: string;
    destinationIata: string;
    deepLink: string;
    language: string;
  };
  /** Kalkış zamanı (ms epoch). ContentState.departureAt buradan üretilir. */
  departureAtMs: number;
  arrivalAtMs: number;
  alert: { title: string; body: string };
};

export type LiveActivityEndPayload = {
  event: "end";
  collapseId?: string;
  departureAtMs: number;
  arrivalAtMs: number;
};

/**
 * ActivityKit push'u (push-to-start / end). Normal bildirimden farkları:
 * - apns-push-type: liveactivity, topic: <bundle>.push-type.liveactivity
 * - content-state İÇİNDEKİ Date alanları Apple'ın varsayılan Codable
 *   çözücüsüne göre 2001-01-01 REFERANS saniyesi olarak gönderilir.
 * Token değerleri hiçbir log/yanıtta yer almaz.
 */
export async function sendApnsLiveActivity(
  deviceToken: string,
  payload: LiveActivityStartPayload | LiveActivityEndPayload,
): Promise<{ ok: boolean; shouldDisableToken: boolean; reason?: string }> {
  const jwt = apnsJwt();
  const bundleId = process.env.APNS_BUNDLE_ID || "tr.com.letsgo2travel.app";
  if (!jwt) return { ok: false, shouldDisableToken: false, reason: "apns_not_configured" };

  const APPLE_REFERENCE_EPOCH_MS = 978_307_200_000; // 2001-01-01T00:00:00Z
  const nowSeconds = Math.floor(Date.now() / 1000);
  const departureReferenceSeconds = (payload.departureAtMs - APPLE_REFERENCE_EPOCH_MS) / 1000;
  const arrivalReferenceSeconds = (payload.arrivalAtMs - APPLE_REFERENCE_EPOCH_MS) / 1000;
  const aps: Record<string, unknown> = payload.event === "start"
    ? {
      timestamp: nowSeconds,
      event: "start",
      "attributes-type": "FlightActivityAttributes",
      attributes: payload.attributes,
      "content-state": { departureAt: departureReferenceSeconds, arrivalAt: arrivalReferenceSeconds },
      "stale-date": Math.floor((payload.arrivalAtMs + 20 * 60 * 1000) / 1000),
      alert: payload.alert,
    }
    : {
      timestamp: nowSeconds,
      event: "end",
      "content-state": { departureAt: departureReferenceSeconds, arrivalAt: arrivalReferenceSeconds },
      "dismissal-date": nowSeconds,
    };
  const body = JSON.stringify({ aps });

  return new Promise((resolve) => {
    const client = http2.connect(apnsHost());
    const timer = setTimeout(() => {
      try { client.close(); } catch {}
      resolve({ ok: false, shouldDisableToken: false, reason: "apns_timeout" });
    }, 10_000);

    client.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, shouldDisableToken: false, reason: "apns_connection_error" });
    });

    // apns-collapse-id: settle yazılamadan çökme sonrası olası yeniden
    // gönderimde cihazda yinelenen bildirimi tekilleştirir ("en az bir
    // kez" teslimin kullanıcıya yansıyan etkisini azaltır).
    const collapseId = payload.collapseId ? payload.collapseId.slice(0, 64) : "";
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": `${bundleId}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      ...(collapseId ? { "apns-collapse-id": collapseId } : {}),
      "content-type": "application/json",
    });

    let status = 0;
    let responseBody = "";
    req.on("response", (headers) => { status = Number(headers[":status"] || 0); });
    req.on("data", (chunk) => { responseBody += chunk; });
    req.on("end", () => {
      clearTimeout(timer);
      client.close();
      if (status === 200) return resolve({ ok: true, shouldDisableToken: false });
      let reason = `apns_${status}`;
      try {
        const parsed = JSON.parse(responseBody) as { reason?: string };
        if (parsed.reason) reason = `apns_${parsed.reason}`;
      } catch {}
      // Maskeli teşhis: token/secret İÇERMEZ.
      console.error("apns_liveactivity_hatasi", { status, reason, env: apnsEnvironment(), event: payload.event });
      const shouldDisableToken = status === 410 || reason === "apns_BadDeviceToken" || reason === "apns_Unregistered";
      resolve({ ok: false, shouldDisableToken, reason });
    });
    req.on("error", () => {
      clearTimeout(timer);
      client.close();
      resolve({ ok: false, shouldDisableToken: false, reason: "apns_stream_error" });
    });
    req.end(body);
  });
}

export async function sendApnsNotification(
  deviceToken: string,
  message: PushMessage,
): Promise<{ ok: boolean; shouldDisableToken: boolean; reason?: string }> {
  const jwt = apnsJwt();
  const bundleId = process.env.APNS_BUNDLE_ID || "tr.com.letsgo2travel.app";
  if (!jwt) return { ok: false, shouldDisableToken: false, reason: "apns_not_configured" };

  const body = JSON.stringify({
    aps: {
      alert: { title: message.title, body: message.body },
      sound: "default",
    },
    ...(message.data || {}),
  });

  return new Promise((resolve) => {
    const client = http2.connect(apnsHost());
    const timer = setTimeout(() => {
      try { client.close(); } catch {}
      resolve({ ok: false, shouldDisableToken: false, reason: "apns_timeout" });
    }, 10_000);

    client.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, shouldDisableToken: false, reason: "apns_connection_error" });
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let responseBody = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    req.on("data", (chunk) => { responseBody += chunk; });
    req.on("end", () => {
      clearTimeout(timer);
      client.close();
      if (status === 200) return resolve({ ok: true, shouldDisableToken: false });
      let reason = `apns_${status}`;
      try {
        const parsed = JSON.parse(responseBody) as { reason?: string };
        if (parsed.reason) reason = `apns_${parsed.reason}`;
      } catch {}
      // Maskeli teşhis logu: token/secret İÇERMEZ. BadDeviceToken +
      // env=sandbox birlikteliği tipik ortam uyuşmazlığıdır (TestFlight
      // tokeni production'dır).
      console.error("apns_gonderim_hatasi", { status, reason, env: apnsEnvironment() });
      const shouldDisableToken = status === 410 || reason === "apns_BadDeviceToken" || reason === "apns_Unregistered";
      resolve({ ok: false, shouldDisableToken, reason });
    });
    req.on("error", () => {
      clearTimeout(timer);
      client.close();
      resolve({ ok: false, shouldDisableToken: false, reason: "apns_stream_error" });
    });
    req.end(body);
  });
}
