import { communityViewer } from "@/lib/community/viewer";
import { blockedAuthorFilter, COMMUNITY_PRIVATE_HEADERS } from "@/lib/community/safety";
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
  userId: string | null,
  supabase: SupabaseClient,
  questionId: string,
) {
  if (!userId) return false;

  const { data, error } = await supabase.rpc("has_forum_topic_unlock", {
    p_topic_id: questionId,
    p_user_id: userId,
  });
  if (error) {
    console.error("country_community_kilit_hatasi", { code: error.code || "unknown" });
    return false;
  }
  return data === true;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await communityViewer(request);
    if (!viewer.ok) return viewer.response;
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
      .select("id,author_id,country_slug,title,content,category,author_name,created_at,status")
      .eq("id", questionId)
      .eq("status", "published")
      .maybeSingle();

    if (error) {
      console.error("country_community_detay_hatasi", { code: (error as { code?: string }).code || "unknown" });
      return NextResponse.json({ error: "Soru yüklenemedi." }, { status: 500 });
    }
    if (!question || viewer.hiddenUserIds.includes(question.author_id)) return NextResponse.json({ error: "Soru bulunamadı." }, { status: 404 });

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
    const hasFullAccess = !isPaywalled || await hasFullReplyAccess(viewer.userId, supabase, questionId);
    let answerQuery = supabase
      .from("forum_replies")
      .select("id,user_id,author_name,content,created_at", { count: "exact" })
      .eq("topic_id", questionId)
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(forumReplyLimit(isPaywalled, hasFullAccess));
    const authorFilter = blockedAuthorFilter("user_id", viewer.hiddenUserIds);
    if (authorFilter) answerQuery = answerQuery.or(authorFilter);
    const { data: answers, error: answersError, count } = await answerQuery;
    if (answersError) {
      console.error("country_community_cevap_hatasi", { code: (answersError as { code?: string }).code || "unknown" });
      return NextResponse.json({ error: "Cevaplar yüklenemedi." }, { status: 500 });
    }

    const serialized = serializeQuestionDetail(
      {
        id: question.id,
        authorId: question.author_id,
        country_code: countryCodeFromForumSlug(question.country_slug),
        title: question.title,
        body: question.content,
        category: question.category,
        created_at: question.created_at,
      },
      question.author_name,
      (answers || []).map((answer) => serializeAnswer({
        id: answer.id,
        authorId: answer.user_id,
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

    return NextResponse.json({ data }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Soru erişimi doğrulanamadı." }, { status: 503, headers: COMMUNITY_PRIVATE_HEADERS });
  }
}
