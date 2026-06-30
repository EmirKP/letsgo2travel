"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Clock, Mail, PauseCircle, PlayCircle, RefreshCw, Search, Trash2, XCircle } from "lucide-react";

type PriceAlertStatus = "active" | "paused" | "triggered" | "error" | "cancelled" | string;

type AlertLog = {
  id: string;
  alert_id: string;
  status: string;
  price?: number | null;
  currency?: string | null;
  error_message?: string | null;
  checked_at?: string | null;
};

type PriceAlert = {
  id: string;
  email: string;
  origin_code?: string | null;
  origin_label?: string | null;
  destination_code?: string | null;
  destination_label?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  target_price?: number | null;
  threshold_percent?: number | null;
  base_price?: number | null;
  last_checked_price?: number | null;
  lowest_price_seen?: number | null;
  last_notified_price?: number | null;
  last_checked_at?: string | null;
  last_notified_at?: string | null;
  last_mail_status?: string | null;
  last_error_message?: string | null;
  last_error_at?: string | null;
  error_count?: number | null;
  is_active?: boolean | null;
  status?: PriceAlertStatus | null;
  created_at?: string | null;
};

const statusMeta: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Aktif", color: "#065f46", bg: "#dcfce7", icon: CheckCircle2 },
  paused: { label: "Pasif", color: "#92400e", bg: "#fef3c7", icon: PauseCircle },
  triggered: { label: "Tetiklendi", color: "#1d4ed8", bg: "#dbeafe", icon: BellRing },
  error: { label: "Hata", color: "#991b1b", bg: "#fee2e2", icon: AlertTriangle },
  cancelled: { label: "İptal", color: "#475569", bg: "#e2e8f0", icon: XCircle },
};

function getStatus(alert: PriceAlert) {
  if (alert.status) return alert.status;
  if (alert.is_active === false) return "paused";
  if (alert.last_error_at) return "error";
  if (alert.last_notified_at) return "triggered";
  return "active";
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function fmtMoney(value?: number | null, currency = "₺") {
  if (!value) return "-";
  return `${Number(value).toLocaleString("tr-TR")} ${currency}`;
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status] || { label: status, color: "#334155", bg: "#e2e8f0", icon: Clock };
  const Icon = meta.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: meta.bg, color: meta.color, fontSize: ".78rem", fontWeight: 900 }}>
      <Icon size={14} /> {meta.label}
    </span>
  );
}

