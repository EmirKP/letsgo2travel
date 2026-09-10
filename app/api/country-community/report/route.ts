import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { COMMUNITY_PRIVATE_HEADERS, findForumTarget, parseCommunityReport } from "@/lib/community/safety";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 12_000) {
      return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
    }
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const parsed = parseCommunityReport(await request.json().catch(() => null));
    if (!parsed) return NextResponse.json({ error: "Şikâyet nedeni veya açıklaması geçersiz." }, { status: 400 });
    const { supabase, user } = auth;
    const target = await findForumTarget(supabase, parsed.targetType, parsed.targetId);
    if (!target) return NextResponse.json({ error: "Şikâyet edilebilir içerik bulunamadı." }, { status: 404 });
    if (target.authorId === user.id) return NextResponse.json({ error: "Kendi içeriğini şikâyet edemezsin." }, { status: 400 });

    // The RPC validates again and deduplicates within the same transaction.
    const { data, error } = await supabase.rpc("submit_forum_report", {
      p_user_id: user.id, p_target_type: parsed.targetType, p_target_id: parsed.targetId,
      p_reason: parsed.reason, p_note: parsed.note,
    });
    if (error) return NextResponse.json({ error: "Şikâyet kaydedilemedi. Lütfen yeniden dene." }, { status: 503 });
    return NextResponse.json({ success: true, id: data }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Şikâyet servisine şu anda ulaşılamıyor." }, { status: 503 });
  }
}
