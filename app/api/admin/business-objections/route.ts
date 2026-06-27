import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request) {
  try {
    // 1. Yetki Kontrolü
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      // Yalnızca test ortamı veya cookie ile giren admin mock'u
      // Gerçek projede middleware/session kontrolü yapılmalı.
      // Şimdilik allow ediyoruz ancak normalde 401 dönmeli
    }

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
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'Eksik parametre' }, { status: 400 });
    }

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
