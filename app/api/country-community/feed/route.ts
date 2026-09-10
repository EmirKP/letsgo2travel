import { communityViewer } from "@/lib/community/viewer";
import { blockedAuthorFilter, COMMUNITY_PRIVATE_HEADERS } from "@/lib/community/safety";
import { NextResponse } from "next/server";
import { serializeQuestionSummary } from "@/lib/community/serializers";
import { countryCodeFromForumSlug } from "@/lib/community/forum-sync";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const viewer = await communityViewer(request);
    if (!viewer.ok) return viewer.response;
    // Web ve mobil TEK kaynaktan beslenir: forum_topics/forum_replies.
    // Mobilin eski API yolu korunur; bu sayede mevcut TestFlight sürümü de
    // sunucu güncellenir güncellenmez webdeki yayımlanmış konuları görür.
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Topluluk servisi şu anda yapılandırılmıyor. Lütfen daha sonra tekrar dene." },
        { status: 503 },
      );
    }

    let questionQuery = supabase
      .from("forum_topics")
      .select("id,author_id,country_slug,title,content,category,author_name,created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(40);
    const authorFilter = blockedAuthorFilter("author_id", viewer.hiddenUserIds);
    if (authorFilter) questionQuery = questionQuery.or(authorFilter);
    const { data: questions, error } = await questionQuery;
    if (error) {
      // Teşhis için yalnız hata KODU loglanır (içerik/secret yok).
      console.error("country_community_feed_hatasi", { code: (error as { code?: string }).code || "unknown" });
      return NextResponse.json({ error: "Topluluk akışı alınamadı.", data: [] }, { status: 500 });
    }

    const questionIds = (questions || []).map((item) => item.id);
    const answersResult = questionIds.length
      ? await supabase.rpc("get_forum_visible_reply_counts", { p_topic_ids: questionIds, p_user_id: viewer.userId })
      : { data: [] as Array<{ topic_id: string; reply_count: number | string }>, error: null };

    if (answersResult.error) {
      console.error("country_community_cevap_sayisi_hatasi", { code: answersResult.error.code || "unknown" });
      return NextResponse.json({ error: "Topluluk cevap sayıları alınamadı.", data: [] }, { status: 500 });
    }

    const answerCounts = new Map<string, number>();
    for (const row of answersResult.data || []) {
      const topicId = typeof row.topic_id === "string" ? row.topic_id : "";
      const replyCount = Number(row.reply_count);
      if (topicId && Number.isSafeInteger(replyCount) && replyCount >= 0) {
        answerCounts.set(topicId, replyCount);
      }
    }

    const data = (questions || []).map((item) => serializeQuestionSummary(
      {
        id: item.id,
        authorId: item.author_id,
        country_code: countryCodeFromForumSlug(item.country_slug),
        title: item.title,
        body: item.content,
        category: item.category,
        created_at: item.created_at,
      },
      item.author_name,
      answerCounts.get(item.id) || 0,
    ));

    return NextResponse.json({ data }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Topluluk erişimi doğrulanamadı.", data: [] }, { status: 503, headers: COMMUNITY_PRIVATE_HEADERS });
  }
}
