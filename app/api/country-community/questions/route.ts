import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { moderateUserText } from "@/lib/community/moderation";

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { countryCode, title, body, category = 'general' } = await request.json();
    if (!countryCode || !title || !body) {
      return NextResponse.json({ error: "Eksik alanlar" }, { status: 400 });
    }

    const moderation = moderateUserText(title + " " + body);

    const { data, error } = await supabase.from('country_questions').insert({
      user_id: user.id,
      country_code: countryCode,
      title,
      body,
      category,
      status: moderation.action
    }).select();

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Soru kaydedilemedi" }, { status: 500 });
    }

    return NextResponse.json({ data: data[0], moderation });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
