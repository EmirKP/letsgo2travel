import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchCheapestPrice } from "@/lib/travelpayouts";
import { sendMailAndLog, generatePriceDropEmailHtml } from "@/lib/mail";
import { affiliateRedirectUrl, aviasalesUrl } from "@/lib/affiliate";
import { siteUrl } from "@/lib/structured-data";
import { makeAlertDashboardLink, priceAlertSubject } from "@/lib/price-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization");
  const querySecret = new URL(request.url).searchParams.get("secret");
  return authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (!isAuthorizedCron(request)) return unauthorized();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu hatası." }, { status: 500 });
  }

  const { data: activeAlerts, error: alertsError } = await supabase
    .from("flight_price_alerts")
    .select("*")
    .eq("is_active", true)
    .in("status", ["active", "triggered", "error"]);

  if (alertsError || !activeAlerts) {
    console.error("Cron failed to fetch alerts:", alertsError);
    return NextResponse.json({ error: "Veritabanı hatası" }, { status: 500 });
  }

  if (activeAlerts.length === 0) {
    return NextResponse.json({ success: true, message: "Aktif fiyat alarmı bulunamadı.", processedGroups: 0 });
  }

  const groupedAlerts: Record<string, any[]> = {};
  for (const alert of activeAlerts) {
    const key = [
      alert.origin_code,
      alert.destination_code,
      alert.departure_date,
      alert.return_date || "oneway",
      alert.currency || "TRY",
      alert.trip_type || "one_way",
      alert.cabin_class || "economy",
    ].join("_");
    if (!groupedAlerts[key]) groupedAlerts[key] = [];
    groupedAlerts[key].push(alert);
  }

  const results: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const key of Object.keys(groupedAlerts)) {
    const group = groupedAlerts[key];
    const sample = group[0];
    const priceInfo = await fetchCheapestPrice({
      origin: sample.origin_code,
      destination: sample.destination_code,
      departDate: sample.departure_date,
      returnDate: sample.return_date,
      currency: sample.currency || "TRY",
    });

    if (!priceInfo) {
      await Promise.all(group.map(async (alert) => {
        const errorCount = Number(alert.error_count || 0) + 1;
        await Promise.all([
          supabase.from("flight_price_alerts").update({
            status: "error",
            last_checked_at: now,
            last_error_at: now,
            last_error_message: "Travelpayouts fiyat verisi bulunamadı veya API cevap vermedi.",
            error_count: errorCount,
          }).eq("id", alert.id),
          supabase.from("flight_price_alert_logs").insert({
            alert_id: alert.id,
            status: "no_price_found",
            error_message: "Travelpayouts API returned no data or failed",
            checked_at: now,
          }),
        ]);
      }));
      results.push({ key, status: "failed_to_fetch", processed: group.length });
      continue;
    }

    const currentPrice = Number(priceInfo.price);

    for (const alert of group) {
      let status = "price_checked";
      let notifySent = false;
      let mailError: string | null = null;
      let newLowestPrice = alert.lowest_price_seen;
      let updatedBasePrice = alert.base_price;

      if (!newLowestPrice || currentPrice < Number(newLowestPrice)) newLowestPrice = currentPrice;
      if (!updatedBasePrice) updatedBasePrice = currentPrice;

      const lastNotifiedDate = alert.last_notified_at ? new Date(alert.last_notified_at) : null;
      const recentNotification = Boolean(lastNotifiedDate && lastNotifiedDate > twentyFourHoursAgo);
      const priceDroppedBelowLastNotified = !alert.last_notified_price || currentPrice < Number(alert.last_notified_price);

      let shouldNotify = false;
      if (!recentNotification && priceDroppedBelowLastNotified) {
        if (alert.target_price && currentPrice <= Number(alert.target_price)) {
          shouldNotify = true;
        } else if (!alert.target_price && updatedBasePrice) {
          const thresholdPrice = Number(updatedBasePrice) * (1 - (Number(alert.threshold_percent || 5) / 100));
          shouldNotify = currentPrice <= thresholdPrice;
        }
      }

      if (shouldNotify && alert.notify_email) {
        const ctaUrl = siteUrl(affiliateRedirectUrl({
          provider: "aviasales",
          url: aviasalesUrl({
            origin: alert.origin_code,
            destination: alert.destination_code,
            departDate: alert.departure_date,
            returnDate: alert.return_date,
          }),
          destination: alert.destination_code,
          sourcePage: "price_alert_email",
          campaign: "price_alert",
        }));

        const subject = priceAlertSubject({
          originLabel: alert.origin_label || alert.origin_code,
          destinationLabel: alert.destination_label || alert.destination_code,
          type: "drop",
        });

        const html = generatePriceDropEmailHtml({
          originLabel: alert.origin_label || alert.origin_code,
          destinationLabel: alert.destination_label || alert.destination_code,
          departureDate: alert.departure_date,
          basePrice: Number(updatedBasePrice),
          newPrice: currentPrice,
          ctaLink: ctaUrl,
          unsubscribeLink: makeAlertDashboardLink(),
        });

        const mailRes = await sendMailAndLog({
          supabase,
          to: alert.email,
          subject,
          html,
          category: "price_alert_drop",
          referenceType: "flight_price_alert",
          referenceId: alert.id,
        });

        if (mailRes.success) {
          status = "email_sent";
          notifySent = true;
        } else {
          status = "email_failed";
          mailError = mailRes.error || "Fiyat düşüş maili gönderilemedi.";
        }
      }

      const updatePayload: Record<string, unknown> = {
        last_checked_price: currentPrice,
        lowest_price_seen: newLowestPrice,
        base_price: updatedBasePrice,
        last_checked_at: now,
        status: notifySent ? "triggered" : "active",
        last_error_message: null,
        last_error_at: null,
      };

      if (notifySent) {
        updatePayload.last_notified_price = currentPrice;
        updatePayload.last_notified_at = now;
        updatePayload.last_mail_status = "drop_sent";
      }

      if (mailError) {
        updatePayload.status = "error";
        updatePayload.last_mail_status = "drop_failed";
        updatePayload.last_error_message = mailError;
        updatePayload.last_error_at = now;
        updatePayload.error_count = Number(alert.error_count || 0) + 1;
      }

      await Promise.all([
        supabase.from("flight_price_alerts").update(updatePayload).eq("id", alert.id),
        supabase.from("flight_price_alert_logs").insert({
          alert_id: alert.id,
          status,
          price: currentPrice,
          currency: priceInfo.currency || alert.currency || "TRY",
          raw_response: priceInfo,
          error_message: mailError,
          checked_at: now,
        }),
      ]);
    }

    results.push({ key, price: currentPrice, processed: group.length });
  }

  return NextResponse.json({ success: true, processedGroups: results.length, details: results });
}
