export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  category?: string;
  referenceId?: string | null;
}

export interface SendMailResult {
  success: boolean;
  error?: string;
  providerId?: string;
}

/**
 * Sends an email using the Resend REST API via standard fetch.
 * The function is deliberately small and safe: if RESEND_API_KEY is missing,
 * it logs a mock email and returns success so local development does not break.
 */
export async function sendMail(params: SendMailParams): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log("-------------------------------------------------");
    console.log(`[MOCK EMAIL] To: ${params.to}`);
    console.log(`[MOCK EMAIL] Subject: ${params.subject}`);
    console.log(`[MOCK EMAIL] Category: ${params.category || "general"}`);
    console.log(`[MOCK EMAIL] Content: \n${params.html.substring(0, 500)}...`);
    console.log("-------------------------------------------------");
    return { success: true, providerId: "mock" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "LetsGo2Travel <hello@letsgo2travel.com.tr>",
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Resend API error:", data);
      return { success: false, error: data.message || data.error || "Failed to send email" };
    }

    return { success: true, providerId: data.id };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

export async function logMailDelivery(params: {
  supabase: any;
  to: string;
  subject: string;
  category: string;
  status: "sent" | "failed" | "mock";
  providerId?: string | null;
  errorMessage?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}) {
  try {
    await params.supabase.from("mail_delivery_logs").insert({
      recipient_email: params.to,
      subject: params.subject,
      category: params.category,
      status: params.status,
      provider_id: params.providerId || null,
      error_message: params.errorMessage || null,
      reference_type: params.referenceType || null,
      reference_id: params.referenceId || null,
    });
  } catch (error) {
    console.error("Mail log kaydı başarısız:", error);
  }
}

export async function sendMailAndLog(params: SendMailParams & {
  supabase?: any;
  referenceType?: string | null;
  referenceId?: string | null;
}) {
  const result = await sendMail(params);

  if (params.supabase) {
    await logMailDelivery({
      supabase: params.supabase,
      to: params.to,
      subject: params.subject,
      category: params.category || "general",
      status: result.success ? (result.providerId === "mock" ? "mock" : "sent") : "failed",
      providerId: result.providerId || null,
      errorMessage: result.error || null,
      referenceType: params.referenceType || null,
      referenceId: params.referenceId || params.referenceId || null,
    });
  }

  return result;
}

/** Generates the HTML for the price drop email. */
export function generatePriceDropEmailHtml(params: {
  originLabel: string;
  destinationLabel: string;
  departureDate: string;
  basePrice: number;
  newPrice: number;
  ctaLink: string;
  unsubscribeLink?: string | null;
}): string {
  const savings = Math.max(params.basePrice - params.newPrice, 0);
  const savingPercentage = params.basePrice > 0 ? Math.round((savings / params.basePrice) * 100) : 0;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 40px 20px; border-radius: 16px;">
      <div style="background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 10px 40px rgba(0,0,0,0.05); text-align: center;">
        <div style="display:inline-block;background:#06183A;color:#FFB400;padding:8px 14px;border-radius:999px;font-weight:800;font-size:12px;letter-spacing:.04em;margin-bottom:18px;">LETSGO2TRAVEL FİYAT ALARMI</div>
        <h1 style="color: #06183A; font-size: 26px; margin-top: 0; margin-bottom: 24px;">Harika Haber! Fiyat Düştü ✈️</h1>
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
          Takip ettiğiniz <strong>${params.originLabel} → ${params.destinationLabel}</strong> rotası için (${new Date(params.departureDate).toLocaleDateString("tr-TR")}) daha uygun bir fiyat bulduk.
        </p>
        <div style="background: linear-gradient(135deg, #06183A 0%, #0E2A5C 100%); border-radius: 18px; padding: 26px; margin-bottom: 32px; color: white;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 16px;">
            <span style="color: rgba(255,255,255,0.72); font-size: 14px;">Önceki referans fiyat:</span>
            <span style="font-size: 16px; text-decoration: line-through; color: #cbd5e1;">${params.basePrice.toLocaleString("tr-TR")} ₺</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #FFB400; font-size: 16px; font-weight: bold;">Yeni fiyat:</span>
            <span style="font-size: 30px; font-weight: 900; color: #fff;">${params.newPrice.toLocaleString("tr-TR")} ₺</span>
          </div>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed rgba(255,255,255,0.16); color: #2ECC71; font-weight: 800; font-size: 15px;">
            ${savings > 0 ? `🎉 ${savings.toLocaleString("tr-TR")} ₺ (%${savingPercentage}) daha uygun` : "Yeni fiyat takip eşiğinize ulaştı"}
          </div>
        </div>
        <a href="${params.ctaLink}" style="display: inline-block; background: linear-gradient(135deg,#FFB400,#FF6B35); color: #06183A; text-decoration: none; font-weight: 900; font-size: 16px; padding: 16px 32px; border-radius: 999px;">
          Bileti İncele
        </a>
        ${params.unsubscribeLink ? `
        <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <a href="${params.unsubscribeLink}" style="color: #64748b; text-decoration: underline; font-size: 13px;">Bu alarmı kapat</a>
        </div>` : ""}
      </div>
      <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 32px; line-height: 1.5;">
        Fiyatlar anlık değişebilir. LetsGo2Travel bilgilendirme amaçlı fiyat alarmı gönderir.
      </p>
    </div>
  `;
}

/** Generates the HTML for the initial alert confirmation email. */
export function generateAlertCreatedEmailHtml(params: {
  originLabel: string;
  destinationLabel: string;
  departureDate: string;
  unsubscribeLink: string | null;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 40px 20px; border-radius: 16px;">
      <div style="background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 10px 40px rgba(0,0,0,0.05); text-align: center;">
        <div style="display:inline-block;background:#06183A;color:#FFB400;padding:8px 14px;border-radius:999px;font-weight:800;font-size:12px;letter-spacing:.04em;margin-bottom:18px;">LETSGO2TRAVEL</div>
        <h1 style="color: #06183A; font-size: 26px; margin-top: 0; margin-bottom: 24px;">Fiyat Alarmınız Kuruldu 🔔</h1>
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
          <strong>${params.originLabel} → ${params.destinationLabel}</strong> (${new Date(params.departureDate).toLocaleDateString("tr-TR")}) rotası için uçak bileti fiyatlarını takip etmeye başladık.
        </p>
        <div style="background:#F7F9FC;border:1px solid #e2e8f0;border-radius:18px;padding:20px;margin:24px 0;text-align:left;color:#334155;line-height:1.6;">
          <strong style="color:#06183A;">Nasıl çalışır?</strong><br>
          Fiyat belirlediğiniz hedefe veya düşüş eşiğine yaklaşırsa size e-posta göndeririz. Alarmı istediğiniz zaman kapatabilirsiniz.
        </div>
        ${params.unsubscribeLink ? `
        <a href="${params.unsubscribeLink}" style="display:inline-block;color:#E63946;text-decoration:underline;font-size:14px;font-weight:700;">Alarmı kapat</a>
        ` : ""}
      </div>
      <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 32px; line-height: 1.5;">
        LetsGo2Travel Fiyat Alarm Sistemi
      </p>
    </div>
  `;
}
