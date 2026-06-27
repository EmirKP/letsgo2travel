import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { moderateUserText } from "@/lib/community/moderation";
import { getCountryPermission } from "@/lib/community/permissions";

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { countryCode, questionId, body } = await request.json();
    if (!countryCode || !questionId || !body) {
      return NextResponse.json({ error: "Eksik alanlar" }, { status: 400 });
    }

    // Permission check
    const perms = await getCountryPermission(supabase, user.id, countryCode);
    if (!perms.canAnswer) {
      return NextResponse.json({ error: "Bu ülke için cevap yazma yetkiniz yok (Doğrulama gerekli)." }, { status: 403 });
    }

    const moderation = moderateUserText(body);

    const { data, error } = await supabase.from('country_answers').insert({
      question_id: questionId,
      user_id: user.id,
      country_code: countryCode,
      body,
      status: moderation.action
    }).select();

    if (error) {
      return NextResponse.json({ error: "Cevap kaydedilemedi" }, { status: 500 });
    }

    if (moderation.action === 'visible') {
      await supabase.from("user_points_log").insert({
        user_id: user.id,
        action_type: 'country_answer_posted',
        points: 10,
        country_code: countryCode,
        related_id: data[0].id
      });
    }

    return NextResponse.json({ data: data[0], moderation });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
