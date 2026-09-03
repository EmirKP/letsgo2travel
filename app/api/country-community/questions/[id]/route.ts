import { NextResponse } from "next/server";
import { serializeAnswer, serializeQuestionDetail } from "@/lib/community/serializers";
import { countryCodeFromForumSlug } from "@/lib/community/forum-sync";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Soru detayı + görünür cevaplar (web ve mobil ortak, herkese açık okuma).
// Service-role kullanılır ama YALNIZ 'visible' kayıtlar ve beyaz-listeli
// serileştirici alanları döner: e-posta, user_id veya moderasyon dışı
// içerik yanıtta yoktur (lib/community/serializers, testli).
// Service-role yapılandırılmamışsa anon'a DÜŞÜLMEZ: dürüst 503 döner.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    .select("id,country_slug,title,content,category,author_name,created_at,status,is_paywalled")
    .eq("id", questionId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("country_community_detay_hatasi", { code: (error as { code?: string }).code || "unknown" });
    return NextResponse.json({ error: "Soru yüklenemedi." }, { status: 500 });
  }
  if (!question) return NextResponse.json({ error: "Soru bulunamadı." }, { status: 404 });

  const isPaywalled = Boolean(question.is_paywalled)
    || String(question.category || "").toLocaleLowerCase("tr-TR").includes("vize");
  const { data: answers, error: answersError } = await supabase
    .from("forum_replies")
    .select("id,author_name,content,created_at")
    .eq("topic_id", questionId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(isPaywalled ? 2 : 100);
  if (answersError) {
    console.error("country_community_cevap_hatasi", { code: (answersError as { code?: string }).code || "unknown" });
    return NextResponse.json({ error: "Cevaplar yüklenemedi." }, { status: 500 });
  }

  const data = serializeQuestionDetail(
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

  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
