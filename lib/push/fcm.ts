// FCM HTTP v1 — service-account (JWT RS256 -> OAuth2 access token) ile gönderim.
// FCM_SERVICE_ACCOUNT_JSON: Firebase service-account JSON içeriği (env'de;
// repoya yazılmaz; yalnız project_id, client_email, private_key alanları okunur).

import crypto from "node:crypto";
import type { PushMessage } from "./index";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed as ServiceAccount;
  } catch {
    return null;
  }
}

async function fcmAccessToken(account: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 120 > now) return cachedAccessToken.token;

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(account.private_key.replace(/\\n/g, "\n"));
  const assertion = `${unsigned}.${base64url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedAccessToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) };
  return data.access_token;
}

export async function sendFcmNotification(
  deviceToken: string,
  message: PushMessage,
): Promise<{ ok: boolean; shouldDisableToken: boolean; reason?: string }> {
  const account = readServiceAccount();
  if (!account) return { ok: false, shouldDisableToken: false, reason: "fcm_not_configured" };

  let accessToken: string | null = null;
  try {
    accessToken = await fcmAccessToken(account);
  } catch {
    return { ok: false, shouldDisableToken: false, reason: "fcm_auth_error" };
  }
  if (!accessToken) return { ok: false, shouldDisableToken: false, reason: "fcm_auth_failed" };

  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title: message.title, body: message.body },
            data: message.data || {},
            android: { priority: "HIGH" },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (response.ok) return { ok: true, shouldDisableToken: false };

    let reason = `fcm_${response.status}`;
    try {
      const parsed = (await response.json()) as { error?: { status?: string; details?: Array<{ errorCode?: string }> } };
      const errorCode = parsed.error?.details?.find((d) => d.errorCode)?.errorCode || parsed.error?.status;
      if (errorCode) reason = `fcm_${errorCode}`;
    } catch {}
    const shouldDisableToken = reason === "fcm_UNREGISTERED" || reason === "fcm_NOT_FOUND" || response.status === 404;
    return { ok: false, shouldDisableToken, reason };
  } catch {
    return { ok: false, shouldDisableToken: false, reason: "fcm_network_error" };
  }
}
