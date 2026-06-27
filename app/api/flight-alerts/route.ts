import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchCheapestPrice } from "@/lib/travelpayouts";
import { sendMail, generateAlertCreatedEmailHtml } from "@/lib/mail";

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu hatası." }, { status: 500 });
  }

  try {
    const body = await request.json();
    const {
      originCode,
      originLabel,
      destinationCode,
      destinationLabel,
      departureDate,
      returnDate,
      tripType,
      adults,
      children,
      infants,
      cabinClass,
      email,
      targetPrice,
      thresholdPercent
    } = body;

    if (!email || !originCode || !destinationCode || !departureDate) {
      return NextResponse.json({ error: "Eksik parametreler." }, { status: 400 });
    }

    let userId = null;
    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    // Fiyat çekme işlemi kayıt oluşturmayı geciktirmemesi (timeout) için kaldırıldı.
    // İlk fiyatı cron job veya background worker sonradan bulup güncelleyecek.
    const basePrice = null;

    let manageTokenHash = null;
    let manageTokenExpiresAt = null;
    let plainToken = null;

    if (!userId) {
      plainToken = crypto.randomBytes(32).toString('hex');
      manageTokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
      const expires = new Date();
      expires.setFullYear(expires.getFullYear() + 1);
      manageTokenExpiresAt = expires.toISOString();
    }

    const { data, error } = await supabase.from("flight_price_alerts").insert({
      user_id: userId,
      email,
      origin_code: originCode,
      origin_label: originLabel,
      destination_code: destinationCode,
      destination_label: destinationLabel,
      departure_date: departureDate,
      return_date: returnDate || null,
      trip_type: tripType || "one_way",
      adults: adults || 1,
      children: children || 0,
      infants: infants || 0,
      cabin_class: cabinClass || "economy",
      base_price: basePrice,
      target_price: targetPrice || null,
      threshold_percent: thresholdPercent || 5,
      last_checked_price: basePrice,
      lowest_price_seen: basePrice,
      last_checked_at: basePrice ? new Date().toISOString() : null,
      manage_token_hash: manageTokenHash,
      manage_token_expires_at: manageTokenExpiresAt
    }).select().single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: "Alarm kaydedilemedi." }, { status: 500 });
    }

    // Send confirmation email
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host") || "letsgo2travel.com.tr";
    
    // For MVP frontend might not have a dedicated cancel page, so we could link directly to a generic page or API
    // If the frontend has an unsubscribe UI page, use it here. Let's assume /api/price-alerts/[id] for direct deletion MVP if no UI exists,
    // but browser GET isn't DELETE. So we should route to a frontend page like /fiyat-kontrolu?cancelAlert=ID&token=TOKEN
    // For now, we will construct a link that the user can use or the frontend can parse.
    const unsubscribeLink = !userId && plainToken ? `${protocol}://${host}/profil/fiyat-alarmlari?cancelAlert=${data.id}&token=${plainToken}` : null;

    const emailHtml = generateAlertCreatedEmailHtml({
      originLabel,
      destinationLabel,
      departureDate,
      unsubscribeLink
    });

    try {
      await sendMail({
        to: email,
        subject: `Fiyat Alarmınız Kuruldu: ${originLabel} ✈️ ${destinationLabel}`,
        html: emailHtml
      });
    } catch (mailErr) {
      console.error("Mail gönderme hatası (Onay maili):", mailErr);
      // Mail hatası alarm kaydını engellemesin
    }

    return NextResponse.json({ 
      success: true, 
      message: "Fiyat alarmın kuruldu. İlk fiyat kontrolünde seni bilgilendireceğiz." 
    });

  } catch (error) {
    console.error("POST price-alerts error:", error);
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: [] });

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Yetkisiz erişim (Oturum gerekli)." }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("flight_price_alerts")
    .select("id, user_id, email, origin_code, origin_label, destination_code, destination_label, departure_date, return_date, trip_type, adults, children, infants, cabin_class, currency, base_price, target_price, threshold_percent, last_checked_price, lowest_price_seen, last_notified_price, last_checked_at, last_notified_at, notify_email, notify_push, is_active, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
