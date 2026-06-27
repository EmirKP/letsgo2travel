import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { businessName, authorizedPerson, email, phone, contentUrl, objectionType, description, confirmed } = body;

    if (!confirmed) {
      return NextResponse.json({ error: 'Bu talebi yetkili kişi olarak oluşturduğunuzu kabul etmelisiniz.' }, { status: 400 });
    }

    if (!businessName || !authorizedPerson || !email || !contentUrl || !objectionType || !description) {
      return NextResponse.json({ error: 'Zorunlu alanlar eksik.' }, { status: 400 });
    }

    // Rate Limit (basit IP tabanlı yavaşlatma eklenebilir, şu an atlıyoruz)
    
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

  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
