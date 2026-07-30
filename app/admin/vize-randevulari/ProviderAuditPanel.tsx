"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Globe2,
  PlayCircle,
  RefreshCw,
  ServerCrash,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import styles from "./visa-admin.module.css";

type AuditOutcome = "accessible" | "verification_required" | "blocked" | "provider_unavailable" | "error" | null;

type ProviderTarget = {
  id: string;
  code: string;
  provider_code: string;
  provider_name: string;
  label: string;
  covered_countries: string[];
  probe_url: string;
  official_url: string;
  mode: "external_provider" | "direct_state_portal";
  enabled: boolean;
  queued_at: string | null;
  last_outcome: AuditOutcome;
  last_http_status: number | null;
  last_checked_at: string | null;
  last_message: string | null;
  last_final_url: string | null;
  last_title: string | null;
  last_evidence_url: string | null;
};

type AuditStats = {
  total: number;
  queued: number;
  accessible: number;
  verification: number;
  blocked: number;
  unavailable: number;
};

const emptyStats: AuditStats = { total: 0, queued: 0, accessible: 0, verification: 0, blocked: 0, unavailable: 0 };

const OUTCOME_LABELS: Record<Exclude<AuditOutcome, null>, string> = {
  accessible: "Erişilebilir",
  verification_required: "Doğrulama gerekiyor",
  blocked: "Erişim engelli",
  provider_unavailable: "Geçici erişilemiyor",
  error: "Teknik hata",
};

function formatDate(value: string | null) {
  if (!value) return "Henüz test edilmedi";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function ProviderAuditPanel() {
  const [rows, setRows] = useState<ProviderTarget[]>([]);
  const [stats, setStats] = useState<AuditStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/visa-providers", { cache: "no-store" });
      const payload = (await response.json()) as { data?: ProviderTarget[]; stats?: AuditStats; error?: string };
      if (!response.ok) setError(payload.error || "Sağlayıcı testleri yüklenemedi.");
      else {
        setRows(payload.data || []);
        setStats(payload.stats || emptyStats);
      }
    } catch {
      setError("Sağlayıcı test servisine bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function queue(action: "queue_all" | "queue_one", targetId?: string) {
    setError("");
    setMessage("");
    setBusyId(targetId || "all");
    try {
      const response = await fetch("/api/admin/visa-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetId }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) setError(payload.error || "Test kuyruğa alınamadı.");
      else setMessage(payload.message || "Test kuyruğa alındı.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => { void load(); }, []);

  const cards = [
    { label: "Test hedefi", value: stats.total, icon: Globe2 },
    { label: "Kuyrukta", value: stats.queued, icon: Clock3 },
    { label: "Erişilebilir", value: stats.accessible, icon: CheckCircle2 },
    { label: "Doğrulama", value: stats.verification, icon: ShieldAlert },
    { label: "Engelli", value: stats.blocked, icon: XCircle },
    { label: "Hata / kesinti", value: stats.unavailable, icon: ServerCrash },
  ];

  return (
    <section className={styles.auditSection}>
      <div className={styles.auditHeader}>
        <div>
          <span>Sağlayıcı laboratuvarı</span>
          <h2>Tüm Schengen platformlarını VDS üzerinden test et</h2>
          <p>Bu test erişim, doğrulama ve koruma durumunu ölçer. CAPTCHA veya güvenlik kontrolü aşılmaz.</p>
        </div>
        <div className={styles.auditHeaderActions}>
          <button type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? styles.spin : ""} size={16} /> Yenile
          </button>
          <button type="button" className={styles.auditPrimary} onClick={() => void queue("queue_all")} disabled={busyId !== null}>
            <PlayCircle size={17} /> {busyId === "all" ? "Kuyruğa alınıyor" : "Tüm sağlayıcıları test et"}
          </button>
        </div>
      </div>

      <div className={styles.auditMetrics}>
        {cards.map(({ label, value, icon: Icon }) => (
          <article key={label}><Icon size={19} /><div><span>{label}</span><strong>{value}</strong></div></article>
        ))}
      </div>

      {message && <div className={styles.auditMessage}>{message} Worker en geç bir sonraki 5 dakikalık turda testleri alır.</div>}
      {error && <div className={styles.error}><ShieldAlert size={18} /> {error}</div>}

      <div className={styles.auditTableWrap}>
        <table className={styles.auditTable}>
          <thead>
            <tr>
              <th>Platform / kapsam</th>
              <th>Son durum</th>
              <th>HTTP</th>
              <th>Son test</th>
              <th>Sonuç</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.label}</strong>
                  <span>{row.covered_countries.join(", ")}</span>
                  <small>{row.mode === "direct_state_portal" ? "Doğrudan devlet portalı" : row.provider_name}</small>
                </td>
                <td>
                  <span className={`${styles.auditStatus} ${row.last_outcome ? styles[`audit_${row.last_outcome}`] : ""}`}>
                    {row.queued_at ? "Kuyrukta" : row.last_outcome ? OUTCOME_LABELS[row.last_outcome] : "Test edilmedi"}
                  </span>
                </td>
                <td>{row.last_http_status || "—"}</td>
                <td>{formatDate(row.last_checked_at)}</td>
                <td className={styles.auditResult}>
                  <strong>{row.last_title || row.provider_name}</strong>
                  <p>{row.last_message || "İlk toplu test bekleniyor."}</p>
                  <div>
                    <a href={row.official_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Resmî portal</a>
                    {row.last_evidence_url && <a href={row.last_evidence_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Görüntü</a>}
                  </div>
                </td>
                <td>
                  <button type="button" className={styles.auditRunButton} onClick={() => void queue("queue_one", row.id)} disabled={busyId !== null || !row.enabled}>
                    <PlayCircle size={14} /> Tekrar test et
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <div className={styles.empty}>Sağlayıcı test hedefi bulunamadı. SQL dosyasını çalıştır.</div>}
      </div>
    </section>
  );
}
