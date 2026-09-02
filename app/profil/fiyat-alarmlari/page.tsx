"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Calendar } from "lucide-react";

interface Alert {
  id: string;
  origin_code: string;
  origin_label: string;
  destination_code: string;
  destination_label: string;
  departure_date: string;
  target_price: number | null;
  base_price: number | null;
  last_checked_price: number | null;
  lowest_price_seen: number | null;
  notify_email: boolean;
  notify_push: boolean;
  is_active: boolean;
  status: string | null;
  created_at: string;
}

// Teknik durum kodlarını kullanıcı dostu Türkçeye çevirir; APNs/teknik
// ayrıntı gösterilmez.
function statusInfo(alert: Alert): { label: string; tone: "ok" | "paused" | "sent" | "error" } {
  if (!alert.is_active) return { label: "Duraklatıldı", tone: "paused" };
  if (alert.status === "triggered") return { label: "Bildirim gönderildi", tone: "sent" };
  if (alert.status === "error") return { label: "Kontrol edilemedi — tekrar deneyeceğiz", tone: "error" };
  return { label: "Takipte", tone: "ok" };
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined) return null;
  return `${Number(value).toLocaleString("tr-TR")} ₺`;
}

export default function UserPriceAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    setLoading(true);
    try {
      const { supabase } = await import("@/lib/supabase-client");
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError("Alarmlarını görmek için giriş yapmalısın.");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/flight-alerts`, {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error);
      setAlerts(json.data || []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Alarmlar yüklenemedi. Sayfayı yenileyip tekrar dene.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleAlert(id: string, currentStatus: boolean) {
    setBusyId(id);
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
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAlert(id: string) {
    if (!window.confirm("Bu alarmı silmek istediğine emin misin? Bu işlem geri alınamaz.")) return;
    setBusyId(id);
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
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="l2t-myalarm-state">Alarmların yükleniyor…</div>;
  if (error) {
    return (
      <div className="l2t-myalarm-state l2t-myalarm-state-error">
        <p>{error}</p>
        <button type="button" onClick={() => loadAlerts()}>Tekrar dene</button>
      </div>
    );
  }

  return (
    <div className="l2t-myalarm-page">
      <div className="l2t-myalarm-head">
        <h2><BellRing size={26} /> Fiyat Alarmlarım</h2>
        <Link href="/fiyat-kontrolu" className="l2t-myalarm-new">+ Yeni alarm</Link>
      </div>

      {alerts.length === 0 ? (
        <div className="l2t-myalarm-empty">
          <p>Henüz bir fiyat alarmın yok.</p>
          <span>Takip etmek istediğin rotayı seç; fiyat düşünce sana haber verelim.</span>
          <Link href="/fiyat-kontrolu">İlk alarmını kur <ArrowRight size={16} /></Link>
        </div>
      ) : (
        <div className="l2t-myalarm-list">
          {alerts.map(alert => {
            const state = statusInfo(alert);
            const channels = [
              alert.notify_email ? "E-posta" : null,
              alert.notify_push ? "Telefon" : null,
            ].filter(Boolean);
            return (
              <div key={alert.id} className={`l2t-myalarm-card${alert.is_active ? "" : " is-paused"}`}>
                <div className="l2t-myalarm-main">
                  <h3>
                    {alert.origin_label} <ArrowRight size={16} /> {alert.destination_label}
                  </h3>
                  <p className="l2t-myalarm-date">
                    <Calendar size={14} /> {new Date(alert.departure_date).toLocaleDateString("tr-TR")}
                  </p>
                  <div className="l2t-myalarm-facts">
                    <span>Hedef: <strong>{formatPrice(alert.target_price) || "%5 düşüş"}</strong></span>
                    <span>Son fiyat: <strong>{formatPrice(alert.last_checked_price) || "Henüz kontrol edilmedi"}</strong></span>
                  </div>
                  <div className="l2t-myalarm-badges">
                    <span className={`l2t-myalarm-status is-${state.tone}`}>{state.label}</span>
                    {channels.map((channel) => (
                      <span key={channel as string} className="l2t-myalarm-channel">{channel}</span>
                    ))}
                  </div>
                </div>

                <div className="l2t-myalarm-actions">
                  <button
                    type="button"
                    disabled={busyId === alert.id}
                    onClick={() => toggleAlert(alert.id, alert.is_active)}
                    className={alert.is_active ? "is-pause" : "is-resume"}
                  >
                    {alert.is_active ? "Duraklat" : "Devam ettir"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === alert.id}
                    onClick={() => deleteAlert(alert.id)}
                    className="is-delete"
                  >
                    Sil
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
