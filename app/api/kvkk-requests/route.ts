import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/authenticated-user';

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

    if (!confirmed) {
      return NextResponse.json({ error: 'Doğrulama kutusu işaretlenmelidir.' }, { status: 400 });
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
