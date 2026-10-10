import { useEffect, useId, useRef, useState } from "react";
import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { copySupportText, openExternal, openMailDraft } from "../lib/native";
import { createSupportDraft, supportDraftText } from "../lib/support";
import { ApiError } from "../lib/api";
import { clearIssueDraft, newIssueId, prepareIssueScreenshot, readIssueDraft, saveIssueDraft, sendIssueReport, type IssueDraft } from "../lib/issueReport";
import { Sheet } from "./Sheet";
import "./support-sheet.css";

export function SupportSheet({ open, onClose, screen, accessToken, ownerId }: { open: boolean; onClose: () => void; screen?: string; accessToken?: string; ownerId?: string | null }) {
  const { copy } = useI18n();
  return <Sheet open={open} onClose={onClose} title={copy("Sorun bildir", "Report a problem", "Raporto një problem")} size="large">
    {open && <IssueReportForm key={ownerId || "guest"} screen={screen} accessToken={accessToken} ownerId={ownerId} />}
  </Sheet>;
}

export function IssueReportForm({ screen, accessToken, ownerId }: { screen?: string; accessToken?: string; ownerId?: string | null }) {
  const { locale, copy } = useI18n();
  const [draft, setDraft] = useState(() => readIssueDraft(screen, ownerId));
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const busy = useRef(false);
  const draftRef = useRef(draft);
  const active = useRef(true);
  const formId = useId();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  function updateDraft(change: Partial<IssueDraft>) {
    const next = { ...draftRef.current, ...change, requestId: newIssueId() };
    draftRef.current = next;
    saveIssueDraft(next, ownerId);
    setDraft(next);
    setError("");
  }

  async function attach(file?: File) {
    if (!file || busy.current) return;
    setPreparing(true);
    setError("");
    try { const screenshot = await prepareIssueScreenshot(file); if (active.current) updateDraft({ screenshot }); }
    catch { setError(copy("Görsel açılamadı. En fazla 8 MB boyutunda bir JPG, PNG veya WebP seç.", "Could not open the image. Choose a JPG, PNG or WebP up to 8 MB.", "Imazhi nuk u hap. Zgjidh një JPG, PNG ose WebP deri në 8 MB.")); }
    finally { setPreparing(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || preparing) return;
    if (draft.description.trim().length < 10) {
      setError(copy("Sorunu en az 10 karakterle açıkla.", "Describe the problem using at least 10 characters.", "Përshkruaje problemin me të paktën 10 karaktere."));
      descriptionRef.current?.focus();
      return;
    }
    busy.current = true;
    setSending(true);
    setError("");
    saveIssueDraft(draft, ownerId);
    try {
      const id = await sendIssueReport(draft, { locale, version: config.appVersion, build: config.buildNumber }, accessToken);
      clearIssueDraft(draft.requestId, ownerId);
      setReceipt(id);
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : "";
      if (code === "id-conflict" && active.current) updateDraft({});
      setError(code === "id-conflict"
        ? copy("Önceki denemenin durumu doğrulanamadı. Tekrar denersen yeni bir bildirim gönderilecek; yazdıkların korundu.", "The previous attempt could not be confirmed. Retrying will send a new report; your text is preserved.", "Përpjekja e mëparshme nuk u konfirmua. Nëse provon sërish, dërgohet një raportim i ri; teksti yt u ruajt.")
        : code === "rate-limited"
        ? copy("Kısa sürede çok sayıda bildirim gönderdin. Bir saat sonra yeniden dene; taslağın burada duruyor.", "You have sent several reports recently. Try again in an hour; your draft is still here.", "Ke dërguar disa raportime së fundmi. Provo pas një ore; drafti yt ruhet këtu.")
        : code === "invalid-image"
          ? copy("Görsel işlenemedi. Başka bir görsel seçebilir veya kaldırıp yeniden deneyebilirsin.", "The image could not be processed. Choose another image or remove it and try again.", "Imazhi nuk u përpunua. Zgjidh një tjetër ose hiqe dhe provo sërish.")
          : copy("Bildirim gönderilemedi. Yazdıkların ve seçtiğin görsel korundu. Bağlantını kontrol edip yeniden dene veya aşağıdaki e-posta seçeneğini kullan.", "The report could not be sent. Your text and selected image are preserved. Check your connection and retry, or use the email option below.", "Raportimi nuk u dërgua. Teksti dhe imazhi i zgjedhur u ruajtën. Kontrollo lidhjen dhe provo sërish, ose përdor opsionin e emailit më poshtë."));
    } finally { busy.current = false; setSending(false); }
  }

  const screenNames: Record<string, string> = {
    home: copy("Keşfet", "Discover", "Zbulo"), trips: copy("Planlar", "Plans", "Planet"),
    community: copy("Topluluk", "Community", "Komuniteti"), profile: copy("Profil", "Profile", "Profili"),
    companion: copy("Araçlar", "Tools", "Mjetet"), route: copy("Rota oluştur", "Create a route", "Krijo itinerar"),
    cockpit: copy("Seyahat Kokpiti", "Travel Cockpit", "Paneli i udhëtimit"), costs: copy("Ülke Maliyetleri", "Country Costs", "Kostot e vendeve"),
  };

  return <div className="support-draft">
    {receipt ? <div className="support-report-receipt" role="status">
      <strong>{copy("Bildirimin alındı", "Report received", "Raportimi u mor")}</strong>
      <p>{copy("Sorun kaydedildi ve destek ekibinin inceleme listesine eklendi.", "Your report was saved and added to the support team's review list.", "Raportimi yt u ruajt dhe iu shtua listës së shqyrtimit të ekipit të ndihmës.")}</p>
      <small>{copy("Bildirim numarası", "Report ID", "Numri i raportimit")}: {receipt}</small>
      <button type="button" className="secondary-button" onClick={() => { const next = readIssueDraft(screen, ownerId); draftRef.current = next; setDraft(next); setReceipt(""); }}>{copy("Yeni bildirim", "New report", "Raportim i ri")}</button>
    </div> : <form className="support-report-form" onSubmit={event => void submit(event)}>
      <p>{copy("Nerede takıldığını kısaca anlat. Ekran görüntüsü eklemek isteğe bağlı.", "Briefly describe what went wrong. Adding a screenshot is optional.", "Përshkruaj shkurt çfarë nuk funksionoi. Pamja e ekranit është opsionale.")}</p>
      <p className="support-report-context"><strong>{copy("İlgili ekran", "Related screen", "Ekrani përkatës")}: {screenNames[draft.screen] || draft.screen}</strong><small>LetsGo2Travel {config.appVersion} · Build {config.buildNumber}</small></p>
      <label htmlFor={`${formId}-description`}>{copy("Ne oldu?", "What happened?", "Çfarë ndodhi?")}</label>
      <textarea ref={descriptionRef} id={`${formId}-description`} value={draft.description} rows={5} maxLength={3000} required disabled={sending} aria-describedby={`${formId}-privacy`} onChange={event => updateDraft({ description: event.target.value })} placeholder={copy("Örn. Rotamı kaydederken hata gördüm…", "For example, I saw an error while saving my route…", "P.sh., pashë një gabim kur po ruaja itinerarin…")} />
      <label htmlFor={`${formId}-reply`}>{copy("Yanıt için e-posta (isteğe bağlı)", "Email for a reply (optional)", "Email për përgjigje (opsional)")}</label>
      <input id={`${formId}-reply`} type="email" autoComplete="email" maxLength={254} value={draft.email} disabled={sending} onChange={event => updateDraft({ email: event.target.value })} />
      <label htmlFor={`${formId}-image`}>{copy("Ekran görüntüsü (isteğe bağlı)", "Screenshot (optional)", "Pamje ekrani (opsionale)")}</label>
      <input id={`${formId}-image`} type="file" accept="image/jpeg,image/png,image/webp" disabled={sending || preparing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void attach(file); }} />
      <small className="support-draft-note">JPG, PNG, WebP · {copy("En fazla 8 MB", "Up to 8 MB", "Deri në 8 MB")}</small>
      {preparing && <p role="status">{copy("Görsel hazırlanıyor…", "Preparing image…", "Duke përgatitur imazhin…")}</p>}
      {draft.screenshot && <figure className="support-report-image"><img src={draft.screenshot} alt={copy("Göndereceğin ekran görüntüsü", "Screenshot to be sent", "Pamja e ekranit që do të dërgohet")} /><button type="button" className="secondary-button" disabled={sending} onClick={() => updateDraft({ screenshot: null })}>{copy("Görseli kaldır", "Remove image", "Hiq imazhin")}</button></figure>}
      <p id={`${formId}-privacy`} className="support-draft-note">{copy("Yalnızca yazdıkların, seçtiğin görsel, ekran adı ve uygulama sürümü gönderilir. Şifre veya kimlik belgesi ekleme; görseldeki özel bilgileri kapat.", "Only your text, selected image, screen name and app version are sent. Do not include passwords or identity documents; hide private details in the image.", "Dërgohen vetëm teksti, imazhi i zgjedhur, emri i ekranit dhe versioni i aplikacionit. Mos përfshi fjalëkalime ose dokumente identiteti; mbulo të dhënat private në imazh.")}</p>
      {error && <p className="support-report-error" role="alert">{error}</p>}
      <button type="submit" className="primary-wide" disabled={sending || preparing}>{sending ? copy("Gönderiliyor…", "Sending…", "Duke dërguar…") : error ? copy("Tekrar dene", "Try again", "Provo sërish") : copy("Bildirimi gönder", "Send report", "Dërgo raportimin")}</button>
    </form>}
    <details className="support-email-alternative"><summary>{copy("E-posta ile destek al", "Contact support by email", "Kontakto ndihmën me email")}</summary><SupportDraftForm key={draft.requestId} description={draft.description} screen={draft.screen} hasScreenshot={Boolean(draft.screenshot)} /></details>
  </div>;
}

