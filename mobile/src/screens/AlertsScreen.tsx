import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { deleteFlightAlert, fetchFlightAlerts, updateFlightAlert } from "../lib/api";
import type { FlightAlert, Screen, Session } from "../types";

function formatMoney(value?: number | null) {
  return value ? `${Number(value).toLocaleString("tr-TR")} TL` : "Bekleniyor";
}

export default function AlertsScreen({ session, navigate, notify }: { session: Session | null; navigate: (screen: Screen) => void; notify: (message: string) => void }) {
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setAlerts(await fetchFlightAlerts(session));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Alarmlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [notify, session]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(alert: FlightAlert) {
    if (!session) return;
    setBusyId(alert.id);
    try {
      await updateFlightAlert(alert.id, { is_active: !alert.is_active }, session);
      setAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, is_active: !item.is_active, status: !item.is_active ? "active" : "paused" } : item));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Alarm güncellenemedi.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!session || !window.confirm("Bu alarmı kapatmak istediğine emin misin?")) return;
    setBusyId(id);
    try {
      await deleteFlightAlert(id, session);
      setAlerts((current) => current.filter((item) => item.id !== id));
      notify("Fiyat alarmı kapatıldı.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Alarm kapatılamadı.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="content alerts-content">
      <section className="page-hero alerts-hero"><span className="page-hero-icon"><Icon name="bell" size={26}/></span><div><small>FİYAT TAKİBİ</small><h1>Fiyat Alarmlarım</h1><p>Takip ettiğin rotaları, hedef fiyatları ve son kontrol durumlarını yönet.</p></div></section>

      {!session ? (
        <section className="empty-card large-empty"><span><Icon name="lock" size={34}/></span><h2>Alarmlarını görmek için giriş yap</h2><p>Misafir olarak alarm kurabilirsin; hesabına giriş yaptığında tüm alarmlarını yönetebilirsin.</p><div><button className="wide-primary" onClick={() => navigate("auth")}><Icon name="user" size={18}/>Giriş yap</button><button className="wide-secondary" onClick={() => navigate("flights")}><Icon name="plus" size={18}/>Yeni alarm kur</button></div></section>
      ) : null}

      {session ? (
        <>
          <div className="section-head-row"><div><span className="section-kicker">AKTİF TAKİPLER</span><h2>{alerts.length} fiyat alarmı</h2></div><button className="round-action" onClick={load} aria-label="Yenile"><Icon name="refresh" size={18}/></button></div>
          {loading ? <div className="loading-card"><span className="spinner"/><p>Alarmlar yükleniyor...</p></div> : null}
          {!loading && alerts.length === 0 ? <section className="empty-card"><Icon name="bell" size={31}/><h3>Henüz fiyat alarmın yok</h3><p>Bir uçuş rotası seçip fiyat düştüğünde e-posta alabilirsin.</p><button className="wide-primary" onClick={() => navigate("flights")}><Icon name="plus" size={18}/>Alarm kur</button></section> : null}
          <div className="alert-list">
            {alerts.map((alert) => (
              <article className={alert.is_active ? "alert-card" : "alert-card paused"} key={alert.id}>
                <div className="alert-route"><span><Icon name="plane" size={18}/></span><div><small>{alert.is_active ? "AKTİF" : "DURAKLATILDI"}</small><h3>{alert.origin_label} → {alert.destination_label}</h3><p><Icon name="calendar" size={13}/>{new Date(alert.departure_date).toLocaleDateString("tr-TR")}</p></div></div>
                <div className="alert-prices"><span><small>Hedef</small><strong>{formatMoney(alert.target_price)}</strong></span><span><small>En düşük</small><strong>{formatMoney(alert.lowest_price_seen)}</strong></span><span><small>Son kontrol</small><strong>{formatMoney(alert.last_checked_price)}</strong></span></div>
                <div className="alert-actions"><button disabled={busyId === alert.id} onClick={() => toggle(alert)}>{alert.is_active ? "Durdur" : "Başlat"}</button><button className="danger" disabled={busyId === alert.id} onClick={() => remove(alert.id)}><Icon name="trash" size={17}/>Sil</button></div>
              </article>
            ))}
          </div>
          <button className="floating-add" onClick={() => navigate("flights")}><Icon name="plus" size={20}/>Yeni alarm</button>
        </>
      ) : null}
    </main>
  );
}
