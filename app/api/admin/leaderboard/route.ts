import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Veritabanı bağlantısı kurulamadı." }, { status: 503 });
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,username,visited_countries,opt_in_leaderboard")
    .eq("opt_in_leaderboard", true);

  if (profilesError) {
    return NextResponse.json({ error: "Katılımcılar alınamadı." }, { status: 500 });
  }

  const { data: blockedUsers, error: blocksError } = await supabase
    .from("leaderboard_blocks")
    .select("user_id");

  if (blocksError) {
    return NextResponse.json(
      { error: "Kaşifler Ligi yönetim tablosu hazır değil." },
      { status: 503 },
    );
  }

  const blockedIds = new Set((blockedUsers || []).map((row) => row.user_id));
  const data = (profiles || [])
    .map((profile) => ({
      id: profile.id,
      username: profile.username,
      visitedCount: Array.isArray(profile.visited_countries)
        ? profile.visited_countries.length
        : 0,
      hidden: blockedIds.has(profile.id),
    }))
    .sort((first, second) => second.visitedCount - first.visitedCount);

  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function PATCH(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as
    | { userId?: string; hidden?: boolean }
    | null;
  if (!body?.userId || !UUID_PATTERN.test(body.userId) || typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "Geçersiz kullanıcı veya görünürlük değeri." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Veritabanı bağlantısı kurulamadı." }, { status: 503 });
  }

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id,opt_in_leaderboard")
    .eq("id", body.userId)
    .maybeSingle();

  if (targetError || !target?.opt_in_leaderboard) {
    return NextResponse.json({ error: "Kaşifler Ligi katılımcısı bulunamadı." }, { status: 404 });
  }

  const result = body.hidden
    ? await supabase
        .from("leaderboard_blocks")
        .upsert({ user_id: body.userId }, { onConflict: "user_id" })
    : await supabase.from("leaderboard_blocks").delete().eq("user_id", body.userId);

  if (result.error) {
    return NextResponse.json(
      { error: "Görünürlük güncellenemedi; Kaşifler Ligi yönetim tablosunu kontrol edin." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, hidden: body.hidden });
}
