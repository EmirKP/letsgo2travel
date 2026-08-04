import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const rateLimits = new Map<string, { count: number; resetAt: number }>();

function cleanText(value: unknown, maxLength: number) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 30_000) return NextResponse.json({ error: 'İstek çok büyük.' }, { status: 413 });

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const now = Date.now();
    const current = rateLimits.get(ip);
    if (current && current.resetAt > now && current.count >= 3) {
      return NextResponse.json({ error: 'Çok fazla talep gönderdiniz. Lütfen daha sonra tekrar deneyin.' }, { status: 429 });
    }
    rateLimits.set(ip, current && current.resetAt > now
      ? { ...current, count: current.count + 1 }
      : { count: 1, resetAt: now + 60 * 60 * 1000 });

    const body = await req.json();
    const businessName = cleanText(body.businessName, 160);
    const authorizedPerson = cleanText(body.authorizedPerson, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const phone = cleanText(body.phone, 40);
    const contentUrl = cleanText(body.contentUrl, 500);
    const objectionType = cleanText(body.objectionType, 80);
    const description = cleanText(body.description, 4000);
    const confirmed = body.confirmed;

    if (!confirmed) {
      return NextResponse.json({ error: 'Bu talebi yetkili kişi olarak oluşturduğunuzu kabul etmelisiniz.' }, { status: 400 });
    }

    if (!businessName || !authorizedPerson || !email || !contentUrl || !objectionType || !description) {
      return NextResponse.json({ error: 'Zorunlu alanlar eksik.' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Geçerli bir e-posta adresi yazın.' }, { status: 400 });
    }

    try {
      const parsedUrl = new URL(contentUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Geçersiz protokol');
    } catch {
      return NextResponse.json({ error: 'Geçerli bir içerik bağlantısı yazın.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'Sunucu yapılandırması eksik.' }, { status: 503 });
    
    const { error: insertError } = await supabase
      .from('business_objections')
      .insert({
        business_name: businessName,
        authorized_person: authorizedPerson,
        email: email,
        phone: phone || null,
        objection_type: objectionType,
        content_url: contentUrl,
        description: description,
        status: 'pending'
      });

    if (insertError) {
      console.error('Business Objection Insert Error:', insertError);
      return NextResponse.json({ error: 'İtirazınız kaydedilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'İtirazınız alınmıştır. Talebiniz incelendikten sonra tarafınıza dönüş yapılacaktır.' });

  } catch (err: unknown) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
