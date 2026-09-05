import { requestJson } from "./api";

export type MobileAdminOverview = {
  role: "super_admin";
  generatedAt: string;
  unavailableCount: number;
  unavailableModules: string[];
  stats: {
    profiles: number;
    pendingVerifications: number;
    pendingTopics: number;
    pendingReplies: number;
    openReports: number;
    activeVisaTracks: number;
    activePriceAlerts: number;
  };
  pendingVerifications: Array<{
    id: string;
    countryCode: string;
    countryName: string;
    createdAt: string;
    hasEvidence: boolean;
    evidenceType: string | null;
  }>;
  pendingTopics: Array<{ id: string; title: string; authorName: string; createdAt: string }>;
  pendingReplies: Array<{ id: string; body: string; authorName: string; topicTitle: string; createdAt: string }>;
  openReports: Array<{ id: string; targetType: string; reason: string; createdAt: string }>;
};

export type MobileAdminAccess = {
  allowed: boolean;
  role: "super_admin" | null;
};

export type AdminTravelEvent = {
  id: string;
  title: string;
  description: string;
  category: "concert" | "festival" | "sport" | "culture" | "food" | "family" | "other";
  countryCode: string;
  city: string;
  venue: string;
  startsAt: string;
  endsAt: string | null;
  status: "scheduled" | "postponed" | "cancelled" | "completed";
  imageUrl: string | null;
  ticketUrl: string | null;
  sourceUrl: string;
  featured: boolean;
  published: boolean;
  updatedAt: string;
};

export type AdminTravelEventInput = Omit<AdminTravelEvent, "id" | "updatedAt">;

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

export async function listAdminTravelEvents(accessToken: string) {
  const result = await requestJson<{ data?: AdminTravelEvent[] }>("/api/admin/events", {
    headers: adminHeaders(accessToken),
    timeoutMs: 15_000,
  });
  return Array.isArray(result.data) ? result.data : [];
}

export async function createAdminTravelEvent(input: AdminTravelEventInput, accessToken: string) {
  const result = await requestJson<{ data?: AdminTravelEvent }>("/api/admin/events", {
    method: "POST",
    headers: adminHeaders(accessToken),
    body: input,
  });
  if (!result.data) throw new Error("Etkinlik eklenemedi.");
  return result.data;
}

export async function updateAdminTravelEvent(event: AdminTravelEvent, accessToken: string) {
  const result = await requestJson<{ data?: AdminTravelEvent }>("/api/admin/events", {
    method: "PATCH",
    headers: adminHeaders(accessToken),
    body: event,
  });
  if (!result.data) throw new Error("Etkinlik güncellenemedi.");
  return result.data;
}
