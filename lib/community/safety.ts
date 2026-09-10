import type { SupabaseClient } from "@supabase/supabase-js";

export const COMMUNITY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const COMMUNITY_PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Authorization" };
export const COMMUNITY_REPORT_REASONS = ["spam", "harassment", "hate", "dangerous", "personal_data", "other"] as const;

export function forumTargetType(value: unknown): "topic" | "reply" | null {
  if (value === "question" || value === "topic") return "topic";
  if (value === "answer" || value === "reply") return "reply";
  return null;
}

export function parseCommunityReport(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const targetType = forumTargetType(input.targetType);
  const targetId = typeof input.targetId === "string" ? input.targetId.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!targetType || !COMMUNITY_UUID.test(targetId)
    || !(COMMUNITY_REPORT_REASONS as readonly string[]).includes(reason)
    || note.length > 1000 || (reason === "other" && note.length < 5)) return null;
  return { targetType, targetId, reason, note };
}

// Resolve authors only from live canonical content. A caller cannot block an
// arbitrary guessed auth user or report an old table with an unrelated UUID.
export async function findForumTarget(supabase: SupabaseClient, targetType: "topic" | "reply", targetId: string) {
  const topic = targetType === "topic";
  const { data, error } = await supabase.from(topic ? "forum_topics" : "forum_replies")
    .select(topic ? "id,author_id,author_name,status" : "id,user_id,author_name,status,topic_id")
    .eq("id", targetId).eq("status", "published").maybeSingle();
  if (error) throw new Error("community_target_unavailable");
  if (!data) return null;
  const row = data as unknown as { id: string; author_id?: string; user_id?: string; author_name: string; topic_id?: string };
  if (!topic) {
    const { data: parent, error: parentError } = await supabase.from("forum_topics")
      .select("id").eq("id", row.topic_id).eq("status", "published").maybeSingle();
    if (parentError) throw new Error("community_target_unavailable");
    if (!parent) return null;
  }
  return { id: row.id, authorId: (topic ? row.author_id : row.user_id) || null, authorName: String(row.author_name || "Gezgin").slice(0, 80) };
}

export async function hiddenCommunityUsers(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("community_hidden_user_ids", { p_user_id: userId });
  if (error || !Array.isArray(data)) throw new Error("community_blocks_unavailable");
  return [...new Set(data.filter((id): id is string => typeof id === "string" && COMMUNITY_UUID.test(id)))];
}

export async function canCommunityUsersInteract(supabase: SupabaseClient, userId: string, otherId: string | null | undefined) {
  if (!otherId || userId === otherId) return true;
  const { data, error } = await supabase.rpc("community_users_blocked", { p_first: userId, p_second: otherId });
  if (error || typeof data !== "boolean") throw new Error("community_blocks_unavailable");
  return !data;
}

export function blockedAuthorFilter(column: "author_id" | "user_id", blockedIds: string[]) {
  const ids = blockedIds.filter((id) => COMMUNITY_UUID.test(id));
  return ids.length ? `${column}.is.null,${column}.not.in.(${ids.join(",")})` : null;
}
