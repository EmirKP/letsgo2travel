import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service role key ile işlem yapıyoruz çünkü tabloya RLS ile ekleme yapmak isteyebiliriz
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, username, requestType, description, confirmed } = body;

    if (!confirmed) {
      return NextResponse.json({ error: 'Doğrulama kutusu işaretlenmelidir.' }, { status: 400 });
    }

    if (!name || !email || !requestType || !description) {
      return NextResponse.json({ error: 'Zorunlu alanlar eksik.' }, { status: 400 });
    }

    // Auth kontrolü (isteğe bağlı ama guest'ler de form doldurabilir diye userId'siz insert atıyoruz)
    // Supabase şemasında `user_id` UUID olarak required görünüyor:
    // `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL`
    // Bu yüzden eğer form dışarıya açık olacaksa şemada user_id opsiyonel olmalı ya da oturum açmış kullanıcıları zorlamalı.
    // Şema kontrolü: user_id NOT NULL diyor. Öyleyse session almalıyız.
    
    // Auth header'dan token alalım
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Geçersiz oturum.' }, { status: 401 });
    }

    const { error: insertError } = await supabase
      .from('kvkk_requests')
      .insert({
        user_id: user.id,
        request_type: requestType,
        notes: `İsim: ${name}\nE-posta: ${email}\nKullanıcı Adı: ${username || '-'}\nAçıklama: ${description}`,
        status: 'pending'
      });

    if (insertError) {
      console.error('KVKK Insert Error:', insertError);
      return NextResponse.json({ error: 'Talep kaydedilemedi.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Talebiniz alınmıştır. Başvurunuz ilgili mevzuat kapsamında değerlendirilecektir. Gerekli hallerde kimlik doğrulama amacıyla ek bilgi talep edilebilir.' });

  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Sunucu hatası oluştu.' }, { status: 500 });
  }
}
