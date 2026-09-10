import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ownedAvatarPath } from "./profile-photo";

export class AccountCleanupError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
function isMissingOptionalTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
export async function cleanAccountData(supabase: SupabaseClient, user: User) {
  const targetUserId = user.id;
  const targetEmail = String(user.email || "").trim().toLowerCase();
  const avatarPath = user.user_metadata?.l2t_avatar_path;
  if (ownedAvatarPath(avatarPath, targetUserId)) {
    const { error } = await supabase.storage.from("profile-avatars").remove([avatarPath]);
    if (error) throw new AccountCleanupError("Profil fotoğrafı silinemedi; hesap silinmedi.", 500);
  }

  const { data: evidenceRows, error: evidenceLookupError } = await supabase
    .from("travel_verifications")
    .select("evidence_path")
    .eq("user_id", targetUserId)
    .not("evidence_path", "is", null);
  if (evidenceLookupError) {
    throw new AccountCleanupError("Özel belgeler kontrol edilemedi; hesap silinmedi.", 500);
  }

  const evidencePaths = (evidenceRows || [])
    .map((row) => typeof row.evidence_path === "string" ? row.evidence_path : "")
    .filter(Boolean);
  if (evidencePaths.length) {
    const { error: removeError } = await supabase.storage.from("travel-evidence").remove(evidencePaths);
    if (removeError) {
      throw new AccountCleanupError("Özel belgeler silinemedi; hesap güvenli biçimde beklemede bırakıldı.", 500);
    }
  }

  // Fiyat alarmı KORUNAN bir üründür (01.09.2026 hotfix); hesap silinirken
  // kullanıcının alarmları ve alarm logları da temizlenir.
  const alertIds = new Set<string>();
  const userAlerts = await supabase.from("flight_price_alerts").select("id").eq("user_id", targetUserId);
  if (userAlerts.error && !isMissingOptionalTable(userAlerts.error)) {
    throw new AccountCleanupError("Hesaba bağlı fiyat alarmları temizlenemedi; hesap silinmedi.", 500);
  }
  for (const row of userAlerts.data || []) alertIds.add(String(row.id));

  if (targetEmail) {
    const emailAlerts = await supabase.from("flight_price_alerts").select("id").eq("email", targetEmail);
    if (emailAlerts.error && !isMissingOptionalTable(emailAlerts.error)) {
      throw new AccountCleanupError("E-postaya bağlı fiyat alarmları temizlenemedi; hesap silinmedi.", 500);
    }
    for (const row of emailAlerts.data || []) alertIds.add(String(row.id));
  }

  if (alertIds.size) {
    const ids = [...alertIds];
    const logsDelete = await supabase.from("flight_price_alert_logs").delete().in("alert_id", ids);
    if (logsDelete.error && !isMissingOptionalTable(logsDelete.error)) {
      throw new AccountCleanupError("Fiyat alarmı geçmişi temizlenemedi; hesap silinmedi.", 500);
    }
    const alertsDelete = await supabase.from("flight_price_alerts").delete().in("id", ids);
    if (alertsDelete.error && !isMissingOptionalTable(alertsDelete.error)) {
      throw new AccountCleanupError("Fiyat alarmları temizlenemedi; hesap silinmedi.", 500);
    }
  }

  // Push cihaz kayıtları: hesap silinirken kullanıcının tüm cihaz tokenları silinir.
  const pushDevicesDelete = await supabase.from("push_devices").delete().eq("user_id", targetUserId);
  if (pushDevicesDelete.error && !isMissingOptionalTable(pushDevicesDelete.error)) {
    throw new AccountCleanupError("Bildirim cihaz kayıtları temizlenemedi; hesap silinmedi.", 500);
  }

  if (targetEmail) {
    const mailLogsDelete = await supabase.from("mail_delivery_logs").delete().eq("recipient_email", targetEmail);
    if (mailLogsDelete.error && !isMissingOptionalTable(mailLogsDelete.error)) {
      throw new AccountCleanupError("E-posta teslim kayıtları temizlenemedi; hesap silinmedi.", 500);
    }
    const subscriberDelete = await supabase.from("subscribers").delete().eq("email", targetEmail);
    if (subscriberDelete.error && !isMissingOptionalTable(subscriberDelete.error)) {
      throw new AccountCleanupError("Bülten kaydı temizlenemedi; hesap silinmedi.", 500);
    }
  }

  const requests = await supabase.from("kvkk_requests").update({ notes: "Hesap silme talebiyle kişisel açıklamalar kaldırıldı." }).eq("user_id", targetUserId);
  if (requests.error) throw new AccountCleanupError("Hak talebi açıklamaları temizlenemedi; hesap silinmedi.");
  const reports = await supabase.from("forum_reports").update({ user_id: null, note: null }).eq("user_id", targetUserId);
  if (reports.error) throw new AccountCleanupError("Şikâyet kayıtları anonimleştirilemedi; hesap silinmedi.");

  const removedText = "Bu içerik hesap silme talebi üzerine anonimleştirildi.";
  const anonymizationSteps = [
    supabase.from("forum_topics").update({ author_id: null, author_name: "Silinmiş kullanıcı", title: "Anonimleştirilmiş konu", content: removedText }).eq("author_id", targetUserId),
    supabase.from("forum_replies").update({ user_id: null, author_name: "Silinmiş kullanıcı", content: removedText }).eq("user_id", targetUserId),
    supabase.from("country_questions").update({ user_id: null, title: "Anonimleştirilmiş soru", body: removedText }).eq("user_id", targetUserId),
    supabase.from("country_answers").update({ user_id: null, body: removedText }).eq("user_id", targetUserId),
    supabase.from("country_experience_comments").update({ user_id: null, body: removedText }).eq("user_id", targetUserId),
    supabase.from("country_warnings").update({ user_id: null, body: removedText }).eq("user_id", targetUserId),
  ];

  for (const step of anonymizationSteps) {
    const { error } = await step;
    if (error) {
      throw new AccountCleanupError("Hesap silme veritabanı güncellemesi uygulanmamış veya içerik anonimleştirilemedi; hesap silinmedi.", 409);
    }
  }

}
