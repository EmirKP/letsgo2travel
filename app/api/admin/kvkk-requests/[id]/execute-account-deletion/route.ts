import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { adminPrincipalFromRequest } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ACCOUNT_DELETION_TYPE } from "@/lib/account-deletion-policy";
import { AccountCleanupError, cleanAccountData } from "@/lib/account-deletion-cleanup";
import { finishDeletionNotification, type DeletionJob } from "@/lib/account-deletion-notification";
import { revokeAppleBeforeDeletion } from "@/lib/apple-account-deletion";

export const maxDuration = 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_COLUMNS = "request_id,target_user_id,recipient_email,locale,phase,completed_at";
function failure(error: string, status = 500) { return NextResponse.json({ error }, { status }); }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await adminPrincipalFromRequest(request, ["admin", "super_admin"]);
  if (!principal) return failure("Yetkisiz işlem. Yetkiniz bulunmuyor.", 401);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return failure("Geçersiz talep kimliği.", 400);
  const payload = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (payload?.confirmation !== "HESABI KALICI SIL") return failure("Kalıcı silme onayı eşleşmiyor.", 400);
  const supabase = getSupabaseAdmin();
  if (!supabase) return failure("Sunucu yapılandırması eksik.", 503);
  const leaseToken = randomUUID();
  let leased = false;
  try {
    const selected = await supabase.from("kvkk_requests").select("id,user_id,request_type,status,request_locale").eq("id", id).maybeSingle();
    if (selected.error) return failure("Talep okunamadı.", 503);
    const deletionRequest = selected.data;
    if (!deletionRequest) return failure("Talep bulunamadı.", 404);
    if (deletionRequest.request_type !== ACCOUNT_DELETION_TYPE) return failure("Bu işlem yalnızca hesap kapatma taleplerinde kullanılabilir.", 400);
    const saved = await supabase.from("account_deletion_jobs").select(JOB_COLUMNS).eq("request_id", id).maybeSingle();
    if (saved.error) return failure("Hesap silme veritabanı güncellemesi hazır değil; işlem başlatılmadı.", 503);
    const previous = saved.data as DeletionJob | null;
    const onlyNotification = previous?.phase === "deleted" || previous?.phase === "notified";
    if (!onlyNotification && deletionRequest.status !== "reviewing") return failure("Kalıcı silmeden önce talebi İnceleniyor durumuna alın.", 409);
    const targetUserId = previous?.target_user_id || deletionRequest.user_id;
    if (!onlyNotification && (!targetUserId || principal.subject === targetUserId)) return failure("Hesap bulunamadı veya yönetici kendi hesabını bu ekrandan silemez.", 403);
    if (!previous) {
      const prepared = await supabase.from("account_deletion_jobs").upsert({
        request_id: id, target_user_id: targetUserId, locale: deletionRequest.request_locale === "en" ? "en" : "tr",
      }, { onConflict: "request_id", ignoreDuplicates: true });
      if (prepared.error) return failure("Silme işlem kaydı oluşturulamadı; hesap silinmedi.", 503);
    }
    const claim = await supabase.rpc("claim_account_deletion_job", { p_request_id: id, p_token: leaseToken });
    if (claim.error) return failure("Hesap silme işlemi şu anda başlatılamıyor.", 503);
    let job = claim.data?.[0] as DeletionJob | undefined;
    if (!job) return failure("Talebin durumu değişti veya işlem başka bir yönetici tarafından yürütülüyor. Birkaç dakika sonra yenileyin.", 409);
    leased = true;
    const saveJob = async (changes: Partial<DeletionJob>) => {
      const result = await supabase.from("account_deletion_jobs").update({ ...changes, updated_at: new Date().toISOString() })
        .eq("request_id", id).eq("lease_token", leaseToken).select(JOB_COLUMNS).maybeSingle();
      if (result.error || !result.data) throw new Error("Deletion checkpoint failed");
      job = result.data as DeletionJob;
      return job;
    };
    if (job.phase !== "deleted" && job.phase !== "notified") {
      if (!job.target_user_id || job.target_user_id !== targetUserId) return failure("Silinecek hesap işlem kaydıyla eşleşmiyor.", 409);
      const profile = await supabase.from("profiles").select("role").eq("id", targetUserId).maybeSingle();
      if (profile.error) return failure("Kullanıcının rolü doğrulanamadı; hesap silinmedi.", 503);
      if (["moderator", "editor", "admin", "super_admin"].includes(String(profile.data?.role || ""))) return failure("Yönetici rolleri bu hesap silme akışından silinemez.", 403);
      const account = await supabase.auth.admin.getUserById(targetUserId);
      const missingAccount = account.error?.status === 404;
      if (missingAccount && job.phase === "cleaned") {
        // The provider deletion succeeded before a server interruption. Never
        // require the now-deleted auth.users row to resume completion delivery.
        job = await saveJob({ phase: "deleted", completed_at: new Date().toISOString() });
      } else {
        if (account.error || !account.data?.user) return failure("Silinecek kullanıcı hesabı doğrulanamadı.", 503);
        const user = account.data.user;
        const apple = await revokeAppleBeforeDeletion(supabase, user);
        if (!apple.ok) return NextResponse.json({ error: apple.message, code: apple.code }, { status: apple.status });
        job = await saveJob({ recipient_email: user.email?.trim().toLowerCase() || null });
        await cleanAccountData(supabase, user);
        job = await saveJob({ phase: "cleaned" });
        const removed = await supabase.auth.admin.deleteUser(targetUserId, false);
        if (removed.error) return failure("Hesap sağlayıcıdan silinemedi. İşlem güvenli biçimde yeniden denenebilir.");
        job = await saveJob({ phase: "deleted", completed_at: new Date().toISOString() });
      }
    }
    const result = await finishDeletionNotification(supabase, job, leaseToken);
    if (!onlyNotification) {
      const audit = await supabase.from("admin_audit_logs").insert({ admin_user_id: principal.subject,
        action: "execute_account_deletion", target_type: "kvkk_requests", target_id: id,
        note: "Hesap silindi; kullanıcı içerikleri anonimleştirildi.",
      });
      if (audit.error) console.error("Hesap silme denetim kaydı oluşturulamadı:", audit.error.code || "unknown");
    }
    return NextResponse.json({ success: true, notificationPending: !result.sent,
      message: result.sent ? "Hesap silindi; tamamlanma e-postası gönderim için kabul edildi."
        : "Hesap silindi; tamamlanma e-postası bekliyor. E-posta gönderimini bu talep üzerinden yeniden deneyin.",
    });
  } catch (error) {
    if (error instanceof AccountCleanupError) return failure(error.message, error.status);
    return failure("İşlem tamamlanamadı. Kayıtlı aşamadan devam etmek için talebi yeniden deneyin.", 503);
  } finally {
    if (leased) {
      try {
        await supabase.from("account_deletion_jobs").update({ lease_token: null, lease_until: null })
          .eq("request_id", id).eq("lease_token", leaseToken);
      } catch { /* A crashed request's lease expires after five minutes. */ }
    }
  }
}
