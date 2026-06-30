import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAlertToken } from "@/lib/price-alerts";

function html(message: string, ok = true) {
  return new NextResponse(`<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LetsGo2Travel Fiyat Alarmı</title></head>
<body style="margin:0;background:#06183A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:white;display:grid;place-items:center;min-height:100vh;padding:24px;">
  <main style="max-width:560px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:28px;padding:34px;text-align:center;box-shadow:0 20px 80px rgba(0,0,0,.25);">
    <div style="font-size:42px;margin-bottom:14px;">${ok ? "✅" : "⚠️"}</div>
    <h1 style="margin:0 0 12px;font-size:28px;color:#FFB400;">Fiyat Alarmı</h1>
    <p style="margin:0 0 26px;line-height:1.7;color:rgba(255,255,255,.82);">${message}</p>
    <a href="/" style="display:inline-block;background:linear-gradient(135deg,#FFB400,#FF6B35);color:#06183A;text-decoration:none;font-weight:900;border-radius:999px;padding:14px 22px;">Ana sayfaya dön</a>
  </main>
</body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    status: ok ? 200 : 400,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return html("Backend bağlantısı kurulamadı.", false);

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) return html("Alarm kapatma bağlantısı eksik veya geçersiz.", false);

  const { data: alertData, error } = await supabase
    .from("flight_price_alerts")
    .select("manage_token_hash, manage_token_expires_at")
    .eq("id", id)
    .single();

  if (error || !alertData) return html("Alarm bulunamadı veya daha önce silinmiş olabilir.", false);

  const validToken = verifyAlertToken({
    plainToken: token,
    storedHash: alertData.manage_token_hash,
    expiresAt: alertData.manage_token_expires_at,
  });

  if (!validToken) return html("Alarm kapatma bağlantısının süresi dolmuş veya bağlantı geçersiz.", false);

  const { error: updateError } = await supabase
    .from("flight_price_alerts")
    .update({ is_active: false, status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) return html("Alarm kapatılırken bir hata oluştu.", false);

  return html("Fiyat alarmınız kapatıldı. Bu rota için artık e-posta bildirimi almayacaksınız.");
}
