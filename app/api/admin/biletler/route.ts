import { NextResponse } from "next/server";
import { getFlightDeals } from "@/lib/data";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const deals = await getFlightDeals();
  return NextResponse.json({ data: deals });
}

export async function POST(request: Request) {
  const authError = await requireAdmin(request, ['editor', 'admin', 'super_admin']);
  if (authError) return authError;
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: { ...body, id: Date.now(), active: true }, message: "Demo mod: Supabase bağlı değil." });
  const { data, error } = await supabase.from("biletler").insert(body).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

