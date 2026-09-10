import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/authenticated-user';
import { ACCOUNT_DELETION_TYPE, deletionSummary } from '@/lib/account-deletion-policy';

const REQUEST_TYPES = new Set([
  'Verilerimi görmek istiyorum',
  'Verilerimi düzeltmek istiyorum',
  'Verilerimin silinmesini istiyorum',
  'Doğrulama geçmişimin silinmesini istiyorum',
  'Açık rızamı geri çekmek istiyorum',
  'Hesabımı kapatmak istiyorum',
  'Diğer',
]);

function cleanText(value: unknown, maxLength: number) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) return auth.response;
    const result = await auth.supabase.from('kvkk_requests')
      .select('id,status,created_at,target_completion_at,processed_at,completion_notification_status')
      .eq('user_id', auth.user.id).eq('request_type', ACCOUNT_DELETION_TYPE)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) return NextResponse.json({ error: 'Hesap silme durumu şu anda alınamıyor.' }, { status: 503 });
    return NextResponse.json({ request: result.data ? deletionSummary(result.data) : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Talep durumu alınamadı.' }, { status: 503 }); }
}

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 20_000) return NextResponse.json({ error: 'İstek çok büyük.' }, { status: 413 });

    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
    const name = cleanText(body.name, 120);
    const username = cleanText(body.username, 80);
    const requestType = cleanText(body.requestType, 100);
    const description = cleanText(body.description, 4000);
    const confirmed = body.confirmed;

    if (confirmed !== true) {
      return NextResponse.json({ error: 'Doğrulama kutusu işaretlenmelidir.' }, { status: 400 });
    }

    if (requestType === ACCOUNT_DELETION_TYPE) {
      const result = await supabase.rpc('create_account_deletion_request', {
        p_user_id: user.id, p_locale: body.locale === 'en' ? 'en' : 'tr',
      });
      const record = result.data?.[0];
      if (result.error || !record) return NextResponse.json({ error: 'Hesap silme talebi şu anda kaydedilemiyor. Lütfen tekrar deneyin.' }, { status: 503 });
      return NextResponse.json({ success: true, request: deletionSummary(record), message: 'Hesap silme talebiniz alındı. En geç 30 gün içinde tamamlanması hedeflenir; sonuç e-posta ile bildirilir.' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (!name || !requestType || !description || !REQUEST_TYPES.has(requestType)) {
      return NextResponse.json({ error: 'Zorunlu alanlar eksik.' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('kvkk_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('request_type', requestType)
      .in('status', ['pending', 'reviewing'])
      .limit(1);

    if (existingError) {
      return NextResponse.json({ error: 'Mevcut talepler kontrol edilemedi.' }, { status: 500 });
    }
    if (existing?.length) {
      return NextResponse.json({ error: 'Bu talep türü için zaten açık bir başvurunuz var.' }, { status: 409 });
    }

    const { error: insertError } = await supabase
      .from('kvkk_requests')
      .insert({
        user_id: user.id,
        request_type: requestType,
        notes: `İsim: ${name}\nE-posta: ${user.email || '-'}\nKullanıcı Adı: ${username || '-'}\nAçıklama: ${description}`,
        status: 'pending'
      });

    if (insertError) {
      console.error('KVKK talebi kaydedilemedi:', insertError.code || 'unknown');
      return NextResponse.json({ error: 'Talep kaydedilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Talebiniz alınmıştır. Başvurunuz ilgili mevzuat kapsamında değerlendirilecektir. Gerekli hallerde kimlik doğrulama amacıyla ek bilgi talep edilebilir.' });

  } catch {
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
