import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const questionId = String(id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(questionId)) {
    return NextResponse.json({ error: "Geçersiz soru." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) {
    for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
      auth.response.headers.set(name, value);
    }
    return auth.response;
  }

  const { data: topic, error: topicError } = await auth.supabase
    .from("forum_topics")
    .select("id,country_slug,status")
    .eq("id", questionId)
    .eq("status", "published")
    .maybeSingle();
  if (topicError) {
    return NextResponse.json({ error: "Soru erişimi doğrulanamadı." }, { status: 500, headers: NO_STORE_HEADERS });
  }
  if (!topic) {
    return NextResponse.json({ error: "Soru bulunamadı." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const { data: isPaywalled, error: paywallError } = await auth.supabase.rpc(
    "is_forum_topic_paywalled",
    { p_topic_id: questionId },
  );
  if (paywallError || typeof isPaywalled !== "boolean") {
    return NextResponse.json({ error: "Soru erişimi doğrulanamadı." }, { status: 500, headers: NO_STORE_HEADERS });
  }
  if (!isPaywalled) {
    return NextResponse.json({ data: { unlocked: true } }, { headers: NO_STORE_HEADERS });
  }

  const countrySlug = typeof topic.country_slug === "string"
    ? topic.country_slug.trim().toLocaleLowerCase("tr-TR")
    : "";
  if (countrySlug.length < 2 || countrySlug.length > 100) {
    return NextResponse.json({ error: "Bu ülke kilidi açılamadı." }, { status: 409, headers: NO_STORE_HEADERS });
  }

  const { error: unlockError } = await auth.supabase
    .from("forum_country_unlocks")
    .upsert(
      { user_id: auth.user.id, country_slug: countrySlug, source: "league_join" },
      { onConflict: "user_id,country_slug", ignoreDuplicates: true },
    );
  if (unlockError) {
    return NextResponse.json({ error: "Ülke kilidi şu anda açılamadı." }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ data: { unlocked: true } }, { headers: NO_STORE_HEADERS });
}
