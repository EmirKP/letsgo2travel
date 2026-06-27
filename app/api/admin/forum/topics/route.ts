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
    const search = url.searchParams.get("search");
    const category = url.searchParams.get("category");
    const country = url.searchParams.get("country");

    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let query = supabase.from("forum_topics").select("*", { count: "exact" });

    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (country) query = query.eq("country_slug", country);
    if (search) {
      // Basic text search on title or author
      query = query.or(`title.ilike.%${search}%,author_name.ilike.%${search}%`);
    }

    query = query.order("created_at", { ascending: false }).range(start, end);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data, count, page, limit });
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

    const { error } = await supabase.from("forum_topics").update({ status }).in("id", targetIds);
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

    const { error } = await supabase.from("forum_topics").delete().in("id", targetIds);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

