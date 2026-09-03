import { requestJson } from "./api";

export type MobileAdminOverview = {
  role: "super_admin";
  generatedAt: string;
  unavailableCount: number;
  stats: {
    profiles: number;
    pendingVerifications: number;
    pendingTopics: number;
    pendingReplies: number;
    openReports: number;
    activeVisaTracks: number;
    activePriceAlerts: number;
    pendingKvkk: number;
    pendingObjections: number;
  };
  pendingVerifications: Array<{ id: string; countryCode: string; countryName: string; createdAt: string }>;
  pendingTopics: Array<{ id: string; title: string; authorName: string; createdAt: string }>;
  pendingReplies: Array<{ id: string; body: string; authorName: string; topicTitle: string; createdAt: string }>;
  openReports: Array<{ id: string; targetType: string; reason: string; createdAt: string }>;
};

export type MobileAdminAccess = {
  allowed: boolean;
  role: "super_admin" | null;
};

function adminHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function getMobileAdminAccess(accessToken: string) {
  const result = await requestJson<{ data?: MobileAdminAccess }>("/api/admin/mobile-access", {
    headers: adminHeaders(accessToken),
    timeoutMs: 8_000,
  });
  return result.data?.allowed === true && result.data.role === "super_admin"
    ? { allowed: true, role: "super_admin" } as const
    : { allowed: false, role: null } as const;
}

export async function getMobileAdminOverview(accessToken: string) {
  const result = await requestJson<{ data?: MobileAdminOverview }>("/api/admin/mobile-overview", {
    headers: adminHeaders(accessToken),
    timeoutMs: 15_000,
  });
  if (!result.data) throw new Error("Yönetim özeti alınamadı.");
  return result.data;
}

export async function moderateForumItem(
  kind: "topics" | "replies",
  id: string,
  status: "published" | "rejected",
  accessToken: string,
) {
  return requestJson<{ success: boolean }>(`/api/admin/forum/${kind}`, {
    method: "PATCH",
    headers: adminHeaders(accessToken),
    body: { id, status },
  });
}

export async function closeForumReport(
  id: string,
  status: "resolved" | "dismissed",
  accessToken: string,
) {
  return requestJson<{ success: boolean }>("/api/admin/forum/reports", {
    method: "PATCH",
    headers: adminHeaders(accessToken),
    body: { id, status },
  });
}

export async function getVerificationEvidence(id: string, accessToken: string) {
  return requestJson<{ signedUrl: string; evidenceType?: string | null }>(`/api/admin/travel-verifications/${encodeURIComponent(id)}/signed-url`, {
    headers: adminHeaders(accessToken),
  });
}

export async function reviewVerification(
  id: string,
  action: "approve" | "reject",
  adminNote: string,
  accessToken: string,
) {
  return requestJson<{ success: boolean }>(`/api/admin/travel-verifications/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: adminHeaders(accessToken),
    body: { adminNote },
  });
}
