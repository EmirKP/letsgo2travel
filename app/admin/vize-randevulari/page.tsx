"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarSearch,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldAlert,
} from "lucide-react";
import { TRACK_STATUS_LABELS, type VisaAppointmentTrackStatus } from "@/lib/visa-appointments/types";
import {
  initialWorkerSystemStatus,
  workerStatusCopy,
  type WorkerSystemStatus,
} from "@/lib/visa-appointments/worker-status";
import styles from "./visa-admin.module.css";
import ProviderAuditPanel from "./ProviderAuditPanel";

type AdminTrack = {
  id: string;
  user_id: string;
  country_code: string;
  country_name: string;
  provider_code: string | null;
  provider_name: string | null;
  application_city: string;
  alternative_city: string | null;
  visa_category: string;
  applicants_count: number;
  status: VisaAppointmentTrackStatus;
  access_expires_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_result: string | null;
  error_count: number;
  execution_mode: "vds" | "browser_extension";
  extension_last_seen_at: string | null;
  created_at: string;
  latest_outcome: string | null;
  latest_message: string | null;
  latest_checked_at: string | null;
  latest_worker_name: string | null;
  latest_evidence_url: string | null;
};

type Stats = {
  total: number;
  active: number;
  found: number;
  verification: number;
  errors: number;
  expiringSoon: number;
};

const emptyStats: Stats = { total: 0, active: 0, found: 0, verification: 0, errors: 0, expiringSoon: 0 };

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function resultTitle(row: AdminTrack) {
  if (row.status === "verification_required") return "Kullanıcı doğrulaması gerekiyor";
  if (row.status === "match_found") return "Uygun tarih bulundu";
  if (row.latest_outcome === "provider_unavailable") return "Sağlayıcı geçici olarak erişilemiyor";
  if (row.status === "error") return "Teknik kontrol gerekiyor";
  if (row.latest_outcome === "no_slots") return "Uygun tarih bulunamadı";
  return row.last_result || "Kontrol bekleniyor";
}

