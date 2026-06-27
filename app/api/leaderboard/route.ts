import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    // l2t_public_leaderboard sadece username, visited_count, points, level, badges döner
    const { data, error } = await supabase
      .from('l2t_public_leaderboard')
      .select('*')
      .order('points', { ascending: false })
      .limit(limit);

    if (error) {
      if (error.code === '42P01') {
        // Tablo/view yoksa boş dön
        return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: "Liderlik tablosu alınamadı" }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
