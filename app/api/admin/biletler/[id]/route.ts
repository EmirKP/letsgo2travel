import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeFlightDealMutation } from "@/lib/flight-deal-input";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(request);
  if (authError) return authError;
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı kurulamadı." }, { status: 503 });
  const { data: existing, error: lookupError } = await supabase.from("biletler").select("*").eq("id", id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Fırsat bulunamadı." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const normalized = normalizeFlightDealMutation(body, existing);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const { data, error } = await supabase.from("biletler").update(normalized.data).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag("flight-deals", "max");
  return NextResponse.json({ data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(request);
  if (authError) return authError;
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı kurulamadı." }, { status: 503 });
  const { error } = await supabase.from("biletler").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag("flight-deals", "max");
  return NextResponse.json({ message: "Silindi" });
}
