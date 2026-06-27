import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ['editor', 'admin', 'super_admin']);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: [] });
  
  const { data, error } = await supabase.from("country_guides").select("*").order("created_at", { ascending: false });
  if (error) {
    if (error.code === '42P01') { 
      return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (country_guides tablosu yok)." }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const authError = await requireAdmin(request, ['editor', 'admin', 'super_admin']);
  if (authError) return authError;
  
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (country_guides tablosu yok)." }, { status: 500 });
  }

  const body = await request.json();
  
  const { data, error } = await supabase.from('country_guides').insert([body]).select().single();

  if (error) {
    return NextResponse.json({ error: `Backend entegrasyonu gerekiyor: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ data, message: "Rehber başarıyla eklendi" });
}

export async function PUT(request: Request) {
  const authError = await requireAdmin(request, ['editor', 'admin', 'super_admin']);
  if (authError) return authError;
  
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (country_guides tablosu yok)." }, { status: 500 });
  }

  const body = await request.json();
  const { id, ...updateData } = body;
  
  if (!id) return NextResponse.json({ error: "ID zorunludur." }, { status: 400 });

  const { data, error } = await supabase.from('country_guides').update(updateData).eq('id', id).select().single();

  if (error) {
    return NextResponse.json({ error: `Backend entegrasyonu gerekiyor: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ data, message: "Rehber başarıyla güncellendi" });
}

export async function DELETE(request: Request) {
  const authError = await requireAdmin(request, ['editor', 'admin', 'super_admin']);
  if (authError) return authError;
  
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (country_guides tablosu yok)." }, { status: 500 });
  }

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });

  const { error } = await supabase.from('country_guides').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: `Backend entegrasyonu gerekiyor: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ message: "Kayıt silindi" });
}
