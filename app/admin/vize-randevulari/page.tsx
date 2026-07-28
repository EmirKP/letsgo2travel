"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarSearch, CheckCircle2, Clock3, RefreshCw, ServerCog } from "lucide-react";
import styles from "./visa-admin.module.css";

type AdminTrack = {
  id: string;
  user_id: string;
  country_code: string;
  country_name: string;
  provider_name: string | null;
  application_city: string;
  alternative_city: string | null;
  visa_category: string;
  applicants_count: number;
  status: string;
  access_expires_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_result: string | null;
  error_count: number;
  created_at: string;
};

type Stats = { total: number; active: number; found: number; errors: number; expiringSoon: number };

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function VisaAppointmentsAdminPage() {
  const [rows, setRows] = useState<AdminTrack[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, found: 0, errors: 0, expiringSoon: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function runAction(id: string, action: "activate_demo" | "activate_idata" | "simulate_match" | "reset_pending") {
    setError("");
    const response = await fetch(`/api/admin/visa-appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) setError(payload.error || "İşlem başarısız oldu.");
    await load();
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/visa-appointments", { cache: "no-store" });
      const payload = (await response.json()) as { data?: AdminTrack[]; stats?: Stats; error?: string };
      if (!response.ok) setError(payload.error || "Veriler yüklenemedi.");
      else {
        setRows(payload.data || []);
        setStats(payload.stats || { total: 0, active: 0, found: 0, errors: 0, expiringSoon: 0 });
      }
    } catch {
      setError("Sunucu bağlantısı kurulamadı.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const metricCards = [
    { label: "Toplam takip", value: stats.total, icon: CalendarSearch },
    { label: "Aktif / bekleyen", value: stats.active, icon: Clock3 },
    { label: "Uygun tarih", value: stats.found, icon: CheckCircle2 },
    { label: "Teknik hata", value: stats.errors, icon: AlertTriangle },
    { label: "6 saatte bitecek", value: stats.expiringSoon, icon: ServerCog },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <div>
            <Link href="/admin">← Admin merkezine dön</Link>
            <span>Vize sistemi</span>
            <h1>Randevu Takip Yönetimi</h1>
            <p>Kullanıcı görevlerini, sağlayıcı aktivasyonunu ve worker sonuçlarını tek ekrandan denetle.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? styles.spin : ""} size={17} /> Yenile</button>
        </header>

        <section className={styles.metrics}>
          {metricCards.map(({ label, value, icon: Icon }) => (
            <article key={label}><Icon size={21} /><div><span>{label}</span><strong>{value}</strong></div></article>
          ))}
        </section>

        {error && <div className={styles.error}><AlertTriangle size={19} /> {error}</div>}

        <section className={styles.tableCard}>
          <div className={styles.tableHead}><h2>Son takipler</h2><span>{rows.length} kayıt</span></div>
          {loading ? (
            <div className={styles.empty}><RefreshCw className={styles.spin} size={24} /> Yükleniyor...</div>
          ) : rows.length === 0 ? (
            <div className={styles.empty}>Henüz takip oluşturulmamış.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Ülke / şehir</th><th>Durum</th><th>Sağlayıcı</th><th>Son kontrol</th><th>Sonuç</th><th>Süre bitişi</th><th>Test işlemi</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.country_name}</strong><span>{row.application_city}{row.alternative_city ? ` + ${row.alternative_city}` : ""} · {row.applicants_count} kişi</span></td>
                      <td><span className={`${styles.status} ${styles[`status_${row.status}`] || ""}`}>{row.status}</span></td>
                      <td>{row.provider_name || "Doğrulama bekliyor"}</td>
                      <td>{dateTime(row.last_checked_at)}</td>
                      <td>{row.last_result || "—"}{row.error_count > 0 ? ` (${row.error_count} hata)` : ""}</td>
                      <td>{dateTime(row.access_expires_at)}</td>
                      <td>
                        <div className={styles.actions}>
                          <button type="button" onClick={() => void runAction(row.id, "activate_idata")} disabled={row.country_code !== "DE"}>iDATA aç</button>
                          <button type="button" onClick={() => void runAction(row.id, "activate_demo")}>Demo aç</button>
                          <button type="button" onClick={() => void runAction(row.id, "simulate_match")}>Eşleşme test et</button>
                          <button type="button" onClick={() => void runAction(row.id, "reset_pending")}>Sıfırla</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className={styles.workerNote}>
          <ServerCog size={21} />
          <div><strong>Worker bağlantısı hazır</strong><p>VDS worker, <code>/api/internal/visa-appointments/jobs/claim</code> ve <code>/report</code> uçlarını VISA_WORKER_SECRET ile kullanacak.</p></div>
        </div>
      </div>
    </div>
  );
}
