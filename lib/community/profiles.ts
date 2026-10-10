import type { SupabaseClient } from "@supabase/supabase-js";
import { ownedAvatarPath } from "@/lib/profile-photo";
import { COMMUNITY_UUID } from "./safety";
import { countryCodeFromForumSlug } from "./forum-sync";

export function validCommunityProfileKey(value: unknown): value is string {
  return typeof value === "string" && (value.startsWith("user:") && COMMUNITY_UUID.test(value.slice(5)) && value === value.toLowerCase()
    || /^starter:[a-z0-9][a-z0-9._]{1,59}$/.test(value));
}

type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown, length: number) => typeof value === "string" ? value.slice(0, length) : "";
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export async function signedCommunityAvatars(db: SupabaseClient, identities: Array<{ userId: unknown; avatarPath: unknown }>) {
  const owners = identities.filter((identity): identity is { userId: string; avatarPath: string } =>
    typeof identity.userId === "string" && COMMUNITY_UUID.test(identity.userId) && ownedAvatarPath(identity.avatarPath, identity.userId));
  const paths = [...new Set(owners.map(identity => identity.avatarPath))];
  const avatars = new Map<string, string>();
  if (!paths.length) return avatars;
  const { data, error } = await db.storage.from("profile-avatars").createSignedUrls(paths, 600);
  // An unavailable optional image does not take down profiles or the forum.
  if (error) return avatars;
  const urls = new Map((data || []).filter(row => !row.error && row.signedUrl && row.path).map(row => [row.path!, row.signedUrl]));
  for (const owner of owners) { const url = urls.get(owner.avatarPath); if (url) avatars.set(owner.userId, url); }
  return avatars;
}

export async function communityAuthorAvatars(db: SupabaseClient, userIds: Array<string | null | undefined>, viewerId: string | null) {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === "string" && COMMUNITY_UUID.test(id)))];
  if (!ids.length) return new Map<string, string>();
  const { data, error } = await db.rpc("community_author_photos", { p_users: ids, p_viewer: viewerId });
  if (error || !Array.isArray(data)) return new Map<string, string>();
  return signedCommunityAvatars(db, data.map(row => ({ userId: row.user_id, avatarPath: row.avatar_path })));
}

export async function publicCommunityProfile(db: SupabaseClient, input: unknown, section: string) {
  const result = record(input);
  const profile = record(result.profile);
  if (!validCommunityProfileKey(profile.key)) return null;
  const items = Array.isArray(result.items) ? result.items.map(record) : [];
  const avatars = await signedCommunityAvatars(db, [profile, ...items].map(row => ({ userId: row.userId, avatarPath: row.avatarPath })));
  const identity = (row: Row) => ({ key: text(row.key, 80), userId: typeof row.userId === "string" && COMMUNITY_UUID.test(row.userId) ? row.userId : null,
    username: text(row.username, 80), avatarUrl: typeof row.userId === "string" ? avatars.get(row.userId) || null : null });
  const safety = record(profile.safetyTarget);
  return {
    profile: {
      ...identity(profile), bio: text(profile.bio, 300), isOwn: profile.isOwn === true, isFollowing: profile.isFollowing === true,
      isStarter: profile.isStarter === true, showAvatar: profile.isOwn === true ? profile.showAvatar === true : undefined,
      followerCount: count(profile.followerCount), followingCount: count(profile.followingCount),
      postCount: count(profile.postCount), answerCount: count(profile.answerCount),
      safetyTarget: (safety.targetType === "question" || safety.targetType === "answer") && typeof safety.targetId === "string" && COMMUNITY_UUID.test(safety.targetId)
        ? { targetType: safety.targetType, targetId: safety.targetId, authorId: identity(profile).userId, username: text(profile.username, 80) } : null,
    },
    items: section === "posts" ? items.map(row => ({ id: text(row.id, 80), title: text(row.title, 300), body: text(row.body, 10_000), countryCode: countryCodeFromForumSlug(text(row.countrySlug, 100)), createdAt: text(row.createdAt, 40) }))
      : section === "answers" ? items.map(row => ({ id: text(row.id, 80), questionId: text(row.questionId, 80), questionTitle: text(row.questionTitle, 300), body: text(row.body, 10_000), createdAt: text(row.createdAt, 40) }))
        : items.filter(row => validCommunityProfileKey(row.key)).map(identity),
    nextOffset: typeof result.nextOffset === "number" && Number.isSafeInteger(result.nextOffset) && result.nextOffset >= 0 ? result.nextOffset : null,
  };
}

export async function readCommunityProfilePatch(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 2048) { await reader.cancel(); return null; }
    chunks.push(chunk.value);
  }
  const input = record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (Object.keys(input).some(key => key !== "bio" && key !== "showAvatar") || !Object.keys(input).length) return null;
  if (input.bio !== undefined && (typeof input.bio !== "string" || [...input.bio.trim()].length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.bio))) return null;
  if (input.showAvatar !== undefined && typeof input.showAvatar !== "boolean") return null;
  return { ...(typeof input.bio === "string" ? { bio: input.bio.trim() } : {}), ...(typeof input.showAvatar === "boolean" ? { show_avatar: input.showAvatar } : {}) };
}
