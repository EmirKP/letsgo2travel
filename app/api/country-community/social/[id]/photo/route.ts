import { communityViewer } from "@/lib/community/viewer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { socialError, socialPhotoResponse, socialUuid } from "@/lib/community/social";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; if (!socialUuid(id)) return socialError({ code: "P0002" });
    const viewer = await communityViewer(request); if (!viewer.ok) return viewer.response;
    const db = getSupabaseAdmin(); if (!db) return socialError();
    const { data, error } = await db.rpc("read_travel_social", { p_viewer: viewer.userId, p_input: { section: "photo", postId: id } });
    if (error) return socialError(error);
    return socialPhotoResponse(db, data, id);
  } catch { return socialError(); }
}
