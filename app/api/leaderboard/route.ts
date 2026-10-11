import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { explorerCountryAliases } from "@/lib/leaderboard/countries";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Lig bağlantısı kurulamadı." }, { status: 503, headers });
    const raw = Number(new URL(request.url).searchParams.get("limit") || 50);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(100, Math.floor(raw))) : 50;
    const { data, error } = await supabase.rpc("get_verified_explorer_league", { p_country_aliases: explorerCountryAliases, p_limit: limit });
    if (error || !Array.isArray(data)) return NextResponse.json({ error: "Sıralama yüklenemedi. Tekrar dene." }, { status: 503, headers });
    return NextResponse.json({ data: data.map(row => ({ username: String(row.username).slice(0, 40), visited_count: Number(row.visited_count), points: Number(row.points), level: String(row.level).slice(0, 80), badges: ["belgeli_gezgin"] })), basis: "approved_documentary_visits" }, { headers });
  } catch {
    return NextResponse.json({ error: "Sıralama yüklenemedi." }, { status: 503, headers });
  }
}
