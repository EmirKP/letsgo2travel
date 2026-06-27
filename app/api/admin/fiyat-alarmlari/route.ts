import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ['admin', 'super_admin']);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: [] });
  // Query from the new flight_price_alerts table
  const { data, error } = await supabase.from("flight_price_alerts").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

export async function DELETE(request: Request) {
  const authError = await requireAdmin(request, ['admin', 'super_admin']);
  if (authError) return authError;
  
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (subscribers tablosu veya veritabanı bağlantısı yok)." }, { status: 500 });
  }

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });

  const { error } = await supabase.from('flight_price_alerts').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: `Backend entegrasyonu gerekiyor: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ message: "Kayıt silindi" });
}

export async function PATCH(request: Request) {
  const authError = await requireAdmin(request, ['admin', 'super_admin']);
  if (authError) return authError;
  
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (veritabanı bağlantısı yok)." }, { status: 500 });
  }

  const body = await request.json();
  const { id, is_active } = body;
  if (!id || is_active === undefined) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });

  const { error } = await supabase.from('flight_price_alerts').update({ is_active }).eq('id', id);
  if (error) {
    return NextResponse.json({ error: `Backend entegrasyonu gerekiyor: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ message: "Durum güncellendi" });
}
