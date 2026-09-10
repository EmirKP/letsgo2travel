import { requestJson } from "./api";

export type AccountDeletionRequest = {
  id: string;
  status: "pending" | "reviewing" | "processed" | "resolved" | "rejected";
  createdAt: string;
  targetCompletionAt: string | null;
  completedAt: string | null;
  notificationStatus: "pending" | "sent" | null;
};

export type AppleDeletionStatus = {
  required: boolean;
  status: "not_required" | "configuration_missing" | "authorization_required" | "ready" | "revoked" | "unavailable";
};

export function deletionConfirmationMatches(value: string, locale: "tr" | "en") {
  return value.trim().toLocaleUpperCase(locale === "tr" ? "tr-TR" : "en-US") === (locale === "tr" ? "SİL" : "DELETE");
}

export function hasPendingDeletion(request: AccountDeletionRequest | null) {
  return request?.status === "pending" || request?.status === "reviewing";
}

export function readDeletionRequest(value: unknown): AccountDeletionRequest | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("deletion_status_unavailable");
  const request = value as Partial<AccountDeletionRequest>;
  if (typeof request.id !== "string" || !request.id || typeof request.createdAt !== "string" || !Number.isFinite(Date.parse(request.createdAt))
    || !["pending", "reviewing", "processed", "resolved", "rejected"].includes(request.status || "")) throw new Error("deletion_status_unavailable");
  return {
    id: request.id,
    status: request.status as AccountDeletionRequest["status"],
    createdAt: request.createdAt,
    targetCompletionAt: typeof request.targetCompletionAt === "string" ? request.targetCompletionAt : null,
    completedAt: typeof request.completedAt === "string" ? request.completedAt : null,
    notificationStatus: request.notificationStatus === "sent" || request.notificationStatus === "pending" ? request.notificationStatus : null,
  };
}

export function validAppleDeletionUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === "https://appleid.apple.com" && url.pathname === "/auth/authorize" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

export async function getAccountDeletionRequest(accessToken: string) {
  const result = await requestJson<{ request: AccountDeletionRequest | null }>("/api/kvkk-requests", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readDeletionRequest(result.request);
}

export async function submitAccountDeletionRequest(accessToken: string, locale: "tr" | "en", confirmation: string) {
  if (!deletionConfirmationMatches(confirmation, locale)) throw new Error("deletion_confirmation_required");
  const result = await requestJson<{ success: boolean; request: AccountDeletionRequest }>("/api/kvkk-requests", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { requestType: "Hesabımı kapatmak istiyorum", confirmed: true, locale },
  });
  if (!result.success || !result.request?.id) throw new Error("deletion_request_not_confirmed");
  const request = readDeletionRequest(result.request);
  if (!request) throw new Error("deletion_request_not_confirmed");
  return request;
}

export async function getAppleDeletionStatus(accessToken: string) {
  return requestJson<AppleDeletionStatus>("/api/account/apple-deletion/status", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function startAppleDeletionAuthorization(accessToken: string) {
  const result = await requestJson<{ ok: boolean; authorizationUrl: string }>("/api/account/apple-deletion/start", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { confirmed: true },
  });
  if (!result.ok || !validAppleDeletionUrl(result.authorizationUrl)) throw new Error("apple_authorization_unavailable");
  return result.authorizationUrl;
}
