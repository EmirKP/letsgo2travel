import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendMailAndLog, generateAlertCreatedEmailHtml } from "@/lib/mail";
import {
  createAlertToken,
  hashAlertToken,
  makeUnsubscribeLink,
  priceAlertSubject,
  tokenExpiresInOneYear,
} from "@/lib/price-alerts";

export const dynamic = "force-dynamic";

function cleanEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getUserIdFromRequest(request: Request, supabase: any) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id || null;
}

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
      thresholdPercent,
    } = body;

    if (!email || !originCode || !destinationCode || !departureDate) {
      return NextResponse.json({ error: "Eksik parametreler." }, { status: 400 });
    }

    const normalizedEmail = cleanEmail(String(email));
    const userId = await getUserIdFromRequest(request, supabase);
    const plainToken = createAlertToken();
    const manageTokenHash = hashAlertToken(plainToken);
    const manageTokenExpiresAt = tokenExpiresInOneYear();

    const { data, error } = await supabase.from("flight_price_alerts").insert({
      user_id: userId,
      email: normalizedEmail,
      origin_code: originCode,
      origin_label: originLabel || originCode,
      destination_code: destinationCode,
      destination_label: destinationLabel || destinationCode,
      departure_date: departureDate,
      return_date: returnDate || null,
      trip_type: tripType || "one_way",
      adults: adults || 1,
      children: children || 0,
      infants: infants || 0,
      cabin_class: cabinClass || "economy",
      base_price: null,
      target_price: targetPrice || null,
      threshold_percent: thresholdPercent || 5,
      last_checked_price: null,
      lowest_price_seen: null,
      last_checked_at: null,
      manage_token_hash: manageTokenHash,
      manage_token_expires_at: manageTokenExpiresAt,
      notify_email: true,
      status: "active",
      last_mail_status: null,
      error_count: 0,
    }).select().single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: "Alarm kaydedilemedi." }, { status: 500 });
    }

    const unsubscribeLink = makeUnsubscribeLink(data.id, plainToken);
    const subject = priceAlertSubject({ originLabel: originLabel || originCode, destinationLabel: destinationLabel || destinationCode, type: "created" });
    const emailHtml = generateAlertCreatedEmailHtml({
      originLabel: originLabel || originCode,
      destinationLabel: destinationLabel || destinationCode,
      departureDate,
      unsubscribeLink,
    });

    const mailRes = await sendMailAndLog({
      supabase,
      to: normalizedEmail,
      subject,
      html: emailHtml,
      category: "price_alert_created",
      referenceType: "flight_price_alert",
      referenceId: data.id,
    });

    await supabase.from("flight_price_alerts").update({
      last_mail_status: mailRes.success ? "created_sent" : "created_failed",
      last_error_message: mailRes.success ? null : mailRes.error || "Onay maili gönderilemedi",
      last_error_at: mailRes.success ? null : new Date().toISOString(),
    }).eq("id", data.id);

    return NextResponse.json({
      success: true,
      id: data.id,
      message: mailRes.success
        ? "Fiyat alarmın kuruldu. Onay maili gönderildi."
        : "Fiyat alarmın kuruldu fakat onay maili gönderilemedi. Alarm yine de aktif.",
    });
  } catch (error) {
    console.error("POST flight-alerts error:", error);
    return NextResponse.json({ error: "Bir hata oluştu." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: [] });

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Yetkisiz erişim. Oturum gerekli." }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("flight_price_alerts")
    .select("id, user_id, email, origin_code, origin_label, destination_code, destination_label, departure_date, return_date, trip_type, adults, children, infants, cabin_class, currency, base_price, target_price, threshold_percent, last_checked_price, lowest_price_seen, last_notified_price, last_checked_at, last_notified_at, notify_email, notify_push, is_active, status, last_mail_status, last_error_message, last_error_at, error_count, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
