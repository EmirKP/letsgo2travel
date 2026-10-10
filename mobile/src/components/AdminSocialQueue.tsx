import { useEffect, useRef, useState } from "react";
import { requestJson } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { formatAppDate } from "../lib/localeFormatting";
import { SocialPhoto } from "./SocialPhoto";
import "./social.css";

type Section = "posts" | "comments" | "reports";
type Target = { type: "post" | "comment"; id: string; postId: string; username: string; status: string; caption: string; body: string | null; visibility: string; photoUrl: string };
type Item = { id: string; username: string; caption?: string; body?: string; reason?: string; details?: string; status?: string; created_at: string; photoUrl?: string; visibility?: string; resolved_at?: string | null; target?: Target | null };

export function AdminSocialQueue({ accessToken }: { accessToken: string }) {
  return <SocialQueueSession key={accessToken} accessToken={accessToken}/>;
}
function SocialQueueSession({ accessToken }: { accessToken: string }) {
  const { copy, dateLocale } = useI18n();
  const [section, setSection] = useState<Section>("posts");
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<Item[]>([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const active = useRef(true);
  const mutation = useRef<AbortController | null>(null);
  const busy = loading || saving;
  useEffect(() => { active.current = true; return () => { active.current = false; mutation.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false); setItems([]); setNextOffset(null);
    void requestJson<{ data: { items: Item[]; nextOffset: number | null } }>(`/api/admin/social?${new URLSearchParams({ section, status, offset: String(offset) })}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
    }).then(result => {
      if (!Array.isArray(result.data?.items)) throw new Error("invalid_queue");
      if (!controller.signal.aborted) { setItems(result.data.items); setNextOffset(result.data.nextOffset); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken, section, status, offset, revision]);

  async function moderate(id: string, nextStatus?: string, action?: "resolve" | "hide") {
    if (loading || mutation.current) return;
    const controller = new AbortController(); mutation.current = controller;
    setSaving(true); setError(false);
    try {
      await requestJson("/api/admin/social", { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` },
        body: { section, id, ...(section === "reports" ? { action: action || "resolve" } : { status: nextStatus }) }, signal: controller.signal });
      if (active.current && !controller.signal.aborted) setRevision(value => value + 1);
    } catch { if (active.current && !controller.signal.aborted) setError(true); }
    finally { if (mutation.current === controller) mutation.current = null; if (active.current) setSaving(false); }
  }
  const reasonLabel = (reason?: string) => ({
    spam: copy("Spam", "Spam", "Spam"), harassment: copy("Taciz", "Harassment", "Ngacmim"),
    inappropriate: copy("Uygunsuz içerik", "Inappropriate content", "Përmbajtje e papërshtatshme"), other: copy("Diğer", "Other", "Tjetër"),
  }[reason || ""] || reason);

  return <section className="admin-section"><h2>{copy("Sosyal paylaşımlar", "Social posts", "Postimet sociale")}</h2>
    <div className="ta-form-row">
      <label>{copy("İçerik", "Content", "Përmbajtja")}<select value={section} disabled={busy} onChange={event => { setSection(event.target.value as Section); setStatus("pending"); setOffset(0); }}>
        <option value="posts">{copy("Gönderiler", "Posts", "Postime")}</option><option value="comments">{copy("Yorumlar", "Comments", "Komente")}</option><option value="reports">{copy("Şikayetler", "Reports", "Raportime")}</option>
      </select></label>
      <label>{copy("Durum", "Status", "Gjendja")}<select value={status} disabled={busy} onChange={event => { setStatus(event.target.value); setOffset(0); }}>
        <option value="pending">{copy("Bekleyen", "Pending", "Në pritje")}</option>
        {section === "reports" ? <option value="resolved">{copy("Çözüldü", "Resolved", "Të zgjidhura")}</option> : <><option value="published">{copy("Yayında", "Published", "Publikuar")}</option><option value="hidden">{copy("Gizli", "Hidden", "Fshehur")}</option></>}
        <option value="all">{copy("Tümü", "All", "Të gjitha")}</option>
      </select></label>
    </div>
    {busy && <p role="status">{copy("Yükleniyor…", "Loading…", "Po ngarkohet…")}</p>}
    {error && <div role="alert"><p>{copy("İşlem tamamlanamadı. Listeyi yenileyip tekrar dene.", "Could not complete the action. Refresh the list and try again.", "Veprimi nuk përfundoi. Rifresko listën dhe provo sërish.")}</p><button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>{copy("Tekrar dene", "Retry", "Provo sërish")}</button></div>}
    {!busy && !error && !items.length && <p>{copy("Bu listede içerik yok.", "No items in this list.", "Nuk ka përmbajtje në këtë listë.")}</p>}
    <div className="admin-queue">{items.map(item => <article key={item.id}>
      <strong>{section === "reports" ? `${copy("Bildiren", "Reported by", "Raportuar nga")}: ` : ""}@{item.username}</strong>
      <small>{formatAppDate(new Date(item.created_at), dateLocale, { day: "numeric", month: "short", year: "numeric" })}</small>
      {section === "reports" ? <>
        <p><strong>{reasonLabel(item.reason)}</strong></p>{item.details && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.details}</p>}
        {item.target ? <blockquote className="admin-social-target">
          <strong>{item.target.type === "comment" ? copy("Bildirilen yorum", "Reported comment", "Komenti i raportuar") : copy("Bildirilen gönderi", "Reported post", "Postimi i raportuar")} · @{item.target.username}</strong>
          {item.target.body && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.target.body}</p>}
          {item.target.type === "comment" && <small>{copy("Yorumun bulunduğu gönderi", "Post containing this comment", "Postimi që përmban komentin")}</small>}
          <SocialPhoto photoUrl={item.target.photoUrl} accessToken={accessToken} alt={item.target.caption || copy("İncelenecek fotoğraf", "Photo for review", "Foto për shqyrtim")}/>
          {item.target.caption && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.target.caption}</p>}
          {item.target.visibility === "followers" && <small>{copy("Yalnızca takipçiler", "Followers only", "Vetëm ndjekësit")}</small>}
          {item.target.status === "hidden" && <small>{copy("İçerik zaten gizli.", "Content is already hidden.", "Përmbajtja është tashmë e fshehur.")}</small>}
        </blockquote> : <p>{copy("Bildirilen içerik artık mevcut değil.", "The reported content no longer exists.", "Përmbajtja e raportuar nuk ekziston më.")}</p>}
        {item.resolved_at && <small>{copy("Çözüldü", "Resolved", "E zgjidhur")} · {formatAppDate(new Date(item.resolved_at), dateLocale)}</small>}
      </> : <>
        {item.photoUrl && <SocialPhoto photoUrl={item.photoUrl} accessToken={accessToken} alt={item.caption || copy("İncelenecek fotoğraf", "Photo for review", "Foto për shqyrtim")}/>}
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.caption || item.body}</p>
        {item.visibility === "followers" && <small>{copy("Yalnızca takipçiler", "Followers only", "Vetëm ndjekësit")}</small>}
      </>}
      <div className="admin-actions">{section === "reports" ? !item.resolved_at && <>
        <button type="button" disabled={busy || !item.target} onClick={() => void moderate(item.id, undefined, "hide")}>{copy("İçeriği gizle ve çöz", "Hide content and resolve", "Fshih përmbajtjen dhe zgjidh")}</button>
        <button type="button" disabled={busy} onClick={() => void moderate(item.id, undefined, "resolve")}>{copy("Çözüldü olarak işaretle", "Mark resolved", "Shëno si të zgjidhur")}</button>
      </> : <>
        <button type="button" className="approve" disabled={busy || item.status === "published"} onClick={() => void moderate(item.id, "published")}>{copy("Yayınla", "Publish", "Publiko")}</button>
        <button type="button" disabled={busy || item.status === "hidden"} onClick={() => void moderate(item.id, "hidden")}>{copy("Gizle", "Hide", "Fshih")}</button>
      </>}</div>
    </article>)}</div>
    <div className="admin-actions"><button type="button" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>{copy("Önceki", "Previous", "Më parë")}</button><button type="button" disabled={busy || nextOffset === null} onClick={() => nextOffset !== null && setOffset(nextOffset)}>{copy("Sonraki", "Next", "Tjetra")}</button></div>
  </section>;
}
