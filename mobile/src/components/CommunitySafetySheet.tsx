import { useEffect, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/api";
import { blockCommunityAuthor, listCommunityBlocks, reportCommunityContent, unblockCommunityAuthor, type CommunityBlock, type CommunitySafetyTarget } from "../lib/community";
import "./community-safety.css";

const REASONS = [
  ["spam", "Spam veya dolandırıcılık", "Spam or scam"],
  ["harassment", "Hakaret veya taciz", "Abuse or harassment"],
  ["hate", "Nefret söylemi", "Hate speech"],
  ["dangerous", "Tehlikeli veya yasa dışı yönlendirme", "Dangerous or illegal advice"],
  ["personal_data", "Kişisel bilgi paylaşımı", "Personal information"],
  ["other", "Diğer", "Other"],
] as const;

export function CommunitySafetySheet({ target, accessToken, userId, onClose, onBlocked }: {
  target: CommunitySafetyTarget | null;
  accessToken: string;
  userId: string;
  onClose: () => void;
  onBlocked: (userId: string) => void;
}) {
  // A target/owner change discards form state and pending callbacks from the old account.
  return target ? <SafetyForm key={`${userId}:${target.targetType}:${target.targetId}`} target={target} accessToken={accessToken} userId={userId} onClose={onClose} onBlocked={onBlocked} /> : null;
}

function SafetyForm({ target, accessToken, userId, onClose, onBlocked }: {
  target: CommunitySafetyTarget; accessToken: string; userId: string; onClose: () => void; onBlocked: (userId: string) => void;
}) {
  const { copy, locale } = useI18n();
  const [mode, setMode] = useState<"menu" | "report" | "block" | "success">("menu");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const canBlock = Boolean(target.authorId && target.authorId !== userId);
  async function submit(kind: "report" | "block") {
    if (pending.current || !accessToken || target.authorId === userId) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "report") {
        await reportCommunityContent(accessToken, target, reason, note.trim());
        if (active.current) setMode("success");
      } else {
        const result = await blockCommunityAuthor(accessToken, target);
        if (active.current) onBlocked(result.userId);
      }
    } catch (failure) {
      if (active.current) setError(locale === "tr" && failure instanceof ApiError ? failure.message : copy("İşlem tamamlanamadı. Tekrar dene.", "The action could not be completed. Please retry."));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return <Sheet open title={copy("Topluluk güvenliği", "Community safety")} onClose={onClose} dismissible={!busy}>
    <div className="community-safety-form">
      <p className="community-safety-author">@{target.username}</p>
      {error && <p className="info-box error" role="alert">{error}</p>}
      {mode === "menu" && <>
        <p>{copy("Kurallara aykırı bir içeriği bildirebilir veya bu hesabı engelleyebilirsin.", "Report content that breaks the rules or block this account.")}</p>
        <button type="button" className="secondary-wide" onClick={() => setMode("report")}>{copy("İçeriği şikâyet et", "Report content")}</button>
        {canBlock && <button type="button" className="secondary-wide" onClick={() => setMode("block")}>{copy("Kullanıcıyı engelle", "Block user")}</button>}
      </>}
      {mode === "report" && <form onSubmit={(event) => { event.preventDefault(); void submit("report"); }}>
        <fieldset disabled={busy}>
          <legend>{copy("Şikâyet nedeni", "Report reason")}</legend>
          {REASONS.map(([value, tr, en]) => <label className="community-safety-option" key={value}>
            <input type="radio" name="community-report-reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
            <span>{copy(tr, en)}</span>
          </label>)}
          <label className="community-safety-note">{copy("Açıklama (Diğer için gerekli)", "Details (required for Other)")}
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} required={reason === "other"} minLength={reason === "other" ? 5 : undefined} />
          </label>
        </fieldset>
        <p>{copy("Şikâyetin moderasyon ekibine iletilir. Kimliğin içerik sahibine gösterilmez. Özel belgelerini veya iletişim bilgilerini ekleme.", "Your report goes to the moderation team. Your identity is not shown to the author. Do not include private documents or contact details.")}</p>
        <button type="submit" className="primary-wide" disabled={busy || !reason || (reason === "other" && note.trim().length < 5)}>{busy ? copy("Gönderiliyor…", "Sending…") : copy("Şikâyeti gönder", "Send report")}</button>
      </form>}
      {mode === "block" && <>
        <p>{copy("Bu hesabın topluluk soruları ve cevapları gizlenir; aranızdaki yeni topluluk etkileşimleri engellenir. Engeli daha sonra Engellenen hesaplar bölümünden kaldırabilirsin.", "This account's community questions and replies will be hidden, and new community interactions between you will be blocked. You can unblock them later in Blocked accounts.")}</p>
        <button type="button" className="primary-wide" disabled={busy || !canBlock} onClick={() => void submit("block")}>{busy ? copy("Engelleniyor…", "Blocking…") : copy("Evet, engelle", "Yes, block")}</button>
      </>}
      {mode === "success" && <div role="status">
        <h3>{copy("Şikâyetin alındı", "Report received")}</h3>
        <p>{copy("İçerik moderasyon sırasına eklendi. İnceleme sonucuna göre içerik kaldırılabilir ve ilgili hesap için işlem yapılabilir.", "The content was added to the moderation queue. The review may result in content removal and action on the account.")}</p>
        {canBlock && <button type="button" className="secondary-wide" onClick={() => setMode("block")}>{copy("Bu kullanıcıyı da engelle", "Also block this user")}</button>}
        <button type="button" className="primary-wide" onClick={onClose}>{copy("Tamam", "Done")}</button>
      </div>}
      {mode !== "menu" && mode !== "success" && <button type="button" className="secondary-wide" disabled={busy} onClick={() => { setMode("menu"); setError(""); }}>{copy("Vazgeç", "Cancel")}</button>}
    </div>
  </Sheet>;
}

