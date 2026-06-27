import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ['moderator', 'admin', 'super_admin']);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase admin not initialized" }, { status: 500 });

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      { count: pendingTopics },
      { count: publishedTopics },
      { count: pendingReplies },
      { count: openReports },
      { count: todayTopics },
      { count: todayReplies }
    ] = await Promise.all([
      supabase.from("forum_topics").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("forum_topics").select("*", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("forum_replies").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("forum_reports").select("*", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("forum_topics").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      supabase.from("forum_replies").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString()),
    ]);

    return NextResponse.json({
      data: {
        pendingTopics: pendingTopics || 0,
        publishedTopics: publishedTopics || 0,
        pendingReplies: pendingReplies || 0,
        openReports: openReports || 0,
        todayTopics: todayTopics || 0,
        todayReplies: todayReplies || 0
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

