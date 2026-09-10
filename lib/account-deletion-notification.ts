import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail } from "./mail";

export type DeletionJob = {
  request_id: string; target_user_id: string | null; recipient_email: string | null;
  locale: "tr" | "en"; phase: "prepared" | "cleaned" | "deleted" | "notified";
  completed_at: string | null;
};

export function completionMail(job: DeletionJob) {
  const english = job.locale === "en";
  // No account name, travel content, tokens, PNR or identifiers in the email.
  return {
    to: job.recipient_email!, category: "account_deletion_completion",
    idempotencyKey: `account-deletion-completed/${job.request_id}`,
    subject: english ? "Your LetsGo2Travel account has been deleted" : "LetsGo2Travel hesabın silindi",
    html: english
      ? "<h1>Your account has been deleted</h1><p>Your LetsGo2Travel account and associated private records have been deleted. Your community content has been removed or anonymised. This email confirms that your deletion request is complete.</p>"
      : "<h1>Hesabın silindi</h1><p>LetsGo2Travel hesabın ve hesaba bağlı özel kayıtların silindi. Topluluk içeriklerin kaldırıldı veya anonimleştirildi. Bu e-posta, hesap silme talebinin tamamlandığını bildirir.</p>",
  };
}

export async function finishDeletionNotification(supabase: SupabaseClient, job: DeletionJob, leaseToken: string) {
  if (job.phase !== "deleted" && job.phase !== "notified") throw new Error("Account is not deleted");
  const completion = await supabase.from("kvkk_requests").update({
    user_id: null, status: "processed", processed_at: job.completed_at,
    notes: "Hesap ve ilişkili özel kayıtlar silindi; kullanıcı içerikleri anonimleştirildi.",
    completion_notification_status: job.phase === "notified" ? "sent" : "pending",
  }).eq("id", job.request_id);
  if (completion.error) throw new Error("Deletion completion state could not be saved");
  if (job.phase === "notified") return { sent: true };
  if (!job.recipient_email) return { sent: false };
  // No mail_delivery_logs row: do not recreate a permanent email record after
  // deleting the account. The protected job retains it only until acceptance.
  const result = await sendMail(completionMail(job));
  if (!result.success) return { sent: false };
  const saved = await supabase.from("account_deletion_jobs").update({
    phase: "notified", recipient_email: null, target_user_id: null,
    notification_sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("request_id", job.request_id).eq("lease_token", leaseToken).select("request_id").maybeSingle();
  if (saved.error || !saved.data) throw new Error("Notification acceptance could not be recorded");
  const marked = await supabase.from("kvkk_requests").update({ completion_notification_status: "sent" }).eq("id", job.request_id);
  if (marked.error) throw new Error("Notification state could not be saved");
  return { sent: true };
}
