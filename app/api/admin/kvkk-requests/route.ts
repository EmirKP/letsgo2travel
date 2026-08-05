import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const ALLOWED_STATUSES = new Set(['pending', 'reviewing', 'resolved', 'rejected']);
const ACCOUNT_DELETION_TYPE = 'Hesabımı kapatmak istiyorum';

export async function GET(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Sunucu yapılandırması eksik.' }, { status: 503 });

    const { data, error } = await supabase
      .from('kvkk_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('KVKK talepleri okunamadı:', error.code || 'unknown');
      return NextResponse.json({ error: 'KVKK Talepleri alınamadı.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });

  } catch (error: unknown) {
    console.error('KVKK listeleme API hatası:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const body = await req.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
    if (!body) return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
    const { id, status } = body;

    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || typeof status !== 'string' || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Geçersiz id veya durum.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Sunucu yapılandırması eksik.' }, { status: 503 });

    const { data: current, error: currentError } = await supabase
      .from('kvkk_requests')
      .select('request_type,status')
      .eq('id', id)
      .maybeSingle();
    if (currentError) return NextResponse.json({ error: 'Talep okunamadı.' }, { status: 500 });
    if (!current) return NextResponse.json({ error: 'Talep bulunamadı.' }, { status: 404 });
    if (current.request_type === ACCOUNT_DELETION_TYPE && status === 'resolved') {
      return NextResponse.json({ error: 'Hesap kapatma talebi yalnızca kalıcı silme işlemi tamamlandıktan sonra sonuçlanabilir.' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('kvkk_requests')
      .update({ status, processed_at: ['resolved', 'rejected'].includes(status) ? new Date().toISOString() : null })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('KVKK talebi güncellenemedi:', error.code || 'unknown');
      return NextResponse.json({ error: 'Talep güncellenemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });

  } catch (error: unknown) {
    console.error('KVKK güncelleme API hatası:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
