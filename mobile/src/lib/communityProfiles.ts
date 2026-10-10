import { requestJson } from "./api";
import type { CommunitySafetyTarget } from "./community";

export type CommunityProfileSection = "posts" | "answers" | "followers" | "following";
export type CommunityProfile = {
  key: string;
  userId: string | null;
  username: string;
  avatarUrl: string | null;
  bio: string;
  isOwn: boolean;
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  answerCount: number;
  isStarter: boolean;
  showAvatar?: boolean;
  safetyTarget?: CommunitySafetyTarget | null;
};
export type CommunityProfilePost = { id: string; title: string; body: string; countryCode: string; createdAt: string };
export type CommunityProfileAnswer = { id: string; questionId: string; questionTitle: string; body: string; createdAt: string };
export type CommunityProfilePerson = { key: string; userId: string | null; username: string; avatarUrl: string | null };
export type CommunityProfileItem = CommunityProfilePost | CommunityProfileAnswer | CommunityProfilePerson;
export type CommunityProfilePage = { profile: CommunityProfile; items: CommunityProfileItem[]; nextOffset: number | null };

export function profileAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function profileInitials(username: string): string {
  const words = username.replace(/^@/, "").trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const initials = words.length > 1 ? `${Array.from(words[0])[0]}${Array.from(words.at(-1)!)[0]}` : Array.from(words[0] || "?").slice(0, 2).join("");
  return initials.toLocaleUpperCase("tr-TR");
}

export function profileItemKey(item: CommunityProfileItem): string {
  return "key" in item ? item.key : item.id;
}

export function mergeProfileItems(previous: CommunityProfileItem[], incoming: CommunityProfileItem[]) {
  const seen = new Set(previous.map(profileItemKey));
  return [...previous, ...incoming.filter(item => {
    const key = profileItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

const headers = (accessToken?: string | null) => accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
const profilePath = (key: string) => `/api/country-community/profiles/${encodeURIComponent(key)}`;

export async function getCommunityProfile(key: string, section: CommunityProfileSection, accessToken?: string | null, offset = 0, signal?: AbortSignal): Promise<CommunityProfilePage> {
  const params = new URLSearchParams({ section, offset: String(offset) });
  const page = await requestJson<CommunityProfilePage>(`${profilePath(key)}?${params}`, { headers: headers(accessToken), signal, timeoutMs: 15_000 });
  if (!page.profile || page.profile.key !== key || !Array.isArray(page.items)) throw new Error("invalid_community_profile");
  return { ...page, nextOffset: typeof page.nextOffset === "number" && Number.isSafeInteger(page.nextOffset) && page.nextOffset > offset ? page.nextOffset : null };
}

export function followCommunityProfile(key: string, following: boolean, accessToken: string, signal?: AbortSignal) {
  return requestJson<{ success: boolean; isFollowing: boolean }>(`${profilePath(key)}/follow`, {
    method: following ? "POST" : "DELETE", headers: headers(accessToken), signal,
  });
}

export function saveCommunityProfileBio(key: string, bio: string, showAvatar: boolean, accessToken: string, signal?: AbortSignal) {
  return requestJson<{ success: boolean; bio: string; showAvatar: boolean }>(profilePath(key), {
    method: "PATCH", headers: headers(accessToken), body: { bio, showAvatar }, signal,
  });
}
