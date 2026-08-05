import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const payload = await request.json();
    const targetType = String(payload.targetType || "").trim();
    const targetId = String(payload.targetId || "").trim();
    if (!new Set(["answer", "comment", "warning"]).has(targetType) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
      return NextResponse.json({ error: "Geçersiz oy hedefi." }, { status: 400 });
    }

    const { error } = await supabase.rpc('l2t_add_helpful_vote', {
      p_user_id: user.id,
      p_target_type: targetType,
      p_target_id: targetId
    });

    if (error) {
      return NextResponse.json({ error: error.code === "23505" ? "Bu içeriğe daha önce oy verdiniz." : "Oy kaydedilemedi." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
