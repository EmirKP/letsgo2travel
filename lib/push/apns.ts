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

export function apnsHost() {
  return process.env.APNS_ENVIRONMENT === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
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
