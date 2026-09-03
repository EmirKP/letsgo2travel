import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { moderateUserText } from "@/lib/community/moderation";
import {
  createForumTopicSlug,
  forumCategoryFromCommunityCategory,
  forumCountrySlugFromCode,
  forumStatusFromModeration,
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
    const title = String(payload.title || "").replace(/\s+/g, " ").trim();
    const body = String(payload.body || "").trim();
    const category = String(payload.category || "general").trim().toLowerCase();
    if (!/^[A-Z]{2}$/.test(countryCode) || title.length < 5 || title.length > 160 || body.length < 10 || body.length > 4000) {
      return NextResponse.json({ error: "Ülke, başlık veya açıklama geçersiz." }, { status: 400 });
    }
    if (!/^[a-z0-9_-]{1,60}$/.test(category)) {
      return NextResponse.json({ error: "Geçersiz kategori." }, { status: 400 });
    }

    const moderation = moderateUserText(title + " " + body);
    const id = randomUUID();
    const authorName = String(
      user.user_metadata?.full_name
      || user.user_metadata?.username
      || user.email?.split("@")[0]
      || "Gezgin",
    ).replace(/\s+/g, " ").trim().slice(0, 80);

    const { error } = await supabase.from("forum_topics").insert({
      id,
      slug: createForumTopicSlug(title, id),
      title,
      content: body,
      category: forumCategoryFromCommunityCategory(category),
      country_slug: forumCountrySlugFromCode(countryCode),
      author_id: user.id,
      author_name: authorName,
      status: forumStatusFromModeration(moderation.action),
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "Soru kaydedilemedi" }, { status: 500 });
    }

    return NextResponse.json({ data: { id }, moderation });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
