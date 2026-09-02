import { NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase-client";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Soru detayı + görünür cevaplar (web ve mobil ortak, herkese açık okuma).
// Service-role kullanılır ama YALNIZ 'visible' kayıtlar ve güvenli alanlar
// döner: e-posta, user_id veya moderasyon dışı içerik yanıtta yoktur.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const questionId = String(id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) {
    return NextResponse.json({ error: "Geçersiz soru." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() || anonSupabase;

  const { data: question, error } = await supabase
    .from("country_questions")
    .select("id,user_id,country_code,title,body,category,created_at,status")
    .eq("id", questionId)
    .eq("status", "visible")
    .maybeSingle();

  if (error) {
    console.error("country_community_detay_hatasi", { code: (error as { code?: string }).code || "unknown" });
    return NextResponse.json({ error: "Soru yüklenemedi." }, { status: 500 });
  }
  if (!question) return NextResponse.json({ error: "Soru bulunamadı." }, { status: 404 });

  const { data: answers, error: answersError } = await supabase
    .from("country_answers")
    .select("id,user_id,body,created_at")
    .eq("question_id", questionId)
    .eq("status", "visible")
    .order("created_at", { ascending: true })
    .limit(100);
  if (answersError) {
    console.error("country_community_cevap_hatasi", { code: (answersError as { code?: string }).code || "unknown" });
    return NextResponse.json({ error: "Cevaplar yüklenemedi." }, { status: 500 });
  }

  const userIds = Array.from(new Set([
    question.user_id,
    ...(answers || []).map((answer) => answer.user_id),
  ].filter(Boolean)));
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id,username").in("id", userIds)
    : { data: [] as Array<{ id: string; username: string | null }> };
  const usernames = new Map((profiles || []).map((item) => [item.id, item.username]));

  return NextResponse.json({
    data: {
      id: question.id,
      countryCode: question.country_code,
      title: question.title,
      body: question.body,
      category: question.category,
      createdAt: question.created_at,
      username: usernames.get(question.user_id) || "anonim_gezgin",
      answers: (answers || []).map((answer) => ({
        id: answer.id,
        body: answer.body,
        createdAt: answer.created_at,
        username: usernames.get(answer.user_id) || "anonim_gezgin",
      })),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
