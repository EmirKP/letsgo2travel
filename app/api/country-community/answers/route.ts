import { canCommunityUsersInteract } from "@/lib/community/safety";
import { NextResponse } from "next/server";
import { moderateUserText } from "@/lib/community/moderation";
import { getCountryPermission } from "@/lib/community/permissions";
import {
  countryCodeFromForumSlug,
  forumStatusFromModeration,
  GENERAL_FORUM_COUNTRY_CODE,
} from "@/lib/community/forum-sync";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { isOpenStarterDiscussion } from "@/lib/community/starter-topic";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 20_000) {
      return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
    }
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const payload = await request.json();
    const countryCode = String(payload.countryCode || "").trim().toUpperCase();
    const questionId = String(payload.questionId || "").trim();
    const body = String(payload.body || "").trim();
    const requestId = payload.requestId;
    if (requestId !== undefined && (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))) {
      return NextResponse.json({ error: "Geçersiz gönderim kimliği." }, { status: 400 });
    }
    if (!/^[A-Z]{2}$/.test(countryCode) || !/^[0-9a-f-]{36}$/i.test(questionId) || body.length < 3 || body.length > 4000) {
      return NextResponse.json({ error: "Ülke, soru veya cevap geçersiz." }, { status: 400 });
    }

    const { data: question, error: questionError } = await supabase
      .from("forum_topics")
      .select("id,author_id,country_slug,status,seed_key,category,is_paywalled")
      .eq("id", questionId)
      .maybeSingle();
    const questionCountryCode = question ? countryCodeFromForumSlug(question.country_slug) : "";
    if (questionError || !question || questionCountryCode !== countryCode || question.status !== "published") {
      return NextResponse.json({ error: "Yanıtlanabilir soru bulunamadı." }, { status: 404 });
    }

    if (!await canCommunityUsersInteract(supabase, user.id, question.author_id)) {
      return NextResponse.json({ error: "Bu kullanıcıyla etkileşim kapalı." }, { status: 403 });
    }

    // Ülke deneyimi isteyen konularda Belgeli Gezgin kuralı korunur. Genel web
    // konularına ise webde olduğu gibi giriş yapan herkes cevap verebilir.
    if (questionCountryCode !== GENERAL_FORUM_COUNTRY_CODE && !isOpenStarterDiscussion(question)) {
      const perms = await getCountryPermission(supabase, user.id, questionCountryCode);
      if (!perms.canAnswer) {
        return NextResponse.json({ error: "Bu ülke için cevap yazma yetkiniz yok (Doğrulama gerekli)." }, { status: 403 });
      }
    }

    const moderation = moderateUserText(body);
    const authorName = String(
      user.user_metadata?.full_name
      || user.user_metadata?.username
      || user.email?.split("@")[0]
      || "Gezgin",
    ).replace(/\s+/g, " ").trim().slice(0, 80);

    if (requestId) {
      // The reply, operation receipt and existing contribution log commit in
      // one transaction. A timeout retry cannot create another reply or award.
      const { data, error } = await supabase.rpc("create_community_answer_once", {
        p_user: user.id, p_request: requestId, p_topic: questionId, p_body: body,
        p_author_name: authorName, p_status: forumStatusFromModeration(moderation.action), p_country: countryCode,
      });
      if (error || !data?.id) {
        return NextResponse.json({ error: error?.code === "23505" ? "Bu gönderim kimliği başka bir cevap için kullanılmış." : "Cevap kaydedilemedi." }, { status: error?.code === "23505" ? 409 : error?.code === "P0002" ? 410 : 500 });
      }
      return NextResponse.json({ data: { id: data.id }, moderation: { ...moderation, action: data.status === "published" ? "visible" : "pending_review" } });
    }

    // Installed clients without an operation ID retain their existing contract.
    const { data, error } = await supabase.from("forum_replies").insert({
      topic_id: questionId,
      user_id: user.id,
      author_name: authorName,
      content: body,
      status: forumStatusFromModeration(moderation.action),
    }).select("id");

    if (error) {
      return NextResponse.json({ error: "Cevap kaydedilemedi" }, { status: 500 });
    }

    if (moderation.action === 'visible') {
      await supabase.from("user_points_log").insert({
        user_id: user.id,
        action_type: 'country_answer_posted',
        points: 10,
        country_code: countryCode,
        related_id: data[0].id
      });
    }

    return NextResponse.json({ data: data[0], moderation });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
