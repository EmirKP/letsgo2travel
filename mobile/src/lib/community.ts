import { requestJson } from "./api";

export type CommunityQuestion = {
  id: string;
  countryCode: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  username: string;
  authorId: string | null;
  answerCount: number;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function communityText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

export function communityCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(10_000_000, Math.round(number))) : 0;
}

export function normalizeCommunityQuestion(value: unknown): CommunityQuestion | null {
  const item = record(value);
  const id = communityText(item.id, 80);
  const title = communityText(item.title, 160);
  const body = communityText(item.body, 800);
  const countryCode = communityText(item.countryCode ?? item.country_code, 2).toUpperCase();
  if (!id || !title || !body || !/^[A-Z]{2}$/.test(countryCode)) return null;
  return {
    id,
    countryCode,
    title,
    body,
    category: communityText(item.category, 60) || "general",
    createdAt: communityText(item.createdAt ?? item.created_at, 40),
    username: communityText(item.username, 40) || "anonim_gezgin",
    authorId: communityText(item.authorId, 80) || null,
    answerCount: communityCount(item.answerCount ?? item.answer_count),
  };
}

export async function listCommunityQuestions(limit = 40, accessToken = "") {
  const response = await requestJson<{ data?: unknown }>("/api/country-community/feed", {
    timeoutMs: 15_000,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows
    .flatMap((item) => {
      const question = normalizeCommunityQuestion(item);
      return question ? [question] : [];
    })
    .slice(0, Math.max(1, Math.min(40, limit)));
}

export type CommunitySafetyTarget = {
  targetType: "question" | "answer";
  targetId: string;
  authorId: string | null;
  username: string;
};

export type CommunityBlock = { userId: string; authorName: string; createdAt: string };

export async function listCommunityBlocks(accessToken: string) {
  const response = await requestJson<{ data?: CommunityBlock[] }>("/api/country-community/blocks", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function reportCommunityContent(accessToken: string, target: CommunitySafetyTarget, reason: string, note: string) {
  return requestJson<{ success: boolean }>("/api/country-community/report", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { targetType: target.targetType, targetId: target.targetId, reason, note },
  });
}

export async function blockCommunityAuthor(accessToken: string, target: CommunitySafetyTarget) {
  return requestJson<{ success: boolean; userId: string }>("/api/country-community/blocks", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { targetType: target.targetType, targetId: target.targetId },
  });
}

export async function unblockCommunityAuthor(accessToken: string, userId: string) {
  return requestJson<{ success: boolean }>("/api/country-community/blocks", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { userId },
  });
}
