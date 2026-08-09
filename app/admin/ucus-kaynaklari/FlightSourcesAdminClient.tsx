"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Database, RefreshCw, Server, ShieldCheck } from "lucide-react";
import styles from "./flight-sources-admin.module.css";

type FlightSource = {
  id: string;
  name: string;
  source_type: string;
  official_domain: string;
  integration_method: string;
  integration_status: string;
  permission_status: string;
  enabled: boolean;
  runtime_ready: boolean;
  supports_baggage: boolean;
  supports_fare_rules: boolean;
  supports_revalidation: boolean;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  average_response_ms: number | null;
  success_rate: number | null;
  searches_today: number;
  offers_today: number;
};

type Worker = {
  worker_name: string;
  worker_version: string | null;
  status: string;
  last_seen_at: string;
  last_error: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  partner_access_required: "Partnerlik başvurusu gerekli",
  credentials_required: "API erişimi gerekli",
  configured: "Yapılandırıldı",
  active: "Aktif entegrasyon",
  paused: "Geçici olarak pasif",
  error: "Entegrasyon hatası",
  not_requested: "Başvuru yapılmadı",
  applied: "Başvuru bekleniyor",
  approved: "Resmî izin onaylandı",
  public_documented: "Resmî olarak herkese açık",
  rejected: "Başvuru reddedildi",
  expired: "İzin süresi doldu",
};

function relativeTime(value: string | null) {
  if (!value) return "Henüz yok";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Bilinmiyor";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function FlightSourcesAdminClient() {
  const [sources, setSources] = useState<FlightSource[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/flight-sources", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Uçuş kaynakları alınamadı.");
      setSources(Array.isArray(payload.data) ? payload.data : []);
      setWorkers(Array.isArray(payload.workers) ? payload.workers : []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Uçuş kaynakları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (source: FlightSource) => {
    setPendingId(source.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/flight-sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: source.id, enabled: !source.enabled }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Kaynak durumu güncellenemedi.");
      setMessage(payload.message || "Kaynak durumu güncellendi.");
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Kaynak durumu güncellenemedi.");
    } finally {
      setPendingId("");
    }
  };

  const activeCount = sources.filter((source) => source.enabled && source.runtime_ready).length;
  const waitingCount = sources.filter((source) => !source.runtime_ready).length;
  const liveWorkers = workers.filter((worker) => Date.now() - new Date(worker.last_seen_at).getTime() < 120_000).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}><Database size={16} /> Uçuş meta-arama</span>
          <h1>Uçuş kaynakları</h1>
          <p>Resmî izin, credential ve connector kodu tamamlanmadan hiçbir kaynak üretimde etkinleşmez.</p>
        </div>
        <button type="button" className={styles.refresh} onClick={() => void load()} disabled={loading}>
          <RefreshCw size={17} className={loading ? styles.spin : ""} /> Yenile
        </button>
      </header>

      <section className={styles.stats}>
        <article><CheckCircle2 size={22} /><div><strong>{activeCount}</strong><span>Canlı kaynak</span></div></article>
        <article><AlertTriangle size={22} /><div><strong>{waitingCount}</strong><span>Erişim bekleyen</span></div></article>
        <article><Server size={22} /><div><strong>{liveWorkers}</strong><span>Canlı worker</span></div></article>
        <article><Activity size={22} /><div><strong>{sources.reduce((sum, item) => sum + item.offers_today, 0)}</strong><span>Bugünkü teklif</span></div></article>
      </section>

      {message && <div className={styles.success}><CheckCircle2 size={18} /> {message}</div>}
      {error && <div className={styles.error}><AlertTriangle size={18} /> {error}</div>}

      <section className={styles.grid} aria-busy={loading}>
        {sources.map((source) => {
          const canEnable = source.runtime_ready
            && source.integration_status === "active"
            && ["approved", "public_documented"].includes(source.permission_status);
          return (
            <article className={styles.card} key={source.id}>
              <div className={styles.cardHead}>
                <div className={styles.sourceIcon}>{source.source_type === "airline" ? "✈" : "↗"}</div>
                <div><h2>{source.name}</h2><a href={`https://${source.official_domain}`} target="_blank" rel="noreferrer">{source.official_domain}</a></div>
                <span className={source.enabled ? styles.live : styles.waiting}>{source.enabled ? "Aktif" : "Pasif"}</span>
              </div>

              <div className={styles.statusRows}>
                <div><span>Entegrasyon</span><strong>{STATUS_LABELS[source.integration_status] || source.integration_status}</strong></div>
                <div><span>Resmî izin</span><strong>{STATUS_LABELS[source.permission_status] || source.permission_status}</strong></div>
                <div><span>Connector kodu</span><strong>{source.runtime_ready ? "Hazır" : "Henüz bağlanmadı"}</strong></div>
                <div><span>Son başarılı arama</span><strong>{relativeTime(source.last_success_at)}</strong></div>
              </div>

              <div className={styles.capabilities}>
                <span className={source.supports_baggage ? styles.capable : ""}>Bagaj</span>
                <span className={source.supports_fare_rules ? styles.capable : ""}>İade/değişiklik</span>
                <span className={source.supports_revalidation ? styles.capable : ""}>Fiyat doğrulama</span>
              </div>

              {source.last_error_message && <p className={styles.sourceError}>{source.last_error_code || "Hata"}: {source.last_error_message}</p>}

              <button
                type="button"
                className={source.enabled ? styles.disable : styles.enable}
                disabled={pendingId === source.id || (!source.enabled && !canEnable)}
                onClick={() => void toggle(source)}
                title={!source.enabled && !canEnable ? "Resmî izin, aktif entegrasyon ve connector kodu tamamlanmalı." : undefined}
              >
                <ShieldCheck size={17} />
                {pendingId === source.id ? "Kaydediliyor…" : source.enabled ? "Kaynağı duraklat" : canEnable ? "Kaynağı etkinleştir" : "Entegrasyon bekleniyor"}
              </button>
            </article>
          );
        })}
        {!loading && sources.length === 0 && <div className={styles.empty}>Henüz uçuş kaynağı tanımlı değil.</div>}
      </section>

      <section className={styles.workerPanel}>
        <div><Server size={21} /><div><h2>Worker durumu</h2><p>Worker service-role anahtarı taşımaz; yalnız ayrı flight worker secret ile internal API’ye bağlanır.</p></div></div>
        {workers.length === 0 ? <span className={styles.waiting}>Heartbeat yok</span> : (
          <ul>{workers.map((worker) => <li key={worker.worker_name}><strong>{worker.worker_name}</strong><span>{worker.status} · {relativeTime(worker.last_seen_at)}</span></li>)}</ul>
        )}
      </section>
    </main>
  );
}
