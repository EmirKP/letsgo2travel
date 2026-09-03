import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { deleteUserTrip, getSupabaseDataErrorMessage, listUserTrips, type UserTripData } from "../lib/supabaseData";
import {
  deleteRoutePlan,
  getFavoriteDestinations,
  getSavedRoutePlans,
  getSavedTravelEvents,
  removeSavedTravelEvent,
} from "../lib/storage";
import type { AuthUser, PlannerInput, RoutePlan, SavedRoutePlan, TravelEvent, ViewId } from "../types";
import { useI18n } from "../lib/i18n";
import { cancelEventReminder } from "../lib/eventReminders";

type PendingDelete =
  | { kind: "cloud"; item: UserTripData }
  | { kind: "route"; item: SavedRoutePlan }
  | { kind: "event"; item: TravelEvent };

type SelectedPlan = {
  title: string;
  createdAt: string;
  input?: PlannerInput;
  plan: RoutePlan;
};

function cloudRoutePlan(item: UserTripData, locale: "tr" | "en"): SelectedPlan | null {
  const candidate = item.tripData?.plan;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  if (!Array.isArray(record.routes) || record.routes.length === 0) return null;
  const routes = record.routes.filter((route) => route && typeof route === "object" && !Array.isArray(route));
  if (routes.length === 0) return null;
  const input = item.tripData?.input;
  return {
    title: item.title || item.destination || (locale === "tr" ? "Kayıtlı rota" : "Saved route"),
    createdAt: item.createdAt,
    input: input && typeof input === "object" && !Array.isArray(input) ? input as PlannerInput : undefined,
    plan: {
      summary: typeof record.summary === "string" ? record.summary : (locale === "tr" ? "Kayıtlı rota önerin." : "Your saved route suggestion."),
      routes: routes as RoutePlan["routes"],
    },
  };
}

