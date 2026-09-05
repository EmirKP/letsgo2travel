import { requestJson } from "./api";

export type CommunityQuestion = {
  id: string;
  countryCode: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  username: string;
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
    answerCount: communityCount(item.answerCount ?? item.answer_count),
  };
}

export async function listCommunityQuestions(limit = 40) {
  const response = await requestJson<{ data?: unknown }>("/api/country-community/feed", { timeoutMs: 15_000 });
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows
    .flatMap((item) => {
      const question = normalizeCommunityQuestion(item);
      return question ? [question] : [];
    })
    .slice(0, Math.max(1, Math.min(40, limit)));
}
