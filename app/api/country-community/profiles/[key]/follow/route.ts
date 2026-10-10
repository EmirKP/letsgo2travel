import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { COMMUNITY_PRIVATE_HEADERS } from "@/lib/community/safety";
import { validCommunityProfileKey } from "@/lib/community/profiles";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ key: string }> };
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: COMMUNITY_PRIVATE_HEADERS });
async function follow(request: Request, context: Context, active: boolean) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const { key } = await context.params;
    if (!validCommunityProfileKey(key)) return reply({ error: "Geçersiz profil." }, 400);
    if (key === `user:${auth.user.id}`) return reply({ error: "Kendini takip edemezsin." }, 400);
    const { data, error } = await auth.supabase.rpc("set_community_profile_follow", { p_viewer: auth.user.id, p_key: key, p_follow: active });
    if (error?.code === "22023") return reply({ error: "Bu profil şu anda kullanılamıyor." }, 404);
    if (error || typeof data !== "boolean") throw error;
    return reply({ success: true, isFollowing: data });
  } catch { return reply({ error: "Takip durumu kaydedilemedi. Lütfen tekrar dene." }, 503); }
}
export const POST = (request: Request, context: Context) => follow(request, context, true);
export const DELETE = (request: Request, context: Context) => follow(request, context, false);
