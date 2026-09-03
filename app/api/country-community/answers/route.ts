import { NextResponse } from "next/server";
import { moderateUserText } from "@/lib/community/moderation";
import { getCountryPermission } from "@/lib/community/permissions";
import {
  countryCodeFromForumSlug,
  forumStatusFromModeration,
  GENERAL_FORUM_COUNTRY_CODE,
} from "@/lib/community/forum-sync";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

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
    if (!/^[A-Z]{2}$/.test(countryCode) || !/^[0-9a-f-]{36}$/i.test(questionId) || body.length < 3 || body.length > 4000) {
      return NextResponse.json({ error: "Ülke, soru veya cevap geçersiz." }, { status: 400 });
    }

    const { data: question, error: questionError } = await supabase
      .from("forum_topics")
      .select("id,country_slug,status")
      .eq("id", questionId)
      .maybeSingle();
    const questionCountryCode = question ? countryCodeFromForumSlug(question.country_slug) : "";
    if (questionError || !question || questionCountryCode !== countryCode || question.status !== "published") {
      return NextResponse.json({ error: "Yanıtlanabilir soru bulunamadı." }, { status: 404 });
    }

    // Ülke deneyimi isteyen konularda Belgeli Gezgin kuralı korunur. Genel web
    // konularına ise webde olduğu gibi giriş yapan herkes cevap verebilir.
    if (questionCountryCode !== GENERAL_FORUM_COUNTRY_CODE) {
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
