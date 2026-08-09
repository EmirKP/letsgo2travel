import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { deleteFlightAlert, getFlightAlerts, getFlightSearchUrl, updateFlightAlert } from "../lib/api";
import { openExternal } from "../lib/native";
import { deleteUserTrip, getSupabaseDataErrorMessage, listUserTrips, type UserTripData } from "../lib/supabaseData";
import {
  deleteFlightSearch,
  deleteRoutePlan,
  getFavoriteDestinations,
  getSavedFlightSearches,
  getSavedRoutePlans,
  getVisitedCountries,
} from "../lib/storage";
import type { AuthUser, FlightAlert, RouteSuggestion, SavedFlightSearch, SavedRoutePlan, ViewId } from "../types";

type PendingDelete =
  | { kind: "alert"; item: FlightAlert }
  | { kind: "cloud"; item: UserTripData }
  | { kind: "route"; item: SavedRoutePlan }
  | { kind: "search"; item: SavedFlightSearch };

function date(value: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function TripsScreen({ user, ownerId, accessToken, onOpenAccount, onFlightSearch, onNavigate, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  accessToken: string;
  onOpenAccount: () => void;
  onFlightSearch: (route: RouteSuggestion) => void;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<"routes" | "searches" | "alerts">("routes");
  const [routes, setRoutes] = useState<SavedRoutePlan[]>([]);
  const [searches, setSearches] = useState<SavedFlightSearch[]>([]);
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [busyAlert, setBusyAlert] = useState("");
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [visitedCount, setVisitedCount] = useState(0);
  const [cloudItems, setCloudItems] = useState<UserTripData[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [busyCloud, setBusyCloud] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const alertRequest = useRef(0);

  const refreshLocal = useCallback(() => {
    setRoutes(getSavedRoutePlans(ownerId));
    setSearches(getSavedFlightSearches(ownerId));
    setFavoriteCount(getFavoriteDestinations(ownerId).length);
    setVisitedCount(getVisitedCountries(ownerId).length);
  }, [ownerId]);

  const loadAlerts = useCallback(async () => {
    if (!accessToken) {
      setAlerts([]);
      return;
    }
    const requestId = ++alertRequest.current;
    setAlertsLoading(true);
    try {
      const next = await getFlightAlerts(accessToken);
      if (requestId === alertRequest.current) setAlerts(next);
    } catch (error) {
      if (requestId === alertRequest.current) {
        setAlerts([]);
        onNotice(error instanceof Error ? error.message : "Alarmlar alınamadı.");
      }
    } finally {
      if (requestId === alertRequest.current) setAlertsLoading(false);
    }
  }, [accessToken, onNotice]);

  useEffect(() => {
    refreshLocal();
    const update = () => refreshLocal();
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, [refreshLocal]);
  useEffect(() => {
    let active = true;
    if (!user || !accessToken) {
      setCloudItems([]);
      setCloudLoading(false);
      return () => { active = false; };
    }
    setCloudLoading(true);
    void listUserTrips(user.id, accessToken)
      .then((items) => { if (active) setCloudItems(items); })
      .catch((error) => { if (active) onNotice(getSupabaseDataErrorMessage(error, "Hesaptaki kayıtlar alınamadı.")); })
      .finally(() => { if (active) setCloudLoading(false); });
    return () => { active = false; };
  }, [accessToken, onNotice, user]);
  useEffect(() => {
    alertRequest.current += 1;
    setAlerts([]);
    setBusyAlert("");
    setAlertsLoading(false);
    if (tab === "alerts" && accessToken) void loadAlerts();
  }, [accessToken, loadAlerts, ownerId, tab]);

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
    if (!accessToken) return;
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

  const reopenSearch = async (search: SavedFlightSearch) => {
    try {
      const result = await getFlightSearchUrl(search);
      await openExternal(result.url);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Uçuş araması açılamadı.");
    }
  };

  const removeCloudItem = async (item: UserTripData) => {
    if (!user || !accessToken || busyCloud) return;
    setBusyCloud(String(item.id));
    try {
      await deleteUserTrip(user.id, item.id, accessToken);
      setCloudItems((current) => current.filter((candidate) => candidate.id !== item.id));
      if (item.clientKey) {
        if (item.mobileKind === "route_plan") setRoutes(deleteRoutePlan(item.clientKey, ownerId));
        if (item.mobileKind === "flight_search") setSearches(deleteFlightSearch(item.clientKey, ownerId));
      }
      onNotice("Kayıt hesabından silindi.");
    } catch (error) {
      onNotice(getSupabaseDataErrorMessage(error, "Kayıt silinemedi."));
    } finally {
      setBusyCloud("");
    }
  };

  const removeSavedRoute = async (saved: SavedRoutePlan) => {
    const remote = cloudItems.find((item) => item.mobileKind === "route_plan" && item.clientKey === saved.id);
    if (remote && user && accessToken) {
      setBusyCloud(String(remote.id));
      try {
        await deleteUserTrip(user.id, remote.id, accessToken);
        setCloudItems((current) => current.filter((item) => item.id !== remote.id));
      } catch (error) {
        setBusyCloud("");
        return onNotice(getSupabaseDataErrorMessage(error, "Rota hesap kaydından silinemedi."));
      }
      setBusyCloud("");
    }
    setRoutes(deleteRoutePlan(saved.id, ownerId));
    onNotice("Rota silindi.");
  };

  const removeSavedSearch = async (saved: SavedFlightSearch) => {
    const remote = cloudItems.find((item) => item.mobileKind === "flight_search" && item.clientKey === saved.id);
    if (remote && user && accessToken) {
      setBusyCloud(String(remote.id));
      try {
        await deleteUserTrip(user.id, remote.id, accessToken);
        setCloudItems((current) => current.filter((item) => item.id !== remote.id));
      } catch (error) {
        setBusyCloud("");
        return onNotice(getSupabaseDataErrorMessage(error, "Arama hesap kaydından silinemedi."));
      }
      setBusyCloud("");
    }
    setSearches(deleteFlightSearch(saved.id, ownerId));
    onNotice("Arama silindi.");
  };

  const confirmDelete = () => {
    const pending = pendingDelete;
    if (!pending) return;
    setPendingDelete(null);
    if (pending.kind === "alert") void cancelAlert(pending.item);
    if (pending.kind === "cloud") void removeCloudItem(pending.item);
    if (pending.kind === "route") void removeSavedRoute(pending.item);
    if (pending.kind === "search") void removeSavedSearch(pending.item);
  };

  const cloudRoutes = cloudItems.filter((item) => item.mobileKind === "route_plan" && !routes.some((route) => route.id === item.clientKey));
  const cloudSearches = cloudItems.filter((item) => item.mobileKind === "flight_search" && !searches.some((search) => search.id === item.clientKey));

  return (
    <div className="screen">
      <section className="page-intro compact-intro">
        <span className="page-icon"><Icon name="plans" size={27} /></span>
        <div><small>SEYAHAT MERKEZİ</small><h1>Seyahatlerim</h1><p>Rotaların, aramaların, favorilerin ve fiyat alarmların tek yerde.</p></div>
      </section>

      <div className="trips-overview">
        <div><span><Icon name="route" size={18} /></span><strong>{routes.length + cloudRoutes.length}</strong><small>Kayıtlı rota</small></div>
        <div><span><Icon name="heart" size={18} /></span><strong>{favoriteCount}</strong><small>Favori</small></div>
        <div><span><Icon name="flag" size={18} /></span><strong>{visitedCount}</strong><small>Ziyaret</small></div>
      </div>

      <button className="trips-cockpit" onClick={() => onNavigate("cockpit")}><span><Icon name="suitcase" size={23} /></span><div><small>AKILLI SEYAHAT KOKPİTİ</small><strong>Yaklaşan seyahatini yönet</strong><p>Tarihlerini ve hazırlık listesini hesabınla eşitle.</p></div><Icon name="chevron" size={16} /></button>

      <div className="segmented plans-tabs" role="tablist" aria-label="Seyahat kayıtları">
        <button role="tab" aria-selected={tab === "routes"} className={tab === "routes" ? "active" : ""} onClick={() => setTab("routes")}>Rotalar <span>{routes.length + cloudRoutes.length}</span></button>
        <button role="tab" aria-selected={tab === "searches"} className={tab === "searches" ? "active" : ""} onClick={() => setTab("searches")}>Aramalar <span>{searches.length + cloudSearches.length}</span></button>
        <button role="tab" aria-selected={tab === "alerts"} className={tab === "alerts" ? "active" : ""} onClick={() => setTab("alerts")}>Alarmlar</button>
      </div>

      {tab === "routes" && <div className="saved-list">
        {routes.map((saved) => <article className="saved-card" key={saved.id}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="route" /></span><div><small>{date(saved.createdAt)} · {saved.input.days}</small><strong>{saved.plan.routes.map((route) => route.name).join(" · ")}</strong></div><button disabled={Boolean(busyCloud)} onClick={() => setPendingDelete({ kind: "route", item: saved })} aria-label="Rotayı sil"><Icon name="trash" size={18} /></button></div>
          <p>{saved.plan.summary}</p>
          <div className="saved-route-chips">{saved.plan.routes.map((route) => <button key={route.name} onClick={() => onFlightSearch(route)}>{route.destinationCode || route.name}<Icon name="plane" size={14} /></button>)}</div>
        </article>)}
        {cloudRoutes.map((saved) => <article className="saved-card cloud-saved-card" key={`cloud-${saved.id}`}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="route" /></span><div><small>{date(saved.createdAt)} · HESAPLA EŞİTLENDİ</small><strong>{saved.title || saved.destination}</strong></div><button disabled={busyCloud === String(saved.id)} onClick={() => setPendingDelete({ kind: "cloud", item: saved })} aria-label="Hesap kaydını sil"><Icon name="trash" size={18} /></button></div>
          <p>{typeof saved.tripData.plan === "object" && saved.tripData.plan && "summary" in saved.tripData.plan ? String((saved.tripData.plan as Record<string, unknown>).summary || "") : saved.destination}</p>
        </article>)}
        {cloudLoading && <div className="skeleton-list"><div /></div>}
        {!routes.length && !cloudRoutes.length && !cloudLoading && <Empty icon="route" title="Henüz kayıtlı rotan yok" text="Rota Asistanı'nda öneri oluşturup Kaydet düğmesine bas." />}
      </div>}

      {tab === "searches" && <div className="saved-list">
        {searches.map((search) => <article className="saved-card search-saved-card" key={search.id}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="plane" /></span><div><small>{date(search.createdAt)} · {search.departureDate}</small><strong>{search.originCode} → {search.destinationCode}</strong></div><button disabled={Boolean(busyCloud)} onClick={() => setPendingDelete({ kind: "search", item: search })} aria-label="Aramayı sil"><Icon name="trash" size={18} /></button></div>
          <div className="saved-details"><span>{search.adults} yolcu</span><span>{search.tripType === "round_trip" ? "Gidiş–dönüş" : "Tek yön"}</span><span>{search.cabinClass === "economy" ? "Ekonomi" : "Business"}</span></div>
          <button className="secondary-wide" onClick={() => void reopenSearch(search)}><Icon name="external" size={17} /> Google Flights'ta yeniden aç</button>
        </article>)}
        {cloudSearches.map((saved) => {
          const search = saved.tripData.search && typeof saved.tripData.search === "object" ? saved.tripData.search as Record<string, unknown> : {};
          return <article className="saved-card search-saved-card cloud-saved-card" key={`cloud-${saved.id}`}>
            <div className="saved-card-head"><span className="saved-icon"><Icon name="plane" /></span><div><small>{date(saved.createdAt)} · HESAPLA EŞİTLENDİ</small><strong>{String(search.originCode || "—")} → {String(search.destinationCode || "—")}</strong></div><button disabled={busyCloud === String(saved.id)} onClick={() => setPendingDelete({ kind: "cloud", item: saved })} aria-label="Hesap kaydını sil"><Icon name="trash" size={18} /></button></div>
            <div className="saved-details"><span>{String(search.departureDate || "Tarih yok")}</span><span>{saved.destination}</span></div>
          </article>;
        })}
        {cloudLoading && <div className="skeleton-list"><div /></div>}
        {!searches.length && !cloudSearches.length && !cloudLoading && <Empty icon="search" title="Henüz kayıtlı araman yok" text="Bilet Ara bölümündeki başarılı aramalar otomatik kaydedilir." />}
      </div>}

      {tab === "alerts" && <div className="saved-list">
        {!user ? <div className="login-required"><span><Icon name="bell" size={28} /></span><h2>Alarmlarını yönetmek için giriş yap</h2><p>Misafir olarak kurulan alarmlar e-postadaki yönetim bağlantısıyla, hesaplı alarmlar uygulama içinden yönetilir.</p><button className="primary-wide" onClick={onOpenAccount}><Icon name="user" size={18} /> Giriş yap / hesap aç</button></div>
          : alertsLoading ? <div className="skeleton-list"><div /><div /></div>
          : alerts.length ? alerts.map((alert) => <article className={`saved-card alert-card ${alert.is_active ? "" : "paused"}`} key={alert.id}>
            <div className="saved-card-head"><span className="saved-icon"><Icon name="bell" /></span><div><small>{alert.is_active ? "AKTİF" : "DURAKLATILDI"} · {alert.departure_date}</small><strong>{alert.origin_code} → {alert.destination_code}</strong></div><button disabled={busyAlert === alert.id} onClick={() => setPendingDelete({ kind: "alert", item: alert })} aria-label="Alarmı kapat"><Icon name="trash" size={18} /></button></div>
            <div className="alert-metrics"><div><span>Hedef</span><strong>{alert.target_price ? `${new Intl.NumberFormat("tr-TR").format(alert.target_price)} TL` : `%${alert.threshold_percent || 5} düşüş`}</strong></div><div><span>En düşük</span><strong>{alert.lowest_price_seen ? `${new Intl.NumberFormat("tr-TR").format(alert.lowest_price_seen)} TL` : "Henüz yok"}</strong></div></div>
            <button className="secondary-wide" disabled={busyAlert === alert.id} onClick={() => void toggleAlert(alert)}>{busyAlert === alert.id ? <span className="button-loader dark" /> : <Icon name={alert.is_active ? "close" : "check"} size={17} />} {alert.is_active ? "Duraklat" : "Yeniden etkinleştir"}</button>
          </article>)
          : <Empty icon="bell" title="Aktif fiyat alarmın yok" text="Bilet Ara bölümünden rota seçip alarm kurabilirsin." />}
      </div>}

      <DeleteConfirmation pending={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
    </div>
  );
}

function DeleteConfirmation({ pending, onCancel, onConfirm }: {
  pending: PendingDelete | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isAccountItem = pending?.kind === "cloud" || pending?.kind === "route" || pending?.kind === "search";
  const title = pending?.kind === "alert" ? "Fiyat alarmını kapat" : "Kaydı sil";
  const message = pending?.kind === "alert"
    ? "Bu alarm durdurulacak ve fiyat takibi sona erecek."
    : isAccountItem
      ? "Bu kayıt cihazından ve giriş yaptıysan LetsGo2Travel hesabından silinecek."
      : "Bu kayıt silinecek.";

  return <Sheet open={Boolean(pending)} title={title} onClose={onCancel}>
    <div className="delete-confirmation">
      <span><Icon name="trash" size={24} /></span>
      <p>{message}</p>
      <div><button className="secondary-wide" data-autofocus onClick={onCancel}>Vazgeç</button><button className="danger-wide" onClick={onConfirm}>Sil</button></div>
    </div>
  </Sheet>;
}

function Empty({ icon, title, text }: { icon: "route" | "search" | "bell"; title: string; text: string }) {
  return <div className="empty-state"><span><Icon name={icon} size={28} /></span><strong>{title}</strong><p>{text}</p></div>;
}
