import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getFlightDeals } from "@/lib/data";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeFlightDealMutation } from "@/lib/flight-deal-input";

export async function GET() {
  const deals = await getFlightDeals();
  return NextResponse.json({ data: deals });
}

export async function POST(request: Request) {
  const authError = await requireAdmin(request, ['editor', 'admin', 'super_admin']);
  if (authError) return authError;
  const body = await request.json().catch(() => null);
  const normalized = normalizeFlightDealMutation(body);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı kurulamadı." }, { status: 503 });
  const { data, error } = await supabase.from("biletler").insert(normalized.data).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag("flight-deals", "max");
  return NextResponse.json({ data });
}