export default function PriceAlertsAdminPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isCheckingNow, setIsCheckingNow] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setIsLoading(true);
    setMessage("");
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    try {
      const response = await fetch("/api/admin/fiyat-alarmlari", { headers: { "x-admin-password": legacyPass }, cache: "no-store" });
      const data = (await response.json()) as { data?: PriceAlert[]; logs?: AlertLog[]; error?: string };
      setAlerts(data.data || []);
      setLogs(data.logs || []);
      if (data.error) setMessage(data.error);
    } catch {
      setMessage("Fiyat alarmları yüklenirken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateAlert(id: string, body: Record<string, unknown>) {
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    const res = await fetch("/api/admin/fiyat-alarmlari", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": legacyPass },
      body: JSON.stringify({ id, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Güncelleme başarısız.");
  }
  async function runManualPriceCheck() {
    if (!window.confirm("Aktif fiyat alarmları şimdi kontrol edilsin mi?")) return;
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    setIsCheckingNow(true);
    setMessage("Fiyat kontrolü çalışıyor...");
    try {
      const res = await fetch("/api/admin/fiyat-alarmlari/run-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": legacyPass },
        body: JSON.stringify({ limit: 80 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || "Fiyat kontrolü çalıştırılamadı.");
      setMessage(`Kontrol tamamlandı: ${data.processedAlerts || 0} alarm işlendi, ${data.notifiedAlerts || 0} bildirim gönderildi.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fiyat kontrolü çalıştırılamadı.");
    } finally {
      setIsCheckingNow(false);
    }
  }


  async function handleCancel(id: string) {
    if (!window.confirm("Bu fiyat alarmını iptal etmek istediğine emin misin?")) return;
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    try {
      const res = await fetch("/api/admin/fiyat-alarmlari", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-password": legacyPass },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "İptal işlemi başarısız.");
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_active: false, status: "cancelled" } : a));
      setMessage("Alarm iptal edildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İptal işlemi başarısız.");
    }
  }

  async function handleToggleStatus(alert: PriceAlert) {
    const nextActive = !alert.is_active;
    try {
      await updateAlert(alert.id, { is_active: nextActive });
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_active: nextActive, status: nextActive ? "active" : "paused" } : a));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Güncelleme başarısız.");
    }
  }

  const logsByAlert = useMemo(() => {
    const map = new Map<string, AlertLog[]>();
    for (const log of logs) {
      const current = map.get(log.alert_id) || [];
      current.push(log);
      map.set(log.alert_id, current);
    }
    return map;
  }, [logs]);

  const stats = useMemo(() => {
    const total = alerts.length;
    const active = alerts.filter(a => getStatus(a) === "active").length;
    const triggered = alerts.filter(a => getStatus(a) === "triggered").length;
    const errors = alerts.filter(a => getStatus(a) === "error").length;
    return { total, active, triggered, errors };
  }, [alerts]);

  const filteredAlerts = alerts.filter(alert => {
    const status = getStatus(alert);
    if (filterStatus !== "all" && status !== filterStatus) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return [alert.email, alert.origin_label, alert.destination_label, alert.origin_code, alert.destination_code]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(q));
  });

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ marginBottom: 28 }}>
        <a href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--l2t-soft)", textDecoration: "none", marginBottom: 16, fontWeight: 700, fontSize: ".95rem" }}>
          ← Admin Paneline Dön
        </a>
        <p className="l2t-kicker">Mail ve fiyat takibi</p>
        <h1 style={{ fontSize: "2.35rem", color: "var(--l2t-navy)", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
          <BellRing size={36} color="#d97706" /> Fiyat Alarmları
        </h1>
        <p style={{ color: "var(--l2t-soft)", margin: 0 }}>Alarm durumlarını, son kontrol fiyatlarını ve mail gönderim sonuçlarını takip et.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Toplam alarm", value: stats.total, icon: BellRing },
          { label: "Aktif", value: stats.active, icon: CheckCircle2 },
          { label: "Tetiklenen", value: stats.triggered, icon: Mail },
          { label: "Hata alan", value: stats.errors, icon: AlertTriangle },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 22, padding: 20, boxShadow: "0 12px 35px rgba(15,23,42,.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "var(--l2t-soft)", fontWeight: 800, fontSize: ".86rem" }}>{card.label}</span>
                <Icon size={20} color="#0E2A5C" />
              </div>
              <strong style={{ fontSize: "2rem", color: "var(--l2t-navy)" }}>{card.value}</strong>
            </div>
          );
        })}
      </div>

      <div className="glass-panel" style={{ background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "22px 28px", borderBottom: "1px solid var(--l2t-border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--l2t-navy)" }}>Kayıtlı Alarmlar ({filteredAlerts.length})</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={runManualPriceCheck} disabled={isCheckingNow} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #f59e0b", background: "linear-gradient(135deg,#FFB400,#FF6B35)", borderRadius: 12, padding: "10px 13px", color: "#06183A", fontWeight: 900, cursor: isCheckingNow ? "wait" : "pointer", opacity: isCheckingNow ? 0.72 : 1 }}>
              <PlayCircle size={15} /> {isCheckingNow ? "Kontrol ediliyor" : "Şimdi kontrol et"}
            </button>
            <button onClick={load} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #e2e8f0", background: "#fff", borderRadius: 12, padding: "10px 13px", color: "var(--l2t-navy)", fontWeight: 800, cursor: "pointer" }}>
              <RefreshCw size={15} /> Yenile
            </button>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={16} color="var(--l2t-muted)" style={{ position: "absolute", left: 12 }} />
              <input
                placeholder="E-posta veya rota ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "10px 10px 10px 36px", borderRadius: 12, border: "1px solid #e2e8f0", outline: "none", width: 230 }}
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", color: "var(--l2t-navy)", fontWeight: 800, outline: "none" }}
            >
              <option value="all">Tümü</option>
              <option value="active">Aktif</option>
              <option value="paused">Pasif</option>
              <option value="triggered">Tetiklendi</option>
              <option value="error">Hata</option>
              <option value="cancelled">İptal</option>
            </select>
          </div>
        </div>

        {message && <div style={{ padding: "14px 28px", background: "#fff7ed", color: "#9a3412", borderBottom: "1px solid #fed7aa", fontWeight: 700 }}>{message}</div>}

        <div className="l2t-table-wrap" style={{ border: "none", boxShadow: "none", borderRadius: 0, margin: 0 }}>
          <table className="l2t-table" style={{ minWidth: 1180, width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                <th style={{ padding: "15px 24px", color: "var(--l2t-soft)", fontWeight: 800 }}>E-posta</th>
                <th style={{ padding: 15, color: "var(--l2t-soft)", fontWeight: 800 }}>Rota</th>
                <th style={{ padding: 15, color: "var(--l2t-soft)", fontWeight: 800 }}>Hedef</th>
                <th style={{ padding: 15, color: "var(--l2t-soft)", fontWeight: 800 }}>Son fiyat</th>
                <th style={{ padding: 15, color: "var(--l2t-soft)", fontWeight: 800 }}>Son kontrol</th>
                <th style={{ padding: 15, color: "var(--l2t-soft)", fontWeight: 800 }}>Mail</th>
                <th style={{ padding: 15, color: "var(--l2t-soft)", fontWeight: 800 }}>Durum</th>
                <th style={{ padding: "15px 24px", textAlign: "right", color: "var(--l2t-soft)", fontWeight: 800 }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ padding: 44, textAlign: "center", color: "var(--l2t-soft)" }}>Yükleniyor...</td></tr>
              ) : filteredAlerts.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 58, textAlign: "center", color: "var(--l2t-soft)" }}>Kayıt bulunamadı.</td></tr>
              ) : filteredAlerts.map((alert) => {
                const status = getStatus(alert);
                const latestLog = logsByAlert.get(alert.id)?.[0];
                return (
                  <tr key={alert.id} style={{ borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>
                    <td style={{ padding: "16px 24px", fontWeight: 800, color: "var(--l2t-navy)", maxWidth: 220, wordBreak: "break-word" }}>{alert.email}</td>
                    <td style={{ padding: 16, color: "var(--l2t-soft)", minWidth: 210 }}>
                      <strong style={{ color: "var(--l2t-navy)" }}>{alert.origin_label || alert.origin_code || "-"} → {alert.destination_label || alert.destination_code || "-"}</strong><br />
                      <small>{alert.departure_date ? new Date(alert.departure_date).toLocaleDateString("tr-TR") : "-"}{alert.return_date ? ` / dönüş ${new Date(alert.return_date).toLocaleDateString("tr-TR")}` : ""}</small>
                    </td>
                    <td style={{ padding: 16, fontWeight: 800, color: "#059669" }}>
                      {alert.target_price ? `${Number(alert.target_price).toLocaleString("tr-TR")} ₺ altı` : `%${alert.threshold_percent || 5} düşüş`}
                    </td>
                    <td style={{ padding: 16 }}>
                      <strong style={{ color: "var(--l2t-navy)" }}>{fmtMoney(alert.last_checked_price)}</strong><br />
                      <small style={{ color: "var(--l2t-soft)" }}>En düşük: {fmtMoney(alert.lowest_price_seen)}</small>
                    </td>
                    <td style={{ padding: 16, color: "var(--l2t-soft)", minWidth: 135 }}>{fmtDate(alert.last_checked_at)}</td>
                    <td style={{ padding: 16, color: "var(--l2t-soft)", minWidth: 160 }}>
                      <strong style={{ color: alert.last_mail_status?.includes("failed") ? "#dc2626" : "#0f766e" }}>{alert.last_mail_status || "-"}</strong><br />
                      <small>{alert.last_notified_at ? `Son bildirim: ${fmtDate(alert.last_notified_at)}` : latestLog ? `Son log: ${latestLog.status}` : "Mail bekleniyor"}</small>
                      {alert.last_error_message && <div style={{ marginTop: 6, color: "#b91c1c", fontSize: ".78rem", lineHeight: 1.35 }}>{alert.last_error_message}</div>}
                    </td>
                    <td style={{ padding: 16 }}><StatusBadge status={status} /></td>
                    <td style={{ padding: "16px 24px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => handleToggleStatus(alert)} style={{ border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "var(--l2t-navy)", padding: "8px 10px", borderRadius: 12, fontWeight: 800, marginRight: 8 }}>
                        {alert.is_active === false ? "Aktif et" : "Pasifleştir"}
                      </button>
                      <button onClick={() => handleCancel(alert.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", padding: 8 }} title="Alarmı iptal et">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
