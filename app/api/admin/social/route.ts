import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { COMMUNITY_PRIVATE_HEADERS } from "@/lib/community/safety";
import { readSocialJson, socialError, socialUuid } from "@/lib/community/social";
const tables = { posts: "travel_social_posts", comments: "travel_social_comments", reports: "travel_social_reports" } as const;

export async function GET(request: Request) {
  const denied = await requireAdmin(request, ["moderator", "admin", "super_admin"]); if (denied) return denied;
  const db = getSupabaseAdmin(); if (!db) return socialError();
  try {
    const params = new URL(request.url).searchParams;
    const section = params.get("section") || "posts";
    if (!Object.hasOwn(tables, section)) return socialError({ code: "22023" });
    const offset = Number(params.get("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return socialError({ code: "22023" });
    const status = params.get("status") || "pending";
    if (!["pending", "published", "hidden", "all", ...(section === "reports" ? ["resolved"] : [])].includes(status)) return socialError({ code: "22023" });
    let query = db.from(tables[section as keyof typeof tables]).select("*", { count: "exact" });
    if (section === "posts") query = query.is("deleted_at", null);
    if (section !== "reports" && status !== "all") query = query.eq("status", status);
    if (section === "reports" && status !== "all") query = status === "resolved" ? query.not("resolved_at", "is", null) : query.is("resolved_at", null);
    const { data, count, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 19);
    if (error) return socialError(error);
    const rows = data || [];
    // Resolve canonical report targets in batches. Never treat a read failure as
    // missing content or accept a client-supplied target when moderating it.
    const postIds = section === "reports" ? [...new Set(rows.map(row => row.post_id))] : [];
    const commentIds = section === "reports" ? [...new Set(rows.map(row => row.comment_id).filter(Boolean))] : [];
    const [posts, comments] = await Promise.all([
      postIds.length ? db.from("travel_social_posts").select("id,user_id,caption,visibility,status,deleted_at").in("id", postIds) : { data: [], error: null },
      commentIds.length ? db.from("travel_social_comments").select("id,post_id,user_id,body,status").in("id", commentIds) : { data: [], error: null },
    ]);
    if (posts.error || comments.error) return socialError(posts.error || comments.error);
    const postById = new Map((posts.data || []).map(row => [row.id, row]));
    const commentById = new Map((comments.data || []).map(row => [row.id, row]));
    const ids = [...new Set([...rows, ...(posts.data || []), ...(comments.data || [])].map(row => row.user_id))];
    const profiles = ids.length ? await db.from("profiles").select("id,username").in("id", ids) : { data: [], error: null };
    if (profiles.error) return socialError(profiles.error);
    const names = new Map((profiles.data || []).map(row => [row.id, row.username]));
    const items = rows.map(row => {
      // Storage paths and hashes are implementation details, never admin UI URLs.
      const { storage_path: _path, photo_hash: _hash, ...safe } = row;
      void _path; void _hash;
      const post = postById.get(row.post_id);
      const comment = commentById.get(row.comment_id);
      const target = section !== "reports" || !post || post.deleted_at || (row.comment_id && (!comment || comment.post_id !== post.id)) ? null : {
        type: row.comment_id ? "comment" : "post", id: row.comment_id || post.id, postId: post.id,
        username: names.get(comment?.user_id || post.user_id) || "Gezgin", status: comment?.status || post.status,
        caption: post.caption, body: comment?.body || null, visibility: post.visibility,
        photoUrl: `/api/admin/social/${post.id}/photo`,
      };
      return { ...safe, username: names.get(row.user_id) || "Gezgin", ...(section === "reports" ? { target } : {}), ...(section === "posts" ? { photoUrl: `/api/admin/social/${row.id}/photo` } : {}) };
    });
    return Response.json({ data: { items, total: count || 0, nextOffset: offset + 20 < (count || 0) ? offset + 20 : null } }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch { return socialError(); }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin(request, ["moderator", "admin", "super_admin"]); if (denied) return denied;
  const db = getSupabaseAdmin(); if (!db) return socialError();
  try {
    const input = await readSocialJson(request, 2048);
    if (!input || !socialUuid(input.id) || !["posts", "comments", "reports"].includes(String(input.section))) return socialError({ code: "22023" });
    const section = input.section as keyof typeof tables;
    if (section === "reports") {
      if (input.action !== undefined && !["resolve", "hide"].includes(String(input.action))) return socialError({ code: "22023" });
      const { data, error } = await db.rpc("moderate_travel_social_report", { p_report: input.id, p_hide: input.action === "hide" });
      if (error) return socialError(error);
      return Response.json({ data }, { headers: COMMUNITY_PRIVATE_HEADERS });
    }
    if (!["published", "hidden", "pending"].includes(String(input.status))) return socialError({ code: "22023" });
    const values = { status: input.status };
    const { data, error } = await db.from(tables[section]).update(values).eq("id", input.id).select("id").maybeSingle();
    if (error) return socialError(error);
    if (!data) return socialError({ code: "P0002" });
    return Response.json({ data: { success: true } }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch { return socialError(); }
}
