import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { socialError, socialPhotoResponse, socialUuid } from "@/lib/community/social";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(request, ["moderator", "admin", "super_admin"]); if (denied) return denied;
  try {
    const { id } = await context.params; if (!socialUuid(id)) return socialError({ code: "P0002" });
    const db = getSupabaseAdmin(); if (!db) return socialError();
    const { data, error } = await db.from("travel_social_posts").select("user_id,storage_path").eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) return socialError(error);
    return socialPhotoResponse(db, data ? { userId: data.user_id, storagePath: data.storage_path } : null, id);
  } catch { return socialError(); }
}
