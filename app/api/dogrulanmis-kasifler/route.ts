import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB missing" }, { status: 500 });

    // We fetch all approved verifications.
    // To get username, we join with profiles.
    const { data: verifications, error } = await supabase
      .from('travel_verifications')
      .select('user_id, profiles!inner(username, leaderboard_hidden, opt_in_leaderboard)')
      .eq('status', 'approved');

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: "Veriler alınamadı" }, { status: 500 });
    }

    // Group by username and calculate counts
    const userMap = new Map();
    
    (verifications || []).forEach((v: any) => {
      const p = v.profiles;
      // Skip users who have hidden themselves or haven't opted in to leaderboard
      if (!p || p.leaderboard_hidden || !p.opt_in_leaderboard || !p.username) return;

      const username = p.username;
      if (!userMap.has(username)) {
        userMap.set(username, { username, verifiedCount: 0 });
      }
      userMap.get(username).verifiedCount += 1;
    });

    const leaders = Array.from(userMap.values()).map(user => {
      const verifiedCount = user.verifiedCount;
      const verifiedPoints = verifiedCount * 20; // 20 points per verified country
      
      let level = "Yeni Kaşif";
      if (verifiedCount >= 25) level = "Dünya Gezgini";
      else if (verifiedCount >= 10) level = "Balkan Kaşifi";
      else if (verifiedCount >= 5) level = "Rota Meraklısı";

      return {
        username: user.username,
        verifiedCount,
        verifiedPoints,
        level
      };
    });

    // Sort: highest points first
    leaders.sort((a, b) => b.verifiedCount - a.verifiedCount);

    return NextResponse.json({ data: leaders }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası", data: [] }, { status: 500 });
  }
}
