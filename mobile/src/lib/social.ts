import { requestJson } from "./api";
import { createId } from "./id";

import type { SocialPage as SharedSocialPage, SocialPost } from "../../../lib/community/social-contract";
export type { SocialPlace, SocialAuthor, SocialPost, SocialComment, SocialCollection, SocialDetail } from "../../../lib/community/social-contract";
export type SocialPage = SharedSocialPage<SocialPost>;
export type SocialDraft = { requestId: string; caption: string; photo: string; place: string; countryCode: string; visibility: "public" | "followers"; updatedAt: string; attempted?: boolean };
const PATH = "/api/country-community/social";
const headers = (token?: string | null) => token ? { Authorization: `Bearer ${token}` } : undefined;

export async function socialRead<T>(params: Record<string, string | number | undefined>, token?: string | null, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
  const result = await requestJson<{ data: T }>(`${PATH}?${query}`, { headers: headers(token), signal });
  return result.data;
}

export async function socialWrite<T>(action: string, values: Record<string, unknown>, token: string): Promise<T> {
  const result = await requestJson<{ data: T }>(PATH, { method: "POST", headers: headers(token), body: { action, ...values }, timeoutMs: action === "create" ? 45_000 : 18_000 });
  return result.data;
}

export function mergeSocialItems<T extends { id: string }>(previous: T[], incoming: T[]): T[] {
  const map = new Map(previous.map(item => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

const draftKey = (ownerId: string) => `l2t.social.draft.v1.${encodeURIComponent(ownerId)}`;
export function emptySocialDraft(): SocialDraft {
  return { requestId: createId(), caption: "", photo: "", place: "", countryCode: "", visibility: "public", updatedAt: new Date().toISOString() };
}

export function readSocialDraft(ownerId: string): SocialDraft {
  try {
    const raw = localStorage.getItem(draftKey(ownerId));
    if (!raw || raw.length > 410_000) return emptySocialDraft();
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return emptySocialDraft();
    const d = data as SocialDraft;
    if (!/^[a-f\d-]{36}$/i.test(d.requestId) || typeof d.caption !== "string" || d.caption.length > 2200
      || typeof d.place !== "string" || d.place.length > 120 || typeof d.countryCode !== "string" || !/^(?:[A-Z]{2})?$/.test(d.countryCode)
      || typeof d.photo !== "string" || d.photo.length > 400_030 || d.photo && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(d.photo)
      || !["public", "followers"].includes(d.visibility) || !Number.isFinite(Date.parse(d.updatedAt)) || d.attempted !== undefined && typeof d.attempted !== "boolean") return emptySocialDraft();
    return d;
  } catch { return emptySocialDraft(); }
}

export function saveSocialDraft(ownerId: string, draft: SocialDraft): boolean {
  try {
    if (!draft.caption && !draft.photo && !draft.place) localStorage.removeItem(draftKey(ownerId));
    else localStorage.setItem(draftKey(ownerId), JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
    return true;
  } catch { return false; }
}

export function clearSocialDraft(ownerId: string, expectedRequestId?: string) {
  try { if (!expectedRequestId || readSocialDraft(ownerId).requestId === expectedRequestId) localStorage.removeItem(draftKey(ownerId)); } catch { /* The successful composer resets its in-memory draft too. */ }
}
