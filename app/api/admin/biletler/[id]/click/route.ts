import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Tıklama kaydı şu anda kullanılamıyor." }, { status: 503 });
  const { error } = await supabase.rpc("increment_deal_click", { deal_id: id }).select();
  if (error) return NextResponse.json({ error: "Tıklama kaydedilemedi." }, { status: 500 });
  return NextResponse.json({ message: "Tıklama kaydedildi" });
}
