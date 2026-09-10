import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import { getAccountDeletionRequest, getAppleDeletionStatus, hasPendingDeletion, deletionConfirmationMatches, startAppleDeletionAuthorization, submitAccountDeletionRequest, type AccountDeletionRequest, type AppleDeletionStatus } from "../lib/accountDeletion";
import { useI18n } from "../lib/i18n";
import { openExternal } from "../lib/native";
import { Icon } from "./Icon";
import { SupportSheet } from "./SupportSheet";
import "./account-deletion.css";

export function AccountDeletionPanel({ accessToken, email, onBusyChange }: {
  accessToken: string;
  email: string;
  onBusyChange: (busy: boolean) => void;
}) {
  const { locale, copy } = useI18n();
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null);
  const [apple, setApple] = useState<AppleDeletionStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);
  const requestSequence = useRef(0);
  const active = useRef(true);
  const operation = useRef(false);
  const confirmationId = useId();
  const pending = hasPendingDeletion(request);
  const deleteWord = locale === "tr" ? "SİL" : "DELETE";

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      requestSequence.current += 1;
      if (operation.current) onBusyChange(false);
    };
  }, [onBusyChange]);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setLoaded(false);
      setLoading(false);
      setError(copy("Hesap oturumun doğrulanamadı. Yeniden giriş yapıp tekrar dene.", "Your account session could not be verified. Sign in again and retry."));
      return;
    }
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    const results = await Promise.allSettled([getAccountDeletionRequest(accessToken), getAppleDeletionStatus(accessToken)]);
    if (!active.current || sequence !== requestSequence.current) return;
    const [deletionResult, appleResult] = results;
    if (deletionResult.status === "fulfilled") {
      setRequest(deletionResult.value);
      setLoaded(true);
    } else {
      setError(copy("Talep durumun alınamadı. Bağlantını kontrol edip tekrar dene.", "Your request status could not be loaded. Check your connection and try again."));
    }
    setApple(appleResult.status === "fulfilled" ? appleResult.value : null);
    setLoading(false);
  }, [accessToken, copy]);

  useEffect(() => {
    void refresh();
  }, [accessToken, refresh]);

  const current = () => active.current;

  async function submit() {
    if (operation.current || !accessToken || pending || !deletionConfirmationMatches(confirmation, locale)) return;
    const token = accessToken;
    operation.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setNotice("");
    requestSequence.current += 1;
    try {
      const result = await submitAccountDeletionRequest(token, locale, confirmation);
      if (!current()) return;
      requestSequence.current += 1;
      setRequest(result);
      setLoaded(true);
      setLoading(false);
      setConfirmation("");
      setExpanded(false);
      setNotice(copy("Silme talebin alındı. İşlem durumunu buradan takip edebilirsin.", "Your deletion request was received. You can track its status here."));
    } catch (cause) {
      if (!current()) return;
      if (cause instanceof ApiError && cause.status === 409) {
        await refresh();
        if (current()) setNotice(copy("Mevcut talebinin durumu yenilendi.", "Your existing request status has been refreshed."));
      } else {
        setError(copy("Silme talebi gönderilemedi. Durumu yenileyip tekrar dene; sorun sürerse destek ekibine yaz.", "The deletion request could not be sent. Refresh its status and try again; contact support if the issue persists."));
      }
    } finally {
      operation.current = false;
      if (current()) {
        setBusy(false);
        setLoading(false);
        onBusyChange(false);
      }
    }
  }

  async function authorizeApple() {
    if (operation.current || !accessToken) return;
    const token = accessToken;
    operation.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const url = await startAppleDeletionAuthorization(token);
      if (!current()) return;
      const opened = await openExternal(url);
      if (!current()) return;
      if (!opened) {
        setError(copy("Apple doğrulama penceresi açılamadı. Tekrar deneyebilir veya destek ekibine yazabilirsin.", "The Apple verification window could not be opened. Try again or contact support."));
      } else {
        setNotice(copy("Apple doğrulamasını bitirip uygulamaya dönünce Durumu yenile düğmesine dokun.", "After completing Apple verification and returning to the app, tap Refresh status."));
      }
    } catch {
      if (current()) setError(copy("Apple doğrulaması şu anda başlatılamıyor. Silme talebini yine de gönderebilirsin; destek ekibi bu adımı tamamlamana yardımcı olur.", "Apple verification cannot be started right now. You can still submit your deletion request; support can help you complete this step."));
    } finally {
      operation.current = false;
      if (current()) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  const appleReady = apple?.status === "ready" || apple?.status === "revoked";

  return <section className="account-delete-panel" aria-labelledby={`${confirmationId}-heading`}>
    <h3 id={`${confirmationId}-heading`}>{copy("Hesap silme", "Account deletion")}</h3>
    {loading && <p role="status">{copy("Talep durumu yükleniyor…", "Loading request status…")}</p>}
    {notice && <p className="account-delete-notice" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {request && <AccountDeletionRequestSummary request={request} email={email} />}
    {(expanded || pending) && <>
      <p>{copy("Silme talebin en geç 30 gün içinde sonuçlandırılır. Sonuç hesabına kayıtlı e-posta adresine bildirilir.", "Your deletion request will be resolved within 30 days. The outcome will be emailed to your account address.")}</p>
      {!request && email && <p>{copy("Sonuç e-postası", "Result email")}: <strong>{email}</strong></p>}
      <div className="account-delete-apple">
        {apple?.required ? <>
          <strong>{copy("Apple hesabı bağlantısı", "Apple account link")}</strong>
          <p>{appleReady
            ? copy("Apple doğrulama adımı tamamlandı. Hesap silinirken Apple bağlantısı da kaldırılır.", "Apple verification is complete. Your Apple link is also removed when your account is deleted.")
            : copy("Hesabın silinirken Apple bağlantısının da kaldırılması gerekiyor. Apple doğrulamasını tamamla. Bu adım beklerken silme talebini gönderebilirsin.", "Your Apple link also needs to be removed when deleting your account. Complete Apple verification. You can submit your deletion request while this step is pending.")}</p>
          {apple.status === "authorization_required" && <button className="secondary-wide" disabled={busy || loading} onClick={() => void authorizeApple()}>{copy("Apple ile silme doğrulamasını tamamla", "Verify deletion with Apple")}</button>}
          {(apple.status === "configuration_missing" || apple.status === "unavailable") && <p>{copy("Apple doğrulaması şu anda kullanılamıyor. Talebin alınabilir; bu adım için destek ekibine yazabilirsin.", "Apple verification is currently unavailable. Your request can still be received; contact support for help with this step.")}</p>}
        </> : !apple && <p>{copy("Apple bağlantısı kontrol edilemedi. Silme talebini gönderebilir ve durumu daha sonra yenileyebilirsin.", "Your Apple link could not be checked. You can submit your deletion request and refresh its status later.")}</p>}
      </div>
    </>}
    {expanded && !pending && <div className="account-delete-confirm">
      <p>{copy("Silme tamamlandığında hesabın, profilin ve özel seyahat kayıtların kalıcı olarak kaldırılır. Diğer kullanıcıların cevapları korunur; topluluk içeriklerin anonimleştirilir. Bu işlem geri alınamaz.", "Once deletion is complete, your account, profile and private travel records are permanently removed. Other users’ replies are retained and your community content is anonymised. This cannot be undone.")}</p>
      <label htmlFor={confirmationId}>{copy("Onaylamak için SİL yaz", "Type DELETE to confirm")}</label>
      <input id={confirmationId} value={confirmation} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder={deleteWord} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} />
      <button className="danger-wide" disabled={busy || loading || !loaded || !deletionConfirmationMatches(confirmation, locale)} onClick={() => void submit()}><Icon name="trash" size={18} /> {busy ? copy("Gönderiliyor…", "Submitting…") : copy("Kalıcı hesap silme talebini gönder", "Submit permanent account deletion request")}</button>
      <button className="secondary-wide" disabled={busy} onClick={() => { setExpanded(false); setConfirmation(""); }}>{copy("Vazgeç", "Cancel")}</button>
    </div>}
    {!expanded && !pending && <button className="secondary-wide" disabled={busy || loading} onClick={() => setExpanded(true)}><Icon name="trash" size={18} /> {copy("Hesabımı silme talebi oluştur", "Request account deletion")}</button>}
    <button className="secondary-wide" disabled={busy || loading || !accessToken} onClick={() => void refresh()}><Icon name="refresh" size={18} /> {copy("Durumu yenile", "Refresh status")}</button>
    <button className="secondary-wide" disabled={busy} onClick={() => setSupportOpen(true)}>{copy("Destek ekibine yaz", "Contact support")}</button>
    <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />
  </section>;
}