export function CommunityBlocksSheet({ accessToken, onClose, onChanged }: { accessToken: string; onClose: () => void; onChanged: () => void }) {
  const { copy, locale } = useI18n();
  const [blocks, setBlocks] = useState<CommunityBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void listCommunityBlocks(accessToken).then((rows) => { if (!cancelled) setBlocks(rows); }).catch(() => {
      if (!cancelled) setError(copy("Engellenen hesaplar yüklenemedi. Tekrar dene.", "Blocked accounts could not be loaded. Please retry."));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, copy, revision]);
  async function unblock(userId: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(userId);
    setError("");
    try {
      await unblockCommunityAuthor(accessToken, userId);
      if (!active.current) return;
      setBlocks((rows) => rows.filter((row) => row.userId !== userId));
      onChanged();
    } catch (failure) {
      if (active.current) setError(locale === "tr" && failure instanceof ApiError ? failure.message : copy("Engel kaldırılamadı. Tekrar dene.", "Could not unblock this account. Please retry."));
    } finally {
      pending.current = false;
      if (active.current) setBusy("");
    }
  }
  return <Sheet open title={copy("Engellenen hesaplar", "Blocked accounts")} onClose={onClose} dismissible={!busy}>
    <div className="community-safety-form">
      {loading && <p role="status">{copy("Yükleniyor…", "Loading…")}</p>}
      {error && <div className="info-box error" role="alert"><p>{error}</p><button type="button" disabled={Boolean(busy)} onClick={() => setRevision((value) => value + 1)}>{copy("Tekrar dene", "Retry")}</button></div>}
      {!loading && !error && !blocks.length && <p role="status">{copy("Engellediğin hesap yok.", "You have no blocked accounts.")}</p>}
      {!loading && blocks.map((block) => <div className="community-block-row" key={block.userId}>
        <strong>@{block.authorName || copy("Gezgin", "Traveller")}</strong>
        <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void unblock(block.userId)}>{busy === block.userId ? copy("Kaldırılıyor…", "Unblocking…") : copy("Engeli kaldır", "Unblock")}</button>
      </div>)}
    </div>
  </Sheet>;
}
