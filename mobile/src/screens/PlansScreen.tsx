import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { deleteFlightAlert, getFlightAlerts, updateFlightAlert } from "../lib/api";
import { openExternal } from "../lib/native";
import {
  deleteFlightSearch,
  deleteRoutePlan,
  getSavedFlightSearches,
  getSavedRoutePlans,
} from "../lib/storage";
import type { AuthUser, FlightAlert, RouteSuggestion, SavedFlightSearch, SavedRoutePlan } from "../types";

function date(value: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function PlansScreen({ user, accessToken, onOpenAccount, onFlightSearch, onNotice }: {
  user: AuthUser | null;
  accessToken: string;
  onOpenAccount: () => void;
  onFlightSearch: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<"routes" | "searches" | "alerts">("routes");
  const [routes, setRoutes] = useState<SavedRoutePlan[]>([]);
  const [searches, setSearches] = useState<SavedFlightSearch[]>([]);
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [busyAlert, setBusyAlert] = useState("");

  const refreshLocal = () => {
    setRoutes(getSavedRoutePlans());
    setSearches(getSavedFlightSearches());
  };

  const loadAlerts = async () => {
    if (!accessToken) return;
    setAlertsLoading(true);
    try {
      setAlerts(await getFlightAlerts(accessToken));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Alarmlar alınamadı.");
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => { refreshLocal(); }, []);
  useEffect(() => {
    if (tab === "alerts" && accessToken) void loadAlerts();
  }, [accessToken, tab]);

  const toggleAlert = async (alert: FlightAlert) => {
    if (!accessToken) return;
    setBusyAlert(alert.id);
    try {
      await updateFlightAlert(alert.id, { is_active: !alert.is_active }, accessToken);
      await loadAlerts();
      onNotice(alert.is_active ? "Alarm duraklatıldı." : "Alarm yeniden etkinleştirildi.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Alarm güncellenemedi.");
    } finally {
      setBusyAlert("");
    }
  };

  const cancelAlert = async (alert: FlightAlert) => {
    if (!accessToken || !window.confirm("Bu fiyat alarmını kapatmak istediğine emin misin?")) return;
    setBusyAlert(alert.id);
    try {
      await deleteFlightAlert(alert.id, accessToken);
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
      onNotice("Alarm kapatıldı.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Alarm kapatılamadı.");
    } finally {
      setBusyAlert("");
    }
  };

  return (
    <div className="screen">
      <section className="page-intro compact-intro">
        <span className="page-icon"><Icon name="plans" size={27} /></span>
        <div><small>KİŞİSEL ALAN</small><h1>Planlarım</h1><p>Kaydettiğin rotalar, uçuş aramaları ve hesabına bağlı fiyat alarmları.</p></div>
      </section>

      <div className="segmented plans-tabs">
        <button className={tab === "routes" ? "active" : ""} onClick={() => setTab("routes")}>Rotalar <span>{routes.length}</span></button>
        <button className={tab === "searches" ? "active" : ""} onClick={() => setTab("searches")}>Aramalar <span>{searches.length}</span></button>
        <button className={tab === "alerts" ? "active" : ""} onClick={() => setTab("alerts")}>Alarmlar</button>
      </div>

      {tab === "routes" && <div className="saved-list">
        {routes.map((saved) => <article className="saved-card" key={saved.id}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="route" /></span><div><small>{date(saved.createdAt)} · {saved.input.days}</small><strong>{saved.plan.routes.map((route) => route.name).join(" · ")}</strong></div><button onClick={() => { if (window.confirm("Bu rota planı silinsin mi?")) { setRoutes(deleteRoutePlan(saved.id)); onNotice("Rota silindi."); } }} aria-label="Sil"><Icon name="trash" size={18} /></button></div>
          <p>{saved.plan.summary}</p>
          <div className="saved-route-chips">{saved.plan.routes.map((route) => <button key={route.name} onClick={() => onFlightSearch(route)}>{route.destinationCode || route.name}<Icon name="plane" size={14} /></button>)}</div>
        </article>)}
        {!routes.length && <Empty icon="route" title="Henüz kayıtlı rotan yok" text="Rota Asistanı'nda öneri oluşturup Kaydet düğmesine bas." />}
      </div>}

      {tab === "searches" && <div className="saved-list">
        {searches.map((search) => <article className="saved-card search-saved-card" key={search.id}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="plane" /></span><div><small>{date(search.createdAt)} · {search.departureDate}</small><strong>{search.originCode} → {search.destinationCode}</strong></div><button onClick={() => { if (window.confirm("Bu arama silinsin mi?")) { setSearches(deleteFlightSearch(search.id)); onNotice("Arama silindi."); } }} aria-label="Sil"><Icon name="trash" size={18} /></button></div>
          <div className="saved-details"><span>{search.adults} yolcu</span><span>{search.tripType === "round_trip" ? "Gidiş–dönüş" : "Tek yön"}</span><span>{search.cabinClass === "economy" ? "Ekonomi" : "Business"}</span></div>
          {search.resultUrl && <button className="secondary-wide" onClick={() => void openExternal(search.resultUrl!)}><Icon name="external" size={17} /> Sonuçları yeniden aç</button>}
        </article>)}
        {!searches.length && <Empty icon="search" title="Henüz kayıtlı araman yok" text="Bilet Ara bölümündeki başarılı aramalar otomatik kaydedilir." />}
      </div>}

      {tab === "alerts" && <div className="saved-list">
        {!user ? <div className="login-required"><span><Icon name="bell" size={28} /></span><h2>Alarmlarını yönetmek için giriş yap</h2><p>Misafir olarak kurulan alarmlar e-postadaki yönetim bağlantısıyla, hesaplı alarmlar uygulama içinden yönetilir.</p><button className="primary-wide" onClick={onOpenAccount}><Icon name="user" size={18} /> Giriş yap / hesap aç</button></div>
          : alertsLoading ? <div className="skeleton-list"><div /><div /></div>
          : alerts.length ? alerts.map((alert) => <article className={`saved-card alert-card ${alert.is_active ? "" : "paused"}`} key={alert.id}>
            <div className="saved-card-head"><span className="saved-icon"><Icon name="bell" /></span><div><small>{alert.is_active ? "AKTİF" : "DURAKLATILDI"} · {alert.departure_date}</small><strong>{alert.origin_code} → {alert.destination_code}</strong></div><button disabled={busyAlert === alert.id} onClick={() => void cancelAlert(alert)} aria-label="Alarmı kapat"><Icon name="trash" size={18} /></button></div>
            <div className="alert-metrics"><div><span>Hedef</span><strong>{alert.target_price ? `${new Intl.NumberFormat("tr-TR").format(alert.target_price)} TL` : `%${alert.threshold_percent || 5} düşüş`}</strong></div><div><span>En düşük</span><strong>{alert.lowest_price_seen ? `${new Intl.NumberFormat("tr-TR").format(alert.lowest_price_seen)} TL` : "Henüz yok"}</strong></div></div>
            <button className="secondary-wide" disabled={busyAlert === alert.id} onClick={() => void toggleAlert(alert)}>{busyAlert === alert.id ? <span className="button-loader dark" /> : <Icon name={alert.is_active ? "close" : "check"} size={17} />} {alert.is_active ? "Duraklat" : "Yeniden etkinleştir"}</button>
          </article>)
          : <Empty icon="bell" title="Aktif fiyat alarmın yok" text="Bilet Ara bölümünden rota seçip alarm kurabilirsin." />}
      </div>}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: "route" | "search" | "bell"; title: string; text: string }) {
  return <div className="empty-state"><span><Icon name={icon} size={28} /></span><strong>{title}</strong><p>{text}</p></div>;
}
