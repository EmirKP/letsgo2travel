import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchCheapestPrice } from "@/lib/travelpayouts";
import { sendMail, generatePriceDropEmailHtml } from "@/lib/mail";
import { affiliateRedirectUrl, aviasalesUrl } from "@/lib/affiliate";
import { siteUrl } from "@/lib/structured-data";

// This endpoint is protected by a secret key to prevent unauthorized cron executions.
// It groups active alerts by route and date, fetches the current price, and evaluates
// whether to send notifications.

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Extend Vercel function timeout if possible

export async function GET(request: Request) {
  // 1. Authorization
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu hatası." }, { status: 500 });
  }

  // 2. Fetch all active alerts
  const { data: activeAlerts, error: alertsError } = await supabase
    .from("flight_price_alerts")
    .select("*")
    .eq("is_active", true);

  if (alertsError || !activeAlerts) {
    console.error("Cron failed to fetch alerts:", alertsError);
    return NextResponse.json({ error: "Veritabanı hatası" }, { status: 500 });
  }

  if (activeAlerts.length === 0) {
    return NextResponse.json({ message: "Aktif fiyat alarmı bulunamadı." });
  }

  // 3. Group alerts by unique route-date-currency combinations to minimize API calls
  // Key format: origin_destination_date_currency
  const groupedAlerts: Record<string, any[]> = {};
  for (const alert of activeAlerts) {
    // Only grouping by basic params for MVP. 
    // If adult/class/trip_type differ heavily, we should group by them too.
    const key = `${alert.origin_code}_${alert.destination_code}_${alert.departure_date}_${alert.currency}`;
    if (!groupedAlerts[key]) groupedAlerts[key] = [];
    groupedAlerts[key].push(alert);
  }

  const results = [];
  const now = new Date().toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // 4. Process each group
  for (const key of Object.keys(groupedAlerts)) {
    const group = groupedAlerts[key];
    const sample = group[0];
    
    // Fetch price for this group
    const priceInfo = await fetchCheapestPrice({
      origin: sample.origin_code,
      destination: sample.destination_code,
      departDate: sample.departure_date,
      returnDate: sample.return_date,
      currency: sample.currency,
    });

    if (!priceInfo) {
      // Log failure for all alerts in this group
      const logs = group.map(a => ({
        alert_id: a.id,
        status: "no_price_found",
        error_message: "Travelpayouts API returned no data or failed",
        checked_at: now
      }));
      await supabase.from("flight_price_alert_logs").insert(logs);
      results.push({ key, status: "failed_to_fetch" });
      continue;
    }

    const currentPrice = priceInfo.price;

    // Process each alert in the group
    for (const alert of group) {
      let status = "price_checked";
      let notifySent = false;
      let newLowestPrice = alert.lowest_price_seen;
      let updatedBasePrice = alert.base_price;

      // Update lowest price seen
      if (!newLowestPrice || currentPrice < newLowestPrice) {
        newLowestPrice = currentPrice;
      }

      // If alert had no base_price previously (API was down when they created it), set it now
      if (!updatedBasePrice) {
        updatedBasePrice = currentPrice;
      }

      // Determine if we should notify
      let shouldNotify = false;

      // Rule 1: Don't notify if already notified in the last 24 hours
      const lastNotifiedDate = alert.last_notified_at ? new Date(alert.last_notified_at) : null;
      const recentNotification = lastNotifiedDate && lastNotifiedDate > twentyFourHoursAgo;

      // Rule 2: Don't notify if price hasn't dropped below last notified price
      const priceDroppedBelowLastNotified = !alert.last_notified_price || currentPrice < alert.last_notified_price;

      if (!recentNotification && priceDroppedBelowLastNotified) {
        if (alert.target_price && currentPrice <= alert.target_price) {
          // Target price met
          shouldNotify = true;
        } else if (!alert.target_price && updatedBasePrice) {
          // Threshold percent met
          const thresholdPrice = updatedBasePrice * (1 - (alert.threshold_percent / 100));
          if (currentPrice <= thresholdPrice) {
            shouldNotify = true;
          }
        }
      }

      // Send Notification
      if (shouldNotify && alert.notify_email) {
        const ctaUrl = siteUrl(affiliateRedirectUrl({
          provider: "aviasales",
          url: aviasalesUrl({
            origin: alert.origin_code,
            destination: alert.destination_code,
            departDate: alert.departure_date,
            returnDate: alert.return_date
          }),
          destination: alert.destination_code,
          sourcePage: "price_alert_email",
          campaign: "price_alert",
        }));

        const html = generatePriceDropEmailHtml({
          originLabel: alert.origin_label,
          destinationLabel: alert.destination_label,
          departureDate: alert.departure_date,
          basePrice: updatedBasePrice,
          newPrice: currentPrice,
          ctaLink: ctaUrl
        });

        const mailRes = await sendMail({
          to: alert.email,
          subject: `${alert.origin_label} → ${alert.destination_label} biletinde fiyat düştü ✈️`,
          html: html
        });

        if (mailRes.success) {
          status = "email_sent";
          notifySent = true;
        } else {
          status = "email_failed";
        }
      }

      // Prepare Update Payload
      const updatePayload: any = {
        last_checked_price: currentPrice,
        lowest_price_seen: newLowestPrice,
        base_price: updatedBasePrice,
        last_checked_at: now,
      };

      if (notifySent) {
        updatePayload.last_notified_price = currentPrice;
        updatePayload.last_notified_at = now;
      }

      // Execute Updates in parallel
      await Promise.all([
        supabase.from("flight_price_alerts").update(updatePayload).eq("id", alert.id),
        supabase.from("flight_price_alert_logs").insert({
          alert_id: alert.id,
          status: status,
          price: currentPrice,
          currency: alert.currency,
          raw_response: priceInfo,
          checked_at: now
        })
      ]);
    }
    
    results.push({ key, price: currentPrice, processed: group.length });
  }

  return NextResponse.json({ success: true, processedGroups: results.length, details: results });
}
