import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ message: "Demo click kaydı" });
  const { error } = await supabase.rpc("increment_deal_click", { deal_id: id }).select();
  if (error) return NextResponse.json({ message: "Click kaydı atlandı", detail: error.message });
  return NextResponse.json({ message: "Click kaydedildi" });
}
