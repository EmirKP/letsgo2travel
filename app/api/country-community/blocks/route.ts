import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { COMMUNITY_PRIVATE_HEADERS, COMMUNITY_UUID, findForumTarget, forumTargetType, hiddenCommunityUsers } from "@/lib/community/safety";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const { data, error } = await auth.supabase.from("community_user_blocks")
      .select("blocked_user_id,blocked_name,created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false });
    if (error) throw error;
    const hiddenUserIds = await hiddenCommunityUsers(auth.supabase, auth.user.id);
    return NextResponse.json({ data: (data || []).map(row => ({ userId: row.blocked_user_id, authorName: row.blocked_name, createdAt: row.created_at })), hiddenUserIds }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Engellenen kullanıcılar alınamadı." }, { status: 503, headers: COMMUNITY_PRIVATE_HEADERS });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const payload = await request.json().catch(() => null);
    const targetType = forumTargetType(payload?.targetType);
    const targetId = typeof payload?.targetId === "string" ? payload.targetId : "";
    if (!targetType || !COMMUNITY_UUID.test(targetId)) return NextResponse.json({ error: "Geçersiz içerik." }, { status: 400 });
    const target = await findForumTarget(auth.supabase, targetType, targetId);
    if (!target?.authorId) return NextResponse.json({ error: "Engellenebilir kullanıcı bulunamadı." }, { status: 404 });
    if (target.authorId === auth.user.id) return NextResponse.json({ error: "Kendini engelleyemezsin." }, { status: 400 });
    const { error } = await auth.supabase.from("community_user_blocks").upsert({
      user_id: auth.user.id, blocked_user_id: target.authorId, blocked_name: target.authorName,
    }, { onConflict: "user_id,blocked_user_id", ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ success: true, userId: target.authorId }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Kullanıcı engellenemedi." }, { status: 503, headers: COMMUNITY_PRIVATE_HEADERS });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const payload = await request.json().catch(() => null);
    if (typeof payload?.userId !== "string" || !COMMUNITY_UUID.test(payload.userId)) return NextResponse.json({ error: "Geçersiz kullanıcı." }, { status: 400 });
    const { error } = await auth.supabase.from("community_user_blocks").delete()
      .eq("user_id", auth.user.id).eq("blocked_user_id", payload.userId);
    if (error) throw error;
    return NextResponse.json({ success: true }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Engel kaldırılamadı." }, { status: 503, headers: COMMUNITY_PRIVATE_HEADERS });
  }
}
