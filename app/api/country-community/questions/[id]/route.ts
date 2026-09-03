import { NextResponse } from "next/server";
import { serializeAnswer, serializeQuestionDetail } from "@/lib/community/serializers";
import {
  countryCodeFromForumSlug,
  forumReplyLimit,
} from "@/lib/community/forum-sync";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Soru detayı + yayımlanmış cevaplar (web ve mobil ortak kaynak).
// Service-role kullanılır ama YALNIZ 'published' kayıtlar ve beyaz-listeli
// serileştirici alanları döner: e-posta, user_id veya moderasyon dışı
// içerik yanıtta yoktur (lib/community/serializers, testli).
// Service-role yapılandırılmamışsa anon'a DÜŞÜLMEZ: dürüst 503 döner.

async function hasFullReplyAccess(
  request: Request,
  supabase: SupabaseClient,
  questionId: string,
) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const token = authorization.slice(7).trim();
  if (!token || token.length > 4096) return false;

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return false;

  const { data, error } = await supabase.rpc("has_forum_topic_unlock", {
    p_topic_id: questionId,
    p_user_id: authData.user.id,
  });
  if (error) {
    console.error("country_community_kilit_hatasi", { code: error.code || "unknown" });
    return false;
  }
  return data === true;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const questionId = String(id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) {
    return NextResponse.json({ error: "Geçersiz soru." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Topluluk servisi şu anda yapılandırılmıyor. Lütfen daha sonra tekrar dene." },
      { status: 503 },
    );
  }

  const { data: question, error } = await supabase
    .from("forum_topics")
    .select("id,country_slug,title,content,category,author_name,created_at,status")
    .eq("id", questionId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("country_community_detay_hatasi", { code: (error as { code?: string }).code || "unknown" });
    return NextResponse.json({ error: "Soru yüklenemedi." }, { status: 500 });
  }
  if (!question) return NextResponse.json({ error: "Soru bulunamadı." }, { status: 404 });

  // Service-role cevap sorgusu RLS'i atladığı için kilit kararını daima
  // veritabanındaki kanonik fonksiyondan al. Fonksiyon okunamazsa güvenli
  // biçimde hata dön; gizli cevap gövdelerini tahminle asla açma.
  const { data: paywallData, error: paywallError } = await supabase.rpc(
    "is_forum_topic_paywalled",
    { p_topic_id: questionId },
  );
  if (paywallError || typeof paywallData !== "boolean") {
    console.error("country_community_kilit_durumu_hatasi", { code: paywallError?.code || "invalid_result" });
    return NextResponse.json({ error: "Soru erişimi doğrulanamadı." }, { status: 500 });
  }
  const isPaywalled = paywallData;
  const hasFullAccess = !isPaywalled || await hasFullReplyAccess(request, supabase, questionId);
  const { data: answers, error: answersError, count } = await supabase
    .from("forum_replies")
    .select("id,author_name,content,created_at", { count: "exact" })
    .eq("topic_id", questionId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(forumReplyLimit(isPaywalled, hasFullAccess));
  if (answersError) {
    console.error("country_community_cevap_hatasi", { code: (answersError as { code?: string }).code || "unknown" });
    return NextResponse.json({ error: "Cevaplar yüklenemedi." }, { status: 500 });
  }

  const serialized = serializeQuestionDetail(
    {
      id: question.id,
      country_code: countryCodeFromForumSlug(question.country_slug),
      title: question.title,
      body: question.content,
      category: question.category,
      created_at: question.created_at,
    },
    question.author_name,
    (answers || []).map((answer) => serializeAnswer({
      id: answer.id,
      body: answer.content,
      created_at: answer.created_at,
    }, answer.author_name)),
  );
  const totalAnswerCount = Math.max(Number(count) || 0, serialized.answers.length);
  const data = {
    ...serialized,
    totalAnswerCount,
    shownAnswerCount: serialized.answers.length,
    hiddenAnswerCount: isPaywalled && !hasFullAccess
      ? Math.max(totalAnswerCount - serialized.answers.length, 0)
      : 0,
    hasFullAccess,
  };

  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
