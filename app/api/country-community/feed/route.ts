import { NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase-client";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  // KÖK NEDEN DÜZELTMESİ: Bu uç projedeki TEK anon-istemcili sunucu GET'iydi;
  // kardeşi /api/kasifler-ligi service-role ile çalışırken bu uç tablo
  // grant/RLS durumuna bağımlıydı ve mobilde "Topluluk akışı yüklenemedi"
  // hatasının kaynağıydı. Artık diğer okuma uçlarıyla AYNI mimari kullanılır:
  // service-role + yalnız 'visible' kayıtlar + güvenli alan seçimi (e-posta,
  // user_id gibi alanlar yanıtta YOKTUR). Admin client yoksa anon'a düşer.
  const supabase = getSupabaseAdmin() || anonSupabase;
  const { data: questions, error } = await supabase
    .from("country_questions")
    .select("id,user_id,country_code,title,body,category,created_at")
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    // Teşhis için yalnız hata KODU loglanır (içerik/secret yok).
    console.error("country_community_feed_hatasi", { code: (error as { code?: string }).code || "unknown" });
    return NextResponse.json({ error: "Topluluk akışı alınamadı.", data: [] }, { status: 500 });
  }

  const questionIds = (questions || []).map((item) => item.id);
  const userIds = Array.from(new Set((questions || []).map((item) => item.user_id).filter(Boolean)));
  const [profilesResult, answersResult] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id,username").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    questionIds.length
      ? supabase.from("country_answers").select("question_id").eq("status", "visible").in("question_id", questionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const usernames = new Map((profilesResult.data || []).map((item) => [item.id, item.username]));
  const answerCounts = new Map<string, number>();
  for (const answer of answersResult.data || []) {
    answerCounts.set(answer.question_id, (answerCounts.get(answer.question_id) || 0) + 1);
  }

  const data = (questions || []).map((item) => ({
    id: item.id,
    countryCode: item.country_code,
    title: item.title,
    body: item.body,
    category: item.category,
    createdAt: item.created_at,
    username: usernames.get(item.user_id) || "anonim_gezgin",
    answerCount: answerCounts.get(item.id) || 0,
  }));

  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
