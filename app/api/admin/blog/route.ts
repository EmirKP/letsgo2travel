import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ['editor', 'admin', 'super_admin']);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: [] });
  
  // Try to fetch blog posts, if table is missing, supabase will return error which we pass back.
  const { data, error } = await supabase.from("blog_posts").select("*").order("created_at", { ascending: false });
  if (error) {
    if (error.code === '42P01') { // 42P01 is PostgreSQL "undefined_table"
      return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (blog_posts tablosu yok)." }, { status: 500 });
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
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (blog_posts tablosu yok)." }, { status: 500 });
  }

  const body = await request.json();
  const { title, slug, category, image_url, summary, content, seo_title, seo_description, status } = body;
  
  if (!title || !slug) return NextResponse.json({ error: "Başlık ve URL (slug) zorunludur." }, { status: 400 });

  const { data, error } = await supabase.from('blog_posts').insert([{
    title, slug, category, image_url, summary, content, seo_title, seo_description, status
  }]).select().single();

  if (error) {
    return NextResponse.json({ error: `Backend entegrasyonu gerekiyor: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ data, message: "Yazı başarıyla eklendi" });
}

export async function PUT(request: Request) {
  const authError = await requireAdmin(request, ['editor', 'admin', 'super_admin']);
  if (authError) return authError;
  
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (blog_posts tablosu yok)." }, { status: 500 });
  }

  const body = await request.json();
  const { id, title, slug, category, image_url, summary, content, seo_title, seo_description, status } = body;
  
  if (!id) return NextResponse.json({ error: "ID zorunludur." }, { status: 400 });

  const { data, error } = await supabase.from('blog_posts').update({
    title, slug, category, image_url, summary, content, seo_title, seo_description, status
  }).eq('id', id).select().single();

  if (error) {
    return NextResponse.json({ error: `Backend entegrasyonu gerekiyor: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ data, message: "Yazı başarıyla güncellendi" });
}

export async function DELETE(request: Request) {
  const authError = await requireAdmin(request, ['editor', 'admin', 'super_admin']);
  if (authError) return authError;
  
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor (blog_posts tablosu yok)." }, { status: 500 });
  }

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });

  const { error } = await supabase.from('blog_posts').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: `Backend entegrasyonu gerekiyor: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ message: "Kayıt silindi" });
}
