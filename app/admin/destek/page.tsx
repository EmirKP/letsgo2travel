"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./support.module.css";

type Report = { id: string; description: string; reply_email: string | null; screen: string; locale: string; app_version: string; build_number: string; status: string; created_at: string; has_screenshot: boolean };

export default function SupportAdminPage() {
  const [status, setStatus] = useState("open");
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [reports, setReports] = useState<Report[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/support-issues?status=${status}&offset=${offset}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Bildirimler yüklenemedi.");
        if (!controller.signal.aborted) { setReports(result.data || []); setCount(result.count || 0); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Bildirimler yüklenemedi."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [status, offset, reload]);

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  async function update(report: Report) {
    setPending(report.id); setError("");
    try {
      const response = await fetch("/api/admin/support-issues", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: report.id, status: report.status === "open" ? "resolved" : "open" }) });
      if (!response.ok) throw new Error("Bildirim güncellenemedi.");
      setReload(value => value + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "İşlem tamamlanamadı."); }
    finally { setPending(""); }
  }

  async function showImage(id: string) {
    setPending(id); setError("");
    try {
      const response = await fetch(`/api/admin/support-issues?image=${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "Bu bildirime görsel eklenmemiş." : "Görsel yüklenemedi.");
      setImage({ id, url: URL.createObjectURL(await response.blob()) });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Görsel yüklenemedi."); }
    finally { setPending(""); }
  }

  return <main className={styles.page}>
    <Link href="/admin">← Yönetim merkezi</Link>
    <h1>Uygulama sorun bildirimleri</h1>
    <p>Kullanıcıların uygulama içinden gönderdiği özel bildirimler.</p>
    <div className={styles.actions}><label>Durum <select value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}><option value="open">Açık</option><option value="resolved">Çözüldü</option></select></label><button onClick={() => setReload(value => value + 1)}>Yenile</button></div>
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Yükleniyor…</p> : <>
      <p>{count} bildirim</p>
      {!reports.length && <p>Bu durumda bildirim bulunamadı.</p>}
      {reports.map(report => <article key={report.id} className={styles.card}>
        <strong>{report.screen} · {report.app_version} ({report.build_number})</strong>
        <small>{new Date(report.created_at).toLocaleString("tr-TR")} · {report.locale.toUpperCase()} · {report.id}</small>
        <p className={styles.description}>{report.description}</p>
        <p>{report.reply_email ? <>Yanıt adresi: <a href={`mailto:${encodeURIComponent(report.reply_email)}`}>{report.reply_email}</a></> : "Yanıt adresi verilmemiş."}</p>
        <div className={styles.actions}>{report.has_screenshot && <button disabled={Boolean(pending)} onClick={() => void showImage(report.id)}>Görseli göster</button>}<button disabled={Boolean(pending)} onClick={() => void update(report)}>{report.status === "open" ? "Çözüldü olarak işaretle" : "Yeniden aç"}</button></div>
        {image?.id === report.id && <div className={styles.image}><img src={image.url} alt="Kullanıcının gönderdiği ekran görüntüsü" /><button onClick={() => setImage(null)}>Görseli kapat</button></div>}
      </article>)}
      <div className={styles.actions}><button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 25))}>Önceki</button><button disabled={offset + 25 >= count} onClick={() => setOffset(value => value + 25)}>Sonraki</button></div>
    </>}
  </main>;
}
