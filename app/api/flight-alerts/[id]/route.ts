import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function getCurrentUser(request: Request, supabase: any) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Backend entegrasyonu hatası." }, { status: 500 });

  try {
    const resolvedParams = await params;
    const body = await request.json();
    const { is_active, target_price, threshold_percent, notify_email, notify_push } = body;

    const { data: alertData, error: fetchError } = await supabase
      .from("flight_price_alerts")
      .select("user_id")
      .eq("id", resolvedParams.id)
      .single();

    if (fetchError || !alertData) {
      return NextResponse.json({ error: "Alarm bulunamadı." }, { status: 404 });
    }

    if (alertData.user_id) {
      const currentUser = await getCurrentUser(request, supabase);
      if (!currentUser) {
        return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
      }
      if (alertData.user_id !== currentUser.id) {
        return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Misafir alarmları bu menüden güncellenemez." }, { status: 403 });
    }

    const updatePayload: any = {};
    if (is_active !== undefined) updatePayload.is_active = is_active;
    if (target_price !== undefined) updatePayload.target_price = target_price;
    if (threshold_percent !== undefined) updatePayload.threshold_percent = threshold_percent;
    if (notify_email !== undefined) updatePayload.notify_email = notify_email;
    if (notify_push !== undefined) updatePayload.notify_push = notify_push;

    const { error: updateError } = await supabase
      .from("flight_price_alerts")
      .update(updatePayload)
      .eq("id", resolvedParams.id);

    if (updateError) {
      return NextResponse.json({ error: "Güncelleme başarısız." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Alarm güncellendi." });
  } catch (e) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Backend entegrasyonu hatası." }, { status: 500 });

  try {
    const resolvedParams = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    
    const { data: alertData, error: fetchError } = await supabase
      .from("flight_price_alerts")
      .select("user_id, manage_token_hash, manage_token_expires_at")
      .eq("id", resolvedParams.id)
      .single();

    if (fetchError || !alertData) {
      return NextResponse.json({ error: "Alarm bulunamadı." }, { status: 404 });
    }

    if (alertData.user_id) {
       const currentUser = await getCurrentUser(request, supabase);
       if (!currentUser) {
         return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
       }
       if (alertData.user_id !== currentUser.id) {
         return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403 });
       }
    } else {
       if (!token) {
         return NextResponse.json({ error: "Token eksik." }, { status: 401 });
       }
       
       if (alertData.manage_token_expires_at && new Date(alertData.manage_token_expires_at) < new Date()) {
         return NextResponse.json({ error: "Token süresi dolmuş." }, { status: 401 });
       }

       if (!alertData.manage_token_hash) {
         return NextResponse.json({ error: "Alarm token'ı bulunamadı." }, { status: 400 });
       }
       
       const hashedTokenBuffer = crypto.createHash("sha256").update(token).digest();
       const storedHashBuffer = Buffer.from(alertData.manage_token_hash, 'hex');
       
       if (hashedTokenBuffer.length !== storedHashBuffer.length || !crypto.timingSafeEqual(hashedTokenBuffer, storedHashBuffer)) {
         return NextResponse.json({ error: "Geçersiz token." }, { status: 401 });
       }
    }

    const { error: updateError } = await supabase
      .from("flight_price_alerts")
      .update({ is_active: false })
      .eq("id", resolvedParams.id);

    if (updateError) {
      return NextResponse.json({ error: "Silme işlemi başarısız." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Alarm kapatıldı." });
  } catch (e) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
}
