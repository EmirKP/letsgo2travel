import { requireAdmin } from "@/lib/admin-auth";
import { communityPhotoResponse } from "@/lib/community/photos";
import { COMMUNITY_PRIVATE_HEADERS, COMMUNITY_UUID } from "@/lib/community/safety";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reply = (error: string, status: number) => Response.json({ error }, { status, headers: COMMUNITY_PRIVATE_HEADERS });
  try {
    const authError = await requireAdmin(request, ["moderator", "admin", "super_admin"]);
    if (authError) return authError;
    const { id } = await params;
    if (!COMMUNITY_UUID.test(id)) return reply("Fotoğraf bulunamadı.", 404);
    const supabase = getSupabaseAdmin();
    if (!supabase) return reply("Fotoğraf kullanılamıyor.", 503);
    const { data: topic, error } = await supabase.from("forum_topics")
      .select("id,author_id").eq("id", id).maybeSingle();
    if (error) return reply("Fotoğraf kullanılamıyor.", 503);
    if (!topic) return reply("Fotoğraf bulunamadı.", 404);
    return await communityPhotoResponse(supabase, topic);
  } catch { return reply("Fotoğraf kullanılamıyor.", 503); }
}
