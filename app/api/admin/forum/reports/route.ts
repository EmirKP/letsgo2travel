import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ['moderator', 'admin', 'super_admin']);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase admin not initialized" }, { status: 500 });

  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
    const status = url.searchParams.get("status");
    const targetType = url.searchParams.get("target_type");
    const search = url.searchParams.get("search");

    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let query = supabase.from("forum_reports").select("*", { count: "exact" });

    if (status) query = query.eq("status", status);
    if (targetType) query = query.eq("target_type", targetType);
    if (search) {
      query = query.ilike("reason", `%${search}%`);
    }

    query = query.order("created_at", { ascending: false }).range(start, end);

    const { data: reports, count, error } = await query;
    if (error) throw error;

    // Enhance with target details
    const enhancedReports = await Promise.all(
      (reports || []).map(async (report) => {
        let targetContent = null;
        if (report.target_type === "topic") {
          const { data } = await supabase.from("forum_topics").select("title, content, author_name").eq("id", report.target_id).single();
          targetContent = data;
        } else if (report.target_type === "reply") {
          const { data } = await supabase.from("forum_replies").select("content, author_name").eq("id", report.target_id).single();
          targetContent = data;
        }
        return { ...report, targetContent };
      })
    );

    return NextResponse.json({ data: enhancedReports, count, page, limit });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authError = await requireAdmin(request, ['moderator', 'admin', 'super_admin']);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase admin not initialized" }, { status: 500 });

  try {
    const body = await request.json();
    const { id, ids, status } = body;
    if (!status) return NextResponse.json({ error: "status required" }, { status: 400 });

    const targetIds = ids || (id ? [id] : []);
    if (targetIds.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

    const { error } = await supabase.from("forum_reports").update({ status }).in("id", targetIds);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authError = await requireAdmin(request, ['moderator', 'admin', 'super_admin']);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase admin not initialized" }, { status: 500 });

  try {
    const body = await request.json();
    const { id, ids } = body;
    
    const targetIds = ids || (id ? [id] : []);
    if (targetIds.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

    const { error } = await supabase.from("forum_reports").delete().in("id", targetIds);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

