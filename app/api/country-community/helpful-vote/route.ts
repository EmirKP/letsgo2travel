import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { targetType, targetId } = await request.json();
    if (!targetType || !targetId) {
      return NextResponse.json({ error: "Eksik alanlar" }, { status: 400 });
    }

    const { error } = await supabase.rpc('l2t_add_helpful_vote', {
      p_user_id: user.id,
      p_target_type: targetType,
      p_target_id: targetId
    });

    if (error) {
      return NextResponse.json({ error: error.message || "Oy kaydedilemedi" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
