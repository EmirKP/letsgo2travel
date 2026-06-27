import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(request);
  if (authError) return authError;
  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: { ...body, id }, message: "Demo mod: güncelleme simüle edildi." });
  const { data, error } = await supabase.from("biletler").update(body).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(request);
  if (authError) return authError;
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "Demo mod: silme simüle edildi." });
  const { error } = await supabase.from("biletler").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Silindi" });
}
