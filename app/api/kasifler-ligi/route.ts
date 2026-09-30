import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { explorerCountryAliases } from "@/lib/leaderboard/countries";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Lig bağlantısı kurulamadı." }, { status: 503, headers });
    const { data, error } = await supabase.rpc("get_explorer_league", { p_country_aliases: explorerCountryAliases, p_limit: 100 });
    if (error || !Array.isArray(data)) {
      console.error("explorer_league_unavailable", { code: error?.code || "invalid_data" });
      return NextResponse.json({ error: "Sıralama yüklenemedi. Lütfen tekrar dene." }, { status: 503, headers });
    }
    return NextResponse.json({ data: data.map(row => ({
      username: String(row.username).slice(0, 40), visitedCount: Number(row.visited_count),
      points: Number(row.points), level: String(row.level).slice(0, 80),
    })), generatedAt: new Date().toISOString(), limit: 100, pointsPerCountry: 10, basis: "self_reported_visits" }, { headers });
  } catch {
    return NextResponse.json({ error: "Lig şu anda yüklenemedi." }, { status: 503, headers });
  }
}
