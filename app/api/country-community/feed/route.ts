import { NextResponse } from "next/server";
import { serializeQuestionSummary } from "@/lib/community/serializers";
import { countryCodeFromForumSlug } from "@/lib/community/forum-sync";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
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

  const { data: questions, error } = await supabase
    .from("forum_topics")
    .select("id,country_slug,title,content,category,author_name,created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    // Teşhis için yalnız hata KODU loglanır (içerik/secret yok).
    console.error("country_community_feed_hatasi", { code: (error as { code?: string }).code || "unknown" });
    return NextResponse.json({ error: "Topluluk akışı alınamadı.", data: [] }, { status: 500 });
  }

  const questionIds = (questions || []).map((item) => item.id);
  const answersResult = questionIds.length
    ? await supabase.from("forum_replies").select("topic_id").eq("status", "published").in("topic_id", questionIds)
    : { data: [] as Array<{ topic_id: string }>, error: null };

  const answerCounts = new Map<string, number>();
  for (const answer of answersResult.data || []) {
    answerCounts.set(answer.topic_id, (answerCounts.get(answer.topic_id) || 0) + 1);
  }

  const data = (questions || []).map((item) => serializeQuestionSummary(
    {
      id: item.id,
      country_code: countryCodeFromForumSlug(item.country_slug),
      title: item.title,
      body: item.content,
      category: item.category,
      created_at: item.created_at,
    },
    item.author_name,
    answerCounts.get(item.id) || 0,
  ));

  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
