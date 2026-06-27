"use client";

import { useEffect, useState } from "react";
import { BellRing, Plane, Calendar, X, ArrowRight } from "lucide-react";
import { aviasalesUrl } from "@/lib/affiliate";

interface Alert {
  id: string;
  origin_code: string;
  origin_label: string;
  destination_code: string;
  destination_label: string;
  departure_date: string;
  target_price: number | null;
  base_price: number | null;
  lowest_price_seen: number | null;
  is_active: boolean;
  created_at: string;
}

export default function UserPriceAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    setLoading(true);
    try {
      const { supabase } = await import("@/lib/supabase-client");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError("Lütfen giriş yapın.");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/flight-alerts`, {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error);
      setAlerts(json.data || []);
    } catch (err: any) {
      setError(err.message || "Yükleme başarısız.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleAlert(id: string, currentStatus: boolean) {
    try {
      const { supabase } = await import("@/lib/supabase-client");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/flight-alerts/${id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ is_active: !currentStatus })
      });
      if (res.ok) {
        setAlerts(alerts.map(a => a.id === id ? { ...a, is_active: !currentStatus } : a));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteAlert(id: string) {
    if (!window.confirm("Bu alarmı silmek istediğinize emin misiniz?")) return;
    try {
      const { supabase } = await import("@/lib/supabase-client");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/flight-alerts/${id}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        setAlerts(alerts.filter(a => a.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) return <div style={{ padding: "40px", textAlign: "center" }}>Yükleniyor...</div>;
  if (error) return <div style={{ padding: "40px", color: "red", textAlign: "center" }}>{error}</div>;

  return (
    <div style={{ padding: "24px 0" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: "12px", color: "var(--l2t-navy)", fontSize: "1.8rem", marginBottom: "24px" }}>
        <BellRing color="#d97706" size={28} /> Fiyat Alarmlarım
      </h2>

      {alerts.length === 0 ? (
        <div className="glass-panel" style={{ padding: "40px", textAlign: "center", borderRadius: "16px" }}>
          <p style={{ color: "var(--l2t-soft)", fontSize: "1.1rem" }}>Henüz bir fiyat alarmınız yok.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {alerts.map(alert => {
            const link = aviasalesUrl({ origin: alert.origin_code, destination: alert.destination_code, departDate: alert.departure_date });
            return (
              <div key={alert.id} className="glass-panel" style={{ padding: "20px", borderRadius: "16px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "20px", opacity: alert.is_active ? 1 : 0.6 }}>
                <div>
                  <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem", color: "var(--l2t-navy)", display: "flex", alignItems: "center", gap: "8px" }}>
                    {alert.origin_label} <ArrowRight size={16} color="var(--l2t-soft)"/> {alert.destination_label}
                  </h3>
                  <p style={{ margin: 0, color: "var(--l2t-soft)", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Calendar size={14} /> {new Date(alert.departure_date).toLocaleDateString('tr-TR')}
                  </p>
                  
                  <div style={{ display: "flex", gap: "16px", marginTop: "12px", fontSize: "0.85rem" }}>
                    <div style={{ background: "rgba(0,0,0,0.03)", padding: "6px 10px", borderRadius: "8px" }}>
                      İlk Fiyat: <strong>{alert.base_price ? `${alert.base_price} ₺` : "Bekleniyor"}</strong>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.03)", padding: "6px 10px", borderRadius: "8px" }}>
                      Hedef: <strong style={{ color: alert.target_price ? "#059669" : "var(--l2t-soft)" }}>{alert.target_price ? `${alert.target_price} ₺` : "%5 Düşüş"}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <a href={link} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "#1476f2", fontWeight: "600", fontSize: "0.9rem", padding: "8px 16px", background: "#eef2ff", borderRadius: "8px" }}>
                    Biletlere Bak
                  </a>
                  <button 
                    onClick={() => toggleAlert(alert.id, alert.is_active)}
                    style={{ border: "none", background: alert.is_active ? "#fee2e2" : "#dcfce3", color: alert.is_active ? "#991b1b" : "#065f46", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
                  >
                    {alert.is_active ? "Durdur" : "Başlat"}
                  </button>
                  <button onClick={() => deleteAlert(alert.id)} style={{ background: "transparent", border: "none", color: "var(--l2t-muted)", cursor: "pointer", padding: "8px" }}>
                    <X size={20} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
