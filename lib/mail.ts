export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends an email using the Resend REST API via standard fetch.
 */
export async function sendMail(params: SendMailParams): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  
  // If no API key, log the email instead (useful for development)
  if (!apiKey) {
    console.log("-------------------------------------------------");
    console.log(`[MOCK EMAIL] To: ${params.to}`);
    console.log(`[MOCK EMAIL] Subject: ${params.subject}`);
    console.log(`[MOCK EMAIL] Content: \n${params.html.substring(0, 500)}...`);
    console.log("-------------------------------------------------");
    return { success: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "LetsGo2Travel <hello@letsgo2travel.com.tr>",
        to: params.to,
        subject: params.subject,
        html: params.html
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", data);
      return { success: false, error: data.message || "Failed to send email" };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { success: false, error: "Network error" };
  }
}

/**
 * Generates the HTML for the price drop email
 */
export function generatePriceDropEmailHtml(params: {
  originLabel: string;
  destinationLabel: string;
  departureDate: string;
  basePrice: number;
  newPrice: number;
  ctaLink: string;
}): string {
  const savings = params.basePrice - params.newPrice;
  const savingPercentage = Math.round((savings / params.basePrice) * 100);

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 40px 20px; border-radius: 16px;">
      <div style="background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 10px 40px rgba(0,0,0,0.05); text-align: center;">
        <h1 style="color: #0f172a; font-size: 24px; margin-top: 0; margin-bottom: 24px;">Harika Haber! Fiyat Düştü ✈️</h1>
        
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
          Takip ettiğiniz <strong>${params.originLabel} → ${params.destinationLabel}</strong> rotası için (${new Date(params.departureDate).toLocaleDateString('tr-TR')}) daha uygun bir fiyat bulduk!
        </p>

        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; padding: 24px; margin-bottom: 32px; color: white;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px;">
            <span style="color: #94a3b8; font-size: 14px;">İlk Görülen Fiyat:</span>
            <span style="font-size: 16px; text-decoration: line-through; color: #cbd5e1;">${params.basePrice.toLocaleString('tr-TR')} ₺</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #38bdf8; font-size: 16px; font-weight: bold;">Yeni Fiyat:</span>
            <span style="font-size: 28px; font-weight: 800; color: #fff;">${params.newPrice.toLocaleString('tr-TR')} ₺</span>
          </div>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed rgba(255,255,255,0.1); color: #fbbf24; font-weight: 600; font-size: 15px;">
            🎉 Toplam ${savings.toLocaleString('tr-TR')} ₺ (%${savingPercentage}) Tasarruf!
          </div>
        </div>

        <a href="${params.ctaLink}" style="display: inline-block; background-color: #38bdf8; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; padding: 16px 32px; border-radius: 12px; transition: background-color 0.2s;">
          Bileti İncele & Satın Al
        </a>
      </div>

      <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 32px; line-height: 1.5;">
        Fiyatlar anlık değişebilir. LetsGo2Travel bilgilendirme amaçlı fiyat alarmı gönderir. Affiliates sistemimizdeki en güncel durumu yansıtır.<br>
        Bu alarmı iptal etmek için ilk kayıt e-postanızdaki iptal bağlantısını veya profilinizi kullanabilirsiniz.
      </p>
    </div>
  `;
}

/**
 * Generates the HTML for the initial alert confirmation email
 */
export function generateAlertCreatedEmailHtml(params: {
  originLabel: string;
  destinationLabel: string;
  departureDate: string;
  unsubscribeLink: string | null;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 40px 20px; border-radius: 16px;">
      <div style="background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 10px 40px rgba(0,0,0,0.05); text-align: center;">
        <h1 style="color: #0f172a; font-size: 24px; margin-top: 0; margin-bottom: 24px;">Fiyat Alarmınız Kuruldu 🔔</h1>
        
        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
          <strong>${params.originLabel} → ${params.destinationLabel}</strong> (${new Date(params.departureDate).toLocaleDateString('tr-TR')}) rotası için uçak bileti fiyatlarını sizin için takip etmeye başladık.
        </p>

        <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
          Fiyatlarda belirlediğiniz oranda bir düşüş olduğunda size hemen haber vereceğiz.
        </p>
        
        ${params.unsubscribeLink ? `
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <a href="${params.unsubscribeLink}" style="color: #ef4444; text-decoration: underline; font-size: 14px;">
            Alarmı Kapat (İptal Et)
          </a>
        </div>
        ` : ''}
      </div>

      <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 32px; line-height: 1.5;">
        LetsGo2Travel Fiyat Alarm Sistemi
      </p>
    </div>
  `;
}
