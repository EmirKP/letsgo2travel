import { useId, useRef, useState } from "react";
import { config } from "../lib/config";
import { useI18n } from "../lib/i18n";
import { copySupportText, openExternal, openMailDraft } from "../lib/native";
import { createSupportDraft, supportDraftText } from "../lib/support";
import { Sheet } from "./Sheet";
import "./support-sheet.css";

export function SupportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copy } = useI18n();
  return <Sheet open={open} onClose={onClose} title={copy("Destek", "Support")} size="large">
    {open && <SupportDraftForm />}
  </Sheet>;
}

function SupportDraftForm() {
  const { locale, copy } = useI18n();
  const [draft, setDraft] = useState(() => createSupportDraft(config.supportEmail, config.appVersion, config.buildNumber, locale));
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
    <p>{copy("Sorununu aşağıya yaz. Taslağı e-posta uygulamanda kontrol edip sen göndereceksin.", "Describe your problem below. You will review and send the draft in your mail app.")}</p>
    <label htmlFor={`${formId}-email`}>{copy("Destek adresi", "Support address")}</label>
    <input id={`${formId}-email`} value={draft.email} readOnly onFocus={(event) => event.currentTarget.select()} />
    <button className="secondary-button" onClick={() => void copyText(draft.email)}>{copy("Adresi kopyala", "Copy email address")}</button>
    <label htmlFor={`${formId}-subject`}>{copy("Konu", "Subject")}</label>
    <input id={`${formId}-subject`} value={draft.subject} maxLength={180} onChange={(event) => setDraft((value) => ({ ...value, subject: event.target.value }))} />
    <label htmlFor={`${formId}-body`}>{copy("Mesaj taslağı", "Message draft")}</label>
    <textarea id={`${formId}-body`} rows={7} maxLength={6000} value={draft.body} onChange={(event) => setDraft((value) => ({ ...value, body: event.target.value }))} />
    <p className="support-draft-note">{copy("Taslağa yalnızca uygulama sürümü ve build numarası eklendi. Şifre, rezervasyon kodu veya kimlik belgesi ekleme.", "Only the app version and build number were added to the draft. Do not include passwords, booking references or identity documents.")}</p>
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
