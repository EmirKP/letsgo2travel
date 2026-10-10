import { communityViewer } from "@/lib/community/viewer";
import { blockedAuthorFilter, COMMUNITY_PRIVATE_HEADERS } from "@/lib/community/safety";
import { NextResponse } from "next/server";
import { serializeQuestionSummary } from "@/lib/community/serializers";
import { countryCodeFromForumSlug, forumCountrySlugsForCodes } from "@/lib/community/forum-sync";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { communityPhotoTopics } from "@/lib/community/photos";

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

    const params = new URL(request.url).searchParams;
    const offset = Math.max(0, Math.min(100_000, Number.parseInt(params.get("offset") || "0", 10) || 0));
    const codes = [...new Set((params.get("countries") || "").split(",").filter(code => /^[A-Z]{2}$/.test(code)))].slice(0, 250);
    // Strip PostgREST grammar and wildcard characters; values are search text only.
    const search = (params.get("search") || "").slice(0, 100).replace(/[(),.%_*\\"\r\n]/g, " ").trim();
    let questionQuery = supabase
      .from("forum_topics")
      .select("id,author_id,country_slug,title,content,category,author_name,created_at,seed_key")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 40);
    if (codes.length) {
      const slugs = forumCountrySlugsForCodes(codes);
      questionQuery = codes.includes("ZZ")
        ? questionQuery.or(`country_slug.is.null,country_slug.in.(${slugs.join(",")})`)
        : questionQuery.in("country_slug", slugs);
    }
    if (search) {
      const searchCountries = (params.get("searchCountries") || "").split(",").filter(code => /^[A-Z]{2}$/.test(code)).slice(0, 250);
      const searchSlugs = forumCountrySlugsForCodes(searchCountries);
      questionQuery = questionQuery.or(`title.ilike.%${search}%,content.ilike.%${search}%,author_name.ilike.%${search}%${searchSlugs.length ? `,country_slug.in.(${searchSlugs.join(",")})` : ""}`);
    }
    const authorFilter = blockedAuthorFilter("author_id", viewer.hiddenUserIds);
    if (authorFilter) questionQuery = questionQuery.or(authorFilter);
    const { data: rows, error } = await questionQuery;
    if (error) {
      // Teşhis için yalnız hata KODU loglanır (içerik/secret yok).
      console.error("country_community_feed_hatasi", { code: (error as { code?: string }).code || "unknown" });
      return NextResponse.json({ error: "Topluluk akışı alınamadı.", data: [] }, { status: 500 });
    }

    const hasMore = (rows?.length || 0) > 40;
    const questions = (rows || []).slice(0, 40);
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

    const photoTopics = await communityPhotoTopics(supabase, questions || []);
    const data = (questions || []).map((item) => serializeQuestionSummary(
      {
        id: item.id,
        authorId: item.author_id,
        country_code: countryCodeFromForumSlug(item.country_slug),
        title: item.title,
        body: item.content,
        category: item.category,
        created_at: item.created_at,
        hasPhoto: photoTopics.has(item.id),
        seed_key: item.seed_key,
      },
      item.author_name,
      answerCounts.get(item.id) || 0,
    ));

    return NextResponse.json({ data, nextOffset: hasMore ? offset + 40 : null }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Topluluk erişimi doğrulanamadı.", data: [] }, { status: 503, headers: COMMUNITY_PRIVATE_HEADERS });
  }
}
