import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { finishAppleDeletionAuthorization } from "@/lib/apple-account-deletion";

export const runtime = "nodejs";
export const maxDuration = 60;

function confirmationPage(ok: boolean, message: string) {
  const escaped = message.replace(/[&<>"']/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!);
  // No code/state/token is echoed or redirected to the app. The app reads its authenticated status.
  return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Apple doğrulaması — LetsGo2Travel</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#f6f8fb;color:#172033;padding:24px}main{max-width:480px;margin:10vh auto;background:white;border-radius:24px;padding:28px;line-height:1.6}a{display:inline-block;margin-top:16px;color:#0878d9}h1{font-size:24px}</style></head><body><main><h1>${ok ? "Apple doğrulaması tamamlandı" : "Doğrulama tamamlanamadı"}</h1><p>${escaped}</p><p>Bu pencereyi kapatarak uygulamaya dönebilirsiniz.</p><a href="/profil">Web profilime dön</a></main></body></html>`, {
    status: ok ? 200 : 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "X-Robots-Tag": "noindex",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 16_384
    || !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return confirmationPage(false, "Geçersiz doğrulama yanıtı. Uygulamadan tekrar başlatın.");
  }
  const text = await request.text();
  if (text.length > 16_384) return confirmationPage(false, "Geçersiz doğrulama yanıtı.");
  const body = new URLSearchParams(text);
  if (body.has("error")) return confirmationPage(false, "Apple doğrulaması iptal edildi. Hesabınız silinmedi; uygulamadan yeniden deneyebilirsiniz.");
  const supabase = getSupabaseAdmin();
  if (!supabase) return confirmationPage(false, "Doğrulama şu an tamamlanamıyor. Uygulamadan tekrar deneyin.");
  const result = await finishAppleDeletionAuthorization(supabase, body.get("state") || "", body.get("code") || "");
  return confirmationPage(result.ok, result.message);
}
