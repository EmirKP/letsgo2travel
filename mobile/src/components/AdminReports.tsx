import { useEffect, useRef, useState } from "react";
import { requestJson } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { formatAppDate } from "../lib/localeFormatting";

type Report = {
  id: string; reason: string; target_type: string; status: string; created_at: string;
  targetContent: { title?: string; content: string; author_name: string } | null;
  targetError?: boolean;
};

/** Mounted with a session key; late reads/mutations cannot update another account. */
export function AdminReports({ accessToken, onChanged }: { accessToken: string; onChanged: () => void }) {
  const { copy, dateLocale } = useI18n();
  const [rows, setRows] = useState<Report[]>([]);
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    setLoading(true); setError(false);
    void requestJson<{ data: Report[]; count: number }>(`/api/admin/forum/reports?status=${status}&page=${page}&limit=20`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(response => {
      if (!current) return;
      if (!Array.isArray(response.data)) throw new Error("invalid_reports");
      setRows(response.data); setCount(response.count);
    }).catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [accessToken, page, status, reload]);

  const moderate = async (report: Report, nextStatus: "resolved" | "dismissed", hide = false) => {
    if (busy || loading) return;
    if (hide && !window.confirm(copy("Bu içeriği gizle ve raporu çöz?", "Hide this content and resolve the report?", "Ta fshehësh përmbajtjen dhe ta zgjidhësh raportimin?"))) return;
    setBusy(report.id); setActionError(false);
    try {
      await requestJson("/api/admin/forum/reports", {
        method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` },
        body: { id: report.id, status: nextStatus, ...(hide ? { action: "hide" } : {}) },
      });
      if (!active.current) return;
      setReload(value => value + 1); onChanged();
    } catch { if (active.current) setActionError(true); }
    finally { if (active.current) setBusy(""); }
  };

  return <section className="admin-section">
    <div className="section-heading"><h2>{copy("İçerik bildirimleri", "Content reports", "Raportimet e përmbajtjes")}</h2>
      <label>{copy("Durum", "Status", "Statusi")}<select disabled={Boolean(busy)} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="open">{copy("Açık", "Open", "Të hapura")}</option><option value="resolved">{copy("Çözüldü", "Resolved", "Të zgjidhura")}</option><option value="dismissed">{copy("Geçersiz", "Dismissed", "Të hedhura poshtë")}</option>
      </select></label>
    </div>
    {loading && <p role="status">{copy("Yükleniyor…", "Loading…", "Duke ngarkuar…")}</p>}
    {error && <div role="alert"><p>{copy("Raporlar yüklenemedi.", "Reports could not load.", "Raportimet nuk u ngarkuan.")}</p><button onClick={() => setReload(value => value + 1)}>{copy("Tekrar dene", "Retry", "Provo sërish")}</button></div>}
    {actionError && <p role="alert">{copy("İşlem sonucu doğrulanamadı. Tekrar denemeden önce raporları yenile.", "The result could not be confirmed. Refresh reports before retrying.", "Rezultati nuk u konfirmua. Rifresko raportimet para se të provosh sërish.")}</p>}
    {!loading && !error && <div className="admin-queue">{rows.map(report => <article key={report.id}>
      <div><strong>{report.reason}</strong><small>{formatAppDate(new Date(report.created_at), dateLocale)}</small>
        {report.targetContent ? <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><strong>{report.targetContent.title || copy("Bildirilen cevap", "Reported reply", "Përgjigjja e raportuar")}</strong><p>{report.targetContent.content}</p><small>@{report.targetContent.author_name}</small></blockquote>
          : <p role={report.targetError ? "alert" : undefined}>{report.targetError ? copy("Hedef içerik yüklenemedi. Listeyi yenile.", "The reported content could not load. Refresh the list.", "Përmbajtja e raportuar nuk u ngarkua. Rifresko listën.") : copy("Hedef içerik artık mevcut değil.", "The reported content no longer exists.", "Përmbajtja e raportuar nuk ekziston më.")}</p>}
      </div>
      {report.status === "open" && <div className="admin-actions">
        <button disabled={Boolean(busy) || !report.targetContent} onClick={() => void moderate(report, "resolved", true)}>{copy("İçeriği gizle ve çöz", "Hide content and resolve", "Fshih përmbajtjen dhe zgjidh")}</button>
        <button disabled={Boolean(busy)} onClick={() => void moderate(report, "resolved")}>{copy("Çözüldü", "Resolve", "Zgjidh")}</button>
        <button disabled={Boolean(busy)} onClick={() => void moderate(report, "dismissed")}>{copy("Geçersiz", "Dismiss", "Hidh poshtë")}</button>
      </div>}
    </article>)}{!rows.length && <p>{copy("Bu durumda rapor yok.", "No reports with this status.", "Nuk ka raportime me këtë status.")}</p>}</div>}
    <div className="admin-actions"><button disabled={page === 1 || loading || Boolean(busy)} onClick={() => setPage(value => value - 1)}>{copy("Önceki", "Previous", "Para")}</button><span>{page}</span><button disabled={page * 20 >= count || loading || Boolean(busy)} onClick={() => setPage(value => value + 1)}>{copy("Sonraki", "Next", "Pas")}</button><button disabled={loading || Boolean(busy)} onClick={() => setReload(value => value + 1)}>{copy("Yenile", "Refresh", "Rifresko")}</button></div>
  </section>;
}
