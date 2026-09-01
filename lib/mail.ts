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
 * The function is deliberately small and safe. If RESEND_API_KEY is missing,
 * it never logs recipient addresses or message bodies and reports a disabled provider.
 */
export async function sendMail(params: SendMailParams): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn(`[MAIL DISABLED] Category: ${params.category || "general"}`);
    return { success: false, providerId: "mock", error: "E-posta servisi yapılandırılmamış." };
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
      status: result.providerId === "mock" ? "mock" : result.success ? "sent" : "failed",
      providerId: result.providerId || null,
      errorMessage: result.error || null,
      referenceType: params.referenceType || null,
      referenceId: params.referenceId || null,
    });
  }

  return result;
}
