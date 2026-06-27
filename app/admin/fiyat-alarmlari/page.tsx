"use client";

import { useState, useEffect } from "react";
import { BellRing, Trash2, Search, Filter } from "lucide-react";

type Subscriber = { id: string; email: string; created_at?: string; origin_label?: string; destination_label?: string; target_price?: number; is_active?: boolean };

export default function PriceAlertsAdminPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setIsLoading(true);
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    try {
      const response = await fetch("/api/admin/fiyat-alarmlari", { headers: { "x-admin-password": legacyPass } });
      const data = (await response.json()) as { data?: Subscriber[]; error?: string };
      setSubscribers(data.data || []);
      if (data.error) setMessage(data.error);
    } catch (e) {
      setMessage("Veriler yüklenirken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Bu alarmı silmek istediğinize emin misiniz?")) return;
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    try {
      const res = await fetch("/api/admin/fiyat-alarmlari", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-password": legacyPass },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Silme işlemi başarısız.");
      } else {
        setSubscribers(prev => prev.filter(s => s.id !== id));
        setMessage("Kayıt başarıyla silindi.");
      }
    } catch (e) {
      setMessage("Silme işlemi başarısız (bağlantı hatası).");
    }
  }

  async function handleToggleStatus(id: string, currentStatus: boolean) {
    const legacyPass = localStorage.getItem("l2t-admin-password") || "";
    const newStatus = !currentStatus;
    try {
      const res = await fetch("/api/admin/fiyat-alarmlari", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": legacyPass },
        body: JSON.stringify({ id, is_active: newStatus })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Güncelleme başarısız.");
      } else {
        setSubscribers(prev => prev.map(s => s.id === id ? { ...s, is_active: newStatus } : s));
      }
    } catch (e) {
      setMessage("Güncelleme başarısız (bağlantı hatası).");
    }
  }

  const filteredSubscribers = subscribers.filter(s => {
    const statusVal = s.is_active ? "aktif" : "pasif";
    if (filterStatus !== "all" && statusVal !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.email?.toLowerCase().includes(q) || s.origin_label?.toLowerCase().includes(q) || s.destination_label?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "40px 0" }}>
      <div className="l2t-page-head" style={{ marginBottom: "40px" }}>
        <a href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--l2t-soft)", textDecoration: "none", marginBottom: "16px", fontWeight: "600", fontSize: "0.95rem" }} className="hover-tilt">
          ← Admin Paneline Dön
        </a>
        <p className="l2t-kicker">Kullanıcı Bildirimleri</p>
        <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
          <BellRing size={36} color="#d97706" /> Fiyat Alarmları
        </h1>
        <p style={{ color: "var(--l2t-soft)", margin: 0 }}>Kullanıcıların fiyat alarmlarını ve rotalarını yönet.</p>
      </div>

      <div className="glass-panel" style={{ background: "#fff", borderRadius: "24px", overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "24px 32px", borderBottom: "1px solid var(--l2t-border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "1.3rem", color: "var(--l2t-navy)" }}>Kayıtlı Alarmlar ({subscribers.length})</h2>
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={16} color="var(--l2t-muted)" style={{ position: "absolute", left: "12px" }} />
              <input 
                placeholder="E-posta veya rota ara..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "10px 10px 10px 36px", borderRadius: "12px", border: "1px solid #e2e8f0", outline: "none", width: "220px" }} 
              />
            </div>
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#fff", color: "var(--l2t-navy)", fontWeight: "600", outline: "none" }}
            >
              <option value="all">Tümü</option>
              <option value="aktif">Aktif</option>
              <option value="pasif">Pasif</option>
            </select>
          </div>
        </div>

        {message && <div style={{ padding: "16px 32px", background: "#fee2e2", color: "#991b1b", borderBottom: "1px solid var(--l2t-border)" }}>{message}</div>}

        <div className="l2t-table-wrap" style={{ border: "none", boxShadow: "none", borderRadius: 0, margin: 0 }}>
          <table className="l2t-table" style={{ minWidth: "900px", width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                <th style={{ padding: "16px 32px", color: "var(--l2t-soft)", fontWeight: "600" }}>Kullanıcı (E-posta)</th>
                <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Rota</th>
                <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Hedef Fiyat</th>
                <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Tarih</th>
                <th style={{ padding: "16px", color: "var(--l2t-soft)", fontWeight: "600" }}>Durum</th>
                <th style={{ padding: "16px 32px", textAlign: "right", color: "var(--l2t-soft)", fontWeight: "600" }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "var(--l2t-soft)" }}>
                    <div style={{ display: "inline-block", width: "24px", height: "24px", border: "2px solid var(--l2t-blue)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  </td>
                </tr>
              ) : filteredSubscribers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "60px", textAlign: "center", color: "var(--l2t-soft)" }}>
                    <BellRing size={48} color="#e2e8f0" style={{ marginBottom: "16px" }} />
                    <p style={{ margin: 0, fontSize: "1.1rem" }}>Kayıt bulunamadı.</p>
                  </td>
                </tr>
              ) : (
                filteredSubscribers.map((subscriber) => (
                  <tr key={subscriber.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "16px 32px", fontWeight: "600", color: "var(--l2t-navy)" }}>{subscriber.email}</td>
                    <td style={{ padding: "16px", color: "var(--l2t-soft)" }}>
                      {subscriber.origin_label && subscriber.destination_label ? `${subscriber.origin_label} → ${subscriber.destination_label}` : "-"}
                    </td>
                    <td style={{ padding: "16px", fontWeight: "600", color: "#059669" }}>
                      {subscriber.target_price ? `${subscriber.target_price.toLocaleString("tr-TR")} ₺ Altı` : "%5 Düşüş"}
                    </td>
                    <td style={{ padding: "16px", color: "var(--l2t-soft)" }}>{subscriber.created_at ? new Date(subscriber.created_at).toLocaleDateString("tr-TR") : "-"}</td>
                    <td style={{ padding: "16px" }}>
                      <button 
                        onClick={() => handleToggleStatus(subscriber.id, subscriber.is_active || false)}
                        style={{ border: "none", cursor: "pointer", padding: "4px 10px", background: !subscriber.is_active ? '#fee2e2' : '#dcfce3', color: !subscriber.is_active ? '#991b1b' : '#065f46', borderRadius: "12px", fontSize: "0.8rem", fontWeight: "700" }}
                      >
                        {!subscriber.is_active ? 'Pasif' : 'Aktif'}
                      </button>
                    </td>
                    <td style={{ padding: "16px 32px", textAlign: "right" }}>
                      <button onClick={() => handleDelete(subscriber.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", padding: "8px" }} className="hover-tilt">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