function SupportDraftForm({ description = "", screen = "", hasScreenshot = false }: { description?: string; screen?: string; hasScreenshot?: boolean }) {
  const { locale, copy } = useI18n();
  const [draft, setDraft] = useState(() => {
    const initial = createSupportDraft(config.supportEmail, config.appVersion, config.buildNumber, locale);
    return description ? { ...initial, body: `${description}\n\nScreen: ${screen}\nApp: ${config.appVersion}\nBuild: ${config.buildNumber}` } : initial;
  });
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const copyRef = useRef<HTMLTextAreaElement>(null);
  const formId = useId();

  async function copyText(text: string) {
    const copied = await copySupportText(text);
    setManualCopy(copied ? null : text);
    setNotice(copied
      ? copy("Panoya kopyalandı.", "Copied to clipboard.")
      : copy("Otomatik kopyalanamadı. Aşağıdaki metni seçip kopyalayabilirsin.", "Automatic copy is unavailable. Select and copy the text below."));
  }

  function openMail() {
    const result = openMailDraft(draft);
    setNotice(result === "handoff"
      ? copy("E-posta uygulaması açılmazsa adresi ve taslağı kopyalayıp kullandığın e-posta hizmetine yapıştır.", "If your mail app does not open, copy the address and draft into your preferred email service.")
      : copy("E-posta uygulaması açılamadı. Adresi ve taslağı kopyalayarak destek ekibine yazabilirsin.", "The mail app could not be opened. Copy the address and draft to contact support."));
  }

  return <div className="support-draft">
    {hasScreenshot && <p className="support-draft-note">{copy("Seçtiğin görsel e-posta taslağına otomatik eklenmez. E-posta uygulamasında kendin eklemelisin.", "Your selected image is not attached to the email draft automatically. Attach it yourself in your mail app.", "Imazhi i zgjedhur nuk i bashkëngjitet automatikisht draftit të emailit. Shtoje vetë në aplikacionin e emailit.")}</p>}
    <p>{copy("Sorununu aşağıya yaz. Taslağı e-posta uygulamanda kontrol edip sen göndereceksin.", "Describe your problem below. You will review and send the draft in your mail app.")}</p>
    <label htmlFor={`${formId}-email`}>{copy("Destek adresi", "Support address")}</label>
    <input id={`${formId}-email`} value={draft.email} readOnly onFocus={(event) => event.currentTarget.select()} />
    <button className="secondary-button" onClick={() => void copyText(draft.email)}>{copy("Adresi kopyala", "Copy email address")}</button>
    <label htmlFor={`${formId}-subject`}>{copy("Konu", "Subject")}</label>
    <input id={`${formId}-subject`} value={draft.subject} maxLength={180} onChange={(event) => setDraft((value) => ({ ...value, subject: event.target.value }))} />
    <label htmlFor={`${formId}-body`}>{copy("Mesaj taslağı", "Message draft")}</label>
    <textarea id={`${formId}-body`} rows={7} maxLength={6000} value={draft.body} onChange={(event) => setDraft((value) => ({ ...value, body: event.target.value }))} />
    <p className="support-draft-note">{copy("Taslakta ekran adı ve uygulama sürümü bulunabilir. Şifre, rezervasyon kodu veya kimlik belgesi ekleme.", "The draft may include the screen name and app version. Do not include passwords, booking references or identity documents.", "Drafti mund të përmbajë emrin e ekranit dhe versionin e aplikacionit. Mos shto fjalëkalime, kode rezervimi ose dokumente identiteti.")}</p>
    <div className="support-draft-actions">
      <button className="primary-wide" onClick={openMail}>{copy("E-posta uygulamasında aç", "Open in mail app")}</button>
      <button className="secondary-button" onClick={() => void copyText(supportDraftText(draft))}>{copy("Taslağı kopyala", "Copy draft")}</button>
    </div>
    <p className="support-draft-note">{copy("E-posta uygulaman yoksa adresi ve taslağı kopyalayıp web üzerinden kullandığın e-posta hizmetine yapıştırabilirsin. Buradan otomatik mesaj gönderilmez.", "If you do not have a mail app, copy the address and draft into your webmail service. No message is sent automatically from here.")}</p>
    {notice && <p className="support-draft-status" role="status">{notice}</p>}
    {manualCopy !== null && <div className="support-draft-manual">
      <label htmlFor={`${formId}-copy`}>{copy("Kopyalanacak metin", "Text to copy")}</label>
      <textarea id={`${formId}-copy`} ref={copyRef} readOnly value={manualCopy} onFocus={(event) => event.currentTarget.select()} />
      <button className="secondary-button" onClick={() => { copyRef.current?.focus(); copyRef.current?.select(); }}>{copy("Metni seç", "Select text")}</button>
    </div>}
    <button className="secondary-button" onClick={() => void openExternal(`${config.apiBaseUrl}/destek`).then((opened) => {
      if (!opened) setNotice(copy("Destek sayfası açılamadı. Yukarıdaki e-posta adresini kopyalayabilirsin.", "The support page could not be opened. You can copy the email address above."));
    })}>{copy("Web destek sayfası", "Web support page")}</button>
  </div>;
}