export function AccountDeletionRequestSummary({ request, email }: { request: AccountDeletionRequest; email: string }) {
  const { copy, dateLocale } = useI18n();
  const pending = hasPendingDeletion(request);
  function formatDate(value: string | null) {
    const parsed = value ? new Date(value) : null;
    return parsed && Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(parsed) : copy("Henüz belirlenmedi", "Not available yet");
  }

  const statuses = {
    pending: copy("Talep alındı", "Request received"),
    reviewing: copy("İşlem sürüyor", "In progress"),
    processed: copy("İşlem tamamlandı", "Completed"),
    resolved: copy("İşlem tamamlandı", "Completed"),
    rejected: copy("Talep sonuçlandırıldı", "Request reviewed"),
  };
  return <div className="account-delete-summary">
      <strong>{statuses[request.status]}</strong>
      <dl>
        <div><dt>{copy("Başvuru tarihi", "Submitted")}</dt><dd>{formatDate(request.createdAt)}</dd></div>
        {pending && <div><dt>{copy("En geç sonuçlanma tarihi", "Resolution due by")}</dt><dd>{formatDate(request.targetCompletionAt)}</dd></div>}
        {request.completedAt && <div><dt>{copy("Sonuçlanma tarihi", "Resolved")}</dt><dd>{formatDate(request.completedAt)}</dd></div>}
        <div><dt>{copy("Sonuç e-postası", "Result email")}</dt><dd>{email || copy("Hesabına kayıtlı e-posta", "Your account email")}</dd></div>
      </dl>
      {request.notificationStatus === "sent" && <p>{copy("Sonuç bildirimi e-posta gönderim hizmetine iletildi. Gelen kutunu ve gereksiz postaları kontrol et.", "The result notification was passed to the email delivery service. Check your inbox and spam folder.")}</p>}
      {request.notificationStatus === "pending" && <p>{copy("Sonuç bildiriminin e-postaya iletilmesi bekleniyor.", "Your result notification is waiting to be sent by email.")}</p>}
      {request.status === "rejected" && <p>{copy("Sonuç açıklaması için e-postanı kontrol et veya destek ekibine yaz.", "Check your email for the outcome or contact support.")}</p>}
    </div>;
}
