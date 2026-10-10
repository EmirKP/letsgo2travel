import { NextResponse } from "next/server";
import { communityViewer } from "@/lib/community/viewer";
import { COMMUNITY_PRIVATE_HEADERS } from "@/lib/community/safety";
import { publicCommunityProfile, readCommunityProfilePatch, validCommunityProfileKey } from "@/lib/community/profiles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { moderateUserText } from "@/lib/community/moderation";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: COMMUNITY_PRIVATE_HEADERS });
type Context = { params: Promise<{ key: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { key } = await context.params;
    if (!validCommunityProfileKey(key)) return reply({ error: "Geçersiz profil." }, 400);
    const viewer = await communityViewer(request);
    if (!viewer.ok) return viewer.response;
    const db = getSupabaseAdmin();
    if (!db) return reply({ error: "Profil servisine ulaşılamıyor." }, 503);
    const params = new URL(request.url).searchParams;
    const section = params.get("section") || "posts";
    if (!["posts", "answers", "followers", "following"].includes(section)) return reply({ error: "Geçersiz bölüm." }, 400);
    const offset = Math.max(0, Math.min(100_000, Number.parseInt(params.get("offset") || "0", 10) || 0));
    const { data, error } = await db.rpc("get_community_profile", { p_key: key, p_viewer: viewer.userId, p_section: section, p_offset: offset });
    if (error) throw error;
    if (!data) return reply({ error: "Profil bulunamadı." }, 404);
    const result = await publicCommunityProfile(db, data, section);
    return result ? reply(result) : reply({ error: "Profil bulunamadı." }, 404);
  } catch { return reply({ error: "Profil yüklenemedi. Lütfen tekrar dene." }, 503); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const { key } = await context.params;
    if (key !== `user:${auth.user.id}`) return reply({ error: "Yalnızca kendi profilini düzenleyebilirsin." }, 403);
    const patch = await readCommunityProfilePatch(request).catch(() => null);
    if (!patch) return reply({ error: "Hakkımda en fazla 300 karakter olmalı." }, 400);
    if (patch.bio && moderateUserText(patch.bio).isIllegalOrProfane) {
      return reply({ error: "Hakkımda yazısını topluluk kurallarına uygun şekilde düzenle." }, 400);
    }
    const { error } = await auth.supabase.rpc("update_community_profile", { p_viewer: auth.user.id, p_bio: patch.bio ?? null, p_show_avatar: patch.show_avatar ?? null });
    if (error) throw error;
    return reply({ success: true, ...(patch.bio !== undefined ? { bio: patch.bio } : {}), ...(patch.show_avatar !== undefined ? { showAvatar: patch.show_avatar } : {}) });
  } catch { return reply({ error: "Profil kaydedilemedi. Lütfen tekrar dene." }, 503); }
}
