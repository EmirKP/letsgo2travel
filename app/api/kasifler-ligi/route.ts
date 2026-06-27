import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase admin configuration missing" }, { status: 500 });
    }

    // Yalnızca opt_in_leaderboard = true olan ve username'i olan kullanıcıları çek
    const { data: leaders, error } = await supabase
      .from('profiles')
      .select('id, username, visited_countries')
      .eq('opt_in_leaderboard', true)
      .not('username', 'is', null);

    if (error) {
      if (error.code === '42703') {
        return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: "Veriler alınamadı" }, { status: 500 });
    }

    // Blocked listesini al (service_role olduğu için okuyabilir)
    const { data: blockedUsers } = await supabase
      .from('leaderboard_blocks')
      .select('user_id');
    const blockedIds = new Set((blockedUsers || []).map(b => b.user_id));

    // Güvenli response oluştur (id, visited_countries detayları hariç)
    const formattedLeaders = (leaders || [])
      .filter(l => !blockedIds.has(l.id))
      .map(l => {
      const visitedCount = l.visited_countries?.length || 0;
      const points = visitedCount * 10;
      
      let level = "Yeni Kaşif";
      if (visitedCount >= 25) level = "Dünya Gezgini";
      else if (visitedCount >= 10) level = "Balkan Kaşifi";
      else if (visitedCount >= 5) level = "Rota Meraklısı";

      return {
        username: l.username,
        visitedCount,
        points,
        level
      };
    });

    // En çok gezen en üstte
    formattedLeaders.sort((a, b) => b.visitedCount - a.visitedCount);

    return NextResponse.json({ data: formattedLeaders }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası", data: [] }, { status: 500 });
  }
}