export default function VisaAppointmentsAdminPage() {
  const [rows, setRows] = useState<AdminTrack[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [workerStatus, setWorkerStatus] = useState<WorkerSystemStatus>(initialWorkerSystemStatus);

  const loadWorkerStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/visa-appointments/system-status", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setWorkerStatus((await response.json()) as WorkerSystemStatus);
    } catch {
      setWorkerStatus({
        state: "unknown",
        checkedAt: new Date().toISOString(),
        lastSeenAt: null,
        pollIntervalMs: null,
      });
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/visa-appointments", { cache: "no-store" });
      const payload = (await response.json()) as { data?: AdminTrack[]; stats?: Stats; error?: string };
      if (!response.ok) setError(payload.error || "Veriler yüklenemedi.");
      else {
        setRows(payload.data || []);
        setStats(payload.stats || emptyStats);
      }
    } catch {
      setError("Sunucu bağlantısı kurulamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function runAction(
    id: string,
    action: "activate_idata" | "reset_pending" | "retry_check",
  ) {
    setError("");
    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/visa-appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) setError(payload.error || "İşlem başarısız oldu.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void load();
    void loadWorkerStatus();
    const interval = window.setInterval(() => void loadWorkerStatus(), 60_000);
    return () => window.clearInterval(interval);
  }, [load, loadWorkerStatus]);

  const currentWorkerCopy = workerStatusCopy(workerStatus);

  const metricCards = [
    { label: "Toplam takip", value: stats.total, icon: CalendarSearch },
    { label: "Aktif / bekleyen", value: stats.active, icon: Clock3 },
    { label: "Doğrulama", value: stats.verification, icon: ShieldAlert },
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
            <p>Kullanıcı görevlerini, doğrulama bekleyen işlemleri ve worker kanıtlarını tek ekrandan denetle.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? styles.spin : ""} size={17} /> Yenile
          </button>
        </header>

        <section className={styles.metrics}>
          {metricCards.map(({ label, value, icon: Icon }) => (
            <article key={label}><Icon size={21} /><div><span>{label}</span><strong>{value}</strong></div></article>
          ))}
        </section>

        {error && <div className={styles.error}><AlertTriangle size={19} /> {error}</div>}

        <ProviderAuditPanel />

        <section className={styles.tableCard}>
          <div className={styles.tableHead}><h2>Son takipler</h2><span>{rows.length} kayıt</span></div>
          {loading ? (
            <div className={styles.empty}><RefreshCw className={styles.spin} size={24} /> Yükleniyor...</div>
          ) : rows.length === 0 ? (
            <div className={styles.empty}>Henüz takip oluşturulmamış.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th className={styles.countryColumn}>Ülke / şehir</th>
                    <th className={styles.statusColumn}>Durum</th>
                    <th className={styles.providerColumn}>Sağlayıcı</th>
                    <th className={styles.timeColumn}>Son kontrol</th>
                    <th className={styles.resultColumn}>Kontrol sonucu</th>
                    <th className={styles.expireColumn}>Süre bitişi</th>
                    <th className={styles.actionColumn}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.countryCell}>
                        <strong>{row.country_name}</strong>
                        <span>{row.application_city}{row.alternative_city ? ` + ${row.alternative_city}` : ""}</span>
                        <small>{row.applicants_count} kişi</small>
                      </td>
                      <td>
                        <span className={`${styles.status} ${styles[`status_${row.status}`] || ""}`}>
                          {TRACK_STATUS_LABELS[row.status] || row.status}
                        </span>
                      </td>
                      <td className={styles.providerCell}>
                        <strong>{row.provider_name || "Doğrulama bekliyor"}</strong>
                        {row.execution_mode === "browser_extension" ? <span>Chrome yardımcısı · {row.extension_last_seen_at ? dateTime(row.extension_last_seen_at) : "bağlantı bekleniyor"}</span> : row.latest_worker_name && <span>{row.latest_worker_name}</span>}
                      </td>
                      <td className={styles.timeCell}>{dateTime(row.latest_checked_at || row.last_checked_at)}</td>
                      <td className={styles.resultCell}>
                        <strong>{resultTitle(row)}</strong>
                        <p>{row.latest_message || row.last_result || "Henüz ayrıntı yok."}</p>
                        <div className={styles.resultLinks}>
                          {row.latest_evidence_url && (
                            <a href={row.latest_evidence_url} target="_blank" rel="noreferrer">
                              <ExternalLink size={14} /> Kanıtı aç
                            </a>
                          )}
                          {row.error_count > 0 && <span>{row.error_count} hata</span>}
                        </div>
                      </td>
                      <td className={styles.timeCell}>{dateTime(row.access_expires_at)}</td>
                      <td>
                        <div className={styles.actions}>
                          {row.status === "verification_required" && (
                            <button type="button" onClick={() => void runAction(row.id, "retry_check")} disabled={busyId === row.id}>
                              <RotateCcw size={14} /> Yeniden dene
                            </button>
                          )}
                          <button type="button" onClick={() => void runAction(row.id, "activate_idata")} disabled={row.country_code !== "DE" || busyId === row.id}>iDATA aç</button>
                          <button type="button" onClick={() => void runAction(row.id, "reset_pending")} disabled={busyId === row.id}>Sıfırla</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className={`${styles.workerNote} ${styles[`workerNote_${workerStatus.state}`] || ""}`}>
          <ServerCog size={21} />
          <div>
            <strong>{currentWorkerCopy.title}</strong>
            <p>{currentWorkerCopy.detail} Doğrulama gereken takipler kullanıcı veya yönetici yeniden deneyene kadar durdurulur.</p>
            {workerStatus.lastSeenAt && <small>Son sinyal: {dateTime(workerStatus.lastSeenAt)}</small>}
          </div>
        </div>
      </div>
    </div>
  );
}
