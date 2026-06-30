import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchCheapestPrice } from "@/lib/travelpayouts";
import { sendMailAndLog, generatePriceDropEmailHtml } from "@/lib/mail";
import { affiliateRedirectUrl, aviasalesUrl } from "@/lib/affiliate";
import { siteUrl } from "@/lib/structured-data";
import { makeAlertDashboardLink, priceAlertSubject } from "@/lib/price-alerts";

type PriceAlertRow = Record<string, any>;

type PriceAlertCheckDetail = {
  key: string;
  processed: number;
  price?: number | null;
  status: "checked" | "no_price" | "group_error";
  notified?: number;
  errors?: number;
  message?: string;
};

export type PriceAlertCheckResult = {
  success: boolean;
  processedGroups: number;
  processedAlerts: number;
  notifiedAlerts: number;
  errorAlerts: number;
  details: PriceAlertCheckDetail[];
  startedAt: string;
  finishedAt: string;
};

function makeGroupKey(alert: PriceAlertRow) {
  return [
    alert.origin_code,
    alert.destination_code,
    alert.departure_date,
    alert.return_date || "oneway",
    alert.currency || "TRY",
    alert.trip_type || "one_way",
    alert.cabin_class || "economy",
  ].join("_");
}

function shouldNotifyForPrice(params: {
  alert: PriceAlertRow;
  currentPrice: number;
  basePrice: number | null;
  twentyFourHoursAgo: Date;
}) {
  const { alert, currentPrice, basePrice, twentyFourHoursAgo } = params;
  const lastNotifiedDate = alert.last_notified_at ? new Date(alert.last_notified_at) : null;
  const recentNotification = Boolean(lastNotifiedDate && lastNotifiedDate > twentyFourHoursAgo);
  const priceDroppedBelowLastNotified = !alert.last_notified_price || currentPrice < Number(alert.last_notified_price);

  if (recentNotification || !priceDroppedBelowLastNotified) return false;

  if (alert.target_price && currentPrice <= Number(alert.target_price)) return true;

  if (!alert.target_price && basePrice) {
    const threshold = Number(alert.threshold_percent || 5);
    const thresholdPrice = Number(basePrice) * (1 - threshold / 100);
    return currentPrice <= thresholdPrice;
  }

  return false;
}

async function markNoPrice(params: {
  supabase: any;
  group: PriceAlertRow[];
  now: string;
  message: string;
}) {
  const { supabase, group, now, message } = params;
  let errorAlerts = 0;

  await Promise.all(group.map(async (alert) => {
    const errorCount = Number(alert.error_count || 0) + 1;
    const isHardError = errorCount >= 3;
    if (isHardError) errorAlerts += 1;

    await Promise.all([
      supabase.from("flight_price_alerts").update({
        status: isHardError ? "error" : "active",
        last_checked_at: now,
        last_error_at: now,
        last_error_message: message,
        error_count: errorCount,
      }).eq("id", alert.id),
      supabase.from("flight_price_alert_logs").insert({
        alert_id: alert.id,
        status: isHardError ? "no_price_error" : "no_price_retry",
        error_message: message,
        checked_at: now,
      }),
    ]);
  }));

  return errorAlerts;
}

export async function runPriceAlertCheck(options?: { limit?: number }): Promise<PriceAlertCheckResult> {
  const startedAt = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error("Supabase admin bağlantısı kurulamadı.");
  }

  const { data: activeAlerts, error: alertsError } = await supabase
    .from("flight_price_alerts")
    .select("*")
    .eq("is_active", true)
    .eq("notify_email", true)
    .in("status", ["active", "triggered", "error"])
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(options?.limit || 80);

  if (alertsError) {
    throw new Error(alertsError.message || "Fiyat alarmları okunamadı.");
  }

  if (!activeAlerts || activeAlerts.length === 0) {
    const finishedAt = new Date().toISOString();
    return {
      success: true,
      processedGroups: 0,
      processedAlerts: 0,
      notifiedAlerts: 0,
      errorAlerts: 0,
      details: [],
      startedAt,
      finishedAt,
    };
  }

  const groupedAlerts: Record<string, PriceAlertRow[]> = {};
  for (const alert of activeAlerts) {
    const key = makeGroupKey(alert);
    if (!groupedAlerts[key]) groupedAlerts[key] = [];
    groupedAlerts[key].push(alert);
  }

  const details: PriceAlertCheckDetail[] = [];
  const now = new Date().toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let processedAlerts = 0;
  let notifiedAlerts = 0;
  let errorAlerts = 0;

  for (const key of Object.keys(groupedAlerts)) {
    const group = groupedAlerts[key];
    const sample = group[0];
    processedAlerts += group.length;

    try {
      const priceInfo = await fetchCheapestPrice({
        origin: sample.origin_code,
        destination: sample.destination_code,
        departDate: sample.departure_date,
        returnDate: sample.return_date,
        currency: sample.currency || "TRY",
      });

      if (!priceInfo) {
        const message = "Travelpayouts fiyat verisi bulunamadı veya API cevap vermedi.";
        const groupErrors = await markNoPrice({ supabase, group, now, message });
        errorAlerts += groupErrors;
        details.push({ key, status: "no_price", processed: group.length, errors: groupErrors, message });
        continue;
      }

      const currentPrice = Number(priceInfo.price);
      let groupNotified = 0;
      let groupErrors = 0;

      for (const alert of group) {
        let logStatus = "price_checked";
        let notifySent = false;
        let mailError: string | null = null;
        let newLowestPrice = alert.lowest_price_seen;
        let updatedBasePrice = alert.base_price;

        if (!newLowestPrice || currentPrice < Number(newLowestPrice)) newLowestPrice = currentPrice;
        if (!updatedBasePrice) updatedBasePrice = currentPrice;

        const shouldNotify = shouldNotifyForPrice({
          alert,
          currentPrice,
          basePrice: Number(updatedBasePrice),
          twentyFourHoursAgo,
        });

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
            logStatus = "email_sent";
            notifySent = true;
            groupNotified += 1;
            notifiedAlerts += 1;
          } else {
            logStatus = "email_failed";
            mailError = mailRes.error || "Fiyat düşüş maili gönderilemedi.";
            groupErrors += 1;
            errorAlerts += 1;
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
          error_count: 0,
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
            status: logStatus,
            price: currentPrice,
            currency: priceInfo.currency || alert.currency || "TRY",
            raw_response: priceInfo,
            error_message: mailError,
            checked_at: now,
          }),
        ]);
      }

      details.push({ key, status: "checked", price: currentPrice, processed: group.length, notified: groupNotified, errors: groupErrors });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fiyat kontrol grubu çalıştırılamadı.";
      const groupErrors = await markNoPrice({ supabase, group, now, message });
      errorAlerts += groupErrors;
      details.push({ key, status: "group_error", processed: group.length, errors: groupErrors, message });
    }
  }

  const finishedAt = new Date().toISOString();
  return {
    success: true,
    processedGroups: details.length,
    processedAlerts,
    notifiedAlerts,
    errorAlerts,
    details,
    startedAt,
    finishedAt,
  };
}