function date(value: string, locale = "tr-TR") {
  try {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function TripsScreen({ user, ownerId, accessToken, onNavigate, onNotice }: {
  user: AuthUser | null;
  ownerId?: string | null;
  accessToken: string;
  onNavigate: (view: ViewId) => void;
  onNotice: (message: string) => void;
}) {
  const { copy, dateLocale, locale } = useI18n();
  const [routes, setRoutes] = useState<SavedRoutePlan[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [savedEvents, setSavedEvents] = useState<TravelEvent[]>([]);
  const [cloudItems, setCloudItems] = useState<UserTripData[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [busyCloud, setBusyCloud] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);

  const refreshLocal = useCallback(() => {
    setRoutes(getSavedRoutePlans(ownerId));
    setFavoriteCount(getFavoriteDestinations(ownerId).length);
    setSavedEvents(getSavedTravelEvents(ownerId));
  }, [ownerId]);

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
      .catch((error) => { if (active) onNotice(getSupabaseDataErrorMessage(error, copy("Hesaptaki kayıtlar alınamadı.", "Account items could not be loaded."))); })
      .finally(() => { if (active) setCloudLoading(false); });
    return () => { active = false; };
  }, [accessToken, copy, onNotice, user]);

  const removeCloudItem = async (item: UserTripData) => {
    if (!user || !accessToken || busyCloud) return;
    setBusyCloud(String(item.id));
    try {
      await deleteUserTrip(user.id, item.id, accessToken);
      setCloudItems((current) => current.filter((candidate) => candidate.id !== item.id));
      if (item.clientKey && item.mobileKind === "route_plan") {
        setRoutes(deleteRoutePlan(item.clientKey, ownerId));
      }
      onNotice(copy("Kayıt hesabından silindi.", "The item was removed from your account."));
    } catch (error) {
      onNotice(getSupabaseDataErrorMessage(error, copy("Kayıt silinemedi.", "The item could not be deleted.")));
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
        return onNotice(getSupabaseDataErrorMessage(error, copy("Rota hesap kaydından silinemedi.", "The route could not be removed from your account.")));
      }
      setBusyCloud("");
    }
    setRoutes(deleteRoutePlan(saved.id, ownerId));
    onNotice(copy("Rota silindi.", "Route deleted."));
  };

  const confirmDelete = () => {
    const pending = pendingDelete;
    if (!pending) return;
    setPendingDelete(null);
    if (pending.kind === "cloud") void removeCloudItem(pending.item);
    if (pending.kind === "route") void removeSavedRoute(pending.item);
    if (pending.kind === "event") {
      setSavedEvents(removeSavedTravelEvent(pending.item.id, ownerId));
      void cancelEventReminder(pending.item.id);
      onNotice(copy("Etkinlik planından çıkarıldı.", "Event removed from your plan."));
    }
  };

  const cloudRoutes = cloudItems.filter((item) => item.mobileKind === "route_plan" && !routes.some((route) => route.id === item.clientKey));

  return (
    <div className="screen">
      <section className="page-intro compact-intro">
        <span className="page-icon"><Icon name="plans" size={27} /></span>
        <div><small>{copy("SEYAHAT MERKEZİ", "TRAVEL HUB")}</small><h1>{copy("Seyahatlerim", "My Trips")}</h1><p>{copy("Rotaların, favorilerin ve seyahat planların tek yerde.", "Your routes, favourites and trip plans in one place.")}</p></div>
      </section>

      <div className="trips-overview">
        <div><span><Icon name="route" size={18} /></span><strong>{routes.length + cloudRoutes.length}</strong><small>{copy("Kayıtlı rota", "Saved routes")}</small></div>
        <div><span><Icon name="heart" size={18} /></span><strong>{favoriteCount}</strong><small>{copy("Favori", "Favourites")}</small></div>
        <div><span><Icon name="calendar" size={18} /></span><strong>{savedEvents.length}</strong><small>{copy("Etkinlik", "Events")}</small></div>
      </div>

      <button className="trips-cockpit" onClick={() => onNavigate("cockpit")}><span><Icon name="suitcase" size={23} /></span><div><small>{copy("AKILLI SEYAHAT KOKPİTİ", "SMART TRAVEL COCKPIT")}</small><strong>{copy("Yaklaşan seyahatini yönet", "Manage your next trip")}</strong><p>{copy("Tarihlerini ve hazırlık listesini hesabınla eşitle.", "Sync dates and your checklist with your account.")}</p></div><Icon name="chevron" size={16} /></button>

      <section className="saved-events-section">
        <div className="section-heading"><div><span>{copy("PLANINDAKİ ETKİNLİKLER", "EVENTS IN YOUR PLAN")}</span><h2>{copy("Kaçırmak istemediklerin", "Events you don't want to miss")}</h2></div><button type="button" onClick={() => onNavigate("events")}>{copy("Etkinlik bul", "Find events")}</button></div>
        {savedEvents.length > 0 ? <div className="saved-event-list">{savedEvents.map((event) => <article key={event.id} className={event.status === "cancelled" ? "cancelled" : ""}>
          <button type="button" className="saved-event-open" onClick={() => onNavigate("events")}>
            <span><strong>{new Intl.DateTimeFormat(dateLocale, { day: "2-digit" }).format(new Date(event.startsAt))}</strong><small>{new Intl.DateTimeFormat(dateLocale, { month: "short" }).format(new Date(event.startsAt))}</small></span>
            <div><small>{event.city}{event.venue ? ` · ${event.venue}` : ""}</small><strong>{event.title}</strong><em>{event.status === "cancelled" ? copy("İptal edildi", "Cancelled") : event.status === "postponed" ? copy("Ertelendi", "Postponed") : new Intl.DateTimeFormat(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}</em></div>
          </button>
          <button type="button" className="saved-event-remove" aria-label={copy("Etkinliği planımdan çıkar", "Remove event from my plan")} onClick={() => setPendingDelete({ kind: "event", item: event })}><Icon name="trash" size={17} /></button>
        </article>)}</div> : <button className="saved-events-empty" type="button" onClick={() => onNavigate("events")}><span><Icon name="calendar" size={22} /></span><div><strong>{copy("Henüz etkinlik kaydetmedin", "No saved events yet")}</strong><small>{copy("Tarihine uygun konser, festival ve maçları bul.", "Find concerts, festivals and sport for your dates.")}</small></div><Icon name="chevron" size={16} /></button>}
      </section>

      <div className="saved-list">
        {routes.map((saved) => <article className="saved-card" key={saved.id}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="route" /></span><button className="saved-card-open" onClick={() => setSelectedPlan({ title: saved.plan.routes.map((route) => route.name).join(" · "), createdAt: saved.createdAt, input: saved.input, plan: saved.plan })}><small>{date(saved.createdAt, dateLocale)} · {saved.input.days}</small><strong>{saved.plan.routes.map((route) => route.name).join(" · ")}</strong></button><button disabled={Boolean(busyCloud)} onClick={() => setPendingDelete({ kind: "route", item: saved })} aria-label={copy("Rotayı sil", "Delete route")}><Icon name="trash" size={18} /></button></div>
          <p>{saved.plan.summary}</p>
          <button className="saved-card-detail-action" onClick={() => setSelectedPlan({ title: saved.plan.routes.map((route) => route.name).join(" · "), createdAt: saved.createdAt, input: saved.input, plan: saved.plan })}>{copy("Planı aç", "Open plan")} <Icon name="chevron" size={16} /></button>
        </article>)}
        {cloudRoutes.map((saved) => {
          const cloudPlan = cloudRoutePlan(saved, locale);
          return <article className="saved-card cloud-saved-card" key={`cloud-${saved.id}`}>
          <div className="saved-card-head"><span className="saved-icon"><Icon name="route" /></span><button className="saved-card-open" disabled={!cloudPlan} onClick={() => cloudPlan && setSelectedPlan(cloudPlan)}><small>{date(saved.createdAt, dateLocale)} · {copy("HESAPLA EŞİTLENDİ", "SYNCED TO ACCOUNT")}</small><strong>{saved.title || saved.destination}</strong></button><button disabled={busyCloud === String(saved.id)} onClick={() => setPendingDelete({ kind: "cloud", item: saved })} aria-label={copy("Hesap kaydını sil", "Delete account item")}><Icon name="trash" size={18} /></button></div>
          <p>{typeof saved.tripData.plan === "object" && saved.tripData.plan && "summary" in saved.tripData.plan ? String((saved.tripData.plan as Record<string, unknown>).summary || "") : saved.destination}</p>
          {cloudPlan && <button className="saved-card-detail-action" onClick={() => setSelectedPlan(cloudPlan)}>{copy("Planı aç", "Open plan")} <Icon name="chevron" size={16} /></button>}
        </article>})}
        {cloudLoading && <div className="skeleton-list"><div /></div>}
        {!routes.length && !cloudRoutes.length && !cloudLoading && <Empty icon="route" title={copy("Henüz kayıtlı rotan yok", "No saved routes yet")} text={copy("Tercihlerini seç, sana uygun rotayı birlikte oluşturalım.", "Choose your preferences and we'll create a route that fits you.")} action={copy("İlk rotamı oluştur", "Create my first route")} onAction={() => onNavigate("route")} />}
      </div>

      <DeleteConfirmation pending={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
      <PlanDetail selected={selectedPlan} onClose={() => setSelectedPlan(null)} />
    </div>
  );
}

function DeleteConfirmation({ pending, onCancel, onConfirm }: {
  pending: PendingDelete | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { copy } = useI18n();
  return <Sheet open={Boolean(pending)} title={copy("Kaydı sil", "Delete item")} onClose={onCancel}>
    <div className="delete-confirmation">
      <span><Icon name="trash" size={24} /></span>
      <p>{copy("Bu kayıt cihazından ve giriş yaptıysan LetsGo2Travel hesabından silinecek.", "This item will be deleted from this device and, if signed in, your LetsGo2Travel account.")}</p>
      <div><button className="secondary-wide" data-autofocus onClick={onCancel}>{copy("Vazgeç", "Cancel")}</button><button className="danger-wide" onClick={onConfirm}>{copy("Sil", "Delete")}</button></div>
    </div>
  </Sheet>;
}

function PlanDetail({ selected, onClose }: { selected: SelectedPlan | null; onClose: () => void }) {
  const { copy, dateLocale } = useI18n();
  return <Sheet open={Boolean(selected)} title={copy("Rota planın", "Your route plan")} onClose={onClose} size="large">
    {selected && <div className="saved-plan-detail">
      <header><small>{date(selected.createdAt, dateLocale)}{selected.input?.days ? ` · ${selected.input.days}` : ""}</small><h3>{selected.title}</h3><p>{selected.plan.summary}</p></header>
      {selected.plan.routes.map((route, index) => <article key={`${route.name}-${index}`}>
        <div className="saved-plan-route-head"><span>{index + 1}</span><div><small>{route.country} · {route.visaStatus}</small><strong>{route.name}</strong></div></div>
        <p>{route.why}</p>
        <div className="saved-plan-facts"><span><small>{copy("Bütçe", "Budget")}</small><strong>{route.estimatedBudget}</strong></span><span><small>{copy("Süre", "Duration")}</small><strong>{route.idealDuration}</strong></span></div>
        {Array.isArray(route.dailyPlan) && route.dailyPlan.length > 0 && <div className="saved-plan-days"><strong>{copy("Örnek gezi planı", "Sample itinerary")}</strong>{route.dailyPlan.map((day) => <div key={day}><Icon name="check" size={15} /><span>{day}</span></div>)}</div>}
        {Array.isArray(route.warnings) && route.warnings.length > 0 && <div className="saved-plan-warnings">{route.warnings.map((warning) => <div key={warning}><Icon name="alert" size={15} /><span>{warning}</span></div>)}</div>}
      </article>)}
      <button className="primary-wide" onClick={onClose}><Icon name="check" size={18} /> {copy("Planı gördüm", "Done")}</button>
    </div>}
  </Sheet>;
}

function Empty({ icon, title, text, action, onAction }: { icon: "route"; title: string; text: string; action: string; onAction: () => void }) {
  return <div className="empty-state"><span><Icon name={icon} size={28} /></span><strong>{title}</strong><p>{text}</p><button className="primary-button empty-state-action" onClick={onAction}><Icon name="route" size={17} />{action}</button></div>;
}
