import { NextResponse } from "next/server";
import { moderateUserText } from "@/lib/community/moderation";
import { getCountryPermission } from "@/lib/community/permissions";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 12_000) {
      return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
    }
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const payload = await request.json();
    const countryCode = String(payload.countryCode || "").trim().toUpperCase();
    const body = String(payload.body || "").trim();
    const commentType = String(payload.commentType || "general_tip").trim().toLowerCase();
    if (!/^[A-Z]{2}$/.test(countryCode) || body.length < 3 || body.length > 2500) {
      return NextResponse.json({ error: "Ülke veya yorum geçersiz." }, { status: 400 });
    }
    if (!/^[a-z0-9_-]{1,40}$/.test(commentType)) {
      return NextResponse.json({ error: "Geçersiz yorum türü." }, { status: 400 });
    }

    // Permission check
    const perms = await getCountryPermission(supabase, user.id, countryCode);
    if (!perms.canComment) {
      return NextResponse.json({ error: "Bu ülke için yorum yazma yetkiniz yok (Doğrulama gerekli)." }, { status: 403 });
    }

    const moderation = moderateUserText(body);

    const { data, error } = await supabase.from('country_experience_comments').insert({
      user_id: user.id,
      country_code: countryCode,
      comment_type: commentType,
      body,
      status: moderation.action
    }).select();

    if (error) {
      return NextResponse.json({ error: "Yorum kaydedilemedi" }, { status: 500 });
    }

    if (moderation.action === 'visible') {
      await supabase.from("user_points_log").insert({
        user_id: user.id,
        action_type: 'country_comment_posted',
        points: 20,
        country_code: countryCode,
        related_id: data[0].id
      });
    }

    return NextResponse.json({ data: data[0], moderation });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
