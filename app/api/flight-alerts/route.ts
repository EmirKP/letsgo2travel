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

const alertAttempts = new Map<string, { count: number; resetAt: number }>();
const CABIN_CLASSES = new Set(["economy", "premium_economy", "business", "first"]);

function cleanEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getUserIdFromRequest(request: Request, supabase: any) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id || null;
}

function validTravelDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function cleanLabel(value: unknown, fallback: string) {
  return String(value || fallback).replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 20_000) {
    return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const attempt = alertAttempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 3) {
    return NextResponse.json(
      { error: "Çok fazla fiyat alarmı denemesi yaptınız. Lütfen daha sonra tekrar deneyin." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  alertAttempts.set(ip, attempt && attempt.resetAt > now
    ? { ...attempt, count: attempt.count + 1 }
    : { count: 1, resetAt: now + 60 * 60 * 1000 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Fiyat alarmı servisi şu anda kullanılamıyor." }, { status: 503 });
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

    const normalizedEmail = cleanEmail(String(email));
    const normalizedOrigin = String(originCode || "").trim().toUpperCase();
    const normalizedDestination = String(destinationCode || "").trim().toUpperCase();
    const normalizedDepartureDate = String(departureDate || "").trim();
    const normalizedTripType = tripType === "round_trip" ? "round_trip" : "one_way";
    const normalizedReturnDate = normalizedTripType === "round_trip" && returnDate ? String(returnDate).trim() : "";
    const normalizedAdults = Number(adults ?? 1);
    const normalizedChildren = Number(children ?? 0);
    const normalizedInfants = Number(infants ?? 0);
    const normalizedCabinClass = String(cabinClass || "economy");
    const normalizedTargetPrice = targetPrice === null || targetPrice === undefined || targetPrice === "" ? null : Number(targetPrice);
    const normalizedThreshold = thresholdPercent === null || thresholdPercent === undefined || thresholdPercent === "" ? 5 : Number(thresholdPercent);
    const normalizedOriginLabel = cleanLabel(originLabel, normalizedOrigin);
    const normalizedDestinationLabel = cleanLabel(destinationLabel, normalizedDestination);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      return NextResponse.json({ error: "Geçerli bir e-posta adresi yazın." }, { status: 400 });
    }
    if (!/^[A-Z]{3}$/.test(normalizedOrigin) || !/^[A-Z]{3}$/.test(normalizedDestination) || normalizedOrigin === normalizedDestination) {
      return NextResponse.json({ error: "Kalkış ve varış havalimanı kodları geçersiz." }, { status: 400 });
    }
    if (!validTravelDate(normalizedDepartureDate) || (normalizedReturnDate && !validTravelDate(normalizedReturnDate))
      || (normalizedTripType === "round_trip" && (!normalizedReturnDate || normalizedReturnDate < normalizedDepartureDate))) {
      return NextResponse.json({ error: "Seyahat tarihleri geçersiz." }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const maxDeparture = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (normalizedDepartureDate < today || normalizedDepartureDate > maxDeparture) {
      return NextResponse.json({ error: "Kalkış tarihi bugünden itibaren iki yıl içinde olmalıdır." }, { status: 400 });
    }
    if (!Number.isInteger(normalizedAdults) || normalizedAdults < 1 || normalizedAdults > 9
      || !Number.isInteger(normalizedChildren) || normalizedChildren < 0 || normalizedChildren > 9
      || !Number.isInteger(normalizedInfants) || normalizedInfants < 0 || normalizedInfants > normalizedAdults) {
      return NextResponse.json({ error: "Yolcu sayıları geçersiz." }, { status: 400 });
    }
    if (!CABIN_CLASSES.has(normalizedCabinClass)
      || (normalizedTargetPrice !== null && (!Number.isFinite(normalizedTargetPrice) || normalizedTargetPrice < 1 || normalizedTargetPrice > 10_000_000))
      || !Number.isFinite(normalizedThreshold) || normalizedThreshold < 1 || normalizedThreshold > 90) {
      return NextResponse.json({ error: "Kabin veya fiyat eşiği geçersiz." }, { status: 400 });
    }

    const { count: activeAlertCount, error: countError } = await supabase
      .from("flight_price_alerts")
      .select("id", { count: "exact", head: true })
      .eq("email", normalizedEmail)
      .in("status", ["active", "paused"]);
    if (countError) return NextResponse.json({ error: "Fiyat alarmları kontrol edilemedi." }, { status: 500 });
    if ((activeAlertCount || 0) >= 10) {
      return NextResponse.json({ error: "Bu e-posta adresi için en fazla 10 aktif alarm oluşturabilirsiniz." }, { status: 409 });
    }

    const { data: duplicateAlert, error: duplicateError } = await supabase
      .from("flight_price_alerts")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("origin_code", normalizedOrigin)
      .eq("destination_code", normalizedDestination)
      .eq("departure_date", normalizedDepartureDate)
      .in("status", ["active", "paused"])
      .limit(1);
    if (duplicateError) return NextResponse.json({ error: "Fiyat alarmları kontrol edilemedi." }, { status: 500 });
    if (duplicateAlert?.length) {
      return NextResponse.json({ error: "Bu rota ve tarih için zaten aktif bir alarmınız var." }, { status: 409 });
    }

    const userId = await getUserIdFromRequest(request, supabase);
    const plainToken = createAlertToken();
    const manageTokenHash = hashAlertToken(plainToken);
    const manageTokenExpiresAt = tokenExpiresInOneYear();

    const { data, error } = await supabase.from("flight_price_alerts").insert({
      user_id: userId,
      email: normalizedEmail,
      origin_code: normalizedOrigin,
      origin_label: normalizedOriginLabel,
      destination_code: normalizedDestination,
      destination_label: normalizedDestinationLabel,
      departure_date: normalizedDepartureDate,
      return_date: normalizedReturnDate || null,
      trip_type: normalizedTripType,
      adults: normalizedAdults,
      children: normalizedChildren,
      infants: normalizedInfants,
      cabin_class: normalizedCabinClass,
      base_price: null,
      target_price: normalizedTargetPrice,
      threshold_percent: normalizedThreshold,
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
    const subject = priceAlertSubject({ originLabel: normalizedOriginLabel, destinationLabel: normalizedDestinationLabel, type: "created" });
    const emailHtml = generateAlertCreatedEmailHtml({
      originLabel: normalizedOriginLabel,
      destinationLabel: normalizedDestinationLabel,
      departureDate: normalizedDepartureDate,
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

    if (!mailRes.success || mailRes.providerId === "mock") {
      await supabase.from("flight_price_alerts").delete().eq("id", data.id);
      return NextResponse.json({ error: "Onay e-postası gönderilemedi; alarm oluşturulmadı. Lütfen daha sonra tekrar deneyin." }, { status: 503 });
    }

    await supabase.from("flight_price_alerts").update({
      last_mail_status: "created_sent",
      last_error_message: null,
      last_error_at: null,
    }).eq("id", data.id);

    return NextResponse.json({
      success: true,
      id: data.id,
      message: "Fiyat alarmın kuruldu. Onay e-postası gönderildi.",
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
