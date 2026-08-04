import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const ALLOWED_STATUSES = new Set(['pending', 'reviewing', 'resolved', 'rejected']);

export async function GET(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Sunucu yapılandırması eksik.' }, { status: 503 });

    const { data, error } = await supabase
      .from('business_objections')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch Objections Error:', error);
      return NextResponse.json({ error: 'İtirazlar alınamadı.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });

  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const body = await req.json();
    const { id, status } = body;

    if (!id || typeof status !== 'string' || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Geçersiz id veya durum.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Sunucu yapılandırması eksik.' }, { status: 503 });

    const { data, error } = await supabase
      .from('business_objections')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update Objection Error:', error);
      return NextResponse.json({ error: 'İtiraz güncellenemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });

  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
