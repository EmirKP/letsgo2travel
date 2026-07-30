import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSchengenCountry } from "@/lib/visa-appointments/catalog";
import {
  APPLICATION_CITIES,
  VISA_CATEGORIES,
  type TrackCreateInput,
} from "@/lib/visa-appointments/types";

export const dynamic = "force-dynamic";

async function authenticatedUser(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { supabase: null, user: null, error: "Supabase yapılandırılmamış." };
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return { supabase, user: null, error: "Oturum gerekli." };
  const token = header.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { supabase, user: null, error: "Oturum doğrulanamadı." };
  return { supabase, user: data.user, error: null };
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validate(body: TrackCreateInput) {
  const country = getSchengenCountry(String(body.countryCode || ""));
  if (!country) return "Geçerli bir Schengen ülkesi seçin.";
  if (!APPLICATION_CITIES.includes(body.applicationCity)) return "Geçerli bir başvuru şehri seçin.";
  if (body.alternativeCity && !APPLICATION_CITIES.includes(body.alternativeCity)) return "Alternatif şehir geçersiz.";
  if (body.alternativeCity && body.alternativeCity === body.applicationCity) return "Alternatif şehir ana şehirden farklı olmalı.";
  if (!VISA_CATEGORIES.some((item) => item.value === body.visaCategory)) return "Vize kategorisi geçersiz.";
  if (!Number.isInteger(body.applicantsCount) || body.applicantsCount < 1 || body.applicantsCount > 4) return "Kişi sayısı 1 ile 4 arasında olmalı.";
  if (!validDate(body.earliestDate) || !validDate(body.latestDate)) return "Tarih aralığı geçersiz.";
  const earliest = new Date(`${body.earliestDate}T00:00:00Z`);
  const latest = new Date(`${body.latestDate}T23:59:59Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setUTCDate(maxDate.getUTCDate() + 365);
  if (earliest < today || latest < earliest || latest > maxDate) return "Tarih aralığı bugünden itibaren en fazla 365 gün olabilir.";
  if (!body.notifyEmail && !body.notifyPush && !body.notifyInApp) return "En az bir bildirim kanalı seçin.";
  return null;
}

export async function GET(request: Request) {
  const auth = await authenticatedUser(request);
  if (!auth.supabase || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.supabase ? 401 : 500 });

  const { data, error } = await auth.supabase
    .from("visa_appointment_tracks")
    .select("id,country_code,country_name,provider_code,provider_name,application_city,alternative_city,visa_category,applicants_count,earliest_date,latest_date,notify_email,notify_push,notify_in_app,status,access_expires_at,last_checked_at,next_check_at,last_result,created_at,updated_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Takip tablosu hazır değil. Önce SQL kurulum dosyasını çalıştırın." }, { status: 500 });

  let notifications: Array<Record<string, unknown>> = [];
  const notificationQuery = await auth.supabase
    .from("visa_appointment_notifications")
    .select("id,track_id,channel,event_type,status,title,message,action_url,read_at,created_at")
    .eq("user_id", auth.user.id)
    .eq("channel", "in_app")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!notificationQuery.error) {
    notifications = notificationQuery.data || [];
  } else {
    const fallback = await auth.supabase
      .from("visa_appointment_notifications")
      .select("id,track_id,channel,event_type,status,created_at")
      .eq("user_id", auth.user.id)
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .limit(10);
    notifications = (fallback.data || []).map((item) => ({
      ...item,
      title: "Vize takibinde işlem gerekiyor",
      message: "Takip ayrıntılarını kontrol et.",
      action_url: "/vize-randevu",
      read_at: null,
    }));
  }

  return NextResponse.json({ data: data || [], notifications }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await authenticatedUser(request);
  if (!auth.supabase || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.supabase ? 401 : 500 });

  let body: TrackCreateInput;
  try {
    body = (await request.json()) as TrackCreateInput;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const country = getSchengenCountry(body.countryCode)!;
  const { count, error: countError } = await auth.supabase
    .from("visa_appointment_tracks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
    .in("status", ["pending_activation", "active", "match_found", "verification_required"])
    .gt("access_expires_at", new Date().toISOString());

  if (countError) return NextResponse.json({ error: "Takip altyapısı hazır değil. SQL kurulum dosyasını çalıştırın." }, { status: 500 });
  if ((count || 0) >= 1) return NextResponse.json({ error: "Beta sürümünde aynı anda bir aktif takip oluşturabilirsiniz." }, { status: 409 });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const nextCheckAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data, error: insertError } = await auth.supabase
    .from("visa_appointment_tracks")
    .insert({
      user_id: auth.user.id,
      country_code: country.code,
      country_name: country.name,
      provider_code: country.providerCode || null,
      provider_name: country.providerName || null,
      application_city: body.applicationCity,
      alternative_city: body.alternativeCity || null,
      visa_category: body.visaCategory,
      applicants_count: body.applicantsCount,
      earliest_date: body.earliestDate,
      latest_date: body.latestDate,
      notify_email: Boolean(body.notifyEmail),
      notify_push: Boolean(body.notifyPush),
      notify_in_app: Boolean(body.notifyInApp),
      status: "pending_activation",
      entitlement_source: "beta_grant",
      access_expires_at: expiresAt,
      next_check_at: nextCheckAt,
      last_result: country.providerName
        ? `${country.providerName} erişim doğrulaması bekleniyor`
        : "Sağlayıcı eşleştirmesi bekleniyor",
    })
    .select("id,country_code,country_name,provider_code,provider_name,application_city,alternative_city,visa_category,applicants_count,earliest_date,latest_date,notify_email,notify_push,notify_in_app,status,access_expires_at,last_checked_at,next_check_at,last_result,created_at,updated_at")
    .single();

  if (insertError) {
    console.error("visa appointment track insert", insertError);
    return NextResponse.json({ error: "Takip oluşturulamadı." }, { status: 500 });
  }

  await auth.supabase.from("visa_appointment_entitlements").insert({
    user_id: auth.user.id,
    track_id: data.id,
    source: "beta_grant",
    starts_at: new Date().toISOString(),
    expires_at: expiresAt,
  });

  return NextResponse.json({
    data,
    message: `24 saatlik beta takip görevi oluşturuldu. ${country.providerName || "Resmî sağlayıcı"} erişim testi tamamlandığında destek durumu güncellenecek.`,
  }, { status: 201 });
}
