import { NextResponse } from "next/server";
import { moderateUserText } from "@/lib/community/moderation";
import { getCountryPermission } from "@/lib/community/permissions";
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

    // Permission check
    const perms = await getCountryPermission(supabase, user.id, countryCode);
    if (!perms.canAnswer) {
      return NextResponse.json({ error: "Bu ülke için cevap yazma yetkiniz yok (Doğrulama gerekli)." }, { status: 403 });
    }

    const { data: question, error: questionError } = await supabase
      .from("country_questions")
      .select("id,country_code,status")
      .eq("id", questionId)
      .maybeSingle();
    if (questionError || !question || question.country_code !== countryCode || question.status !== "visible") {
      return NextResponse.json({ error: "Yanıtlanabilir soru bulunamadı." }, { status: 404 });
    }

    const moderation = moderateUserText(body);

    const { data, error } = await supabase.from('country_answers').insert({
      question_id: questionId,
      user_id: user.id,
      country_code: countryCode,
      body,
      status: moderation.action
    }).select();

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
