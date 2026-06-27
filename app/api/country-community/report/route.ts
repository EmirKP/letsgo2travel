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

    const { targetType, targetId, reason, note, countryCode } = await request.json();
    if (!targetType || !targetId || !reason) {
      return NextResponse.json({ error: "Eksik alanlar" }, { status: 400 });
    }

    const { error } = await supabase.from('content_reports').insert({
      reporter_user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      note,
      country_code: countryCode,
      status: 'open'
    });

    if (error) {
      return NextResponse.json({ error: "Rapor kaydedilemedi" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
