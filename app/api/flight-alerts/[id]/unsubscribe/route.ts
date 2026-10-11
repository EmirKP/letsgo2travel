import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAlertUnsubscribeToken } from "@/lib/price-alerts";

export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

function html(message: string, status = 200, confirmation?: { id: string; token: string }) {
  return new NextResponse(`<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LetsGo2Travel Fiyat Alarmı</title></head>
<body style="margin:0;background:#06183A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:white;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box;">
  <main style="max-width:560px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:28px;padding:34px;text-align:center;">
    <h1 style="margin:0 0 12px;font-size:28px;color:#FFB400;">Fiyat Alarmı</h1>
    <p style="margin:0 0 26px;line-height:1.7;">${escapeHtml(message)}</p>
    ${confirmation ? `<form method="post" action="/api/flight-alerts/${encodeURIComponent(confirmation.id)}/unsubscribe">
      <input type="hidden" name="token" value="${escapeHtml(confirmation.token)}">
      <button type="submit" style="background:#FFB400;color:#06183A;border:0;font:inherit;font-weight:800;border-radius:18px;padding:16px 24px;cursor:pointer;">Alarmı kapat</button>
    </form>` : ""}
    <a href="/" style="display:inline-block;color:#FFB400;padding:20px 12px;">Ana sayfaya dön</a>
  </main>
</body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    }, status,
  });
}

async function findAlert(id: string, token: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id) || !token || token.length > 150) return { response: html("Alarm kapatma bağlantısı eksik veya geçersiz.", 400) };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { response: html("Alarm şu an kontrol edilemedi. Biraz sonra tekrar dene.", 503) };
  const { data: alert, error } = await supabase.from("flight_price_alerts")
    .select("manage_token_hash, manage_token_expires_at, departure_date, cancelled_at, status").eq("id", id).maybeSingle();
  if (error) return { response: html("Alarm şu an kontrol edilemedi. Biraz sonra tekrar dene.", 503) };
  if (!alert || !verifyAlertUnsubscribeToken({ alertId: id, departureDate: alert.departure_date, plainToken: token, storedHash: alert.manage_token_hash, expiresAt: alert.manage_token_expires_at })) {
    return { response: html("Alarm kapatma bağlantısının süresi dolmuş veya bağlantı geçersiz.", 400) };
  }
  return { supabase, alert };
}

type Context = { params: Promise<{ id: string }> };

/** Mail scanners and preview fetches must never cancel an alert. */
export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const token = new URL(request.url).searchParams.get("token") || "";
    const found = await findAlert(id, token);
    if (found.response) return found.response;
    if (found.alert.cancelled_at || found.alert.status === "cancelled") return html("Bu fiyat alarmı zaten kapatılmış.");
    return html("Bu alarmı kapattığında bu rota için e-posta ve telefon bildirimi almayacaksın. Kapatmak istiyor musun?", 200, { id, token });
  } catch {
    return html("Alarm şu an kontrol edilemedi. Biraz sonra tekrar dene.", 503);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return html("İstek doğrulanamadı. E-postadaki bağlantıyı yeniden aç.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded") || Number(request.headers.get("content-length") || 0) > 2048) return html("Geçersiz istek.", 400);
    const body = await request.text();
    if (body.length > 2048) return html("Geçersiz istek.", 400);
    const { id } = await params;
    const token = new URLSearchParams(body).get("token") || "";
    const found = await findAlert(id, token);
    if (found.response) return found.response;
    if (found.alert.cancelled_at || found.alert.status === "cancelled") return html("Bu fiyat alarmı zaten kapatılmış.");
    // Fence token rotation or a concurrent delete between verification and write.
    let update = found.supabase.from("flight_price_alerts")
      .update({ is_active: false, status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", id).eq("departure_date", found.alert.departure_date).is("cancelled_at", null);
    update = found.alert.manage_token_hash == null ? update.is("manage_token_hash", null) : update.eq("manage_token_hash", found.alert.manage_token_hash);
    update = found.alert.manage_token_expires_at == null ? update.is("manage_token_expires_at", null) : update.eq("manage_token_expires_at", found.alert.manage_token_expires_at);
    const { data, error } = await update.select("id");
    if (error) return html("Alarm kapatılamadı. Tekrar deneyebilirsin.", 503);
    if (!data?.length) return html("Alarmın durumu değişti. E-postadaki bağlantıyı yeniden aç.", 409);
    return html("Fiyat alarmın kapatıldı. Bu rota için artık e-posta veya telefon bildirimi almayacaksın.");
  } catch {
    return html("Alarm kapatılamadı. Tekrar deneyebilirsin.", 503);
  }
}
